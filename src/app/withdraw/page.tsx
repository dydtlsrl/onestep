import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { getCurrentMember } from "@/lib/auth";
import { messageForError } from "@/lib/errors";
import { WithdrawForm } from "./withdraw-form";

// 회원 탈퇴. 활동 중·승인 대기·거절·제한 상태 모두 할 수 있다 (대표 계정 제외).
export default async function WithdrawPage() {
  const { supabase, userId, profile } = await getCurrentMember();
  if (!userId) redirect("/login?next=/withdraw");
  if (!profile || profile.status === "withdrawn") redirect("/");
  if (profile.role === "admin") redirect("/admin");

  const [{ data: blocker }, { count: paidCount }] = await Promise.all([
    supabase.rpc("withdraw_blocker", { p_member_id: userId }),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("member_id", userId).eq("status", "paid"),
  ]);
  const back = profile.status === "active" ? "/me" : "/pending";

  return (
    <PageShell>
      <Link href={back} className="-mt-3 inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 돌아가기
      </Link>
      <h1 className="text-xl font-bold">회원 탈퇴</h1>

      <Card>
        <h2 className="text-lg font-bold">탈퇴하면</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-body">
          <li>더 이상 일정을 보거나 신청할 수 없어요. 처리 전인 신청은 취소되고, 서명 전 계약서는 무효가 돼요.</li>
          <li>지역·경력·추천인 정보와 알림은 바로 지워져요.</li>
          {paidCount ? (
            <li>
              보수를 받은 적이 있어서, 주민등록번호·계좌·주소는 세금 신고 자료로 <b>마지막 지급일이 속한 해의 다음 해부터 5년</b> 동안 보관한 뒤 지워요.
            </li>
          ) : (
            <li>주민등록번호·계좌·주소는 바로 지워져요.</li>
          )}
          <li>서명한 계약서와 지급 기록, 이름·휴대폰 번호는 법에 따라 5년 동안 보관해요.</li>
          <li>나중에 다시 하고 싶으면 초대 링크로 다시 가입 신청하면 돼요.</li>
        </ul>
        <p className="text-[13px] text-muted">
          자세한 내용은{" "}
          <Link href="/privacy#period" className="text-brand underline underline-offset-4">
            개인정보 처리방침
          </Link>
          에 있어요.
        </p>
      </Card>

      <Card>
        {blocker ? (
          <Notice tone="warn">{messageForError({ message: String(blocker) })}</Notice>
        ) : (
          <WithdrawForm />
        )}
      </Card>
    </PageShell>
  );
}
