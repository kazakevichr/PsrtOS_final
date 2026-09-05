import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SMM_ROLES } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !SMM_ROLES.includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const days = Number(new URL(req.url).searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 864e5);
  const rows = await prisma.factoryJob.findMany({
    where: { at: { gte: since } },
    orderBy: { at: "desc" },
    take: 500,
  });
  return NextResponse.json({
    jobs: rows.map((r) => ({ ...r, links: JSON.parse(r.links), at: r.at.toISOString() })),
  });
}
