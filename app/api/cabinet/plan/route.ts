import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Контент-план СММ: та же сетка, что у завода, но слоты свои и правит их
// сама СММ (и владелец). Хранение общее — PlanSlot с префиксом smm:.
export const SMM_SLOTS = [
  { slot: "smm:video:1", label: "🎬 Видео 1", active: true },
  { slot: "smm:video:2", label: "🎬 Видео 2", active: true },
  { slot: "smm:leo", label: "🎠 Лео · тема дня (4 карусели)", active: true },
];

async function allowed() {
  const s = await getServerSession(authOptions);
  return s && ["OWNER", "SMM"].includes(s.user.role);
}

function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export async function GET(req: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const rows = await prisma.planSlot.findMany({
    where: { date: { startsWith: month }, slot: { startsWith: "smm:" } },
  });
  return NextResponse.json({ month, slots: SMM_SLOTS, dates: monthDates(month), plan: rows });
}

export async function PUT(req: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b?.date || !b?.slot || !b.slot.startsWith("smm:")) {
    return NextResponse.json({ error: "date+slot (smm:*) required" }, { status: 400 });
  }
  const fields = { topic: String(b.topic ?? ""), facts: String(b.facts ?? "") };
  const row = await prisma.planSlot.upsert({
    where: { date_slot: { date: b.date, slot: b.slot } },
    create: { date: b.date, slot: b.slot, ...fields },
    update: fields,
  });
  return NextResponse.json(row);
}

// Генерация тем: заполняет только пустые ячейки месяца.
export async function POST(req: Request) {
  if (!(await allowed())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "нет OPENAI_API_KEY" }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const month = b.month || new Date().toISOString().slice(0, 7);

  const existing = await prisma.planSlot.findMany({
    where: { date: { startsWith: month }, slot: { startsWith: "smm:" } },
  });
  const filled = new Set(existing.filter((r) => r.topic.trim()).map((r) => `${r.date}|${r.slot}`));
  const need: { date: string; slot: string }[] = [];
  for (const date of monthDates(month)) {
    // воскресенье — выходной СММ
    if (new Date(date + "T00:00:00Z").getUTCDay() === 0) continue;
    for (const s of SMM_SLOTS) {
      if (!filled.has(`${date}|${s.slot}`)) need.push({ date, slot: s.slot });
    }
  }
  if (!need.length) return NextResponse.json({ generated: 0, note: "все ячейки уже заполнены" });

  const slotHints = {
    "smm:video:1": "живой рилс для super.fit24: съёмка в зале или дома, разбор техники, мифы, ошибки новичков, до/после, лайфхаки — то, что снимает СММ с моделью или сама",
    "smm:video:2": "второй рилс дня для super.fit24: другой формат, чем первый (если первый — техника, второй — мотивация/быт/юмор/ответ на вопрос подписчика)",
    "smm:leo": "тема дня для четырёх каруселей в фитнес-аккаунтах Лео (vitalupgrade_, _training_ru): упражнения на конкретную группу мышц, программы на неделю, разборы техники — стиль информативных карточек",
  };
  const prompt = `Ты контент-стратег фитнес-бренда SUPERFIT24. Составь темы ручного контента для СММ-специалиста.
Для каждой строки входа дай тему (topic, до 90 символов, без кавычек и хэштегов) и 2-3 тезиса (facts, до 250 символов).
Темы не повторяются в рамках месяца; два видео одного дня — разных форматов.
Смыслы слотов: ${JSON.stringify(slotHints)}.
Вход (date, slot): ${JSON.stringify(need)}.
Ответ — строго JSON-массив объектов {"date","slot","topic","facts"} без пояснений.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 8000,
    }),
  });
  const d = await r.json();
  const text: string = d.choices?.[0]?.message?.content || "[]";
  const m = text.match(/\[[\s\S]*\]/);
  let items: any[] = [];
  try {
    items = JSON.parse(m ? m[0] : "[]");
  } catch {
    return NextResponse.json({ error: "LLM вернул не-JSON", raw: text.slice(0, 300) }, { status: 502 });
  }
  let generated = 0;
  for (const it of items) {
    if (!it?.date || !it?.slot || !it?.topic || !String(it.slot).startsWith("smm:")) continue;
    if (filled.has(`${it.date}|${it.slot}`)) continue;
    await prisma.planSlot.upsert({
      where: { date_slot: { date: it.date, slot: it.slot } },
      create: { date: it.date, slot: it.slot, topic: String(it.topic), facts: String(it.facts || "") },
      update: { topic: String(it.topic), facts: String(it.facts || "") },
    });
    generated++;
  }
  return NextResponse.json({ generated });
}
