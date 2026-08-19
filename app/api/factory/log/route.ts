import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Завод докладывает жизнь заказа: создан → готов → опубликован / не принят /
// ошибка. События по одному job_id приходят по мере производства — храним
// последнюю стадию и копим ссылки на опубликованные посты.
export async function POST(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const row = await prisma.factoryJob.findUnique({ where: { jobId: b.job_id } });
  const prevLinks: any[] = row ? JSON.parse(row.links) : [];
  const freshLinks: any[] = Array.isArray(b.links) ? b.links : [];
  const seen = new Set(prevLinks.map((l) => `${l.account}|${l.link}`));
  const links = [...prevLinks, ...freshLinks.filter((l) => l && !seen.has(`${l.account}|${l.link}`))];

  const fields = {
    date: b.date ?? row?.date ?? "",
    slot: b.slot ?? row?.slot ?? "",
    kind: b.kind ?? row?.kind ?? "",
    character: b.character ?? row?.character ?? "",
    topic: b.topic ?? row?.topic ?? "",
    script: String(b.script ?? row?.script ?? "").slice(0, 3000),
    event: b.event ?? row?.event ?? "",
    links: JSON.stringify(links),
    error: b.error ?? row?.error ?? "",
    onDemand: Boolean(b.on_demand ?? row?.onDemand ?? false),
    cost: Number(b.cost ?? row?.cost ?? 0) || 0,
    at: b.at ? new Date(b.at) : row?.at ?? new Date(),
  };
  await prisma.factoryJob.upsert({
    where: { jobId: b.job_id },
    create: { jobId: b.job_id, ...fields },
    update: fields,
  });
  return NextResponse.json({ ok: true });
}
