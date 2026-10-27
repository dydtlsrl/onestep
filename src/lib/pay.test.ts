import { describe, expect, it } from "vitest";
import { calculatePay, countOvertimeHours, effectiveRate, DEFAULT_PAY_RULES, parsePayRules, type PayRules, type RoleRate } from "./pay";

const hourly: RoleRate = { payType: "hourly", rate: 12000, minPaidHours: null, overtimeRate: null };
const daily: RoleRate = { payType: "daily", rate: 130000, minPaidHours: null, overtimeRate: 15000 };
const hours = (h: number) => h * 60;

describe("countOvertimeHours", () => {
  it("1시간 단위 버림 (처음 값)", () => {
    expect(countOvertimeHours(40, DEFAULT_PAY_RULES)).toBe(0);
    expect(countOvertimeHours(60, DEFAULT_PAY_RULES)).toBe(1);
    expect(countOvertimeHours(119, DEFAULT_PAY_RULES)).toBe(1);
  });

  it("단위와 처리 방식을 바꿀 수 있다", () => {
    const ceil30: PayRules = { ...DEFAULT_PAY_RULES, overtimeUnitMinutes: 30, overtimeRounding: "ceil" };
    expect(countOvertimeHours(40, ceil30)).toBe(1);
    expect(countOvertimeHours(31, ceil30)).toBe(1);
    expect(countOvertimeHours(30, ceil30)).toBe(0.5);
    const round60: PayRules = { ...DEFAULT_PAY_RULES, overtimeRounding: "round" };
    expect(countOvertimeHours(29, round60)).toBe(0);
    expect(countOvertimeHours(30, round60)).toBe(1);
  });

  it("초과가 없으면 0", () => {
    expect(countOvertimeHours(0, DEFAULT_PAY_RULES)).toBe(0);
    expect(countOvertimeHours(-10, DEFAULT_PAY_RULES)).toBe(0);
  });
});

describe("calculatePay: 시급", () => {
  it("단가 × 근무 시간", () => {
    const r = calculatePay(hourly, DEFAULT_PAY_RULES, { scheduledMinutes: hours(5), overtimeMinutes: 0 });
    expect(r.regularPay).toBe(60000);
    expect(r.total).toBe(60000);
  });

  it("초과 시간은 1.5배", () => {
    const r = calculatePay(hourly, DEFAULT_PAY_RULES, { scheduledMinutes: hours(5), overtimeMinutes: 60 });
    expect(r.overtimeHourlyRate).toBe(18000);
    expect(r.overtimePay).toBe(18000);
    expect(r.total).toBe(78000);
  });

  it("최소 보장 시간보다 짧게 일하면 보장 시간만큼 준다", () => {
    const rules: PayRules = { ...DEFAULT_PAY_RULES, defaultMinPaidHours: 4 };
    const r = calculatePay(hourly, rules, { scheduledMinutes: hours(2), overtimeMinutes: 0 });
    expect(r.regularHours).toBe(4);
    expect(r.regularPay).toBe(48000);
    expect(r.minimumApplied).toBe(true);
  });

  it("역할별 최소 보장 시간이 공통 값보다 먼저", () => {
    const rules: PayRules = { ...DEFAULT_PAY_RULES, defaultMinPaidHours: 4 };
    const r = calculatePay({ ...hourly, minPaidHours: 3 }, rules, { scheduledMinutes: hours(2), overtimeMinutes: 0 });
    expect(r.regularHours).toBe(3);
  });

  it("배율을 바꾸고, 원 미만은 버린다", () => {
    const rules: PayRules = { ...DEFAULT_PAY_RULES, overtimeMultiplier: 1.25 };
    const r = calculatePay({ ...hourly, rate: 12345 }, rules, { scheduledMinutes: hours(1), overtimeMinutes: 60 });
    expect(r.overtimeHourlyRate).toBe(15431);
    expect(r.total).toBe(12345 + 15431);
  });

  it("30분 단위 초과", () => {
    const rules: PayRules = { ...DEFAULT_PAY_RULES, overtimeUnitMinutes: 30 };
    const r = calculatePay(hourly, rules, { scheduledMinutes: hours(4), overtimeMinutes: 50 });
    expect(r.overtimeHours).toBe(0.5);
    expect(r.overtimePay).toBe(9000);
  });
});

describe("calculatePay: 일급", () => {
  it("1회 금액 + 초과 1시간당 금액", () => {
    const r = calculatePay(daily, DEFAULT_PAY_RULES, { scheduledMinutes: hours(5), overtimeMinutes: 120 });
    expect(r.regularPay).toBe(130000);
    expect(r.overtimePay).toBe(30000);
    expect(r.total).toBe(160000);
  });

  it("근무 시간이 짧아도 1회 금액은 그대로", () => {
    expect(calculatePay(daily, DEFAULT_PAY_RULES, { scheduledMinutes: hours(1), overtimeMinutes: 0 }).total).toBe(130000);
  });

  it("초과 금액을 정하지 않았으면 알려 준다", () => {
    const r = calculatePay({ ...daily, overtimeRate: null }, DEFAULT_PAY_RULES, { scheduledMinutes: hours(5), overtimeMinutes: 60 });
    expect(r.overtimePay).toBe(0);
    expect(r.missingOvertimeRate).toBe(true);
  });
});

describe("parsePayRules", () => {
  it("DB 값을 읽는다", () => {
    expect(
      parsePayRules({ overtime_multiplier: 2, overtime_unit_minutes: 30, overtime_rounding: "ceil", default_min_paid_hours: 4, default_hourly_rate: 11500 }),
    ).toEqual({ overtimeMultiplier: 2, overtimeUnitMinutes: 30, overtimeRounding: "ceil", defaultMinPaidHours: 4, defaultHourlyRate: 11500 });
  });

  it("값이 이상하면 기본값", () => {
    expect(parsePayRules(null)).toEqual(DEFAULT_PAY_RULES);
    expect(parsePayRules({ overtime_rounding: "weird", overtime_multiplier: "1.5" })).toEqual(DEFAULT_PAY_RULES);
  });
});

describe("effectiveRate", () => {
  const day = { payType: "hourly" as const, rate: 11000, minPaidHours: 4, overtimeRate: null };

  it("이 사람만 정한 단가가 가장 먼저", () => {
    expect(effectiveRate(day, 13000, 14000).rate).toBe(14000);
    expect(effectiveRate(day, 13000, 9000).rate).toBe(9000);
  });

  it("시급이면 회원 기본 시급과 날짜 단가 중 높은 쪽", () => {
    expect(effectiveRate(day, 13000, null).rate).toBe(13000);
    expect(effectiveRate(day, 10000, null).rate).toBe(11000);
    expect(effectiveRate(day, null, null)).toEqual(day);
  });

  it("일급 날짜에는 회원 기본 시급을 쓰지 않음", () => {
    const daily = { payType: "daily" as const, rate: 110000, minPaidHours: null, overtimeRate: 15000 };
    expect(effectiveRate(daily, 13000, null).rate).toBe(110000);
  });
});
