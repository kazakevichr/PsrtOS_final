import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только руководитель может управлять сотрудниками" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Нельзя уволить руководителя" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: { isActive: body.isActive },
  });

  return NextResponse.json({ id: user.id, isActive: user.isActive });
}

// Полное (безвозвратное) удаление сотрудника — например, тестового аккаунта.
// В отличие от "увольнения" (isActive=false), это стирает учётную запись совсем.
// Заодно убирает всех партнёров, которые были закреплены за этим сотрудником,
// и всю их выручку/историю (каскадно по схеме БД), а также его задачи/комментарии.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только руководитель может удалять сотрудников" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Нельзя удалить руководителя" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.task.deleteMany({ where: { assignedToUserId: params.id } }),
    prisma.comment.deleteMany({ where: { userId: params.id } }),
    prisma.stageHistory.deleteMany({ where: { changedByUserId: params.id } }),
    prisma.transaction.deleteMany({ where: { createdByUserId: params.id } }),
    prisma.partner.deleteMany({ where: { responsibleUserId: params.id } }),
    prisma.payrollRecord.deleteMany({ where: { userId: params.id } }),
    prisma.user.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
