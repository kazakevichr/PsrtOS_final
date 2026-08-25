import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import CabinetView from "@/components/CabinetView";

// Кабинет СММ: заработок по факту, норма дня, недели и доп задачи.
// Владелец видит то же самое — цифры общие, спорить не о чем.
export default async function CabinetPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!["OWNER", "SMM"].includes(session.user.role)) redirect("/payroll");
  return <CabinetView />;
}
