"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const TYPE_LABELS: Record<string, string> = { day: "День", week: "Неделя", month: "Месяц" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function thisMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default function PeriodFilter({ showTypeTabs = true }: { showTypeTabs?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const type = searchParams.get("period") || "month";
  const anchor = searchParams.get("anchor") || (type === "month" ? thisMonthStr() : todayStr());

  function update(nextType: string, nextAnchor?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", nextType);
    params.set("anchor", nextAnchor ?? (nextType === "month" ? thisMonthStr() : todayStr()));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTypeTabs && (
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(["day", "week", "month"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => update(t)}
              className={`px-3 py-1.5 ${type === t ? "bg-brand-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      {type === "month" ? (
        <input
          className="input"
          type="month"
          value={anchor}
          onChange={(e) => update(type, e.target.value)}
        />
      ) : (
        <input
          className="input"
          type="date"
          value={anchor}
          onChange={(e) => update(type, e.target.value)}
        />
      )}
    </div>
  );
}
