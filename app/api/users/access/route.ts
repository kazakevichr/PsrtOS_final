import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const LEVELS = ["view", "work", "manage"];

// Направления сотрудника. Раздаёт только владелец: право выдавать доступы
// само по себе высшее, и делить его между ролями незачем.
export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s || s.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  if (!b.userId || !b.projectId) {
    return NextResponse.json({ error: "Нужны сотрудник и направление" }, { status: 400 });
  }
  const level = LEVELS.includes(b.level) ? b.level : "work";

  if (b.remove) {
    await prisma.projectAccess.deleteMany({ where: { userId: b.userId, projectId: b.projectId } });
    return NextResponse.json({ ok: true });
  }

  const row = await prisma.projectAccess.upsert({
    where: { userId_projectId: { userId: b.userId, projectId: b.projectId } },
    create: { userId: b.userId, projectId: b.projectId, level },
    update: { level },
  });
  return NextResponse.json(row);
}
