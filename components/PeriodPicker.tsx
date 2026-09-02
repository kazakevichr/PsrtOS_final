"use client";

// Выбор периода: список готовых вариантов плюс две даты с календарём.
// Один компонент на «Бухгалтерию» и «Соц.Сети» — периоды в них должны
// выбираться одинаково, иначе цифры из двух разделов неудобно сверять.
//
// Правка любой из дат сама переводит список в «Другое»: это честнее, чем
// оставить надпись «Последние 7 дней» над руками выставленным диапазоном.

export type Range = { preset: string; from: string; to: string };

export const PRESETS: [string, string][] = [
  ["month", "Текущий месяц"],
  ["7", "Последние 7 дней"],
  ["30", "Последние 30 дней"],
  ["90", "Последние 90 дней"],
  ["365", "Последние 365 дней"],
  ["all", "Всё время"],
  ["custom", "Другое"],
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const today = () => iso(new Date());

/** Диапазон для готового варианта. Обе границы включительно. */
export function rangeFor(preset: string, current?: Range): Range {
  const now = new Date();
  const to = iso(now);

  if (preset === "month") {
    return { preset, from: `${to.slice(0, 7)}-01`, to };
  }
  if (preset === "all") {
    return { preset, from: "2020-01-01", to };
  }
  if (preset === "custom") {
    return { preset, from: current?.from || to, to: current?.to || to };
  }
  const n = Number(preset) || 7;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (n - 1));
  return { preset, from: iso(start), to };
}

/** Сколько дней в диапазоне — для подписей «за N дн» и сравнения с прошлым. */
export function rangeDays(r: Range) {
  const ms = Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 864e5) + 1);
}

export default function PeriodPicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (r: Range) => void;
}) {
  const setDate = (key: "from" | "to", v: string) => {
    if (!v) return;
    const next = { ...value, [key]: v, preset: "custom" };
    // Перевёрнутый диапазон — почти всегда опечатка; разворачиваем молча.
    if (next.from > next.to) {
      onChange({ ...next, from: next.to, to: next.from });
      return;
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input w-44"
        value={value.preset}
        onChange={(e) => onChange(rangeFor(e.target.value, value))}
        aria-label="Период"
      >
        {PRESETS.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="input w-36"
        type="date"
        value={value.from}
        max={value.to}
        onChange={(e) => setDate("from", e.target.value)}
        aria-label="Начало периода"
      />
      <span className="text-gray-400">—</span>
      <input
        className="input w-36"
        type="date"
        value={value.to}
        min={value.from}
        onChange={(e) => setDate("to", e.target.value)}
        aria-label="Конец периода"
      />
    </div>
  );
}
