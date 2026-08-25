import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quotaRules, collabList, kratParts } from "@/lib/quota";

export const dynamic = "force-dynamic";

// Разбор дня: какие именно посты зачлись в норму (та же логика, что в
// quotaDays, но с перечислением ссылок). Для вопросов «откуда 3/2?».
export async function GET(req: Request) {
  const url = new URL(req.url);
  const byKey = req.headers.get("x-factory-key") === process.env.IG_HOST_KEY;
  if (!byKey) {
    const s = await getServerSession(authOptions);
    if (!s || !["OWNER", "SMM"].includes(s.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const date = url.searchParams.get("date") || kratParts().date;

  const norm = (u: string) =>
    (u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("?")[0].replace(/\/$/, "");
  const factory = new Set<string>();
  for (const j of await prisma.factoryJob.findMany({ select: { links: true } })) {
    for (const l of JSON.parse(j.links) as any[]) if (l?.link) factory.add(norm(l.link));
  }
  const kind = (m: any) => {
    const mt = String(m.mediaType || "").toUpperCase();
    const t = String(m.type || "").toUpperCase();
    if (mt === "CAROUSEL_ALBUM" || t === "CAROUSEL_ALBUM") return "carousels";
    if (mt === "VIDEO" || ["REELS", "VIDEO", "CLIPS"].includes(t)) return "videos";
    return "other";
  };

  const rules = await quotaRules();
  const out: any = { date, rules: {} };
  for (const r of rules) {
    const items: any[] = [];
    for (const acc of await prisma.igAccount.findMany({ where: { username: { in: r.accounts } } })) {
      for (const m of JSON.parse(acc.media) as any[]) {
        if (!m.timestamp) continue;
        if (kratParts(new Date(m.timestamp)).date !== date) continue;
        items.push({
          account: acc.username,
          kind: kind(m),
          counted: kind(m) === r.metric && !factory.has(norm(m.permalink)),
          factory: factory.has(norm(m.permalink)),
          permalink: m.permalink,
          timestamp: m.timestamp,
          caption: String(m.caption || "").slice(0, 80),
        });
      }
    }
    const collabs = (await collabList()).filter((c) => c.rule === r.key && c.date === date);
    out.rules[r.key] = {
      label: r.label,
      counted: items.filter((i) => i.counted).length + collabs.length,
      items,
      collabs,
    };
  }
  return NextResponse.json(out);
}
