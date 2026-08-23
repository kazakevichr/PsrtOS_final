import { prisma } from "@/lib/prisma";

// Площадки и типы контента для матрицы «Маршруты публикации».
export const PLATFORMS = [
  { key: "ig_main", label: "super.fit24" },
  { key: "ig_woman", label: "woman" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

export const KINDS = [
  { kind: "make", label: "Персонаж", note: "08:02" },
  { kind: "carousel", label: "Карусель", note: "12:02" },
  { kind: "avatar", label: "ИИ-аватар", note: "по запросу" },
  { kind: "trainer:female", label: "Тренер Ж", note: "заморожен" },
  { kind: "trainer:male", label: "Тренер М", note: "заморожен" },
  { kind: "repost", label: "Нарезки", note: "ютуб-репост" },
  { kind: "manual", label: "Ручные из бота", note: "" },
];

// Клетки, которых не бывает: карусель — картинки, ручные в woman не идут.
export const NA: Record<string, string[]> = {
  carousel: ["youtube", "tiktok"],
  manual: ["ig_woman"],
};

// Осознанный запрет: чужие нарезки на YouTube/TikTok — путь к страйкам.
export const LOCKED: Record<string, string[]> = {
  repost: ["youtube", "tiktok"],
};

// Значения по умолчанию — текущее состояние конвейера на 23.08.2026.
const DEFAULTS: Record<string, Record<string, boolean>> = {
  make: { ig_main: true, ig_woman: false, youtube: true, tiktok: true },
  carousel: { ig_main: true, ig_woman: false },
  avatar: { ig_main: true, ig_woman: false, youtube: true, tiktok: false },
  "trainer:female": { ig_main: false, ig_woman: false, youtube: false, tiktok: false },
  "trainer:male": { ig_main: false, ig_woman: false, youtube: false, tiktok: false },
  repost: { ig_main: false, ig_woman: true },
  manual: { ig_main: true, youtube: true, tiktok: true },
};

export function defaultFor(platform: string, kind: string): boolean {
  if (kind === "*") return true;
  return DEFAULTS[kind]?.[platform] ?? false;
}

export function blocked(platform: string, kind: string): boolean {
  return (NA[kind] || []).includes(platform) || (LOCKED[kind] || []).includes(platform);
}

export async function routeMap() {
  const rows = await prisma.routeFlag.findMany();
  const saved = new Map(rows.map((r) => [`${r.platform}|${r.kind}`, r.enabled]));
  const flags: Record<string, boolean> = {};
  for (const p of PLATFORMS) {
    flags[`${p.key}|*`] = saved.get(`${p.key}|*`) ?? true;
    for (const k of KINDS) {
      if (blocked(p.key, k.kind)) continue;
      flags[`${p.key}|${k.kind}`] =
        saved.get(`${p.key}|${k.kind}`) ?? defaultFor(p.key, k.kind);
    }
  }
  return flags;
}

// Итоговое решение для публикатора: тип разрешён и площадка не на паузе.
export async function allowed(platform: string, kind: string) {
  if (blocked(platform, kind)) return false;
  const flags = await routeMap();
  return Boolean(flags[`${platform}|*`]) && Boolean(flags[`${platform}|${kind}`]);
}
