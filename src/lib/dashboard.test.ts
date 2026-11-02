import { describe, expect, it } from "vitest";
import { eventProgress, nextPayDay, overduePayments, type DashApp, type DashEvent, type DashPayment } from "./dashboard";

const event: DashEvent = {
  id: "e1",
  title: "필기시험",
  start_date: "2026-11-07",
  end_date: "2026-11-08",
  status: "open_all",
  days: [
    { id: "d1", day_date: "2026-11-07" },
    { id: "d2", day_date: "2026-11-08" },
  ],
};

const app = (over: Partial<DashApp>): DashApp => ({
  event_id: "e1",
  member_id: "a",
  day_id: "d1",
  status: "selected",
  notified_status: "selected",
  attendance: "unknown",
  ...over,
});

describe("eventProgress", () => {
  it("일정 전: 결과를 알리지 않은 사람만", () => {
    const p = eventProgress(
      event,
      [app({ notified_status: null }), app({ member_id: "b", status: "rejected", notified_status: null }), app({ member_id: "c", status: "applied", notified_status: null })],
      [],
      [],
      "2026-11-01",
    );
    expect(p.tasks).toEqual([{ kind: "notify", eventId: "e1", eventTitle: "필기시험", count: 2 }]);
    expect(p).toMatchObject({ ended: false, today: false, selected: 1 });
  });

  it("첫날(오늘): 현장, 그날 출석만 확인할 일", () => {
    const p = eventProgress(event, [app({}), app({ day_id: "d2" }), app({ member_id: "b" })], [], [], "2026-11-07");
    expect(p).toMatchObject({ today: true, todayDayId: "d1", ended: false });
    expect(p.tasks).toEqual([{ kind: "attendance", eventId: "e1", eventTitle: "필기시험", count: 2 }]);
  });

  it("끝난 뒤: 출석 확인이 남으면 계약서·정산은 아직 알리지 않는다", () => {
    const p = eventProgress(event, [app({ attendance: "attended" }), app({ member_id: "b" })], [], [], "2026-11-09");
    expect(p.tasks.map((t) => t.kind)).toEqual(["attendance"]);
  });

  it("끝난 뒤 출석을 마치면: 노쇼는 계약·정산 없음, 무효인 계약은 다시 보낼 사람", () => {
    const apps = [
      app({ member_id: "a", attendance: "attended" }),
      app({ member_id: "a", day_id: "d2", attendance: "late" }),
      app({ member_id: "c", attendance: "no_show" }),
      app({ member_id: "d", attendance: "attended" }),
    ];
    const contracts = [
      { event_id: "e1", member_id: "d", status: "requested" as const },
      { event_id: "e1", member_id: "a", status: "voided" as const },
    ];
    const payments: DashPayment[] = [{ event_id: "e1", member_id: "d", status: "draft", pay_date: "2026-11-15", net: 99000 }];
    const p = eventProgress(event, apps, contracts, payments, "2026-11-09");
    expect(p.ended).toBe(true);
    expect(Object.fromEntries(p.tasks.map((t) => [t.kind, t.count]))).toEqual({ contract: 1, sign: 1, settle: 1 });
  });

  it("마지막 날부터 끝난 것으로 본다, 취소·공개 전 일정은 할 일 없음", () => {
    expect(eventProgress(event, [], [], [], "2026-11-08").ended).toBe(true);
    expect(eventProgress({ ...event, status: "cancelled" }, [app({ notified_status: null })], [], [], "2026-11-01").tasks).toEqual([]);
  });
});

describe("지급일", () => {
  const pay = (over: Partial<DashPayment>): DashPayment => ({ event_id: "e1", member_id: "a", status: "scheduled", pay_date: "2026-11-15", net: 1000, ...over });

  it("오늘 이후 가장 가까운 지급일의 인원·합계·확정 전", () => {
    const list = [
      pay({}),
      pay({ member_id: "b", status: "draft", net: 2000 }),
      pay({ member_id: "c", pay_date: "2026-11-30" }),
      pay({ member_id: "d", status: "paid" }),
      pay({ member_id: "e", pay_date: "2026-10-31" }),
    ];
    expect(nextPayDay(list, "2026-11-02")).toEqual({ date: "2026-11-15", people: 2, net: 3000, draft: 1 });
    expect(overduePayments(list, "2026-11-02")).toBe(1);
    expect(nextPayDay([], "2026-11-02")).toBeNull();
  });
});
