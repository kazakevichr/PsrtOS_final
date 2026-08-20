"use client";

// Телеграм-бот: состояние подключения и очередь заявок на доступ.
// Одобрить может только владелец — эта панель показывается только ему.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function TgAdmin() {
  const router = useRouter();
  const [state, setState] = useState<any>(null);
  const [signups, setSignups] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load() {
    const [s, q] = await Promise.all([
      fetch("/api/tg/setup").then((r) => r.json()).catch(() => null),
      fetch("/api/tg/signups").then((r) => r.json()).catch(() => null),
    ]);
    setState(s);
    setSignups(q?.signups || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/tg/setup", { method: "POST" });
    const j = await r.json();
    setNote(j.error ? `Не получилось: ${j.error}` : j.secured ? "Бот подключён (с секретом)." : "Бот подключён. Секрет вебхука не задан — стоит добавить TELEGRAM_WEBHOOK_SECRET_DOBRO.");
    setBusy(false);
    load();
  }

  async function decide(id: string, action: "approve" | "reject", role?: string) {
    setBusy(true);
    setNote("");
    const r = await fetch("/api/tg/signups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action, role }),
    });
    const j = await r.json();
    setNote(j.error ? `Не получилось: ${j.error}` : action === "reject" ? "Заявка отклонена." : "Сотрудник добавлен — логин и пароль ушли ему в бота.");
    setBusy(false);
    await load();
    router.refresh();
  }

  const hooked = state?.configured && state?.webhook && state.webhook === state.expected;

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">🤖 Телеграм-бот{state?.bot ? ` @${state.bot}` : ""}</h2>
          <p className="text-xs text-gray-400">
            {!state
              ? "Проверяю…"
              : !state.configured
                ? "Токен бота не задан в окружении (TELEGRAM_BOT_TOKEN_DOBRO)"
                : hooked
                  ? "Подключён — заявки и пуши работают"
                  : "Токен есть, но вебхук не подключён к этому сайту"}
            {state?.lastError ? ` · последняя ошибка: ${state.lastError}` : ""}
          </p>
        </div>
        {state?.configured && (
          <button className="btn btn-primary" onClick={connect} disabled={busy}>
            {hooked ? "Переподключить" : "Подключить бота"}
          </button>
        )}
      </div>
      {note && <p className="text-sm text-gray-600 mt-2">{note}</p>}

      {signups.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold">Заявки на доступ ({signups.length})</h3>
          {signups.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-2 text-sm">
              <span className="font-medium">{s.name || "без имени"}</span>
              {s.username && <span className="text-gray-500">@{s.username}</span>}
              <span className="text-gray-400 text-xs">{new Date(s.createdAt).toLocaleString("ru-RU")}</span>
              <div className="flex gap-2 ml-auto">
                <button className="btn text-xs border" disabled={busy} onClick={() => decide(s.id, "approve", "MANAGER")}>
                  ✅ Менеджер партнёров
                </button>
                <button className="btn text-xs border" disabled={busy} onClick={() => decide(s.id, "approve", "SMM")}>
                  ✅ СММ
                </button>
                <button className="btn text-xs border border-red-300 text-red-700" disabled={busy} onClick={() => decide(s.id, "reject")}>
                  ⛔ Отклонить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
