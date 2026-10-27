"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { MemberStatus, MemberTier } from "@/lib/auth";
import { restrictMember, setTier, unrestrictMember, type MemberActionState } from "./actions";

function Result({ state }: { state: MemberActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm font-bold text-warn">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm font-bold text-brand-strong">
        {state.ok}
      </p>
    );
  return null;
}

// 등급 변경과 활동 제한·해제
export function MemberControls({
  memberId,
  tier,
  status,
  statusReason,
  isAdmin,
}: {
  memberId: string;
  tier: MemberTier;
  status: MemberStatus;
  statusReason: string;
  isAdmin: boolean;
}) {
  const [tierState, tierAction] = useActionState<MemberActionState, FormData>(setTier, {});
  const [restrictState, restrictAction] = useActionState<MemberActionState, FormData>(restrictMember, {});
  const [unrestrictState, unrestrictAction] = useActionState<MemberActionState, FormData>(unrestrictMember, {});
  const canChangeTier = status === "active" || status === "restricted";

  return (
    <div className="flex flex-col gap-5">
      {canChangeTier && (
        <form action={tierAction} className="flex flex-col gap-2">
          <input type="hidden" name="memberId" value={memberId} />
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="mb-2 text-sm font-bold">등급</legend>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="tier" value="core" defaultChecked={tier === "core"} className="h-4 w-4 accent-brand" />
              핵심 (일정을 먼저 봄)
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" name="tier" value="general" defaultChecked={tier === "general"} className="h-4 w-4 accent-brand" />
              일반
            </label>
            <SubmitButton variant="secondary" pendingText="저장 중…">
              등급 저장
            </SubmitButton>
          </fieldset>
          <Result state={tierState} />
        </form>
      )}

      {status === "active" && !isAdmin && (
        <form action={restrictAction} className="flex flex-col gap-2 border-t border-line pt-5">
          <input type="hidden" name="memberId" value={memberId} />
          <label htmlFor="reason" className="text-sm font-bold">
            활동 제한
          </label>
          <p className="text-[13px] leading-relaxed text-muted">
            제한하면 로그인해도 일정을 볼 수 없어요. 사유는 회원에게 보이지 않고, 관리자 기록에 함께 남아요.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              id="reason"
              name="reason"
              required
              maxLength={500}
              placeholder="예: 10/3 무단 노쇼 2회째"
              className="h-11 min-w-0 flex-[1_1_240px] rounded-lg border border-field bg-white px-3 text-sm"
            />
            <SubmitButton variant="secondary" pendingText="처리 중…">
              활동 제한
            </SubmitButton>
          </div>
          <Result state={restrictState} />
        </form>
      )}

      {status === "restricted" && (
        <form action={unrestrictAction} className="flex flex-col gap-2 border-t border-line pt-5">
          <input type="hidden" name="memberId" value={memberId} />
          <p className="text-sm font-bold text-warn">활동이 제한된 회원이에요.</p>
          <p className="text-sm text-body">사유: {statusReason || "—"}</p>
          <div>
            <SubmitButton pendingText="처리 중…">제한 풀기</SubmitButton>
          </div>
          <Result state={unrestrictState} />
        </form>
      )}

      {isAdmin && <p className="text-[13px] text-muted">대표 계정은 활동을 제한할 수 없어요.</p>}
    </div>
  );
}
