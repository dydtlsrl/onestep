"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ROUNDING_LABEL, type OvertimeRounding, type PayRules } from "@/lib/pay";
import { updatePayRules, type RateState } from "./actions";
import { Message } from "./rate-forms";

const fieldClass = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

// 모든 역할에 같이 쓰는 보수 계산 규칙 (대표가 바꿀 수 있다)
export function PayRulesForm({ rules }: { rules: PayRules }) {
  const [state, action] = useActionState<RateState, FormData>(updatePayRules, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[1_1_150px] flex-col gap-1.5">
          <label htmlFor="hourlyRate" className="text-sm font-bold">
            기본 시급 (원)
          </label>
          <input
            id="hourlyRate"
            name="hourlyRate"
            inputMode="numeric"
            required
            defaultValue={rules.defaultHourlyRate}
            className={`${fieldClass} text-right`}
          />
        </div>
        <div className="flex flex-[1_1_150px] flex-col gap-1.5">
          <label htmlFor="multiplier" className="text-sm font-bold">
            초과 시간 배율 (시급)
          </label>
          <input
            id="multiplier"
            name="multiplier"
            type="number"
            min={1}
            max={3}
            step={0.05}
            required
            defaultValue={rules.overtimeMultiplier}
            className={`${fieldClass} text-right`}
          />
        </div>
        <div className="flex flex-[1_1_150px] flex-col gap-1.5">
          <label htmlFor="unitMinutes" className="text-sm font-bold">
            초과 시간 계산 단위
          </label>
          <select id="unitMinutes" name="unitMinutes" defaultValue={String(rules.overtimeUnitMinutes)} className={fieldClass}>
            <option value="60">1시간</option>
            <option value="30">30분</option>
            <option value="15">15분</option>
            <option value="10">10분</option>
          </select>
        </div>
        <div className="flex flex-[1_1_150px] flex-col gap-1.5">
          <label htmlFor="rounding" className="text-sm font-bold">
            단위 미만
          </label>
          <select id="rounding" name="rounding" defaultValue={rules.overtimeRounding} className={fieldClass}>
            {(Object.keys(ROUNDING_LABEL) as OvertimeRounding[]).map((value) => (
              <option key={value} value={value}>
                {ROUNDING_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-[1_1_150px] flex-col gap-1.5">
          <label htmlFor="minHours" className="text-sm font-bold">
            기본 최소 보장 시간
          </label>
          <input
            id="minHours"
            name="minHours"
            type="number"
            min={0}
            max={12}
            step={0.5}
            defaultValue={rules.defaultMinPaidHours}
            className={`${fieldClass} text-right`}
          />
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        기본 시급은 새 일정의 날짜를 만들 때 처음 들어가는 단가예요 (예: 11,000원이면 세팅 4시간 44,000원, 8시간 88,000원). 일정마다 바꿀 수 있어요.
        예: 1시간 단위·버림이면 1시간 40분 초과는 1시간, 올림이면 2시간으로 계산해요. 최소 보장 시간은 시급 역할에만
        적용되고, 역할마다 따로 정할 수도 있어요. 0이면 보장 시간이 없어요.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[1_1_260px] flex-col gap-1.5">
          <label htmlFor="reason" className="text-sm font-bold">
            변경 사유 (선택)
          </label>
          <input id="reason" name="reason" maxLength={200} placeholder="예: 대표 확인, 30분 단위로 변경" className={fieldClass} />
        </div>
        <SubmitButton pendingText="저장 중…">규칙 저장</SubmitButton>
      </div>
      <Message state={state} />
    </form>
  );
}
