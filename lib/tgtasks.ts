// Задачи из чатов: бот читает рабочие группы, нейронка решает, есть ли в
// сообщении поручение, и заводит задачу в Postos. Ключ и роутер — те же,
// что у нейро-аналитики (CLAUDE_API_KEY + CLAUDE_BASE_URL).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";

const TaskSchema = z.object({
  is_task: z.boolean(),
  title: z.string().default(""),
  assignee_hint: z.string().default(""),
  due: z.string().default(""),
});

// Дешёвый предфильтр, чтобы не гонять нейронку на «ок» и стикерах.
export function looksLikeTask(text: string): boolean {
  const t = (text || "").trim();
  if (t.length < 12 || t.startsWith("/")) return false;
  return /[а-яa-z]/i.test(t);
}

export async function extractTask(text: string, fromName: string, chatTitle: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;
  const baseURL = process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_BASE_URL;
  const client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const nowMsk = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

  const r = await client.messages.create({
    model: process.env.TG_TASK_MODEL || "claude-opus-5",
    max_tokens: 300,
    system:
      "Ты выделяешь рабочие поручения из сообщений командного чата. " +
      "Отвечай СТРОГО одним JSON-объектом без пояснений: " +
      '{"is_task":bool,"title":string,"assignee_hint":string,"due":string}. ' +
      "is_task=true только если в сообщении есть конкретное действие-поручение " +
      "(сделать, проверить, отправить, починить...), а не вопрос, отчёт или болтовня. " +
      "title — короткая формулировка задачи с большой буквы. " +
      "assignee_hint — кому адресовано: @username или имя из текста, иначе пустая строка. " +
      `due — дедлайн в формате YYYY-MM-DD, если он назван (сегодня ${nowMsk} по Москве; ` +
      '"завтра", "к пятнице" и т.п. переводи в дату), иначе пустая строка.',
    messages: [{ role: "user", content: `Чат «${chatTitle}». ${fromName} пишет:\n${text}` }],
  });
  const raw = r.content.find((b) => b.type === "text")?.text || "";
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = TaskSchema.safeParse(JSON.parse(m[0]));
  if (!parsed.success || !parsed.data.is_task || !parsed.data.title.trim()) return null;
  return parsed.data;
}

// Кому назначить: ищем сотрудника по @username из текста, иначе — владельцу.
export async function resolveAssignee(hint: string) {
  const users = await prisma.user.findMany({ where: { isActive: true } });
  const h = (hint || "").toLowerCase().replace(/^@/, "");
  if (h) {
    const byTg = users.find((u) => (u.tgUsername || "").toLowerCase() === h);
    if (byTg) return byTg;
    const byName = users.find((u) => u.name.toLowerCase().includes(h));
    if (byName) return byName;
  }
  return users.find((u) => u.role === "OWNER") || users[0];
}
