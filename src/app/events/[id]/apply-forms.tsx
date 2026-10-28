"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { applyToEvent, cancelMyApplication, type ApplyState } from "../actions";

// 신청할 수 있는 날짜 하나. 보수는 이 회원에게 적용되는 단가로 계산한다.
export interface DayChoice {
  id: string;
  label: string; // 11/8(일) 진행
  timeText: string; // 집합 07:30 · 08:00–13:00
  payText: string; // 시급 11,000원 · 예상 55,000원
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

// 참여할 날짜를 골라 신청한다. 자리가 다 찼어도 대기로 신청할 수 있다. 역할은 대표가 나중에 정한다.
// allRequired면 모든 날짜를 함께 신청해야 한다.
export function ApplyForm({
  eventId,
  days,
  allRequired,
  initialDays = [],
}: {
  eventId: string;
  days: DayChoice[];
  allRequired: boolean;
  initialDays?: string[];
}) {
  const [state, action] = useActionState<ApplyState, FormData>(applyToEvent, {});
  const single = days.length === 1;
  const [joined, setJoined] = useState<Set<string>>(() => new Set(single || allRequired ? days.map((d) => d.id) : initialDays));
  const chosen = days.filter((d) => joined.has(d.id));

  function toggleDay(id: string) {
    setJoined((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      {chosen.map((d) => (
        <input key={d.id} type="hidden" name="dayId" value={d.id} />
      ))}

      {allRequired && !single && <Notice>이 일정은 모든 날짜에 참여할 수 있는 분만 신청할 수 있어요.</Notice>}

      {!single && (
        <ul className="flex flex-col gap-2">
          {days.map((d) => {
            const on = joined.has(d.id);
            return (
              <li key={d.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${on ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
                  <input type="checkbox" checked={on} disabled={allRequired} onChange={() => toggleDay(d.id)} className="mt-0.5 h-5 w-5 accent-brand" />
                  <span className="flex flex-1 flex-col">
                    <span className="font-bold">{d.label}</span>
                    <span className="text-[13px] text-body">{d.timeText}</span>
                    <span className="text-[13px] text-muted">{d.payText}</span>
                  </span>
                  <span className={`text-[13px] ${d.remaining > 0 ? "text-body" : "font-bold text-warn"}`}>{d.remaining > 0 ? `${d.remaining}자리 남음` : "대기 신청"}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {chosen.length === 0 && <p className="text-[13px] text-muted">참여할 날짜를 골라 주세요.</p>}
      <p className="text-[13px] text-muted">역할(감독관·안내 등)은 대표님이 신청자를 보고 정해요.</p>
      <SubmitButton pendingText="신청하는 중…" className="h-12 text-[15px]" disabled={chosen.length === 0}>
        {single || chosen.length === 0 ? "신청하기" : `${chosen.length}일 신청하기`}
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}

// 확정 전(신청·대기)에만 직접 취소할 수 있다. 이 일정에 신청한 날짜를 모두 취소한다.
export function CancelForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState<ApplyState, FormData>(cancelMyApplication, {});
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center self-start text-sm text-muted underline underline-offset-4 hover:text-ink">
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
