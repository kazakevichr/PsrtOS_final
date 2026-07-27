import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только владелец может добавлять типы партнёров." }, { status: 403 });
  }

  const { name, kpiAmount } = await req.json();
  const partnerType = await prisma.partnerType.create({
    data: { projectId: params.id, name, kpiAmount: Number(kpiAmount) || 0 },
  });
  return NextResponse.json(partnerType);
}
