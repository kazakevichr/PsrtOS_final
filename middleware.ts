import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

// Наблюдатель не пишет — и это решается здесь, а не в каждой ручке.
//
// Права на запись у роли PARTNER нет вообще, поэтому надёжнее перехватить
// любой изменяющий запрос на входе, чем добавлять проверку в три десятка
// мест и надеяться, что в следующей ручке о ней вспомнят. Спрятанная в
// интерфейсе кнопка защищает ровно до первого curl.
const READ_ONLY_ROLES = new Set(["PARTNER"]);
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export default withAuth(function middleware(req) {
  const role = (req as any).nextauth?.token?.role;
  if (
    READ_ONLY_ROLES.has(role) &&
    !SAFE.has(req.method) &&
    // Вход и выход из системы — не изменение данных.
    !req.nextUrl.pathname.startsWith("/api/auth")
  ) {
    return NextResponse.json(
      { error: "Доступ только на просмотр: изменения вносит владелец" },
      { status: 403 }
    );
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/",
    "/projects/:path*",
    "/partners/:path*",
    "/my-partners/:path*",
    "/assistant/:path*",
    "/tasks/:path*",
    "/payroll/:path*",
    "/lost/:path*",
    "/settings/:path*",
    "/insta/:path*",
    "/social/:path*",
    "/analytics/:path*",
    "/oracle/:path*",
    "/factory/:path*",
    "/cabinet/:path*",
    "/economics/:path*",
    "/wallets/:path*",
    // Ручки тоже: запрет на запись должен работать и в обход интерфейса.
    // Завод ходит по ключу, его пути под auth не заводим.
    "/api/((?!auth|ig/host|factory/quota/check).*)",
  ],
};
