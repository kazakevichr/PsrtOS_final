import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { approveSignup, askOwner, rejectSignup, sendTo, tgCall, ownerWithTg, ROLE_NAME } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const HELP =
  "Я бот Dobro Inc. Через меня приходят задачи и уведомления о публикациях.\n\n" +
  "/start — заявка на доступ или привязка профиля\n/me — мой профиль";

// Апдейты от Телеграма. Регистрация только по одобрению владельца: сам факт
// написать боту доступа не даёт.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const u = await req.json().catch(() => null);
  if (!u) return NextResponse.json({ ok: true });

  try {
    if (u.callback_query) await onCallback(u.callback_query);
    else if (u.message?.text) await onMessage(u.message);
  } catch (e) {
    console.error("[tg] апдейт упал:", e);
  }
  return NextResponse.json({ ok: true });
}

async function onMessage(m: any) {
  const chatId = String(m.chat.id);
  const text = String(m.text || "").trim();
  const username = m.from?.username || null;
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || username;

  const me = await prisma.user.findFirst({ where: { tgChatId: chatId } });

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    // Привязка существующего профиля по одноразовому коду из ссылки Романа.
    if (code) {
      const user = await prisma.user.findFirst({ where: { tgLinkCode: code } });
      if (!user) {
        await sendTo(chatId, "Ссылка недействительна или уже использована. Попросите Романа выслать новую.");
        return;
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { tgChatId: chatId, tgUsername: username, tgLinkCode: null },
      });
      await sendTo(
        chatId,
        `✅ Профиль привязан: <b>${user.name}</b> (${ROLE_NAME[user.role] || "сотрудник"}).\n\n` +
          (user.role === "SMM"
            ? "Буду присылать уведомления о публикациях."
            : user.role === "MANAGER"
              ? "Буду присылать ваши задачи."
              : "Сюда буду присылать заявки сотрудников и сводки.")
      );
      return;
    }
    if (me) {
      await sendTo(chatId, `Профиль уже привязан: <b>${me.name}</b> (${ROLE_NAME[me.role] || "сотрудник"}).`);
      return;
    }
    // Новая заявка: сохраняем и спрашиваем владельца.
    const signup = await prisma.tgSignup.upsert({
      where: { chatId },
      create: { chatId, username, name, status: "pending" },
      update: { username, name, status: "pending" },
    });
    const who = `${name || "без имени"}${username ? ` (@${username})` : ""}\nchat id: <code>${chatId}</code>`;
    const asked = await askOwner(signup.id, who);
    await sendTo(
      chatId,
      asked
        ? "Заявка отправлена Роману. Как одобрит — пришлю логин и пароль сюда."
        : "Заявка сохранена, но владелец пока не привязал Телеграм. Напишите Роману напрямую."
    );
    return;
  }

  if (text.startsWith("/me")) {
    await sendTo(
      chatId,
      me
        ? `<b>${me.name}</b>\nРоль: ${ROLE_NAME[me.role] || "сотрудник"}\nEmail: <code>${me.email}</code>`
        : "Профиль не привязан. Отправьте /start."
    );
    return;
  }

  await sendTo(chatId, HELP);
}

// Кнопки одобрения нажимает только владелец.
async function onCallback(q: any) {
  const chatId = String(q.message?.chat?.id || "");
  const data = String(q.data || "");
  const owner = await ownerWithTg();
  const answer = (text: string) => tgCall("answerCallbackQuery", { callback_query_id: q.id, text });

  if (!owner || chatId !== owner.tgChatId) {
    await answer("Одобрять доступ может только владелец.");
    return;
  }

  const [action, signupId, role] = data.split(":");
  if (action === "ok" && (role === "MANAGER" || role === "SMM")) {
    const res = await approveSignup(signupId, role);
    await answer(res.error || `Одобрено: ${ROLE_NAME[role]}`);
    if (!res.error) {
      await tgCall("editMessageText", {
        chat_id: chatId,
        message_id: q.message.message_id,
        text: `${q.message.text}\n\n✅ Одобрено: ${ROLE_NAME[role]} — ${res.user?.name}`,
      });
    }
    return;
  }
  if (action === "no") {
    const res = await rejectSignup(signupId);
    await answer(res.error || "Отклонено");
    if (!res.error) {
      await tgCall("editMessageText", {
        chat_id: chatId,
        message_id: q.message.message_id,
        text: `${q.message.text}\n\n⛔ Отклонено`,
      });
    }
    return;
  }
  await answer("Не понял кнопку");
}
