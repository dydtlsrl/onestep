"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const LINKS: { href: string; label: string; icon: IconName; also?: string[] }[] = [
  { href: "/", label: "일정", icon: "calendar", also: ["/events"] },
  { href: "/contracts", label: "계약서", icon: "file" },
  { href: "/payments", label: "정산", icon: "wallet" },
  { href: "/me", label: "내 정보", icon: "user", also: ["/withdraw"] },
];

// 회원 화면 아래 탭. 어느 화면에서든 한 번에 일정·계약서·정산·내 정보로 갈 수 있다
export function MemberNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="회원 메뉴" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex h-16 max-w-md">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" || pathname.startsWith("/events") : [link.href, ...(link.also ?? [])].some((h) => pathname.startsWith(h));
          return (
            <li key={link.href} className="flex flex-1">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-bold text-brand-strong" : "text-muted"}`}
              >
                <Icon name={link.icon} className="h-6 w-6" />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
