import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computePayroll, resolvePeriod, INACTIVE_STAGE } from "@/lib/economics";
import CreateUserForm from "@/components/CreateUserForm";
import EmployeeStatusToggle from "@/components/EmployeeStatusToggle";
import TgAdmin from "@/components/TgAdmin";
import TgLinkButton from "@/components/TgLinkButton";
import AccessEditor from "@/components/AccessEditor";
import { currentAccess } from "@/lib/access";

export default async function UsersSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");

  const access = await currentAccess();
  // В срезе направления показываем тех, кто на нём работает. Владелец в
  // списке всегда: без него страница выглядит так, будто его уволили.
  const scope = access?.projectId
    ? {
        OR: [
          { role: "OWNER" },
          { access: { some: { projectId: access.projectId } } },
        ],
      }
    : {};

  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: scope,
      orderBy: { createdAt: "asc" },
      include: { access: { select: { projectId: true, level: true } } },
    }),
    // В срезе направления и доступы правятся только по нему: раздавать
    // права на чужой проект, глядя на его сотрудников, — верный способ
    // промахнуться строкой.
    prisma.project.findMany({
      where: { isActive: true, ...(access?.projectId ? { id: access.projectId } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const period = resolvePeriod("month");

  const rows = await Promise.all(
    users.map(async (u) => {
      const [activePartners, payroll] = await Promise.all([
        prisma.partner.count({ where: { responsibleUserId: u.id, status: "ACTIVE", stage: { not: INACTIVE_STAGE } } }),
        computePayroll(u.id, period),
      ]);
      return { ...u, activePartners, kpiTotal: payroll.kpiTotal };
    })
  );

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Сотрудники</h1>
      <TgAdmin />
      <div className="card mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">Имя</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Роль</th>
              <th className="py-2 pr-4">Направления</th>
              <th className="py-2 pr-4">Оклад</th>
              <th className="py-2 pr-4">Начал работать</th>
              <th className="py-2 pr-4">Активных партнёров</th>
              <th className="py-2 pr-4">KPI ({period.label})</th>
              <th className="py-2 pr-4">Телеграм</th>
              <th className="py-2 pr-4">Статус</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className={`border-b last:border-0 ${!u.isActive ? "opacity-50" : ""}`}>
                <td className="py-2 pr-4">{u.name}</td>
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">
                  {u.role === "OWNER"
                    ? "Владелец"
                    : u.role === "SMM"
                      ? "СММ"
                      : u.role === "PARTNER"
                        ? "Партнёр"
                        : "Менеджер партнёров"}
                </td>
                <td className="py-2 pr-4">
                  {u.role === "OWNER" ? (
                    <span className="text-xs text-gray-400">все — доступы не нужны</span>
                  ) : (
                    <AccessEditor userId={u.id} projects={projects} access={u.access} />
                  )}
                </td>
                <td className="py-2 pr-4">{u.fixedSalary.toLocaleString("ru-RU")} ₽</td>
                <td className="py-2 pr-4">{new Date(u.createdAt).toLocaleDateString("ru-RU")}</td>
                <td className="py-2 pr-4">{u.activePartners}</td>
                <td className="py-2 pr-4">{u.kpiTotal.toLocaleString("ru-RU")} ₽</td>
                <td className="py-2 pr-4">
                  <TgLinkButton userId={u.id} tgUsername={u.tgUsername} linked={Boolean(u.tgChatId)} />
                </td>
                <td className="py-2 pr-4">{u.isActive ? "Активен" : "Уволен"}</td>
                <td className="py-2 pr-4">
                  {u.role !== "OWNER" && <EmployeeStatusToggle userId={u.id} isActive={u.isActive} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CreateUserForm />
    </div>
  );
}
