// Слоты контент-плана завода. Активность и время больше не зашиты в код:
// слот жив, когда его тип в матрице стоит «по времени», и заморожен, когда
// «по запросу», — переключение в маршрутах сразу меняет план и генерацию.
import { scheduleMap } from "@/lib/routes";

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

export async function planSlots() {
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
