// 대표 첫 화면("할 일")에 보여 줄 것을 정한다. 화면 없이 계산만 하므로 테스트할 수 있다.
// 순서: 일정마다 선발 → 결과 알림 → (일정 끝남) → 출석 확인 → 계약서 → 서명 → 정산 → 지급 (결정 #34)
import type { ApplicationStatus, Attendance, EventStatus } from "@/lib/events";
import type { ContractStatus, PaymentStatus } from "@/lib/settlement";

export interface DashEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  days: { id: string; day_date: string }[];
}

export interface DashApp {
  event_id: string;
  member_id: string;
  day_id: string;
  status: ApplicationStatus;
  notified_status: ApplicationStatus | null;
  attendance: Attendance;
}

export interface DashContract {
  event_id: string;
  member_id: string;
  status: ContractStatus;
}

export interface DashPayment {
  event_id: string;
  member_id: string;
  status: PaymentStatus;
  pay_date: string;
  net: number;
}

export type TaskKind = "notify" | "attendance" | "contract" | "sign" | "settle";

export interface EventTask {
  kind: TaskKind;
  eventId: string;
  eventTitle: string;
  count: number; // 사람 수
}

export interface EventProgress {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  ended: boolean; // 마지막 날이 되었는지 (계약서는 마지막 날부터 보낸다)
  today: boolean; // 오늘 현장이 있는지
  todayDayId: string | null;
  selected: number; // 확정 인원 (사람 수)
  tasks: EventTask[];
}

const worked = (a: Pick<DashApp, "attendance">) => a.attendance === "attended" || a.attendance === "late";

// 일정 하나에서 지금 해야 할 일. 사람 수로 센다.
export function eventProgress(event: DashEvent, apps: DashApp[], contracts: DashContract[], payments: DashPayment[], today: string): EventProgress {
  const dayDate = new Map(event.days.map((d) => [d.id, d.day_date]));
  const mine = apps.filter((a) => a.event_id === event.id);
  const selected = mine.filter((a) => a.status === "selected");
  const people = (list: { member_id: string }[]) => new Set(list.map((a) => a.member_id));
  const ended = today >= event.end_date;
  const todayDay = event.days.find((d) => d.day_date === today) ?? null;
  const tasks: EventTask[] = [];
  const add = (kind: TaskKind, count: number) => {
    if (count > 0) tasks.push({ kind, eventId: event.id, eventTitle: event.title, count });
  };

  if (event.status !== "cancelled" && event.status !== "draft") {
    // 확정·미선발로 정했지만 아직 알리지 않은 사람
    add("notify", people(mine.filter((a) => (a.status === "selected" || a.status === "rejected") && a.notified_status !== a.status)).size);

    // 날짜가 온(오늘 포함) 확정 신청 중 출석을 고르지 않은 사람
    const unchecked = people(selected.filter((a) => a.attendance === "unknown" && (dayDate.get(a.day_id) ?? "9999") <= today));
    add("attendance", unchecked.size);

    if (ended) {
      const activeContract = new Map(contracts.filter((c) => c.event_id === event.id && c.status !== "voided").map((c) => [c.member_id, c.status]));
      // 계약서·정산은 출석 확인을 모두 마친 뒤의 일이다 (출석 → 계약서 → 정산). 그 전에는 출석 확인만 알린다.
      if (unchecked.size === 0) {
        const workers = [...people(selected.filter(worked))];
        add("contract", workers.filter((m) => !activeContract.has(m)).length);
        const paid = new Set(payments.filter((p) => p.event_id === event.id && p.status !== "cancelled").map((p) => p.member_id));
        add("settle", workers.filter((m) => !paid.has(m)).length);
      }
      add("sign", [...activeContract.values()].filter((s) => s === "requested").length);
    }
  }

  return {
    id: event.id,
    title: event.title,
    start_date: event.start_date,
    end_date: event.end_date,
    ended,
    today: todayDay !== null,
    todayDayId: todayDay?.id ?? null,
    selected: people(selected).size,
    tasks,
  };
}

export interface PayDay {
  date: string;
  people: number;
  net: number;
  draft: number; // 세금 방식을 정하지 않아 "확정 전"인 것 (지급 완료 처리를 못 함)
}

// 오늘 이후(오늘 포함) 가장 가까운 지급일. 지급 완료·취소·보류는 뺀다.
export function nextPayDay(payments: DashPayment[], today: string): PayDay | null {
  const open = payments.filter((p) => (p.status === "scheduled" || p.status === "draft") && p.pay_date >= today);
  if (open.length === 0) return null;
  const date = open.map((p) => p.pay_date).sort()[0];
  const onDate = open.filter((p) => p.pay_date === date);
  return {
    date,
    people: new Set(onDate.map((p) => p.member_id)).size,
    net: onDate.reduce((sum, p) => sum + p.net, 0),
    draft: onDate.filter((p) => p.status === "draft").length,
  };
}

// 지급일이 지났는데 아직 지급 완료로 바꾸지 않은 것
export function overduePayments(payments: DashPayment[], today: string): number {
  return payments.filter((p) => (p.status === "scheduled" || p.status === "draft") && p.pay_date < today).length;
}

export interface SetupState {
  company: boolean; // 회사 정보 (대표자·연락처)
  tax: boolean; // 세금 처리 방식
  template: boolean; // 계약서 양식을 직접 확인·저장함
  members: boolean; // 인력 초대 (명단이나 회원이 있음)
  events: boolean; // 첫 일정
}

export const SETUP_STEPS: { key: keyof SetupState; title: string; help: string; href: string }[] = [
  { key: "company", title: "회사 정보 입력", help: "대표자 이름·연락처. 계약서와 개인정보 처리방침에 들어가요.", href: "/admin/settings" },
  { key: "tax", title: "세금 처리 방식 고르기", help: "예: 3.3%. 고르기 전에는 지급 완료 처리를 할 수 없어요.", href: "/admin/settings" },
  { key: "template", title: "계약서 양식 확인", help: "기본 근로계약서가 들어 있어요. 문구를 확인하고 저장해 주세요.", href: "/admin/contracts" },
  { key: "members", title: "인력 초대", help: "엑셀 명단을 붙여 넣고 단체 링크를 톡방에 올려요.", href: "/admin/roster" },
  { key: "events", title: "첫 일정 만들기", help: "날짜·시간·모집 인원·단가를 넣고 공개해요.", href: "/admin/events/new" },
];

export const TASK_TEXT: Record<TaskKind, { label: (n: number) => string; tab: string; action: string }> = {
  notify: { label: (n) => `${n}명에게 선발 결과를 알리지 않았어요`, tab: "applicants", action: "결과 알리기" },
  attendance: { label: (n) => `${n}명의 출석을 확인하지 않았어요`, tab: "attendance", action: "출석 확인" },
  contract: { label: (n) => `${n}명에게 계약서를 보내야 해요`, tab: "contracts", action: "계약서 보내기" },
  sign: { label: (n) => `${n}명이 계약서 서명을 기다리고 있어요`, tab: "contracts", action: "서명 현황" },
  settle: { label: (n) => `${n}명의 정산을 만들어야 해요`, tab: "payments", action: "정산 만들기" },
};
