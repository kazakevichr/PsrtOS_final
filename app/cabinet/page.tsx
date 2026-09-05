import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { SMM_ROLES, socialScope } from "@/lib/access";
import { DEFAULT_BRAND, factoryBrand } from "@/lib/factory";
import CabinetView from "@/components/CabinetView";

// Кабинет СММ: заработок по факту, норма дня, недели и доп задачи.
// Владелец видит то же самое — цифры общие, спорить не о чем.
// Партнёр — тоже: производство контента идёт по его направлению и за его
// счёт, и норма, за которую он платит, не может быть от него закрыта.
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
  if (!SMM_ROLES.includes(access.role)) redirect("/payroll");

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

  // Норма и ставки в кабинете описывают работу по СуперФиту: super.fit24 —
  // два видео в день, Лео — четыре карусели, суммы в рублях за месяц. Своего
  // завода мало, чтобы показывать её чужому направлению: включённый завод
  // Оракла иначе притащил бы Ораклу чужую норму и чужую зарплату.
  const scope = await socialScope();
  if (scope && factoryBrand(scope) !== DEFAULT_BRAND) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Кабинет СММ</h1>
        <p className="card text-sm text-gray-500">
          Норма контента заведена только по СуперФиту. У этого направления своей нормы пока нет —
          её нужно описать отдельно: аккаунты, штуки в день и ставка за месяц.
        </p>
      </div>
    );
  }

  return <CabinetView canManage={access.canEdit} />;
}
