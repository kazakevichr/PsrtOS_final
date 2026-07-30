// Превращает значения полей Instagram/Telegram/ссылка на артефакт в кликабельный href.
// Сотрудники иногда вводят просто "@ник" вместо полной ссылки — на этот случай
// достраиваем адрес до нужного вида, чтобы ссылка всегда открывалась корректно.
export function socialHref(value: string, kind: "instagram" | "telegram" | "url"): string {
  if (/^https?:\/\//i.test(value)) return value;
  const handle = value.replace(/^@/, "").trim();
  if (kind === "instagram") return `https://instagram.com/${handle}`;
  if (kind === "telegram") return `https://t.me/${handle}`;
  return value;
}

/**
 * Лучшая доступная ссылка на партнёра для быстрого перехода из списка:
 * Instagram → Telegram → ссылка на артефакт (реклама).
 */
export function bestPartnerLink(p: {
  instagram?: string | null;
  telegram?: string | null;
  adCreativeUrl?: string | null;
}): { href: string; label: string } | null {
  if (p.instagram) return { href: socialHref(p.instagram, "instagram"), label: "Instagram" };
  if (p.telegram) return { href: socialHref(p.telegram, "telegram"), label: "Telegram" };
  if (p.adCreativeUrl) return { href: socialHref(p.adCreativeUrl, "url"), label: "Ссылка" };
  return null;
}
