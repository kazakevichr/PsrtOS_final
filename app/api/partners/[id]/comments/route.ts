import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { text } = await req.json();
  const comment = await prisma.comment.create({
    data: { partnerId: params.id, userId: session.user.id, text },
  });
  return NextResponse.json(comment);
}
