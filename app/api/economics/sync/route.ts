import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Span } from "@/lib/ledger";
import { resolvePeriod, PeriodType } from "@/lib/economics";
import { syncIncome } from "@/lib/income";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s || s.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const type = (["day", "week", "month"].includes(b.period) ? b.period : "month") as PeriodType;
  const span: Span = { ...resolvePeriod(type, b.anchor), type };
  try {
    return NextResponse.json({ period: span.label, results: await syncIncome(span) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Не получилось обновить" }, { status: 500 });
  }
}
