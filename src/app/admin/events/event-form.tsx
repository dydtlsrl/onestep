"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { EVENT_TYPE_LABEL, scheduledMinutes, suggestPayDate, type EventType } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { calculatePay, PAY_TYPE_LABEL, type PayRules, type PayType } from "@/lib/pay";
import { createEvent, updateEvent, type EventActionState } from "./actions";

export interface RoleOption {
  id: string;
  name: string;
  pay_type: PayType;
  default_rate: number;
  min_paid_hours: number | null;
  overtime_rate: number | null;
}

export interface PositionDraft {
  key: string;
  id?: string;
  roleId: string | null;
  roleName: string;
  payType: PayType;
  rate: string;
  minPaidHours: string;
  overtimeRate: string;
  headcount: string;
}

export interface EventFormValues {
  type: EventType;
  title: string;
  clientName: string;
  eventDate: string;
  gatherTime: string;
  startTime: string;
  endTime: string;
  locationName: string;
  address: string;
  notice: string;
  chatLink: string;
  applyDeadline: string;
  payDate: string;
  memo: string;
  positions: PositionDraft[];
  transportOn: boolean;
  transportAmount: string;
  regionalOn: boolean;
  regionalCore: string;
  regionalGeneral: string;
}

export const EMPTY_EVENT: EventFormValues = {
  type: "written_exam",
  title: "",
  clientName: "",
  eventDate: "",
  gatherTime: "",
  startTime: "",
  endTime: "",
  locationName: "",
  address: "",
  notice: "",
  chatLink: "",
  applyDeadline: "",
  payDate: "",
  memo: "",
  positions: [],
  transportOn: false,
  transportAmount: "",
  regionalOn: false,
  regionalCore: "",
  regionalGeneral: "",
};

const field = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";
const label = "text-sm font-bold";

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

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

