import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { factoryAuth } from "@/lib/factory";

export const dynamic = "force-dynamic";

// Завод спрашивает тему дня: GET ?date=YYYY-MM-DD&slot=make
// Ключ говорит не только «свой», но и «чей»: у каждого завода свой план.
export async function GET(req: Request) {
  const brand = factoryAuth(req);
  if (!brand) return new NextResponse("forbidden", { status: 403 });
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const slot = url.searchParams.get("slot") || "";
  const row = await prisma.planSlot.findUnique({
    where: { brand_date_slot: { brand, date, slot } },
  });
  if (!row || !row.topic.trim()) return NextResponse.json({});
  return NextResponse.json({ topic: row.topic, facts: row.facts });
}
