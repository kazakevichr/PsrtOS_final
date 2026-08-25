import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normLink, KIND_ORIGIN } from "@/lib/meta";

export const dynamic = "force-dynamic";

const byKey = (req: Request) =>
  req.headers.get("x-factory-key") === process.env.IG_HOST_KEY;

// Завод присылает паспорт поста при публикации: он единственный, кто точно
// знает тип, тему, хук и призыв своего контента.
export async function POST(req: Request) {
  if (!byKey(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  const link = b?.permalink || b?.link;
  if (!link) return NextResponse.json({ error: "permalink required" }, { status: 400 });
  const key = normLink(String(link));
  const fields = {
    source: "factory",
    labeledBy: "factory",
    origin: String(b.origin || KIND_ORIGIN[b.kind] || b.kind || ""),
    topic: String(b.topic || "").slice(0, 120),
    format: String(b.format || (b.kind === "carousel" ? "карусель" : "видео")),
    hook: String(b.hook || ""),
    content: String(b.content || ""),
    cta: String(b.cta || ""),
    ctaWord: String(b.ctaWord || "").slice(0, 25).toUpperCase(),
    platform: String(b.platform || "instagram"),
  };
  const row = await prisma.contentMeta.upsert({
    where: { key },
    create: { key, ...fields },
    update: fields,
  });
  return NextResponse.json({ ok: true, key: row.key });
}

export async function GET(req: Request) {
  if (!byKey(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const total = await prisma.contentMeta.count();
  const factory = await prisma.contentMeta.count({ where: { source: "factory" } });
  return NextResponse.json({ total, factory, manual: total - factory });
}
