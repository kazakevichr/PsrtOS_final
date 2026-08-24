"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  isDone: boolean;
  isAuto?: boolean;
  source?: string | null;
  assignedTo: { name: string };
  partner: { id: string; name: string } | null;
};

export default function TaskList({ tasks }: { tasks: Task[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function toggle(id: string, isDone: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDone: !isDone }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    router.refresh();
  }

  // Пакетная уборка: авто-задачи по остывающим партнёрам плодятся сами, и
  // вычищать их по одной — мучение.
  async function bulk(what: string, question: string) {
    if (!window.confirm(question)) return;
    setBusy(true);
    const r = await fetch("/api/tasks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ what }),
    });
    const j = await r.json();
    setNote(j.error ? j.error : `Удалено задач: ${j.deleted}`);
    setBusy(false);
    router.refresh();
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate: dueDate || undefined }),
    });
    setTitle("");
    setDueDate("");
    router.refresh();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function isOverdue(t: Task) {
    if (!t.dueDate || t.isDone) return false;
    return new Date(t.dueDate) < today;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addTask} className="card flex flex-col sm:flex-row gap-2">
        <input className="input flex-1" placeholder="Новая задача..." value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input sm:w-48" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button className="btn btn-primary" type="submit">Добавить</button>
      </form>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <button className="btn text-xs" disabled={busy}
            onClick={() => bulk("done", "Удалить все выполненные задачи?")}>
            Убрать выполненные
          </button>
          <button className="btn text-xs" disabled={busy}
            onClick={() => bulk("overdue-auto", "Удалить просроченные авто-напоминания по партнёрам? Новые появятся, пока партнёры остаются без активности.")}>
            Убрать просроченные авто-напоминания
          </button>
          <button className="btn text-xs" disabled={busy}
            onClick={() => bulk("auto", "Удалить ВСЕ авто-напоминания по партнёрам? Они создаются заново при заходе на страницу, пока партнёр без активности.")}>
            Убрать все авто-напоминания
          </button>
          {note && <span className="text-xs text-gray-500">{note}</span>}
        </div>
        <div className="space-y-1">
          {tasks.length === 0 && <p className="text-sm text-gray-400">Задач нет.</p>}
          {tasks.map((t) => (
            <label
              key={t.id}
              className={`flex items-center gap-3 py-2 border-b last:border-0 text-sm ${
                t.isDone ? "text-gray-400 line-through" : isOverdue(t) ? "text-red-600" : ""
              }`}
            >
              <input type="checkbox" checked={t.isDone} onChange={() => toggle(t.id, t.isDone)} />
              <span className="flex-1">
                {t.title}
                {t.partner && <span className="text-gray-400"> · партнёр: {t.partner.name}</span>}
              </span>
              <span className="text-gray-400">{t.assignedTo.name}</span>
              {t.dueDate && <span>{new Date(t.dueDate).toLocaleDateString("ru-RU")}</span>}
              <button
                title="Удалить задачу"
                onClick={(e) => { e.preventDefault(); remove(t.id); }}
                className="text-gray-300 hover:text-red-600 px-1"
              >
                ✕
              </button>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
