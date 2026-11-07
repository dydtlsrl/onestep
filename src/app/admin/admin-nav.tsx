"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  also?: string[];
  exact?: boolean;
}

// 매일 쓰는 메뉴. 회원은 회원 목록·가입 승인·초대 링크·명단을 탭으로 묶은 한 화면이다 (also: 그 탭들의 주소)
const MAIN: NavLink[] = [
  { href: "/admin", label: "홈", icon: "home", exact: true },
  { href: "/admin/events", label: "일정", icon: "calendar" },
  { href: "/admin/members", label: "회원", icon: "users", also: ["/admin/applications", "/admin/invites", "/admin/roster"] },
  { href: "/admin/payments", label: "정산", icon: "wallet" },
];

// 가끔 바꾸는 설정. 휴대폰에서는 "더보기" 안에 둔다
const SETUP: NavLink[] = [
  { href: "/admin/rates", label: "단가표", icon: "tag" },
  { href: "/admin/contracts", label: "계약서 양식", icon: "file" },
  { href: "/admin/settings", label: "설정", icon: "gear" },
];

function isActive(link: NavLink, pathname: string) {
  return link.exact ? pathname === link.href : [link.href, ...(link.also ?? [])].some((href) => pathname.startsWith(href));
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only">건 처리 대기</span>
    </span>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={className}>
        <Icon name="logout" />
        로그아웃
      </button>
    </form>
  );
}

// 컴퓨터(768px 이상): 왼쪽 세로 메뉴. 매일 쓰는 것과 설정을 나눠 둔다
export function AdminSidebar({ pendingCount, name }: { pendingCount: number; name: string }) {
  const pathname = usePathname();
  const item = (link: NavLink) => {
    const active = isActive(link, pathname);
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-10 items-center gap-2.5 rounded-lg px-3 text-[15px] ${
            active ? "bg-brand-soft font-bold text-brand-strong" : "text-body hover:bg-ground hover:text-ink"
          }`}
        >
          <Icon name={link.icon} />
          <span className="flex-1">{link.label}</span>
          {link.href === "/admin/members" && <Badge count={pendingCount} />}
        </Link>
      </li>
    );
  };

  return (
    <div className="hidden w-56 shrink-0 border-r border-line bg-white md:block">
      <nav aria-label="관리자 메뉴" className="sticky top-0 flex h-dvh flex-col gap-6 px-3 py-6">
        <Link href="/admin" className="flex flex-col gap-0.5 px-3">
          <span className="text-lg font-bold tracking-tight text-ink">원스텝</span>
          <span className="text-xs text-muted">관리자 · {name}</span>
        </Link>
        <ul className="flex flex-col gap-1">{MAIN.map(item)}</ul>
        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-bold text-muted">운영 설정</p>
          <ul className="flex flex-col gap-1">{SETUP.map(item)}</ul>
        </div>
        <div className="mt-auto">
          <SignOut className="flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[15px] text-muted hover:bg-ground hover:text-ink" />
        </div>
      </nav>
    </div>
  );
}

// 휴대폰: 화면 아래 탭 (엄지로 누르기 쉬운 자리). 설정과 로그아웃은 "더보기"에서 연다
export function AdminTabBar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();
  // 더보기를 연 화면의 주소. 다른 화면으로 가면 주소가 달라져 저절로 닫힌다
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreOpen = openedAt === pathname;
  const setMoreOpen = (open: boolean) => setOpenedAt(open ? pathname : null);
  const moreActive = SETUP.some((l) => isActive(l, pathname));
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedAt(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const tab = "relative flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[11px]";
  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-ink/30 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            id="admin-more"
            role="dialog"
            aria-label="더보기"
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] mx-3 mb-2 flex flex-col rounded-2xl bg-white p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {SETUP.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link, pathname) ? "page" : undefined}
                className={`flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] ${isActive(link, pathname) ? "bg-brand-soft font-bold text-brand-strong" : "text-ink hover:bg-ground"}`}
              >
                <Icon name={link.icon} />
                {link.label}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            <SignOut className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-muted hover:bg-ground" />
          </div>
        </div>
      )}
      <nav
        aria-label="관리자 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="flex h-16">
          {MAIN.map((link) => {
            const active = isActive(link, pathname) && !moreOpen;
            return (
              <li key={link.href} className="flex flex-1">
                <Link href={link.href} aria-current={active ? "page" : undefined} className={`${tab} ${active ? "font-bold text-brand-strong" : "text-muted"}`}>
                  <span className="relative">
                    <Icon name={link.icon} className="h-6 w-6" />
                    {link.href === "/admin/members" && pendingCount > 0 && (
                      <span className="absolute -right-2.5 -top-1.5">
                        <Badge count={pendingCount} />
                      </span>
                    )}
                  </span>
                  {link.label}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls="admin-more"
              onClick={() => setMoreOpen(!moreOpen)}
              className={`${tab} ${moreOpen || moreActive ? "font-bold text-brand-strong" : "text-muted"}`}
            >
              <Icon name="more" className="h-6 w-6" />
              더보기
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
