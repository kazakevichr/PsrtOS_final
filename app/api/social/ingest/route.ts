import { NextResponse } from "next/server";
import { ingestChannel } from "@/lib/oracle";

export const dynamic = "force-dynamic";

// Завод присылает статистику площадок, которые Postos сам читать не может:
// TikTok СуперФита живёт на его собственном приложении, токен — у завода.
// Тот же ключ, что у остальных заводских маршрутов.
export async function POST(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-factory-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    return NextResponse.json({ ok: true, ...(await ingestChannel(body)) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
