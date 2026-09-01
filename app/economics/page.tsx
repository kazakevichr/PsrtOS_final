import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import EconomicsView from "@/components/EconomicsView";

// Бухгалтерия: доходы, расходы и метрики эффективности за месяц.
// Раздел только для владельца — здесь видно всю экономику целиком.
export default async function EconomicsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");
  return <EconomicsView />;
}
