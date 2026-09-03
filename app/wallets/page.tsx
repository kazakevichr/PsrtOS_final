import { redirect } from "next/navigation";
import { currentAccess } from "@/lib/access";
import WalletsBoard from "@/components/WalletsBoard";

// Кошельки платных сервисов: остатки, пополнения, что останавливает завод.
// Раньше жили вкладкой внутри «Контент-завода», но это раздел про деньги,
// а не про производство — искать его там было неоткуда.
// СММ сюда не ходит: он работает с контентом, а не с деньгами сервисов.
// Партнёр видит кошельки своего направления, но не пополняет их.
export default async function WalletsPage() {
  const access = await currentAccess();
  if (!access) redirect("/login");
  if (!["OWNER", "PARTNER"].includes(access.role)) redirect("/");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Кошельки</h1>
      <WalletsBoard canManage={access.canEdit} />
    </div>
  );
}
