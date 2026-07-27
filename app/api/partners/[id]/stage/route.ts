import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SALES_STAGE = "Есть продажи";
const WORKING_STAGE = "Работает";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { toStage, adCreativeUrl } = await req.json();

  const partner = await prisma.partner.findUnique({
    where: { id: params.id },
    include: { project: true },
  });
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (toStage === SALES_STAGE && session.user.role !== "OWNER") {
    return NextResponse.json(
      { error: "Перевод в стадию «Есть продажи» доступен только владельцу." },
      { status: 403 }
    );
  }

  if (toStage === WORKING_STAGE && !partner.adCreativeUrl && !adCreativeUrl) {
    return NextResponse.json(
      { error: "Нужна ссылка/скриншот, что партнёр выложил рекламу, прежде чем перевести в «Работает»." },
      { status: 400 }
    );
  }

  const data: any = { stage: toStage };
  if (toStage === WORKING_STAGE && adCreativeUrl && !partner.adCreativeUrl) {
    data.adCreativeUrl = adCreativeUrl;
  }

  if (toStage === partner.project.kpiTriggerStage && !partner.connectedDate) {
    data.connectedDate = new Date();
  }

  const updated = await prisma.partner.update({ where: { id: params.id }, data });

  await prisma.stageHistory.create({
    data: {
      partnerId: partner.id,
      fromStage: partner.stage,
      toStage,
      changedByUserId: session.user.id,
    },
  });

  // Начисление KPI один раз, при первом достижении целевой стадии
  if (toStage === partner.project.kpiTriggerStage && partner.project.kpiEnabled && !partner.kpiPaid) {
    await prisma.partner.update({ where: { id: params.id }, data: { kpiPaid: true } });
  }

  return NextResponse.json(updated);
}
