import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InvalidInvite } from "@/components/invalid-invite";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Card, PageShell } from "@/components/page-shell";
import { getCurrentMember } from "@/lib/auth";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { isInviteUsable } from "@/lib/invites";

// 초대 링크로 들어온 첫 화면 (/join/<코드>). 로그인하면 가입 신청서로 이어진다.
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, userId, profile } = await getCurrentMember();

  if (userId && profile) redirect("/");
  if (!(await isInviteUsable(supabase, code))) return <InvalidInvite />;
  if (userId) redirect(`/signup/${code}`);

  const inApp = detectInAppBrowser((await headers()).get("user-agent"));

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-bold">원스텝에 초대받으셨어요</h1>
        <p className="text-[15px] leading-relaxed text-body">
          카카오 또는 Google 계정으로 로그인한 뒤 가입 신청서를 작성해 주세요. 대표님이 확인하고 승인하면 일정을 볼 수
          있어요.
        </p>
        <OAuthButtons next={`/signup/${code}`} inApp={inApp} />
      </Card>
      <p className="text-sm leading-relaxed text-muted">
        이미 가입했다면{" "}
        <Link href="/login" className="text-brand underline underline-offset-4">
          로그인
        </Link>
        해 주세요. 같은 휴대폰 번호로는 한 번만 가입할 수 있어요.
      </p>
    </PageShell>
  );
}
