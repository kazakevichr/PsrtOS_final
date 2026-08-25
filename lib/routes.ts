import { prisma } from "@/lib/prisma";

// Площадки и типы контента для матрицы «Маршруты публикации».
export const PLATFORMS = [
  { key: "ig_main", label: "super.fit24" },
  { key: "ig_woman", label: "woman" },
  { key: "ig_man", label: "man" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

// Какие типы контента вообще осмысленны на профиле — раскладка Романа
// от 25.08.2026. Всё вне списка в матрице показывается прочерком.
export const RELEVANT: Record<string, string[]> = {
  ig_main: ["make", "carousel", "carousel_new", "avatar", "trainer:female", "trainer:male", "manual"],
  ig_woman: ["repost", "trainer:female"],
  ig_man: ["trainer:male", "repost"],
  youtube: ["make", "avatar", "trainer:female", "trainer:male", "repost", "manual"],
  tiktok: ["make", "avatar", "trainer:female", "trainer:male", "repost", "manual"],
};

export const KINDS = [
  { kind: "make", label: "Персонаж", note: "" },
  { kind: "carousel", label: "Карусель", note: "" },
  { kind: "carousel_new", label: "Карусель Новая", note: "фотореализм" },
  { kind: "avatar", label: "ИИ-аватар", note: "" },
  { kind: "trainer:female", label: "Тренер Ж", note: "" },
  { kind: "trainer:male", label: "Тренер М", note: "" },
  { kind: "repost", label: "Нарезки", note: "ютуб-репост" },
  { kind: "manual", label: "Ручные из бота", note: "" },
];

// Клетки, которых не бывает: карусель — картинки (на видеоплощадках отдельная
// подпись «не видео»), остальное — вне раскладки профилей.
export const NA: Record<string, string[]> = {};
for (const k of ["make", "carousel", "carousel_new", "avatar", "trainer:female", "trainer:male", "repost", "manual"]) {
  NA[k] = PLATFORMS.map((p) => p.key).filter((pk) => !(RELEVANT[pk] || []).includes(k));
}

// Осознанный запрет: чужие нарезки на YouTube/TikTok — путь к страйкам.
export const LOCKED: Record<string, string[]> = {
  repost: ["youtube", "tiktok"],
};

// Значения по умолчанию — текущее состояние конвейера на 23.08.2026.
const DEFAULTS: Record<string, Record<string, boolean>> = {
  make: { ig_main: true, ig_woman: false, youtube: true, tiktok: true },
  carousel: { ig_main: true, ig_woman: false },
  carousel_new: { ig_main: true },
  avatar: { ig_main: true, ig_woman: false, youtube: true, tiktok: false },
  "trainer:female": { ig_main: false, ig_woman: false, youtube: false, tiktok: false },
  "trainer:male": { ig_main: false, ig_woman: false, youtube: false, tiktok: false },
  repost: { ig_main: false, ig_woman: true },
  manual: { ig_main: true, youtube: true, tiktok: true },
};

// Нарезки делятся по донорам: подтипы repost:<донор>. Список доноров
// присылает repost-завод (Setting repost:donors) — новый донор появляется
// в матрице без деплоя. Правила (где уместно, замки, дефолты) наследуются
// от базового repost.
export const baseKind = (k: string) => (k.startsWith("repost:") ? "repost" : k);

export async function donors(): Promise<{ key: string; label: string }[]> {
  const row = await prisma.setting.findUnique({ where: { key: "repost:donors" } });
  try {
    const list = row ? JSON.parse(row.value) : [];
    return Array.isArray(list)
      ? list.filter((d) => d?.key).map((d) => ({ key: String(d.key), label: String(d.label || d.key) }))
      : [];
  } catch { return []; }
}

// Типы для матрицы: при известных донорах строка «Нарезки» раскрывается
// на подстроки по донорам.
export async function kindsWithDonors() {
  const ds = await donors();
  if (!ds.length) return KINDS;
  const out: { kind: string; label: string; note: string }[] = [];
  for (const k of KINDS) {
    if (k.kind !== "repost") { out.push(k); continue; }
    for (const d of ds) out.push({ kind: `repost:${d.key}`, label: `Нарезки · ${d.label}`, note: "ютуб-репост" });
  }
  return out;
}

export function defaultFor(platform: string, kind: string): boolean {
  if (kind === "*") return true;
  return DEFAULTS[baseKind(kind)]?.[platform] ?? false;
}

export function blocked(platform: string, kind: string): boolean {
  const b = baseKind(kind);
  return (NA[b] || []).includes(platform) || (LOCKED[b] || []).includes(platform);
}

export async function routeMap() {
  const rows = await prisma.routeFlag.findMany();
  const saved = new Map(rows.map((r) => [`${r.platform}|${r.kind}`, r.enabled]));
  const flags: Record<string, boolean> = {};
  const kinds = await kindsWithDonors();
  for (const p of PLATFORMS) {
    flags[`${p.key}|*`] = saved.get(`${p.key}|*`) ?? true;
    for (const k of kinds) {
      if (blocked(p.key, k.kind)) continue;
      // Донорский тумблер наследует состояние общего «Нарезки», пока его
      // не переключали отдельно — поведение не меняется от самого деления.
      flags[`${p.key}|${k.kind}`] =
        saved.get(`${p.key}|${k.kind}`) ??
        saved.get(`${p.key}|${baseKind(k.kind)}`) ??
        defaultFor(p.key, k.kind);
    }
  }
  return flags;
}

// Итоговое решение для публикатора: тип разрешён и площадка не на паузе.
export async function allowed(platform: string, kind: string) {
  if (blocked(platform, kind)) return false;
  const flags = await routeMap();
  const key = `${platform}|${kind}`;
  if (!(key in flags) && kind === "repost") {
    // Переходный случай: завод ещё спрашивает общий repost, а матрица уже
    // донорская — разрешаем, если включён хотя бы один донор.
    const ds = await donors();
    return Boolean(flags[`${platform}|*`]) &&
      ds.some((d) => flags[`${platform}|repost:${d.key}`]);
  }
  return Boolean(flags[`${platform}|*`]) && Boolean(flags[key]);
}

// Расписание производства по типам: во сколько стартует слот или «по запросу».
// Хранится в Setting под ключами slotmode:<kind>; завод синхронизирует своё
// расписание с этим раз в несколько минут.
import { prisma as _p } from "@/lib/prisma";

export const SCHEDULABLE = ["make", "carousel", "carousel_new", "avatar", "trainer:female", "trainer:male"];

const SCHEDULE_DEFAULTS: Record<string, { mode: string; time?: string }> = {
  make: { mode: "time", time: "08:00" },
  carousel: { mode: "time", time: "12:00" },
  carousel_new: { mode: "time", time: "12:00" },
  avatar: { mode: "demand" },
  "trainer:female": { mode: "demand" },
  "trainer:male": { mode: "demand" },
};

export async function scheduleMap() {
  const rows = await _p.setting.findMany({
    where: { key: { in: SCHEDULABLE.map((k) => `slotmode:${k}`) } },
  });
  const saved = new Map(rows.map((r) => [r.key.replace("slotmode:", ""), r.value]));
  const out: Record<string, { mode: string; time?: string }> = {};
  for (const k of SCHEDULABLE) {
    const raw = saved.get(k);
    if (raw) {
      try { out[k] = JSON.parse(raw); continue; } catch {}
    }
    out[k] = SCHEDULE_DEFAULTS[k];
  }
  return out;
}

export async function setSchedule(kind: string, mode: string, time?: string) {
  if (!SCHEDULABLE.includes(kind)) throw new Error("этот тип не планируется");
  if (!["time", "demand"].includes(mode)) throw new Error("mode: time | demand");
  if (mode === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) {
    throw new Error("время в формате ЧЧ:ММ");
  }
  const value = JSON.stringify(mode === "time" ? { mode, time } : { mode });
  await _p.setting.upsert({
    where: { key: `slotmode:${kind}` },
    create: { key: `slotmode:${kind}`, value },
    update: { value },
  });
}
