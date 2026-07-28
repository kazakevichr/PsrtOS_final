import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHealth, parseFunnelStages } from "@/lib/economics";
import KanbanBoard from "@/components/KanbanBoard";
import AssistantChat from "@/components/AssistantChat";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { partnerTypes: true },
  });
  if (!project) notFound();

  const where: any = { projectId: params.id, status: "ACTIVE" };
  if (session.user.role === "MANAGER") where.responsibleUserId = session.user.id;

  const partnersRaw = await prisma.partner.findMany({
    where,
    include: { responsible: true, partnerType: true },
    orderBy: { createdAt: "desc" },
  });

  const partners = partnersRaw.map((p) => ({
    id: p.id,
    name: p.name,
    stage: p.stage,
    status: p.status,
    health: computeHealth(p, project),
    responsible: { id: p.responsible.id, name: p.responsible.name },
    partnerType: p.partnerType ? { name: p.partnerType.name } : null,
    adCreativeUrl: p.adCreativeUrl,
  }));

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", isActive: true },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <h1 className="text-xl font-bold truncate">{project.name}</h1>
        {/* На мобильных — компактная ссылка на отдельную страницу помощника.
            На десктопе помощник встроен прямо в страницу проекта (ниже), поэтому
            здесь он скрыт. */}
        <Link
          href={`/projects/${project.id}/assistant`}
          className="btn btn-secondary !px-3 !py-1 text-sm shrink-0 md:hidden"
          title="ИИ-помощник"
        >
          <span aria-hidden="true">🤖</span>
          <span className="hidden sm:inline"> ИИ-помощник</span>
        </Link>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Валюта: {project.currency} · KPI: {project.kpiAmount > 0 ? `${project.kpiAmount} ${project.currency}` : "по типу партнёра"} · Бонус: {project.bonusEnabled ? `${project.bonusPercent}%` : "выключен"}
      </p>

      {/* Информация по проекту + ИИ-помощник — сразу на странице, только на десктопе. */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
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

      <KanbanBoard
        projectId={project.id}
        stages={parseFunnelStages(project)}
        partners={partners}
        managers={managers}
        partnerTypes={project.partnerTypes}
        isOwner={session.user.role === "OWNER"}
        currentUserId={session.user.id}
      />
    </div>
  );
}
