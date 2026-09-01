"use client";

// Кабинет СММ по договорённостям от 25.08.2026: два потока нормы
// (super.fit24 видео, Лео карусели), деньги по факту, доп задачи с ценами.
import { useEffect, useState } from "react";
import SmmPlan from "@/components/SmmPlan";

const WD: Record<string, string> = {
  Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вс",
};
const CELL: Record<string, string> = {
  ok: "bg-green-50 text-green-800",
  partial: "bg-yellow-50 text-yellow-800",
  none: "bg-red-50 text-red-800",
  off: "bg-gray-50 text-gray-400",
};
const fmtR = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

// Сдвиг месяца: 0 — текущий, 1 — прошлый и так далее.
const monthKey = (back: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - back);
  return d.toISOString().slice(0, 7);
};

export default function CabinetView() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [back, setBack] = useState(0);

  useEffect(() => {
    setData(null);
    setPage(0);
    const url = back === 0
      ? "/api/factory/quota?days=63"
      : `/api/factory/quota?month=${monthKey(back)}`;
    fetch(url).then((r) => r.json()).then(setData).catch(() => {});
  }, [back]);

  if (!data?.days?.length) return <p className="text-sm text-gray-400">Загружаю…</p>;
  const { rules, days, earnings } = data;
  const today = days.find((d: any) => d.isToday);

  const end = days.length - page * 7;
  const week = days.slice(Math.max(0, end - 7), end);
  const older = end - 7 > 0;
  const label = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const monthName = new Date(earnings.month + "-01T00:00:00")
    .toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Кабинет СММ{earnings.smm ? ` · ${earnings.smm.name}` : ""}</h1>
            <p className="text-sm text-gray-500">
              {monthName} · {earnings.start ? `зачёт с ${new Date(earnings.start + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : "расчёт с 1-го числа"} · пн–сб · день до 22:30 по Красноярску
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-xs mb-1">
              <button className="btn text-xs" onClick={() => setBack(back + 1)}>← месяц</button>
              <button className="btn text-xs" disabled={back === 0} onClick={() => setBack(back - 1)}>месяц →</button>
            </div>
            <div className="text-sm text-gray-500">
              {back === 0 ? "заработано по факту" : "к выплате за месяц"}
            </div>
            <div className="text-2xl font-bold">
              {fmtR(earnings.base + earnings.extrasEarned)}
              <span className="text-sm text-gray-400 font-normal"> из {fmtR(earnings.baseMax)} + доп</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {earnings.rules.map((r: any) => (
            <div key={r.key} className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">{r.label}</div>
              <div className="text-xl font-bold mt-0.5">
                {r.tracked ? fmtR(r.earned) : "—"}
                <span className="text-sm text-gray-400 font-normal"> / {fmtR(r.max)}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {r.tracked ? `закрыто ${r.closed} из ${r.passed} рабочих дней в зачёте` : "аккаунт ещё не подключён"}
              </div>
            </div>
          ))}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">доп задачи</div>
            <div className="text-xl font-bold mt-0.5">+{fmtR(earnings.extrasEarned)}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {earnings.extras.filter((t: any) => t.isDone).length} выполнено ·{" "}
              {earnings.extras.filter((t: any) => !t.isDone).length} в работе
            </div>
          </div>
        </div>
      </div>

      {today && (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              🎯 Сегодня, {WD[today.weekday]} {Number(today.date.slice(8))} · до 22:30 по Красноярску
            </h2>
            {(() => {
              const tracked = rules.filter((r: any) => r.accounts.length > 0);
              const met = tracked.every((r: any) => today.rules[r.key].done >= r.perDay);
              return (
                <span className={`text-xs px-2.5 py-1 rounded-lg ${met ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800"}`}>
                  {met ? "день закрыт" : "день не закрыт"}
                </span>
              );
            })()}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            {rules.map((r: any) => {
              const q = today.rules[r.key];
              return (
                <div key={r.key} className="border rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-sm">{r.label}</span>
                  <span className="font-semibold">
                    {r.accounts.length ? `${q.done} / ${r.perDay}${q.done >= r.perDay ? " ✓" : ""}` : "не подключён"}
                  </span>
                </div>
              );
            })}
          </div>
          {(() => {
            const bad = days.slice(-2).flatMap((d: any) =>
              Object.entries(d.rules).filter(([, q]: any) => q.bad > 0).map(([k]) => ({ d, k })));
            return bad.length ? (
              <p className="text-xs text-red-600 mt-2">
                ⚠️ в super.fit24 вышла карусель — по договорённости карусели в основной аккаунт не идут
              </p>
            ) : null;
          })()}
        </div>
      )}

      <div className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold">📅 Неделя · {week.length ? `${label(week[0].date)} — ${label(week[week.length - 1].date)}` : ""}</h2>
          <div className="flex items-center gap-2 text-xs">
            <button className="btn text-xs" disabled={!older} onClick={() => setPage(page + 1)}>←</button>
            <button className="btn text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>→</button>
            {page > 0 && <button className="btn text-xs" onClick={() => setPage(0)}>сегодня</button>}
          </div>
        </div>
        <table className="w-full text-xs min-w-[560px]">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left font-normal py-1 pr-2 w-28"></th>
              {week.map((d: any) => (
                <th key={d.date} className={`font-normal py-1 ${d.isToday ? "text-brand-700 font-semibold" : ""}`}>
                  {WD[d.weekday]} {Number(d.date.slice(8))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r: any) => (
              <tr key={r.key}>
                <td className="py-1 pr-2 text-gray-500">{r.metric === "videos" ? "🎬" : "🎠"} {r.label.split(" ·")[0]}</td>
                {week.map((d: any) => {
                  const q = d.rules[r.key];
                  return (
                    <td key={d.date} className="p-0.5">
                      <div className={`rounded-md text-center py-1.5 ${CELL[q.status]} ${d.isToday ? "ring-1 ring-brand-500" : ""}`}>
                        {d.isWorkday ? (r.accounts.length ? `${q.done}/${r.perDay}` : "—") : "вых"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {earnings.extras.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-2">💼 Доп задачи · оплата отдельно</h2>
          <div className="space-y-1 text-sm">
            {earnings.extras.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border-b last:border-0 py-1.5">
                <span className={t.isDone ? "text-gray-400 line-through" : ""}>{t.title}</span>
                <span className="whitespace-nowrap text-gray-600">
                  {fmtR(t.price)} · {t.isDone
                    ? <span className="text-green-700">готово</span>
                    : <span className="text-yellow-700">в работе</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <SmmPlan />

    </div>
  );
}
