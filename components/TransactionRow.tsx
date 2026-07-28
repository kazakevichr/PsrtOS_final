"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PayoutToggle from "@/components/PayoutToggle";

const PERIOD_LABELS: Record<string, string> = {
  day: "за день",
  week: "за неделю",
  month: "за месяц",
};

function toDateInputValue(d: string | Date) {
  return new Date(d).toISOString().slice(0, 10);
}

export default function TransactionRow({
  partnerId,
  currency,
  isOwner,
  transaction,
}: {
  partnerId: string;
  currency: string;
  isOwner: boolean;
  transaction: {
    id: string;
    date: string | Date;
    period: string;
    revenueAmount: number;
    ownerProfitAmount: number;
    partnerPayoutAmount: number;
    partnerPayoutPaid: boolean;
    note: string | null;
  };
}) {
  const router = useRouter();
  const t = transaction;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInputValue(t.date));
  const [period, setPeriod] = useState(t.period || "day");
  const [revenueAmount, setRevenueAmount] = useState(String(t.revenueAmount));
  const [note, setNote] = useState(t.note || "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${partnerId}/transactions/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, period, revenueAmount, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Не удалось сохранить изменения");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <form onSubmit={save} className="flex flex-col gap-2 border-b last:border-0 py-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="day">За день</option>
            <option value="week">За неделю</option>
            <option value="month">За месяц</option>
          </select>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            className="input"
            type="number"
            step="0.01"
            value={revenueAmount}
            onChange={(e) => setRevenueAmount(e.target.value)}
            required
          />
          <input className="input" placeholder="Комментарий" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy} type="submit">Сохранить</button>
          <button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>Отмена</button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex justify-between items-center text-sm border-b last:border-0 py-1.5 gap-2">
      <span>
        {new Date(t.date).toLocaleDateString("ru-RU")} ({PERIOD_LABELS[t.period] || t.period})
        {t.note ? ` · ${t.note}` : ""}
      </span>
      <span className="flex items-center gap-2 text-right">
        Выручка {t.revenueAmount.toLocaleString("ru-RU")} → прибыль <b>{t.ownerProfitAmount.toLocaleString("ru-RU")}</b> {currency}
        {t.partnerPayoutAmount > 0 && (
          <>
            <span className="text-gray-400">· партнёру {t.partnerPayoutAmount.toLocaleString("ru-RU")}</span>
            <PayoutToggle partnerId={partnerId} txId={t.id} paid={t.partnerPayoutPaid} canEdit={isOwner} />
          </>
        )}
        {isOwner && (
          <button className="text-brand-700 hover:underline" onClick={() => setEditing(true)}>
            Изменить
          </button>
        )}
      </span>
    </div>
  );
}
