import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { brandsOf } from "@/lib/brands";
import NeuroAnalytics from "@/components/NeuroAnalytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const access = await currentAccess();
  if (!access || !["OWNER", "SMM", "PARTNER"].includes(access.role)) redirect("/");

  // Аналитика разбирает те же аккаунты, что и Соц.Сети, — значит и рамки
  // направления у них должны быть одни.
  const project = access.projectId
    ? await prisma.project.findUnique({
        where: { id: access.projectId },
        select: { name: true, brandKeys: true },
      })
    : null;

  const brands = project ? brandsOf(project) : [];

  // У направления нет ни одного аккаунта — показываем пустое место, а не всё
  // подряд. Молчаливый откат к «показать всё» и был причиной того, что срез
  // выглядел сделанным и не работал.
  if (project && brands.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">{"Нейро-аналитика"}</h1>
        <p className="card text-sm text-gray-500">
          К направлению «{project.name}» не привязано ни одного аккаунта соцсетей. Привязка задаётся
          в настройках проекта, в блоке «Контент».
        </p>
      </div>
    );
  }

  return (
    <NeuroAnalytics
      isOwner={access.canEdit}
      brands={brands.length ? brands : undefined}
      projectName={project?.name}
    />
  );
}
