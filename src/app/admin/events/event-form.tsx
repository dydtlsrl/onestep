"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { DAY_KIND_LABEL, EVENT_TYPE_LABEL, formatShortDate, scheduledMinutes, suggestPayDate, type DayKind, type EventType } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { calculatePay, PAY_TYPE_LABEL, type PayRules, type PayType } from "@/lib/pay";
import { createEvent, updateEvent, type EventActionState } from "./actions";
import { activePresetId, defaultPay, emptyEvent, presetValues, type DayDraft, type EventFormValues, type RoleOption } from "./event-form-values";

export type { DayDraft, EventFormValues, RoleOption };

const field = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";
const label = "text-sm font-bold";

let keySeq = 0;
const newKey = () => `day-new-${++keySeq}`;

// 날짜 문자열에 하루를 더하거나 뺀다 (2026-11-08 → 2026-11-09)
function shiftDate(date: string, days: number): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const byDate = (a: DayDraft, b: DayDraft) => (a.dayDate || "9999").localeCompare(b.dayDate || "9999") || a.startTime.localeCompare(b.startTime);
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {hint && <p className="text-[13px] leading-relaxed text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ id, text, children, className = "" }: { id: string; text: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      {children}
    </div>
  );
}

function UnitSelect({ id, name, perDay, onChange }: { id: string; name: string; perDay: boolean; onChange: (perDay: boolean) => void }) {
  return (
    <Field id={id} text="주는 방식" className="w-48">
      <select id={id} name={name} value={perDay ? "day" : "once"} onChange={(e) => onChange(e.target.value === "day")} className={field}>
        <option value="day">참여한 날마다</option>
        <option value="once">일정당 한 번</option>
      </select>
    </Field>
  );
}

