// Плановый сбор соцсетей. Кнопки «Собрать сейчас» больше нет — сервер сам
// обновляет данные: Инстаграм каждые 20 минут, Оракл (YouTube+TikTok) раз в
// час, чтобы не упереться в квоты YouTube API и rate-limit upload-post.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  let lastOracle = 0;
  let lastRemindDay = "";

  const tick = async () => {
    try {
      const { runCollect } = await import("./lib/insta");
      const s = await runCollect();
      console.log(`[insta] сбор: аккаунтов ${s.accounts}` +
        (s.errors.length ? `, ошибки: ${s.errors.join("; ")}` : ""));
    } catch (e) {
      console.error("[insta] сбор упал:", e);
    }
    if (Date.now() - lastOracle >= 55 * 60 * 1000) {
      lastOracle = Date.now();
      try {
        // Через HTTP к самому себе, не импортом: lib/oracle читает файлы
        // токенов (node:fs), а instrumentation собирается и для edge.
        const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/oracle/collect`, {
          method: "POST",
          headers: { "x-factory-key": process.env.IG_HOST_KEY || "" },
        });
        const s = await r.json();
        console.log(`[oracle] сбор: каналов ${s.channels}` +
          (s.errors?.length ? `, ошибки: ${s.errors.join("; ")}` : ""));
      } catch (e) {
        console.error("[oracle] сбор упал:", e);
      }
    }
  };

  // Контроль задач: утром в 09:xx МСК напоминаем исполнителям про дедлайны
  // сегодня и просрочку; просроченное дублируем владельцу.
  const remind = async () => {
    const mskHour = Number(new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow", hour: "numeric", hour12: false,
    }).format(new Date()));
    const day = new Date().toISOString().slice(0, 10);
    if (mskHour !== 9 || lastRemindDay === day) return;
    lastRemindDay = day;
    try {
      const { prisma } = await import("./lib/prisma");
      const { sendTo, ownerWithTg } = await import("./lib/telegram");
      const endOfToday = new Date(); endOfToday.setUTCHours(23, 59, 59, 999);
      const tasks = await prisma.task.findMany({
        where: { isDone: false, dueDate: { lte: endOfToday } },
        include: { assignedTo: true },
      });
      const now = new Date();
      const overdue: string[] = [];
      for (const t of tasks) {
        const late = t.dueDate! < now;
        const line = `${late ? "🔴 просрочено" : "🟡 дедлайн сегодня"}: ${t.title}`;
        if (t.assignedTo.tgChatId) await sendTo(t.assignedTo.tgChatId, `⏰ ${line}`);
        if (late) overdue.push(`${t.title} — ${t.assignedTo.name}`);
      }
      const owner = await ownerWithTg();
      if (owner?.tgChatId && overdue.length) {
        await sendTo(owner.tgChatId, `🔴 <b>Просроченные задачи (${overdue.length})</b>
` + overdue.join("
"));
      }
      if (tasks.length) console.log(`[задачи] напоминаний: ${tasks.length}, просрочено: ${overdue.length}`);
    } catch (e) {
      console.error("[задачи] напоминания упали:", e);
    }
  };

  const tickAll = async () => { await tick(); await remind(); };
  setInterval(tickAll, 20 * 60 * 1000);
  setTimeout(tickAll, 60 * 1000); // первый прогон через минуту после старта
}
