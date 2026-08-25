import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { earnings, quotaDays } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !["OWNER", "SMM"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const daysBack = Math.min(Number(new URL(req.url).searchParams.get("days") || 63), 120);
  const { rules, days } = await quotaDays(daysBack);
  return NextResponse.json({ rules, days, earnings: await earnings() });
}
