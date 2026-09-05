import { redirect } from "next/navigation";
import { SMM_ROLES, currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import FactoryDashboard from "@/components/FactoryDashboard";

// Контент-завод: план тем и статистика производства.
// Доступ: владелец (полный) и СММ (просмотр + отметка косяков).
/**
 * Есть ли у направления свой завод — и стоит ли вообще спрашивать.
 *
 * Признак новый и по умолчанию выключен, поэтому пока его никому не
 * проставили, гасить работающий раздел нельзя: новое поле со значением по
 * умолчанию не должно выключать то, что вчера работало. Пока ни у одного
 * направления завод не отмечен, показываем как раньше.
 */
async function factoryGate(projectId: string | null) {
  if (!projectId) return null;
  const marked = await prisma.project.count({ where: { hasFactory: true } });
  if (marked === 0) return null;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, hasFactory: true },
  });
  return project && !project.hasFactory ? project : null;
}

export default async function FactoryPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!SMM_ROLES.includes(access.role)) redirect("/payroll");

  const project = await factoryGate(access.projectId);
  const name = access.projectId
    ? (await prisma.project.findUnique({
        where: { id: access.projectId },
        select: { name: true },
      }))?.name
    : undefined;

  if (project) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Контент-завод</h1>
        <p className="card text-sm text-gray-500">
          У направления «{project.name}» своего завода пока нет. Завод включается в настройках проекта, в блоке «Контент».
        </p>
      </div>
    );
  }

  return <FactoryDashboard canManage={access.canEdit} projectName={name} />;
}
