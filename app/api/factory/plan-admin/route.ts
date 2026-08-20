import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

import { SLOTS } from "@/lib/factory";

async function owner() {
  const session = await getServerSession(authOptions);
  return session && session.user.role === "OWNER";
}

// План может смотреть и СММ; править и генерировать — только владелец.
async function viewer() {
  const session = await getServerSession(authOptions);
  return session && ["OWNER", "SMM"].includes(session.user.role);
}

function monthDates(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  return Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export async function GET(req: Request) {
  if (!(await viewer())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const month = new URL(req.url).searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const rows = await prisma.planSlot.findMany({ where: { date: { startsWith: month } } });
  return NextResponse.json({ month, slots: SLOTS, dates: monthDates(month), plan: rows });
}

export async function PUT(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json();
  if (!b?.date || !b?.slot) return NextResponse.json({ error: "date+slot required" }, { status: 400 });
  const fields = { topic: String(b.topic ?? ""), facts: String(b.facts ?? "") };
  const row = await prisma.planSlot.upsert({
    where: { date_slot: { date: b.date, slot: b.slot } },
    create: { date: b.date, slot: b.slot, ...fields },
    update: fields,
  });
  return NextResponse.json(row);
}

// Генерация тем на месяц: LLM заполняет ТОЛЬКО пустые ячейки активных слотов.
export async function POST(req: Request) {
  if (!(await owner())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "нет OPENAI_API_KEY" }, { status: 500 });
  const b = await req.json().catch(() => ({}));
  const month = b.month || new Date().toISOString().slice(0, 7);

  const existing = await prisma.planSlot.findMany({ where: { date: { startsWith: month } } });
  const filled = new Set(existing.filter((r) => r.topic.trim()).map((r) => `${r.date}|${r.slot}`));
  const need: { date: string; slot: string }[] = [];
  for (const date of monthDates(month)) {
    for (const s of SLOTS.filter((s) => s.active)) {
      if (!filled.has(`${date}|${s.slot}`)) need.push({ date, slot: s.slot });
    }
  }
  if (!need.length) return NextResponse.json({ generated: 0, note: "все ячейки уже заполнены" });

  // Правила закреплены у завода (brand.json → content_plan): Персонаж берёт
  // фактуру ТОЛЬКО из четырёх гайдов, Карусель — тренировочные посты.
  const slotHints: Record<string, string> = {
    make: "мультяшный ролик с персонажем; тема СТРОГО из тематик четырёх гайдов Базы знаний: БАДы (креатин, омега-3, витамин D, магний, протеин), тренировки для новичка (техника, разминка, восстановление, прогрессия), гормоны (кортизол, инсулин, щитовидка, сон), анализы (ферритин, дефициты, чек-ап). Темы вне этих четырёх зон запрещены",
    carousel: "питание для похудения: готовый рацион на день или неделю с КБЖУ, меню при дефиците калорий («Рацион на день: 1500 ккал с КБЖУ», «Меню на неделю без срывов»). Только рационы/меню с конкретными калориями — НЕ тренировки",
    "trainer:female": "тренировка на конкретную мышечную группу для женщин — тема СТРОГО в формате «тренировка на <группу>» (ягодицы, пресс, спина, ноги, плечи, руки, грудь, всё тело), Тренер собирает ролик из справочника упражнений по этой группе",
  };
  const prompt = `Ты контент-стратег фитнес-бренда SUPERFIT24 (приложение с тренировками и питанием, аудитория — русскоязычные новички и любители). Составь темы контента.
Для каждой строки входа дай тему (topic, до 90 символов, без кавычек и хэштегов) и 2-3 конкретных факта/тезиса для сценариста (facts, до 300 символов).
Темы не должны повторяться в рамках месяца, чередуй направления: тренировки, питание, БАДы, мотивация, разбор ошибок, мифы.
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
    if (!it?.date || !it?.slot || !it?.topic) continue;
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
