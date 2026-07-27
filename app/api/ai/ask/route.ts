import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, question, history } = await req.json();
  if (!projectId || !question || !String(question).trim()) {
    return NextResponse.json({ error: "Не указан вопрос или проект." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "ИИ-помощник не настроен: владельцу нужно добавить OPENAI_API_KEY в переменные окружения (получить ключ на platform.openai.com).",
      },
      { status: 500 }
    );
  }

  const knowledgeBase = project.knowledgeBase?.trim();
  const systemPrompt = `Ты — внутренний помощник менеджера в компании по проекту «${project.name}». Твоя задача — помогать менеджеру быстро разобраться в условиях проекта и подсказывать, что ответить партнёру.

Вот вся известная информация по проекту, которую добавил владелец:
---
${knowledgeBase || "(Владелец пока не добавил описание проекта. Сообщи об этом менеджеру и посоветуй уточнить у владельца детали, если вопрос требует конкретики, которой здесь нет.)"}
---

Правила:
- Отвечай кратко и по делу, на русском языке.
- Если в описании проекта нет ответа на вопрос — честно скажи об этом, не выдумывай условия, цифры или обещания от имени компании.
- Если менеджер просит готовый ответ партнёру — сформулируй текст, который можно скопировать и отправить.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(history) ? history : []).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    })),
    { role: "user", content: String(question) },
  ];

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 1000,
        messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json({ error: `Ошибка OpenAI API (${response.status}): ${errText.slice(0, 300)}` }, { status: 502 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim();

    return NextResponse.json({ answer: answer || "Не удалось получить ответ." });
  } catch (err: any) {
    return NextResponse.json({ error: `Не удалось связаться с OpenAI API: ${err?.message || err}` }, { status: 502 });
  }
}
