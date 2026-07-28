"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PartnerActions({
  partnerId,
  projectId,
  currency,
  isLost,
  isOwner,
}: {
  partnerId: string;
  projectId: string;
  currency: string;
  isLost: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [date, setDate] = useState(todayStr());
  const [period, setPeriod] = useState("day");
  const [revenueAmount, setRevenueAmount] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [retryDate, setRetryDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, revenueAmount, note, period }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось сохранить выручку");
        return;
      }
      setRevenueAmount("");
      setNote("");
      setDate(todayStr());
      setPeriod("day");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    await fetch(`/api/partners/${partnerId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: comment }),
    });
    setComment("");
    router.refresh();
  }

  async function markLost(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/partners/${partnerId}/lost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lostReason, retryReminderDate: retryDate || undefined }),
    });
    router.refresh();
  }

  async function removePartner() {
    const ok = window.confirm(
      "Удалить этого партнёра навсегда? Вся его выручка, история и комментарии будут удалены без возможности восстановления."
    );
    if (!ok) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setDeleteError(data?.error || "Не удалось удалить партнёра");
        return;
      }
      router.push(`/projects/${projectId}`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {isOwner ? (
        <div className="card">
          <h3 className="font-semibold mb-2">Указать выручку</h3>
          <form onSubmit={addTransaction} className="flex flex-col gap-2">
            <label className="text-xs text-gray-500">Период</label>
            <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="day">За день</option>
              <option value="week">За неделю</option>
              <option value="month">За месяц</option>
            </select>
            <label className="text-xs text-gray-500">Дата</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <input
              className="input"
              placeholder={`Выручка, ${currency}`}
              type="number"
              step="0.01"
              value={revenueAmount}
              onChange={(e) => setRevenueAmount(e.target.value)}
              required
            />
            <input className="input" placeholder="Комментарий (необязательно)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn btn-primary" disabled={busy} type="submit">Добавить</button>
          </form>
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-gray-500">Выручку по партнёру указывает только руководитель.</p>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold mb-2">Комментарий</h3>
        <form onSubmit={addComment} className="flex flex-col gap-2">
          <textarea className="input" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn btn-secondary" type="submit">Сохранить</button>
        </form>
      </div>

      {!isLost && (
        <div className="card">
          <h3 className="font-semibold mb-2">Отметить как упущенного</h3>
          <form onSubmit={markLost} className="flex flex-col gap-2">
            <input className="input" placeholder="Причина отказа" value={lostReason} onChange={(e) => setLostReason(e.target.value)} required />
            <label className="text-xs text-gray-500">Напомнить попробовать снова:</label>
            <input className="input" type="date" value={retryDate} onChange={(e) => setRetryDate(e.target.value)} />
            <button className="btn btn-secondary" type="submit">Сохранить</button>
          </form>
        </div>
      )}

      {isOwner && (
        <div className="card border border-red-100">
          <h3 className="font-semibold mb-1 text-red-700">Удалить партнёра</h3>
          <p className="text-xs text-gray-500 mb-2">
            Безвозвратно удаляет партнёра вместе со всей выручкой, историей стадий и комментариями. Например, для тестовых записей.
          </p>
          {deleteError && <p className="text-sm text-red-600 mb-2">{deleteError}</p>}
          <button className="btn btn-secondary !text-red-700" disabled={deleting} onClick={removePartner}>
            {deleting ? "Удаление…" : "Удалить навсегда"}
          </button>
        </div>
      )}
    </div>
  );
}
