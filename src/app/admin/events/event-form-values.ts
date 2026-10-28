// 일정 폼의 값 모양과 처음 값. 서버 화면(새 일정)과 브라우저 폼이 같이 쓴다.
import { formatTime, isoToKstLocal, type DayKind, type DayRow, type EventRow, type EventType, type ExtraRuleRow } from "@/lib/events";
import type { PayRules, PayType } from "@/lib/pay";

export interface RoleOption {
  id: string;
  name: string;
  pay_type: PayType;
  default_rate: number;
  min_paid_hours: number | null;
  overtime_rate: number | null;
  default_for: "setup" | "main" | "other" | null; // 세팅일·진행일 기본으로 정한 단가
}

// 단가표의 값을 날짜 입력칸 모양으로 (지급 방식·단가·최소 보장·초과 금액)
export function presetValues(role: RoleOption): Pick<DayDraft, "payType" | "rate" | "minPaidHours" | "overtimeRate" | "presetId"> {
  return {
    presetId: role.id,
    payType: role.pay_type,
    rate: String(role.default_rate),
    minPaidHours: role.min_paid_hours === null ? "" : String(role.min_paid_hours),
    overtimeRate: role.overtime_rate === null ? "" : String(role.overtime_rate),
  };
}

// 지금 이 날짜에 들어가 있는 단가표 줄: 버튼으로 고른 것, 없으면 값이 같은 첫 줄 (저장된 일정을 열 때)
export function activePresetId(day: DayDraft, roles: RoleOption[]): string | null {
  if (day.presetId && roles.some((r) => r.id === day.presetId && matchesPreset(day, r))) return day.presetId;
  return roles.find((r) => matchesPreset(day, r))?.id ?? null;
}

// 날짜의 값이 이 단가와 같은지
export function matchesPreset(day: Pick<DayDraft, "payType" | "rate" | "minPaidHours" | "overtimeRate">, role: RoleOption): boolean {
  const v = presetValues(role);
  const num = (x: string) => (x === "" ? "" : String(Number(x.replace(/[^0-9.]/g, ""))));
  return (
    day.payType === v.payType &&
    num(day.rate) === num(v.rate) &&
    (day.payType === "hourly" ? num(day.minPaidHours) === num(v.minPaidHours) : num(day.overtimeRate) === num(v.overtimeRate))
  );
}

// 새 날짜의 단가: ★기본 단가가 있으면 그것, 없으면 공통 기본 시급 (세팅일은 최소 4시간)
export function defaultPay(kind: DayKind, roles: RoleOption[], rules: PayRules): Pick<DayDraft, "payType" | "rate" | "minPaidHours" | "overtimeRate" | "presetId"> {
  const preset = roles.find((r) => r.default_for === kind);
  if (preset) return presetValues(preset);
  return { payType: "hourly", rate: String(rules.defaultHourlyRate), minPaidHours: kind === "setup" ? SETUP_MIN_HOURS : "", overtimeRate: "", presetId: undefined };
}

// 날짜 하나: 종류, 시간, 모집 인원, 단가. 역할은 신청자를 보고 대표가 나중에 사람마다 정한다.
export interface DayDraft {
  key: string;
  id?: string;
  dayDate: string;
  kind: DayKind;
  gatherTime: string;
  startTime: string;
  endTime: string;
  headcount: string;
  payType: PayType;
  rate: string;
  minPaidHours: string;
  overtimeRate: string;
  presetId?: string; // 버튼으로 고른 단가표 줄 (화면 표시용, 저장하지 않음)
  offset?: number; // 일정을 복사할 때: 원래 일정 첫날로부터 며칠 뒤였는지 (날짜를 채우는 데만 씀)
}

export interface EventFormValues {
  type: EventType;
  title: string;
  clientName: string;
  locationName: string;
  address: string;
  notice: string;
  chatLink: string;
  applyDeadline: string;
  payDate: string;
  memo: string;
  days: DayDraft[];
  allDaysRequired: boolean;
  transportOn: boolean;
  transportAmount: string;
  transportPerDay: boolean;
  regionalOn: boolean;
  regionalCore: string;
  regionalGeneral: string;
  regionalPerDay: boolean;
}

// 세팅일 기본 최소 보장 시간 (필기시험 세팅은 4시간 기준이 보통)
export const SETUP_MIN_HOURS = "4";

