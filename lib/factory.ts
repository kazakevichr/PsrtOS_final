// Слоты конвейера контент-завода и их часы выдачи (МСК).
// Замороженные слоты завод не спрашивает по расписанию — только кнопкой.
export const SLOTS = [
  { slot: "make", label: "Нарезка", time: "08:00", active: true },
  { slot: "carousel", label: "Карусель", time: "12:00", active: true },
  { slot: "trainer:female", label: "Тренер Ж", time: "17:00", active: true },
  { slot: "trainer:male", label: "Тренер М", time: "—", active: false },
  { slot: "avatar", label: "ИИ-аватар", time: "—", active: false },
];
