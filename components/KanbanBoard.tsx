"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Partner = {
  id: string;
  name: string;
  stage: string;
  status: string;
  health: "GREEN" | "YELLOW" | "RED";
  responsible: { id: string; name: string };
  partnerType?: { name: string } | null;
};

export default function KanbanBoard({
  projectId,
  stages,
  partners,
  managers,
  partnerTypes,
  isOwner,
  currentUserId,
}: {
  projectId: string;
  stages: string[];
  partners: Partner[];
  managers: { id: string; name: string }[];
  partnerTypes: { id: string; name: string }[];
  isOwner: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [telegram, setTelegram] = useState("");
  const [partnerTypeId, setPartnerTypeId] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);

  async function addPartner(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name,
        instagram,
        telegram,
        partnerTypeId: partnerTypeId || undefined,
        responsibleUserId: isOwner ? responsibleUserId : undefined,
      }),
    });
    setBusy(false);
    setShowForm(false);
    setName("");
    setInstagram("");
    setTelegram("");
    router.refresh();
  }

  async function moveStage(partnerId: string, toStage: string) {
    await fetch(`/api/partners/${partnerId}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage }),
    });
    router.refresh();
  }

  const badgeClass = { GREEN: "badge-green", YELLOW: "badge-yellow", RED: "badge-red" } as const;
  const badgeLabel = { GREEN: "🟢", YELLOW: "🟡", RED: "🔴" } as const;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-sm text-gray-500">Всего партнёров: {partners.length}</div>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          + Добавить партнёра
        </button>
      </div>

      {showForm && (
        <form onSubmit={addPartner} className="card mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input" placeholder="Имя партнёра" value={name} onChange={(e) => setName(e.target.value)} required />
          <input className="input" placeholder="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
          <input className="input" placeholder="Telegram" value={telegram} onChange={(e) => setTelegram(e.target.value)} />
          {partnerTypes.length > 0 && (
            <select className="input" value={partnerTypeId} onChange={(e) => setPartnerTypeId(e.target.value)}>
              <option value="">Тип партнёра...</option>
              {partnerTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {isOwner && (
            <select className="input" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn btn-primary" disabled={busy} type="submit">Сохранить</button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stagePartners = partners.filter((p) => p.stage === stage);
          const stageIdx = stages.indexOf(stage);
          return (
            <div key={stage} className="min-w-[260px] flex-1">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                {stage} ({stagePartners.length})
              </div>
              <div className="space-y-2">
                {stagePartners.map((p) => (
                  <div key={p.id} className="card">
                    <div className="flex justify-between items-start">
                      <Link href={`/partners/${p.id}`} className="font-medium text-brand-700 hover:underline">
                        {p.name}
                      </Link>
                      <span className={badgeClass[p.health]}>{badgeLabel[p.health]}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{p.responsible.name}</div>
                    {p.partnerType && <div className="text-xs text-gray-400">{p.partnerType.name}</div>}
                    <div className="flex gap-1 mt-2">
                      {stageIdx > 0 && (
                        <button
                          className="btn btn-secondary !px-2 !py-1 text-xs"
                          onClick={() => moveStage(p.id, stages[stageIdx - 1])}
                        >
                          ← Назад
                        </button>
                      )}
                      {stageIdx < stages.length - 1 && (
                        <button
                          className="btn btn-primary !px-2 !py-1 text-xs"
                          onClick={() => moveStage(p.id, stages[stageIdx + 1])}
                        >
                          Далее →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
