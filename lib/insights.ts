// Нейро-аналитика контента: Claude разбирает посты выбранного среза и
// объясняет, что заходит, а что нет — с цифрами и постами-примерами.
// Ключ и роутер — те же, что у Оракла: CLAUDE_API_KEY + CLAUDE_BASE_URL.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { metaMap, normLink } from "@/lib/meta";

const ItemSchema = z.object({
  pattern: z.string(),
  evidence: z.string(),
  n: z.number(),
  example_ids: z.array(z.string()),
});
const InsightSchema = z.object({
  summary: z.string(),
  working: z.array(ItemSchema),
  not_working: z.array(ItemSchema),
  recommendations: z.array(z.string()),
  top_post_ids: z.array(z.string()),
  flop_post_ids: z.array(z.string()),
});
export type Insight = z.infer<typeof InsightSchema> & {
  scope: string;
  postsAnalyzed: number;
  updatedAt: string;
};

// Уровень достоверности считаем сами от размера выборки — модель может
// приукрасить, а правило простое: 8+ вывод, 4–7 наблюдение, 1–3 гипотеза.
export const confidence = (n: number) =>
  n >= 8 ? "вывод" : n >= 4 ? "наблюдение" : "гипотеза";

const recNorm = (t: string) =>
  t.toLowerCase().replace(/[^а-яёa-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);

export async function generateInsight(scope: string, posts: any[]): Promise<Insight> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error("нет CLAUDE_API_KEY / ANTHROPIC_API_KEY — добавь ключ в Coolify");
  }

  // Честное окно: посты моложе 72 часов ещё добирают охват — в сравнения
  // не берём, иначе свежее всегда «хуже» старого.
  const mature = posts.filter(
    (p) => p.timestamp && Date.now() - new Date(p.timestamp).getTime() > 72 * 3600e3
  );
  if (mature.length < 5) {
    throw new Error(`мало данных: ${mature.length} постов старше 72 часов — нужно хотя бы 5`);
  }

  const metas = await metaMap();
  const rows = mature.slice(0, 80).map((p) => {
    const m = p.permalink ? metas.get(normLink(p.permalink)) : null;
    return {
      id: p.id,
      text: String(p.caption || "").slice(0, 200),
      published_msk: new Date(p.timestamp).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow", weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
      }),
      type: p.type || "",
      source: p.source === "factory" ? "завод" : "вручную",
      platform: p.platform,
      // Паспорт: происхождение, тема, хук, содержание, призыв — опора выводов.
      origin: m?.origin || "",
      topic: m?.topic || "",
      hook: m?.hook || "",
      content: m?.content || "",
      visual: m?.visual || "",
      cta_video: m?.ctaVideo || "",
      cta: m?.cta || "",
      leads: m && m.leads >= 0 ? m.leads : null,
      views: p.views ?? null,
      reach: p.reach ?? null,
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      saved: p.saved ?? null,
      shares: p.shares ?? null,
    };
  });

  // Уже данные рекомендации — чтобы модель не советовала одно и то же.
  const givenRecs = await prisma.recommendation.findMany({
    where: { status: { not: "dismissed" } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL;
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  // Обычный create + свой парсинг: structured output роутер Оракла не
  // пропускает — формат держим инструкцией и валидируем zod-схемой сами.
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system:
      "Ты аналитик контента соцсетей. Тебе дают посты профиля с метриками и паспортом " +
      "(origin/topic/hook/content/visual/cta_video/cta — происхождение, тема, хук, содержание, визуал в кадре, призыв в ролике, призыв в тексте). " +
      "Найди закономерности, опираясь в первую очередь на оси паспорта. ПРАВИЛА ЧЕСТНОСТИ: " +
      "1) сравнивай только сопоставимое — заводское с заводским, ручное с ручным, один тип контента между собой; " +
      "не выдавай за причину время публикации, если утро и вечер занимают разные типы контента; " +
      "2) используй медиану, а не среднее; 3) у каждого вывода честно укажи n — по скольким постам он сделан; " +
      "4) lead-gen посты (cta = кодовое слово) оценивай по leads (заявки), а не по охвату; " +
      "5) в example_ids дай 1-3 id постов-доказательств этого вывода. " +
      "Пиши по-русски, коротко и предметно. В working/not_working — 3-5 пунктов: pattern — паттерн одной фразой, " +
      "evidence — цифры (медианы, кратность, названия). В recommendations — 3-5 конкретных действий, " +
      "НЕ ПОВТОРЯЯ уже данные ранее (список ниже). В top_post_ids/flop_post_ids — по 3 id. " +
      "ОТВЕТ — СТРОГО ОДИН JSON-ОБЪЕКТ без пояснений и markdown, вида: " +
      '{"summary": "...", "working": [{"pattern": "...", "evidence": "...", "n": 5, "example_ids": ["..."]}], ' +
      '"not_working": [...тот же формат...], "recommendations": ["..."], ' +
      '"top_post_ids": ["..."], "flop_post_ids": ["..."]}',
    messages: [{
      role: "user",
      content:
        `Посты профиля за период (JSON):\n${JSON.stringify(rows, null, 0)}\n\n` +
        `Уже данные ранее рекомендации (не повторять):\n${JSON.stringify(givenRecs.map((r) => r.text))}`,
    }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("модель отклонила запрос — попробуй ещё раз");
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("модель не вернула JSON — попробуй ещё раз");
  const check = InsightSchema.safeParse(JSON.parse(m[0]));
  if (!check.success) throw new Error("ответ модели не прошёл валидацию — попробуй ещё раз");
  const parsed = check.data;

  // Новые рекомендации сохраняются и живут между анализами.
  //
  // Дедуп идёт по тексту, а срез теперь отбирает рекомендации своего
  // направления — поэтому у совпавшей записи обновляем срез: иначе совет,
  // выданный разбором Оракла, остался бы висеть в направлении, которое
  // придумало ту же формулировку первым, и в Оракле не появился бы вовсе.
  // Статус и привязанную задачу не трогаем — их судьба своя.
  for (const t of parsed.recommendations) {
    const n = recNorm(t);
    if (!n) continue;
    await prisma.recommendation.upsert({
      where: { norm: n },
      create: { norm: n, text: t, scope },
      update: { scope },
    });
  }

  const result: Insight = {
    ...parsed,
    scope,
    postsAnalyzed: rows.length,
    updatedAt: new Date().toISOString(),
  };
  await prisma.socialInsight.upsert({
    where: { scope },
    create: { scope, result: JSON.stringify(result) },
    update: { result: JSON.stringify(result) },
  });
  return result;
}

export async function savedInsight(scope: string): Promise<Insight | null> {
  const row = await prisma.socialInsight.findUnique({ where: { scope } });
  return row ? JSON.parse(row.result) : null;
}
