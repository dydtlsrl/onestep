"use client";

import { useState } from "react";
import { formatWon } from "@/lib/format";
import { calculatePay, ROUNDING_LABEL, type PayRules } from "@/lib/pay";
import type { RoleRow } from "./rate-forms";

const fieldClass = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}시간` : `${hours.toFixed(1)}시간`;
}

// 저장된 단가와 규칙으로 보수를 미리 계산해 본다 (저장하지 않음)
export function PayCalculator({ roles, rules }: { roles: RoleRow[]; rules: PayRules }) {
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [workHours, setWorkHours] = useState("5");
  const [overtimeMinutes, setOvertimeMinutes] = useState("60");

  const role = roles.find((r) => r.id === roleId);
  if (!role) return <p className="text-sm text-muted">단가표에 역할을 먼저 추가해 주세요.</p>;

  const scheduledMinutes = Math.max(0, Number(workHours) || 0) * 60;
  const extraMinutes = Math.max(0, Number(overtimeMinutes) || 0);
  const result = calculatePay(
    { payType: role.pay_type, rate: role.default_rate, minPaidHours: role.min_paid_hours, overtimeRate: role.overtime_rate },
    rules,
    { scheduledMinutes, overtimeMinutes: extraMinutes },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[2_1_180px] flex-col gap-1.5">
          <label htmlFor="calc-role" className="text-sm font-bold">
            역할
          </label>
          <select id="calc-role" value={roleId} onChange={(e) => setRoleId(e.target.value)} className={fieldClass}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-[1_1_130px] flex-col gap-1.5">
          <label htmlFor="calc-hours" className="text-sm font-bold">
            정해진 근무 시간
          </label>
          <input
            id="calc-hours"
            type="number"
            min={0}
            max={24}
            step={0.5}
            value={workHours}
            onChange={(e) => setWorkHours(e.target.value)}
            className={`${fieldClass} text-right`}
          />
        </div>
        <div className="flex flex-[1_1_130px] flex-col gap-1.5">
          <label htmlFor="calc-ot" className="text-sm font-bold">
            초과 시간 (분)
          </label>
          <input
            id="calc-ot"
            type="number"
            min={0}
            max={1440}
            step={10}
            value={overtimeMinutes}
            onChange={(e) => setOvertimeMinutes(e.target.value)}
            className={`${fieldClass} text-right`}
          />
        </div>
      </div>

      <dl aria-live="polite" className="flex flex-col gap-2 rounded-lg bg-ground p-4 text-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-body">기본</dt>
          <dd>
            {role.pay_type === "hourly"
              ? `${formatWon(role.default_rate)} × ${formatHours(result.regularHours)}${result.minimumApplied ? " (최소 보장 적용)" : ""} = `
              : "1회 "}
            <strong>{formatWon(result.regularPay)}</strong>
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <dt className="text-body">
            초과 ({extraMinutes}분 → {rules.overtimeUnitMinutes}분 단위 {ROUNDING_LABEL[rules.overtimeRounding]} → {formatHours(result.overtimeHours)})
          </dt>
          <dd>
            {result.missingOvertimeRate
              ? "초과 금액을 정하지 않음"
              : `${formatWon(result.overtimeHourlyRate)} × ${formatHours(result.overtimeHours)} = `}
            {!result.missingOvertimeRate && <strong>{formatWon(result.overtimePay)}</strong>}
          </dd>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-2">
          <dt className="font-bold">합계 (세금 공제 전)</dt>
          <dd className="text-lg font-bold">{formatWon(result.total)}</dd>
        </div>
      </dl>
      <p className="text-[13px] text-muted">저장된 단가와 규칙으로 계산해요. 규칙을 바꿨다면 저장한 뒤 다시 확인해 주세요.</p>
    </div>
  );
}
