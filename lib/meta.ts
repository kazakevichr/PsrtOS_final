// Паспорт контента: разметка каждого поста по осям (формат, происхождение,
// тема, хук, содержание, призыв). Заводские посты размечает сам завод —
// журнал уже знает тип и тему; ручные доразмечает нейросеть по описанию.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

export const normLink = (u: string) =>
  (u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("?")[0].replace(/\/$/, "");

export const KIND_ORIGIN: Record<string, string> = {
  make: "персонаж",
  carousel: "карусель завода",
  carousel_new: "карусель новая",
  avatar: "ИИ-аватар",
  "trainer:female": "тренер Ж",
  "trainer:male": "тренер М",
  repost: "нарезка",
  manual: "ручной из бота",
};

const AXES = {
  hook: ["вопрос", "боль", "цифра", "до-после", "интрига", "нет"],
  content: ["практика", "анонс", "лайфстайл", "продажа"],
  cta: ["кодовое слово", "ссылка", "подписка", "нет"],
};

// Визуал — что зритель видит в кадре. Закрытый список, чтобы срезы
// не рассыпались на уникальные формулировки.
export const VISUALS = [
  "тренировка в зале", "тренировка дома", "говорит в камеру", "еда",
  "скриншот приложения", "карточки с текстом", "до-после", "аватар/анимация", "прочее",
];

// Кодовое слово из текста: «Пишите "БАД" в комментариях» и вариации.
function codeWord(text: string): string {
  const m = (text || "").match(/(?:напиши(?:те)?|пишите?|пиши)[^\n"«]{0,40}["«]([^"»\n]{2,25})["»]/i);
  return m ? m[1].trim().toUpperCase() : "";
}

// Все ручные и заводские посты Инстаграма (кроме партнёрских bd:) одним
// списком: ключ, описание, тип, дата — сырьё для разметки и срезов.
export async function igPosts() {
  const out: any[] = [];
  for (const a of await prisma.igAccount.findMany()) {
    if (a.igId.startsWith("bd:")) continue;
    for (const m of JSON.parse(a.media) as any[]) {
      if (!m.permalink || !m.timestamp) continue;
      out.push({ ...m, account: a.username, key: normLink(m.permalink) });
    }
  }
  return out;
}

// Разметка заводского архива из журнала: тип и тема известны заводу точно.
export async function backfillFactoryMeta() {
  const jobs = await prisma.factoryJob.findMany({ where: { event: "опубликован" } });
  let added = 0;
  for (const j of jobs) {
    let links: any[] = [];
    try { links = JSON.parse(j.links); } catch {}
    for (const l of links) {
      if (!l?.link || !/instagram\.com/.test(l.link)) continue;
      const key = normLink(l.link);
      if (await prisma.contentMeta.findUnique({ where: { key } })) continue;
      const text = `${j.topic}\n${j.script}`;
      const word = codeWord(text);
      await prisma.contentMeta.create({
        data: {
          key, source: "factory", labeledBy: "factory",
          origin: KIND_ORIGIN[j.kind] || j.kind || "",
          topic: j.topic || "",
          format: (j.kind || "").startsWith("carousel") ? "карусель" : "видео",
          cta: word ? "кодовое слово" : "",
          ctaWord: word,
        },
      });
      added++;
    }
  }
  return added;
}

// Нейро-доразметка: новые ручные посты целиком, у заводских — пустые оси
// (хук/содержание завод пока не присылает). Рутина — лёгкой моделью.
export async function labelBatch(limit = 12) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { labeled: 0, note: "нет ключа" };

  const posts = await igPosts();
  const metas = new Map(
    (await prisma.contentMeta.findMany()).map((r) => [r.key, r])
  );
  const fresh = Date.now() - 120 * 864e5;
  const need = posts
    .filter((p) => new Date(p.timestamp).getTime() > fresh)
    .filter((p) => {
      const r = metas.get(p.key);
      return !r || !r.hook || !r.content;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
  if (!need.length) return { labeled: 0 };

  const rows = need.map((p) => ({
    key: p.key,
    media: p.mediaType || p.type || "",
    text: String(p.caption || "").slice(0, 400),
  }));
  const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL;
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const r = await client.messages.create({
    model: process.env.META_LABEL_MODEL || "claude-sonnet-5",
    max_tokens: 4000,
    system:
      "Ты размечаешь посты фитнес-аккаунта по осям. Для каждого поста определи: " +
      `topic — тема 2-4 словами по-русски; hook — тип первой строки, одно из ${JSON.stringify(AXES.hook)}; ` +
      `content — что пост даёт зрителю, одно из ${JSON.stringify(AXES.content)} ` +
      "(практика = можно взять и применить; анонс = рекламирует гайд/другой продукт контента; " +
      "лайфстайл = жизнь/мотивация без конкретики; продажа = прямое предложение купить); " +
      `cta — призыв, одно из ${JSON.stringify(AXES.cta)}; ctaWord — кодовое слово заглавными, если призыв «кодовое слово», иначе "". ` +
      "ОТВЕТ — СТРОГО JSON-массив объектов {\"key\",\"topic\",\"hook\",\"content\",\"cta\",\"ctaWord\"} без текста вокруг.",
    messages: [{ role: "user", content: JSON.stringify(rows) }],
  });
  const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return { labeled: 0, note: "модель не вернула JSON" };
  let items: any[] = [];
  try { items = JSON.parse(m[0]); } catch { return { labeled: 0, note: "битый JSON" }; }

  const byKey = new Map(need.map((p) => [p.key, p]));
  let labeled = 0;
  for (const it of items) {
    const p = byKey.get(it?.key);
    if (!p) continue;
    const pick = (v: any, list: string[]) => (list.includes(v) ? v : "");
    const existing = metas.get(p.key);
    const fields = {
      topic: existing?.topic || String(it.topic || "").slice(0, 60),
      hook: pick(it.hook, AXES.hook),
      content: pick(it.content, AXES.content),
      cta: existing?.cta || pick(it.cta, AXES.cta),
      ctaWord: existing?.ctaWord || String(it.ctaWord || "").slice(0, 25).toUpperCase(),
    };
    const mt = String(p.mediaType || "").toUpperCase();
    await prisma.contentMeta.upsert({
      where: { key: p.key },
      create: {
        key: p.key, source: "manual", labeledBy: "ai", origin: "ручной",
        format: mt === "CAROUSEL_ALBUM" ? "карусель" : mt === "VIDEO" ? "видео" : "фото",
        ...fields,
      },
      update: { hook: fields.hook, content: fields.content, cta: fields.cta, ctaWord: fields.ctaWord,
        topic: existing?.topic ? undefined : fields.topic },
    });
    labeled++;
  }
  return { labeled };
}

// Заявки lead-gen: кодовое слово пишут в комментарии — считаем комментарии
// с этим словом через Graph API. Пересчёт раз в сутки, посты моложе 45 дней.
export async function countLeads(limit = 10) {
  const token = process.env.META_TOKEN;
  if (!token) return { counted: 0, note: "нет META_TOKEN" };
  const posts = await igPosts();
  const idByKey = new Map(posts.map((p) => [p.key, p]));
  const dayAgo = new Date(Date.now() - 864e5);
  const oldEdge = Date.now() - 45 * 864e5;

  const metas = (await prisma.contentMeta.findMany({
    where: { cta: "кодовое слово", ctaWord: { not: "" } },
  }))
    .filter((r) => {
      const p = idByKey.get(r.key);
      if (!p || new Date(p.timestamp).getTime() < oldEdge) return false;
      return r.leads < 0 || !r.leadsAt || r.leadsAt < dayAgo;
    })
    .slice(0, limit);

  let counted = 0;
  for (const r of metas) {
    const p = idByKey.get(r.key)!;
    try {
      let leads = 0;
      let url = `https://graph.facebook.com/v23.0/${p.id}/comments?fields=text&limit=100&access_token=${token}`;
      for (let page = 0; page < 3 && url; page++) {
        const resp = await fetch(url);
        const d = await resp.json();
        if (d.error) throw new Error(d.error.message);
        for (const c of d.data || []) {
          if (String(c.text || "").toUpperCase().includes(r.ctaWord)) leads++;
        }
        url = d.paging?.next || "";
      }
      await prisma.contentMeta.update({
        where: { key: r.key },
        data: { leads, leadsAt: new Date() },
      });
      counted++;
    } catch {}
  }
  return { counted };
}

// Визуал по обложкам: качаем превью поста и просим модель со зрением
// отнести кадр к одному из закрытых вариантов. Пачками, раз в час.
export async function labelVisualBatch(limit = 8) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return { visual: 0, note: "нет ключа" };

  const posts = await igPosts();
  const metas = new Map((await prisma.contentMeta.findMany()).map((r) => [r.key, r]));
  const fresh = Date.now() - 120 * 864e5;
  const need = posts
    .filter((p) => p.thumbnail && new Date(p.timestamp).getTime() > fresh)
    .filter((p) => {
      const r = metas.get(p.key);
      return r && !r.visual;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, limit);
  if (!need.length) return { visual: 0 };

  const blocks: any[] = [];
  const keys: string[] = [];
  for (const p of need) {
    try {
      const resp = await fetch(p.thumbnail);
      if (!resp.ok) continue;
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > 4_500_000) continue;
      const mediaType = resp.headers.get("content-type")?.split(";")[0] || "image/jpeg";
      blocks.push({ type: "text", text: `Обложка #${keys.length + 1}:` });
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
      });
      keys.push(p.key);
    } catch {}
  }
  if (!keys.length) return { visual: 0, note: "обложки не скачались" };

  blocks.push({
    type: "text",
    text:
      "Это обложки постов фитнес-аккаунта, по порядку. Для каждой определи, что зритель видит в кадре — " +
      `строго один вариант из списка: ${JSON.stringify(VISUALS)}. ` +
      'ОТВЕТ — СТРОГО JSON-массив строк по порядку обложек, например ["еда","говорит в камеру"], без текста вокруг.',
  });

  const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL;
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const r = await client.messages.create({
    model: process.env.META_LABEL_MODEL || "claude-sonnet-5",
    max_tokens: 1000,
    messages: [{ role: "user", content: blocks }],
  });
  const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return { visual: 0, note: "модель не вернула JSON" };
  let items: any[] = [];
  try { items = JSON.parse(m[0]); } catch { return { visual: 0, note: "битый JSON" }; }

  let done = 0;
  for (let i = 0; i < keys.length && i < items.length; i++) {
    const v = VISUALS.includes(items[i]) ? items[i] : "прочее";
    await prisma.contentMeta.update({ where: { key: keys[i] }, data: { visual: v } });
    done++;
  }
  return { visual: done };
}

export async function metaMap() {
  return new Map((await prisma.contentMeta.findMany()).map((r) => [r.key, r]));
}
