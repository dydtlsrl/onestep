"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { revealPrivate, type RevealState } from "./actions";

export interface PrivateMasked {
  rrn_masked: string;
  bank_name: string;
  account_masked: string;
  account_holder: string;
  address: string;
}

// 회원의 정산 정보. 평소에는 가린 값만 보이고, "원문 보기"를 누를 때마다 열람 기록이 남는다.
export function PrivateCard({ memberId, info }: { memberId: string; info: PrivateMasked | null }) {
  const [state, action] = useActionState<RevealState, FormData>(revealPrivate, {});
  if (!info) return <p className="text-sm text-muted">아직 등록하지 않았어요. 계약서에 서명하기 전에 회원이 직접 등록해요.</p>;
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">주민번호</dt>
        <dd className="font-mono">{state.rrn ?? info.rrn_masked}</dd>
        <dt className="text-muted">계좌</dt>
        <dd>
          {info.bank_name} <span className="font-mono">{state.account ?? info.account_masked}</span> · {info.account_holder}
        </dd>
        <dt className="text-muted">주소</dt>
        <dd>{info.address || "—"}</dd>
      </dl>
      {!state.rrn && (
        <form action={action} className="flex flex-col gap-1">
          <input type="hidden" name="memberId" value={memberId} />
          <div>
            <SubmitButton variant="secondary" pendingText="여는 중…" className="h-10">
              원문 보기
            </SubmitButton>
          </div>
          <p className="text-[13px] text-muted">누를 때마다 열람 기록이 남아요.</p>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
    </div>
  );
}
