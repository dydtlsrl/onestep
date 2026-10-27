// 보수 계산. 단가표 화면의 "계산해 보기"와 이후 정산이 모두 이 함수를 쓴다.
// 계산 방식을 바꾸면 supabase/migrations/20261029000000_pay_rules.sql 맨 위 설명도 같이 고친다.

export type PayType = "hourly" | "daily";
export type OvertimeRounding = "floor" | "ceil" | "round";

export interface PayRules {
  overtimeMultiplier: number; // 시급 역할의 초과 시간 배율 (예: 1.5)
  overtimeUnitMinutes: number; // 초과 시간 계산 단위 (10, 15, 30, 60분)
  overtimeRounding: OvertimeRounding; // 단위 미만 처리
  defaultMinPaidHours: number; // 역할에 따로 정하지 않았을 때의 최소 보장 시간
}

export const DEFAULT_PAY_RULES: PayRules = {
  overtimeMultiplier: 1.5,
  overtimeUnitMinutes: 60,
  overtimeRounding: "floor",
  defaultMinPaidHours: 0,
};

export interface RoleRate {
  payType: PayType;
  rate: number; // 시급이면 1시간 금액, 일급이면 1회 금액
  minPaidHours: number | null; // 시급 역할의 최소 보장 시간 (null이면 공통 규칙)
  overtimeRate: number | null; // 일급 역할의 초과 1시간당 금액
}

export interface WorkTime {
  scheduledMinutes: number; // 일정에 정한 근무 시간
  overtimeMinutes: number; // 정한 시간보다 더 일한 시간
}

export interface PayBreakdown {
  regularHours: number; // 기본 보수로 계산한 시간 (시급만)
  regularPay: number;
  overtimeHours: number; // 단위에 맞춰 계산한 초과 시간
  overtimeHourlyRate: number; // 초과 1시간당 금액
  overtimePay: number;
  total: number;
  minimumApplied: boolean; // 최소 보장 시간이 적용되었는지
  missingOvertimeRate: boolean; // 일급인데 초과 금액이 없어 초과 보수를 계산하지 못했는지
}

// 원 미만은 버린다
const toWon = (value: number) => Math.floor(value + 1e-9);

// 초과 시간을 계산 단위로 맞춘다. 예: 단위 60분, 버림이면 90분 → 1시간
export function countOvertimeHours(minutes: number, rules: PayRules): number {
  if (minutes <= 0) return 0;
  const units = minutes / rules.overtimeUnitMinutes;
  const rounded =
    rules.overtimeRounding === "ceil"
      ? Math.ceil(units - 1e-9)
      : rules.overtimeRounding === "round"
        ? Math.round(units)
        : Math.floor(units + 1e-9);
  return (rounded * rules.overtimeUnitMinutes) / 60;
}

export function calculatePay(role: RoleRate, rules: PayRules, work: WorkTime): PayBreakdown {
  const overtimeHours = countOvertimeHours(work.overtimeMinutes, rules);

  if (role.payType === "daily") {
    const overtimeHourlyRate = role.overtimeRate ?? 0;
    const overtimePay = toWon(overtimeHourlyRate * overtimeHours);
    return {
      regularHours: 0,
      regularPay: role.rate,
      overtimeHours,
      overtimeHourlyRate,
      overtimePay,
      total: role.rate + overtimePay,
      minimumApplied: false,
      missingOvertimeRate: overtimeHours > 0 && role.overtimeRate === null,
    };
  }

  const scheduledHours = Math.max(0, work.scheduledMinutes) / 60;
  const minimumHours = role.minPaidHours ?? rules.defaultMinPaidHours;
  const regularHours = Math.max(scheduledHours, minimumHours);
  const regularPay = toWon(role.rate * regularHours);
  const overtimeHourlyRate = toWon(role.rate * rules.overtimeMultiplier);
  const overtimePay = toWon(overtimeHourlyRate * overtimeHours);

  return {
    regularHours,
    regularPay,
    overtimeHours,
    overtimeHourlyRate,
    overtimePay,
    total: regularPay + overtimePay,
    minimumApplied: minimumHours > scheduledHours,
    missingOvertimeRate: false,
  };
}

// DB의 app_settings.value(pay_rules)를 읽는다. 값이 이상하면 기본값을 쓴다.
export function parsePayRules(value: unknown): PayRules {
  const v = (value ?? {}) as Record<string, unknown>;
  const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
  const rounding = v.overtime_rounding;
  return {
    overtimeMultiplier: num(v.overtime_multiplier, DEFAULT_PAY_RULES.overtimeMultiplier),
    overtimeUnitMinutes: num(v.overtime_unit_minutes, DEFAULT_PAY_RULES.overtimeUnitMinutes),
    overtimeRounding:
      rounding === "floor" || rounding === "ceil" || rounding === "round" ? rounding : DEFAULT_PAY_RULES.overtimeRounding,
    defaultMinPaidHours: num(v.default_min_paid_hours, DEFAULT_PAY_RULES.defaultMinPaidHours),
  };
}

export const ROUNDING_LABEL: Record<OvertimeRounding, string> = { floor: "버림", ceil: "올림", round: "반올림" };
export const PAY_TYPE_LABEL: Record<PayType, string> = { hourly: "시급", daily: "일급" };
