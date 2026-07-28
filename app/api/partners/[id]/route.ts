import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: {
      project: true,
      partnerType: true,
      responsible: true,
      transactions: { orderBy: { date: "desc" } },
      stageHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: true } },
      comments: { orderBy: { createdAt: "desc" }, include: { user: true } },
      tasks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(partner);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const partner = await prisma.partner.update({ where: { id: params.id }, data: body });
  return NextResponse.json(partner);
}

// Полное (безвозвратное) удаление партнёра и всей связанной информации —
// транзакций/выручки, истории стадий, задач и комментариев (каскадно по схеме БД).
// Доступно только руководителю — например, чтобы убрать тестовых партнёров.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только руководитель может удалять партнёров" }, { status: 403 });
  }

  const partner = await prisma.partner.findUnique({ where: { id: params.id } });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.partner.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
