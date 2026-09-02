import { prisma } from "@/lib/prisma";
import { isMonth, monthBounds } from "@/lib/ledger";

// Поступления из внешних источников: лендинг Суперфита (CloudPayments) и
// подписки Оракла. Постос ходит за ними сам и складывает в тот же журнал,
// куда Роман вносит вечеринки, — чтобы доход везде считался одинаково.
//
// Почему тянем, а не ждём вебхука: в бухгалтерии пропущенный платёж хуже
// задержки. Источник переспрашивается за весь месяц целиком, записи узнаются
// по externalId, поэтому повторный запуск ничего не задваивает и заодно
// подбирает всё, что потерялось, пока Постос был недоступен.

export type IncomeItem = {
  externalId: string;
  date: string;    // ISO
  amount: number;
  currency: string;
  title: string;
};

export type SyncResult = {
  project: string;
  source: string;
  added: number;
  known: number;
  error?: string;
};

const SOURCES: Record<string, { label: string; env: string }> = {
  superfit: { label: "Суперфит24", env: "INCOME_SUPERFIT" },
  oracle: { label: "Оракл", env: "INCOME_ORACLE" },
};

export const sourceLabel = (key: string) => SOURCES[key]?.label || key;
export const sourceKeys = () => Object.keys(SOURCES);

function conf(source: string) {
  const meta = SOURCES[source];
  if (!meta) throw new Error(`Источник «${source}» не знаком`);
  const url = process.env[`${meta.env}_URL`];
  const key = process.env[`${meta.env}_KEY`];
  if (!url) throw new Error(`Не задан ${meta.env}_URL в переменных окружения`);
  if (!key) throw new Error(`Не задан ${meta.env}_KEY в переменных окружения`);
  return { url: url.replace(/\/$/, ""), key };
}

/** Оплаченные заказы лендинга за месяц. Ключ — в заголовке, как у бота. */
async function fromSuperfit(month: string): Promise<IncomeItem[]> {
  const { url, key } = conf("superfit");
  const r = await fetch(`${url}/api/orders-report?month=${month}`, {
    headers: { "x-bot-key": key },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Лендинг ответил ${r.status}`);
  const data = await r.json();
  return (data.orders || []).map((o: any) => ({
    externalId: String(o.id),
    date: o.paidAt,
    amount: Number(o.amount),
    currency: o.currency || "RUB",
    title: o.title || "Покупка на лендинге",
  }));
}

/** Оплаченные подписки Оракла. Пароль админки идёт в теле, как у admin.js. */
async function fromOracle(month: string): Promise<IncomeItem[]> {
  const { url, key } = conf("oracle");
  const r = await fetch(`${url}/.netlify/functions/payments-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminPassword: key, month }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Оракл ответил ${r.status}`);
  const data = await r.json();
  return (data.payments || []).map((p: any) => ({
    externalId: String(p.orderId),
    date: p.paidAt,
    amount: Number(p.amount),
    currency: p.currency || "USD",
    title: p.tier ? `Подписка Оракл, ${p.tier}` : "Подписка Оракл",
  }));
}

const PULL: Record<string, (month: string) => Promise<IncomeItem[]>> = {
  superfit: fromSuperfit,
  oracle: fromOracle,
};

/**
 * Тянет поступления за месяц по всем направлениям, у которых указан источник.
 * Возвращает по строке на направление — включая те, где источник ответил
 * ошибкой: молча пропущенный источник в бухгалтерии выглядит как «дохода не
 * было», а это худшая из возможных ошибок здесь.
 */
export async function syncIncome(month: string): Promise<SyncResult[]> {
  if (!isMonth(month)) throw new Error("Месяц должен быть в виде ГГГГ-ММ");
  const { start, end } = monthBounds(month);

  const projects = await prisma.project.findMany({
    where: { incomeSource: { not: null } },
    select: { id: true, name: true, incomeSource: true },
  });

  const out: SyncResult[] = [];
  for (const project of projects) {
    const source = project.incomeSource as string;
    const row: SyncResult = { project: project.name, source, added: 0, known: 0 };
    out.push(row);

    const pull = PULL[source];
    if (!pull) {
      row.error = `Источник «${source}» не знаком`;
      continue;
    }

    let items: IncomeItem[];
    try {
      items = await pull(month);
    } catch (e: any) {
      // «fetch failed» из Node ничего не объясняет тому, кто читает отчёт.
      const msg = String(e?.message || "");
      row.error =
        msg === "fetch failed"
          ? "не достучались — проверь адрес источника и что он работает"
          : msg || "источник не ответил";
      continue;
    }

    for (const item of items) {
      const date = new Date(item.date);
      // Источник отдаёт свой месяц целиком, но подстрахуемся: чужая дата
      // испортила бы уже закрытую картину соседнего месяца.
      if (Number.isNaN(date.getTime()) || date < start || date >= end) continue;
      if (!Number.isFinite(item.amount) || item.amount <= 0) continue;

      const existing = await prisma.ledger.findUnique({
        where: { source_externalId: { source, externalId: item.externalId } },
      });
      if (existing) {
        row.known++;
        continue;
      }
      await prisma.ledger.create({
        data: {
          kind: "in",
          date,
          category: "продажи",
          title: item.title,
          amount: item.amount,
          currency: item.currency === "USD" ? "USD" : "RUB",
          projectId: project.id,
          source,
          externalId: item.externalId,
        },
      });
      row.added++;
    }
  }
  return out;
}
