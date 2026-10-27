import { redirect } from "next/navigation";
import { InvalidInvite } from "@/components/invalid-invite";
import { Card, PageShell } from "@/components/page-shell";
import { getCurrentMember } from "@/lib/auth";
import { isInviteUsable } from "@/lib/invites";
import { SignupForm } from "./signup-form";

// 가입 신청서 (/signup/<초대코드>). 로그인한 뒤에만 볼 수 있다.
export default async function SignupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, userId, profile } = await getCurrentMember();

  if (!userId) redirect(`/join/${code}`);
  if (profile) redirect("/");
  if (!(await isInviteUsable(supabase, code))) return <InvalidInvite />;

  return (
    <PageShell>
      <Card>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold">가입 신청서</h1>
          <p className="text-[15px] leading-relaxed text-body">대표님이 확인한 뒤 승인하면 일정을 볼 수 있어요.</p>
        </div>
        <SignupForm code={code} />
      </Card>
    </PageShell>
  );
}
