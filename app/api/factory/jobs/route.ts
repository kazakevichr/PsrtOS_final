import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { socialScope } from "@/lib/access";
import { factoryBrand } from "@/lib/factory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await socialScope();
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const brand = factoryBrand(scope);
  const days = Number(new URL(req.url).searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 864e5);
  const rows = await prisma.factoryJob.findMany({
    where: { brand, at: { gte: since } },
    orderBy: { at: "desc" },
    take: 500,
  });
  return NextResponse.json({
    jobs: rows.map((r) => ({ ...r, links: JSON.parse(r.links), at: r.at.toISOString() })),
  });
}
