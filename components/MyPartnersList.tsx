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
  project: { name: string; currency: string };
};

export default function MyPartnersList({ partners }: { partners: Partner[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Partner>>({});
  const [busy, setBusy] = useState(false);

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

  if (partners.length === 0) {
    return <p className="text-sm text-gray-400">У вас пока нет партнёров ни в одном проекте.</p>;
  }

  return (
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
  );
}
