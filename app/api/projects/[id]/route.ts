import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только владелец может менять настройки проекта." }, { status: 403 });
  }

  const body = await req.json();
  const allowed = [
    "currency",
    "partnerCommissionPercent",
    "ownerProfitPercent",
    "kpiEnabled",
    "kpiAmount",
    "bonusEnabled",
    "bonusPercent",
    "bonusThreshold",
    "bonusMaxAmount",
    "bonusPeriodMonths",
    "knowledgeBase",
    "funnelStages",
  ] as const;

  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key];
  }

  const project = await prisma.project.update({ where: { id: params.id }, data });
  return NextResponse.json(project);
}
