"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProjectsNavDropdown({ projects }: { projects: { id: string; name: string }[] }) {
  const pathname = usePathname();
  const isOnProjectPage = pathname?.startsWith("/projects/");
  const [open, setOpen] = useState(Boolean(isOnProjectPage));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-brand-700 ${isOnProjectPage ? "text-brand-700 font-medium" : ""}`}
      >
        <span>Проекты</span>
        <span className={`transition-transform text-xs ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-gray-100 pl-2">
          {projects.length === 0 && <span className="px-3 py-1 text-xs text-gray-400">Проектов пока нет</span>}
          {projects.map((p) => {
            const active = pathname === `/projects/${p.id}` || pathname?.startsWith(`/projects/${p.id}/`);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={`px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 hover:text-brand-700 ${active ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600"}`}
              >
                {p.name}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
