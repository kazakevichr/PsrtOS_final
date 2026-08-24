import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/economics";
import { notifyUser } from "@/lib/telegram";

// Пауза на партнёра после ручного удаления или закрытия напоминания. Без неё
// напоминание возвращалось мгновенно: удалил — страница перезагрузилась —
// создалось заново, и задача «падала вниз» с новой датой.
export const AUTO_MUTE_DAYS = 7;

export const muteKey = (partnerId: string) => `automute:${partnerId}`;

export async function muteAutoTask(partnerId: string, days = AUTO_MUTE_DAYS) {
  const until = new Date(Date.now() + days * 864e5).toISOString();
  await prisma.setting.upsert({
    where: { key: muteKey(partnerId) },
    create: { key: muteKey(partnerId), value: until },
    update: { value: until },
  });
}

/**
 * Проверяет активных партнёров сотрудника и создаёт задачу-напоминание, если
 * партнёр «пожелтел» или «покраснел». Напоминание не создаётся, если по
 * партнёру уже есть открытое, если оно закрывалось или удалялось в последние
 * AUTO_MUTE_DAYS дней. Вызывается при заходе на страницу задач.
 */
export async function ensureAutoTasksForUser(userId: string) {
  const partners = await prisma.partner.findMany({
    where: { responsibleUserId: userId, status: "ACTIVE" },
    include: { project: true },
  });
  if (!partners.length) return;

  const recentEdge = new Date(Date.now() - AUTO_MUTE_DAYS * 864e5);
  const recentAuto = await prisma.task.findMany({
    where: {
      assignedToUserId: userId,
      isAuto: true,
      OR: [{ isDone: false }, { createdAt: { gte: recentEdge } }],
    },
    select: { partnerId: true },
  });
  const skip = new Set(recentAuto.map((t) => t.partnerId));

  const mutes = await prisma.setting.findMany({
    where: { key: { in: partners.map((p) => muteKey(p.id)) } },
  });
  const now = Date.now();
  for (const m of mutes) {
    if (new Date(m.value).getTime() > now) skip.add(m.key.replace("automute:", ""));
  }

  for (const partner of partners) {
    const health = computeHealth(partner, partner.project);
    if (health === "GREEN") continue;
    if (skip.has(partner.id)) continue;

    const label = health === "RED" ? "давно нет активности — под угрозой оттока" : "пора написать, начинает остывать";
    const title = `${partner.name} (${partner.project.name}): ${label}`;
    await prisma.task.create({
      data: {
        assignedToUserId: userId,
        partnerId: partner.id,
        title,
        dueDate: new Date(),
        isAuto: true,
      },
    });
    void notifyUser(userId, `⏰ <b>Партнёр требует внимания</b>\n${title}`);
  }
}
