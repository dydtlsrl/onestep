import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

// 대표 화면의 공통 틀: 왼쪽 메뉴 + 오른쪽 내용 (휴대폰에서는 메뉴가 위로 올라간다)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  const signOut = (className: string) => (
    <form action="/auth/signout" method="post" className={className}>
      <button type="submit" className="min-h-10 text-sm text-[#c9d3e6] underline underline-offset-4 hover:text-white">
        로그아웃
      </button>
    </form>
  );

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <nav aria-label="관리자 메뉴" className="flex flex-col bg-navy text-white md:w-[200px] md:shrink-0 md:gap-4 md:px-3 md:py-5">
        <div className="flex items-center justify-between gap-3 px-4 py-2 md:px-3 md:py-0">
          <div className="flex flex-col gap-0.5">
            <span className="text-lg font-bold tracking-tight">원스텝</span>
            <span className="text-xs text-[#c9d3e6]">관리자 · {profile.name}</span>
          </div>
          {signOut("md:hidden")}
        </div>
        <AdminNav pendingCount={count ?? 0} />
        {signOut("mt-auto hidden px-3 md:block")}
      </nav>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="flex max-w-6xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
