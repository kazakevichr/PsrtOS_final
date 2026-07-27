import { prisma } from "@/lib/prisma";
import type { Project, Partner } from "@prisma/client";

/**
 * Прибыль владельца с одной транзакции (продажи) партнёра.
 * ownerProfit = revenue * (1 - partnerCommission%) * ownerProfit%
 */
export function calcOwnerProfit(revenueAmount: number, project: Project): number {
  const afterPartnerCommission =
    revenueAmount * (1 - project.partnerCommissionPercent / 100);
  return afterPartnerCommission * (project.ownerProfitPercent / 100);
}

export type Health = "GREEN" | "YELLOW" | "RED";

/**
 * Индекс здоровья партнёра на основе даты последней продажи
 * (или даты подключения, если продаж ещё не было).
 */
export function computeHealth(partner: Partner, project: Project): Health {
  if (partner.status === "LOST") return "RED";
  const reference = partner.lastSaleDate ?? partner.connectedDate ?? partner.createdAt;
  if (!reference) return "YELLOW";
  const daysSince = Math.floor(
    (Date.now() - new Date(reference).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince <= project.healthGreenDays) return "GREEN";
  if (daysSince <= project.healthYellowDays) return "YELLOW";
  return "RED";
}

export function parseFunnelStages(project: Project): string[] {
  try {
    const parsed = JSON.parse(project.funnelStages);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallthrough
  }
  return [
    "Найдено",
    "Первый контакт",
    "Ведём переговоры",
    "Согласился",
    "Настройка",
    "Работает",
    "Есть продажи",
    "Активный партнёр",
    "Неактивный",
  ];
}

function monthRange(month: string) {
  // month = "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Считает зарплату сотрудника за указанный месяц ("YYYY-MM"):
 * фикс + сумма KPI (партнёры, подключённые в этом месяце) + сумма бонусов
 * (% от прибыли активных партнёров этого сотрудника за месяц).
 */
export async function computePayroll(userId: string, month: string) {
  const { start, end } = monthRange(month);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const partners = await prisma.partner.findMany({
    where: { responsibleUserId: userId },
    include: { project: true, partnerType: true, transactions: true },
  });

  let kpiTotal = 0;
  let bonusTotal = 0;
  const breakdown: Record<string, { kpi: number; bonus: number }> = {};

  for (const partner of partners) {
    const projectName = partner.project.name;
    breakdown[projectName] = breakdown[projectName] || { kpi: 0, bonus: 0 };

    // KPI: партнёр подключён (connectedDate) в этом месяце
    if (
      partner.project.kpiEnabled &&
      partner.connectedDate &&
      partner.connectedDate >= start &&
      partner.connectedDate < end
    ) {
      const kpiAmount = partner.partnerType?.kpiAmount ?? partner.project.kpiAmount;
      kpiTotal += kpiAmount;
      breakdown[projectName].kpi += kpiAmount;
    }

    // Бонус: % от прибыли партнёра за этот месяц (если проект это поддерживает)
    if (partner.project.bonusEnabled && partner.connectedDate) {
      const monthlyProfit = partner.transactions
        .filter((t) => t.date >= start && t.date < end)
        .reduce((sum, t) => sum + t.ownerProfitAmount, 0);

      const withinPeriod =
        !partner.project.bonusPeriodMonths ||
        monthsBetween(partner.connectedDate, start) < partner.project.bonusPeriodMonths;

      if (withinPeriod && monthlyProfit >= partner.project.bonusThreshold) {
        let bonus = monthlyProfit * (partner.project.bonusPercent / 100);
        if (partner.project.bonusMaxAmount != null) {
          bonus = Math.min(bonus, partner.project.bonusMaxAmount);
        }
        bonusTotal += bonus;
        breakdown[projectName].bonus += bonus;
      }
    }
  }

  return {
    userId,
    userName: user.name,
    month,
    fixedAmount: user.fixedSalary,
    kpiTotal,
    bonusTotal,
    totalAmount: user.fixedSalary + kpiTotal + bonusTotal,
    breakdown,
  };
}
