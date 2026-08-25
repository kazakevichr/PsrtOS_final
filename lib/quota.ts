// Норма контента СММ: 2 карусели и 2 видео в день в super.fit24, пн–сб,
// день закрывается в 22:30 по Красноярску. Считаются только ручные посты —
// заводские отсеиваются по ссылкам из журнала завода.
import { prisma } from "@/lib/prisma";

export const QUOTA = { carousels: 2, videos: 2 };
export const QUOTA_ACCOUNT = "super.fit24";
export const QUOTA_TZ = "Asia/Krasnoyarsk";
export const CLOSE_H = 22, CLOSE_M = 30;
export const REMIND_H = 19;

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
    weekday: get("weekday"), // Mon..Sun
  };
}

export const isWorkday = (weekday: string) => weekday !== "Sun";

// Публикации super.fit24 по дням Красноярска: только ручные, тип из mediaType.
export async function quotaDays(daysBack = 14) {
  const acc = await prisma.igAccount.findFirst({ where: { username: QUOTA_ACCOUNT } });
  if (!acc) return [];

  const factoryLinks = new Set<string>();
  for (const j of await prisma.factoryJob.findMany({ select: { links: true } })) {
    for (const l of JSON.parse(j.links) as any[]) if (l?.link) factoryLinks.add(norm(l.link));
  }

  const media: any[] = JSON.parse(acc.media);
  const byDay: Record<string, { carousels: number; videos: number }> = {};
  for (const m of media) {
    if (!m.timestamp || factoryLinks.has(norm(m.permalink))) continue;
    const day = kratParts(new Date(m.timestamp)).date;
    const slot = (byDay[day] ||= { carousels: 0, videos: 0 });
    const mt = String(m.mediaType || "").toUpperCase();
    const t = String(m.type || "").toUpperCase();
    if (mt === "CAROUSEL_ALBUM" || t === "CAROUSEL_ALBUM") slot.carousels++;
    else if (mt === "VIDEO" || ["REELS", "VIDEO", "CLIPS"].includes(t)) slot.videos++;
  }

  const out = [];
  const today = kratParts().date;
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const { date, weekday } = kratParts(d);
    const c = byDay[date] || { carousels: 0, videos: 0 };
    const work = isWorkday(weekday);
    const done = c.carousels >= QUOTA.carousels && c.videos >= QUOTA.videos;
    out.push({
      date, weekday, isWorkday: work, isToday: date === today,
      carousels: c.carousels, videos: c.videos,
      status: !work ? "off" : done ? "ok" : (c.carousels || c.videos) ? "partial" : "none",
    });
  }
  return out;
}

export function summarize(all: any[]) {
  const days = all.slice(-14);
  const work = days.filter((d) => d.isWorkday && !d.isToday);
  const ok = work.filter((d) => d.status === "ok").length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i];
    if (d.isToday) continue;
    if (!d.isWorkday) continue;
    if (d.status === "ok") streak++;
    else break;
  }
  return { workdays: work.length, ok, streak };
}
