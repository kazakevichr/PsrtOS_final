import { prisma } from "@/lib/prisma";

// Бухгалтерия: доходы, расходы и метрики эффективности за календарный месяц.
//
// Метод кассовый (решение Романа 01.09): считаем только то, что реально
// принесло деньги, и то, куда и когда они ушли. Отсюда два следствия,
// которые легко нарушить по невнимательности:
//
//  1. РАСХОДЫ ТОЛЬКО РУЧНЫЕ (решение Романа 02.09). Ни пополнения кошельков
//     завода, ни начисления зарплаты сюда не подтягиваются: пополнение
//     кошелька общее и не ложится на направление, а зарплата в таблице то
//     есть, то нет — и то и другое давало картину, которой нельзя верить.
//     Считаются только журнал денег и справочник постоянных платежей.
//     Смета заказов завода осталась метрикой себестоимости ролика.
//
//  2. Доля партнёра вычитается ещё внутри ownerProfitAmount. Если записать
//     партнёрские выплаты в расходы, они посчитаются дважды. Поэтому верх
//     отчёта — выручка компании, а оборот показывается рядом справочно.

export const FX_KEY = "fx:usd";
const FX_DEFAULT = 90;

/** Курс доллара: вводится руками, до ввода берётся значение по умолчанию. */
export async function fxUsd(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: FX_KEY } });
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : FX_DEFAULT;
}

export function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export const isMonth = (s: string) => /^\d{4}-\d{2}$/.test(s);

// Период отчёта. Месяц остаётся основным — зарплата и постоянные платежи
// живут месяцами, — но день и неделю тоже нужно уметь показать.
export type Span = { start: Date; end: Date; label: string; type: "day" | "week" | "month" };

/** Доля месяца, которую занимает период: постоянные платежи делим по дням. */
export function monthShare(span: Span) {
  if (span.type === "month") return 1;
  const days = Math.max(1, Math.round((span.end.getTime() - span.start.getTime()) / 864e5));
  const inMonth = new Date(Date.UTC(span.start.getUTCFullYear(), span.start.getUTCMonth() + 1, 0)).getUTCDate();
  return days / inMonth;
}

/** Месяцы, которые задевает период — для таблиц, где ключ это «ГГГГ-ММ». */
export function monthsOf(span: Span): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(span.start.getUTCFullYear(), span.start.getUTCMonth(), 1));
  const last = new Date(span.end.getTime() - 1);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out.length ? out : [span.start.toISOString().slice(0, 7)];
}

/** Приводим запись к рублям: в журнале можно вести и долларовые траты. */
const toRub = (amount: number, currency: string, fx: number) =>
  currency === "USD" ? amount * fx : amount;

const round = (n: number) => Math.round(n);

export type CostRow = {
  key: string;
  label: string;
  amount: number;
  source: string;   // откуда цифра — чтобы не гадать, почему столько
  manual: boolean;  // вводится руками или считается сама
};

/**
 * Полная картина месяца: приход, расход, прибыль и юнит-метрики.
 *
 * projectId сужает всё до одного направления. Общие расходы — те, у кого
 * проект не проставлен, — в срез направления не попадают: смешивать их
 * значило бы делить сервер и завод по правилу, которого никто не выбирал.
 * Завод общий всегда: он делает контент на всю группу.
 */
