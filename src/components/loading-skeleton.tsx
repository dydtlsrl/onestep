// 화면을 누르면 서버 응답을 기다리는 동안 바로 보여 주는 회색 뼈대.
// loading.tsx에서 쓴다. 실제 내용이 오면 자동으로 바뀐다.
import { PageShell } from "@/components/page-shell";

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-line ${className}`} />;
}

function Status() {
  return (
    <p role="status" className="text-sm text-muted">
      불러오는 중…
    </p>
  );
}

// 대표 화면: 왼쪽 메뉴는 그대로 두고 오른쪽 내용 자리만 바꾼다
export function AdminLoading() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Bar className="h-8 w-40" />
        <Status />
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
        <Bar className="h-5 w-1/3" />
        <Bar className="h-5 w-full" />
        <Bar className="h-5 w-full" />
        <Bar className="h-5 w-2/3" />
      </div>
    </>
  );
}

// 회원 화면: 휴대폰 폭 카드 모양
export function MemberLoading() {
  return (
    <PageShell>
      <Status />
      {[0, 1].map((i) => (
        <section key={i} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
          <Bar className="h-5 w-1/2" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-3/4" />
        </section>
      ))}
    </PageShell>
  );
}
