// Норма контента СММ по договорённостям от 25.08.2026:
// super.fit24 — 2 видео/день (карусели там не делаем), Лео — 4 карусели/день.
// Пн–сб, день закрывается в 22:30 по Красноярску, расчётный месяц с 1-го.
// Оплата по факту: ставка аккаунта делится на рабочие дни месяца, день даёт
// свою долю пропорционально сделанному (не выше нормы — сверхплан это доп).
import { prisma } from "@/lib/prisma";

export const QUOTA_TZ = "Asia/Krasnoyarsk";
export const CLOSE_H = 22, CLOSE_M = 30;
export const REMIND_H = 19;

export type QuotaRule = {
  key: string;
  label: string;
  accounts: string[];   // юзернеймы, чьи посты суммируются
  metric: "videos" | "carousels";
  perDay: number;
  monthlyRate: number;  // ₽ за полный месяц нормы
  forbidden?: "carousels" | "videos"; // чего в этих аккаунтах быть не должно
};

export async function quotaRules(): Promise<QuotaRule[]> {
  const row = await prisma.setting.findUnique({ where: { key: "bd:list" } });
  let leo: string[] = [];
  try { leo = row ? JSON.parse(row.value) : []; } catch {}
  return [
    { key: "main", label: "super.fit24 · видео", accounts: ["super.fit24"],
      metric: "videos", perDay: 2, monthlyRate: 20000, forbidden: "carousels" },
    { key: "leo", label: "Лео · карусели", accounts: leo,
      metric: "carousels", perDay: 4, monthlyRate: 5000 },
  ];
}

const norm = (u: string) =>
  (u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").split("?")[0].replace(/\/$/, "");

export function kratParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")), minute: Number(get("minute")),
    weekday: get("weekday"),
  };
}

export const isWorkday = (weekday: string) => weekday !== "Sun";

async function factoryLinkSet() {
  const links = new Set<string>();
  for (const j of await prisma.factoryJob.findMany({ select: { links: true } })) {
    for (const l of JSON.parse(j.links) as any[]) if (l?.link) links.add(norm(l.link));
  }
  return links;
}

// Дни правила: счёт метрики + нарушения (запрещённый тип в аккаунте).
export async function quotaDays(daysBack = 63) {
  const rules = await quotaRules();
  const factory = await factoryLinkSet();
  const accounts = await prisma.igAccount.findMany({
    where: { username: { in: rules.flatMap((r) => r.accounts) } },
  });
  const mediaBy = new Map(accounts.map((a) => [a.username, JSON.parse(a.media) as any[]]));

  const kind = (m: any) => {
    const mt = String(m.mediaType || "").toUpperCase();
    const t = String(m.type || "").toUpperCase();
    if (mt === "CAROUSEL_ALBUM" || t === "CAROUSEL_ALBUM") return "carousels";
    if (mt === "VIDEO" || ["REELS", "VIDEO", "CLIPS"].includes(t)) return "videos";
    return "other";
  };

  const per: Record<string, Record<string, { done: number; bad: number }>> = {};
  for (const r of rules) {
    per[r.key] = {};
    for (const acc of r.accounts) {
      for (const m of mediaBy.get(acc) || []) {
        if (!m.timestamp || factory.has(norm(m.permalink))) continue;
        const day = kratParts(new Date(m.timestamp)).date;
        const slot = (per[r.key][day] ||= { done: 0, bad: 0 });
        const k = kind(m);
        if (k === r.metric) slot.done++;
        if (r.forbidden && k === r.forbidden) slot.bad++;
      }
    }
  }

  const today = kratParts().date;
  const out = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const { date, weekday } = kratParts(new Date(Date.now() - i * 864e5));
    const work = isWorkday(weekday);
    const row: any = { date, weekday, isWorkday: work, isToday: date === today, rules: {} };
    for (const r of rules) {
      const c = per[r.key][date] || { done: 0, bad: 0 };
      const done = c.done >= r.perDay;
      row.rules[r.key] = {
        done: c.done, plan: r.perDay, bad: c.bad,
        status: !work ? "off" : done ? "ok" : c.done ? "partial" : "none",
      };
    }
    out.push(row);
  }
  return { rules, days: out };
}

// Рабочие дни календарного месяца (пн–сб) по Красноярску.
export function monthWorkdays(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  let n = 0;
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) n++;
  }
  return n;
}

// Заработок месяца по факту + доп задачи с ценой.
export async function earnings(ym?: string) {
  const { rules, days } = await quotaDays(63);
  const month = ym || kratParts().date.slice(0, 7);
  const inMonth = days.filter((d) => d.date.startsWith(month) && d.isWorkday);
  const wd = monthWorkdays(month);

  const perRule = rules.map((r) => {
    const dayRate = r.monthlyRate / wd;
    let earned = 0, closed = 0, passed = 0;
    for (const d of inMonth) {
      const q = d.rules[r.key];
      earned += dayRate * Math.min(q.done / r.perDay, 1);
      if (!d.isToday) {
        passed++;
        if (q.status === "ok") closed++;
      }
    }
    return {
      key: r.key, label: r.label, monthlyRate: r.monthlyRate,
      earned: Math.round(earned), closed, passed,
      tracked: r.accounts.length > 0,
    };
  });

  const smm = await prisma.user.findFirst({ where: { role: "SMM", isActive: true } });
  let extras: any[] = [];
  if (smm) {
    extras = await prisma.task.findMany({
      where: {
        assignedToUserId: smm.id, price: { not: null },
        createdAt: { gte: new Date(`${month}-01T00:00:00Z`) },
      },
      orderBy: { createdAt: "desc" },
    });
  }
  const extrasDone = extras.filter((t) => t.isDone);
  return {
    month, workdays: wd,
    rules: perRule,
    base: perRule.reduce((s, r) => s + r.earned, 0),
    baseMax: perRule.reduce((s, r) => s + r.monthlyRate, 0),
    extras: extras.map((t) => ({
      id: t.id, title: t.title, price: t.price, isDone: t.isDone,
    })),
    extrasEarned: Math.round(extrasDone.reduce((s, t) => s + (t.price || 0), 0)),
    smm: smm ? { id: smm.id, name: smm.name } : null,
  };
}
