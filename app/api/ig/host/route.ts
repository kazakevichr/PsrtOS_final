import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const KEEP_DAYS = 3;

// Временный публичный хостинг картинок для публикации каруселей.
// Graph API принимает изображения ТОЛЬКО по публичному URL (resumable-загрузка
// есть лишь у Reels). Завод постит слайд сюда, отдаёт полученный URL Мете,
// Instagram забирает копию к себе — наша живёт три дня и подчищается сама.
//
// POST + заголовок X-Host-Key (env IG_HOST_KEY) + тело-байты → {url}
// GET ?f=<id> — отдать файл; без ключа, URL с UUID не угадывается.
export async function GET(req: Request) {
  const f = new URL(req.url).searchParams.get("f") || "";
  const row = f && (await prisma.hostedImage.findUnique({ where: { id: f } }));
  if (!row) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(row.data), {
    headers: {
      "content-type": row.mime,
      "cache-control": "public, max-age=86400",
    },
  });
}

export async function POST(req: Request) {
  const need = process.env.IG_HOST_KEY;
  if (!need || req.headers.get("x-host-key") !== need) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const body = Buffer.from(await req.arrayBuffer());
  const mime = req.headers.get("content-type") || "image/png";
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.png`;
  await prisma.hostedImage.create({ data: { id, mime, data: body } });

  // Уборка попутно; сбой уборки не должен ронять загрузку.
  try {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5);
    await prisma.hostedImage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch {}

  // За TLS-терминацией origin запроса — внутренний http, а Мете нужна
  // публичная https-ссылка; NEXTAUTH_URL — как раз внешний адрес приложения.
  const base = (process.env.NEXTAUTH_URL || new URL(req.url).origin).replace(/\/$/, "");
  return NextResponse.json({ url: `${base}/api/ig/host?f=${encodeURIComponent(id)}` });
}
