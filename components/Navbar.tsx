import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";
import ProjectsNavDropdown from "@/components/ProjectsNavDropdown";
import SidebarShell from "@/components/SidebarShell";

export default async function Navbar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const isOwner = session.user.role === "OWNER";

  const projects = await prisma.project.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const linkClass = "px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-brand-700";

  const navLink = (href: string, label: string) => (
    <Link key={href} href={href} className={linkClass}>
      {label}
    </Link>
  );

  const kanbanDropdown = <ProjectsNavDropdown key="kanban" projects={projects} />;
  const dashboardLink = navLink("/", "Дашборд");
  // Раньше называлась "ИИ-помощник" — теперь раздел "Проекты" (по запросу).
  const projectsLink = navLink("/assistant", "🤖 Проекты");
  const partnersLink = isOwner ? navLink("/partners", "Партнёры") : navLink("/my-partners", "Мои партнёры");
  const tasksLink = navLink("/tasks", "Задачи");
  const payrollLink = navLink("/payroll", "Зарплата");
  const lostLink = navLink("/lost", "Упущенные");

  // У владельца порядок вкладок: Дашборд, Зарплата, Сотрудники, Партнёры,
  // Канбан, Упущенные, Задачи, Настройки. Отдельная ссылка "Проекты"
  // (ИИ-помощник) владельцу не нужна — помощник уже встроен в страницу проекта.
  // У менеджера — свой порядок: Зарплата, Мои партнёры, Канбан, Проекты,
  // Упущенные, Задачи. Раздела "Дашборд" у менеджера нет — его данные
  // показаны наверху страницы "Зарплата".
  const items = isOwner
    ? [
        dashboardLink,
        payrollLink,
        navLink("/settings/users", "Сотрудники"),
        partnersLink,
        kanbanDropdown,
        lostLink,
        tasksLink,
        navLink("/insta", "Инстаграм"),
        navLink("/settings/projects", "Настройки"),
      ]
    : [payrollLink, partnersLink, kanbanDropdown, projectsLink, lostLink, tasksLink];

  return (
    <SidebarShell
      footer={
        <>
          <div>
            {session.user.name} ({isOwner ? "владелец" : "менеджер"})
          </div>
          <SignOutButton />
        </>
      }
    >
      {items}
    </SidebarShell>
  );
}
