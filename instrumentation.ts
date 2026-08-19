// Плановый сбор соцсетей. Кнопки «Собрать сейчас» больше нет — сервер сам
// обновляет данные: Инстаграм каждые 20 минут, Оракл (YouTube+TikTok) раз в
// час, чтобы не упереться в квоты YouTube API и rate-limit upload-post.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  let lastOracle = 0;

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

  setInterval(tick, 20 * 60 * 1000);
  setTimeout(tick, 60 * 1000); // первый сбор через минуту после старта
}
