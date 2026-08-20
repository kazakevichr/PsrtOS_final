import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { botConfigured, tgCall, webhookSecret } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function owner() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "OWNER";
}

const appUrl = (req: Request) =>
  (process.env.NEXTAUTH_URL || `https://${req.headers.get("host")}`).replace(/\/$/, "");

// Состояние бота: подключён ли вебхук, кто он такой.
export async function GET(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!botConfigured()) return NextResponse.json({ configured: false });
  const [me, hook] = await Promise.all([tgCall("getMe", {}), tgCall("getWebhookInfo", {})]);
  return NextResponse.json({
    configured: true,
    bot: me?.result?.username || null,
    webhook: hook?.result?.url || null,
    expected: `${appUrl(req)}/api/tg/webhook`,
    pending: hook?.result?.pending_update_count ?? null,
    lastError: hook?.result?.last_error_message || null,
  });
}

// Подключить бота к этому сайту (setWebhook). Токен берётся из env.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!botConfigured()) return NextResponse.json({ error: "нет TELEGRAM_BOT_TOKEN в окружении" }, { status: 400 });
  const secret = webhookSecret();
  const res = await tgCall("setWebhook", {
    url: `${appUrl(req)}/api/tg/webhook`,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
    ...(secret ? { secret_token: secret } : {}),
  });
  if (!res?.ok) return NextResponse.json({ error: res?.description || "Телеграм отказал" }, { status: 400 });
  return NextResponse.json({ ok: true, secured: Boolean(secret) });
}
