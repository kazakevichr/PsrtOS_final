import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "PartnerOS",
  description: "Система управления партнёрской сетью",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <Providers>
          <div className="flex min-h-screen">
            <Navbar />
            <main className="flex-1 min-w-0 px-4 sm:px-8 py-6 pt-16 md:pt-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
