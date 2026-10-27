"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { applyToEvent, cancelMyApplication, type ApplyState } from "../actions";

export interface PositionChoice {
  id: string;
  name: string;
  payText: string;
  remaining: number;
}

function Message({ state }: { state: ApplyState }) {
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

// 역할을 골라 신청한다. 자리가 다 찼어도 대기로 신청할 수 있다.
export function ApplyForm({ eventId, positions, initialPositionId }: { eventId: string; positions: PositionChoice[]; initialPositionId?: string }) {
  const [state, action] = useActionState<ApplyState, FormData>(applyToEvent, {});
  const [picked, setPicked] = useState(initialPositionId ?? (positions.length === 1 ? positions[0].id : ""));

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-bold">하고 싶은 역할</legend>
        {positions.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-field bg-white px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
          >
            <input type="radio" name="positionId" value={p.id} checked={picked === p.id} onChange={() => setPicked(p.id)} className="h-4 w-4 accent-brand" />
            <span className="flex flex-1 flex-col">
              <span className="font-bold">{p.name}</span>
              <span className="text-[13px] text-muted">{p.payText}</span>
            </span>
            <span className={`text-[13px] ${p.remaining > 0 ? "text-body" : "font-bold text-warn"}`}>
              {p.remaining > 0 ? `${p.remaining}자리 남음` : "대기 신청"}
            </span>
          </label>
        ))}
      </fieldset>
      <SubmitButton pendingText="신청하는 중…" className="h-12 text-[15px]">
        신청하기
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}

// 확정 전(신청·대기)에만 직접 취소할 수 있다
export function CancelForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState<ApplyState, FormData>(cancelMyApplication, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-muted underline underline-offset-4 hover:text-ink">
          신청 취소하기
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2 rounded-lg bg-ground p-3">
          <input type="hidden" name="eventId" value={eventId} />
          <label htmlFor="cancel-reason" className="text-sm font-bold">
            취소 사유 (선택)
          </label>
          <input id="cancel-reason" name="reason" maxLength={300} placeholder="예: 개인 일정이 생겼어요." className="h-11 rounded-lg border border-field bg-white px-3 text-sm" />
          <div className="flex gap-2">
            <SubmitButton variant="secondary" pendingText="취소하는 중…">
              신청 취소
            </SubmitButton>
            <button type="button" onClick={() => setOpen(false)} className="h-11 px-3 text-sm text-muted">
              그대로 두기
            </button>
          </div>
        </form>
      )}
      <Message state={state} />
    </div>
  );
}
