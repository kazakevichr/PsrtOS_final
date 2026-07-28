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

/**
 * Стадия воронки, означающая, что партнёр больше не в работе.
 * Партнёр может попасть сюда через Kanban (кнопки/перетаскивание),
 * при этом status в БД остаётся "ACTIVE" — учитывать это нужно
 * везде, где считаются "активные" партнёры (дашборд, сотрудники и т.д.).
 */
export const INACTIVE_STAGE = "Неактивный";

/**
 * Партнёр считается активным для отчётов/счётчиков, если он не помечен
 * упущенным (status !== "LOST") и не находится в стадии "Неактивный".
 */
export function isPartnerActive(partner: { status: string; stage: string }): boolean {
  return partner.status === "ACTIVE" && partner.stage !== INACTIVE_STAGE;
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
    "Согласился",
    "Работает",
    "Есть продажи",
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

export type PeriodType = "day" | "week" | "month";

/**
 * Универсальный резолвер периода для отчётов владельца:
 * day   -> одни сутки anchor-даты
 * week  -> 7 дней, начиная с понедельника недели anchor-даты
 * month -> календарный месяц anchor-даты (как раньше, для зарплаты)
 * anchor передаётся строкой "YYYY-MM-DD" (day/week) или "YYYY-MM" (month).
 */
export function resolvePeriod(type: PeriodType, anchor?: string) {
  if (type === "month") {
    const month = anchor && /^\d{4}-\d{2}$/.test(anchor) ? anchor : new Date().toISOString().slice(0, 7);
    const { start, end } = monthRange(month);
    return { start, end, label: month };
  }

  const anchorDate = anchor && /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? new Date(anchor + "T00:00:00Z") : new Date();

  if (type === "day") {
    const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate()));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end, label: start.toISOString().slice(0, 10) };
  }

  // week: понедельник–воскресенье
  const dow = anchorDate.getUTCDay() || 7; // 1..7, Sunday -> 7
  const start = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate() - (dow - 1)));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end, label: `${start.toISOString().slice(0, 10)} – ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}` };
}

/**
 * Сколько партнёру причитается с одной продажи и сколько ещё не выплачено.
 */
export function calcPartnerPayout(revenueAmount: number, ownerProfitAmount: number): number {
  return Math.max(0, revenueAmount - ownerProfitAmount);
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Считает зарплату сотрудника за указанный месяц ("YYYY-MM"):
 * фикс + сумма KPI (партнёры, подключённые в этом месяце) + сумма бонусов
 * (% от прибыли активных партнёров этого сотрудника за месяц).
 */
export async function computePayroll(
  userId: string,
  period: string | { start: Date; end: Date; label: string }
) {
  const resolved = typeof period === "string" ? { ...monthRange(period), label: period } : period;
  const { start, end, label: month } = resolved;

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

  // Оклад и бонус начисляются только сотрудникам, набравшим от 15 партнёров
  // (любых, за всё время). KPI начисляется всегда, независимо от этого порога.
  const MIN_PARTNERS_FOR_SALARY = 15;
  const partnersCount = partners.length;
  const qualifiesForSalary = partnersCount >= MIN_PARTNERS_FOR_SALARY;

  if (!qualifiesForSalary) {
    bonusTotal = 0;
    for (const key of Object.keys(breakdown)) {
      breakdown[key].bonus = 0;
    }
  }
  // fixedAmount — оклад сотрудника как он настроен (для отображения, всегда).
  // fixedAmountPaid — сколько из оклада реально начисляется в этом периоде
  // (0, если порог по партнёрам ещё не набран). Именно fixedAmountPaid входит в totalAmount.
  const fixedAmountPaid = qualifiesForSalary ? user.fixedSalary : 0;

  return {
    userId,
    userName: user.name,
    month,
    fixedAmount: user.fixedSalary,
    fixedAmountPaid,
    kpiTotal,
    bonusTotal,
    totalAmount: fixedAmountPaid + kpiTotal + bonusTotal,
    breakdown,
    partnersCount,
    qualifiesForSalary,
    minPartnersForSalary: MIN_PARTNERS_FOR_SALARY,
  };
}
