import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import WalletsBoard from "@/components/WalletsBoard";

// Кошельки платных сервисов: остатки, пополнения, что останавливает завод.
// Раньше жили вкладкой внутри «Контент-завода», но это раздел про деньги,
// а не про производство — искать его там было неоткуда.
// Только владелец (решение Романа 02.09): СММ работает с контентом, а не
// с деньгами сервисов, и остатки на счетах ему знать незачем.
export default async function WalletsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user.role !== "OWNER") redirect("/");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Кошельки</h1>
      <WalletsBoard canManage />
    </div>
  );
}
