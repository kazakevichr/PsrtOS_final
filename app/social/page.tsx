import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SocialDashboard from "@/components/SocialDashboard";

// Соц.Сети: единая статистика Instagram/YouTube/TikTok всех проектов.
export default async function SocialPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/payroll");
  return <SocialDashboard />;
}
