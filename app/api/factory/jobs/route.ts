import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inScope, socialScope } from "@/lib/access";
import { jobBrands } from "@/lib/factory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const scope = await socialScope();
  if (!scope) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const days = Number(new URL(req.url).searchParams.get("days") || 30);
  const since = new Date(Date.now() - days * 864e5);
  const rows = await prisma.factoryJob.findMany({
    where: { at: { gte: since } },
    orderBy: { at: "desc" },
    take: 500,
  });

  // Чей заказ — видно по аккаунту публикации, как и в Соц.Сетях. Считаем на
  // показе, а не на приёме: тогда и то, что уже накоплено, встаёт по местам
  // без разметки задним числом.
  const brands = jobBrands(rows);
  const jobs = rows.map((r) => ({
    ...r,
    brand: brands.get(r.jobId) || r.brand,
    links: JSON.parse(r.links),
    at: r.at.toISOString(),
  }));
  return NextResponse.json({ jobs: inScope(jobs, scope.brands) });
}
