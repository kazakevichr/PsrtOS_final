import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { brandsOf } from "@/lib/brands";
import SocialDashboard from "@/components/SocialDashboard";

// Соц.Сети: статистика Instagram/YouTube/TikTok. Направление выбирается в
// панели: в срезе показываем только его аккаунты, а не все подряд.
export default async function SocialPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "SMM", "PARTNER"].includes(access.role)) redirect("/payroll");

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
        <h1 className="text-xl font-bold">{"Соц.Сети"}</h1>
        <p className="card text-sm text-gray-500">
          К направлению «{project.name}» не привязано ни одного аккаунта соцсетей. Привязка задаётся
          в настройках проекта, в блоке «Контент».
        </p>
      </div>
    );
  }

  return (
    <SocialDashboard
      canManage={access.canEdit}
      brands={brands.length ? brands : undefined}
      projectName={project?.name}
    />
  );
}
