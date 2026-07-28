"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function SidebarShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Закрываем меню при переходе на другую страницу (мобильная адаптация).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Блокируем прокрутку фона, пока открыто мобильное меню.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Мобильная верхняя панель с кнопкой открытия меню.
          fixed, а не sticky — чтобы не участвовать в общем flex-потоке
          и не мешать раскладке aside/main на десктопе. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-2 bg-white border-b border-gray-200 px-3 h-12">
        <button
          type="button"
          aria-label="Открыть меню"
          onClick={() => setOpen(true)}
          className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 text-gray-700"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <span className="font-bold text-brand-700 text-sm">PartnerOS</span>
      </div>

      {/* Затемнение фона на мобильных, когда меню открыто */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`w-64 md:w-56 shrink-0 border-r border-gray-200 bg-white min-h-screen flex flex-col fixed md:static inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
      >
        <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
          <span className="font-bold text-brand-700">PartnerOS</span>
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
            className="md:hidden p-1 rounded-lg hover:bg-gray-100 text-gray-500"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 flex flex-col gap-1 px-2 py-3 text-sm text-gray-600 overflow-y-auto">
          {children}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100 text-xs text-gray-500 space-y-2">
          {footer}
        </div>
      </aside>
    </>
  );
}
