// Плановый сбор инста-статистики. У Netlify это делала scheduled function
// (07:00 UTC); в самостоятельном Next-сервере расписание живёт прямо в
// процессе — внешний cron не нужен, перезапуск контейнера ничего не ломает.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  let lastRun = "";

  const tick = async () => {
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() !== 7 || lastRun === day) return;
    lastRun = day;
    try {
      const { runCollect } = await import("./lib/insta");
      const s = await runCollect();
      console.log(`[insta] плановый сбор: аккаунтов ${s.accounts}` +
        (s.errors.length ? `, ошибки: ${s.errors.join("; ")}` : ""));
    } catch (e) {
      console.error("[insta] плановый сбор упал:", e);
    }
    try {
      // Через HTTP к самому себе, не импортом: lib/oracle читает файлы токенов
      // (node:fs), а instrumentation собирается и для edge — там fs нет.
      const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/oracle/collect`, {
        method: "POST",
        headers: { "x-factory-key": process.env.IG_HOST_KEY || "" },
      });
      const s = await r.json();
      console.log(`[oracle] плановый сбор: каналов ${s.channels}` +
        (s.errors?.length ? `, ошибки: ${s.errors.join("; ")}` : ""));
    } catch (e) {
      console.error("[oracle] плановый сбор упал:", e);
    }
  };

  setInterval(tick, 15 * 60 * 1000);
}
