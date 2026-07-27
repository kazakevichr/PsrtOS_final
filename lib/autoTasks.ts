import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/economics";

/**
 * Проверяет активных партнёров сотрудника и автоматически создаёт задачу-напоминание,
 * если партнёр "пожелтел" или "покраснел" (нет активности) и по нему ещё нет открытой
 * автоматической задачи. Вызывается при заходе на страницу задач — дёшево и идемпотентно.
 */
export async function ensureAutoTasksForUser(userId: string) {
  const partners = await prisma.partner.findMany({
    where: { responsibleUserId: userId, status: "ACTIVE" },
    include: { project: true },
  });

  const openAutoTasks = await prisma.task.findMany({
    where: { assignedToUserId: userId, isAuto: true, isDone: false },
    select: { partnerId: true },
  });
  const partnersWithOpenAutoTask = new Set(openAutoTasks.map((t) => t.partnerId));

  for (const partner of partners) {
    const health = computeHealth(partner, partner.project);
    if (health === "GREEN") continue;
    if (partnersWithOpenAutoTask.has(partner.id)) continue;

    const label = health === "RED" ? "давно нет активности — под угрозой оттока" : "пора написать, начинает остывать";
    await prisma.task.create({
      data: {
        assignedToUserId: userId,
        partnerId: partner.id,
        title: `${partner.name} (${partner.project.name}): ${label}`,
        dueDate: new Date(),
        isAuto: true,
      },
    });
  }
}
