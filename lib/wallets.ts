import { prisma } from "@/lib/prisma";

// Кошельки платных сервисов завода: справочник, расчёт остатка и состояние.
//
// Главное правило раздела: таблица показывает ВСЕ сервисы всегда, даже пока
// завод не прислал ни одного замера. Пустой раздел неотличим от сломанного, а
// человек открывает его именно тогда, когда что-то встало.

export type WalletRow = {
  service: string;
  title: string;
  ok: boolean;
  low: boolean;
  left: number | null;
  unit: string;
  spent: number | null;
  note: string;
  link: string;
  manual: number | null;
  manualAt: string | null;
  at: string | null;
  fresh: boolean;          // замер свежий (моложе трёх часов)
  topups: number;          // сумма пополнений, $
  balance: number | null;  // остаток к показу
  source: string;          // откуда взят остаток
  blocks: boolean;         // останавливает ли производство
  state: string;
};

// Справочник сервисов. Порядок — как в таблице: сперва то, без чего завод
// не работает вовсе.
//
// blocks говорит, останавливает ли пустой кошелёк производство. У роутера и
// OpenAI он false не по недосмотру: это ЗАМЕНА ДРУГ ДРУГУ. Пуст роутер —
// завод платит OpenAI и продолжает выпускать контент (решение Романа 01.09).
// Останавливает только то, у чего замены нет.
export const SERVICES: Record<
  string,
  { title: string; unit: string; blocks: boolean; link: string; api: string }
> = {
  router: {
    title: "Роутер (router.cheap)",
    unit: "$",
    blocks: false,
    link: "https://router.cheap",
    api: "расход — да, остаток — нет",
  },
  openai: {
    title: "OpenAI",
    unit: "$",
    blocks: false,
    link: "https://platform.openai.com/settings/organization/billing",
    api: "остаток не отдаёт",
  },
  eleven: {
    title: "ElevenLabs (озвучка)",
    unit: "символов",
    blocks: false,
    link: "https://elevenlabs.io/app/settings/billing",
    api: "отдаст после перевыпуска ключа с правом user_read",
  },
  heygen: {
    title: "HeyGen (ИИ-аватар)",
    unit: "с видео",
    blocks: true,
    link: "https://app.heygen.com",
    api: "остаток — да",
  },
  fal: {
    title: "fal.ai (вырезание фона)",
    unit: "$",
    blocks: false,
    link: "https://fal.ai/dashboard",
    api: "остаток не отдаёт",
  },
};

// Сколько замер считается свежим. Завод присылает раз в час; три часа — это
// два пропущенных цикла подряд, то есть он молчит не случайно.
const FRESH_MS = 3 * 60 * 60 * 1000;

export function stateOf(w: { ok: boolean; low: boolean }): string {
  if (!w.ok) return "down";
  return w.low ? "low" : "ok";
}

/** Полная картина по кошелькам: замеры завода + ручной ввод + пополнения. */
export async function wallets(): Promise<WalletRow[]> {
  const [rows, topups] = await Promise.all([
    prisma.wallet.findMany(),
    prisma.walletTopup.groupBy({ by: ["service"], _sum: { amount: true } }),
  ]);
  const byService = new Map(rows.map((r) => [r.service, r]));
  const topupSum = new Map(topups.map((t) => [t.service, t._sum.amount || 0]));
  const now = Date.now();

  return Object.entries(SERVICES).map(([service, meta]) => {
    const w = byService.get(service);
    const paid = topupSum.get(service) || 0;
    const at = w?.at ? w.at.toISOString() : null;
    const fresh = Boolean(w?.at && now - w.at.getTime() < FRESH_MS);

    // ОТКУДА БЕРЁМ ОСТАТОК — три источника, в порядке доверия:
    //  1. сервис отдал сам (HeyGen, ElevenLabs с правом user_read);
    //  2. человек вписал руками — свежее любых расчётов;
    //  3. считаем: пополнения минус расход (роутер, OpenAI, fal).
    let balance: number | null = null;
    let source = "";
    if (w?.left != null && fresh) {
      balance = w.left;
      source = "сервис отдал сам";
    } else if (w?.manual != null) {
      balance = w.manual;
      source = "внесено руками";
    } else if (paid > 0 && w?.spent != null) {
      balance = Math.round((paid - w.spent) * 100) / 100;
      source = "пополнения минус расход";
    } else if (paid > 0) {
      balance = paid;
      source = "пополнения (расход неизвестен)";
    }

    return {
      service,
      title: w?.title || meta.title,
      ok: w?.ok ?? true,
      low: w?.low ?? false,
      left: w?.left ?? null,
      unit: meta.unit,
      spent: w?.spent ?? null,
      note: w?.note || (w ? "" : "завод ещё не присылал замер"),
      link: w?.link || meta.link,
      manual: w?.manual ?? null,
      manualAt: w?.manualAt ? w.manualAt.toISOString() : null,
      at,
      fresh,
      topups: Math.round(paid * 100) / 100,
      balance,
      source,
      blocks: meta.blocks,
      state: w?.state || "",
    };
  });
}

/** История пополнений — новые сверху. */
export async function topups(limit = 50) {
  const rows = await prisma.walletTopup.findMany({
    orderBy: { at: "desc" },
    take: Math.min(limit, 200),
  });
  return rows.map((r) => ({
    id: r.id,
    service: r.service,
    title: SERVICES[r.service]?.title || r.service,
    amount: r.amount,
    at: r.at.toISOString(),
    who: r.who,
    note: r.note,
  }));
}
