import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Пакетная уборка списка задач. Владельцу — по всем сотрудникам, остальным —
// только свои. what=auto — авто-напоминания по остывающим партнёрам,
// what=done — уже выполненные, what=overdue-auto — просроченные авто-задачи.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { what } = (await req.json().catch(() => ({}))) as { what?: string };

  const mine = session.user.role === "OWNER" ? {} : { assignedToUserId: session.user.id };
  const where: any =
    what === "auto" ? { ...mine, isAuto: true }
    : what === "done" ? { ...mine, isDone: true }
    : what === "overdue-auto" ? { ...mine, isAuto: true, isDone: false, dueDate: { lt: new Date() } }
    : null;
  if (!where) return NextResponse.json({ error: "нужен what: auto|done|overdue-auto" }, { status: 400 });

  const { count } = await prisma.task.deleteMany({ where });
  return NextResponse.json({ deleted: count });
}
