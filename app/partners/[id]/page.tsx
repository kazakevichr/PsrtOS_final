import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/economics";
import PartnerActions from "@/components/PartnerActions";
import PayoutToggle from "@/components/PayoutToggle";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ru-RU");
}

export default async function PartnerPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: {
      project: true,
      partnerType: true,
      responsible: true,
      transactions: { orderBy: { date: "desc" } },
      stageHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: true } },
      comments: { orderBy: { createdAt: "desc" }, include: { user: true } },
    },
  });
  if (!partner) notFound();
  if (session.user.role === "MANAGER" && partner.responsibleUserId !== session.user.id) {
    redirect("/");
  }

  const health = computeHealth(partner, partner.project);
  const totalRevenue = partner.transactions.reduce((s, t) => s + t.revenueAmount, 0);
  const totalProfit = partner.transactions.reduce((s, t) => s + t.ownerProfitAmount, 0);
  const totalOwed = partner.transactions
    .filter((t) => !t.partnerPayoutPaid)
    .reduce((s, t) => s + t.partnerPayoutAmount, 0);
  const isOwner = session.user.role === "OWNER";
  const badgeClass = { GREEN: "badge-green", YELLOW: "badge-yellow", RED: "badge-red" }[health];
  const badgeLabel = { GREEN: "🟢 Активен", YELLOW: "🟡 Нужно написать", RED: "🔴 Умирает" }[health];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div className="card">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold">{partner.name}</h1>
              <p className="text-sm text-gray-500">{partner.project.name} {partner.partnerType ? `· ${partner.partnerType.name}` : ""}</p>
            </div>
            <span className={badgeClass}>{badgeLabel}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm">
            <div><span className="text-gray-500">Instagram: </span>{partner.instagram || "—"}</div>
            <div><span className="text-gray-500">Telegram: </span>{partner.telegram || "—"}</div>
            <div><span className="text-gray-500">Телефон: </span>{partner.phone || "—"}</div>
            <div><span className="text-gray-500">Ответственный: </span>{partner.responsible.name}</div>
            <div><span className="text-gray-500">Статус: </span>{partner.stage}</div>
            <div><span className="text-gray-500">Первый контакт: </span>{fmtDate(partner.firstContactDate)}</div>
            <div><span className="text-gray-500">Подключён: </span>{fmtDate(partner.connectedDate)}</div>
            <div><span className="text-gray-500">Первая продажа: </span>{fmtDate(partner.firstSaleDate)}</div>
            <div><span className="text-gray-500">Последняя продажа: </span>{fmtDate(partner.lastSaleDate)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 text-sm border-t pt-3">
            <div><span className="text-gray-500">Клиентов (транзакций): </span><b>{partner.transactions.length}</b></div>
            <div><span className="text-gray-500">Выручка всего: </span><b>{totalRevenue.toLocaleString("ru-RU")} {partner.project.currency}</b></div>
            <div className="col-span-2"><span className="text-gray-500">Прибыль владельца всего: </span><b>{totalProfit.toLocaleString("ru-RU")} {partner.project.currency}</b></div>
            {totalOwed > 0 && (
              <div className="col-span-2 text-amber-700"><span className="text-gray-500">Должны партнёру: </span><b>{totalOwed.toLocaleString("ru-RU")} {partner.project.currency}</b></div>
            )}
          </div>
          {partner.status === "LOST" && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 rounded-lg p-2">
              Упущен {fmtDate(partner.lostAt)}. Причина: {partner.lostReason}.
              {partner.retryReminderDate && <> Напомнить: {fmtDate(partner.retryReminderDate)}.</>}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2">Транзакции</h3>
          {partner.transactions.length === 0 && <p className="text-sm text-gray-400">Пока нет транзакций.</p>}
          <div className="space-y-1">
            {partner.transactions.map((t) => (
              <div key={t.id} className="flex justify-between items-center text-sm border-b last:border-0 py-1.5 gap-2">
                <span>{fmtDate(t.date)} {t.note ? `· ${t.note}` : ""}</span>
                <span className="flex items-center gap-2 text-right">
                  Выручка {t.revenueAmount.toLocaleString("ru-RU")} → прибыль <b>{t.ownerProfitAmount.toLocaleString("ru-RU")}</b> {partner.project.currency}
                  {t.partnerPayoutAmount > 0 && (
                    <>
                      <span className="text-gray-400">· партнёру {t.partnerPayoutAmount.toLocaleString("ru-RU")}</span>
                      <PayoutToggle partnerId={partner.id} txId={t.id} paid={t.partnerPayoutPaid} canEdit={isOwner} />
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2">История стадий</h3>
          <div className="space-y-1 text-sm">
            {partner.stageHistory.map((h) => (
              <div key={h.id} className="flex justify-between border-b last:border-0 py-1">
                <span>{fmtDate(h.changedAt)} · {h.changedBy.name}</span>
                <span>{h.fromStage ?? "—"} → <b>{h.toStage}</b></span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-2">Комментарии</h3>
          {partner.comments.length === 0 && <p className="text-sm text-gray-400">Пока нет комментариев.</p>}
          <div className="space-y-2">
            {partner.comments.map((c) => (
              <div key={c.id} className="text-sm border-b last:border-0 pb-2">
                <div className="text-gray-400 text-xs">{fmtDate(c.createdAt)} · {c.user.name}</div>
                <div>{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        <PartnerActions partnerId={partner.id} currency={partner.project.currency} isLost={partner.status === "LOST"} />
      </div>
    </div>
  );
}
