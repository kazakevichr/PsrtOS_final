// Аналитика контент-завода Оракла: шесть языковых YouTube-каналов читаем
// напрямую YouTube Data API (OAuth-токены завода примонтированы с хоста,
// ORACLE_SECRETS_DIR), TikTok — через Analytics API сервиса upload-post,
// которым завод и постит (UPLOAD_POST_KEY).
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

const SECRETS = process.env.ORACLE_SECRETS_DIR || "/factory-secrets";
const UP_KEY = process.env.UPLOAD_POST_KEY || "";

function ytLangs(): string[] {
  try {
    return fs.readdirSync(SECRETS)
      .map((f) => f.match(/^yt_token_(.+)\.json$/)?.[1])
      .filter(Boolean) as string[];
  } catch {
    return [];
  }
}

// Обновление access-токена по refresh-токену завода. client_id/secret лежат
// либо в самом файле токена, либо в общем yt_client_secret.json.
async function ytAccessToken(lang: string): Promise<string> {
  const tok = JSON.parse(fs.readFileSync(path.join(SECRETS, `yt_token_${lang}.json`), "utf8"));
  let clientId = tok.client_id;
  let clientSecret = tok.client_secret;
  if (!clientId || !clientSecret) {
    const cs = JSON.parse(fs.readFileSync(path.join(SECRETS, "yt_client_secret.json"), "utf8"));
    const c = cs.installed || cs.web || {};
    clientId = clientId || c.client_id;
    clientSecret = clientSecret || c.client_secret;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tok.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const d = await r.json();
  if (!d.access_token) {
    throw new Error(`yt_${lang}: refresh не дал токен: ${JSON.stringify(d).slice(0, 150)}`);
  }
  return d.access_token;
}

async function ytApi(access: string, resource: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { authorization: `Bearer ${access}` } });
  const d = await r.json();
  if (d.error) throw new Error(`yt ${resource}: ${d.error.message}`);
  return d;
}

function mergeMedia(prev: any[], fresh: any[]) {
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of fresh) byId.set(m.id, m);
  return [...byId.values()]
    .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
    .slice(0, 200);
}

async function upsertChannel(platform: string, key: string, profile: any, snap: any, fresh: any[]) {
  const row = await prisma.oracleChannel.findUnique({ where: { platform_key: { platform, key } } });
  let history: any[] = row ? JSON.parse(row.history) : [];
  history = history.filter((h) => h.date !== snap.date);
  history.push(snap);
  history = history.slice(-365);
  const media = mergeMedia(row ? JSON.parse(row.media) : [], fresh);
  const fields = {
    profile: JSON.stringify(profile),
    history: JSON.stringify(history),
    media: JSON.stringify(media),
  };
  await prisma.oracleChannel.upsert({
    where: { platform_key: { platform, key } },
    create: { platform, key, ...fields },
    update: fields,
  });
}

async function collectYt(lang: string, date: string) {
  const access = await ytAccessToken(lang);
  const ch = await ytApi(access, "channels", { part: "snippet,statistics,contentDetails", mine: "true" });
  const c = ch.items?.[0];
  if (!c) throw new Error(`yt_${lang}: канал не найден`);

  let videos: any[] = [];
  const uploads = c.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    const pl = await ytApi(access, "playlistItems", {
      part: "contentDetails", playlistId: uploads, maxResults: "25",
    });
    const ids = (pl.items || []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
    if (ids.length) {
      const vs = await ytApi(access, "videos", { part: "snippet,statistics", id: ids.join(",") });
      videos = (vs.items || []).map((v: any) => ({
        id: v.id,
        title: v.snippet?.title || "",
        thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || null,
        timestamp: v.snippet?.publishedAt || "",
        permalink: `https://youtube.com/shorts/${v.id}`,
        views: +(v.statistics?.viewCount ?? 0),
        likes: +(v.statistics?.likeCount ?? 0),
        comments: +(v.statistics?.commentCount ?? 0),
      }));
    }
  }

  const handle = c.snippet?.customUrl || "";
  const profile = {
    title: c.snippet?.title || `yt_${lang}`,
    handle,
    avatar: c.snippet?.thumbnails?.default?.url || null,
    followers: +(c.statistics?.subscriberCount ?? 0),
    totalViews: +(c.statistics?.viewCount ?? 0),
    videoCount: +(c.statistics?.videoCount ?? 0),
    url: handle ? `https://youtube.com/${handle}` : `https://youtube.com/channel/${c.id}`,
  };
  await upsertChannel("yt", lang, profile,
    { date, followers: profile.followers, views: profile.totalViews }, videos);
}

// TikTok собираем только с профилей, где он реально подключён, — список
// профилей и их соцсети спрашиваем у upload-post, а не держим в конфиге.
async function upProfiles(): Promise<any[]> {
  const r = await fetch("https://api.upload-post.com/api/uploadposts/users", {
    headers: { authorization: `Apikey ${UP_KEY}` },
  });
  const d = await r.json();
  if (!d.success) throw new Error(`upload-post users: ${JSON.stringify(d).slice(0, 150)}`);
  return d.profiles || [];
}

async function collectTiktok(profileName: string, handle: string, avatar: string | null, date: string) {
  const r = await fetch(
    `https://api.upload-post.com/api/analytics/${encodeURIComponent(profileName)}?platforms=tiktok`,
    { headers: { authorization: `Apikey ${UP_KEY}` } },
  );
  const d = await r.json();
  const t = d.tiktok;
  if (!t || t.error) throw new Error(`${profileName}: tiktok-аналитика не пришла`);
  const profile = {
    title: `TikTok @${handle}`,
    handle,
    avatar,
    followers: t.followers ?? 0,
    videoCount: t.video_count ?? 0,
    url: `https://tiktok.com/@${handle}`,
  };
  await upsertChannel("tiktok", profileName, profile, {
    date,
    followers: t.followers ?? 0,
    views: t.impressions ?? 0,
    likes: t.likes ?? 0,
    comments: t.comments ?? 0,
    shares: t.shares ?? 0,
  }, []);
}

export async function runOracleCollect() {
  const date = new Date().toISOString().slice(0, 10);
  const summary = { date, channels: 0, errors: [] as string[] };

  for (const lang of ytLangs()) {
    try {
      await collectYt(lang, date);
      summary.channels++;
    } catch (e: any) {
      summary.errors.push(e.message);
    }
  }
  if (!ytLangs().length) summary.errors.push(`нет YouTube-токенов в ${SECRETS}`);

  if (UP_KEY) {
    try {
      for (const p of await upProfiles()) {
        const tk = p.social_accounts?.tiktok;
        if (!tk) continue;
        try {
          await collectTiktok(p.username, tk.handle || p.username, tk.social_images || null, date);
          summary.channels++;
        } catch (e: any) {
          summary.errors.push(e.message);
        }
      }
    } catch (e: any) {
      summary.errors.push(e.message);
    }
  } else {
    summary.errors.push("UPLOAD_POST_KEY не задан — TikTok пропущен");
  }
  return summary;
}

export async function oracleStats() {
  const rows = await prisma.oracleChannel.findMany({ orderBy: [{ platform: "asc" }, { key: "asc" }] });
  return {
    channels: rows.map((r) => ({
      platform: r.platform,
      key: r.key,
      profile: JSON.parse(r.profile),
      history: JSON.parse(r.history),
      media: JSON.parse(r.media),
      updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
