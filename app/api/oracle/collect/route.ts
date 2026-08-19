import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runOracleCollect } from "@/lib/oracle";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = process.env.IG_HOST_KEY;
  const byKey = key && req.headers.get("x-factory-key") === key;
  if (!byKey) {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "OWNER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  return NextResponse.json(await runOracleCollect());
}
