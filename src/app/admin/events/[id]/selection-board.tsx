"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { APPLICATION_STATUS_LABEL, type ApplicationStatus, type DayRecruit } from "@/lib/events";
import { TIER_LABEL, type MemberTier } from "@/lib/tier";
import { addMemberToEvent, decideApplications, notifyResults, type EventActionState } from "../actions";
import { APPLICATION_BADGE } from "../badges";

export interface DayOption {
  id: string;
  label: string; // 11/7(토) 세팅
  recruit: DayRecruit;
}

export interface ApplicantRow {
  id: string;
  memberId: string;
  name: string;
  tier: MemberTier;
  dayId: string;
  dayLabel: string;
  positionId: string;
  positionName: string;
  status: ApplicationStatus;
  appliedAt: string;
  addedByAdmin: boolean;
  participation: number;
  noShow: number;
  late: number;
  lastNote: string;
}

export interface PositionStat {
  id: string;
  dayId: string;
  name: string;
  headcount: number;
  selected: number;
  waitlisted: number;
  applied: number;
}

export interface MemberOption {
  id: string;
  label: string;
  selectedHere: boolean; // 이 일정의 다른 날짜에 확정된 회원
}

const FILTERS: ("all" | ApplicationStatus)[] = ["all", "applied", "selected", "waitlisted", "rejected", "cancelled"];
const DECISIONS: { status: Exclude<ApplicationStatus, "cancelled" | "applied">; label: string }[] = [
  { status: "selected", label: "확정" },
  { status: "waitlisted", label: "대기" },
  { status: "rejected", label: "미선발" },
];

