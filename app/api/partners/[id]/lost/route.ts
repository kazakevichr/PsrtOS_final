import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { lostReason, retryReminderDate } = await req.json();

  const partner = await prisma.partner.update({
    where: { id: params.id },
    data: {
      status: "LOST",
      stage: "Неактивный",
      lostReason,
      lostAt: new Date(),
      retryReminderDate: retryReminderDate ? new Date(retryReminderDate) : null,
    },
  });

  await prisma.stageHistory.create({
    data: {
      partnerId: partner.id,
      fromStage: partner.stage,
      toStage: "Неактивный",
      changedByUserId: session.user.id,
    },
  });

  return NextResponse.json(partner);
}
