import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Span, daysSpan, rangeSpan } from "@/lib/ledger";
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
  const isDate = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const n = /^(\d+)d$/.exec(String(b.period || ""));
  const span: Span = isDate(b.from) && isDate(b.to)
    ? rangeSpan(b.from, b.to)
    : n
    ? daysSpan(Number(n[1]), Math.max(0, Number(b.back || 0)))
    : (() => {
        const type = (["day", "week", "month"].includes(b.period) ? b.period : "month") as PeriodType;
        return { ...resolvePeriod(type, b.anchor), type };
      })();
  try {
    return NextResponse.json({ period: span.label, results: await syncIncome(span) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Не получилось обновить" }, { status: 500 });
  }
}
