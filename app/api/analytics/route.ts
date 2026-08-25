import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { metaMap, normLink } from "@/lib/meta";
import { generateInsight, savedInsight, confidence } from "@/lib/insights";
import { notifyUser } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function role() {
  const s = await getServerSession(authOptions);
  return s && ["OWNER", "SMM"].includes(s.user.role) ? s.user.role : null;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

// Посты выбранного среза с паспортом: аккаунт (или все), давность в днях.
async function buildPosts(account: string, days: number) {
  const factory = new Set<string>();
  for (const j of await prisma.factoryJob.findMany({ select: { links: true } })) {
    for (const l of JSON.parse(j.links) as any[]) if (l?.link) factory.add(normLink(l.link));
  }
  const metas = await metaMap();
  const edge = Date.now() - days * 864e5;
  const posts: any[] = [];
  const accounts: string[] = [];
  for (const a of await prisma.igAccount.findMany({ orderBy: { username: "asc" } })) {
    if (a.igId.startsWith("bd:")) continue;
    accounts.push(a.username);
    if (account !== "all" && a.username !== account) continue;
    for (const m of JSON.parse(a.media) as any[]) {
      if (!m.timestamp || !m.permalink) continue;
      if (new Date(m.timestamp).getTime() < edge) continue;
      const key = normLink(m.permalink);
      const meta = metas.get(key) || null;
      posts.push({
        ...m,
        account: a.username,
        platform: "instagram",
        source: factory.has(key) ? "factory" : "manual",
        meta: meta && {
          origin: meta.origin, topic: meta.topic, hook: meta.hook,
          content: meta.content, cta: meta.cta, ctaWord: meta.ctaWord,
          leads: meta.leads,
        },
      });
    }
  }
  return { posts, accounts };
}

export async function GET(req: Request) {
  const r = await role();
  if (!r) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const account = url.searchParams.get("account") || "all";
  const days = Math.min(365, Number(url.searchParams.get("days")) || 30);
  const { posts, accounts } = await buildPosts(account, days);

  // Срезы по осям паспорта: медианный охват, только посты старше 72 часов.
  const mature = posts.filter(
    (p) => Date.now() - new Date(p.timestamp).getTime() > 72 * 3600e3
  );
  const slice = (axis: "content" | "hook" | "origin") => {
    const groups = new Map<string, number[]>();
    for (const p of mature) {
      const v = p.meta?.[axis];
      if (!v || v === "нет") continue;
      if (p.reach == null) continue;
      (groups.get(v) || groups.set(v, []).get(v)!).push(p.reach);
    }
    return [...groups.entries()]
      .map(([label, xs]) => ({ label, median: median(xs), n: xs.length }))
      .sort((a, b) => b.median - a.median);
  };

  // Lead-gen: заявки = комментарии с кодовым словом, группировка по словам.
  const lead = new Map<string, { posts: number; reach: number; leads: number }>();
  for (const p of posts) {
    if (p.meta?.cta !== "кодовое слово" || !p.meta.ctaWord) continue;
    if (p.meta.leads == null || p.meta.leads < 0) continue;
    const g = lead.get(p.meta.ctaWord) || { posts: 0, reach: 0, leads: 0 };
    g.posts++; g.reach += p.reach || 0; g.leads += p.meta.leads;
    lead.set(p.meta.ctaWord, g);
  }

  // Судьба рекомендаций: если задача из рекомендации закрыта — фиксируем.
  const recs = await prisma.recommendation.findMany({
    where: { status: { not: "dismissed" } },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  for (const rec of recs) {
    if (rec.status === "task" && rec.taskId) {
      const t = await prisma.task.findUnique({ where: { id: rec.taskId } });
      if (t?.isDone) {
        await prisma.recommendation.update({
          where: { id: rec.id },
          data: { status: "done", doneAt: new Date() },
        });
        rec.status = "done";
      }
    }
  }

  const labeled = posts.filter((p) => p.meta).length;
  return NextResponse.json({
    account, days, accounts,
    posts: posts.map((p) => ({
      id: p.id, caption: String(p.caption || "").slice(0, 120),
      permalink: p.permalink, thumbnail: p.thumbnail || null,
      timestamp: p.timestamp, reach: p.reach ?? null, saved: p.saved ?? null,
      source: p.source, meta: p.meta,
    })),
    stats: { total: posts.length, labeled, mature: mature.length },
    slices: { content: slice("content"), hook: slice("hook"), origin: slice("origin") },
    leadgen: [...lead.entries()]
      .map(([word, g]) => ({
        word, ...g,
        per100: g.reach ? Math.round((g.leads / g.reach) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.leads - a.leads),
    insight: await savedInsight(`neuro:${account}:${days}`),
    recommendations: recs.map((x) => ({
      id: x.id, text: x.text, status: x.status, effect: x.effect,
      createdAt: x.createdAt, doneAt: x.doneAt,
    })),
    confidenceOf: undefined,
  });
}

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s || s.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => null);

  if (b?.action === "refresh") {
    const account = b.account || "all";
    const days = Math.min(365, Number(b.days) || 30);
    const { posts } = await buildPosts(account, days);
    try {
      const insight = await generateInsight(`neuro:${account}:${days}`, posts);
      return NextResponse.json({ insight });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  if (b?.action === "task" && b.recId) {
    const rec = await prisma.recommendation.findUnique({ where: { id: b.recId } });
    const smm = await prisma.user.findFirst({ where: { role: "SMM", isActive: true } });
    if (!rec || !smm) return NextResponse.json({ error: "не найдено" }, { status: 404 });
    const task = await prisma.task.create({
      data: {
        assignedToUserId: smm.id,
        title: rec.text.slice(0, 250),
        source: "нейро-аналитика",
      },
    });
    await prisma.recommendation.update({
      where: { id: rec.id },
      data: { status: "task", taskId: task.id },
    });
    await notifyUser(smm.id, `📊 Новая задача из нейро-аналитики:\n\n${rec.text}`);
    return NextResponse.json({ ok: true });
  }

  if ((b?.action === "dismiss" || b?.action === "done") && b.recId) {
    await prisma.recommendation.update({
      where: { id: b.recId },
      data: b.action === "done"
        ? { status: "done", doneAt: new Date() }
        : { status: "dismissed" },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
