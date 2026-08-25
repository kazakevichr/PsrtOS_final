import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTo, ownerWithTg } from "@/lib/telegram";
import { CLOSE_H, CLOSE_M, QUOTA, REMIND_H, isWorkday, kratParts, quotaDays } from "@/lib/quota";

export const dynamic = "force-dynamic";

// Контроль нормы СММ. Дёргается instrumentation каждые 20 минут; сам решает,
// что пора делать: в 19:00 по Красноярску напомнить Кате, в 22:30 закрыть
// день — при недоборе сообщить владельцу и завести задачу на добор.
// Повторы отсекаются отметками в Setting, так что деплой ничего не дублирует.
export async function POST(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const { date, hour, minute, weekday } = kratParts();
  if (!isWorkday(weekday)) return NextResponse.json({ skipped: "воскресенье" });

  const days = await quotaDays(2);
  const today = days.find((d) => d.isToday);
  if (!today) return NextResponse.json({ skipped: "нет данных" });
  const lackC = Math.max(0, QUOTA.carousels - today.carousels);
  const lackV = Math.max(0, QUOTA.videos - today.videos);
  const met = lackC === 0 && lackV === 0;

  const smm = await prisma.user.findFirst({
    where: { role: "SMM", isActive: true, tgChatId: { not: null } },
  });
  const out: Record<string, any> = { date, hour, minute, met };

  const once = async (key: string) => {
    const row = await prisma.setting.findUnique({ where: { key } });
    if (row?.value === date) return false;
    await prisma.setting.upsert({
      where: { key }, create: { key, value: date }, update: { value: date },
    });
    return true;
  };

  // Напоминание за несколько часов до закрытия — только если норма не закрыта.
  if (hour >= REMIND_H && (hour < CLOSE_H || (hour === CLOSE_H && minute < CLOSE_M)) && !met) {
    if (await once("quota:remind")) {
      if (smm?.tgChatId) {
        await sendTo(smm.tgChatId,
          `⏳ <b>Норма на сегодня ещё не закрыта</b>\n` +
          `Карусели: ${today.carousels}/${QUOTA.carousels} · Видео: ${today.videos}/${QUOTA.videos}\n` +
          `День закрывается в ${CLOSE_H}:${String(CLOSE_M).padStart(2, "0")} по Красноярску.`);
        out.reminded = true;
      }
    }
  }

  // Закрытие дня.
  if (hour > CLOSE_H || (hour === CLOSE_H && minute >= CLOSE_M)) {
    if (await once("quota:close")) {
      if (met) {
        if (smm?.tgChatId) await sendTo(smm.tgChatId, `✅ Норма за ${date} закрыта. Отличная работа!`);
      } else {
        const lack = [
          lackC ? `${lackC} карусель(и)` : "",
          lackV ? `${lackV} видео` : "",
        ].filter(Boolean).join(" и ");
        const owner = await ownerWithTg();
        if (owner?.tgChatId) {
          await sendTo(owner.tgChatId,
            `🔴 <b>Норма СММ за ${date} не выполнена</b>\n` +
            `Карусели: ${today.carousels}/${QUOTA.carousels} · Видео: ${today.videos}/${QUOTA.videos}` +
            (smm ? `\nИсполнитель: ${smm.name}` : "\n⚠️ Нет активного СММ с привязанным Телеграмом"));
        }
        if (smm) {
          const task = await prisma.task.create({
            data: {
              assignedToUserId: smm.id,
              title: `Добрать норму за ${date}: ${lack} (super.fit24)`,
              dueDate: new Date(Date.now() + 864e5),
              isAuto: true,
              source: "норма СММ",
            },
          });
          if (smm.tgChatId) {
            await sendTo(smm.tgChatId,
              `🔴 <b>Норма за ${date} не закрыта</b>\nНе хватило: ${lack}.\nЗавёл задачу на добор — дедлайн завтра.`);
          }
          out.task = task.id;
        }
      }
      out.closed = true;
    }
  }
  return NextResponse.json(out);
}
