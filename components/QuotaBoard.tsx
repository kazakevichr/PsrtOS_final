"use client";

// Норма контента СММ: сетка дней с прогрессом по каруселям и видео.
// Данные считаются сами — по ручным постам super.fit24 из сборщика.
// Стрелками листается история неделями, «сегодня» — возврат к текущей.
import { useEffect, useState } from "react";

const WD: Record<string, string> = {
  Mon: "пн", Tue: "вт", Wed: "ср", Thu: "чт", Fri: "пт", Sat: "сб", Sun: "вс",
};
const COLORS: Record<string, string> = {
  ok: "bg-green-50 text-green-800 border-green-200",
  partial: "bg-yellow-50 text-yellow-800 border-yellow-200",
  none: "bg-red-50 text-red-800 border-red-200",
  off: "bg-gray-50 text-gray-400 border-gray-200",
};

export default function QuotaBoard() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(0); // 0 — текущая неделя, 1 — прошлая…

  useEffect(() => {
    // Берём хвост побольше один раз, листаем на клиенте без перезагрузок.
    fetch("/api/factory/quota?days=63").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data?.days?.length) return null;
  const { quota, days, summary } = data;

  const end = days.length - page * 7;
  const week = days.slice(Math.max(0, end - 7), end);
  const older = end - 7 > 0;
  const label = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" });

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">🎯 Норма контента</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {quota.carousels} карусели и {quota.videos} видео в день · super.fit24 · пн–сб ·
            день закрывается в 22:30 по Красноярску · заводской контент не считается
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-800 border border-green-200">
            за 2 недели: {summary.ok} из {summary.workdays} дн
          </span>
          {summary.streak > 1 && (
            <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 border border-orange-200">
              🔥 серия: {summary.streak}
            </span>
          )}
          <button className="btn text-xs" disabled={!older} onClick={() => setPage(page + 1)}>←</button>
          <span className="text-gray-500 whitespace-nowrap">
            {week.length ? `${label(week[0].date)} — ${label(week[week.length - 1].date)}` : ""}
          </span>
          <button className="btn text-xs" disabled={page === 0} onClick={() => setPage(page - 1)}>→</button>
          {page > 0 && (
            <button className="btn text-xs" onClick={() => setPage(0)}>сегодня</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 mt-3">
        {week.map((d: any) => (
          <div
            key={d.date}
            className={`rounded-lg border p-2 text-center ${COLORS[d.status]} ${d.isToday ? "ring-2 ring-brand-500" : ""}`}
          >
            <div className="text-[11px] opacity-70">
              {WD[d.weekday] || d.weekday} {Number(d.date.slice(8))}
              {d.isToday ? " · сегодня" : ""}
            </div>
            {d.isWorkday ? (
              <div className="text-sm mt-1 whitespace-nowrap">
                🎠 {d.carousels}/{quota.carousels}
                <span className="opacity-50"> · </span>
                🎬 {d.videos}/{quota.videos}
              </div>
            ) : (
              <div className="text-sm mt-1">выходной</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
