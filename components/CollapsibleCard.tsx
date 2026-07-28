"use client";
import { useState } from "react";

// Раскрывающаяся карточка (аккордеон) — используется, чтобы длинный контент
// (например, информация по проекту или чат с ИИ-помощником) не занимал место
// на странице, пока пользователь сам не откроет блок.
export default function CollapsibleCard({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between font-semibold text-left"
      >
        <span>{title}</span>
        <span className={`text-gray-400 transition-transform text-xs ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
