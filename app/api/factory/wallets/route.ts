import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyRoles } from "@/lib/telegram";
import { SERVICES, stateOf, topups, wallets } from "@/lib/wallets";

export const dynamic = "force-dynamic";

async function canSee() {
  const s = await getServerSession(authOptions);
  return s && ["OWNER", "SMM"].includes(s.user.role) ? s : null;
}
async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER" ? s : null;
}
function byKey(req: Request) {
  const need = process.env.IG_HOST_KEY;
  return Boolean(need) && req.headers.get("x-factory-key") === need;
}

const money = (n: number) => `$${n.toFixed(2)}`;

// Завод присылает замеры раз в час: {wallets: [{service, ok, low, left, spent,
// note, link, title}]}. Пуш в Телеграм уходит ТОЛЬКО на смену состояния —
// иначе за неделю простоя раздел превратится в спам и настоящее
// предупреждение потеряется среди одинаковых.
export async function POST(req: Request) {
  if (!byKey(req)) return new NextResponse("forbidden", { status: 403 });
  const b = await req.json().catch(() => null);
  const list = Array.isArray(b?.wallets) ? b.wallets : null;
  if (!list) return NextResponse.json({ error: "нужен массив wallets" }, { status: 400 });

  const msgs: string[] = [];
  for (const w of list) {
    const service = String(w?.service || "").trim();
    if (!service || !SERVICES[service]) continue;
    const meta = SERVICES[service];
    const fields = {
      title: String(w.title || meta.title).slice(0, 120),
      ok: w.ok !== false,
      low: Boolean(w.low),
      left: w.left == null ? null : Number(w.left),
      unit: meta.unit,
      spent: w.spent == null ? null : Number(w.spent),
      note: String(w.note || "").slice(0, 400),
      link: String(w.link || meta.link).slice(0, 300),
      at: new Date(),
    };
    const next = stateOf(fields);
    const prev = await prisma.wallet.findUnique({ where: { service } });
    await prisma.wallet.upsert({
      where: { service },
      create: { service, ...fields, state: next },
      update: { ...fields, state: next },
    });
    if (prev?.state === next) continue;      // ничего не изменилось — молчим

    const name = fields.title;
    if (next === "down") {
      msgs.push(
        (meta.blocks
          ? `⛔️ <b>${name}</b>: ${fields.note || "деньги кончились"}\nПроизводство приостановлено.`
          : `⚠️ <b>${name}</b>: ${fields.note || "деньги кончились"}\nКонтент продолжает выходить на замене.`) +
          `\nПополнить: ${fields.link}`,
      );
    } else if (next === "low" && prev?.state !== "down") {
      msgs.push(
        `⚠️ <b>${name}</b>: остаток ${fields.left ?? "?"} ${meta.unit}, скоро кончится.` +
          `\nПополнить: ${fields.link}`,
      );
    } else if (next === "ok" && prev && prev.state !== "ok") {
      msgs.push(`✅ <b>${name}</b> снова работает — запускаю отложенное.`);
    }
  }
  if (msgs.length) void notifyRoles(["SMM", "OWNER"], msgs.join("\n\n"));
  return NextResponse.json({ ok: true, pushed: msgs.length });
}

// Картина для раздела. Заводу по ключу отдаём то же самое: по этим данным он
// решает, начинать ли производство.
export async function GET(req: Request) {
  if (!byKey(req) && !(await canSee())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ wallets: await wallets(), topups: await topups() });
}

// Ручной ввод — то, чего сервисы не отдают по API.
//  · {service, amount, note}  — записать пополнение (история сохраняется);
//  · {service, manual}        — вписать текущий остаток;
//  · {service, manual: null}  — стереть ручной остаток и вернуться к расчёту.
export async function PUT(req: Request) {
  const s = await owner();
  if (!s) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  const service = String(b?.service || "").trim();
  if (!SERVICES[service]) {
    return NextResponse.json({ error: "неизвестный сервис" }, { status: 400 });
  }

  if (b?.amount != null) {
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "сумма должна быть числом" }, { status: 400 });
    }
    await prisma.walletTopup.create({
      data: {
        service,
        amount,
        who: s.user.name || s.user.email || "",
        note: String(b.note || "").slice(0, 200),
        // Дату можно задать задним числом: пополнение вносится не в ту же
        // минуту, когда сделано, а когда до раздела дошли руки.
        ...(b.at ? { at: new Date(b.at) } : {}),
      },
    });
    // Запись пополнения снимает ручной остаток: он относился к «до», и
    // оставлять его — значит показывать вчерашнюю цифру как сегодняшнюю.
    await prisma.wallet.upsert({
      where: { service },
      create: { service, title: SERVICES[service].title, unit: SERVICES[service].unit },
      update: { manual: null, manualAt: null },
    });
    void notifyRoles(["OWNER"], `💳 <b>${SERVICES[service].title}</b>: пополнение ${money(amount)}`);
    return NextResponse.json({ ok: true, wallets: await wallets(), topups: await topups() });
  }

  if ("manual" in (b || {})) {
    const manual = b.manual == null || b.manual === "" ? null : Number(b.manual);
    if (manual != null && !Number.isFinite(manual)) {
      return NextResponse.json({ error: "остаток должен быть числом" }, { status: 400 });
    }
    await prisma.wallet.upsert({
      where: { service },
      create: {
        service, title: SERVICES[service].title, unit: SERVICES[service].unit,
        manual, manualAt: manual == null ? null : new Date(),
      },
      update: { manual, manualAt: manual == null ? null : new Date() },
    });
    return NextResponse.json({ ok: true, wallets: await wallets(), topups: await topups() });
  }

  return NextResponse.json({ error: "нужны amount или manual" }, { status: 400 });
}

// Ошиблись в сумме — пополнение удаляется. Правки на месте нет намеренно:
// история денег должна читаться как список событий, а не как текущее мнение.
export async function DELETE(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "нужен id" }, { status: 400 });
  await prisma.walletTopup.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true, wallets: await wallets(), topups: await topups() });
}
