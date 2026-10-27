"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { setMemberRate, type MemberActionState } from "./actions";

// 회원 기본 시급. 시급인 일정에서는 이 값과 일정 단가 중 높은 쪽을 써요.
export function MemberRateForm({ memberId, rate, defaultHourlyRate }: { memberId: string; rate: number | null; defaultHourlyRate: number }) {
  const [state, action] = useActionState<MemberActionState, FormData>(setMemberRate, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <label htmlFor="member-rate" className="text-sm font-bold">
        기본 시급 (원)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="member-rate"
          name="rate"
          inputMode="numeric"
          defaultValue={rate ?? ""}
          placeholder={`비우면 일정 단가 (보통 ${defaultHourlyRate.toLocaleString("ko-KR")}원)`}
          className="h-11 w-56 rounded-lg border border-field bg-white px-3 text-right text-sm"
        />
        <SubmitButton variant="secondary" pendingText="저장 중…">
          저장
        </SubmitButton>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        경력자처럼 기본보다 높게 줄 사람만 적어요. 시급인 일정에서는 이 값과 일정 단가 중 높은 쪽으로 계산해요. 한 일정에서만 다르게 줄 때는 일정 상세의 신청자 표에서 바꿔요.
      </p>
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
  );
}
