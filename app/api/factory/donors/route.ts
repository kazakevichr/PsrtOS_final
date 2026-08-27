import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { donors } from "@/lib/routes";

export const dynamic = "force-dynamic";

const byKey = (req: Request) =>
  req.headers.get("x-factory-key") === process.env.IG_HOST_KEY;

// Repost-завод регистрирует своих доноров: матрица маршрутов раскрывает
// «Нарезки» по этому списку, новый донор появляется без деплоя.
export async function POST(req: Request) {
  if (!byKey(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!Array.isArray(b?.donors)) {
    return NextResponse.json({ error: "donors: [{key, label}] required" }, { status: 400 });
  }
  const list = b.donors
    .filter((d: any) => d?.key && /^[a-z0-9_-]{2,30}$/.test(String(d.key)))
    .map((d: any) => ({
      key: String(d.key),
      label: String(d.label || d.key).slice(0, 40),
      // manual — донора выкладывает человек: время публикации в матрице
      // показываем, но помечаем, что применит его не завод.
      ...(d.manual ? { manual: true } : {}),
    }));
  await prisma.setting.upsert({
    where: { key: "repost:donors" },
    create: { key: "repost:donors", value: JSON.stringify(list) },
    update: { value: JSON.stringify(list) },
  });
  return NextResponse.json({ ok: true, donors: list });
}

export async function GET(req: Request) {
  if (!byKey(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ donors: await donors() });
}