export async function monthMoney(span: Span, projectId?: string) {
  const { start, end } = span;
  const ym = span.label;
  const months = monthsOf(span);
  const share = monthShare(span);
  const fx = await fxUsd();
  const only = projectId ? { projectId } : {};
  const scoped = Boolean(projectId);

  const [txs, ledger, recurring, jobs, newPartners] =
    await Promise.all([
      prisma.transaction.findMany({
        where: {
          date: { gte: start, lt: end },
          ...(projectId ? { partner: { projectId } } : {}),
        },
        select: { revenueAmount: true, ownerProfitAmount: true },
      }),
      prisma.ledger.findMany({
        where: { date: { gte: start, lt: end }, ...only },
        orderBy: { date: "desc" },
        include: { project: { select: { name: true } } },
      }),
      prisma.recurringCost.findMany({
        where: {
          fromMonth: { lte: months[months.length - 1] },
          OR: [{ toMonth: null }, { toMonth: { gte: months[0] } }],
          ...only,
        },
        orderBy: { amount: "desc" },
        include: { project: { select: { name: true } } },
      }),
      scoped
        ? Promise.resolve([] as { cost: number }[])
        : prisma.factoryJob.findMany({
            where: {
              date: { gte: start.toISOString().slice(0, 10), lt: end.toISOString().slice(0, 10) },
              cost: { gt: 0 },
            },
            select: { cost: true },
          }),
      prisma.partner.findMany({
        where: { connectedDate: { gte: start, lt: end }, ...only },
        include: { partnerType: true, project: true },
      }),
    ]);

  // ── Доходы ────────────────────────────────────────────────────────────
  const turnover = txs.reduce((s, t) => s + t.revenueAmount, 0);
  const partnersRevenue = txs.reduce((s, t) => s + t.ownerProfitAmount, 0);
  const otherIncome = ledger
    .filter((l) => l.kind === "in")
    .reduce((s, l) => s + toRub(l.amount, l.currency, fx), 0);
  const income = partnersRevenue + otherIncome;

  // ── Расходы ───────────────────────────────────────────────────────────
  // Только то, что внесено руками: журнал денег плюс справочник постоянных
  // платежей. Ничего не подтягивается со стороны — см. заметку наверху файла.
  const recurringRub = recurring.reduce((s, r) => s + toRub(r.amount, r.currency, fx), 0) * share;

  const out = ledger.filter((l) => l.kind === "out");
  const byCategory = new Map<string, number>();
  for (const l of out) {
    byCategory.set(l.category, (byCategory.get(l.category) || 0) + toRub(l.amount, l.currency, fx));
  }
  const ads = byCategory.get("реклама") || 0;

  // Строка на каждую статью, по которой в периоде есть записи, плюс отдельно
  // постоянные платежи: у них своя природа и свой справочник.
  const rows: CostRow[] = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, sum]) => {
      const n = out.filter((l) => l.category === category).length;
      return {
        key: category,
        label: category.charAt(0).toUpperCase() + category.slice(1),
        amount: round(sum),
        source: `${n} ${plural(n, "запись", "записи", "записей")} в журнале`,
        manual: true,
      };
    });

  rows.push({
    key: "recurring",
    label: "Постоянные платежи",
    amount: round(recurringRub),
    source: recurring.length
      ? `${recurring.length} ${plural(recurring.length, "платёж", "платежа", "платежей")} в справочнике` +
        (span.type === "month" ? "" : " · доля периода")
      : "справочник пуст",
    manual: true,
  });

  const costs = rows.reduce((s, r) => s + r.amount, 0);
  const profit = round(income) - costs;

  // ── Метрики эффективности ─────────────────────────────────────────────
  const jobsCost = jobs.reduce((s, j) => s + j.cost, 0); // смета в долларах
  const videoCost = jobs.length ? round((jobsCost * fx) / jobs.length) : null;

  const kpiForNew = newPartners.reduce(
    (s, p) => s + (p.partnerType?.kpiAmount ?? p.project.kpiAmount),
    0
  );
  const partnerCac = newPartners.length
    ? round((ads + kpiForNew) / newPartners.length)
    : null;

  // Окупаемость: за сколько месяцев партнёр возвращает вложенное в него.
  const activePartners = await prisma.partner.count({ where: { status: "ACTIVE", ...only } });
  const perPartner = activePartners ? partnersRevenue / activePartners : 0;
  const payback = partnerCac && perPartner > 0 ? Math.round((partnerCac / perPartner) * 10) / 10 : null;

  return {
    month: ym,
    periodType: span.type,
    fx,
    projectId: projectId || null,
    scoped,
    income: {
      turnover: round(turnover),
      partners: round(partnersRevenue),
      other: round(otherIncome),
      total: round(income),
      partnerShare: round(turnover - partnersRevenue),
    },
    costs: {
      total: costs,
      rows,
    },
    profit,
    margin: income > 0 ? Math.round((profit / income) * 1000) / 10 : null,
    units: {
      videoCost,
      videos: jobs.length,
      jobsUsd: Math.round(jobsCost * 100) / 100,
      partnerCac,
      newPartners: newPartners.length,
      kpiForNew: round(kpiForNew),
      ads: round(ads),
      payback,
    },
    ledger: ledger.map((l) => ({
      id: l.id,
      kind: l.kind,
      date: l.date.toISOString().slice(0, 10),
      category: l.category,
      title: l.title,
      amount: l.amount,
      currency: l.currency,
      note: l.note,
      project: l.project?.name || null,
      source: l.source,
    })),
    recurring: recurring.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      amount: r.amount,
      currency: r.currency,
      fromMonth: r.fromMonth,
      toMonth: r.toMonth,
      project: r.project?.name || null,
    })),
  };
}

function fmt2(n: number) {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/**
 * Сводка по направлениям за месяц: сколько каждое принесло и сколько съело
 * своими, прямыми расходами. Общие — сервер, завод, зарплата без проекта —
 * идут отдельной строкой и ни по кому не размазываются: правило разнесения
 * никто не выбирал, а придуманное молча искажает картину сильнее, чем
 * честная строка «общие».
 *
 * Поэтому в таблице «вклад», а не «прибыль»: это то, что направление даёт
 * компании до общих расходов.
 */
export async function projectSplit(span: Span) {
  const { start, end } = span;
  const months = monthsOf(span);
  const share = monthShare(span);
  const fx = await fxUsd();

  const [projects, txs, ledger, recurring] = await Promise.all([
    prisma.project.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      select: { revenueAmount: true, ownerProfitAmount: true, partner: { select: { projectId: true } } },
    }),
    prisma.ledger.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.recurringCost.findMany({
      where: {
        fromMonth: { lte: months[months.length - 1] },
        OR: [{ toMonth: null }, { toMonth: { gte: months[0] } }],
      },
    }),
  ]);

  const SHARED = "";
  const bucket = new Map<string, { income: number; direct: number }>();
  const slot = (id: string | null) => {
    const key = id || SHARED;
    let b = bucket.get(key);
    if (!b) bucket.set(key, (b = { income: 0, direct: 0 }));
    return b;
  };

  for (const t of txs) slot(t.partner.projectId).income += t.ownerProfitAmount;
  for (const l of ledger) {
    const rub = toRub(l.amount, l.currency, fx);
    if (l.kind === "in") slot(l.projectId).income += rub;
    else slot(l.projectId).direct += rub;
  }
  for (const r of recurring) slot(r.projectId).direct += toRub(r.amount, r.currency, fx) * share;

  const rows = projects.map((p) => {
    const b = bucket.get(p.id) || { income: 0, direct: 0 };
    const income = round(b.income);
    const direct = round(b.direct);
    return {
      id: p.id,
      name: p.name,
      income,
      direct,
      contribution: income - direct,
      margin: income > 0 ? Math.round(((income - direct) / income) * 1000) / 10 : null,
    };
  });

  const shared = bucket.get(SHARED) || { income: 0, direct: 0 };
  return {
    rows,
    shared: { income: round(shared.income), direct: round(shared.direct) },
  };
}
