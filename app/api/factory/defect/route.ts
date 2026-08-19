import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Роман помечает браком уже вышедший пост: запись получает событие «брак»
// (журнал и статистика), а пометка ложится в FactoryDefect — очередь для
// завода, который подмешает комментарий в промпты следующих выпусков.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const job = await prisma.factoryJob.findUnique({ where: { jobId: b.job_id } });
  if (!job) return NextResponse.json({ error: "заказ не найден" }, { status: 404 });

  const comment = String(b.comment || "").slice(0, 1000);
  await prisma.factoryJob.update({
    where: { jobId: b.job_id },
    data: { event: "брак", error: comment },
  });
  await prisma.factoryDefect.create({ data: { jobId: b.job_id, comment } });
  return NextResponse.json({ ok: true });
}
