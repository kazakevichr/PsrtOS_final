import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveSignup, rejectSignup } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function owner() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "OWNER";
}

// Очередь заявок из бота — видит и решает только владелец.
export async function GET() {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.tgSignup.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ signups: rows });
}

export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const res = b.action === "reject"
    ? await rejectSignup(b.id)
    : await approveSignup(b.id, b.role === "SMM" ? "SMM" : "MANAGER");
  if ((res as any).error) return NextResponse.json({ error: (res as any).error }, { status: 400 });
  return NextResponse.json({ ok: true, password: (res as any).password || null });
}
