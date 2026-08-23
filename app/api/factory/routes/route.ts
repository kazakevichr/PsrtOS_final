import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { KINDS, LOCKED, NA, PLATFORMS, allowed, blocked, routeMap } from "@/lib/routes";

export const dynamic = "force-dynamic";

async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER";
}
function byKey(req: Request) {
  const need = process.env.IG_HOST_KEY;
  return Boolean(need) && req.headers.get("x-factory-key") === need;
}

// Заводу и скриптам зеркалирования: можно ли публиковать. Владельцу — вся
// матрица для интерфейса.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const platform = u.searchParams.get("platform");
  const kind = u.searchParams.get("kind");
  if (!byKey(req) && !(await owner())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (platform && kind) {
    return NextResponse.json({ platform, kind, allowed: await allowed(platform, kind) });
  }
  return NextResponse.json({
    platforms: PLATFORMS, kinds: KINDS, na: NA, locked: LOCKED, flags: await routeMap(),
  });
}

export async function PUT(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.platform || !b?.kind || typeof b.enabled !== "boolean") {
    return NextResponse.json({ error: "нужны platform, kind, enabled" }, { status: 400 });
  }
  if (blocked(b.platform, b.kind)) {
    return NextResponse.json({ error: "это сочетание недоступно" }, { status: 400 });
  }
  await prisma.routeFlag.upsert({
    where: { platform_kind: { platform: b.platform, kind: b.kind } },
    create: { platform: b.platform, kind: b.kind, enabled: b.enabled },
    update: { enabled: b.enabled },
  });
  return NextResponse.json({ ok: true, flags: await routeMap() });
}
