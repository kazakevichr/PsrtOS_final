import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

export default async function Navbar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const isOwner = session.user.role === "OWNER";

  const links = [{ href: "/", label: "Дашборд" }];
  if (isOwner) {
    links.push({ href: "/partners", label: "Партнёры" });
  } else {
    links.push({ href: "/my-partners", label: "Мои партнёры" });
  }
  links.push(
    { href: "/tasks", label: "Задачи" },
    { href: "/payroll", label: "Зарплата" },
    { href: "/lost", label: "Упущенные" }
  );
  if (isOwner) links.push({ href: "/settings/projects", label: "Настройки" });

  return (
    <aside className="w-56 shrink-0 border-r border-gray-200 bg-white min-h-screen flex flex-col">
      <div className="px-4 py-4 border-b border-gray-100">
        <span className="font-bold text-brand-700">PartnerOS</span>
      </div>
      <nav className="flex-1 flex flex-col gap-1 px-2 py-3 text-sm text-gray-600">
        {links.map((l) => (
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
