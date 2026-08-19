// Инста-аналитика: сбор статистики аккаунтов через Graph API и чтение для
// дашборда. Перенос netlify/functions/_meta.js из insta-hq: хранилище вместо
// Netlify Blobs — таблица IgAccount, доступ вместо DASH_KEY — сессия NextAuth.
import { prisma } from "@/lib/prisma";

const G = "https://graph.facebook.com/v23.0";

export function brandMap(): Record<string, string[]> {
  try {
    return JSON.parse(process.env.BRAND_MAP || "{}");
  } catch {
    return {};
  }
}

export function brandNames(): string[] {
  return [...Object.keys(brandMap()), "other"];
}

function brandFor(username: string): string {
  const u = (username || "").toLowerCase();
  for (const [brand, users] of Object.entries(brandMap())) {
    if ((users || []).some((x) => x.toLowerCase().replace(/^@/, "") === u)) return brand;
  }
  return "other";
}

async function gfetch(url: string | URL) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function gget(path: string, params: Record<string, string>, token: string) {
  const url = new URL(`${G}/${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return gfetch(url);
}

// IG-аккаунты, назначенные системному пользователю напрямую (META_IG_IDS через
// запятую); запасной путь — через страницы Facebook (me/accounts)
async function discoverAccounts(token: string, errors: string[] = []) {
  const accounts: any[] = [];
  const ids = (process.env.META_IG_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

  if (ids.length) {
    for (const id of ids) {
      // Один недоступный аккаунт (отвязали в Business Manager, ограничение
      // Меты) не должен хоронить сбор по остальным: 19.08 ровно так пропал
      // весь сбор из-за одного superfit24_training.
      try {
        const ig = await gget(id, {
          fields: "id,username,followers_count,media_count,profile_picture_url",
        }, token);
        accounts.push({
          igId: ig.id,
          username: ig.username,
          followers: ig.followers_count,
          mediaCount: ig.media_count,
          avatar: ig.profile_picture_url,
        });
      } catch (e: any) {
        errors.push(`${id}: ${e.message}`);
      }
    }
    return accounts;
  }

  let data = await gget("me/accounts", {
    fields: "name,instagram_business_account{id,username,followers_count,media_count,profile_picture_url}",
    limit: "50",
  }, token);
  while (data) {
    for (const page of data.data || []) {
      const ig = page.instagram_business_account;
      if (!ig) continue;
      accounts.push({
        pageId: page.id,
        pageName: page.name,
        igId: ig.id,
        username: ig.username,
        followers: ig.followers_count,
        mediaCount: ig.media_count,
        avatar: ig.profile_picture_url,
      });
    }
    data = data.paging?.next ? await gfetch(data.paging.next) : null;
  }
  return accounts;
}

// Дневные метрики аккаунта; каждая группа — отдельный запрос, падение одной
// не валит сбор
async function accountInsights(igId: string, token: string) {
  const out: Record<string, number | null> = {};
  try {
    const r = await gget(`${igId}/insights`, { metric: "reach", period: "day" }, token);
    out.reach = r.data?.[0]?.values?.at(-1)?.value ?? null;
  } catch {}
  try {
    const r = await gget(`${igId}/insights`, {
      metric: "views,profile_views,accounts_engaged",
      metric_type: "total_value",
      period: "day",
    }, token);
    for (const m of r.data || []) out[m.name] = m.total_value?.value ?? null;
  } catch {}
  return out;
}

function normalizeInsights(insights: any) {
  const out: Record<string, number | null> = {};
  for (const m of insights?.data || []) {
    out[m.name] = m.values?.[0]?.value ?? m.total_value?.value ?? null;
  }
  return out;
}

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url";
const MEDIA_METRICS = "views,reach,shares,saved,total_interactions";

async function mediaWithInsights(igId: string, token: string, limit = 25) {
  let items: any[];
  try {
    const r = await gget(`${igId}/media`, {
      fields: `${MEDIA_FIELDS},insights.metric(${MEDIA_METRICS})`,
      limit: String(limit),
    }, token);
    items = (r.data || []).map((m: any) => ({ ...m, insights: normalizeInsights(m.insights) }));
  } catch {
    // Инлайновые insights падают на отдельных типах медиа — добираем по одному
    const r = await gget(`${igId}/media`, { fields: MEDIA_FIELDS, limit: String(limit) }, token);
    items = [];
    for (const m of r.data || []) {
      let insights = {};
      try {
        const ir = await gget(`${m.id}/insights`, { metric: MEDIA_METRICS }, token);
        insights = normalizeInsights(ir);
      } catch {
        try {
          const ir = await gget(`${m.id}/insights`, { metric: "views,reach" }, token);
          insights = normalizeInsights(ir);
        } catch {}
      }
      items.push({ ...m, insights });
    }
  }
  return items.map((m) => ({
    id: m.id,
    caption: (m.caption || "").slice(0, 140),
    type: m.media_product_type || m.media_type,
    timestamp: m.timestamp,
    permalink: m.permalink,
    thumbnail: m.thumbnail_url || m.media_url || null,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
    ...m.insights,
  }));
}

function mergeMedia(prev: any[], fresh: any[]) {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()]
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
    .slice(0, 200);
}

export async function runCollect() {
  const date = new Date().toISOString().slice(0, 10);
  const token = process.env.META_TOKEN;
  const summary = { date, accounts: 0, errors: [] as string[] };
  if (!token) {
    summary.errors.push("META_TOKEN не задан");
    return summary;
  }

  let accounts: any[] = [];
  try {
    accounts = await discoverAccounts(token, summary.errors);
  } catch (e: any) {
    summary.errors.push(`discover: ${e.message}`);
  }

  for (const acc of accounts) {
    const brand = brandFor(acc.username);
    try {
      const ins = await accountInsights(acc.igId, token);
      const media = await mediaWithInsights(acc.igId, token);
      const row = await prisma.igAccount.findUnique({ where: { igId: acc.igId } });
      let history: any[] = row ? JSON.parse(row.history) : [];
      const prevMedia: any[] = row ? JSON.parse(row.media) : [];
      history = history.filter((h) => h.date !== date);
      history.push({ date, followers: acc.followers, ...ins });
      history = history.slice(-365);
      const merged = mergeMedia(prevMedia, media);
      const fields = {
        username: acc.username,
        brand,
        profile: JSON.stringify(acc),
        history: JSON.stringify(history),
        media: JSON.stringify(merged),
      };
      // Упавший аккаунт в базу не пишется вовсе — в Netlify-версии он попадал
      // в индекс даже после ошибки и чтение его отфильтровывало.
      await prisma.igAccount.upsert({
        where: { igId: acc.igId },
        create: { igId: acc.igId, ...fields },
        update: fields,
      });
      summary.accounts++;
    } catch (e: any) {
      summary.errors.push(`${acc.username}: ${e.message}`);
    }
  }
  return summary;
}

export async function statsForBrand(brand: string) {
  const rows = await prisma.igAccount.findMany({
    where: { brand },
    orderBy: { username: "asc" },
  });
  return {
    brand,
    accounts: rows.map((r) => ({
      profile: JSON.parse(r.profile),
      history: JSON.parse(r.history),
      media: JSON.parse(r.media),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
