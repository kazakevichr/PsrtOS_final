import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import WalletsBoard from "@/components/WalletsBoard";

// Кошельки платных сервисов: остатки, пополнения, что останавливает завод.
// Раньше жили вкладкой внутри «Контент-завода», но это раздел про деньги,
// а не про производство — искать его там было неоткуда.
// СММ сюда не ходит: он работает с контентом, а не с деньгами сервисов.
// Партнёр видит кошельки своего направления, но не пополняет их.
export default async function WalletsPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "PARTNER"].includes(access.role)) redirect("/");

  // Ключ кошельков совпадает с источником дохода направления: и то и другое
  // отвечает на вопрос «с какой внешней системой связан этот проект».
  // Пусто — у направления нет своих платных сервисов.
  const project = access.projectId
    ? await prisma.project.findUnique({
        where: { id: access.projectId },
        select: { name: true, incomeSource: true },
      })
    : null;

  if (access.projectId && !project?.incomeSource) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Кошельки</h1>
        <p className="card text-sm text-gray-500">
          У направления «{project?.name}» нет своих платных сервисов. Кошельки заведены у Оракла и
          СуперФита — переключи направление наверху, чтобы их увидеть.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Кошельки</h1>
      <WalletsBoard canManage={access.canEdit} lockTo={project?.incomeSource || undefined} />
    </div>
  );
}
