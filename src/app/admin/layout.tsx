import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

// 대표 화면의 공통 틀: 왼쪽 메뉴 + 오른쪽 내용 (휴대폰에서는 메뉴가 위로 올라간다)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="flex flex-1 flex-wrap items-stretch">
      <nav aria-label="관리자 메뉴" className="flex flex-[1_1_200px] flex-col gap-4 bg-navy px-3 py-5 text-white">
        <div className="flex flex-col gap-0.5 px-3">
          <span className="text-lg font-bold tracking-tight">원스텝</span>
          <span className="text-xs text-[#c9d3e6]">관리자 · {profile.name}</span>
        </div>
        <AdminNav pendingCount={count ?? 0} />
        <form action="/auth/signout" method="post" className="mt-auto px-3">
          <button type="submit" className="text-sm text-[#c9d3e6] underline underline-offset-4 hover:text-white">
            로그아웃
          </button>
        </form>
      </nav>
      <main className="min-w-0 flex-[999_1_560px] px-4 py-6 sm:px-8">
        <div className="flex max-w-5xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
