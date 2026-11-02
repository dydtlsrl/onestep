import { describe, expect, it } from "vitest";
import { firstIssueMessage, readEventForm, toEventRpcArgs } from "./event-form";

const setupDay = {
  dayDate: "2026-11-07",
  kind: "setup",
  gatherTime: "",
  startTime: "14:00",
  endTime: "18:00",
  headcount: "4",
  payType: "hourly",
  rate: "11000",
  minPaidHours: "4",
  overtimeRate: "99",
};
const examDay = {
  dayDate: "2026-11-08",
  kind: "main",
  gatherTime: "07:30",
  startTime: "08:00",
  endTime: "13:00",
  breakMinutes: "30",
  headcount: 24,
  payType: "daily",
  rate: 110000,
  minPaidHours: 3,
  overtimeRate: 15000,
};

function form(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    type: "written_exam",
    title: " 대기업 공채 필기시험 ",
    clientName: "고객사A",
    locationName: "OO중학교",
    address: "서울 송파구",
    notice: "",
    chatLink: "https://open.kakao.com/o/abc",
    applyDeadline: "2026-11-03T18:00",
    payDate: "2026-11-15",
    memo: "",
    days: JSON.stringify([setupDay, examDay]),
    allDaysRequired: "on",
    transportOn: "on",
    transportAmount: "10,000",
    transportUnit: "day",
    regionalOn: "on",
    regionalCore: "30000",
    regionalGeneral: "0",
    regionalUnit: "once",
    ...overrides,
  };
  const data = new FormData();
  Object.entries(values).forEach(([k, v]) => data.set(k, v));
  return data;
}

describe("readEventForm", () => {
  it("올바른 입력을 DB 함수 인자로 바꾼다", () => {
    const parsed = readEventForm(form());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const args = toEventRpcArgs(parsed.data);
    expect(args.event.title).toBe("대기업 공채 필기시험");
    expect(args.event.apply_deadline).toBe("2026-11-03T18:00:00+09:00");
    expect(args.event.all_days_required).toBe(true);
    expect(args.days).toHaveLength(2);
    expect(args.days[0]).toMatchObject({ day_date: "2026-11-07", kind: "setup", gather_time: "", headcount: 4, pay_type: "hourly", rate: 11000, min_paid_hours: 4, overtime_rate: null });
    expect(args.days[0].break_minutes).toBe(0);
    expect(args.days[1]).toMatchObject({ pay_type: "daily", rate: 110000, min_paid_hours: null, overtime_rate: 15000, break_minutes: 30 });
    expect(args.extras).toEqual([
      { type: "transport", tier: "all", amount: 10000, per_day: true },
      { type: "regional", tier: "core", amount: 30000, per_day: false },
    ]);
  });

  it("날짜가 하나면 '모든 날짜 참여 필수'는 끈다", () => {
    const parsed = readEventForm(form({ days: JSON.stringify([examDay]) }));
    expect(parsed.success && toEventRpcArgs(parsed.data).event.all_days_required).toBe(false);
  });

  it("어느 날짜의 문제인지 알려 준다", () => {
    const parsed = readEventForm(form({ days: JSON.stringify([setupDay, { ...examDay, endTime: "07:00" }]) }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssueMessage(parsed.error)).toBe("2일차: 끝나는 시간이 시작 시간보다 늦어야 해요.");
  });

  it("휴게시간이 근무 시간보다 길면 실패", () => {
    const parsed = readEventForm(form({ days: JSON.stringify([{ ...examDay, breakMinutes: "300" }]) }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssueMessage(parsed.error)).toBe("1일차: 휴게시간이 근무 시간보다 길어요.");
  });

  it("날짜가 없거나, 인원이 0이거나, 톡방 링크가 https가 아니면 실패", () => {
    expect(readEventForm(form({ days: "[]" })).success).toBe(false);
    expect(readEventForm(form({ days: JSON.stringify([{ ...examDay, headcount: 0 }]) })).success).toBe(false);
    expect(readEventForm(form({ chatLink: "http://open.kakao.com" })).success).toBe(false);
    expect(readEventForm(form({ days: "깨진 값" })).success).toBe(false);
  });

  it("추가 지급을 끄면 보내지 않는다", () => {
    const parsed = readEventForm(form({ transportOn: "", regionalOn: "" }));
    expect(parsed.success && toEventRpcArgs(parsed.data).extras).toEqual([]);
  });
});
