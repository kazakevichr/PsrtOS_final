"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const SALES_STAGE = "Есть продажи";
const WORKING_STAGE = "Работает";

type Partner = {
  id: string;
  name: string;
  stage: string;
  status: string;
  health: "GREEN" | "YELLOW" | "RED";
  responsible: { id: string; name: string };
  partnerType?: { name: string } | null;
  adCreativeUrl?: string | null;
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
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [partnerTypeId, setPartnerTypeId] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState(currentUserId);
  const [busy, setBusy] = useState(false);

  async function addPartner(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name,
        instagram,
        telegram,
        phone,
        partnerTypeId: partnerTypeId || undefined,
        responsibleUserId: isOwner ? responsibleUserId : undefined,
      }),
    });
    if (res.ok && comment.trim()) {
      const created = await res.json();
      await fetch(`/api/partners/${created.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: comment }),
      });
    }
    setBusy(false);
    setShowForm(false);
    setName("");
    setInstagram("");
    setTelegram("");
    setPhone("");
    setComment("");
    router.refresh();
  }

  async function moveStage(partner: Partner, toStage: string) {
    let adCreativeUrl: string | undefined;

    // Владелец переносит партнёров по канбану без подтверждения и без
    // обязательной ссылки на артефакт — ограничение действует только для менеджеров.
    if (toStage === WORKING_STAGE && !partner.adCreativeUrl && !isOwner) {
      const url = window.prompt(
        "Перед переводом в «Работает» нужна ссылка/скриншот, что партнёр выложил рекламу (например, ссылка на пост или файл в облаке):"
      );
      if (!url || !url.trim()) return;
      adCreativeUrl = url.trim();
    }

    const res = await fetch(`/api/partners/${partner.id}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage, adCreativeUrl }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      window.alert(data.error || "Не удалось перевести партнёра на эту стадию.");
      return;
    }
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
          <input className="input" placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
          <textarea
            className="input sm:col-span-2"
            placeholder="Комментарий (необязательно)"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
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
                {stagePartners.map((p) => {
                  const nextStage = stages[stageIdx + 1];
                  const nextIsSalesLocked = nextStage === SALES_STAGE && !isOwner;
                  return (
                    <div key={p.id} className="card">
                      <div className="flex justify-between items-start">
                        <Link href={`/partners/${p.id}`} className="font-medium text-brand-700 hover:underline">
                          {p.name}
                        </Link>
                        <span className={badgeClass[p.health]}>{badgeLabel[p.health]}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{p.responsible.name}</div>
                      {p.partnerType && <div className="text-xs text-gray-400">{p.partnerType.name}</div>}
                      {p.adCreativeUrl ? (
                        <a
                          href={p.adCreativeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-700 hover:underline inline-flex items-center gap-1 mt-1"
                          title="Открыть ссылку на артефакт"
                        >
                          🔗 Артефакт есть
                        </a>
                      ) : (
                        <div className="text-xs text-gray-400 mt-1">🔗 Артефакта нет</div>
                      )}
                      <div className="flex gap-1 mt-2 items-center">
                        {stageIdx > 0 && (
                          <button
                            className="btn btn-secondary !px-2 !py-1 text-xs"
                            onClick={() => moveStage(p, stages[stageIdx - 1])}
                          >
                            ← Назад
                          </button>
                        )}
                        {stageIdx < stages.length - 1 && (
                          nextIsSalesLocked ? (
                            <span className="text-xs text-gray-400" title="Перевод в «Есть продажи» доступен только владельцу">
                              🔒 Далее (только владелец)
                            </span>
                          ) : (
                            <button
                              className="btn btn-primary !px-2 !py-1 text-xs"
                              onClick={() => moveStage(p, nextStage)}
                            >
                              Далее →
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
