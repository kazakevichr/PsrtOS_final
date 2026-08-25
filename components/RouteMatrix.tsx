"use client";

// Маршруты публикации: строки — типы контента, столбцы — площадки.
// Выключенное не публикуется ни автопланом, ни кнопкой, ни зеркалированием:
// эту же матрицу спрашивают завод и скрипты заливки.
import { useEffect, useState } from "react";

export default function RouteMatrix({ canManage = true }: { canManage?: boolean }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const [profile, setProfile] = useState("all");
  const [note, setNote] = useState("");

  async function load() {
    const r = await fetch("/api/factory/routes");
    if (r.ok) setData(await r.json());
  }
  useEffect(() => {
    load();
  }, []);

  // Расписание типа: время старта производства или «по запросу».
  async function setSchedule(kind: string, mode: string, time?: string) {
    if (!canManage) return;
    setBusy(`sched|${kind}`);
    setNote("");
    const r = await fetch("/api/factory/routes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, schedule: { mode, time } }),
    });
    const j = await r.json();
    if (j.schedule) setData((d: any) => ({ ...d, schedule: j.schedule }));
    else setNote(j.error || "не получилось");
    setBusy("");
  }

  async function toggle(platform: string, kind: string, next: boolean) {
    if (!canManage) return;
    setBusy(`${platform}|${kind}`);
    setNote("");
    const r = await fetch("/api/factory/routes", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform, kind, enabled: next }),
    });
    const j = await r.json();
    if (j.flags) setData((d: any) => ({ ...d, flags: j.flags }));
    else setNote(j.error || "не получилось");
    setBusy("");
  }

  if (!data) return null;
  const { platforms, kinds, na, locked, flags, schedule = {}, schedulable = [] } = data;
  const showPlatforms = profile === "all" ? platforms : platforms.filter((p: any) => p.key === profile);
  const showKinds = profile === "all"
    ? kinds
    : kinds.filter((k: any) => !(na[k.kind] || []).includes(profile));
  const off = (p: string) => flags[`${p}|*`] === false;

  const Switch = ({ on, dim, onClick, label }: any) => (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={!canManage}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        on ? (dim ? "bg-green-300" : "bg-green-500") : "bg-gray-300"
      } ${canManage ? "cursor-pointer" : "cursor-default"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${on ? "left-4" : "left-0.5"}`} />
    </button>
  );

  return (
    <div className="card mb-4 overflow-x-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">🔀 Маршруты публикации</h2>
        <span className="text-xs text-gray-400">применяется сразу</span>
      </div>
      <p className="text-xs text-gray-400 mt-0.5 mb-2">
        Что и куда уходит. Выключенное не публикуется ни автопланом, ни кнопкой в боте.
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {[{ key: "all", label: "Все аккаунты" }, ...platforms].map((p: any) => (
          <button
            key={p.key}
            onClick={() => setProfile(p.key)}
            className={`px-2.5 py-1 rounded-lg text-xs ${profile === p.key ? "bg-brand-600 text-white" : "bg-white border hover:bg-gray-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="text-gray-500 text-left">
            <th className="py-1 pr-4 font-normal">Тип контента</th>
            {showPlatforms.map((p: any) => (
              <th key={p.key} className="py-1 px-2 font-normal text-center">
                {p.label}
                {off(p.key) && <span className="block text-[11px] text-yellow-700">на паузе</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showKinds.map((k: any) => (
            <tr key={k.kind} className="border-t">
              <td className="py-2 pr-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>{k.label}</span>
                  {schedulable.includes(k.kind) ? (
                    busy === `sched|${k.kind}` ? (
                      <span className="text-xs text-gray-400">…</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <select
                          disabled={!canManage}
                          value={schedule[k.kind]?.mode || "demand"}
                          onChange={(e) =>
                            setSchedule(k.kind, e.target.value,
                              e.target.value === "time" ? schedule[k.kind]?.time || "08:00" : undefined)
                          }
                          className="text-xs border rounded-md px-1 py-0.5 bg-white text-gray-600"
                        >
                          <option value="time">по времени</option>
                          <option value="demand">по запросу</option>
                        </select>
                        {(schedule[k.kind]?.mode || "demand") === "time" && (
                          <input
                            type="time"
                            disabled={!canManage}
                            defaultValue={schedule[k.kind]?.time || "08:00"}
                            onBlur={(e) => e.target.value && e.target.value !== schedule[k.kind]?.time &&
                              setSchedule(k.kind, "time", e.target.value)}
                            className="text-xs border rounded-md px-1 py-0.5 bg-white text-gray-600 w-[74px]"
                            title="Время старта производства, МСК. Завод проверяет расписание раз в час, поэтому минуты округляются к началу часа."
                          />
                        )}
                      </span>
                    )
                  ) : (
                    k.note && <span className="text-gray-400 text-xs">· {k.note}</span>
                  )}
                </div>
              </td>
              {showPlatforms.map((p: any) => {
                const isNa = (na[k.kind] || []).includes(p.key);
                const isLocked = (locked[k.kind] || []).includes(p.key);
                const on = flags[`${p.key}|${k.kind}`];
                return (
                  <td key={p.key} className="py-2 px-2 text-center">
                    {isNa ? (
                      <span className="text-xs text-gray-400">{k.kind === "carousel" ? "не видео" : "—"}</span>
                    ) : isLocked ? (
                      <span className="text-red-600" title="запрещено: авторские права">🔒</span>
                    ) : busy === `${p.key}|${k.kind}` ? (
                      <span className="text-xs text-gray-400">…</span>
                    ) : (
                      <Switch
                        on={on}
                        dim={off(p.key)}
                        label={`${k.label} → ${p.label}`}
                        onClick={() => toggle(p.key, k.kind, !on)}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t mt-3 pt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500 mr-1">Площадка целиком:</span>
        {platforms.map((p: any) => {
          const on = flags[`${p.key}|*`] !== false;
          return (
            <button
              key={p.key}
              disabled={!canManage}
              onClick={() => toggle(p.key, "*", !on)}
              className={`text-xs px-2.5 py-1 rounded-md border ${
                on ? "border-green-200 bg-green-50 text-green-800" : "border-yellow-200 bg-yellow-50 text-yellow-800"
              }`}
            >
              {p.label}: {on ? "включена" : "пауза"}
            </button>
          );
        })}
      </div>
      {note && <p className="text-sm text-red-600 mt-2">{note}</p>}
    </div>
  );
}
