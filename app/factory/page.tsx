import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import FactoryDashboard from "@/components/FactoryDashboard";

// Контент-завод: план тем и статистика производства.
// Доступ: владелец (полный) и СММ (просмотр + отметка косяков).
export default async function FactoryPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!["OWNER", "SMM"].includes(session.user.role)) redirect("/payroll");
  return <FactoryDashboard canManage={session.user.role === "OWNER"} />;
}
