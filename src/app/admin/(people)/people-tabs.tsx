"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/members", label: "회원 목록" },
  { href: "/admin/applications", label: "가입 승인" },
  { href: "/admin/invites", label: "초대 링크" },
];

export function PeopleTabs({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="회원 화면 탭" className="-mt-1 border-b border-line">
      <ul className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3.5 text-[15px] ${
                  active ? "border-brand font-bold text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {tab.label}
                {tab.href === "/admin/applications" && pendingCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
