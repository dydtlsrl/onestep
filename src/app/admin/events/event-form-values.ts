// 일정 폼의 값 모양과 처음 값. 서버 화면(새 일정)과 브라우저 폼이 같이 쓴다.
import type { DayKind, EventType } from "@/lib/events";
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

