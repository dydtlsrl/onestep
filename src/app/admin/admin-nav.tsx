"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin/events", label: "일정" },
  { href: "/admin/applications", label: "가입 승인" },
  { href: "/admin/members", label: "회원" },
  { href: "/admin/invites", label: "초대 링크" },
  { href: "/admin/rates", label: "단가표" },
];

export function AdminNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-wrap gap-1">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <li key={link.href} className="flex-[1_1_160px]">
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center justify-between rounded-lg px-3 text-sm ${
                active ? "bg-[#2a3f6a] font-bold text-white" : "text-[#c9d3e6] hover:bg-[#22355c]"
              }`}
            >
              {link.label}
              {link.href === "/admin/applications" && pendingCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-navy">
                  {pendingCount}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
