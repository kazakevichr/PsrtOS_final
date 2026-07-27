import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const where: any = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (session.user.role === "MANAGER") where.responsibleUserId = session.user.id;

  const partners = await prisma.partner.findMany({
    where,
    include: { project: true, partnerType: true, responsible: true, transactions: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(partners);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const project = await prisma.project.findUnique({ where: { id: body.projectId } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const stages = JSON.parse(project.funnelStages) as string[];
  const responsibleUserId =
    session.user.role === "OWNER" && body.responsibleUserId
      ? body.responsibleUserId
      : session.user.id;

  const partner = await prisma.partner.create({
    data: {
      projectId: body.projectId,
      partnerTypeId: body.partnerTypeId || null,
      name: body.name,
      instagram: body.instagram || null,
      telegram: body.telegram || null,
      phone: body.phone || null,
      responsibleUserId,
      stage: stages[0],
      firstContactDate: new Date(),
    },
  });

  await prisma.stageHistory.create({
    data: {
      partnerId: partner.id,
      fromStage: null,
      toStage: stages[0],
      changedByUserId: session.user.id,
    },
  });

  return NextResponse.json(partner);
}
