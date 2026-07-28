import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AssistantPickerPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const projects = await prisma.project.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">🤖 ИИ-помощник</h1>
      <p className="text-sm text-gray-500 mb-4">Выберите проект — помощник ответит на основе информации, которую добавил владелец именно по нему.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}/assistant`} className="card hover:shadow-md transition-shadow">
            <div className="font-semibold text-brand-700">{p.name}</div>
            <div className="text-xs text-gray-400 mt-1">
              {p.knowledgeBase?.trim() ? "База знаний заполнена" : "Владелец пока не заполнил описание"}
            </div>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Проектов пока нет.</p>}
      </div>
    </div>
  );
}
