"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dev", label: "오류 기록" },
  { href: "/dev/pilot", label: "시범 운영 지표" },
];

export function DevNav() {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center rounded-full px-3.5 text-sm ${active ? "bg-white font-bold text-ink" : "text-[#c9ced6] hover:bg-[#3a3f48]"}`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
