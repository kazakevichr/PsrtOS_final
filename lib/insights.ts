// Нейро-аналитика контента: Claude разбирает посты выбранного среза и
// объясняет, что заходит, а что нет — с цифрами-доказательствами.
// Ключ — тот же ANTHROPIC_API_KEY, что у завода; ANTHROPIC_BASE_URL
// (опционально) направляет запросы через свой роутер.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";

const InsightSchema = z.object({
  summary: z.string(),
  working: z.array(z.object({ pattern: z.string(), evidence: z.string() })),
  not_working: z.array(z.object({ pattern: z.string(), evidence: z.string() })),
  recommendations: z.array(z.string()),
  top_post_ids: z.array(z.string()),
  flop_post_ids: z.array(z.string()),
});
export type Insight = z.infer<typeof InsightSchema> & {
  scope: string;
  postsAnalyzed: number;
  updatedAt: string;
};

export async function generateInsight(scope: string, posts: any[]): Promise<Insight> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("нет ANTHROPIC_API_KEY — добавь ключ Anthropic в Coolify");
  }
  if (posts.length < 5) {
    throw new Error(`мало данных: ${posts.length} постов — нужно хотя бы 5`);
  }

  // Компактный пакет для модели: текст урезан, метрики целиком
  const rows = posts.slice(0, 80).map((p) => ({
    id: p.id,
    text: String(p.caption || "").slice(0, 300),
    published_msk: new Date(p.timestamp).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow", weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
    }),
    type: p.type || "",
    source: p.source === "factory" ? "завод" : "вручную",
    platform: p.platform,
    views: p.views ?? null,
    reach: p.reach ?? null,
    likes: p.likes ?? null,
    comments: p.comments ?? null,
    saved: p.saved ?? null,
    shares: p.shares ?? null,
  }));

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    system:
      "Ты аналитик контента соцсетей. Тебе дают посты профиля с полными метриками. " +
      "Найди закономерности: какие темы, форматы, структура текста, время публикации и источник " +
      "(завод/вручную) дают результат выше среднего, а какие ниже. Каждый вывод подкрепляй " +
      "конкретными цифрами из данных (средние, кратность к среднему, названия постов). " +
      "Пиши по-русски, коротко и предметно, без воды. В working/not_working — 3-5 пунктов, " +
      "pattern — сам паттерн одной фразой, evidence — цифровое доказательство. " +
      "В recommendations — 3-5 конкретных действий. В top_post_ids/flop_post_ids — по 3 id " +
      "лучших и худших постов относительно их потенциала.",
    messages: [{
      role: "user",
      content: `Посты профиля за период (JSON):\n${JSON.stringify(rows, null, 0)}`,
    }],
    output_config: { format: zodOutputFormat(InsightSchema) },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("модель отклонила запрос — попробуй ещё раз");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("модель вернула невалидный ответ — попробуй ещё раз");

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
