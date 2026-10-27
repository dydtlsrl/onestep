"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatWon } from "@/lib/format";
import { calculatePay, PAY_TYPE_LABEL, type PayRules, type PayType } from "@/lib/pay";
import { createRole, setRateDefault, setRoleActive, updateRole, type RateState } from "./actions";

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  pay_type: PayType;
  default_rate: number;
  min_paid_hours: number | null;
  overtime_rate: number | null;
  sort_order: number;
  is_active: boolean;
  default_for: "setup" | "main" | "other" | null;
}

const DEFAULT_LABEL = { setup: "세팅일 기본", main: "진행일 기본" } as const;

const fieldClass = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

export function Message({ state }: { state: RateState }) {
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

// 역할 입력칸 묶음 (추가·수정에서 같이 쓴다). 지급 방식에 따라 입력칸이 바뀐다.
function RoleFields({
  idPrefix,
  role,
  nextOrder,
  rules,
}: {
  idPrefix: string;
  role?: RoleRow;
  nextOrder?: number;
  rules: PayRules;
}) {
  const [payType, setPayType] = useState<PayType>(role?.pay_type ?? "hourly");

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="mb-2 text-sm font-bold">지급 방식</legend>
        {(["hourly", "daily"] as const).map((type) => (
          <label key={type} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="payType"
              value={type}
              checked={payType === type}
              onChange={() => setPayType(type)}
              className="h-4 w-4 accent-brand"
            />
            {type === "hourly" ? "시급 (1시간 단가)" : "일급 (1회 단가)"}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[2_1_160px] flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-name`} className="text-sm font-bold">
            이름
          </label>
          <input id={`${idPrefix}-name`} name="name" required maxLength={30} defaultValue={role?.name} placeholder="예: 필기 세팅, 면접 진행(종일)" className={fieldClass} />
        </div>
        <div className="flex flex-[1_1_140px] flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-rate`} className="text-sm font-bold">
            {payType === "hourly" ? "1시간 단가 (원)" : "1회 단가 (원)"}
          </label>
          <input
            id={`${idPrefix}-rate`}
            name="defaultRate"
            inputMode="numeric"
            required
            defaultValue={role ? String(role.default_rate) : ""}
            placeholder={payType === "hourly" ? "예: 12000" : "예: 130000"}
            className={`${fieldClass} text-right`}
          />
        </div>
        {payType === "hourly" ? (
          <div className="flex flex-[1_1_150px] flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-min`} className="text-sm font-bold">
              최소 보장 시간
            </label>
            <input
              id={`${idPrefix}-min`}
              name="minPaidHours"
              type="number"
              min={0}
              max={24}
              step={0.5}
              defaultValue={role?.min_paid_hours ?? ""}
              placeholder={`비우면 공통 ${rules.defaultMinPaidHours}시간`}
              className={`${fieldClass} text-right`}
            />
          </div>
        ) : (
          <div className="flex flex-[1_1_150px] flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-ot`} className="text-sm font-bold">
              초과 1시간당 (원)
            </label>
            <input
              id={`${idPrefix}-ot`}
              name="overtimeRate"
              inputMode="numeric"
              defaultValue={role?.overtime_rate ?? ""}
              placeholder="예: 15000"
              className={`${fieldClass} text-right`}
            />
          </div>
        )}
        <div className="flex flex-[3_1_220px] flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-desc`} className="text-sm font-bold">
            설명
          </label>
          <input id={`${idPrefix}-desc`} name="description" maxLength={200} defaultValue={role?.description} placeholder="예: 필기시험 세팅 기준 4시간" className={fieldClass} />
        </div>
        <div className="flex w-20 flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-order`} className="text-sm font-bold">
            순서
          </label>
          <input
            id={`${idPrefix}-order`}
            name="sortOrder"
            type="number"
            min={0}
            max={999}
            defaultValue={role?.sort_order ?? nextOrder ?? 0}
            className={`${fieldClass} text-right`}
          />
        </div>
      </div>
      {payType === "hourly" && (
        <p className="text-[13px] text-muted">
          초과 시간은 1시간 단가의 {rules.overtimeMultiplier}배로 계산해요. (공통 계산 규칙)
        </p>
      )}
    </div>
  );
}

export function CreateRoleForm({ nextOrder, rules }: { nextOrder: number; rules: PayRules }) {
  const [state, action] = useActionState<RateState, FormData>(createRole, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <RoleFields idPrefix="new" nextOrder={nextOrder} rules={rules} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="추가 중…">단가 추가</SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}

// 실제로 받게 될 금액 예시 (예: 4시간 44,000원 · 8시간 88,000원)
function examples(role: RoleRow, rules: PayRules): string {
  const rate = { payType: role.pay_type, rate: role.default_rate, minPaidHours: role.min_paid_hours, overtimeRate: role.overtime_rate };
  if (role.pay_type === "daily") {
    return `하루 ${formatWon(role.default_rate)}${role.overtime_rate !== null ? ` · 초과 1시간당 ${formatWon(role.overtime_rate)}` : ""}`;
  }
  const at = (h: number) => calculatePay(rate, rules, { scheduledMinutes: h * 60, overtimeMinutes: 0 }).total;
  const min = role.min_paid_hours ?? rules.defaultMinPaidHours;
  return `4시간 ${formatWon(at(4))} · 8시간 ${formatWon(at(8))}${min > 0 ? ` · 최소 ${min}시간 보장` : ""} · 초과 ${rules.overtimeMultiplier}배`;
}

function DefaultButton({ role, kind }: { role: RoleRow; kind: "setup" | "main" }) {
  const on = role.default_for === kind;
  return (
    <form action={setRateDefault}>
      <input type="hidden" name="id" value={role.id} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="on" value={on ? "false" : "true"} />
      <button
        type="submit"
        aria-pressed={on}
        className={`h-9 rounded-md border px-3 text-sm font-bold ${on ? "border-brand bg-brand-soft text-brand-strong" : "border-field bg-white text-body hover:bg-ground"}`}
      >
        {on ? `★ ${DEFAULT_LABEL[kind]}` : `☆ ${DEFAULT_LABEL[kind]}으로`}
      </button>
    </form>
  );
}

// 단가표 한 줄. 평소에는 값만 보이고, 고치기를 누르면 입력칸이 열린다.
export function RoleItem({ role, rules }: { role: RoleRow; rules: PayRules }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RateState, FormData>(async (prev: RateState, formData: FormData) => {
    const result = await updateRole(prev, formData);
    if (!result.error) setEditing(false);
    return result;
  }, {});

  return (
    <li className={`flex flex-col gap-3 border-b border-[#eef0f3] py-4 last:border-0 ${role.is_active ? "" : "opacity-60"}`}>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-8 text-right text-sm text-muted">{role.sort_order}</span>
          <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-bold">
              {role.name}
              {(role.default_for === "setup" || role.default_for === "main") && (
                <span className="rounded bg-brand-soft px-1.5 text-[11px] font-bold text-brand-strong">★ {DEFAULT_LABEL[role.default_for]}</span>
              )}
              {!role.is_active && <span className="rounded border border-line px-1.5 text-[11px] font-bold text-muted">숨김</span>}
            </span>
            <span className="text-[13px] text-body">{examples(role, rules)}</span>
            {role.description && <span className="text-[13px] text-muted">{role.description}</span>}
          </div>
          <span className="text-[15px] font-bold">
            {PAY_TYPE_LABEL[role.pay_type]} {formatWon(role.default_rate)}
          </span>
          <div className="flex flex-wrap gap-2">
            {role.is_active && (
              <>
                <DefaultButton role={role} kind="setup" />
                <DefaultButton role={role} kind="main" />
              </>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground"
            >
              고치기
            </button>
            <form action={setRoleActive}>
              <input type="hidden" name="id" value={role.id} />
              <input type="hidden" name="active" value={role.is_active ? "false" : "true"} />
              <button type="submit" className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground">
                {role.is_active ? "숨기기" : "다시 보이기"}
              </button>
            </form>
          </div>
          <Message state={state} />
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3 rounded-lg bg-ground p-3">
          <input type="hidden" name="id" value={role.id} />
          <RoleFields idPrefix={role.id} role={role} rules={rules} />
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingText="저장 중…">저장</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-11 rounded-lg border border-field bg-white px-4 text-sm font-bold text-ink"
            >
              취소
            </button>
            <Message state={state} />
          </div>
        </form>
      )}
    </li>
  );
}
