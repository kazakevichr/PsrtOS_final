import { NextResponse } from "next/server";
import { backfillFactoryMeta, labelBatch, labelVisualBatch, countLeads } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Плановый прогон разметки: архив завода из журнала, нейро-разметка ручных,
// подсчёт заявок по кодовым словам. Дёргается инструментацией раз в час.
export async function POST(req: Request) {
  if (req.headers.get("x-factory-key") !== process.env.IG_HOST_KEY) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const backfilled = await backfillFactoryMeta();
  const label = await labelBatch(12);
  const visual = await labelVisualBatch(8);
  const leads = await countLeads(10);
  return NextResponse.json({ backfilled, ...label, ...visual, ...leads });
}
