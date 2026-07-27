import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeHealth } from "@/lib/economics";

export default async function AllPartnersPage({
  searchParams,
}: {
  searchParams: { projectId?: string; managerId?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/my-partners");

  const [projects, managers] = await Promise.all([
    prisma.project.findMany({ orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: "MANAGER" }, orderBy: { name: "asc" } }),
  ]);

  const where: any = {};
  if (searchParams.projectId) where.projectId = searchParams.projectId;
  if (searchParams.managerId) where.responsibleUserId = searchParams.managerId;

  const partners = await prisma.partner.findMany({
    where,
    include: { project: true, responsible: true, transactions: true },
    orderBy: { createdAt: "desc" },
  });

  const badgeClass = { GREEN: "badge-green", YELLOW: "badge-yellow", RED: "badge-red" } as const;
  const badgeLabel = { GREEN: "🟢", YELLOW: "🟡", RED: "🔴" } as const;

  function buildUrl(params: Record<string, string | undefined>) {
    const usp = new URLSearchParams();
    const merged = { projectId: searchParams.projectId, managerId: searchParams.managerId, ...params };
    Object.entries(merged).forEach(([k, v]) => v && usp.set(k, v));
    const qs = usp.toString();
    return qs ? `/partners?${qs}` : "/partners";
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Партнёры</h1>
      <p className="text-sm text-gray-500 mb-4">Единая база по всем проектам и сотрудникам · всего: {partners.length}</p>

      <div className="flex flex-wrap gap-2 mb-2 text-xs items-center">
        <span className="text-gray-400 mr-1">Проект:</span>
        <Link
          href={buildUrl({ projectId: undefined })}
          className={`px-3 py-1 rounded-full border ${!searchParams.projectId ? "bg-brand-700 text-white border-brand-700" : "bg-white text-gray-600 border-gray-200"}`}
        >
          Все
        </Link>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={buildUrl({ projectId: searchParams.projectId === p.id ? undefined : p.id })}
            className={`px-3 py-1 rounded-full border ${searchParams.projectId === p.id ? "bg-brand-700 text-white border-brand-700" : "bg-white text-gray-600 border-gray-200"}`}
          >
            {p.name}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4 text-xs items-center">
        <span className="text-gray-400 mr-1">Сотрудник:</span>
        <Link
          href={buildUrl({ managerId: undefined })}
          className={`px-3 py-1 rounded-full border ${!searchParams.managerId ? "bg-brand-700 text-white border-brand-700" : "bg-white text-gray-600 border-gray-200"}`}
        >
          Все
        </Link>
        {managers.map((m) => (
          <Link
            key={m.id}
            href={buildUrl({ managerId: searchParams.managerId === m.id ? undefined : m.id })}
            className={`px-3 py-1 rounded-full border ${searchParams.managerId === m.id ? "bg-brand-700 text-white border-brand-700" : "bg-white text-gray-600 border-gray-200"}`}
          >
            {m.name}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-4">Имя</th>
              <th className="py-2 pr-4">Проект</th>
              <th className="py-2 pr-4">Сотрудник</th>
              <th className="py-2 pr-4">Стадия</th>
              <th className="py-2 pr-4">Здоровье</th>
              <th className="py-2 pr-4">Телефон</th>
              <th className="py-2 pr-4">Выручка</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => {
              const health = computeHealth(p, p.project);
              const revenue = p.transactions.reduce((s, t) => s + t.revenueAmount, 0);
              return (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/partners/${p.id}`} className="text-brand-700 hover:underline">{p.name}</Link>
                  </td>
                  <td className="py-2 pr-4">{p.project.name}</td>
                  <td className="py-2 pr-4">{p.responsible.name}</td>
                  <td className="py-2 pr-4">{p.stage}</td>
                  <td className="py-2 pr-4">
                    <span className={badgeClass[health]}>{badgeLabel[health]}</span>
                  </td>
                  <td className="py-2 pr-4">{p.phone || "—"}</td>
                  <td className="py-2 pr-4">{revenue.toLocaleString("ru-RU")} {p.project.currency}</td>
                </tr>
              );
            })}
            {partners.length === 0 && (
              <tr><td colSpan={7} className="py-4 text-center text-gray-400">Нет партнёров по выбранным фильтрам.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