// 새 일정의 처음 값. 첫 날짜는 진행일이고, 단가는 ★진행일 기본(없으면 공통 기본 시급)을 쓴다.
export function emptyEvent(rules: PayRules, roles: RoleOption[] = []): EventFormValues {
  return {
    type: "written_exam",
    title: "",
    clientName: "",
    locationName: "",
    address: "",
    notice: "",
    chatLink: "",
    applyDeadline: "",
    payDate: "",
    memo: "",
    days: [
      {
        key: "day-1",
        dayDate: "",
        kind: "main",
        gatherTime: "",
        startTime: "",
        endTime: "",
        headcount: "1",
        ...defaultPay("main", roles, rules),
      },
    ],
    allDaysRequired: false,
    transportOn: false,
    transportAmount: "",
    transportPerDay: true,
    regionalOn: false,
    regionalCore: "",
    regionalGeneral: "",
    regionalPerDay: true,
  };
}

// 저장된 일정을 폼 값으로 (일정 정보 수정, 일정 복사)
export interface SavedEvent {
  event: EventRow;
  internal: { client_name: string; memo: string } | null;
  chatLink: string;
  days: DayRow[];
  extras: ExtraRuleRow[];
}

export function eventToFormValues({ event, internal, chatLink, days, extras }: SavedEvent): EventFormValues {
  const rule = (type: ExtraRuleRow["type"], tier: ExtraRuleRow["tier"]) => extras.find((e) => e.type === type && e.tier === tier);
  const regionalAll = rule("regional", "all");
  const regionalCore = rule("regional", "core") ?? regionalAll;
  const regionalGeneral = rule("regional", "general") ?? regionalAll;
  const transport = rule("transport", "all");
  return {
    type: event.type,
    title: event.title,
    clientName: internal?.client_name ?? "",
    locationName: event.location_name,
    address: event.address,
    notice: event.notice,
    chatLink,
    applyDeadline: isoToKstLocal(event.apply_deadline),
    payDate: event.pay_date ?? "",
    memo: internal?.memo ?? "",
    days: days.map((d) => ({
      key: d.id,
      id: d.id,
      dayDate: d.day_date,
      kind: d.kind,
      gatherTime: formatTime(d.gather_time),
      startTime: formatTime(d.start_time),
      endTime: formatTime(d.end_time),
      headcount: String(d.headcount),
      payType: d.pay_type,
      rate: String(d.rate),
      minPaidHours: d.min_paid_hours === null ? "" : String(Number(d.min_paid_hours)),
      overtimeRate: d.overtime_rate === null ? "" : String(d.overtime_rate),
    })),
    allDaysRequired: event.all_days_required,
    transportOn: transport !== undefined,
    transportAmount: transport ? String(transport.amount) : "",
    transportPerDay: transport?.per_day ?? true,
    regionalOn: regionalCore !== undefined || regionalGeneral !== undefined,
    regionalCore: regionalCore ? String(regionalCore.amount) : "",
    regionalGeneral: regionalGeneral ? String(regionalGeneral.amount) : "",
    regionalPerDay: (regionalCore ?? regionalGeneral)?.per_day ?? true,
  };
}

const dayNumber = (date: string) => Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86_400_000);

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 일정 복사: 내용·시간·인원·단가·추가 지급은 그대로, 날짜·신청 마감·지급일·톡방 링크는 비운다.
// 날짜마다 원래 첫날로부터의 간격을 기억해 두었다가, 하나를 고르면 나머지를 채운다 (fillCopiedDates).
export function copyEventValues(values: EventFormValues): EventFormValues {
  const first = values.days.map((d) => d.dayDate).filter(Boolean).sort()[0];
  return {
    ...values,
    chatLink: "",
    applyDeadline: "",
    payDate: "",
    days: values.days.map((d, i) => ({
      ...d,
      id: undefined,
      key: `day-copy-${i + 1}`,
      dayDate: "",
      offset: first && d.dayDate ? dayNumber(d.dayDate) - dayNumber(first) : i,
    })),
  };
}

// 복사한 날짜 하나를 고르면, 아직 비어 있는 다른 복사 날짜를 원래 간격대로 채운다
export function fillCopiedDates(days: DayDraft[], key: string, date: string): DayDraft[] {
  const changed = days.find((d) => d.key === key);
  if (!changed) return days;
  const base = date && changed.offset !== undefined ? addDays(date, -changed.offset) : "";
  return days.map((d) => {
    if (d.key === key) return { ...d, dayDate: date };
    if (base && d.offset !== undefined && !d.dayDate) return { ...d, dayDate: addDays(base, d.offset) };
    return d;
  });
}
