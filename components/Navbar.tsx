import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";
import ProjectsNavDropdown from "@/components/ProjectsNavDropdown";

export default async function Navbar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const isOwner = session.user.role === "OWNER";

  const projects = await prisma.project.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const topLinks = [{ href: "/", label: "Дашборд" }];
  const bottomLinks = [{ href: "/assistant", label: "🤖 ИИ-помощник" }];
  if (isOwner) {
    bottomLinks.push({ href: "/partners", label: "Партнёры" });
  } else {
    bottomLinks.push({ href: "/my-partners", label: "Мои партнёры" });
  }
  bottomLinks.push(
    { href: "/tasks", label: "Задачи" },
    { href: "/payroll", label: "Зарплата" },
    { href: "/lost", label: "Упущенные" }
  );
  if (isOwner) bottomLinks.push({ href: "/settings/projects", label: "Настройки" });

  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white min-h-screen flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <span className="font-bold text-brand-700">PartnerOS</span>
      </div>
      <nav className="flex-1 flex flex-col gap-1 px-2 py-3 text-sm text-gray-600">
        {topLinks.map((l) => (
          <Link key={l.href} href={l.href} className="px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-brand-700">
            {l.label}
          </Link>
        ))}
        <ProjectsNavDropdown projects={projects} />
        {bottomLinks.map((l) => (
          <Link key={l.href} href={l.href} className="px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-brand-700">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-4 border-t border-gray-100 text-xs text-gray-500 space-y-2">
        <div>
          {session.user.name} ({isOwner ? "владелец" : "менеджер"})
        </div>
        <SignOutButton />
      </div>
    </aside>
  );
}
