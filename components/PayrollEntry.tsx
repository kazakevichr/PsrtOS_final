"use client";

// Начисление за месяц вводится руками (решение Романа 01.09): состав команды
// меняется чаще, чем формула, и последнее слово за владельцем. Посчитанная
// цифра остаётся рядом подсказкой — её можно принять одним нажатием.
// Дата выплаты важна отдельно: именно по ней начисление уходит в расходы
// месяца в разделе «Бухгалтерия».
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PayrollEntry({
  userId,
  month,
  computed,
  record,
}: {
  userId: string;
  month: string;
  computed: number;
  record: { id: string; totalAmount: number; paidAt: string | null } | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(record ? String(Math.round(record.totalAmount)) : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const saved = record ? Math.round(record.totalAmount) : null;
  const dirty = value !== "" && Number(value) !== saved;

  const post = async (url: string, body: any, method = "POST") => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error || "Не сохранилось");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const save = (total: number) => post("/api/payroll", { userId, month, total });
  const markPaid = (paidAt: string | null) =>
    record && post("/api/payroll", { id: record.id, paidAt }, "PATCH");

  return (
    <div className="mt-3 border-t pt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-500">К начислению:</span>
      <input
        className="input w-28"
        value={value}
        placeholder="₽"
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        aria-label="Сумма к начислению"
      />
      <button className="btn btn-primary" disabled={busy || !dirty} onClick={() => save(Number(value))}>
        Сохранить
      </button>

      {computed > 0 && Number(value) !== Math.round(computed) && (
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            setValue(String(Math.round(computed)));
            save(Math.round(computed));
          }}
          title="Подставить посчитанную цифру"
        >
          посчитано: {Math.round(computed).toLocaleString("ru-RU")} ₽
        </button>
      )}

      {record && (
        record.paidAt ? (
          <span className="flex items-center gap-2">
            <span className="badge-green">
              выплачено {new Date(record.paidAt).toLocaleDateString("ru-RU")}
            </span>
            <button className="text-xs text-gray-400 hover:text-red-600" disabled={busy} onClick={() => markPaid(null)}>
              отменить
            </button>
          </span>
        ) : (
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => markPaid(new Date().toISOString().slice(0, 10))}
          >
            Отметить выплату
          </button>
        )
      )}

      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
