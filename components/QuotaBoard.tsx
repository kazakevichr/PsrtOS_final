"use client";

// Норма контента СММ: сетка дней с прогрессом по каруселям и видео.
// Данные считаются сами — по ручным постам super.fit24 из сборщика.
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

  useEffect(() => {
    fetch("/api/factory/quota?days=14").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data?.days?.length) return null;
  const { quota, days, summary } = data;
  const week = days.slice(-7);

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
        <div className="flex gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-green-50 text-green-800 border border-green-200">
            выполнено {summary.ok} из {summary.workdays} дн
          </span>
          {summary.streak > 1 && (
            <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-800 border border-orange-200">
              🔥 серия: {summary.streak}
            </span>
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
