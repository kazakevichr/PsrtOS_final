import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import OracleDashboard from "@/components/OracleDashboard";

// Аналитика контент-завода Оракла (YouTube + TikTok) — только владельцу.
export default async function OraclePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/payroll");
  return <OracleDashboard />;
}
