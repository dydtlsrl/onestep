// 일정 화면에서 같이 쓰는 이름표, 날짜·시간 표시, 계산 도구
import type { MemberTier } from "@/lib/tier";
import type { PayType, RoleRate } from "@/lib/pay";

export type EventType = "written_exam" | "interview" | "event" | "other";
export type EventStatus = "draft" | "open_core" | "open_all" | "closed" | "completed" | "cancelled";
export type ApplicationStatus = "applied" | "waitlisted" | "selected" | "rejected" | "cancelled";
export type Attendance = "unknown" | "attended" | "late" | "no_show";
export type ExtraPayType = "transport" | "regional";
export type ExtraTier = "all" | "core" | "general";

export interface EventRow {
  id: string;
  type: EventType;
  title: string;
  event_date: string; // YYYY-MM-DD
  gather_time: string | null; // HH:MM:SS
  start_time: string;
  end_time: string;
  location_name: string;
  address: string;
  notice: string;
  status: EventStatus;
  apply_deadline: string | null;
  pay_date: string | null;
  cancel_reason: string;
}

export const EVENT_COLUMNS =
  "id, type, title, event_date, gather_time, start_time, end_time, location_name, address, notice, status, apply_deadline, pay_date, cancel_reason";

export interface PositionRow {
  id: string;
  event_id: string;
  role_id: string | null;
  role_name: string;
  pay_type: PayType;
  rate: number;
  min_paid_hours: number | null;
  overtime_rate: number | null;
  headcount: number;
  sort_order: number;
}

export const POSITION_COLUMNS = "id, event_id, role_id, role_name, pay_type, rate, min_paid_hours, overtime_rate, headcount, sort_order";

// position_selected_counts 함수가 돌려주는 역할별 확정 인원
export interface SelectedCount {
  event_id: string;
  position_id: string;
  selected_count: number;
}

export interface ExtraRuleRow {
  type: ExtraPayType;
  tier: ExtraTier;
  amount: number;
}

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  written_exam: "필기시험",
  interview: "면접",
  event: "행사",
  other: "기타",
};

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

// 지급 예정일 추천: 행사일로부터 유예 기간(기본 7일)이 지난 뒤 가장 가까운 15일 또는 말일 (PRD SET-03 임시값)
export function suggestPayDate(eventDate: string, graceDays = 7): string {
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

export function toRoleRate(position: Pick<PositionRow, "pay_type" | "rate" | "min_paid_hours" | "overtime_rate">): RoleRate {
  return {
    payType: position.pay_type,
    rate: position.rate,
    minPaidHours: position.min_paid_hours === null ? null : Number(position.min_paid_hours),
    overtimeRate: position.overtime_rate,
  };
}

// 이 등급의 회원이 받는 추가 지급 (교통비는 전원, 지방비는 등급별 → 없으면 전원 금액)
export function extrasForTier(rules: ExtraRuleRow[], tier: MemberTier): { transport: number; regional: number } {
  const pick = (type: ExtraPayType) =>
    rules.find((r) => r.type === type && r.tier === tier)?.amount ??
    rules.find((r) => r.type === type && r.tier === "all")?.amount ??
    0;
  return { transport: pick("transport"), regional: pick("regional") };
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
