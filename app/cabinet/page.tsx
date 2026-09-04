import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import CabinetView from "@/components/CabinetView";

// Кабинет СММ: заработок по факту, норма дня, недели и доп задачи.
// Владелец видит то же самое — цифры общие, спорить не о чем.
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

export default async function CabinetPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "SMM"].includes(access.role)) redirect("/payroll");

  const project = await factoryGate(access.projectId);

  if (project) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Кабинет СММ</h1>
        <p className="card text-sm text-gray-500">
          У направления «{project.name}» нормы контента нет — она заводится вместе с заводом, в настройках проекта.
        </p>
      </div>
    );
  }

  return <CabinetView />;
}
