"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { approveApplication, rejectApplication, type DecisionState } from "./actions";

// 신청서 한 장의 승인·거절 버튼
export function DecisionForms({ memberId, name }: { memberId: string; name: string }) {
  const [approveState, approveAction] = useActionState<DecisionState, FormData>(approveApplication, {});
  const [rejectState, rejectAction] = useActionState<DecisionState, FormData>(rejectApplication, {});
  const [rejecting, setRejecting] = useState(false);
  const error = approveState.error ?? rejectState.error;

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <form action={approveAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="memberId" value={memberId} />
        <fieldset className="flex items-center gap-4">
          <legend className="sr-only">{name}님의 등급</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="tier" value="general" defaultChecked className="h-4 w-4 accent-brand" />
            일반
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="tier" value="core" className="h-4 w-4 accent-brand" />
            핵심
          </label>
        </fieldset>
        <SubmitButton pendingText="승인 중…">승인</SubmitButton>
        <button
          type="button"
          onClick={() => setRejecting((v) => !v)}
          aria-expanded={rejecting}
          className="h-11 rounded-lg border border-field bg-white px-4 text-sm font-bold text-ink hover:bg-ground"
        >
          거절
        </button>
      </form>

      {rejecting && (
        <form action={rejectAction} className="flex flex-col gap-2 rounded-lg bg-ground p-3">
          <input type="hidden" name="memberId" value={memberId} />
          <label htmlFor={`reason-${memberId}`} className="text-sm font-bold">
            거절 사유 (회원에게는 보이지 않아요)
          </label>
          <input
            id={`reason-${memberId}`}
            name="reason"
            maxLength={500}
            placeholder="예: 추천인 확인 안 됨"
            className="h-11 rounded-lg border border-field bg-white px-3 text-sm"
          />
          <div>
            <SubmitButton variant="secondary" pendingText="처리 중…">
              {name}님 거절하기
            </SubmitButton>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
