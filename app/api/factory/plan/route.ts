import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Завод спрашивает тему дня: GET ?date=YYYY-MM-DD&slot=make
// Авторизация — общим ключом завода (X-Factory-Key == IG_HOST_KEY).
export async function GET(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || "";
  const slot = url.searchParams.get("slot") || "";
  const row = await prisma.planSlot.findUnique({ where: { date_slot: { date, slot } } });
  if (!row || !row.topic.trim()) return NextResponse.json({});
  return NextResponse.json({ topic: row.topic, facts: row.facts });
}
