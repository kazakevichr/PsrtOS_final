import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generateInsight, savedInsight } from "@/lib/insights";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function owner() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "OWNER";
}

// Читать сохранённый анализ может и СММ; запускать новый — только владелец.
async function viewer() {
  const session = await getServerSession(authOptions);
  return session && ["OWNER", "SMM"].includes(session.user.role);
}

export async function GET(req: Request) {
  if (!(await viewer())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scope = new URL(req.url).searchParams.get("scope") || "";
  return NextResponse.json({ insight: await savedInsight(scope) });
}

// Тело: { scope, posts } — фронт уже держит отфильтрованные посты среза,
// гонять их второй раз через все выборки сервера нет смысла.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.scope || !Array.isArray(b.posts)) {
    return NextResponse.json({ error: "scope и posts обязательны" }, { status: 400 });
  }
  try {
    return NextResponse.json({ insight: await generateInsight(b.scope, b.posts) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
