import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import CabinetView from "@/components/CabinetView";

// Кабинет СММ: заработок по факту, норма дня, недели и доп задачи.
// Владелец видит то же самое — цифры общие, спорить не о чем.
export default async function CabinetPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "SMM"].includes(access.role)) redirect("/payroll");

  const project = access.projectId
    ? await prisma.project.findUnique({
        where: { id: access.projectId },
        select: { name: true, hasFactory: true },
      })
    : null;

  if (project && !project.hasFactory) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Кабинет СММ</h1>
        <p className="card text-sm text-gray-500">
          Норма контента заведена у СуперФита. У направления «{project.name}» её нет — переключи
          направление наверху.
        </p>
      </div>
    );
  }

  return <CabinetView />;
}
