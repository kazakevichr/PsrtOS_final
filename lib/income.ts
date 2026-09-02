import { prisma } from "@/lib/prisma";
import type { Span } from "@/lib/ledger";

// Поступления из внешних источников. Оба живут на том же сервере, что и
// Постос, поэтому ходим к ним напрямую — лишнего слоя ручек не заводим.
//
//   superfit → CloudPayments, эквайринг лендинга и бота. Ключи сайта в
//              INCOME_CP_PUBLIC_ID и INCOME_CP_API_SECRET. Сайтов у мерчанта
//              несколько, у каждого свои ключи — пары перечисляются через
//              точку с запятой, потому что деньги нужны все.
//   oracle   → Postgres Оракла, хранилище kv, store «oracle-payments».
//              Читаем строго на чтение, в самом Оракле ничего не меняем.
//
// Почему тянем, а не ждём вебхука: в бухгалтерии пропущенный платёж хуже
// задержки. Период переспрашивается целиком, записи узнаются по externalId —
// повторный запуск ничего не задваивает и подбирает всё, что потерялось.

export type IncomeItem = {
  externalId: string;
  date: Date;
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

/**
 * Значение переменной окружения, устойчивое к частой опечатке: в поле
 * «Value» вставляют целиком строку «ИМЯ=значение». Отрезаем имя, если оно
 * приехало вместе со значением, — иначе адрес базы не разбирается, а ошибка
 * выглядит загадочным EAI_AGAIN.
 */
function env(name: string): string {
  const raw = (process.env[name] || "").trim();
  return raw.startsWith(`${name}=`) ? raw.slice(name.length + 1).trim() : raw;
}

const LABEL: Record<string, string> = {
  superfit: "CloudPayments",
  oracle: "Оракл",
};

export const sourceLabel = (key: string) => LABEL[key] || key;

const days = (span: Span) => {
  const out: string[] = [];
  const d = new Date(span.start);
  while (d < span.end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
};

/**
 * Пары ключей сайтов CloudPayments. Канонический вид —
 * "pk_первый:пароль1;pk_второй:пароль2", но разделитель тут — вечный источник
 * опечаток, а перевыпуск ключей из-за неверной точки с запятой дороже, чем
 * терпимый разбор. Public ID всегда начинается с «pk_», пароль — никогда,
 * поэтому пары собираются однозначно: любой разделитель, любой порядок строк.
 */
function cpKeys() {
  const source =
    env("INCOME_CP_KEYS") ||
    `${env("INCOME_CP_PUBLIC_ID")}:${env("INCOME_CP_API_SECRET")}`;

  const tokens = source.split(/[;:,\s]+/).map((t) => t.trim()).filter(Boolean);
  const pairs: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (!tokens[i].startsWith("pk_")) continue;
    const secret = tokens[i + 1];
    if (secret && !secret.startsWith("pk_")) {
      pairs.push(`${tokens[i]}:${secret}`);
      i++;
    }
  }

  if (!pairs.length) {
    throw new Error(
      tokens.length
        ? "в ключах CloudPayments не нашлось пары «pk_… и пароль»"
        : "не заданы ключи CloudPayments"
    );
  }
  return pairs;
}

async function fromCloudPayments(span: Span): Promise<IncomeItem[]> {
  const out: IncomeItem[] = [];
  for (const pair of cpKeys()) {
    const auth = Buffer.from(pair).toString("base64");
    for (const day of days(span)) {
      const r = await fetch("https://api.cloudpayments.ru/payments/list", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({ Date: day }),
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`CloudPayments ответил ${r.status}`);
      const data = await r.json();
      if (data.Success === false && data.Message) throw new Error(String(data.Message));
      for (const t of data.Model || []) {
        if (t.Status !== "Completed") continue;
        const at = new Date(t.ConfirmDateIso || t.CreatedDateIso || day);
        out.push({
          externalId: String(t.TransactionId),
          date: at,
          amount: Number(t.Amount) || 0,
          currency: t.Currency === "USD" ? "USD" : "RUB",
          title: t.Description || "Оплата на сайте",
        });
      }
    }
  }
  return out;
}

async function fromOracle(span: Span): Promise<IncomeItem[]> {
  const url = env("INCOME_ORACLE_DB");
  if (!url) throw new Error("не задан INCOME_ORACLE_DB");
  // pg тянем лениво: он нужен только этому источнику.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select key,
              (value::json->>'activatedAt')::bigint as at,
              (value::json->>'amountRub')::numeric  as rub,
              value::json->>'planLabel'             as plan
         from kv
        where store = 'oracle-payments'
          and value::json->>'status' = 'paid'
          and (value::json->>'activatedAt')::bigint >= $1
          and (value::json->>'activatedAt')::bigint <  $2`,
      [span.start.getTime(), span.end.getTime()]
    );
    return rows
      .filter((r: any) => Number(r.rub) > 0)
      .map((r: any) => ({
        externalId: String(r.key).replace(/^payment:/, ""),
        date: new Date(Number(r.at)),
        amount: Number(r.rub),
        currency: "RUB",
        title: r.plan ? `Оракл · ${r.plan}` : "Подписка Оракл",
      }));
  } finally {
    await client.end();
  }
}

const PULL: Record<string, (span: Span) => Promise<IncomeItem[]>> = {
  superfit: fromCloudPayments,
  oracle: fromOracle,
};

/**
 * Тянет поступления за период по направлениям, у которых указан источник.
 * Источник, который не ответил, возвращается строкой с ошибкой: молча
 * пропущенный выглядел бы как «продаж не было» — худшая ошибка здесь.
 */
export async function syncIncome(span: Span): Promise<SyncResult[]> {
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
      row.error = `источник «${source}» не знаком`;
      continue;
    }

    let items: IncomeItem[];
    try {
      items = await pull(span);
    } catch (e: any) {
      const msg = String(e?.message || "");
      row.error =
        msg === "fetch failed" ? "не достучались до источника" : msg || "источник не ответил";
      continue;
    }

    for (const item of items) {
      if (Number.isNaN(item.date.getTime()) || item.date < span.start || item.date >= span.end) continue;
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
          date: item.date,
          category: "продажи",
          title: item.title,
          amount: item.amount,
          currency: item.currency,
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
