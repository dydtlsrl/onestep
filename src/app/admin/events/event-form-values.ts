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

// 새 일정의 처음 값. 단가는 공통 계산 규칙의 기본 시급을 쓴다.
export function emptyEvent(rules: PayRules): EventFormValues {
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
        payType: "hourly",
        rate: String(rules.defaultHourlyRate),
        minPaidHours: "",
        overtimeRate: "",
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

