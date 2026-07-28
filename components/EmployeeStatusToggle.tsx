"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EmployeeStatusToggle({
  userId,
  isActive,
}: {
  userId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (isActive) {
      const ok = window.confirm("Уволить этого сотрудника? Он потеряет доступ к системе.");
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось изменить статус");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = window.confirm(
      "Удалить этого сотрудника навсегда? Это также безвозвратно удалит всех закреплённых за ним партнёров и их выручку. Отменить нельзя."
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось удалить сотрудника");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        className={isActive ? "text-red-600 hover:underline" : "text-brand-700 hover:underline"}
        disabled={busy}
        onClick={toggle}
      >
        {isActive ? "Уволить" : "Восстановить"}
      </button>
      <button className="text-gray-400 hover:text-red-700 hover:underline text-xs" disabled={busy} onClick={remove}>
        Удалить навсегда
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
