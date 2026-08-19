/** @type {import('next').NextConfig} */
const nextConfig = {
  // instrumentation.ts — ежедневный сбор инста-статистики внутри приложения
  experimental: { instrumentationHook: true },
};
export default nextConfig;