// 일정 등록·수정 폼. 모집 역할은 단가표에서 불러와 이 일정에서만 바꿀 수 있다.
export function EventForm({
  mode,
  eventId,
  initial,
  roles,
  rules,
  lockedPositionIds = [],
}: {
  mode: "create" | "edit";
  eventId?: string;
  initial: EventFormValues;
  roles: RoleOption[];
  rules: PayRules;
  lockedPositionIds?: string[];
}) {
  const [state, action] = useActionState<EventActionState, FormData>(mode === "create" ? createEvent : updateEvent, {});
  const [positions, setPositions] = useState<PositionDraft[]>(initial.positions);
  // 저장한 뒤 서버에서 새 역할 id가 오면 목록을 서버 값으로 맞춘다 (같은 역할이 두 번 추가되지 않게)
  const initialKey = JSON.stringify(initial.positions);
  const [syncedKey, setSyncedKey] = useState(initialKey);
  if (initialKey !== syncedKey) {
    setSyncedKey(initialKey);
    setPositions(initial.positions);
  }
  const [eventDate, setEventDate] = useState(initial.eventDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [payDate, setPayDate] = useState(initial.payDate);
  const [transportOn, setTransportOn] = useState(initial.transportOn);
  const [regionalOn, setRegionalOn] = useState(initial.regionalOn);

  const minutes = startTime && endTime ? scheduledMinutes(startTime, endTime) : 0;
  const suggested = eventDate ? suggestPayDate(eventDate) : "";

  function addRole(roleId: string) {
    if (!roleId) return;
    const role = roles.find((r) => r.id === roleId);
    setPositions((list) => [
      ...list,
      role
        ? {
            key: newKey(),
            roleId: role.id,
            roleName: role.name,
            payType: role.pay_type,
            rate: String(role.default_rate),
            minPaidHours: role.min_paid_hours === null ? "" : String(role.min_paid_hours),
            overtimeRate: role.overtime_rate === null ? "" : String(role.overtime_rate),
            headcount: "1",
          }
        : { key: newKey(), roleId: null, roleName: "", payType: "hourly", rate: "", minPaidHours: "", overtimeRate: "", headcount: "1" },
    ]);
  }

  function update(key: string, patch: Partial<PositionDraft>) {
    setPositions((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  const serialized = JSON.stringify(
    positions.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      roleId: p.roleId,
      roleName: p.roleName,
      payType: p.payType,
      rate: p.rate.replace(/[^0-9]/g, "") || "x",
      minPaidHours: p.minPaidHours,
      overtimeRate: p.overtimeRate.replace(/[^0-9]/g, ""),
      headcount: p.headcount,
    })),
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <input type="hidden" name="positions" value={serialized} />

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
            <input id="title" name="title" required maxLength={80} defaultValue={initial.title} placeholder="예: 대기업 하반기 공채 필기시험 감독" className={field} />
          </Field>
          <Field id="clientName" text="고객사 (회원에게 안 보임)" className="flex-[2_1_200px]">
            <input id="clientName" name="clientName" maxLength={60} defaultValue={initial.clientName} className={field} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-3">
          <Field id="eventDate" text="날짜" className="flex-[1_1_160px]">
            <input id="eventDate" name="eventDate" type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} className={field} />
          </Field>
          <Field id="gatherTime" text="집합 시간" className="flex-[1_1_120px]">
            <input id="gatherTime" name="gatherTime" type="time" defaultValue={initial.gatherTime} className={field} />
          </Field>
          <Field id="startTime" text="근무 시작" className="flex-[1_1_120px]">
            <input id="startTime" name="startTime" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={field} />
          </Field>
          <Field id="endTime" text="근무 종료" className="flex-[1_1_120px]">
            <input id="endTime" name="endTime" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} className={field} />
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

      <Section title="모집 역할과 인력 단가" hint="단가표의 값을 불러와요. 이 일정에서만 바꿀 수 있고, 단가표를 나중에 바꿔도 이 일정 금액은 그대로예요.">
        {positions.length === 0 && <p className="text-sm text-muted">아래에서 역할을 추가해 주세요.</p>}
        <ul className="flex flex-col gap-3">
          {positions.map((p) => {
            const locked = p.id ? lockedPositionIds.includes(p.id) : false;
            const estimate = calculatePay(
              {
                payType: p.payType,
                rate: Number(p.rate.replace(/[^0-9]/g, "")) || 0,
                minPaidHours: p.minPaidHours === "" ? null : Number(p.minPaidHours),
                overtimeRate: p.overtimeRate === "" ? null : Number(p.overtimeRate.replace(/[^0-9]/g, "")),
              },
              rules,
              { scheduledMinutes: minutes, overtimeMinutes: 0 },
            );
            return (
              <li key={p.key} className="flex flex-col gap-3 rounded-lg border border-[#eef0f3] p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Field id={`${p.key}-name`} text="역할" className="flex-[2_1_140px]">
                    <input id={`${p.key}-name`} value={p.roleName} maxLength={30} onChange={(e) => update(p.key, { roleName: e.target.value })} className={field} />
                  </Field>
                  <Field id={`${p.key}-type`} text="지급 방식" className="flex-[1_1_100px]">
                    <select id={`${p.key}-type`} value={p.payType} onChange={(e) => update(p.key, { payType: e.target.value as PayType })} className={field}>
                      <option value="hourly">{PAY_TYPE_LABEL.hourly}</option>
                      <option value="daily">{PAY_TYPE_LABEL.daily}</option>
                    </select>
                  </Field>
                  <Field id={`${p.key}-rate`} text={p.payType === "hourly" ? "1시간 단가" : "1회 단가"} className="flex-[1_1_120px]">
                    <input id={`${p.key}-rate`} inputMode="numeric" value={p.rate} onChange={(e) => update(p.key, { rate: e.target.value })} className={`${field} text-right`} />
                  </Field>
                  {p.payType === "hourly" ? (
                    <Field id={`${p.key}-min`} text="최소 보장(시간)" className="flex-[1_1_110px]">
                      <input
                        id={`${p.key}-min`}
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={p.minPaidHours}
                        placeholder={`공통 ${rules.defaultMinPaidHours}`}
                        onChange={(e) => update(p.key, { minPaidHours: e.target.value })}
                        className={`${field} text-right`}
                      />
                    </Field>
                  ) : (
                    <Field id={`${p.key}-ot`} text="초과 1시간당" className="flex-[1_1_110px]">
                      <input id={`${p.key}-ot`} inputMode="numeric" value={p.overtimeRate} onChange={(e) => update(p.key, { overtimeRate: e.target.value })} className={`${field} text-right`} />
                    </Field>
                  )}
                  <Field id={`${p.key}-count`} text="모집 인원" className="w-24">
                    <input id={`${p.key}-count`} type="number" min={1} max={500} value={p.headcount} onChange={(e) => update(p.key, { headcount: e.target.value })} className={`${field} text-right`} />
                  </Field>
                  <button
                    type="button"
                    disabled={locked}
                    title={locked ? "신청자가 있어 지울 수 없어요" : undefined}
                    onClick={() => setPositions((list) => list.filter((x) => x.key !== p.key))}
                    className="h-11 rounded-lg border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground disabled:text-muted disabled:hover:bg-white"
                  >
                    빼기
                  </button>
                </div>
                <p className="text-[13px] text-muted">
                  1인 예상 보수 (초과 없이): <strong className="text-ink">{formatWon(estimate.total)}</strong>
                  {p.payType === "hourly" && minutes > 0 && ` · ${minutes / 60}시간${estimate.minimumApplied ? ", 최소 보장 적용" : ""}`}
                  {locked && " · 신청자가 있어 뺄 수 없어요"}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="add-role" className="text-sm font-bold">
            역할 추가
          </label>
          <select
            id="add-role"
            value=""
            onChange={(e) => {
              addRole(e.target.value);
              e.target.value = "";
            }}
            className="h-11 rounded-lg border border-field bg-white px-3 text-sm"
          >
            <option value="">단가표에서 고르기…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({PAY_TYPE_LABEL[r.pay_type]} {formatWon(r.default_rate)})
              </option>
            ))}
            <option value="custom">직접 입력</option>
          </select>
        </div>
      </Section>

      <Section title="추가 지급 기본값" hint="확정자에게 자동으로 붙어요. 정산 때 사람별로 고칠 수 있어요. 초과 시간 보수는 출석 확인에서 사람별로 넣어요.">
        <div className="flex flex-col gap-3 rounded-lg border border-[#eef0f3] p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" name="transportOn" checked={transportOn} onChange={(e) => setTransportOn(e.target.checked)} className="h-5 w-5 accent-brand" />
            <span className="font-bold">교통비</span>
            <span className="text-[13px] text-muted">정액 · 확정자 전원 같은 금액</span>
          </label>
          {transportOn && (
            <Field id="transportAmount" text="1인당 (원)" className="w-48 pl-7">
              <input id="transportAmount" name="transportAmount" inputMode="numeric" defaultValue={initial.transportAmount} className={`${field} text-right`} />
            </Field>
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
          <p className="text-[13px] text-muted">추천: 행사 7일 뒤 이후 가장 가까운 15일 또는 말일 (임시 규칙)</p>
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
