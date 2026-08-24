import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTo, ownerWithTg } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Утренние напоминания по задачам. Дёргает instrumentation по расписанию —
// через HTTP, а не импортом: lib/telegram тянет node:crypto, который ломает
// edge-сборку instrumentation (та же история, что с lib/oracle и node:fs).
export async function POST(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);
  const tasks = await prisma.task.findMany({
    where: { isDone: false, dueDate: { lte: endOfToday } },
    include: { assignedTo: true },
  });
  const now = new Date();
  const overdue: string[] = [];
  for (const t of tasks) {
    const late = t.dueDate! < now;
    const line = `${late ? "🔴 просрочено" : "🟡 дедлайн сегодня"}: ${t.title}`;
    if (t.assignedTo.tgChatId) await sendTo(t.assignedTo.tgChatId, `⏰ ${line}`);
    if (late) overdue.push(`${t.title} — ${t.assignedTo.name}`);
  }
  const owner = await ownerWithTg();
  if (owner?.tgChatId && overdue.length) {
    await sendTo(owner.tgChatId, `🔴 <b>Просроченные задачи (${overdue.length})</b>\n` + overdue.join("\n"));
  }
  return NextResponse.json({ reminded: tasks.length, overdue: overdue.length });
}
