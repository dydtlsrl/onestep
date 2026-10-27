"use client";

import { useActionState, useState } from "react";
import { TIER_LABEL, type MemberTier } from "@/lib/tier";
import { ATTENDANCE_LABEL, type Attendance } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { calculatePay, type PayRules, type RoleRate } from "@/lib/pay";
import { saveAttendance, type EventActionState } from "../actions";

export interface AttendanceRow {
  id: string;
  name: string;
  tier: MemberTier;
  positionName: string;
  rate: RoleRate;
  attendance: Attendance;
  overtimeMinutes: number;
  extras: number; // 교통비 + 지방비
}

const OPTIONS: Attendance[] = ["attended", "late", "no_show", "unknown"];

function Row({ eventId, row, rules, scheduled }: { eventId: string; row: AttendanceRow; rules: PayRules; scheduled: number }) {
  const [state, action] = useActionState<EventActionState, FormData>(saveAttendance, {});
  const [attendance, setAttendance] = useState<Attendance>(row.attendance);
  const [minutes, setMinutes] = useState(String(row.overtimeMinutes));
  const works = attendance === "attended" || attendance === "late";
  const pay = calculatePay(row.rate, rules, { scheduledMinutes: scheduled, overtimeMinutes: works ? Number(minutes) || 0 : 0 });
  const total = works ? pay.total + row.extras : 0;
  const changed = attendance !== row.attendance || Number(minutes) !== row.overtimeMinutes;

  return (
    <li className="flex flex-col gap-2 border-b border-[#eef0f3] py-3 last:border-0">
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="applicationId" value={row.id} />
        <div className="flex min-w-[140px] flex-[1_1_160px] flex-col">
          <span className="font-bold">
            {row.name} <span className="text-[12px] font-normal text-muted">{TIER_LABEL[row.tier]}</span>
          </span>
          <span className="text-[13px] text-muted">{row.positionName}</span>
        </div>
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{row.name} 출석</legend>
          {OPTIONS.map((o) => (
            <label
              key={o}
              className="flex h-9 cursor-pointer items-center rounded-md border border-field px-2.5 text-[13px] has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:font-bold has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
            >
              <input type="radio" name="attendance" value={o} checked={attendance === o} onChange={() => setAttendance(o)} className="sr-only" />
              {ATTENDANCE_LABEL[o]}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-1.5 text-[13px] text-body">
          초과
          <input
            name="overtimeMinutes"
            type="number"
            min={0}
            max={1440}
            step={10}
            value={works ? minutes : "0"}
            disabled={!works}
            onChange={(e) => setMinutes(e.target.value)}
            className="h-9 w-20 rounded-md border border-field bg-white px-2 text-right text-sm disabled:bg-ground"
          />
          분
        </label>
        <span className="ml-auto text-right text-sm">
          <span className="block font-bold">{works ? formatWon(total) : "지급 없음"}</span>
          {works && (
            <span className="text-[12px] text-muted">
              보수 {formatWon(pay.total)}
              {row.extras > 0 && ` + 추가 ${formatWon(row.extras)}`}
            </span>
          )}
        </span>
        <button
          type="submit"
          disabled={!changed}
          className="h-9 rounded-md bg-brand px-3 text-sm font-bold text-white disabled:bg-line disabled:text-muted"
        >
          저장
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
    </li>
  );
}

// 출석 확인: 확정자별 참석·지각·노쇼와 초과 시간. 예상 지급액(세금 공제 전)을 함께 보여 준다.
export function AttendanceBoard({
  eventId,
  rows,
  rules,
  scheduledMinutes,
}: {
  eventId: string;
  rows: AttendanceRow[];
  rules: PayRules;
  scheduledMinutes: number;
}) {
  if (rows.length === 0) return <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">확정된 사람이 없어요.</p>;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-white px-5 py-3">
      <p className="text-[13px] leading-relaxed text-muted">
        노쇼·지각으로 저장하면 관리자 기록에 자동으로 남아요. 금액은 세금 공제 전 예상액이며, 실제 지급액은 정산 단계에서 확정해요.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <Row key={row.id} eventId={eventId} row={row} rules={rules} scheduled={scheduledMinutes} />
        ))}
      </ul>
    </section>
  );
}
