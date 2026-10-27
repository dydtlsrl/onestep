// 정산·계약서에 들어갈 지급 항목을 만든다. 일정 상세의 출석 합계와 같은 계산(calculatePay)을 쓴다.
import { dayLabel, EXTRA_TYPE_LABEL, scheduledMinutes, toRoleRate, type Attendance, type DayRow, type ExtraItem } from "@/lib/events";
import { calculatePay, effectiveRate, PAY_TYPE_LABEL, type PayRules, type RoleRate } from "@/lib/pay";

export type PaymentItemKind = "work" | "overtime" | "transport" | "regional" | "other";
export type PaymentStatus = "draft" | "scheduled" | "held" | "paid" | "cancelled";
export type ContractStatus = "requested" | "signed" | "voided";

export interface PaymentItemDraft {
  kind: PaymentItemKind;
  label: string;
  amount: number;
  day_id: string | null;
}

// 한 사람의 이 일정 확정 신청 (날짜마다 하나)
export interface SelectedDay {
  day: DayRow;
  attendance: Attendance;
  overtimeMinutes: number;
  roleName: string;
  rateOverride: number | null;
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  draft: "확정 전",
  scheduled: "지급 예정",
  held: "보류",
  paid: "지급 완료",
  cancelled: "취소",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  requested: "서명 대기",
  signed: "서명 완료",
  voided: "무효",
};

export const PAYMENT_KIND_LABEL: Record<PaymentItemKind, string> = {
  work: "근무",
  overtime: "초과 근무",
  transport: "교통비",
  regional: "지방비",
  other: "기타",
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function rateFor(day: DayRow, memberDefault: number | null, override: number | null): RoleRate {
  return effectiveRate(toRoleRate(day), memberDefault, override);
}

export function describeWork(rate: RoleRate, regularHours: number): string {
  if (rate.payType === "daily") return `일급 ${won(rate.rate)}`;
  return `시급 ${won(rate.rate)} × ${Number(regularHours.toFixed(2))}시간`;
}

export interface BuildResult {
  items: PaymentItemDraft[];
  workAmount: number;
  extraAmount: number;
  workedDays: number;
  unknownDays: number; // 출석을 확인하지 않은 날 (참석으로 계산함)
  missingOvertimeRate: boolean;
}

// mode "actual": 출석 기록으로 정산 (노쇼는 빼고, 미확인은 참석으로 넣고 알려 준다)
// mode "planned": 계약서용 예상 금액 (확정된 모든 날, 초과 근무 없음)
export function buildPaymentItems(
  days: SelectedDay[],
  memberDefault: number | null,
  extras: ExtraItem[],
  rules: PayRules,
  mode: "actual" | "planned",
): BuildResult {
  const items: PaymentItemDraft[] = [];
  let workedDays = 0;
  let unknownDays = 0;
  let missingOvertimeRate = false;

  const sorted = [...days].sort((a, b) => a.day.day_date.localeCompare(b.day.day_date) || a.day.start_time.localeCompare(b.day.start_time));
  for (const s of sorted) {
    if (mode === "actual" && s.attendance === "no_show") continue;
    if (mode === "actual" && s.attendance === "unknown") unknownDays += 1;
    workedDays += 1;
    const rate = rateFor(s.day, memberDefault, s.rateOverride);
    const pay = calculatePay(rate, rules, {
      scheduledMinutes: scheduledMinutes(s.day.start_time, s.day.end_time),
      overtimeMinutes: mode === "actual" ? s.overtimeMinutes : 0,
    });
    const label = dayLabel(s.day);
    items.push({ kind: "work", label: `${label} · ${describeWork(rate, pay.regularHours)}`, amount: pay.regularPay, day_id: s.day.id });
    if (pay.overtimePay > 0) {
      items.push({
        kind: "overtime",
        label: `${label} · 초과 ${Number(pay.overtimeHours.toFixed(2))}시간 × ${won(pay.overtimeHourlyRate)}`,
        amount: pay.overtimePay,
        day_id: s.day.id,
      });
    }
    if (pay.missingOvertimeRate) missingOvertimeRate = true;
  }

  if (workedDays > 0) {
    for (const e of extras) {
      const amount = e.perDay ? e.amount * workedDays : e.amount;
      const label = e.perDay && workedDays > 1 ? `${EXTRA_TYPE_LABEL[e.type]} ${won(e.amount)} × ${workedDays}일` : EXTRA_TYPE_LABEL[e.type];
      items.push({ kind: e.type, label, amount, day_id: null });
    }
  }

  return { items, ...sumItems(items), workedDays, unknownDays, missingOvertimeRate };
}

export function sumItems(items: Pick<PaymentItemDraft, "kind" | "amount">[]): { workAmount: number; extraAmount: number } {
  let workAmount = 0;
  let extraAmount = 0;
  for (const i of items) {
    if (i.kind === "work" || i.kind === "overtime") workAmount += i.amount;
    else extraAmount += i.amount;
  }
  return { workAmount, extraAmount };
}

export function rateText(rate: RoleRate): string {
  return `${PAY_TYPE_LABEL[rate.payType]} ${won(rate.rate)}`;
}
