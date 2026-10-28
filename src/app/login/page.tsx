import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { OAuthButtons } from "@/components/oauth-buttons";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { getCurrentMember } from "@/lib/auth";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { LOGIN_METHOD_LABEL } from "@/lib/login-providers";
import { safeNextPath } from "@/lib/safe-next";

// 이미 가입한 사람이 다시 로그인하는 화면
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next: nextParam } = await searchParams;
  const next = safeNextPath(nextParam);
  const { userId } = await getCurrentMember();
  if (userId) redirect(next);

  const inApp = detectInAppBrowser((await headers()).get("user-agent"));

  return (
    <PageShell>
      <Card>
        <h1 className="text-xl font-bold">로그인</h1>
        <p className="text-[15px] leading-relaxed text-body">가입할 때 쓴 {LOGIN_METHOD_LABEL} 계정으로 로그인해 주세요.</p>
        {error && <Notice tone="warn">로그인하지 못했어요. 다시 시도해 주세요.</Notice>}
        <OAuthButtons next={next} inApp={inApp} />
      </Card>
      <p className="text-sm leading-relaxed text-muted">처음이라면 대표님께 받은 초대 링크로 접속해 주세요.</p>
    </PageShell>
  );
}
