import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(users);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "Только владелец может добавлять сотрудников" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.email || !body?.password) {
    return NextResponse.json({ error: "Заполните имя, email и пароль" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const fixedSalary = body.fixedSalary !== undefined && body.fixedSalary !== "" ? Number(body.fixedSalary) : 15000;

  // Две роли сотрудников: менеджер партнёров и СММ. Владельца через этот
  // роут создать нельзя.
  const role = ["SMM", "PARTNER", "OWNER"].includes(body.role) ? body.role : "MANAGER";

  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash,
      role,
      fixedSalary: Number.isFinite(fixedSalary) ? fixedSalary : 15000,
    },
  });

  return NextResponse.json({ id: user.id, name: user.name, email: user.email, role: user.role });
}
