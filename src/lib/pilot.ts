// 시범 운영 지표 (PRD 9장). 이미 쌓인 데이터(가입·신청·계약)로 계산하고,
// 앱 밖에서 생기는 값(초대한 인원, 기존 처리 시간, 인터뷰 응답, 사고 건수)은 대표가 설정에 적는다.

export interface PilotSettings {
  eventIds: string[];
  inviteIds: string[];
  invitedCount: number | null; // 시범으로 초대한 인원 (가입률의 분모)
  baselineMinutes: number | null; // 앱 쓰기 전, 일정 1건 등록부터 계약 완료까지 걸리던 시간
  targetReductionPct: number | null; // 처리 시간 목표 감소율
  ceoResponses: number;
  ceoYes: number;
  memberResponses: number;
  memberYes: number;
  incidentPrivacy: number;
  incidentPay: number;
  incidentOutage: number;
  note: string;
}

export const DEFAULT_PILOT_SETTINGS: PilotSettings = {
  eventIds: [],
  inviteIds: [],
  invitedCount: null,
  baselineMinutes: null,
  targetReductionPct: null,
  ceoResponses: 0,
  ceoYes: 0,
  memberResponses: 0,
  memberYes: 0,
  incidentPrivacy: 0,
  incidentPay: 0,
  incidentOutage: 0,
  note: "",
};

// PRD 9장 목표
export const PILOT_TARGET = { signupRate: 0.8, signupDays: 14, appApplyRate: 0.9, signRate: 0.9, signHours: 24 };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
const maybe = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

export function parsePilotSettings(value: unknown): PilotSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    eventIds: ids(v.event_ids),
    inviteIds: ids(v.invite_ids),
    invitedCount: maybe(v.invited_count),
    baselineMinutes: maybe(v.baseline_minutes),
    targetReductionPct: maybe(v.target_reduction_pct),
    ceoResponses: count(v.ceo_responses),
    ceoYes: count(v.ceo_yes),
    memberResponses: count(v.member_responses),
    memberYes: count(v.member_yes),
    incidentPrivacy: count(v.incident_privacy),
    incidentPay: count(v.incident_pay),
    incidentOutage: count(v.incident_outage),
    note: typeof v.note === "string" ? v.note : "",
  };
}

export type MetricStatus = "met" | "missed" | "none";

export function rateStatus(done: number, total: number, target: number): MetricStatus {
  if (total === 0) return "none";
  return done / total >= target ? "met" : "missed";
}

