import { describe, expect, it } from "vitest";
import { readEventForm, toEventRpcArgs } from "./event-form";

function form(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    type: "written_exam",
    title: " 대기업 공채 필기시험 ",
    clientName: "고객사A",
    eventDate: "2026-11-08",
    gatherTime: "07:30",
    startTime: "08:00",
    endTime: "13:00",
    locationName: "OO중학교",
    address: "서울 송파구",
    notice: "",
    chatLink: "https://open.kakao.com/o/abc",
    applyDeadline: "2026-11-03T18:00",
    payDate: "2026-11-15",
    memo: "",
    positions: JSON.stringify([
      { roleName: "감독관", payType: "hourly", rate: "12000", minPaidHours: "4", overtimeRate: "99", headcount: "8" },
      { roleName: "안내", payType: "daily", rate: 110000, minPaidHours: 3, overtimeRate: 15000, headcount: 4 },
    ]),
    transportOn: "on",
    transportAmount: "10,000",
    regionalOn: "on",
    regionalCore: "30000",
    regionalGeneral: "0",
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
    expect(args.positions[0]).toMatchObject({ role_name: "감독관", pay_type: "hourly", rate: 12000, min_paid_hours: 4, overtime_rate: null, headcount: 8 });
    expect(args.positions[1]).toMatchObject({ pay_type: "daily", min_paid_hours: null, overtime_rate: 15000 });
    expect(args.extras).toEqual([
      { type: "transport", tier: "all", amount: 10000 },
      { type: "regional", tier: "core", amount: 30000 },
    ]);
  });

  it("끝나는 시간이 시작보다 빠르면 실패", () => {
    const parsed = readEventForm(form({ endTime: "07:00" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toContain("endTime");
  });

  it("역할이 없거나 톡방 링크가 https가 아니면 실패", () => {
    expect(readEventForm(form({ positions: "[]" })).success).toBe(false);
    expect(readEventForm(form({ chatLink: "http://open.kakao.com" })).success).toBe(false);
    expect(readEventForm(form({ positions: "깨진 값" })).success).toBe(false);
  });

  it("추가 지급을 끄면 보내지 않는다", () => {
    const parsed = readEventForm(form({ transportOn: "", regionalOn: "" }));
    expect(parsed.success && toEventRpcArgs(parsed.data).extras).toEqual([]);
  });
});
