"use client";
import { useState } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function AssistantChat({ projectId }: { projectId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setQuestion("");
    setBusy(true);
    setError("");

    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, question, history: messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось получить ответ.");
      } else {
        setMessages([...nextMessages, { role: "assistant", content: data.answer }]);
      }
    } catch {
      setError("Не удалось связаться с сервером.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col h-[600px]">
      <h3 className="font-semibold mb-2">ИИ-помощник по проекту</h3>
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 text-sm">
        {messages.length === 0 && (
          <p className="text-gray-400">
            Спросите что-нибудь про проект — например, «какие условия для партнёра» или «что ответить, если партнёр спрашивает про выплаты».
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`p-2 rounded-lg ${m.role === "user" ? "bg-brand-50 text-brand-900" : "bg-gray-50 text-gray-800"}`}>
            <div className="text-xs text-gray-400 mb-1">{m.role === "user" ? "Вы" : "Помощник"}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {busy && <div className="text-gray-400 text-xs">Помощник думает…</div>}
        {error && <div className="text-red-600 text-xs">{error}</div>}
      </div>
      <form onSubmit={ask} className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Ваш вопрос..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy} type="submit">Спросить</button>
      </form>
    </div>
  );
}
