"use client";

import { useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TIER_LABEL, type MemberTier } from "@/lib/tier";
import { ATTENDANCE_LABEL, type Attendance } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { calculatePay, type PayRules, type RoleRate } from "@/lib/pay";
import { formatPhone } from "@/lib/phone";
import { saveAttendanceBatch, type EventActionState } from "../actions";

export interface AttendanceRow {
  id: string;
  name: string;
  phone: string; // 숫자만 (현장에서 바로 전화·문자)
  tier: MemberTier;
  roleName: string; // 대표가 정한 역할 (비면 미정)
  rateText: string; // 적용 단가 (예: 시급 13,000원)
  rate: RoleRate;
  attendance: Attendance;
  overtimeMinutes: number;
  extras: number; // 이 날 붙는 교통비·지방비 (참여한 날마다 주는 것만)
}

export interface AttendanceDay {
  id: string;
  label: string;
  scheduledMinutes: number;
  rows: AttendanceRow[];
}

// 사람별 합계 (저장된 출석 기준)
export interface PersonTotal {
  memberId: string;
  name: string;
  tier: MemberTier;
  workedDays: number;
  totalDays: number;
  pay: number;
  extras: number;
}

// 현장에서 누르는 순서대로. "미확인"은 고르지 않은 상태라 버튼 대신 되돌리기로 둔다.
const CHOICES: Attendance[] = ["attended", "late", "no_show"];
const CHOICE_LOOK: Record<Attendance, string> = {
  attended: "aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white",
  late: "aria-pressed:border-[#b26a00] aria-pressed:bg-[#fff4e0] aria-pressed:text-[#8a5200]",
  no_show: "aria-pressed:border-warn aria-pressed:bg-warn aria-pressed:text-white",
  unknown: "",
};

interface Draft {
  attendance: Attendance;
  minutes: string;
}

const works = (a: Attendance) => a === "attended" || a === "late";

