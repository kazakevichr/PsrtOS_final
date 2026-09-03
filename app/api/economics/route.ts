import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { currentAccess } from "@/lib/access";
import { FX_KEY, allSpan, daysSpan, monthMoney, projectSplit, rangeSpan, Span } from "@/lib/ledger";
import { resolvePeriod, PeriodType } from "@/lib/economics";

export const dynamic = "force-dynamic";

// Курс — общая настройка на всю группу, менять её может только владелец.
async function owner() {
  const s = await getServerSession(authOptions);
  return s && s.user.role === "OWNER" ? s : null;
}

export async function GET(req: Request) {
  const access = await currentAccess();
  if (!access || !["OWNER", "PARTNER"].includes(access.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const q = new URL(req.url).searchParams;
  // Окна дашборда — «7 дн», «30 дн», «90 дн»; бухгалтерские — день/неделя/месяц.
  const raw = q.get("period") || "month";
  const back = Math.max(0, Number(q.get("back") || 0));
  const n = /^(\d+)d$/.exec(raw);
  const from = q.get("from") || "";
  const to = q.get("to") || "";
  const isDate = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x);

  const span: Span = isDate(from) && isDate(to)
    ? rangeSpan(from, to)
    : raw === "all"
    ? await allSpan()
    : n
    ? daysSpan(Number(n[1]), back)
    : (() => {
        const type = (["day", "week", "month"].includes(raw) ? raw : "month") as PeriodType;
        return { ...resolvePeriod(type, q.get("anchor") || undefined), type };
      })();
  // Направление берём из контекста, а не из адреса: иначе ссылку можно
  // подправить руками и заглянуть в чужое.
  const project = access.projectId || undefined;

  const [money, split] = await Promise.all([
    monthMoney(span, project),
    // Сводка нужна только на экране «Все направления».
    project ? Promise.resolve(null) : projectSplit(span),
  ]);
  const projectName = project
    ? access.projects.find((p) => p.id === project)?.name || null
    : null;
  return NextResponse.json({ ...money, split, projects: access.projects, projectName });
}

// Курс доллара: одна настройка на всю бухгалтерию.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const fx = Number(body.fx);
  if (!Number.isFinite(fx) || fx <= 0) {
    return NextResponse.json({ error: "Курс должен быть числом больше нуля" }, { status: 400 });
  }
  await prisma.setting.upsert({
    where: { key: FX_KEY },
    create: { key: FX_KEY, value: String(fx) },
    update: { value: String(fx) },
  });
  return NextResponse.json({ fx });
}
