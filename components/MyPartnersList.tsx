"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Partner = {
  id: string;
  name: string;
  phone: string | null;
  instagram: string | null;
  telegram: string | null;
  stage: string;
  status: string;
  projectId: string;
  project: { name: string; currency: string };
};

type Project = { id: string; name: string };

export default function MyPartnersList({
  partners,
  projects,
  currentUserId,
}: {
  partners: Partner[];
  projects: Project[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Partner>>({});
  const [busy, setBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newProjectId, setNewProjectId] = useState(projects[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newInstagram, setNewInstagram] = useState("");
  const [newTelegram, setNewTelegram] = useState("");
  const [newComment, setNewComment] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  function startEdit(p: Partner) {
    setEditingId(p.id);
    setForm({ name: p.name, phone: p.phone ?? "", instagram: p.instagram ?? "", telegram: p.telegram ?? "" });
  }

  async function save(id: string) {
    setBusy(true);
    await fetch(`/api/partners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    setEditingId(null);
    router.refresh();
  }

  async function addPartner(e: React.FormEvent) {
    e.preventDefault();
    if (!newProjectId || !newName.trim()) return;
    setAddBusy(true);
    const res = await fetch("/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: newProjectId,
        name: newName,
        phone: newPhone,
        instagram: newInstagram,
        telegram: newTelegram,
        responsibleUserId: currentUserId,
      }),
    });
    if (res.ok && newComment.trim()) {
      const created = await res.json();
      await fetch(`/api/partners/${created.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment }),
      });
    }
    setAddBusy(false);
    setShowAdd(false);
    setNewName("");
    setNewPhone("");
    setNewInstagram("");
    setNewTelegram("");
    setNewComment("");
    router.refresh();
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn btn-primary" onClick={() => setShowAdd((v) => !v)}>
          + Добавить партнёра
        </button>
      </div>

      {showAdd && (
        <form onSubmit={addPartner} className="card mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select className="input" value={newProjectId} onChange={(e) => setNewProjectId(e.target.value)} required>
            {projects.map((pr) => (
              <option key={pr.id} value={pr.id}>{pr.name}</option>
            ))}
          </select>
          <input className="input" placeholder="Имя партнёра" value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <input className="input" placeholder="Телефон" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <input className="input" placeholder="Instagram" value={newInstagram} onChange={(e) => setNewInstagram(e.target.value)} />
          <input className="input" placeholder="Telegram" value={newTelegram} onChange={(e) => setNewTelegram(e.target.value)} />
          <textarea
            className="input sm:col-span-2"
            placeholder="Комментарий (необязательно)"
            rows={2}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="sm:col-span-2 flex gap-2">
            <button className="btn btn-primary" disabled={addBusy} type="submit">Сохранить</button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowAdd(false)}>Отмена</button>
          </div>
        </form>
      )}

      {partners.length === 0 ? (
        <p className="text-sm text-gray-400">У вас пока нет партнёров ни в одном проекте.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Имя</th>
                <th className="py-2 pr-4">Проект</th>
                <th className="py-2 pr-4">Стадия</th>
                <th className="py-2 pr-4">Телефон</th>
                <th className="py-2 pr-4">Instagram</th>
                <th className="py-2 pr-4">Telegram</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id} className="border-b last:border-0 align-top">
                  {editingId === p.id ? (
                    <>
                      <td className="py-2 pr-4">
                        <input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                      </td>
                      <td className="py-2 pr-4 text-gray-400">{p.project.name}</td>
                      <td className="py-2 pr-4 text-gray-400">{p.stage}</td>
                      <td className="py-2 pr-4">
                        <input className="input" value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </td>
                      <td className="py-2 pr-4">
                        <input className="input" value={form.instagram ?? ""} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
                      </td>
                      <td className="py-2 pr-4">
                        <input className="input" value={form.telegram ?? ""} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        <button className="btn btn-primary !px-2 !py-1 text-xs mr-1" disabled={busy} onClick={() => save(p.id)}>
                          Сохранить
                        </button>
                        <button className="btn btn-secondary !px-2 !py-1 text-xs" onClick={() => setEditingId(null)}>
                          Отмена
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-4 font-medium">
                        <Link href={`/partners/${p.id}`} className="text-brand-700 hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4">{p.project.name}</td>
                      <td className="py-2 pr-4">{p.stage}</td>
                      <td className="py-2 pr-4">{p.phone || "—"}</td>
                      <td className="py-2 pr-4">{p.instagram || "—"}</td>
                      <td className="py-2 pr-4">{p.telegram || "—"}</td>
                      <td className="py-2 pr-4">
                        <button className="btn btn-secondary !px-2 !py-1 text-xs" onClick={() => startEdit(p)}>
                          Редактировать
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
