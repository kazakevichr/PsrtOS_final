import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string; txId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только владелец может отмечать выплаты." }, { status: 403 });
  }

  const { partnerPayoutPaid } = await req.json();
  const transaction = await prisma.transaction.update({
    where: { id: params.txId },
    data: { partnerPayoutPaid: Boolean(partnerPayoutPaid) },
  });
  return NextResponse.json(transaction);
}
