import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FX_KEY, monthMoney, projectSplit, Span } from "@/lib/ledger";
import { resolvePeriod, PeriodType } from "@/lib/economics";

export const dynamic = "force-dynamic";

async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER" ? s : null;
}

export async function GET(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const type = (["day", "week", "month"].includes(q.get("period") || "")
    ? q.get("period")
    : "month") as PeriodType;
  const span: Span = { ...resolvePeriod(type, q.get("anchor") || undefined), type };
  const project = q.get("project") || undefined;

  const [money, split, projects] = await Promise.all([
    monthMoney(span, project),
    // Сводка нужна только на экране «Все направления».
    project ? Promise.resolve(null) : projectSplit(span),
    prisma.project.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return NextResponse.json({ ...money, split, projects });
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
