import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentMember, isActiveAdmin, TIER_LABEL } from "@/lib/auth";

// 첫 화면. 로그인 여부와 회원 상태에 따라 알맞은 곳으로 보낸다.
export default async function HomePage() {
  const { userId, profile } = await getCurrentMember();

  if (!userId) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-xl font-bold">원스텝 진행요원 전용 공간</h1>
          <p className="text-[15px] leading-relaxed text-body">
            일정 확인, 신청, 계약, 정산을 한곳에서 할 수 있어요. 처음이라면 대표님께 받은 초대 링크로 가입해 주세요.
          </p>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-lg bg-brand text-[15px] font-bold text-white hover:bg-brand-strong"
          >
            이미 가입했어요 · 로그인
          </Link>
        </Card>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-xl font-bold">아직 가입 신청 전이에요</h1>
          <p className="text-[15px] leading-relaxed text-body">
            원스텝은 초대받은 분만 가입할 수 있어요. 대표님께 받은 초대 링크를 다시 눌러 가입 신청을 해 주세요.
          </p>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">내 계정 ID 보기</summary>
            <p className="mt-2 break-all rounded-md bg-ground px-3 py-2 font-mono text-xs text-body">{userId}</p>
            <p className="mt-2 leading-relaxed">대표 계정을 처음 등록할 때 필요한 값이에요. (README의 &lsquo;첫 대표 계정 만들기&rsquo;)</p>
          </details>
        </Card>
        <SignOutButton />
      </PageShell>
    );
  }

  if (profile.status !== "active") redirect("/pending");
  if (isActiveAdmin(profile)) redirect("/admin");

  return (
    <PageShell>
      <Card>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{profile.name}님, 환영합니다</h1>
          <span className="rounded-md bg-navy px-2 py-0.5 text-xs font-bold text-white">{TIER_LABEL[profile.tier]}</span>
        </div>
        <Notice>일정 확인과 신청, 계약서 서명, 정산 내역은 다음 단계에서 열려요.</Notice>
      </Card>
      <SignOutButton />
    </PageShell>
  );
}