// 한 날짜의 출석. 바꾼 것은 화면에만 두었다가 "저장"으로 한 번에 보낸다.
// 저장 결과(state)는 부모가 들고 있다: 저장 뒤 새 값으로 이 화면을 다시 만들어도 "저장했어요"가 남도록.
function DayBoard({
  eventId,
  day,
  rules,
  state,
  action,
}: {
  eventId: string;
  day: AttendanceDay;
  rules: PayRules;
  state: EventActionState;
  action: (formData: FormData) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(day.rows.map((r) => [r.id, { attendance: r.attendance, minutes: String(r.overtimeMinutes) }])),
  );
  const [overtimeOpen, setOvertimeOpen] = useState<Record<string, boolean>>({});

  const changed = day.rows.filter((r) => {
    const d = drafts[r.id];
    return d.attendance !== r.attendance || (works(d.attendance) && (Number(d.minutes) || 0) !== r.overtimeMinutes);
  });
  const count = (a: Attendance) => day.rows.filter((r) => drafts[r.id].attendance === a).length;
  const set = (id: string, patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [id]: { ...all[id], ...patch } }));

  // 저장하지 않고 다른 화면으로 가려 하면 묻는다 (새로고침·창 닫기, 화면 안의 링크)
  const dirty = changed.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const message = `저장하지 않은 출석이 ${changed.length}명 있어요. 이대로 나갈까요?`;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      // 전화·문자 버튼은 이 화면을 떠나지 않으니 묻지 않는다
      const link = (e.target as HTMLElement | null)?.closest('a[href]:not([href^="tel:"]):not([href^="sms:"])');
      if (link && !window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, changed.length]);

  if (day.rows.length === 0) return <p className="rounded-xl border border-line bg-white p-6 text-center text-sm text-muted">이 날짜에 확정된 사람이 없어요.</p>;

  const payload = JSON.stringify(
    changed.map((r) => ({ applicationId: r.id, attendance: drafts[r.id].attendance, overtimeMinutes: Number(drafts[r.id].minutes) || 0 })),
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="rows" value={payload} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold">확정 {day.rows.length}명</span>
        <span className="text-body">
          참석 {count("attended")} · 지각 {count("late")} · 노쇼 {count("no_show")} · <span className={count("unknown") > 0 ? "font-bold text-warn" : ""}>미확인 {count("unknown")}</span>
        </span>
        <button
          type="button"
          disabled={count("unknown") === 0}
          onClick={() => setDrafts((all) => Object.fromEntries(Object.entries(all).map(([id, d]) => [id, d.attendance === "unknown" ? { ...d, attendance: "attended" } : d])))}
          className="ml-auto h-11 rounded-lg border-2 border-brand bg-white px-4 text-sm font-bold text-brand-strong disabled:border-line disabled:text-muted"
        >
          남은 {count("unknown")}명 모두 참석
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {day.rows.map((r) => {
          const d = drafts[r.id];
          const pay = calculatePay(r.rate, rules, { scheduledMinutes: day.scheduledMinutes, overtimeMinutes: works(d.attendance) ? Number(d.minutes) || 0 : 0 });
          const showOvertime = works(d.attendance) && (overtimeOpen[r.id] || (Number(d.minutes) || 0) > 0);
          return (
            <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex min-w-0 items-start justify-between gap-2 sm:flex-[1_1_220px]">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[17px] font-bold">
                    {r.name} <span className="text-[13px] font-normal text-muted">{TIER_LABEL[r.tier]}</span>
                  </span>
                  <span className="text-[13px] text-muted">
                    {r.roleName || "역할 미정"} · {r.rateText}
                  </span>
                </div>
                {r.phone && (
                  <span className="flex shrink-0 gap-1.5">
                    <a href={`tel:${r.phone}`} aria-label={`${r.name}에게 전화 ${formatPhone(r.phone)}`} className="flex h-11 items-center rounded-lg border border-field px-3 text-sm font-bold">
                      전화
                    </a>
                    <a href={`sms:${r.phone}`} aria-label={`${r.name}에게 문자`} className="flex h-11 items-center rounded-lg border border-field px-3 text-sm font-bold">
                      문자
                    </a>
                  </span>
                )}
              </div>
              <div role="group" aria-label={`${r.name} 출석`} className="grid grid-cols-3 gap-1.5 sm:flex">
                {CHOICES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={d.attendance === c}
                    onClick={() => set(r.id, { attendance: d.attendance === c ? "unknown" : c })}
                    className={`h-12 rounded-lg border-2 border-field bg-white px-4 text-[15px] font-bold text-ink sm:min-w-20 ${CHOICE_LOOK[c]}`}
                  >
                    {ATTENDANCE_LABEL[c]}
                  </button>
                ))}
              </div>
              {/* 출석을 고르기 전에는 금액 줄을 비워 두지 않고 아예 숨긴다 (카드 높이를 줄임) */}
              {d.attendance !== "unknown" && (
                <div className="flex flex-wrap items-center justify-between gap-2 sm:ml-auto sm:justify-end">
                  {works(d.attendance) &&
                    (showOvertime ? (
                      <label className="flex items-center gap-1.5 text-sm text-body">
                        초과
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={1440}
                          step={10}
                          value={d.minutes}
                          onChange={(e) => set(r.id, { minutes: e.target.value })}
                          aria-label={`${r.name} 초과 시간(분)`}
                          className="h-11 w-20 rounded-lg border border-field bg-white px-2 text-right"
                        />
                        분
                      </label>
                    ) : (
                      <button type="button" onClick={() => setOvertimeOpen((o) => ({ ...o, [r.id]: true }))} className="h-11 text-sm text-brand-strong underline underline-offset-4">
                        + 초과 근무
                      </button>
                    ))}
                  <span className="text-right text-sm">
                    {works(d.attendance) ? (
                      <>
                        <span className="block font-bold">{formatWon(pay.total + r.extras)}</span>
                        <span className="text-[12px] text-muted">
                          보수 {formatWon(pay.total)}
                          {r.extras > 0 && ` + 추가 ${formatWon(r.extras)}`}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted">지급 없음</span>
                    )}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* 화면 아래에 붙어 있어 언제든 저장할 수 있다 (휴대폰에서는 아래 탭 메뉴 바로 위) */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 -mx-1 flex flex-wrap items-center gap-3 rounded-t-xl border-t border-line bg-white/95 px-1 py-3 backdrop-blur lg:bottom-0">
        <SubmitButton pendingText="저장 중…" disabled={!dirty} className="h-12 flex-1 text-[15px] sm:flex-none sm:px-8">
          {dirty ? `${changed.length}명 출석 저장` : "바꾼 것 없음"}
        </SubmitButton>
        {state.error && (
          <p role="alert" className="text-sm font-bold text-warn">
            {state.error}
          </p>
        )}
        {state.ok && !dirty && (
          <p role="status" className="text-sm font-bold text-brand-strong">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

// 출석 확인: 날짜를 골라 확정자의 참석·지각·노쇼와 초과 시간을 넣는다. 예상 지급액(세금 공제 전)을 함께 보여 준다.
export function AttendanceBoard({
  eventId,
  days,
  rules,
  totals,
  initialDayId,
}: {
  eventId: string;
  days: AttendanceDay[];
  rules: PayRules;
  totals: PersonTotal[];
  initialDayId: string | null; // 처음 보여 줄 날짜 (오늘 현장이면 오늘)
}) {
  const [state, action] = useActionState<EventActionState, FormData>(saveAttendanceBatch, {});
  const [dayId, setDayId] = useState(initialDayId && days.some((d) => d.id === initialDayId) ? initialDayId : (days[0]?.id ?? ""));
  if (days.every((d) => d.rows.length === 0)) return <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">확정된 사람이 없어요.</p>;
  const day = days.find((d) => d.id === dayId) ?? days[0];
  // 저장된 값이 바뀌면(저장 뒤 새로 받은 값) 화면의 바꾼 내용을 새로 시작한다
  const savedKey = day.rows.map((r) => `${r.id}:${r.attendance}:${r.overtimeMinutes}`).join("|");

  return (
    <div className="flex flex-col gap-4">
      {days.length > 1 && (
        <div role="tablist" aria-label="출석 확인할 날짜" className="flex gap-1.5 overflow-x-auto">
          {days.map((d) => {
            const unknown = d.rows.filter((r) => r.attendance === "unknown").length;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={d.id === day.id}
                onClick={() => setDayId(d.id)}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-field bg-white px-4 text-sm aria-selected:border-ink aria-selected:bg-ink aria-selected:font-bold aria-selected:text-white"
              >
                {d.label}
                {unknown > 0 && <span className="rounded-full bg-warn px-1.5 text-xs font-bold text-white">{unknown}</span>}
              </button>
            );
          })}
        </div>
      )}
      <section aria-label={`${day.label} 출석`} className="flex flex-col gap-2">
        {days.length === 1 && <h3 className="font-bold">{day.label}</h3>}
        <DayBoard key={`${day.id}|${savedKey}`} eventId={eventId} day={day} rules={rules} state={state} action={action} />
      </section>
      <p className="text-[13px] leading-relaxed text-muted">
        출석을 고르지 않은 사람(미확인)은 일하지 않은 것으로 보고 정산·계약서에서 빠져요. 노쇼·지각으로 저장하면 관리자 기록에 자동으로 남아요. 금액은 세금 공제 전 예상액이에요.
      </p>

      {totals.length > 0 && (
        <section aria-labelledby="totals-title" className="flex flex-col gap-2">
          <h3 id="totals-title" className="font-bold">
            사람별 합계 <span className="text-sm font-normal text-muted">(저장한 출석 기준, 세금 공제 전)</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            <table className="stack-table w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                  <th scope="col" className="px-4 py-3 font-bold">이름</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold">참여한 날</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold">보수</th>
                  <th scope="col" className="px-3 py-3 text-right font-bold">추가 지급</th>
                  <th scope="col" className="px-4 py-3 text-right font-bold">합계</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.memberId} className="border-b border-[#eef0f3] last:border-0">
                    <td className="stack-first px-4 py-2.5">
                      <span className="font-bold">{t.name}</span> <span className="text-[12px] text-muted">{TIER_LABEL[t.tier]}</span>
                    </td>
                    <td data-label="참여한 날" className="px-3 py-2.5 text-right">
                      {t.workedDays} / {t.totalDays}일
                    </td>
                    <td data-label="보수" className="px-3 py-2.5 text-right">{formatWon(t.pay)}</td>
                    <td data-label="추가 지급" className="px-3 py-2.5 text-right">{formatWon(t.extras)}</td>
                    <td data-label="합계" className="px-4 py-2.5 text-right font-bold">{formatWon(t.pay + t.extras)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
