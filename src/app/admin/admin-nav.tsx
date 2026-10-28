"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// 회원은 회원 목록·가입 승인·초대 링크를 탭으로 묶은 한 화면이다 (also: 그 탭들의 주소)
const LINKS: { href: string; label: string; also?: string[] }[] = [
  { href: "/admin/events", label: "일정" },
  { href: "/admin/members", label: "회원", also: ["/admin/applications", "/admin/invites"] },
  { href: "/admin/payments", label: "정산" },
  { href: "/admin/rates", label: "단가표" },
  { href: "/admin/contracts", label: "계약서 양식" },
  { href: "/admin/settings", label: "설정" },
];

// 컴퓨터: 왼쪽 세로 메뉴. 휴대폰: 옆으로 밀어 보는 한 줄 메뉴 (화면 위를 적게 차지하도록)
export function AdminNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);

  // 휴대폰에서 지금 메뉴가 화면 밖(오른쪽)에 있으면 보이게 옆으로 민다
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !active || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  return (
    <ul ref={listRef} className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:p-0">
      {LINKS.map((link) => {
        const active = [link.href, ...(link.also ?? [])].some((href) => pathname.startsWith(href));
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm md:h-11 md:justify-between md:rounded-lg md:px-3 ${
                active ? "bg-[#2a3f6a] font-bold text-white" : "text-[#c9d3e6] hover:bg-[#22355c]"
              }`}
            >
              {link.label}
              {link.href === "/admin/members" && pendingCount > 0 && (
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
