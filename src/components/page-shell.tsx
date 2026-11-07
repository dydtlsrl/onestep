import Link from "next/link";
import { MemberNav } from "@/components/member-nav";

// 회원 화면의 기본 틀: 휴대폰 폭에 맞춘 가운데 정렬 카드. actions는 머리글 오른쪽(알림 등)에 놓는다.
// nav: 승인된 회원 화면이면 아래 탭 메뉴(일정·계약서·정산·내 정보)를 붙인다. 로그인·가입·안내 화면에는 붙이지 않는다.
export function PageShell({ children, actions, nav = false }: { children: React.ReactNode; actions?: React.ReactNode; nav?: boolean }) {
  return (
    <>
      <main className={`mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 ${nav ? "pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4" : "py-8"}`}>
        <header className="flex min-h-11 items-center justify-between gap-3">
          {nav ? (
            <Link href="/" className="text-lg font-bold tracking-tight">
              원스텝
            </Link>
          ) : (
            <span className="text-lg font-bold tracking-tight">원스텝</span>
          )}
          {actions}
        </header>
        {children}
      </main>
      {nav && <MemberNav />}
    </>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">{children}</section>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  const color = tone === "warn" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-strong";
  return <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${color}`}>{children}</div>;
}

// 화면 아래쪽에 두는 개인정보 처리방침 링크
export function PrivacyLink() {
  return (
    <Link href="/privacy" className="inline-flex min-h-10 items-center self-start text-[13px] text-muted underline underline-offset-4 hover:text-ink">
      개인정보 처리방침
    </Link>
  );
}
