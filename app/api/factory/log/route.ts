import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { factoryAuth } from "@/lib/factory";
import { notifyRoles } from "@/lib/telegram";

export const dynamic = "force-dynamic";

// Завод докладывает жизнь заказа: создан → готов → опубликован / не принят /
// ошибка. События по одному job_id приходят по мере производства — храним
// последнюю стадию и копим ссылки на опубликованные посты.
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  // Кто докладывает — решает ключ: заводов больше одного, и заказы Оракла не
  // должны ложиться в журнал СуперФита.
  const brand = factoryAuth(req, b);
  if (!brand) return new NextResponse("forbidden", { status: 403 });
  if (!b?.job_id) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const row = await prisma.factoryJob.findUnique({ where: { jobId: b.job_id } });
  const prevLinks: any[] = row ? JSON.parse(row.links) : [];
  const freshLinks: any[] = Array.isArray(b.links) ? b.links : [];
  const seen = new Set(prevLinks.map((l) => `${l.account}|${l.link}`));
  const links = [...prevLinks, ...freshLinks.filter((l) => l && !seen.has(`${l.account}|${l.link}`))];

  const fields = {
    brand,
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
    seconds: Math.round(Number(b.seconds ?? row?.seconds ?? 0)) || 0,
    at: b.at ? new Date(b.at) : row?.at ?? new Date(),
  };
  await prisma.factoryJob.upsert({
    where: { jobId: b.job_id },
    create: { jobId: b.job_id, ...fields },
    update: fields,
  });

  // Факт задним числом: опубликованный заказ вписывает свою тему в пустую
  // клетку плана. Для avatar это единственный способ попасть в план (он не
  // планируется вперёд), для остальных слотов факт полезнее пустоты.
  if (fields.event === "опубликован" && fields.date && fields.slot && fields.topic) {
    const key = { brand, date: fields.date, slot: fields.slot };
    const cell = await prisma.planSlot.findUnique({ where: { brand_date_slot: key } });
    if (!cell || !cell.topic.trim()) {
      await prisma.planSlot.upsert({
        where: { brand_date_slot: key },
        create: { ...key, topic: fields.topic, facts: "" },
        update: { topic: fields.topic },
      });
    }
  }
  // Пуш в Телеграм: публикации и сбои — СММ и владельцу.
  if (fields.event === "опубликован") {
    const where = links.map((l: any) => `<a href="${l.link}">${l.account}</a>`).join(", ");
    void notifyRoles(["SMM", "OWNER"],
      `📤 <b>Опубликовано</b>${fields.kind ? ` · ${fields.kind}` : ""}\n${fields.topic || "(без темы)"}` +
      (where ? `\n${where}` : ""));
  } else if (fields.event === "ошибка" || fields.event === "не принят") {
    void notifyRoles(["SMM", "OWNER"],
      `⚠️ <b>Завод: ${fields.event}</b>${fields.kind ? ` · ${fields.kind}` : ""}\n` +
      `${fields.topic || "(без темы)"}${fields.error ? `\n${fields.error}` : ""}`);
  }
  return NextResponse.json({ ok: true });
}
