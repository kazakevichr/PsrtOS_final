// Слоты контент-плана завода. Активность и время больше не зашиты в код:
// слот жив, когда его тип в матрице стоит «по времени», и заморожен, когда
// «по запросу», — переключение в маршрутах сразу меняет план и генерацию.
import { prisma } from "@/lib/prisma";
import { scheduleMap } from "@/lib/routes";
import type { SocialScope } from "@/lib/access";

// Все производимые типы, кроме нарезок (чужой контент, темы не планируются)
// и ручных постов (их темы рождаются вне завода).
const PLAN_KINDS = [
  { slot: "make", label: "Персонаж" },
  { slot: "carousel", label: "Карусель" },
  { slot: "carousel_new", label: "Карусель Новая" },
  { slot: "trainer:female", label: "Тренер Ж" },
  { slot: "trainer:male", label: "Тренер М" },
  { slot: "avatar", label: "ИИ-аватар" },
];

/**
 * Завод, чьи данные показываем и правим.
 *
 * Заводов больше одного: у СуперФита и Оракла свои экземпляры, свои темы и
 * свои типы контента. Ось та же, что у соцсетей, — бренд направления, чтобы
 * одно и то же направление везде значило одно и то же.
 *
 * Без выбранного направления берём СуперФит: «все направления» для завода
 * бессмысленно — заводы не складываются, а владелец, ничего не выбравший,
 * должен увидеть то же, что видел вчера.
 */
export const DEFAULT_BRAND = "superfit";

export function factoryBrand(scope: SocialScope): string {
  return scope.brands?.[0] || DEFAULT_BRAND;
}

/**
 * Ключи заводов из настроек: «ключ → бренд».
 *
 * Основной формат — простые пары «бренд:ключ» через запятую:
 *
 *     FACTORY_KEYS=oracle:9f2c…,party:1ab4…
 *
 * Без кавычек и фигурных скобок намеренно: значение вписывают руками в поле
 * панели, а панели любят толковать скобки по-своему — Coolify, например,
 * подставляет по {{…}}. Значение, которое нечем испортить, не придётся
 * потом искать по симптому «ключ верный, а в ответе forbidden».
 *
 * JSON тоже принимаем — он был первым, и уже вписанное менять незачем.
 */
function keyMap(): Record<string, string> {
  const raw = (process.env.FACTORY_KEYS || "").trim();
  if (!raw) return {};

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string" && v.trim()) out[k] = v.trim();
      }
      return out;
    } catch {
      // Кривая настройка не должна ронять приём отчётов завода.
      return {};
    }
  }

  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    // Ключ может содержать двоеточие, бренд — нет: режем по первому.
    const at = pair.indexOf(":");
    if (at < 1) continue;
    const brand = pair.slice(0, at).trim();
    const key = pair.slice(at + 1).trim();
    if (brand && key) out[key] = brand;
  }
  return out;
}

/**
 * Бренд завода, приславшего запрос.
 *
 * Экземпляры заводов ходят к нам по ключу. Основной ключ (IG_HOST_KEY) — это
 * СуперФит, как было; ключи остальных перечисляются в FACTORY_KEYS. Так
 * второй завод подключается сменой одной переменной в его окружении, без
 * правки его кода: чужой проект трогать нечем.
 *
 * Если завод всё же умеет представиться сам — заголовком X-Factory-Brand
 * или полем brand в теле, — его слово главнее.
 *
 * Возвращает null, когда ключ не признан: ручка отвечает 403.
 */
export function factoryAuth(req: Request, body?: any): string | null {
  const key = req.headers.get("x-factory-key") || "";
  if (!key) return null;

  const brand =
    process.env.IG_HOST_KEY && key === process.env.IG_HOST_KEY
      ? DEFAULT_BRAND
      : keyMap()[key] || null;
  if (!brand) return null;

  const said = String(req.headers.get("x-factory-brand") || body?.brand || "").trim();
  return said || brand;
}

/**
 * Строки контент-плана: чем этот завод занят.
 *
 * У СуперФита состав типов задаётся матрицей маршрутов. У остальных матрицы
 * нет, поэтому сетку выводим из журнала: что завод присылал, то и планируем.
 * Пустой журнал даёт пустую сетку — это честнее выдуманных строк.
 */
export async function planSlots(brand: string = DEFAULT_BRAND) {
  if (brand === DEFAULT_BRAND) {
    const sched = await scheduleMap();
    return PLAN_KINDS.map((k) => {
      const s = sched[k.slot] || { mode: "demand" };
      return {
        ...k,
        active: s.mode === "time",
        time: s.mode === "time" ? s.time || "—" : "—",
      };
    });
  }

  const rows = await prisma.factoryJob.findMany({
    where: { brand, slot: { not: "" } },
    select: { slot: true },
    distinct: ["slot"],
    orderBy: { slot: "asc" },
  });
  return rows.map((r) => ({ slot: r.slot, label: r.slot, active: true, time: "—" }));
}
