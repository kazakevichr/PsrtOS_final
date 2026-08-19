import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Завод раз в час забирает пометки брака, поставленные из Postos:
// GET ?after=<id> отдаёт только новее (id монотонный). Брак из бота сюда
// не попадает — он и так родился на стороне завода.
export async function GET(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  const rows = await prisma.factoryDefect.findMany({
    where: { id: { gt: after } },
    orderBy: { id: "asc" },
    take: 200,
  });
  const jobs = await prisma.factoryJob.findMany({
    where: { jobId: { in: rows.map((r) => r.jobId) } },
  });
  const byId = new Map(jobs.map((j) => [j.jobId, j]));
  return NextResponse.json({
    defects: rows.map((r) => {
      const j = byId.get(r.jobId);
      return {
        id: r.id,
        job_id: r.jobId,
        slot: j?.slot || "",
        kind: j?.kind || "",
        character: j?.character || "",
        topic: j?.topic || "",
        comment: r.comment,
        at: r.at.toISOString(),
      };
    }),
  });
}
