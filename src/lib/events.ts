// 일정 화면에서 같이 쓰는 이름표, 날짜·시간 표시, 계산 도구
import type { MemberTier } from "@/lib/tier";
import type { PayType, RoleRate } from "@/lib/pay";

export type EventType = "written_exam" | "interview" | "event" | "other";
export type EventStatus = "draft" | "open_core" | "open_all" | "closed" | "completed" | "cancelled";
export type ApplicationStatus = "applied" | "waitlisted" | "selected" | "rejected" | "cancelled";
export type Attendance = "unknown" | "attended" | "late" | "no_show";
export type ExtraPayType = "transport" | "regional";
export type ExtraTier = "all" | "core" | "general";
export type DayKind = "setup" | "main" | "other";

export interface EventRow {
  id: string;
  type: EventType;
  title: string;
  start_date: string; // YYYY-MM-DD, 첫날
  end_date: string; // 마지막 날
  all_days_required: boolean;
  location_name: string;
  address: string;
  notice: string;
  status: EventStatus;
  apply_deadline: string | null;
  pay_date: string | null;
  cancel_reason: string;
}

export const EVENT_COLUMNS =
  "id, type, title, start_date, end_date, all_days_required, location_name, address, notice, status, apply_deadline, pay_date, cancel_reason";

// 일정 안의 날짜(일차). 날짜마다 시간, 모집 인원, 단가가 따로다.
export interface DayRow {
  id: string;
  event_id: string;
  day_date: string;
  kind: DayKind;
  gather_time: string | null; // HH:MM:SS
  start_time: string;
  end_time: string;
  sort_order: number;
  headcount: number;
  pay_type: PayType;
  rate: number;
  min_paid_hours: number | null;
  overtime_rate: number | null;
  break_minutes: number; // 휴게시간 (보수 계산에서 뺀다)
}

export const DAY_COLUMNS =
  "id, event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate, min_paid_hours, overtime_rate, break_minutes";

// day_selected_counts 함수가 돌려주는 날짜별 확정 인원
export interface SelectedCount {
  event_id: string;
  day_id: string;
  selected_count: number;
}

export interface ExtraRuleRow {
  type: ExtraPayType;
  tier: ExtraTier;
  amount: number;
  per_day: boolean; // true: 참여한 날마다, false: 일정당 한 번
}

export const EXTRA_COLUMNS = "type, tier, amount, per_day";

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  written_exam: "필기시험",
  interview: "면접",
  event: "행사",
  other: "기타",
};

export const DAY_KIND_LABEL: Record<DayKind, string> = { setup: "세팅", main: "진행", other: "기타" };
export const EXTRA_TYPE_LABEL: Record<ExtraPayType, string> = { transport: "교통비", regional: "지방비" };

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "임시저장",
  open_core: "핵심 공개 중",
  open_all: "전체 공개 중",
  closed: "모집 마감",
  completed: "완료",
  cancelled: "취소",
};

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  applied: "신청",
  waitlisted: "대기",
  selected: "확정",
  rejected: "미선발",
  cancelled: "취소",
};

