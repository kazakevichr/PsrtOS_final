import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";
import ProjectsNavDropdown from "@/components/ProjectsNavDropdown";
import SidebarShell from "@/components/SidebarShell";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "владелец",
  MANAGER: "менеджер партнёров",
  SMM: "СММ",
};

export default async function Navbar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const role = session.user.role;
  const isOwner = role === "OWNER";

  // СММ не работает с проектами — не дёргаем базу зря.
  const projects = isOwner || role === "MANAGER"
    ? await prisma.project.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const linkClass = "px-3 py-2 rounded-lg hover:bg-gray-50 hover:text-brand-700";

  const navLink = (href: string, label: string) => (
    <Link key={href} href={href} className={linkClass}>
      {label}
    </Link>
  );

  const groupTitle = (title: string) => (
    <div key={`g-${title}`} className="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 first:pt-0">
      {title}
    </div>
  );

  const kanbanDropdown = <ProjectsNavDropdown key="kanban" projects={projects} />;

  const partnerGroup = [
    groupTitle("Партнёрский менеджмент"),
    navLink("/tasks", "Задачи"),
    isOwner ? navLink("/partners", "Партнёры") : navLink("/my-partners", "Мои партнёры"),
    kanbanDropdown,
    // Раньше называлась "ИИ-помощник" — раздел "Проекты" нужен только менеджеру:
    // владельцу помощник уже встроен в страницу проекта.
    ...(isOwner ? [] : [navLink("/assistant", "🤖 Проекты")]),
    navLink("/lost", "Упущенные"),
  ];

  const smmGroup = [
    groupTitle("СММ"),
    navLink("/social", "Соц.Сети"),
    navLink("/analytics", "Нейро-аналитика"),
    navLink("/factory", "Контент-завод"),
    navLink("/cabinet", "Кабинет СММ"),
  ];

  const teamGroup = [
    groupTitle("Управление командой"),
    navLink("/", "Дашборд"),
    navLink("/settings/users", "Сотрудники"),
    navLink("/payroll", "Зарплата"),
    navLink("/settings/projects", "Настройки"),
  ];

  // Владелец видит всё; менеджер партнёров — только партнёрский блок и свою
  // зарплату; СММ — только блок СММ.
  const items = isOwner
    ? [...partnerGroup, ...smmGroup, ...teamGroup]
    : role === "SMM"
      ? smmGroup
      : [...partnerGroup, navLink("/payroll", "Зарплата")];

  return (
    <SidebarShell
      footer={
        <>
          <div>
            {session.user.name} ({ROLE_LABEL[role] || "сотрудник"})
          </div>
          <SignOutButton />
        </>
      }
    >
      {items}
    </SidebarShell>
  );
}
