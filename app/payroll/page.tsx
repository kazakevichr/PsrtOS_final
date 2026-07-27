import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePayroll, resolvePeriod, PeriodType } from "@/lib/economics";
import PeriodFilter from "@/components/PeriodFilter";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { period?: string; anchor?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const isOwner = session.user.role === "OWNER";
  const periodType = (isOwner && (searchParams.period as PeriodType)) || "month";
  const period = resolvePeriod(periodType, searchParams.anchor);

  let userIds: string[];
  if (isOwner) {
    const managers = await prisma.user.findMany({ where: { role: "MANAGER", isActive: true } });
    userIds = managers.map((m) => m.id);
  } else {
    userIds = [session.user.id];
  }

  const payrolls = await Promise.all(userIds.map((id) => computePayroll(id, period)));
  const grandTotal = payrolls.reduce((s, p) => s + p.totalAmount, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold">Зарплата</h1>
        <PeriodFilter showTypeTabs={isOwner} />
      </div>
      <p className="text-sm text-gray-500 mb-4">Период: {period.label}</p>

      <div className="space-y-4">
        {payrolls.length === 0 && <p className="text-sm text-gray-400">Нет данных.</p>}
        {payrolls.map((p) => (
          <div key={p.userId} className="card">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">{p.userName}</h3>
              <span className="text-lg font-bold text-brand-700">{p.totalAmount.toLocaleString("ru-RU")} ₽</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-sm">
              <div><span className="text-gray-500">Оклад: </span>{p.fixedAmount.toLocaleString("ru-RU")}</div>
              <div><span className="text-gray-500">KPI: </span>{p.kpiTotal.toLocaleString("ru-RU")}</div>
              <div><span className="text-gray-500">Бонус: </span>{p.bonusTotal.toLocaleString("ru-RU")}</div>
              <div><span className="text-gray-500">Итого: </span><b>{p.totalAmount.toLocaleString("ru-RU")}</b></div>
            </div>
            {Object.keys(p.breakdown).length > 0 && (
              <div className="mt-3 border-t pt-2 text-xs text-gray-500 space-y-1">
                {Object.entries(p.breakdown).map(([project, v]) => (
                  <div key={project} className="flex justify-between">
                    <span>{project}</span>
                    <span>KPI {v.kpi.toLocaleString("ru-RU")} · Бонус {v.bonus.toLocaleString("ru-RU")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isOwner && payrolls.length > 0 && (
          <div className="card flex justify-between font-semibold">
            <span>Итого фонд оплаты за период</span>
            <span>{grandTotal.toLocaleString("ru-RU")} ₽</span>
          </div>
        )}
      </div>
    </div>
  );
}