export const ATTENDANCE_LABEL: Record<Attendance, string> = {
  unknown: "미확인",
  attended: "참석",
  late: "지각",
  no_show: "노쇼",
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 2026-11-08 → 11월 8일 (일)
export function formatEventDate(date: string): string {
  const d = parseDate(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

// 2026-11-07 → 11/7(토)
export function formatShortDate(date: string): string {
  const d = parseDate(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

// 하루면 "11월 8일 (일)", 여러 날이면 "11월 7일 (토) ~ 11월 9일 (월)"
export function formatEventRange(start: string, end: string): string {
  return start === end ? formatEventDate(start) : `${formatEventDate(start)} ~ ${formatEventDate(end)}`;
}

// 11/7(토) 세팅
export function dayLabel(day: Pick<DayRow, "day_date" | "kind">): string {
  return `${formatShortDate(day.day_date)} ${DAY_KIND_LABEL[day.kind]}`;
}

// 08:00:00 → 08:00
export function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : "";
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// 정해진 근무 시간 (분)
export function scheduledMinutes(start: string, end: string): number {
  return Math.max(0, minutesOf(end) - minutesOf(start));
}

// 보수를 계산할 근무 시간: 시작~끝에서 휴게시간을 뺀다
export function paidMinutes(day: Pick<DayRow, "start_time" | "end_time" | "break_minutes">): number {
  return Math.max(0, scheduledMinutes(day.start_time, day.end_time) - (day.break_minutes ?? 0));
}

// 지급 예정일 추천: 마지막 날 다음 날부터 가장 가까운 15일 또는 말일 (결정 #4·#5: 고객사 결제일에 맞춰 그날 지급)
export function suggestPayDate(eventDate: string, graceDays = 1): string {
  const earliest = parseDate(eventDate);
  earliest.setUTCDate(earliest.getUTCDate() + graceDays);
  const y = earliest.getUTCFullYear();
  const m = earliest.getUTCMonth();
  const fifteenth = new Date(Date.UTC(y, m, 15));
  const monthEnd = new Date(Date.UTC(y, m + 1, 0));
  if (earliest <= fifteenth) return toDateString(fifteenth);
  if (earliest <= monthEnd) return toDateString(monthEnd);
  return toDateString(new Date(Date.UTC(y, m + 1, 15)));
}

export function toRoleRate(day: Pick<DayRow, "pay_type" | "rate" | "min_paid_hours" | "overtime_rate">): RoleRate {
  return {
    payType: day.pay_type,
    rate: day.rate,
    minPaidHours: day.min_paid_hours === null ? null : Number(day.min_paid_hours),
    overtimeRate: day.overtime_rate,
  };
}

export interface ExtraItem {
  type: ExtraPayType;
  amount: number;
  perDay: boolean;
}

// 이 등급의 회원이 받는 추가 지급 (교통비는 전원, 지방비는 등급별 → 없으면 전원 금액)
export function extrasForTier(rules: ExtraRuleRow[], tier: MemberTier): ExtraItem[] {
  const pick = (type: ExtraPayType) =>
    rules.find((r) => r.type === type && r.tier === tier) ?? rules.find((r) => r.type === type && r.tier === "all");
  return (["transport", "regional"] as const).flatMap((type) => {
    const rule = pick(type);
    return rule && rule.amount > 0 ? [{ type, amount: rule.amount, perDay: rule.per_day }] : [];
  });
}

// 하루 참여할 때마다 붙는 금액
export function dailyExtras(items: ExtraItem[]): number {
  return items.filter((i) => i.perDay).reduce((sum, i) => sum + i.amount, 0);
}

// 참여한 날 수에 맞춘 추가 지급 합계 (일정당 한 번인 항목은 하루라도 참여하면 한 번)
export function extrasTotal(items: ExtraItem[], workedDays: number): number {
  if (workedDays <= 0) return 0;
  return items.reduce((sum, i) => sum + (i.perDay ? i.amount * workedDays : i.amount), 0);
}

// 15,000원 (날마다) · 30,000원 (일정당)
export function describeExtras(items: ExtraItem[], multiDay: boolean): string {
  return items
    .map((i) => `${EXTRA_TYPE_LABEL[i.type]} ${i.amount.toLocaleString("ko-KR")}원${multiDay ? (i.perDay ? " (참여한 날마다)" : " (일정당 한 번)") : ""}`)
    .join(" · ");
}

// 신청 마감 입력값(datetime-local, 한국 시간)을 DB에 넣을 시각으로 바꾼다
export function kstLocalToIso(value: string): string | null {
  if (!value) return null;
  return `${value.length === 16 ? `${value}:00` : value}+09:00`;
}

// DB 시각을 datetime-local 입력칸 값(한국 시간)으로 바꾼다
export function isoToKstLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

// 오늘 날짜 (한국 시간, YYYY-MM-DD)
export function todayKst(now: number): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 회원 화면에서 쓰는 일정 상태 이름
export const MEMBER_EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "준비 중",
  open_core: "핵심 인력 먼저 모집 중",
  open_all: "모집 중",
  closed: "모집 마감",
  completed: "완료",
  cancelled: "취소",
};

export const MEMBER_APPLICATION_LABEL: Record<ApplicationStatus, string> = {
  applied: "신청 완료",
  waitlisted: "대기",
  selected: "확정",
  rejected: "미선발",
  cancelled: "신청 취소",
};

// 회원에게 보여 줄 신청 상태. 확정·미선발은 대표가 결과 알림을 보낸 뒤에만 알려 준다.
export function visibleApplicationStatus(status: ApplicationStatus, notifiedStatus: ApplicationStatus | null): ApplicationStatus {
  if ((status === "selected" || status === "rejected") && notifiedStatus !== status) return "applied";
  return status;
}
