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

  // Клетки этого дня по такому слоту. Обычно заводы ходят общим ключом, и
  // сказать по нему, кто спрашивает, нельзя — зато типы контента у них свои:
  // «shorts» бывает только у Оракла, «carousel» только у СуперФита. Поэтому
  // сначала ищем клетку своего бренда, а если слот принадлежит ровно одному
  // заводу — отдаём её и без совпадения по ключу.
  const rows = await prisma.planSlot.findMany({ where: { date, slot } });
  const row =
    rows.find((r) => r.brand === brand) ?? (rows.length === 1 ? rows[0] : null);

  if (!row || !row.topic.trim()) return NextResponse.json({});
  return NextResponse.json({ topic: row.topic, facts: row.facts });
}