function Message({ state }: { state: EventActionState }) {
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-9 rounded-full border px-3 text-sm ${active ? "border-ink bg-ink text-white" : "border-line bg-white text-body"}`}
    >
      {children}
    </button>
  );
}

// 신청자 선발: 날짜·역할별 충원 현황, 신청자 표(날짜별 한 줄), 여러 명 한 번에 처리, 직접 추가, 결과 알림
export function SelectionBoard({
  eventId,
  days,
  positions,
  applicants,
  members,
  editable,
  canAdd,
  pendingNotify,
}: {
  eventId: string;
  days: DayOption[];
  positions: PositionStat[];
  applicants: ApplicantRow[];
  members: MemberOption[];
  editable: boolean;
  canAdd: boolean;
  pendingNotify: number;
}) {
  const [decideState, decideAction] = useActionState<EventActionState, FormData>(decideApplications, {});
  const [addState, addAction] = useActionState<EventActionState, FormData>(addMemberToEvent, {});
  const [notifyState, notifyAction] = useActionState<EventActionState, FormData>(notifyResults, {});
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");
  const multiDay = days.length > 1;

  const inDay = dayFilter === "all" ? applicants : applicants.filter((a) => a.dayId === dayFilter);
  const visible = filter === "all" ? inDay : inDay.filter((a) => a.status === filter);
  const selectable = visible.filter((a) => a.status !== "cancelled");
  const allChecked = selectable.length > 0 && selectable.every((a) => checked.has(a.id));
  const memberChoices = members.filter((m) => m.label.includes(memberQuery.trim()));

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.id} aria-label={`${day.label} 충원 현황`} className="flex flex-col gap-2">
          {multiDay && (
            <h3 className="text-sm font-bold text-body">
              {day.label} <span className="font-normal text-muted">· {day.recruit === "assign" ? "대표 지정 (회원 신청 없음)" : "공개 모집"}</span>
            </h3>
          )}
          <div className="flex flex-wrap gap-3">
            {positions
              .filter((p) => p.dayId === day.id)
              .map((p) => {
                const over = p.selected > p.headcount;
                const pct = Math.min(100, Math.round((p.selected / p.headcount) * 100));
                return (
                  <div key={p.id} className="flex flex-[1_1_220px] flex-col gap-2 rounded-xl border border-line bg-white p-4">
                    <span className="text-sm font-bold">{p.name}</span>
                    <span className="text-2xl font-bold tracking-tight">
                      {p.selected} <span className="text-[15px] font-normal text-muted">/ {p.headcount}명 확정</span>
                    </span>
                    <div className="h-2 overflow-hidden rounded bg-[#eef0f3]">
                      <div className={`h-2 rounded ${over ? "bg-warn" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`text-[13px] ${over ? "font-bold text-warn" : "text-muted"}`}>
                      {over ? `모집 인원보다 ${p.selected - p.headcount}명 많아요` : `${p.headcount - p.selected}자리 남음`} · 대기 {p.waitlisted} · 미처리 {p.applied}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      ))}

      {multiDay && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="날짜로 거르기">
          <Chip active={dayFilter === "all"} onClick={() => setDayFilter("all")}>
            모든 날짜
          </Chip>
          {days.map((d) => (
            <Chip key={d.id} active={dayFilter === d.id} onClick={() => setDayFilter(d.id)}>
              {d.label} {applicants.filter((a) => a.dayId === d.id && a.status !== "cancelled").length}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="상태로 거르기">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "전체" : APPLICATION_STATUS_LABEL[f]} {f === "all" ? inDay.length : inDay.filter((a) => a.status === f).length}
          </Chip>
        ))}
      </div>

      {editable && checked.size > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-soft px-3 py-2">
          <span className="mr-2 text-sm font-bold text-brand-strong">{checked.size}건 선택됨</span>
          {DECISIONS.map((d) => (
            <form key={d.status} action={decideAction} onSubmit={() => setChecked(new Set())}>
              <input type="hidden" name="eventId" value={eventId} />
              <input type="hidden" name="ids" value={[...checked].join(",")} />
              <input type="hidden" name="status" value={d.status} />
              <button type="submit" className={`h-9 rounded-lg px-3 text-sm font-bold ${d.status === "selected" ? "bg-brand text-white" : "border border-field bg-white text-ink"}`}>
                {d.label}
              </button>
            </form>
          ))}
          <button type="button" onClick={() => setChecked(new Set())} className="ml-auto text-sm text-brand-strong">
            선택 해제
          </button>
        </div>
      )}
      <Message state={decideState} />

      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[1040px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
              <th scope="col" className="w-10 py-3 pl-4">
                {editable && (
                  <input
                    type="checkbox"
                    aria-label="보이는 신청 모두 선택"
                    checked={allChecked}
                    onChange={() => setChecked(allChecked ? new Set() : new Set(selectable.map((a) => a.id)))}
                    className="h-4 w-4 accent-brand"
                  />
                )}
              </th>
              <th scope="col" className="px-3 py-3 font-bold">이름</th>
              <th scope="col" className="px-3 py-3 font-bold">{multiDay ? "날짜 · 역할" : "역할"}</th>
              <th scope="col" className="px-3 py-3 text-right font-bold">참여</th>
              <th scope="col" className="px-3 py-3 font-bold">노쇼·지각</th>
              <th scope="col" className="px-3 py-3 font-bold">최근 기록 (대표만 보임)</th>
              <th scope="col" className="px-3 py-3 font-bold">신청</th>
              <th scope="col" className="px-3 py-3 font-bold">상태</th>
              <th scope="col" className="px-4 py-3 font-bold">처리</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => (
              <tr key={a.id} className={`border-b border-[#eef0f3] last:border-0 ${checked.has(a.id) ? "bg-[#f3f6fe]" : ""}`}>
                <td className="py-3 pl-4">
                  {editable && a.status !== "cancelled" && (
                    <input
                      type="checkbox"
                      aria-label={`${a.name} ${multiDay ? a.dayLabel : ""} 선택`}
                      checked={checked.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="h-4 w-4 accent-brand"
                    />
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Link href={`/admin/members/${a.memberId}`} className="font-bold text-ink underline-offset-4 hover:underline">
                      {a.name}
                    </Link>
                    {a.tier === "core" ? (
                      <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{TIER_LABEL.core}</span>
                    ) : (
                      <span className="rounded border border-field px-1.5 py-px text-[11px] text-body">{TIER_LABEL.general}</span>
                    )}
                    {a.participation === 0 && <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">첫 참여</span>}
                    {a.addedByAdmin && <span className="text-[11px] text-muted">직접 추가</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  {multiDay && <span className="mr-1.5 font-bold">{a.dayLabel}</span>}
                  {a.positionName}
                </td>
                <td className="px-3 py-3 text-right">{a.participation}회</td>
                <td className="whitespace-nowrap px-3 py-3">
                  {a.noShow + a.late > 0 ? (
                    <span className="font-bold text-warn">
                      노쇼 {a.noShow} · 지각 {a.late}
                    </span>
                  ) : (
                    <span className="text-muted">없음</span>
                  )}
                </td>
                <td className="max-w-[200px] truncate px-3 py-3 text-muted" title={a.lastNote}>
                  {a.lastNote || "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-muted">{a.appliedAt}</td>
                <td className="px-3 py-3">
                  <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${APPLICATION_BADGE[a.status]}`}>{APPLICATION_STATUS_LABEL[a.status]}</span>
                </td>
                <td className="px-4 py-2">
                  {editable && a.status !== "cancelled" && (
                    <div className="flex gap-1">
                      {DECISIONS.map((d) => {
                        const current = a.status === d.status;
                        return (
                          <form key={d.status} action={decideAction}>
                            <input type="hidden" name="eventId" value={eventId} />
                            <input type="hidden" name="ids" value={a.id} />
                            <input type="hidden" name="status" value={current ? "applied" : d.status} />
                            <button
                              type="submit"
                              aria-pressed={current}
                              title={current ? "다시 누르면 처리 전으로 되돌려요" : undefined}
                              className={`h-8 rounded-md border px-2.5 text-[13px] ${current ? "border-ink bg-ink font-bold text-white" : "border-field bg-white text-body"}`}
                            >
                              {d.label}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-muted">
                  {applicants.length === 0 ? "아직 신청자가 없어요." : "이 조건의 신청이 없어요."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="grid gap-4 lg:grid-cols-2">
          {canAdd && (
            <form action={addAction} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
              <h3 className="font-bold">회원 직접 넣기</h3>
              <p className="text-[13px] text-muted">
                대표 지정 날짜(세팅일 등)의 인원이나, 전화로 섭외한 사람을 확정자로 넣어요. 이 일정의 다른 날짜에 확정된 회원이 위에 나와요.
              </p>
              <input type="hidden" name="eventId" value={eventId} />
              <div className="flex flex-wrap gap-2">
                <label htmlFor="member-search" className="sr-only">
                  회원 찾기
                </label>
                <input
                  id="member-search"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="이름으로 찾기"
                  className="h-11 flex-[1_1_140px] rounded-lg border border-field bg-white px-3 text-sm"
                />
                <label htmlFor="member-pick" className="sr-only">
                  회원
                </label>
                <select id="member-pick" name="memberId" required className="h-11 flex-[2_1_200px] rounded-lg border border-field bg-white px-3 text-sm">
                  <option value="">회원 고르기 ({memberChoices.length}명)</option>
                  {memberChoices.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.selectedHere ? `★ ${m.label} (이 일정 확정)` : m.label}
                    </option>
                  ))}
                </select>
                <label htmlFor="position-pick" className="sr-only">
                  날짜와 역할
                </label>
                <select id="position-pick" name="positionId" required className="h-11 flex-[2_1_200px] rounded-lg border border-field bg-white px-3 text-sm">
                  {days.map((d) => (
                    <optgroup key={d.id} label={`${d.label}${d.recruit === "assign" ? " · 대표 지정" : ""}`}>
                      {positions
                        .filter((p) => p.dayId === d.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {multiDay ? `${d.label} · ${p.name}` : p.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SubmitButton variant="secondary" pendingText="넣는 중…">
                  확정자로 넣기
                </SubmitButton>
                <Message state={addState} />
              </div>
            </form>
          )}

          <form action={notifyAction} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
            <h3 className="font-bold">선발 결과 알림</h3>
            <p className="text-[13px] leading-relaxed text-muted">
              확정·미선발이 바뀐 사람에게만 한 번씩 보내요. 날짜가 여러 개면 확정된 날짜를 모아 한 알림에 적어요. 대기자에게는 보내지 않아요. 확정자는 알림을 받으면 톡방 링크를 볼 수 있어요.
            </p>
            <input type="hidden" name="eventId" value={eventId} />
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton pendingText="보내는 중…">알림 보내기 ({pendingNotify}명)</SubmitButton>
              <Message state={notifyState} />
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
