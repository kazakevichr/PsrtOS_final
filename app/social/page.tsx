import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import SocialDashboard from "@/components/SocialDashboard";

// Соц.Сети: единая статистика Instagram/YouTube/TikTok всех проектов.
// Доступ: владелец (полный) и СММ (только просмотр).
export default async function SocialPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!["OWNER", "SMM"].includes(session.user.role)) redirect("/payroll");
  return <SocialDashboard canManage={session.user.role === "OWNER"} />;
}
