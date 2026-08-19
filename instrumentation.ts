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
      const { runOracleCollect } = await import("./lib/oracle");
      const s = await runOracleCollect();
      console.log(`[oracle] плановый сбор: каналов ${s.channels}` +
        (s.errors.length ? `, ошибки: ${s.errors.join("; ")}` : ""));
    } catch (e) {
      console.error("[oracle] плановый сбор упал:", e);
    }
  };

  setInterval(tick, 15 * 60 * 1000);
}
