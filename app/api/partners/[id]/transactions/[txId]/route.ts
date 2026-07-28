import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcOwnerProfit, calcPartnerPayout } from "@/lib/economics";

const ALLOWED_PERIODS = ["day", "week", "month"];

export async function PATCH(req: Request, { params }: { params: { id: string; txId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только руководитель может изменять выручку и выплаты." }, { status: 403 });
  }

  const body = await req.json();
  const existing = await prisma.transaction.findUnique({ where: { id: params.txId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Простое переключение статуса выплаты партнёру (без пересчёта выручки).
  if (
    Object.prototype.hasOwnProperty.call(body, "partnerPayoutPaid") &&
    body.revenueAmount === undefined &&
    body.date === undefined
  ) {
    const transaction = await prisma.transaction.update({
      where: { id: params.txId },
      data: { partnerPayoutPaid: Boolean(body.partnerPayoutPaid) },
    });
    return NextResponse.json(transaction);
  }

  // Полное редактирование записи о выручке: пересчитываем прибыль владельца и выплату партнёру.
  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: { project: true },
  });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const revenueAmount =
    body.revenueAmount !== undefined && body.revenueAmount !== "" ? Number(body.revenueAmount) : existing.revenueAmount;
  const date = body.date ? new Date(body.date) : existing.date;
  const period = ALLOWED_PERIODS.includes(body.period) ? body.period : existing.period;
  const note = body.note !== undefined ? body.note || null : existing.note;

  const ownerProfitAmount = calcOwnerProfit(revenueAmount, partner.project);
  const partnerPayoutAmount = calcPartnerPayout(revenueAmount, ownerProfitAmount);

  const transaction = await prisma.transaction.update({
    where: { id: params.txId },
    data: {
      date,
      period,
      revenueAmount,
      ownerProfitAmount,
      partnerPayoutAmount,
      note,
      ...(Object.prototype.hasOwnProperty.call(body, "partnerPayoutPaid")
        ? { partnerPayoutPaid: Boolean(body.partnerPayoutPaid) }
        : {}),
    },
  });

  return NextResponse.json(transaction);
}
