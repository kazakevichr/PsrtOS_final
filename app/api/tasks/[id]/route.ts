import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { muteAutoTask } from "@/lib/autoTasks";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const task = await prisma.task.update({ where: { id: params.id }, data: body });
  if (task.isAuto && task.partnerId && body.isDone === true) await muteAutoTask(task.partnerId);
  return NextResponse.json(task);
}

// Удаление задачи: свою может удалить исполнитель, любую — владелец.
// Авто-задачи по остывающим партнёрам создаются заново при заходе на страницу
// задач, поэтому удаление именно их имеет смысл только вместе с работой по
// партнёру — об этом честно сказано в интерфейсе.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  if (session.user.role !== "OWNER" && task.assignedToUserId !== session.user.id) {
    return NextResponse.json({ error: "Можно удалять только свои задачи" }, { status: 403 });
  }
  await prisma.task.delete({ where: { id: params.id } });
  // Удалил авто-напоминание — значит оно не нужно ближайшую неделю.
  if (task.isAuto && task.partnerId) await muteAutoTask(task.partnerId);
  return NextResponse.json({ ok: true });
}
