"use client";

import { useActionState, useState } from "react";
import type { EventStatus } from "@/lib/events";
import { changeEventStatus, type EventActionState } from "../actions";

type Target = "open_core" | "open_all" | "closed" | "completed";

const ACTIONS: Record<EventStatus, { to: Target; label: string; confirm: string; primary?: boolean }[]> = {
  draft: [
    { to: "open_core", label: "핵심 인력에게 먼저 공개", confirm: "핵심 회원에게 공개하고 알림을 보낼까요?", primary: true },
    { to: "open_all", label: "바로 전체 공개", confirm: "모든 활동 회원에게 공개하고 알림을 보낼까요?" },
  ],
  open_core: [
    { to: "open_all", label: "일반 회원에게도 공개", confirm: "일반 회원에게도 공개하고 알림을 보낼까요?", primary: true },
    { to: "closed", label: "모집 마감", confirm: "모집을 마감할까요? 더 이상 신청을 받지 않아요." },
  ],
  open_all: [
    { to: "closed", label: "모집 마감", confirm: "모집을 마감할까요? 더 이상 신청을 받지 않아요.", primary: true },
    { to: "completed", label: "완료 처리", confirm: "일정을 완료할까요? 선발과 일정 정보는 더 이상 바꿀 수 없어요." },
  ],
  closed: [
    { to: "completed", label: "완료 처리", confirm: "일정을 완료할까요? 선발과 일정 정보는 더 이상 바꿀 수 없어요. 출석 확인은 계속할 수 있어요.", primary: true },
    { to: "open_all", label: "모집 다시 열기", confirm: "다시 신청을 받을까요? (알림은 다시 보내지 않아요)" },
  ],
  completed: [],
  cancelled: [],
};

// 공개·마감·완료·취소 버튼
export function StatusActions({ eventId, status }: { eventId: string; status: EventStatus }) {
  const [state, action] = useActionState<EventActionState, FormData>(changeEventStatus, {});
  const [cancelling, setCancelling] = useState(false);
  const actions = ACTIONS[status];
  const canCancel = status !== "completed" && status !== "cancelled";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <form
            key={a.to}
            action={action}
            onSubmit={(e) => {
              if (!window.confirm(a.confirm)) e.preventDefault();
            }}
          >
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="status" value={a.to} />
            <button
              type="submit"
              className={`h-10 rounded-lg px-4 text-sm font-bold ${
                a.primary ? "bg-brand text-white hover:bg-brand-strong" : "border border-field bg-white text-ink hover:bg-ground"
              }`}
            >
              {a.label}
            </button>
          </form>
        ))}
        {canCancel && (
          <button
            type="button"
            onClick={() => setCancelling((v) => !v)}
            aria-expanded={cancelling}
            className="h-10 rounded-lg border border-field bg-white px-4 text-sm font-bold text-warn hover:bg-warn-soft"
          >
            일정 취소
          </button>
        )}
      </div>
      {cancelling && canCancel && (
        <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg bg-warn-soft p-3">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="status" value="cancelled" />
          <div className="flex flex-[1_1_260px] flex-col gap-1.5">
            <label htmlFor="cancel-reason" className="text-sm font-bold text-warn">
              취소 사유 (신청자에게 알림으로 보내요)
            </label>
            <input id="cancel-reason" name="reason" required maxLength={500} placeholder="예: 고객사 사정으로 시험이 연기되었어요." className="h-11 rounded-lg border border-field bg-white px-3 text-sm" />
          </div>
          <button type="submit" className="h-11 rounded-lg bg-warn px-4 text-sm font-bold text-white">
            취소하고 알리기
          </button>
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
