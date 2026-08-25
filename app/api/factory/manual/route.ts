import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brandFor } from "@/lib/insta";

export const dynamic = "force-dynamic";

// Ручные публикации: посты, которых нет в журнале завода. Заводские узнаём по
// ссылке — событие «опубликован» несёт permalink, поэтому деление точное и не
// зависит от аккаунта.
const norm = (u: string) =>
  (u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("?")[0].replace(/\/$/, "");

const VIDEO = ["REELS", "VIDEO", "CLIPS"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !["OWNER", "SMM"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const days = Number(new URL(req.url).searchParams.get("days") || 60);
  const edge = new Date(Date.now() - days * 864e5).toISOString();

  const factoryLinks = new Set<string>();
  for (const j of await prisma.factoryJob.findMany({ select: { links: true } })) {
    for (const l of JSON.parse(j.links) as any[]) if (l?.link) factoryLinks.add(norm(l.link));
  }
  const mirrored = await prisma.mirrorLog.findMany();
  const mirroredBy = (platform: string) =>
    new Set(mirrored.filter((m) => m.platform === platform).map((m) => norm(m.permalink)));
  const inYt = mirroredBy("youtube");
  const inTt = mirroredBy("tiktok");

  const rows: any[] = [];
  for (const acc of await prisma.igAccount.findMany()) {
    // Партнёрские страницы Лео (business_discovery) — не наша ручная работа:
    // они живут только в норме СММ.
    if (acc.igId.startsWith("bd:")) continue;
    const media: any[] = JSON.parse(acc.media);
    for (const m of media) {
      if (!m.timestamp || m.timestamp < edge) continue;
      if (factoryLinks.has(norm(m.permalink))) continue;
      rows.push({
        account: acc.username,
        brand: brandFor(acc.username),
        type: String(m.type || "").toUpperCase(),
        video: VIDEO.includes(String(m.type || "").toUpperCase()),
        views: m.views ?? 0,
        likes: m.likes ?? 0,
        timestamp: m.timestamp,
        permalink: m.permalink,
        onYoutube: inYt.has(norm(m.permalink)),
        onTiktok: inTt.has(norm(m.permalink)),
      });
    }
  }

  const byAccount: Record<string, any> = {};
  for (const r of rows) {
    const a = (byAccount[r.account] ||= {
      account: r.account, brand: r.brand, total: 0, video: 0, views: 0, likes: 0, youtube: 0, tiktok: 0,
    });
    a.total++;
    if (r.video) a.video++;
    a.views += r.views;
    a.likes += r.likes;
    if (r.onYoutube) a.youtube++;
    if (r.onTiktok) a.tiktok++;
  }

  return NextResponse.json({
    days,
    total: rows.length,
    video: rows.filter((r) => r.video).length,
    views: rows.reduce((s, r) => s + r.views, 0),
    mirroredYoutube: rows.filter((r) => r.onYoutube).length,
    mirroredTiktok: rows.filter((r) => r.onTiktok).length,
    accounts: Object.values(byAccount).sort((a: any, b: any) => b.total - a.total),
    latest: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10),
  });
}
