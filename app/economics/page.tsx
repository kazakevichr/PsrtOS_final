import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import EconomicsView from "@/components/EconomicsView";

// Бухгалтерия: доходы, расходы и метрики эффективности за месяц.
// Владелец видит экономику целиком, партнёр — своего направления.
// Направление задаётся переключателем в панели, поэтому здесь его нет.
export default async function EconomicsPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "PARTNER"].includes(access.role)) redirect("/");
  // projectId передаём пропом не ради данных, а ради перерисовки: смена
  // направления меняет проп, и клиент перезапрашивает период заново.
  return <EconomicsView canEdit={access.canEdit} projectId={access.projectId} />;
}
