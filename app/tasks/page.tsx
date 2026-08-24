import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TaskList from "@/components/TaskList";
import { ensureAutoTasksForUser } from "@/lib/autoTasks";

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  if (session.user.role === "MANAGER") {
    await ensureAutoTasksForUser(session.user.id);
  } else {
    const managers = await prisma.user.findMany({ where: { role: "MANAGER", isActive: true }, select: { id: true } });
    await Promise.all(managers.map((m) => ensureAutoTasksForUser(m.id)));
  }

  const where: any = {};
  if (session.user.role === "MANAGER") where.assignedToUserId = session.user.id;

  const tasksRaw = await prisma.task.findMany({
    where,
    include: { assignedTo: true, partner: true },
    orderBy: [{ isDone: "asc" }, { dueDate: "asc" }],
  });

  const tasks = tasksRaw.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    isDone: t.isDone,
    isAuto: t.isAuto,
    source: t.source,
    assignedTo: { name: t.assignedTo.name },
    partner: t.partner ? { id: t.partner.id, name: t.partner.name } : null,
  }));

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Задачи</h1>
      <TaskList tasks={tasks} />
    </div>
  );
}
