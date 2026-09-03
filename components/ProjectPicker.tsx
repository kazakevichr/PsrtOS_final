"use client";

// Переключатель направления в панели — контекст всего приложения.
// Выбор живёт в куке, потому что страницы рисует сервер: он должен знать
// направление до рендера, а не после первого запроса из браузера.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COOKIE = "postos_project";
const ALL = "all";

const COLORS = ["#2952e3", "#7c5cd6", "#0f9b8e", "#d97706", "#0891b2", "#be185d"];
const colorOf = (id: string) => {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % 997;
  return COLORS[n % COLORS.length];
};

export default function ProjectPicker({
  projects,
  projectId,
  canSeeAll,
}: {
  projects: { id: string; name: string }[];
  projectId: string | null;
  canSeeAll: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (value: string) => {
    document.cookie = `${COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setOpen(false);
    router.refresh();
  };

  const current = projectId ? projects.find((p) => p.id === projectId) : null;
  const label = current ? current.name : "Все направления";
  const color = current ? colorOf(current.id) : "#2952e3";
  // Один проект и нечего сводить — показываем название без выпадашки:
  // список из одного пункта только притворяется выбором.
  const single = projects.length <= 1 && !canSeeAll;

  return (
    <div className="px-2 pb-1 relative" ref={box}>
      <button
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border bg-white text-left text-sm ${
          single ? "border-gray-200 cursor-default" : "border-brand-600 hover:bg-gray-50"
        }`}
        onClick={() => !single && setOpen(!open)}
        aria-haspopup={single ? undefined : "listbox"}
        aria-expanded={single ? undefined : open}
        disabled={single}
      >
        <span
          className="w-5.5 h-5.5 shrink-0 rounded-md grid place-items-center text-white text-[11px] font-bold"
          style={{ background: color, width: 22, height: 22 }}
        >
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="flex-1 font-semibold truncate">{label}</span>
        {!single && <span className="text-gray-400 text-[10px]">▼</span>}
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-[calc(100%-2px)] z-20 bg-white border rounded-xl shadow-lg p-1.5">
          <div className="px-2 pt-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
            Направления
          </div>
          {canSeeAll && (
            <Row
              on={projectId === null}
              color="#2952e3"
              letter="В"
              name="Все направления"
              sub="сводно по группе"
              onClick={() => pick(ALL)}
            />
          )}
          {projects.map((p) => (
            <Row
              key={p.id}
              on={projectId === p.id}
              color={colorOf(p.id)}
              letter={p.name.charAt(0).toUpperCase()}
              name={p.name}
              onClick={() => pick(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  on, color, letter, name, sub, onClick,
}: {
  on: boolean; color: string; letter: string; name: string; sub?: string; onClick: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm ${
        on ? "bg-brand-50" : "hover:bg-gray-50"
      }`}
      onClick={onClick}
    >
      <span
        className="shrink-0 rounded-md grid place-items-center text-white text-[11px] font-bold"
        style={{ background: color, width: 22, height: 22 }}
      >
        {letter}
      </span>
      <span className="min-w-0">
        <b className="block truncate font-semibold">{name}</b>
        {sub && <span className="block text-[11px] text-gray-400 font-normal">{sub}</span>}
      </span>
    </button>
  );
}
