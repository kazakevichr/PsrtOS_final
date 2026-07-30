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

  // Пароли хранятся в БД только как хэш (bcrypt) и нигде не показываются
  // в открытом виде — их нельзя "посмотреть". Вместо этого руководитель
  // может задать сотруднику новый пароль.
  async function resetPassword() {
    const pwd = window.prompt("Новый пароль для сотрудника (минимум 6 символов):");
    if (pwd === null) return;
    if (pwd.trim().length < 6) {
      window.alert("Пароль должен быть не короче 6 символов.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: pwd.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось сменить пароль");
        return;
      }
      window.alert("Пароль изменён. Сообщите его сотруднику лично.");
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
      <button className="text-gray-500 hover:text-brand-700 hover:underline text-xs" disabled={busy} onClick={resetPassword}>
        Сменить пароль
      </button>
      <button className="text-gray-400 hover:text-red-700 hover:underline text-xs" disabled={busy} onClick={remove}>
        Удалить навсегда
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
