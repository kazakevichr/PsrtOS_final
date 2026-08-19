import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runCollect } from "@/lib/insta";

export const dynamic = "force-dynamic";

// Сбор идёт в рамках запроса (на несколько аккаунтов это до минуты) —
// кнопка в дашборде ждёт итог и сразу перерисовывается, без поллинга.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runCollect());
}
