"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CalendarRange, Users, BellRing } from "lucide-react";

const TABS = [
  { href: "/", label: "Tournée", icon: CalendarDays },
  { href: "/semaine", label: "Semaine", icon: CalendarRange },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/alertes", label: "Alertes", icon: BellRing },
];

export function BottomNav({ alertesCount = 0 }: { alertesCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-pine/10 safe-bottom print:hidden">
      <ul className="flex items-stretch justify-around">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-coral" : "text-pine/50"
                }`}
              >
                <span className="relative">
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.3 : 1.8}
                    className={active ? "text-coral" : "text-pine/50"}
                  />
                  {href === "/alertes" && alertesCount > 0 && (
                    <span
                      className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-coral px-1 text-center text-[10px] font-bold leading-[18px] text-white"
                      aria-label={`${alertesCount} alerte${alertesCount > 1 ? "s" : ""}`}
                    >
                      {alertesCount > 99 ? "99+" : alertesCount}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
