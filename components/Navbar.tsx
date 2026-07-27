import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SignOutButton from "@/components/SignOutButton";

export default async function Navbar() {
  const session = await getServerSession(authOptions);
  if (!session) return null;
  const isOwner = session.user.role === "OWNER";

  const links = [
    { href: "/", label: "Дашборд" },
    { href: "/tasks", label: "Задачи" },
    { href: "/payroll", label: "Зарплата" },
    { href: "/lost", label: "Упущенные" },
  ];
  if (isOwner) links.push({ href: "/settings/projects", label: "Настройки" });

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-bold text-brand-700">PartnerOS</span>
          <nav className="flex gap-4 text-sm text-gray-600">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-brand-700">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span>
            {session.user.name} ({isOwner ? "владелец" : "менеджер"})
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
