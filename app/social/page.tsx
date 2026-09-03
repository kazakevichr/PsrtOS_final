import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
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

  const brands = (project?.brandKeys || "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <SocialDashboard
      canManage={access.canEdit}
      brands={brands.length ? brands : undefined}
      projectName={project?.name}
    />
  );
}
