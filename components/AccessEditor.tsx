"use client";

// Направления сотрудника. Живёт в карточке «Сотрудники» рядом с ролью,
// потому что вопросы «кем работает» и «на чём работает» задаются вместе.
import { useState } from "react";
import { useRouter } from "next/navigation";

const LEVELS: [string, string][] = [
  ["view", "смотрит"],
  ["work", "работает"],
  ["manage", "настраивает"],
];

export default function AccessEditor({
  userId,
  projects,
  access,
}: {
  userId: string;
  projects: { id: string; name: string }[];
  access: { projectId: string; level: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const save = async (projectId: string, level: string, remove = false) => {
    setBusy(true);
    try {
      await fetch("/api/users/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, projectId, level, remove }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {projects.map((p) => {
        const row = access.find((a) => a.projectId === p.id);
        return (
          <span
            key={p.id}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              row ? "border-brand-600 bg-brand-50" : "border-gray-200 text-gray-400"
            }`}
          >
            {p.name}
            <select
              className="bg-transparent text-xs outline-none"
              disabled={busy}
              value={row?.level ?? ""}
              onChange={(e) =>
                e.target.value ? save(p.id, e.target.value) : save(p.id, "view", true)
              }
              aria-label={`Доступ к направлению ${p.name}`}
            >
              <option value="">нет</option>
              {LEVELS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </span>
        );
      })}
      {projects.length === 0 && <span className="text-xs text-gray-400">нет активных направлений</span>}
    </div>
  );
}
