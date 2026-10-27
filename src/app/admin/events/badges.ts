import type { ApplicationStatus, Attendance, EventStatus } from "@/lib/events";

// 상태 배지 색. 목록과 상세 화면에서 같이 쓴다.
export const STATUS_BADGE: Record<EventStatus, string> = {
  draft: "border border-line text-body",
  open_core: "bg-navy text-white",
  open_all: "bg-brand-soft text-brand-strong",
  closed: "bg-ground text-body",
  completed: "border border-line text-muted",
  cancelled: "bg-warn-soft text-warn",
};

export const APPLICATION_BADGE: Record<ApplicationStatus, string> = {
  applied: "bg-ground text-body",
  waitlisted: "bg-warn-soft text-warn",
  selected: "bg-brand-soft text-brand-strong",
  rejected: "border border-line text-muted",
  cancelled: "border border-line text-muted line-through",
};

export const ATTENDANCE_BADGE: Record<Attendance, string> = {
  unknown: "border border-line text-muted",
  attended: "bg-brand-soft text-brand-strong",
  late: "bg-warn-soft text-warn",
  no_show: "bg-warn-soft text-warn",
};
