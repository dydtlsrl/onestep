"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { withdrawMember, type MemberActionState } from "./actions";

// 회원 요청으로 탈퇴 처리. 실수로 누르지 않게 접어 두고, 요청을 받았는지 체크하게 한다.
export function AdminWithdrawForm({ memberId }: { memberId: string }) {
  const [state, action] = useActionState<MemberActionState, FormData>(withdrawMember, {});
  return (
    <details className="border-t border-line pt-4">
      <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold text-body">회원 요청으로 탈퇴 처리</summary>
      <form action={action} className="flex flex-col gap-3 pt-2">
        <input type="hidden" name="memberId" value={memberId} />
        <p className="text-[13px] leading-relaxed text-muted">
          지역·경력·관리자 기록·알림이 지워지고, 처리 전 신청은 취소, 서명 전 계약서는 무효가 돼요. 정산 정보는 보수를 받은 적이 없으면 바로 지워지고, 받은
          적이 있으면 5년 보관해요. 확정된 일정이나 받을 보수가 남아 있으면 탈퇴할 수 없어요.
        </p>
        <input name="reason" maxLength={200} placeholder="요청 내용 (예: 10/28 전화로 요청)" aria-label="탈퇴 사유" className="h-11 rounded-lg border border-field bg-white px-3 text-sm" />
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="h-4 w-4 accent-brand" />
          회원 본인이 탈퇴를 요청했어요
        </label>
        {state.needsForce && (
          <label className="flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn">
            <input type="checkbox" name="force" className="mt-0.5 h-4 w-4 accent-brand" />
            <span>
              정산을 만들지 않은 지난 일정(연습 등)이 있어서 막혔어요. 이 회원에게 <b>받을 보수가 없는 것을 확인</b>했어요. (기록에 남아요)
            </span>
          </label>
        )}
        <div>
          <SubmitButton variant="secondary" pendingText="처리 중…">
            탈퇴 처리
          </SubmitButton>
        </div>
        {state.error && (
          <p role="alert" className="text-sm font-bold text-warn">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm font-bold text-brand-strong">
            {state.ok}
          </p>
        )}
      </form>
    </details>
  );
}
