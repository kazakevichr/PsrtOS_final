import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
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

  const brands = (project?.brandKeys || "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <NeuroAnalytics
      isOwner={access.canEdit}
      brands={brands.length ? brands : undefined}
      projectName={project?.name}
    />
  );
}
