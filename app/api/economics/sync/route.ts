import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isMonth } from "@/lib/ledger";
import { syncIncome } from "@/lib/income";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s || s.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const b = await req.json().catch(() => ({}));
  const month = isMonth(b.month) ? b.month : new Date().toISOString().slice(0, 7);
  try {
    return NextResponse.json({ month, results: await syncIncome(month) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Не получилось обновить" }, { status: 500 });
  }
}
