"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PayoutToggle({
  partnerId,
  txId,
  paid,
  canEdit,
}: {
  partnerId: string;
  txId: string;
  paid: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!canEdit) {
    return (
      <span className={paid ? "badge-green" : "badge-yellow"}>
        {paid ? "Выплачено" : "Должны"}
      </span>
    );
  }

  async function toggle() {
    setBusy(true);
    await fetch(`/api/partners/${partnerId}/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerPayoutPaid: !paid }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button
      disabled={busy}
      onClick={toggle}
      className={paid ? "badge-green" : "badge-yellow"}
      title="Нажмите, чтобы переключить статус выплаты"
    >
      {paid ? "Выплачено ✓" : "Должны — отметить выплату"}
    </button>
  );
}
