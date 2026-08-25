import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { QUOTA, QUOTA_ACCOUNT, quotaDays, summarize } from "@/lib/quota";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !["OWNER", "SMM"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const days = await quotaDays(Number(new URL(req.url).searchParams.get("days") || 14));
  return NextResponse.json({ quota: QUOTA, account: QUOTA_ACCOUNT, days, summary: summarize(days) });
}
