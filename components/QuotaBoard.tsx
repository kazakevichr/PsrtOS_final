"use client";

// Норма контента в статистике завода: краткая витрина — неделя двумя
// строками (видео основного, карусели Лео) и заработок месяца. Полная
// версия с деньгами по дням — в «Кабинете СММ».
import { useEffect, useState } from "react";
import Link from "next/link";

const WD: Record<string, string> = {
  Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вс",
};
const CELL: Record<string, string> = {
  ok: "bg-green-50 text-green-800",
  partial: "bg-yellow-50 text-yellow-800",
  none: "bg-red-50 text-red-800",
  off: "bg-gray-50 text-gray-400",
};

export default function QuotaBoard() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch("/api/factory/quota?days=63").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data?.days?.length || !data?.rules) return null;
  const { rules, days, earnings } = data;

  const end = days.length - page * 7;
  const week = days.slice(Math.max(0, end - 7), end);
  const older = end - 7 > 0;
  const label = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  return (
    <div className="card overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">🎯 Норма контента</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {rules.map((r: any) => `${r.label} — ${r.perDay}/день`).join(" · ")} · пн–сб · до 22:30 по Красноярску
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {earnings && (
            <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-800 border border-green-200">
              заработано {Math.round(earnings.base + earnings.extrasEarned).toLocaleString("ru-RU")} ₽
            </span>
          )}
          <button className="btn text-xs" disabled={!older} onClick={() => setPage(page + 1)}>←</button>
          <span className="text-gray-500 whitespace-nowrap">
            {week.length ? `${label(week[0].date)} — ${label(week[week.length - 1].date)}` : ""}
          </span>
          <button className="btn text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>→</button>
          {page > 0 && <button className="btn text-xs" onClick={() => setPage(0)}>сегодня</button>}
          <Link href="/cabinet" className="text-brand-700 hover:underline whitespace-nowrap">
            Кабинет СММ →
          </Link>
        </div>
      </div>

      <table className="w-full text-xs min-w-[560px] mt-3">
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
              <td className="py-1 pr-2 text-gray-500">
                {r.metric === "videos" ? "🎬" : "🎠"} {r.label.split(" ·")[0]}
              </td>
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
  );
}
