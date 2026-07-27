import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AssistantChat from "@/components/AssistantChat";

export default async function ProjectAssistantPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) notFound();

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">{project.name} · ИИ-помощник</h1>
        <Link href={`/projects/${project.id}`} className="text-sm text-brand-700 hover:underline">← К партнёрам проекта</Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">Информация от владельца + ИИ, который отвечает на её основе.</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card">
            <h3 className="font-semibold mb-2">Информация по проекту</h3>
            {project.knowledgeBase?.trim() ? (
              <div className="text-sm whitespace-pre-wrap text-gray-700">{project.knowledgeBase}</div>
            ) : (
              <p className="text-sm text-gray-400">
                Владелец пока не заполнил описание проекта.
                {session.user.role === "OWNER" && (
                  <>
                    {" "}
                    <Link href="/settings/projects" className="text-brand-700 hover:underline">Заполнить →</Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="lg:col-span-2">
          <AssistantChat projectId={project.id} />
        </div>
      </div>
    </div>
  );
}
