import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calcOwnerProfit, calcPartnerPayout } from "@/lib/economics";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { date, revenueAmount, note } = await req.json();

  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: { project: true },
  });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ownerProfitAmount = calcOwnerProfit(Number(revenueAmount), partner.project);
  const partnerPayoutAmount = calcPartnerPayout(Number(revenueAmount), ownerProfitAmount);
  const txDate = date ? new Date(date) : new Date();

  const transaction = await prisma.transaction.create({
    data: {
      partnerId: params.id,
      date: txDate,
      revenueAmount: Number(revenueAmount),
      ownerProfitAmount,
      partnerPayoutAmount,
      note: note || null,
      createdByUserId: session.user.id,
    },
  });

  const updateData: any = { lastSaleDate: txDate };
  if (!partner.firstSaleDate) updateData.firstSaleDate = txDate;
  await prisma.partner.update({ where: { id: params.id }, data: updateData });

  return NextResponse.json(transaction);
}
