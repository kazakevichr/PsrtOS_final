"use client";

// Контент-план СММ: сетка месяца, правится на месте (СММ и владелец),
// ✨ — генерация тем в пустые ячейки. Воскресенье — выходной.
import { useEffect, useState } from "react";

function monthShift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SmmPlan() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [plan, setPlan] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function load(m: string) {
    const r = await fetch(`/api/cabinet/plan?month=${m}`);
    if (r.ok) setPlan(await r.json());
  }
  useEffect(() => {
    load(month);
  }, [month]);

  const cell = (date: string, slot: string) =>
    (plan?.plan || []).find((r: any) => r.date === date && r.slot === slot);

  async function saveCell(date: string, slot: string, topic: string) {
    const prev = cell(date, slot)?.topic || "";
    if (topic.trim() === prev.trim()) return;
    await fetch("/api/cabinet/plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, slot, topic, facts: cell(date, slot)?.facts || "" }),
    });
    await load(month);
  }

  async function generate() {
    setBusy(true);
    setNote("Генерирую темы…");
    try {
      const r = await fetch("/api/cabinet/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const j = await r.json();
      setNote(j.error ? `Не вышло: ${j.error}` : `Сгенерировано тем: ${j.generated}${j.note ? ` (${j.note})` : ""}`);
      await load(month);
    } finally {
      setBusy(false);
    }
  }

  if (!plan) return null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">📋 Контент-план СММ</h2>
          <button className="btn text-xs" onClick={() => setMonth(monthShift(month, -1))}>←</button>
          <span className="text-sm font-medium">
            {new Date(month + "-01T00:00:00").toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
          </span>
          <button className="btn text-xs" onClick={() => setMonth(monthShift(month, 1))}>→</button>
        </div>
        <button className="btn btn-primary text-sm" onClick={generate} disabled={busy}>
          {busy ? "Генерирую…" : "✨ Сгенерировать темы"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Темы вносятся вручную прямо в ячейки — сохраняется само. Воскресенье — выходной.
      </p>
      {note && <p className="text-sm text-gray-500 mb-2">{note}</p>}

      <table className="w-full text-sm border-collapse min-w-[760px]">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="p-2 w-20">Дата</th>
            {(plan.slots || []).map((s: any) => (
              <th key={s.slot} className="p-2">{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(plan.dates || []).map((date: string) => {
            const isSunday = new Date(date + "T00:00:00Z").getUTCDay() === 0;
            return (
              <tr key={date} className={`border-t ${date === today ? "bg-blue-50/50" : ""} ${date < today ? "opacity-60" : ""}`}>
                <td className="p-2 whitespace-nowrap text-gray-500">
                  {new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", weekday: "short" })}
                </td>
                {(plan.slots || []).map((s: any) => (
                  <td key={s.slot} className="p-1 align-top">
                    {isSunday ? (
                      <div className="text-xs text-gray-300 text-center py-3">выходной</div>
                    ) : (
                      <textarea
                        rows={2}
                        defaultValue={cell(date, s.slot)?.topic || ""}
                        placeholder="тема…"
                        title={cell(date, s.slot)?.facts || ""}
                        onBlur={(e) => saveCell(date, s.slot, e.target.value)}
                        className="w-full text-xs border rounded-md p-1.5 resize-none bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
