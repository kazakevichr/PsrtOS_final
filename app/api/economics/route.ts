import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FX_KEY, isMonth, monthMoney } from "@/lib/ledger";

export const dynamic = "force-dynamic";

async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER" ? s : null;
}

export async function GET(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = new URL(req.url).searchParams.get("month") || "";
  const month = isMonth(raw) ? raw : new Date().toISOString().slice(0, 7);
  return NextResponse.json(await monthMoney(month));
}

// Курс доллара: одна настройка на всю бухгалтерию.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const fx = Number(body.fx);
  if (!Number.isFinite(fx) || fx <= 0) {
    return NextResponse.json({ error: "Курс должен быть числом больше нуля" }, { status: 400 });
  }
  await prisma.setting.upsert({
    where: { key: FX_KEY },
    create: { key: FX_KEY, value: String(fx) },
    update: { value: String(fx) },
  });
  return NextResponse.json({ fx });
}
