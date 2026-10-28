"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { withdrawSelf, type WithdrawState } from "./actions";

export function WithdrawForm() {
  const [state, action] = useActionState<WithdrawState, FormData>(withdrawSelf, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reason" className="text-sm font-bold">
          탈퇴하는 이유 <span className="font-normal text-muted">(선택, 대표님께 전달돼요)</span>
        </label>
        <input id="reason" name="reason" maxLength={200} className="h-12 rounded-lg border border-field bg-white px-3 text-[15px]" />
      </div>
      <label htmlFor="confirm" className="flex min-h-11 cursor-pointer items-center gap-3">
        <input id="confirm" name="confirm" type="checkbox" required className="h-5 w-5 accent-brand" />
        <span className="text-[15px] font-bold">위 내용을 확인했고 탈퇴할게요</span>
      </label>
      <SubmitButton pendingText="탈퇴하는 중…" className="h-12 text-[15px]">
        탈퇴하기
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
    </form>
  );
}
