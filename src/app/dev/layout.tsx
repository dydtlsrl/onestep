import { requireDeveloper } from "@/lib/auth";
import { DevNav } from "./dev-nav";

// 개발자 화면의 공통 틀. 대표·회원 메뉴와 섞이지 않게 따로 둔다.
export default async function DevLayout({ children }: { children: React.ReactNode }) {
  await requireDeveloper();
  return (
    <div className="flex flex-1 flex-col">
      <nav aria-label="개발자 메뉴" className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[#2b2f36] px-4 py-3 text-white sm:px-8">
        <span className="font-bold tracking-tight">원스텝 · 개발자</span>
        <DevNav />
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="min-h-10 text-sm text-[#c9ced6] underline underline-offset-4 hover:text-white">
            로그아웃
          </button>
        </form>
      </nav>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="flex max-w-6xl flex-col gap-5">{children}</div>
      </main>
    </div>
  );
}
