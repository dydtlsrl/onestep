"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { applyToEvent, cancelMyApplication, type ApplyState } from "../actions";

export interface PositionChoice {
  id: string;
  name: string;
  payText: string;
  remaining: number;
}

export interface DayChoice {
  id: string;
  label: string; // 11/8(일) 진행
  timeText: string; // 집합 07:30 · 08:00–13:00
  positions: PositionChoice[];
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

function PositionRadios({ day, picked, onPick }: { day: DayChoice; picked: string; onPick: (id: string) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-bold">{day.positions.length > 1 ? "하고 싶은 역할" : "역할"}</legend>
      {day.positions.map((p) => (
        <label
          key={p.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-field bg-white px-4 py-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
        >
          <input type="radio" name={`role-${day.id}`} value={p.id} checked={picked === p.id} onChange={() => onPick(p.id)} className="h-4 w-4 accent-brand" />
          <span className="flex flex-1 flex-col">
            <span className="font-bold">{p.name}</span>
            <span className="text-[13px] text-muted">{p.payText}</span>
          </span>
          <span className={`text-[13px] ${p.remaining > 0 ? "text-body" : "font-bold text-warn"}`}>{p.remaining > 0 ? `${p.remaining}자리 남음` : "대기 신청"}</span>
        </label>
      ))}
    </fieldset>
  );
}

// 참여할 날짜를 고르고 날짜마다 역할을 하나씩 골라 신청한다. 자리가 다 찼어도 대기로 신청할 수 있다.
// allRequired면 모든 날짜를 함께 신청해야 한다.
export function ApplyForm({
  eventId,
  days,
  allRequired,
  initialPicks = {},
}: {
  eventId: string;
  days: DayChoice[];
  allRequired: boolean;
  initialPicks?: Record<string, string>;
}) {
  const [state, action] = useActionState<ApplyState, FormData>(applyToEvent, {});
  const single = days.length === 1;
  const [joined, setJoined] = useState<Set<string>>(() => new Set(single || allRequired ? days.map((d) => d.id) : Object.keys(initialPicks)));
  const [picks, setPicks] = useState<Record<string, string>>(() => {
    const auto = Object.fromEntries(days.filter((d) => d.positions.length === 1).map((d) => [d.id, d.positions[0].id]));
    return { ...auto, ...initialPicks };
  });

  const chosen = days.filter((d) => joined.has(d.id));
  const missingRole = chosen.filter((d) => !picks[d.id]);
  const ready = chosen.length > 0 && missingRole.length === 0;

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
      {chosen.map((d) => picks[d.id] && <input key={d.id} type="hidden" name="positionId" value={picks[d.id]} />)}

      {allRequired && !single && <Notice>이 일정은 모든 날짜에 참여할 수 있는 분만 신청할 수 있어요.</Notice>}

      {single ? (
        <PositionRadios day={days[0]} picked={picks[days[0].id] ?? ""} onPick={(id) => setPicks((p) => ({ ...p, [days[0].id]: id }))} />
      ) : (
        <ul className="flex flex-col gap-3">
          {days.map((d) => {
            const on = joined.has(d.id);
            return (
              <li key={d.id} className={`flex flex-col gap-3 rounded-xl border p-4 ${on ? "border-brand" : "border-line"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={allRequired}
                    onChange={() => toggleDay(d.id)}
                    className="mt-0.5 h-5 w-5 accent-brand"
                  />
                  <span className="flex flex-col">
                    <span className="font-bold">{d.label}</span>
                    <span className="text-[13px] text-muted">{d.timeText}</span>
                  </span>
                </label>
                {on && <PositionRadios day={d} picked={picks[d.id] ?? ""} onPick={(id) => setPicks((p) => ({ ...p, [d.id]: id }))} />}
              </li>
            );
          })}
        </ul>
      )}

      {!ready && (
        <p className="text-[13px] text-muted">
          {chosen.length === 0 ? "참여할 날짜를 골라 주세요." : `${missingRole.map((d) => d.label).join(", ")}의 역할을 골라 주세요.`}
        </p>
      )}
      <SubmitButton pendingText="신청하는 중…" className="h-12 text-[15px]" disabled={!ready}>
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
