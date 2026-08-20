import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Бот @dobro_inc_bot: заявки на доступ, привязка профилей и пуши сотрудникам.
// Токен живёт только в env (TELEGRAM_BOT_TOKEN), в коде и в базе его нет.
// Имена с суффиксом _DOBRO — основные (у Романа в Coolify так), без суффикса
// оставлены как запасные, чтобы обе схемы работали.
const token = () => process.env.TELEGRAM_BOT_TOKEN_DOBRO || process.env.TELEGRAM_BOT_TOKEN || "";
export const botConfigured = () => Boolean(token());
export const webhookSecret = () =>
  process.env.TELEGRAM_WEBHOOK_SECRET_DOBRO || process.env.TELEGRAM_WEBHOOK_SECRET || "";
export const botUsername = () =>
  process.env.TELEGRAM_BOT_USERNAME_DOBRO || process.env.TELEGRAM_BOT_USERNAME || "dobro_inc_bot";

type Button = { text: string; callback_data: string };

export async function tgCall(method: string, payload: any): Promise<any> {
  if (!token()) return { ok: false, description: "нет TELEGRAM_BOT_TOKEN" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await r.json();
  } catch (e: any) {
    return { ok: false, description: String(e?.message || e) };
  }
}

export async function sendTo(chatId: string | number, text: string, buttons?: Button[][]) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}

// Пуши не должны ронять основной запрос — все ошибки глотаем.
export async function notifyUser(userId: string, text: string) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u?.tgChatId || !u.isActive) return false;
    await sendTo(u.tgChatId, text);
    return true;
  } catch {
    return false;
  }
}

export async function notifyRoles(roles: string[], text: string) {
  try {
    const users = await prisma.user.findMany({
      where: { role: { in: roles }, isActive: true, tgChatId: { not: null } },
    });
    await Promise.all(users.map((u) => sendTo(u.tgChatId!, text)));
    return users.length;
  } catch {
    return 0;
  }
}

export async function ownerWithTg() {
  return prisma.user.findFirst({ where: { role: "OWNER", tgChatId: { not: null } } });
}

export const newLinkCode = () => randomBytes(8).toString("hex");

export const ROLE_NAME: Record<string, string> = {
  OWNER: "владелец",
  MANAGER: "менеджер партнёров",
  SMM: "СММ",
};

// Одобрение заявки: создаёт сотрудника (или до-привязывает существующего) и
// сообщает человеку логин с паролем в личку бота.
export async function approveSignup(signupId: string, role: "MANAGER" | "SMM") {
  const s = await prisma.tgSignup.findUnique({ where: { id: signupId } });
  if (!s) return { error: "заявка не найдена" };
  if (s.status !== "pending") return { error: "заявка уже обработана" };

  const linked = await prisma.user.findFirst({ where: { tgChatId: s.chatId } });
  if (linked) {
    await prisma.tgSignup.update({ where: { id: s.id }, data: { status: "approved" } });
    return { user: linked, already: true };
  }

  const password = randomBytes(4).toString("hex");
  const passwordHash = await bcrypt.hash(password, 10);
  const base = s.username ? s.username.toLowerCase() : `tg${s.chatId}`;
  let email = `${base}@tg.dobro-inc.com`;
  if (await prisma.user.findUnique({ where: { email } })) email = `tg${s.chatId}@tg.dobro-inc.com`;

  const user = await prisma.user.create({
    data: {
      name: s.name || s.username || `Сотрудник ${s.chatId}`,
      email,
      passwordHash,
      role,
      tgChatId: s.chatId,
      tgUsername: s.username,
    },
  });
  await prisma.tgSignup.update({ where: { id: s.id }, data: { status: "approved" } });

  await sendTo(
    s.chatId,
    `✅ Доступ открыт. Ваша роль: <b>${ROLE_NAME[role]}</b>.\n\n` +
      `Вход в Postos: https://postos.dobro-inc.com\nЛогин: <code>${email}</code>\nПароль: <code>${password}</code>\n\n` +
      `Уведомления буду присылать сюда.`
  );
  return { user, password };
}

export async function rejectSignup(signupId: string) {
  const s = await prisma.tgSignup.findUnique({ where: { id: signupId } });
  if (!s || s.status !== "pending") return { error: "заявка уже обработана" };
  await prisma.tgSignup.update({ where: { id: s.id }, data: { status: "rejected" } });
  await sendTo(s.chatId, "Заявка на доступ отклонена. Если это ошибка — свяжитесь с Романом.");
  return { ok: true };
}

// Заявка владельцу с кнопками выбора роли.
export async function askOwner(signupId: string, who: string) {
  const owner = await ownerWithTg();
  if (!owner?.tgChatId) return false;
  await sendTo(
    owner.tgChatId,
    `🔔 Новая заявка на доступ\n\n${who}\n\nВыберите роль или отклоните:`,
    [
      [{ text: "✅ Менеджер партнёров", callback_data: `ok:${signupId}:MANAGER` }],
      [{ text: "✅ СММ", callback_data: `ok:${signupId}:SMM` }],
      [{ text: "⛔ Отклонить", callback_data: `no:${signupId}` }],
    ]
  );
  return true;
}
