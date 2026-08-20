import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { newLinkCode, botUsername } from "@/lib/telegram";

export const dynamic = "force-dynamic";

async function owner() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "OWNER";
}

// Владелец выдаёт сотруднику одноразовую ссылку для привязки Телеграма.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const code = newLinkCode();
  const user = await prisma.user.update({
    where: { id: b.userId },
    data: { tgLinkCode: code, tgChatId: null, tgUsername: null },
  });
  const bot = botUsername();
  return NextResponse.json({ name: user.name, link: `https://t.me/${bot}?start=${code}` });
}

// Отвязать Телеграм сотрудника.
export async function DELETE(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { tgChatId: null, tgUsername: null, tgLinkCode: null } });
  return NextResponse.json({ ok: true });
}
