import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/telegram";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;

  const where: any = {};
  if (session.user.role === "MANAGER") {
    where.assignedToUserId = session.user.id;
  } else if (userId) {
    where.assignedToUserId = userId;
  }

  const tasks = await prisma.task.findMany({
    where,
    include: { partner: true, assignedTo: true },
    orderBy: [{ isDone: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      assignedToUserId: body.assignedToUserId || session.user.id,
      partnerId: body.partnerId || null,
      title: body.title,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      price: body.price != null && Number.isFinite(Number(body.price)) ? Number(body.price) : null,
    },
  });

  // Пуш исполнителю: свои же задачи себе не присылаем.
  if (task.assignedToUserId !== session.user.id) {
    const due = task.dueDate ? `\nСрок: ${task.dueDate.toLocaleDateString("ru-RU")}` : "";
    void notifyUser(task.assignedToUserId, `📌 <b>Новая задача</b>\n${task.title}${due}`);
  }
  return NextResponse.json(task);
}
