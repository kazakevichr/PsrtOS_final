import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProjectSettingsForm from "@/components/ProjectSettingsForm";
import Link from "next/link";

export default async function ProjectSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");

  const projects = await prisma.project.findMany({
    include: { partnerTypes: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Настройки проектов</h1>
        <Link href="/settings/users" className="btn btn-secondary">Сотрудники →</Link>
      </div>
      <div className="space-y-4">
        {projects.map((p) => (
          <ProjectSettingsForm key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}
