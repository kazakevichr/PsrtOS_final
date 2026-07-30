import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MyPartnersList from "@/components/MyPartnersList";
import { INACTIVE_STAGE } from "@/lib/economics";

export default async function MyPartnersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const [partnersRaw, projects] = await Promise.all([
    prisma.partner.findMany({
      where: { responsibleUserId: session.user.id, status: "ACTIVE", stage: { not: INACTIVE_STAGE } },
      include: { project: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const partners = partnersRaw.map((p) => ({
    id: p.id,
    name: p.name,
    phone: p.phone,
    instagram: p.instagram,
    telegram: p.telegram,
    adCreativeUrl: p.adCreativeUrl,
    stage: p.stage,
    status: p.status,
    projectId: p.projectId,
    project: { name: p.project.name, currency: p.project.currency },
  }));

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Мои партнёры</h1>
      <p className="text-sm text-gray-500 mb-4">Все партнёры по всем проектам, за которых вы отвечаете</p>
      <MyPartnersList partners={partners} projects={projects} currentUserId={session.user.id} />
    </div>
  );
}
