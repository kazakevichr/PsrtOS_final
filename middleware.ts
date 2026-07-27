export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/",
    "/projects/:path*",
    "/partners/:path*",
    "/tasks/:path*",
    "/payroll/:path*",
    "/lost/:path*",
    "/settings/:path*",
  ],
};
