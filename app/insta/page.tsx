import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import InstaDashboard from "@/components/InstaDashboard";

// Статистика Instagram-аккаунтов — только для владельца, как и общий дашборд.
export default async function InstaPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/payroll");
  return <InstaDashboard />;
}
