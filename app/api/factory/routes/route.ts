import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LOCKED, NA, PLATFORMS, SCHEDULABLE, allowed, baseKind, blocked, kindsWithDonors, publishFor, publishMap, routeMap, scheduleMap, setPublish, setSchedule } from "@/lib/routes";

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
    // Заводу вместе с разрешением отдаём время публикации: нарезки могут
    // собираться сразу, а выходить в назначенный час.
    return NextResponse.json({
      platform, kind,
      allowed: await allowed(platform, kind),
      ...(await publishFor(kind)),
    });
  }
  // na/locked раздаются по фактическим типам (донорские наследуют базовый
  // repost) — интерфейсу не нужно знать про деление.
  const kinds = await kindsWithDonors();
  const na: Record<string, string[]> = {};
  const locked: Record<string, string[]> = {};
  for (const k of kinds) {
    na[k.kind] = NA[baseKind(k.kind)] || [];
    locked[k.kind] = LOCKED[baseKind(k.kind)] || [];
  }
  return NextResponse.json({
    platforms: PLATFORMS, kinds, na, locked,
    schedulable: SCHEDULABLE,
    flags: await routeMap(),
    schedule: await scheduleMap(),
    publish: await publishMap(),
  });
}

export async function PUT(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  // Смена расписания типа: {kind, schedule: {mode: "time"|"demand", time}}
  if (b?.kind && b?.schedule) {
    try {
      await setSchedule(b.kind, b.schedule.mode, b.schedule.time);
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, schedule: await scheduleMap() });
  }
  // Время публикации нарезок: {kind: "repost:<донор>", publish: {mode, at}}
  if (b?.kind && b?.publish) {
    try {
      const publish = await setPublish(b.kind, b.publish.mode, b.publish.at);
      return NextResponse.json({ ok: true, publish });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
  }
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
