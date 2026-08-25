import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import NeuroAnalytics from "@/components/NeuroAnalytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getServerSession(authOptions);
  if (!session || !["OWNER", "SMM"].includes(session.user.role)) redirect("/");
  return <NeuroAnalytics isOwner={session.user.role === "OWNER"} />;
}
