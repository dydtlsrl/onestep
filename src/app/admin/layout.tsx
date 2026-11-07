import { requireAdmin } from "@/lib/auth";
import { AdminSidebar, AdminTabBar } from "./admin-nav";
import { getPendingCount } from "./pending-count";

// 대표 화면의 공통 틀
// - 컴퓨터(1024px 이상): 왼쪽 메뉴 + 오른쪽 내용. 내용은 가운데에 최대 1024px로 둬서 넓은 화면에서도 한눈에 읽히게 한다
// - 휴대폰·태블릿: 위에 작은 머리글, 아래에 탭 메뉴 (내용이 탭에 가리지 않게 아래 여백을 둔다).
//   태블릿에서 왼쪽 메뉴를 쓰면 표가 좁아져 처리 버튼이 화면 밖으로 밀리므로 아래 탭을 쓴다.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ profile }, pendingCount] = await Promise.all([requireAdmin(), getPendingCount()]);

  return (
    <div className="flex flex-1">
      <AdminSidebar pendingCount={pendingCount} name={profile.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 items-center justify-between border-b border-line bg-white px-4 sm:px-6 lg:hidden">
          <span className="font-bold tracking-tight">원스텝</span>
          <span className="text-xs text-muted">관리자 · {profile.name}</span>
        </header>
        <main className="flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">{children}</div>
        </main>
      </div>
      <AdminTabBar pendingCount={pendingCount} />
    </div>
  );
}
