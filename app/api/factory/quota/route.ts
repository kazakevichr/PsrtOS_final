import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { earnings, quotaDays, quotaMonth } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !["OWNER", "SMM"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  // month=YYYY-MM — закрытый месяц целиком (зарплата за прошлый месяц),
  // без month — привычная лента последних дней.
  const month = url.searchParams.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const { rules, days } = await quotaMonth(month);
    return NextResponse.json({ rules, days, earnings: await earnings(month) });
  }
  const daysBack = Math.min(Number(url.searchParams.get("days") || 63), 120);
  const { rules, days } = await quotaDays(daysBack);
  return NextResponse.json({ rules, days, earnings: await earnings() });
}
