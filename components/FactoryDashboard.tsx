"use client";

// Контент-завод: план тем (месячная сетка, редактируется на месте, генерация
// тем LLM) и статистика производства из журнала событий завода.
import { useEffect, useMemo, useState } from "react";

const fmt = (n: any) => (n == null ? "—" : Number(n).toLocaleString("ru-RU"));

const EVENT_BADGE: Record<string, string> = {
  "опубликован": "bg-green-100 text-green-800",
  "готов": "bg-blue-100 text-blue-800",
  "создан": "bg-gray-100 text-gray-600",
  "не принят": "bg-yellow-100 text-yellow-800",
  "брак": "bg-red-100 text-red-800",
  "ошибка": "bg-red-100 text-red-800",
};

function monthShift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function FactoryDashboard() {
  const [tab, setTab] = useState<"plan" | "stats">("plan");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [plan, setPlan] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function loadPlan(m: string) {
    const r = await fetch(`/api/factory/plan-admin?month=${m}`);
    setPlan(await r.json());
  }
  async function loadJobs() {
    const r = await fetch("/api/factory/jobs?days=60");
    const j = await r.json();
    setJobs(j.jobs || []);
  }
  useEffect(() => {
    loadPlan(month);
  }, [month]);
  useEffect(() => {
    loadJobs();
  }, []);

  const cell = (date: string, slot: string) =>
    (plan?.plan || []).find((r: any) => r.date === date && r.slot === slot);

  async function saveCell(date: string, slot: string, topic: string) {
    const prev = cell(date, slot)?.topic || "";
    if (topic.trim() === prev.trim()) return;
    await fetch("/api/factory/plan-admin", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, slot, topic, facts: cell(date, slot)?.facts || "" }),
    });
    await loadPlan(month);
  }

  // Брак постфактум: пост уже вышел, Роман удалил его в Instagram руками и
  // помечает здесь — комментарий уедет заводу и подмешается в следующие выпуски.
  async function markDefect(jobId: string) {
    const comment = window.prompt("Что не так с этим выпуском? Комментарий уйдёт заводу:");
    if (comment == null) return;
    await fetch("/api/factory/defect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job_id: jobId, comment }),
    });
    await loadJobs();
  }

  async function generate() {
    setBusy(true);
    setNote("Генерирую темы на месяц…");
    try {
      const r = await fetch("/api/factory/plan-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const j = await r.json();
      setNote(j.error ? `Не вышло: ${j.error}` : `Сгенерировано тем: ${j.generated}${j.note ? ` (${j.note})` : ""}`);
      await loadPlan(month);
    } finally {
      setBusy(false);
    }
  }

  // Статистика производства: сколько сделано и опубликовано, где брак,
  // сколько стоило — по типам контента.
  const stats = useMemo(() => {
    const byKind: Record<string, any> = {};
    for (const j of jobs) {
      const k = j.kind || j.slot || "прочее";
      const s = (byKind[k] ||= { kind: k, total: 0, published: 0, rejected: 0, failed: 0, cost: 0 });
      s.total++;
      if (j.event === "опубликован") s.published++;
      if (j.event === "не принят" || j.event === "брак") s.rejected++;
      if (j.event === "ошибка") s.failed++;
      s.cost += j.cost || 0;
      if (j.seconds) { s.secSum = (s.secSum || 0) + j.seconds; s.secN = (s.secN || 0) + 1; }
    }
    return Object.values(byKind);
  }, [jobs]);
  const totalCost = jobs.reduce((s, j) => s + (j.cost || 0), 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold mb-1">Контент-завод</h1>
          <p className="text-sm text-gray-500">План тем и статистика производства СуперФита</p>
        </div>
        <div className="flex gap-2">
          <button className={`px-3 py-1.5 rounded-lg text-sm ${tab === "plan" ? "bg-brand-600 text-white" : "bg-white border hover:bg-gray-50"}`} onClick={() => setTab("plan")}>
            Контент-план
          </button>
          <button className={`px-3 py-1.5 rounded-lg text-sm ${tab === "stats" ? "bg-brand-600 text-white" : "bg-white border hover:bg-gray-50"}`} onClick={() => setTab("stats")}>
            Статистика
          </button>
        </div>
      </div>
      {note && <p className="text-sm text-gray-500">{note}</p>}

      {tab === "plan" && plan && (
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => setMonth(monthShift(month, -1))}>←</button>
              <span className="font-semibold">
                {new Date(month + "-01").toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}
              </span>
              <button className="btn" onClick={() => setMonth(monthShift(month, 1))}>→</button>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={busy}>
              {busy ? "Генерирую…" : "✨ Сгенерировать темы на месяц"}
            </button>
          </div>
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="p-2 w-20">Дата</th>
                {(plan.slots || []).map((s: any) => (
                  <th key={s.slot} className="p-2">
                    {s.label} <span className="font-normal">{s.active ? `· ${s.time}` : "· ❄️"}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(plan.dates || []).map((date: string) => (
                <tr key={date} className={`border-t ${date === today ? "bg-blue-50/50" : ""} ${date < today ? "opacity-60" : ""}`}>
                  <td className="p-2 whitespace-nowrap text-gray-500">
                    {new Date(date + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", weekday: "short" })}
                  </td>
                  {(plan.slots || []).map((s: any) => (
                    <td key={s.slot} className="p-1 align-top">
                      <textarea
                        rows={2}
                        defaultValue={cell(date, s.slot)?.topic || ""}
                        placeholder={s.active ? "тема…" : "заморожен"}
                        title={cell(date, s.slot)?.facts || ""}
                        onBlur={(e) => saveCell(date, s.slot, e.target.value)}
                        className={`w-full text-xs border rounded-md p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 ${
                          s.active ? "bg-white" : "bg-gray-50"
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "stats" && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card"><div className="text-sm text-gray-500">Заказов за 60 дней</div><div className="text-2xl font-bold mt-1">{fmt(jobs.length)}</div></div>
            <div className="card"><div className="text-sm text-gray-500">Опубликовано</div><div className="text-2xl font-bold mt-1">{fmt(jobs.filter((j) => j.event === "опубликован").length)}</div></div>
            <div className="card"><div className="text-sm text-gray-500">Брак (не принят + ошибка)</div><div className="text-2xl font-bold mt-1">{fmt(jobs.filter((j) => ["не принят", "брак", "ошибка"].includes(j.event)).length)}</div></div>
            <div className="card"><div className="text-sm text-gray-500">Смета за 60 дней</div><div className="text-2xl font-bold mt-1">{totalCost ? `$${totalCost.toFixed(2)}` : "—"}</div>
              {!totalCost && <div className="text-xs text-gray-400 mt-1">завод пока не сообщает стоимость</div>}</div>
          </div>

          {stats.length > 0 && (
            <div className="card overflow-x-auto">
              <h2 className="font-semibold mb-3">По типам контента</h2>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-gray-500">
                  <th className="py-1 pr-4">Тип</th><th className="py-1 pr-4">Всего</th>
                  <th className="py-1 pr-4">Опубликовано</th><th className="py-1 pr-4">Не принято</th>
                  <th className="py-1 pr-4">Ошибки</th><th className="py-1 pr-4">Ср. время</th><th className="py-1">Стоимость</th>
                </tr></thead>
                <tbody>
                  {stats.map((s: any) => (
                    <tr key={s.kind} className="border-t">
                      <td className="py-1.5 pr-4 font-medium">{s.kind}</td>
                      <td className="py-1.5 pr-4">{s.total}</td>
                      <td className="py-1.5 pr-4 text-green-700">{s.published}</td>
                      <td className="py-1.5 pr-4 text-yellow-700">{s.rejected}</td>
                      <td className="py-1.5 pr-4 text-red-700">{s.failed}</td>
                      <td className="py-1.5 pr-4">{s.secN ? `${Math.round(s.secSum / s.secN / 60)} мин` : "—"}</td>
                      <td className="py-1.5">{s.cost ? `$${s.cost.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-3">Журнал производства</h2>
            {!jobs.length && <p className="text-sm text-gray-500">Пока пусто — завод ещё не докладывал о заказах.</p>}
            <div className="space-y-2">
              {jobs.map((j) => (
                <details key={j.jobId} className="border rounded-lg p-2">
                  <summary className="flex flex-wrap items-center gap-2 cursor-pointer text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${EVENT_BADGE[j.event] || "bg-gray-100 text-gray-600"}`}>{j.event || "?"}</span>
                    <span className="text-gray-400 text-xs">{new Date(j.at).toLocaleString("ru-RU")}</span>
                    <span className="text-gray-500 text-xs">
                      {j.kind || j.slot}{j.character ? ` · ${j.character}` : ""}{j.onDemand ? " · по запросу" : ""}
                      {j.seconds ? ` · ⏱ ${Math.round(j.seconds / 60)} мин` : ""}{j.cost ? ` · $${j.cost.toFixed(2)}` : ""}
                    </span>
                    <span className="font-medium truncate max-w-md">{j.topic || "(без темы)"}</span>
                    {(j.links || []).map((l: any, i: number) => (
                      <a key={i} href={l.link} target="_blank" className="text-brand-700 text-xs hover:underline" onClick={(e) => e.stopPropagation()}>
                        {l.account} ↗
                      </a>
                    ))}
                  </summary>
                  {j.script && <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{j.script}</p>}
                  {j.error && <p className="text-xs text-red-600 mt-1">{j.error}</p>}
                  {["опубликован", "готов"].includes(j.event) && (
                    <button
                      className="mt-2 text-xs border border-red-300 text-red-700 rounded-md px-2 py-1 hover:bg-red-50"
                      onClick={(e) => { e.preventDefault(); markDefect(j.jobId); }}
                    >
                      🗑 Брак
                    </button>
                  )}
                </details>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