export function percent(done: number, total: number): string {
  return total === 0 ? "—" : `${Math.round((done / total) * 100)}%`;
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

// 1. 가입: 초대 링크를 만든 때부터 2주 안에 승인과 정산 정보(주민번호·계좌) 등록까지 마쳤는지

export interface SignupInput {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  inviteCreatedAt: string | null; // 가입에 쓴 초대 링크를 만든 때 (없으면 가입 신청 시각부터 센다)
  privateUpdatedAt: string | null; // 정산 정보를 마지막으로 저장한 때 (없으면 아직 안 함)
}

export interface SignupRow {
  id: string;
  name: string;
  startAt: string;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  days: number | null; // 시작부터 마친 때까지 걸린 날 (소수점 한 자리)
  withinTarget: boolean;
}

export interface SignupSummary {
  rows: SignupRow[];
  applied: number;
  approved: number;
  completed: number;
  completedInTime: number;
}

export function summarizeSignups(members: SignupInput[]): SignupSummary {
  const rows = members.map((m): SignupRow => {
    const startAt = m.inviteCreatedAt ?? m.createdAt;
    const approved = (m.status === "active" || m.status === "restricted") && m.approvedAt !== null;
    const approvedMs = approved ? time(m.approvedAt) : null;
    const privateMs = time(m.privateUpdatedAt);
    const doneMs = approvedMs !== null && privateMs !== null ? Math.max(approvedMs, privateMs) : null;
    const days = doneMs === null ? null : Math.round(((doneMs - new Date(startAt).getTime()) / DAY) * 10) / 10;
    return {
      id: m.id,
      name: m.name,
      startAt,
      createdAt: m.createdAt,
      approvedAt: approved ? m.approvedAt : null,
      completedAt: doneMs === null ? null : new Date(doneMs).toISOString(),
      days,
      withinTarget: days !== null && days <= PILOT_TARGET.signupDays,
    };
  });
  return {
    rows,
    applied: rows.length,
    approved: rows.filter((r) => r.approvedAt).length,
    completed: rows.filter((r) => r.completedAt).length,
    completedInTime: rows.filter((r) => r.withinTarget).length,
  };
}

// 2. 앱 신청 비율: 일정마다 한 사람을 한 건으로 센다. 한 날짜라도 본인이 앱에서 신청했으면 앱 신청이다.

export interface ApplicationInput {
  eventId: string;
  memberId: string;
  addedByAdmin: boolean;
}

export function summarizeApplications(rows: ApplicationInput[]): { total: number; viaApp: number } {
  const byPerson = new Map<string, boolean>();
  for (const r of rows) {
    const key = `${r.eventId}:${r.memberId}`;
    byPerson.set(key, (byPerson.get(key) ?? false) || !r.addedByAdmin);
  }
  return { total: byPerson.size, viaApp: [...byPerson.values()].filter(Boolean).length };
}

// 3. 계약 서명: 무효가 된 계약은 뺀다. 아직 서명하지 않았고 24시간이 안 지난 것은 결과를 모르니 따로 센다.

export interface ContractInput {
  eventId: string;
  memberId: string;
  status: "requested" | "signed" | "voided";
  requestedAt: string;
  signedAt: string | null;
}

export interface SignSummary {
  onTime: number; // 24시간 안에 서명
  late: number; // 24시간 넘어서 서명
  overdue: number; // 24시간이 지났는데 아직 서명 안 함
  waiting: number; // 아직 24시간 안 됨
}

export function summarizeContracts(rows: ContractInput[], now: Date): SignSummary {
  const s: SignSummary = { onTime: 0, late: 0, overdue: 0, waiting: 0 };
  const limit = PILOT_TARGET.signHours * HOUR;
  for (const c of rows) {
    if (c.status === "voided") continue;
    const requested = new Date(c.requestedAt).getTime();
    const signed = time(c.signedAt);
    if (c.status === "signed" && signed !== null) {
      if (signed - requested <= limit) s.onTime += 1;
      else s.late += 1;
    } else if (now.getTime() - requested < limit) s.waiting += 1;
    else s.overdue += 1;
  }
  return s;
}

export const signTotal = (s: SignSummary) => s.onTime + s.late + s.overdue;

// 4. 대표 처리 시간: 일정을 등록한 때부터 확정자 전원이 계약서에 서명할 때까지 걸린 시간.
//    밤·주말처럼 일하지 않은 시간도 들어간다.

export interface EventInput {
  id: string;
  createdAt: string;
}

export interface SelectionInput {
  eventId: string;
  memberId: string;
  status: string;
  decidedAt: string | null;
}

export interface EventDuration {
  selected: number; // 확정된 사람 수
  signed: number; // 그중 서명을 마친 사람 수
  lastSelectedAt: string | null;
  completedAt: string | null; // 확정자 전원이 서명한 때
  minutes: number | null;
}

export function eventDuration(event: EventInput, selections: SelectionInput[], contracts: ContractInput[]): EventDuration {
  const selected = selections.filter((a) => a.eventId === event.id && a.status === "selected");
  const people = new Set(selected.map((a) => a.memberId));
  const decided = selected.map((a) => time(a.decidedAt)).filter((t): t is number => t !== null);

  const signedAt = new Map<string, number>();
  for (const c of contracts) {
    const t = time(c.signedAt);
    if (c.eventId === event.id && c.status === "signed" && t !== null && people.has(c.memberId)) signedAt.set(c.memberId, t);
  }

  const done = people.size > 0 && signedAt.size === people.size;
  const completedMs = done ? Math.max(...signedAt.values()) : null;
  return {
    selected: people.size,
    signed: signedAt.size,
    lastSelectedAt: decided.length ? new Date(Math.max(...decided)).toISOString() : null,
    completedAt: completedMs === null ? null : new Date(completedMs).toISOString(),
    minutes: completedMs === null ? null : Math.max(0, Math.round((completedMs - new Date(event.createdAt).getTime()) / 60000)),
  };
}

export function averageMinutes(durations: EventDuration[]): number | null {
  const done = durations.map((d) => d.minutes).filter((m): m is number => m !== null);
  return done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null;
}

// 기존보다 줄었는지. 목표 감소율을 정했으면 그만큼 줄어야 달성이다.
export function durationStatus(average: number | null, settings: PilotSettings): MetricStatus {
  if (average === null || settings.baselineMinutes === null) return "none";
  if (!settings.targetReductionPct) return average < settings.baselineMinutes ? "met" : "missed";
  return average <= settings.baselineMinutes * (1 - settings.targetReductionPct / 100) ? "met" : "missed";
}

// 1,500분 → "1일 1시간", 90분 → "1시간 30분"
export function formatMinutes(minutes: number): string {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h > 0 ? `${d}일 ${h}시간` : `${d}일`;
  if (h > 0) return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  return `${m}분`;
}
