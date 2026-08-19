import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import FactoryDashboard from "@/components/FactoryDashboard";

// Контент-завод: план тем и статистика производства — только владельцу.
export default async function FactoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/payroll");
  return <FactoryDashboard />;
}