// 일정 등록·수정 폼. 일정 안에 날짜(세팅일·진행일)를 여러 개 두고, 날짜마다 시간·모집 인원·단가를 정한다.
// 회원은 날짜만 골라 신청하고, 역할은 신청자를 보고 대표가 일정 상세에서 사람마다 정한다.
export function EventForm({
  mode,
  eventId,
  initial,
  roles,
  rules,
  lockedDayIds = [],
}: {
  mode: "create" | "edit";
  eventId?: string;
  initial: EventFormValues;
  roles: RoleOption[];
  rules: PayRules;
  lockedDayIds?: string[];
}) {
  const [state, action] = useActionState<EventActionState, FormData>(mode === "create" ? createEvent : updateEvent, {});
  const [days, setDays] = useState<DayDraft[]>(initial.days);
  // 저장한 뒤 서버에서 새 날짜 id가 오면 목록을 서버 값으로 맞춘다 (같은 날짜가 두 번 추가되지 않게)
  const initialKey = JSON.stringify(initial.days);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  if (initialKey !== syncedKey) {
    setSyncedKey(initialKey);
    setDays(initial.days);
  }
  const [payDate, setPayDate] = useState(initial.payDate);
  const [allDaysRequired, setAllDaysRequired] = useState(initial.allDaysRequired);
  const [transportOn, setTransportOn] = useState(initial.transportOn);
  const [transportPerDay, setTransportPerDay] = useState(initial.transportPerDay);
  const [regionalOn, setRegionalOn] = useState(initial.regionalOn);
  const [regionalPerDay, setRegionalPerDay] = useState(initial.regionalPerDay);

  const sorted = [...days].sort(byDate);
  const lastDate = sorted.filter((d) => d.dayDate).at(-1)?.dayDate ?? "";
  const suggested = lastDate ? suggestPayDate(lastDate) : "";
  const multiDay = days.length > 1;

  function updateDay(key: string, patch: Partial<DayDraft>) {
    setDays((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  // 종류를 세팅↔진행으로 바꿀 때, 단가가 원래 종류의 기본 그대로였으면 새 종류의 기본으로 바꿔 준다
  function changeKind(day: DayDraft, kind: DayKind) {
    const before = defaultPay(day.kind, roles, rules);
    const untouched =
      day.payType === before.payType && day.rate === before.rate && day.minPaidHours === before.minPaidHours && day.overtimeRate === before.overtimeRate;
    // (presetId는 비교하지 않는다: 같은 금액이면 손대지 않은 것으로 본다)
    updateDay(day.key, untouched ? { kind, ...defaultPay(kind, roles, rules) } : { kind });
  }

  // 마지막 날을 복사해 다음 날 진행일을 만든다 (마지막 날이 세팅일이면 단가는 ★진행일 기본)
  function addMainDay() {
    const last = sorted.at(-1);
    setDays((list) => [
      ...list,
      last
        ? {
            ...last,
            ...(last.kind === "main" ? {} : defaultPay("main", roles, rules)),
            id: undefined,
            key: newKey(),
            dayDate: shiftDate(last.dayDate, 1),
            kind: "main",
          }
        : { ...emptyEvent(rules, roles).days[0], key: newKey() },
    ]);
  }

  // 첫날 전날에 세팅일을 만든다 (단가는 ★세팅일 기본)
  function addSetupDay() {
    const first = sorted[0];
    setDays((list) => [
      ...list,
      {
        key: newKey(),
        dayDate: first ? shiftDate(first.dayDate, -1) : "",
        kind: "setup",
        gatherTime: "",
        startTime: "14:00",
        endTime: "18:00",
        headcount: "1",
        ...defaultPay("setup", roles, rules),
      },
    ]);
  }

  const serialized = JSON.stringify(
    sorted.map((d) => ({
      ...(d.id ? { id: d.id } : {}),
      dayDate: d.dayDate,
      kind: d.kind,
      gatherTime: d.gatherTime,
      startTime: d.startTime,
      endTime: d.endTime,
      headcount: d.headcount,
      payType: d.payType,
      rate: digitsOnly(d.rate) || "x",
      minPaidHours: d.minPaidHours,
      overtimeRate: digitsOnly(d.overtimeRate),
    })),
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <input type="hidden" name="days" value={serialized} />

      <Section title="기본 정보">
        <div className="flex flex-wrap gap-3">
          <Field id="type" text="유형" className="flex-[1_1_140px]">
            <select id="type" name="type" defaultValue={initial.type} className={field}>
              {(Object.keys(EVENT_TYPE_LABEL) as EventType[]).map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="title" text="제목 (회원에게 보임)" className="flex-[3_1_260px]">
            <input id="title" name="title" required maxLength={80} defaultValue={initial.title} placeholder="예: 대기업 하반기 공채 필기시험" className={field} />
          </Field>
          <Field id="clientName" text="고객사 (회원에게 안 보임)" className="flex-[2_1_200px]">
            <input id="clientName" name="clientName" maxLength={60} defaultValue={initial.clientName} className={field} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field id="locationName" text="장소" className="flex-[1_1_200px]">
            <input id="locationName" name="locationName" maxLength={80} defaultValue={initial.locationName} placeholder="예: OO중학교" className={field} />
          </Field>
          <Field id="address" text="주소" className="flex-[2_1_260px]">
            <input id="address" name="address" maxLength={200} defaultValue={initial.address} placeholder="예: 서울 송파구 ..." className={field} />
          </Field>
        </div>
      </Section>

      <Section
        title="날짜와 모집 인원·단가"
        hint="세팅일·진행일처럼 날짜마다 시간, 모집 인원, 단가를 정해요. 단가는 단가표에 저장해 둔 것을 버튼으로 고르고, 날짜를 추가하면 ★세팅일 기본·진행일 기본이 자동으로 들어가요. 회원은 날짜만 골라 신청하고, 역할은 신청자를 보고 일정 상세에서 사람마다 정해요."
      >
        <ol className="flex flex-col gap-4">
          {sorted.map((d, index) => {
            const minutes = d.startTime && d.endTime ? scheduledMinutes(d.startTime, d.endTime) : 0;
            const locked = d.id ? lockedDayIds.includes(d.id) : false;
            const estimate = calculatePay(
              {
                payType: d.payType,
                rate: Number(digitsOnly(d.rate)) || 0,
                minPaidHours: d.minPaidHours === "" ? null : Number(d.minPaidHours),
                overtimeRate: d.overtimeRate === "" ? null : Number(digitsOnly(d.overtimeRate)),
              },
              rules,
              { scheduledMinutes: minutes, overtimeMinutes: 0 },
            );
            return (
              <li key={d.key} className="flex flex-col gap-3 rounded-xl border border-field p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold">
                    {index + 1}일차
                    {d.dayDate && (
                      <span className="ml-2 font-normal text-body">
                        {formatShortDate(d.dayDate)} {DAY_KIND_LABEL[d.kind]}
                      </span>
                    )}
                  </h3>
                  <button
                    type="button"
                    disabled={locked || days.length === 1}
                    title={locked ? "신청이 있어 뺄 수 없어요" : undefined}
                    onClick={() => setDays((list) => list.filter((x) => x.key !== d.key))}
                    className="h-9 rounded-lg border border-field bg-white px-3 text-sm text-ink hover:bg-ground disabled:text-muted disabled:hover:bg-white"
                  >
                    이 날짜 빼기
                  </button>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Field id={`${d.key}-date`} text="날짜" className="flex-[1_1_150px]">
                    <input id={`${d.key}-date`} type="date" required value={d.dayDate} onChange={(e) => updateDay(d.key, { dayDate: e.target.value })} className={field} />
                  </Field>
                  <Field id={`${d.key}-kind`} text="종류" className="flex-[1_1_100px]">
                    <select id={`${d.key}-kind`} value={d.kind} onChange={(e) => changeKind(d, e.target.value as DayKind)} className={field}>
                      {(Object.keys(DAY_KIND_LABEL) as DayKind[]).map((k) => (
                        <option key={k} value={k}>
                          {DAY_KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id={`${d.key}-gather`} text="집합" className="flex-[1_1_110px]">
                    <input id={`${d.key}-gather`} type="time" value={d.gatherTime} onChange={(e) => updateDay(d.key, { gatherTime: e.target.value })} className={field} />
                  </Field>
                  <Field id={`${d.key}-start`} text="근무 시작" className="flex-[1_1_110px]">
                    <input id={`${d.key}-start`} type="time" required value={d.startTime} onChange={(e) => updateDay(d.key, { startTime: e.target.value })} className={field} />
                  </Field>
                  <Field id={`${d.key}-end`} text="근무 종료" className="flex-[1_1_110px]">
                    <input id={`${d.key}-end`} type="time" required value={d.endTime} onChange={(e) => updateDay(d.key, { endTime: e.target.value })} className={field} />
                  </Field>
                </div>
                <div className="flex flex-col gap-3 rounded-lg bg-[#f8f9fa] p-3">
                  {roles.length > 0 && (
                    <div className="flex flex-col gap-2" role="group" aria-label={`${index + 1}일차 단가 고르기`}>
                      <span className="text-sm font-bold">단가 고르기</span>
                      <div className="flex flex-wrap gap-2">
                        {roles.map((r) => {
                          const on = activePresetId(d, roles) === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              aria-pressed={on}
                              onClick={() => updateDay(d.key, presetValues(r))}
                              className={`flex min-h-10 flex-col items-start rounded-lg border px-3 py-1.5 text-left ${on ? "border-brand bg-brand-soft" : "border-field bg-white hover:bg-ground"}`}
                            >
                              <span className={`text-sm font-bold ${on ? "text-brand-strong" : "text-ink"}`}>
                                {on && "✓ "}
                                {r.name}
                              </span>
                              <span className="text-[12px] text-muted">
                                {PAY_TYPE_LABEL[r.pay_type]} {formatWon(r.default_rate)}
                                {r.pay_type === "hourly" && r.min_paid_hours ? ` · 최소 ${r.min_paid_hours}시간` : ""}
                              </span>
                            </button>
                          );
                        })}
                        {activePresetId(d, roles) === null && (
                          <span className="flex min-h-10 items-center rounded-lg border border-dashed border-field px-3 text-sm text-muted">직접 입력한 단가</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                  <Field id={`${d.key}-count`} text="모집 인원" className="w-24">
                    <input id={`${d.key}-count`} type="number" min={1} max={500} value={d.headcount} onChange={(e) => updateDay(d.key, { headcount: e.target.value })} className={`${field} text-right`} />
                  </Field>
                  <Field id={`${d.key}-type`} text="지급 방식" className="flex-[1_1_100px]">
                    <select id={`${d.key}-type`} value={d.payType} onChange={(e) => updateDay(d.key, { payType: e.target.value as PayType })} className={field}>
                      <option value="hourly">{PAY_TYPE_LABEL.hourly}</option>
                      <option value="daily">{PAY_TYPE_LABEL.daily}</option>
                    </select>
                  </Field>
                  <Field id={`${d.key}-rate`} text={d.payType === "hourly" ? "1시간 단가" : "1회 단가"} className="flex-[1_1_120px]">
                    <input id={`${d.key}-rate`} inputMode="numeric" value={d.rate} onChange={(e) => updateDay(d.key, { rate: e.target.value })} className={`${field} text-right`} />
                  </Field>
                  {d.payType === "hourly" ? (
                    <Field id={`${d.key}-min`} text="최소 보장(시간)" className="flex-[1_1_110px]">
                      <input
                        id={`${d.key}-min`}
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={d.minPaidHours}
                        placeholder={`공통 ${rules.defaultMinPaidHours}`}
                        onChange={(e) => updateDay(d.key, { minPaidHours: e.target.value })}
                        className={`${field} text-right`}
                      />
                    </Field>
                  ) : (
                    <Field id={`${d.key}-ot`} text="초과 1시간당" className="flex-[1_1_110px]">
                      <input id={`${d.key}-ot`} inputMode="numeric" value={d.overtimeRate} onChange={(e) => updateDay(d.key, { overtimeRate: e.target.value })} className={`${field} text-right`} />
                    </Field>
                  )}
                  </div>
                </div>
                <p className="text-[13px] text-muted">
                  1인 예상 보수 (초과 없이): <strong className="text-ink">{formatWon(estimate.total)}</strong>
                  {d.payType === "hourly" && minutes > 0 && ` · ${minutes / 60}시간${estimate.minimumApplied ? ", 최소 보장 적용" : ""}`}
                  {locked && " · 신청이 있어 뺄 수 없어요"}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addMainDay} className="h-11 rounded-lg border border-brand bg-white px-4 text-sm font-bold text-brand-strong hover:bg-brand-soft">
            + 진행일 추가 (마지막 날 복사)
          </button>
          <button type="button" onClick={addSetupDay} className="h-11 rounded-lg border border-field bg-white px-4 text-sm font-bold text-ink hover:bg-ground">
            + 세팅일 추가 (첫날 전날)
          </button>
        </div>
        {multiDay && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-ground p-3">
            <input type="checkbox" name="allDaysRequired" checked={allDaysRequired} onChange={(e) => setAllDaysRequired(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand" />
            <span className="flex flex-col">
              <span className="font-bold">모든 날짜 참여 필수</span>
              <span className="text-[13px] text-muted">켜면 회원은 모든 날짜를 함께 신청해야 해요. 끄면 가능한 날짜만 골라 신청해요.</span>
            </span>
          </label>
        )}
      </Section>

      <Section title="추가 지급 기본값" hint="확정자에게 자동으로 붙어요. 정산 때 사람별로 고칠 수 있어요. 초과 시간 보수는 출석 확인에서 사람별로 넣어요.">
        <div className="flex flex-col gap-3 rounded-lg border border-[#eef0f3] p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="transportOn" checked={transportOn} onChange={(e) => setTransportOn(e.target.checked)} className="h-5 w-5 accent-brand" />
            <span className="font-bold">교통비</span>
            <span className="text-[13px] text-muted">정액 · 확정자 전원 같은 금액</span>
          </label>
          {transportOn && (
            <div className="flex flex-wrap gap-3 pl-7">
              <Field id="transportAmount" text="1인당 (원)" className="w-48">
                <input id="transportAmount" name="transportAmount" inputMode="numeric" defaultValue={initial.transportAmount} className={`${field} text-right`} />
              </Field>
              {multiDay ? (
                <UnitSelect id="transportUnit" name="transportUnit" perDay={transportPerDay} onChange={setTransportPerDay} />
              ) : (
                <input type="hidden" name="transportUnit" value={transportPerDay ? "day" : "once"} />
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 rounded-lg border border-[#eef0f3] p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="regionalOn" checked={regionalOn} onChange={(e) => setRegionalOn(e.target.checked)} className="h-5 w-5 accent-brand" />
            <span className="font-bold">지방비</span>
            <span className="text-[13px] text-muted">등급별 금액</span>
          </label>
          {regionalOn && (
            <div className="flex flex-wrap gap-3 pl-7">
              <Field id="regionalCore" text="핵심 (원)" className="w-40">
                <input id="regionalCore" name="regionalCore" inputMode="numeric" defaultValue={initial.regionalCore} className={`${field} text-right`} />
              </Field>
              <Field id="regionalGeneral" text="일반 (원)" className="w-40">
                <input id="regionalGeneral" name="regionalGeneral" inputMode="numeric" defaultValue={initial.regionalGeneral} className={`${field} text-right`} />
              </Field>
              {multiDay ? (
                <UnitSelect id="regionalUnit" name="regionalUnit" perDay={regionalPerDay} onChange={setRegionalPerDay} />
              ) : (
                <input type="hidden" name="regionalUnit" value={regionalPerDay ? "day" : "once"} />
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="안내와 마감">
        <Field id="notice" text="안내사항 (회원에게 보임)">
          <textarea id="notice" name="notice" rows={4} maxLength={2000} defaultValue={initial.notice} placeholder="예: 검정 계열 단정한 복장, 신분증 지참" className="w-full rounded-lg border border-field bg-white p-3 text-sm" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Field id="chatLink" text="확정자 톡방 링크 (확정자에게만 보임)" className="flex-[2_1_260px]">
            <input id="chatLink" name="chatLink" type="url" maxLength={300} defaultValue={initial.chatLink} placeholder="https://open.kakao.com/..." className={field} />
          </Field>
          <Field id="applyDeadline" text="신청 마감 (비우면 마감 버튼으로)" className="flex-[1_1_200px]">
            <input id="applyDeadline" name="applyDeadline" type="datetime-local" defaultValue={initial.applyDeadline} className={field} />
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field id="payDate" text="지급 예정일" className="w-48">
            <input id="payDate" name="payDate" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className={field} />
          </Field>
          {suggested && suggested !== payDate && (
            <button type="button" onClick={() => setPayDate(suggested)} className="h-11 rounded-lg border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground">
              추천 날짜 넣기 ({suggested.slice(5).replace("-", "/")})
            </button>
          )}
          <p className="text-[13px] text-muted">추천: 마지막 날 7일 뒤 이후 가장 가까운 15일 또는 말일 (임시 규칙)</p>
        </div>
        <Field id="memo" text="내부 메모 (회원에게 안 보임)">
          <input id="memo" name="memo" maxLength={1000} defaultValue={initial.memo} className={field} />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="저장 중…" className="h-12 px-6 text-[15px]">
          {mode === "create" ? "임시저장으로 만들기" : "일정 정보 저장"}
        </SubmitButton>
        {mode === "create" && <span className="text-[13px] text-muted">만든 뒤 상세 화면에서 공개해요. 공개 전에는 회원에게 보이지 않아요.</span>}
        {state.error && (
          <p role="alert" className="text-sm font-bold text-warn">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm font-bold text-brand-strong">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}
