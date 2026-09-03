import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import FactoryDashboard from "@/components/FactoryDashboard";

// Контент-завод: план тем и статистика производства.
// Доступ: владелец (полный) и СММ (просмотр + отметка косяков).
export default async function FactoryPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "SMM", "PARTNER"].includes(access.role)) redirect("/payroll");

  const project = access.projectId
    ? await prisma.project.findUnique({
        where: { id: access.projectId },
        select: { name: true, hasFactory: true },
      })
    : null;

  if (project && !project.hasFactory) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Контент-завод</h1>
        <p className="card text-sm text-gray-500">
          У направления «{project.name}» своего завода пока нет. Он есть у СуперФита — переключи
          направление наверху. Завод для другого направления включается в настройках проекта.
        </p>
      </div>
    );
  }

  return <FactoryDashboard canManage={access.canEdit} />;
}
