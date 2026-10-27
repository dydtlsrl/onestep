import { describe, expect, it } from "vitest";
import { firstIssueMessage, readEventForm, toEventRpcArgs } from "./event-form";

const setupDay = {
  dayDate: "2026-11-07",
  kind: "setup",
  recruit: "assign",
  gatherTime: "",
  startTime: "14:00",
  endTime: "18:00",
  positions: [{ roleName: "세팅 인력", payType: "hourly", rate: "12000", minPaidHours: "", overtimeRate: "", headcount: "2" }],
};
const examDay = {
  dayDate: "2026-11-08",
  kind: "main",
  recruit: "open",
  gatherTime: "07:30",
  startTime: "08:00",
  endTime: "13:00",
  positions: [
    { roleName: "감독관", payType: "hourly", rate: "12000", minPaidHours: "4", overtimeRate: "99", headcount: "8" },
    { roleName: "안내", payType: "daily", rate: 110000, minPaidHours: 3, overtimeRate: 15000, headcount: 4 },
  ],
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
    expect(args.days).toHaveLength(2);
    expect(args.days[0]).toMatchObject({ day_date: "2026-11-07", kind: "setup", recruit: "assign", gather_time: "" });
    expect(args.days[1].positions[0]).toMatchObject({ role_name: "감독관", pay_type: "hourly", rate: 12000, min_paid_hours: 4, overtime_rate: null, headcount: 8 });
    expect(args.days[1].positions[1]).toMatchObject({ pay_type: "daily", min_paid_hours: null, overtime_rate: 15000 });
    expect(args.extras).toEqual([
      { type: "transport", tier: "all", amount: 10000, per_day: true },
      { type: "regional", tier: "core", amount: 30000, per_day: false },
    ]);
  });

  it("공개 모집 날짜가 하나뿐이면 '모든 날짜 참여 필수'는 끈다", () => {
    const parsed = readEventForm(form());
    expect(parsed.success && toEventRpcArgs(parsed.data).event.all_days_required).toBe(false);
    const twoOpen = readEventForm(form({ days: JSON.stringify([{ ...setupDay, recruit: "open" }, examDay]) }));
    expect(twoOpen.success && toEventRpcArgs(twoOpen.data).event.all_days_required).toBe(true);
  });

  it("어느 날짜의 문제인지 알려 준다", () => {
    const parsed = readEventForm(form({ days: JSON.stringify([setupDay, { ...examDay, endTime: "07:00" }]) }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(firstIssueMessage(parsed.error)).toBe("2일차: 끝나는 시간이 시작 시간보다 늦어야 해요.");
  });

  it("날짜나 역할이 없거나 톡방 링크가 https가 아니면 실패", () => {
    expect(readEventForm(form({ days: "[]" })).success).toBe(false);
    expect(readEventForm(form({ days: JSON.stringify([{ ...examDay, positions: [] }]) })).success).toBe(false);
    expect(readEventForm(form({ chatLink: "http://open.kakao.com" })).success).toBe(false);
    expect(readEventForm(form({ days: "깨진 값" })).success).toBe(false);
  });

  it("추가 지급을 끄면 보내지 않는다", () => {
    const parsed = readEventForm(form({ transportOn: "", regionalOn: "" }));
    expect(parsed.success && toEventRpcArgs(parsed.data).extras).toEqual([]);
  });
});
