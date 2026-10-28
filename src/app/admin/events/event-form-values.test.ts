import { describe, expect, it } from "vitest";
import { DEFAULT_PAY_RULES } from "@/lib/pay";
import { activePresetId, copyEventValues, defaultPay, emptyEvent, fillCopiedDates, matchesPreset, presetValues, type RoleOption } from "./event-form-values";

const setup: RoleOption = { id: "r1", name: "필기 세팅", pay_type: "hourly", default_rate: 11000, min_paid_hours: 4, overtime_rate: null, default_for: "setup" };
const main: RoleOption = { id: "r2", name: "면접 진행", pay_type: "daily", default_rate: 110000, min_paid_hours: null, overtime_rate: 15000, default_for: "main" };
const other: RoleOption = { id: "r3", name: "박람회", pay_type: "hourly", default_rate: 12000, min_paid_hours: null, overtime_rate: null, default_for: null };

describe("defaultPay", () => {
  it("★기본 단가를 쓴다", () => {
    expect(defaultPay("setup", [setup, main], DEFAULT_PAY_RULES)).toEqual({ presetId: "r1", payType: "hourly", rate: "11000", minPaidHours: "4", overtimeRate: "" });
    expect(defaultPay("main", [setup, main], DEFAULT_PAY_RULES)).toEqual({ presetId: "r2", payType: "daily", rate: "110000", minPaidHours: "", overtimeRate: "15000" });
  });

  it("기본이 없으면 공통 기본 시급, 세팅일은 최소 4시간", () => {
    expect(defaultPay("setup", [other], DEFAULT_PAY_RULES)).toMatchObject({ payType: "hourly", rate: "11000", minPaidHours: "4", overtimeRate: "" });
    expect(defaultPay("main", [], DEFAULT_PAY_RULES)).toMatchObject({ payType: "hourly", rate: "11000", minPaidHours: "", overtimeRate: "" });
  });

  it("새 일정의 첫 날짜는 진행일 기본", () => {
    expect(emptyEvent(DEFAULT_PAY_RULES, [setup, main]).days[0]).toMatchObject({ kind: "main", payType: "daily", rate: "110000" });
  });
});

describe("matchesPreset", () => {
  it("값이 같으면 그 단가가 골라진 것으로 본다", () => {
    expect(matchesPreset(presetValues(setup), setup)).toBe(true);
    expect(matchesPreset({ ...presetValues(setup), rate: "11,000" }, setup)).toBe(true);
    expect(matchesPreset({ ...presetValues(setup), minPaidHours: "" }, setup)).toBe(false);
    expect(matchesPreset(presetValues(setup), other)).toBe(false);
  });
});

describe("activePresetId", () => {
  const twin: RoleOption = { ...setup, id: "r9", name: "필기 감독", default_for: null };
  const day = { key: "d", dayDate: "", kind: "main" as const, gatherTime: "", startTime: "", endTime: "", headcount: "1" };

  it("같은 금액의 단가가 여럿이면 버튼으로 고른 것만 표시", () => {
    expect(activePresetId({ ...day, ...presetValues(twin) }, [setup, twin])).toBe("r9");
    expect(activePresetId({ ...day, ...presetValues(setup) }, [setup, twin])).toBe("r1");
  });

  it("저장된 일정은 값이 같은 첫 줄, 다르면 없음", () => {
    expect(activePresetId({ ...day, ...presetValues(twin), presetId: undefined }, [setup, twin])).toBe("r1");
    expect(activePresetId({ ...day, ...presetValues(setup), rate: "15000" }, [setup, twin])).toBeNull();
  });
});

describe("일정 복사", () => {
  const saved = emptyEvent(DEFAULT_PAY_RULES, [setup, main]);
  const original = {
    ...saved,
    title: "OO공사 필기시험",
    chatLink: "https://open.kakao.com/o/x",
    applyDeadline: "2026-11-05T18:00",
    payDate: "2026-11-30",
    days: [
      { ...saved.days[0], key: "a", id: "a", dayDate: "2026-11-07", kind: "setup" as const, startTime: "14:00" },
      { ...saved.days[0], key: "b", id: "b", dayDate: "2026-11-08", startTime: "08:00" },
      { ...saved.days[0], key: "c", id: "c", dayDate: "2026-11-10", startTime: "08:00", headcount: "12" },
    ],
  };

  it("내용은 그대로, 날짜·마감·지급일·톡방은 비우고 간격을 기억한다", () => {
    const copy = copyEventValues(original);
    expect(copy).toMatchObject({ title: "OO공사 필기시험", chatLink: "", applyDeadline: "", payDate: "" });
    expect(copy.days.map((d) => [d.id, d.dayDate, d.offset, d.headcount, d.kind])).toEqual([
      [undefined, "", 0, "1", "setup"],
      [undefined, "", 1, "1", "main"],
      [undefined, "", 3, "12", "main"],
    ]);
    expect(new Set(copy.days.map((d) => d.key)).size).toBe(3);
  });

  it("어느 날을 고르든 나머지 빈 날짜를 원래 간격대로 채운다", () => {
    const copy = copyEventValues(original);
    const fromFirst = fillCopiedDates(copy.days, copy.days[0].key, "2026-12-05");
    expect(fromFirst.map((d) => d.dayDate)).toEqual(["2026-12-05", "2026-12-06", "2026-12-08"]);
    // 셋째 날(+3)을 먼저 골라도 첫날을 거꾸로 계산한다, 이미 고른 날은 건드리지 않는다
    const partly = fillCopiedDates(copy.days, copy.days[1].key, "2026-12-31");
    expect(partly.map((d) => d.dayDate)).toEqual(["2026-12-30", "2026-12-31", "2027-01-02"]);
    const again = fillCopiedDates(partly, partly[0].key, "2026-12-01");
    expect(again.map((d) => d.dayDate)).toEqual(["2026-12-01", "2026-12-31", "2027-01-02"]);
  });

  it("복사가 아닌 날짜는 그 날만 바꾼다", () => {
    const days = fillCopiedDates(original.days, "b", "2026-11-09");
    expect(days.map((d) => d.dayDate)).toEqual(["2026-11-07", "2026-11-09", "2026-11-10"]);
  });
});
