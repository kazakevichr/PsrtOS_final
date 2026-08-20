"use client";

// Кнопка «привязать Телеграм»: владелец получает одноразовую ссылку и
// отправляет её сотруднику. По ней бот свяжет чат с профилем.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TgLinkButton({ userId, tgUsername, linked }: { userId: string; tgUsername?: string | null; linked: boolean }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function make() {
    setBusy(true);
    const r = await fetch("/api/tg/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const j = await r.json();
    setLink(j.link || null);
    setBusy(false);
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    await fetch(`/api/tg/link?userId=${userId}`, { method: "DELETE" });
    setLink(null);
    setBusy(false);
    router.refresh();
  }

  if (link) {
    return (
      <div className="text-xs">
        <a href={link} target="_blank" className="text-brand-700 break-all hover:underline">{link}</a>
        <div className="text-gray-400">отправьте сотруднику — ссылка одноразовая</div>
      </div>
    );
  }
  if (linked) {
    return (
      <div className="text-xs flex items-center gap-2">
        <span className="text-green-700">✅ {tgUsername ? `@${tgUsername}` : "привязан"}</span>
        <button className="text-gray-400 hover:text-red-600" disabled={busy} onClick={unlink}>отвязать</button>
      </div>
    );
  }
  return (
    <button className="text-xs border rounded-md px-2 py-1 hover:bg-gray-50" disabled={busy} onClick={make}>
      {busy ? "…" : "🔗 Привязать Телеграм"}
    </button>
  );
}
