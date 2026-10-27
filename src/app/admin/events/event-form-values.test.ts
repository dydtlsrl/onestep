import { describe, expect, it } from "vitest";
import { DEFAULT_PAY_RULES } from "@/lib/pay";
import { activePresetId, defaultPay, emptyEvent, matchesPreset, presetValues, type RoleOption } from "./event-form-values";

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
