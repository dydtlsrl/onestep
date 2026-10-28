"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  { href: "/admin/members", label: "회원 목록" },
  { href: "/admin/applications", label: "가입 승인" },
  { href: "/admin/invites", label: "초대 링크" },
  { href: "/admin/roster", label: "명단으로 초대" },
];

export function PeopleTabs({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  // 휴대폰에서 지금 탭이 화면 밖(오른쪽)에 있으면 보이게 옆으로 민다
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <nav aria-label="회원 화면 탭" className="-mt-1 border-b border-line">
      <ul ref={listRef} className="flex gap-1 overflow-x-auto">
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
