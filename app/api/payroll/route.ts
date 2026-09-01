import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMonth } from "@/lib/ledger";

export const dynamic = "force-dynamic";

async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER" ? s : null;
}

// Начисление за месяц заводится руками: состав команды меняется чаще, чем
// формула, и последнее слово всегда за владельцем.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json();
  const total = Number(b.total);
  if (!Number.isFinite(total) || total < 0) {
    return NextResponse.json({ error: "Сумма должна быть числом от нуля" }, { status: 400 });
  }
  if (!b.userId || !isMonth(b.month)) {
    return NextResponse.json({ error: "Нужны сотрудник и месяц" }, { status: 400 });
  }
  const data = { totalAmount: total, note: String(b.note || "").trim() };
  const record = await prisma.payrollRecord.upsert({
    where: { userId_month: { userId: b.userId, month: b.month } },
    create: { userId: b.userId, month: b.month, ...data },
    update: data,
  });
  return NextResponse.json(record);
}

// Отметка выплаты: именно по этой дате начисление попадает в расходы месяца.
export async function PATCH(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: "Нет id" }, { status: 400 });
  const paidAt = b.paidAt ? new Date(`${b.paidAt}T12:00:00Z`) : null;
  if (paidAt && Number.isNaN(paidAt.getTime())) {
    return NextResponse.json({ error: "Дата не разобралась" }, { status: 400 });
  }
  const record = await prisma.payrollRecord.update({
    where: { id: b.id },
    data: { paidAt },
  });
  return NextResponse.json(record);
}
