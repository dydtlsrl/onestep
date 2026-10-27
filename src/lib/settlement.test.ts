import { describe, expect, it } from "vitest";
import type { DayRow } from "./events";
import { DEFAULT_PAY_RULES } from "./pay";
import { buildPaymentItems, sumItems, type SelectedDay } from "./settlement";

const day = (over: Partial<DayRow>): DayRow => ({
  id: "d1",
  event_id: "e",
  day_date: "2026-11-07",
  kind: "main",
  gather_time: null,
  start_time: "08:00:00",
  end_time: "17:00:00",
  sort_order: 0,
  headcount: 3,
  pay_type: "hourly",
  rate: 11000,
  min_paid_hours: null,
  overtime_rate: null,
  ...over,
});

const sel = (d: DayRow, over: Partial<SelectedDay> = {}): SelectedDay => ({
  day: d,
  attendance: "attended",
  overtimeMinutes: 0,
  roleName: "",
  rateOverride: null,
  ...over,
});

describe("buildPaymentItems", () => {
  const setup = day({ id: "s", day_date: "2026-11-07", kind: "setup", start_time: "14:00:00", end_time: "16:00:00", min_paid_hours: 4 });
  const main = day({ id: "m", day_date: "2026-11-08" });

  it("세팅일 최소 4시간, 진행일 9시간, 교통비 날마다·지방비 한 번", () => {
    const r = buildPaymentItems(
      [sel(main), sel(setup)],
      null,
      [
        { type: "transport", amount: 10000, perDay: true },
        { type: "regional", amount: 30000, perDay: false },
      ],
      DEFAULT_PAY_RULES,
      "actual",
    );
    expect(r.items.map((i) => [i.kind, i.amount])).toEqual([
      ["work", 44000],
      ["work", 99000],
      ["transport", 20000],
      ["regional", 30000],
    ]);
    expect(r.items[0].label).toBe("11/7(토) 세팅 · 시급 11,000원 × 4시간");
    expect(r.items[2].label).toBe("교통비 10,000원 × 2일");
    expect(r).toMatchObject({ workAmount: 143000, extraAmount: 50000, workedDays: 2 });
  });

  it("노쇼는 빼고, 미확인은 넣고 세어 둔다, 초과 근무 항목", () => {
    const r = buildPaymentItems(
      [sel(setup, { attendance: "no_show" }), sel(main, { attendance: "unknown", overtimeMinutes: 60 })],
      null,
      [{ type: "transport", amount: 10000, perDay: true }],
      DEFAULT_PAY_RULES,
      "actual",
    );
    expect(r.items.map((i) => i.kind)).toEqual(["work", "overtime", "transport"]);
    expect(r.items[1].amount).toBe(16500);
    expect(r).toMatchObject({ workedDays: 1, unknownDays: 1 });
  });

  it("계약서용: 모든 날, 초과 없음, 개별 단가 반영", () => {
    const r = buildPaymentItems([sel(main, { attendance: "no_show", overtimeMinutes: 120, rateOverride: 13000 })], 12000, [], DEFAULT_PAY_RULES, "planned");
    expect(r.items).toEqual([{ kind: "work", label: "11/8(일) 진행 · 시급 13,000원 × 9시간", amount: 117000, day_id: "m" }]);
  });

  it("모두 노쇼면 추가 지급도 없음", () => {
    const r = buildPaymentItems([sel(main, { attendance: "no_show" })], null, [{ type: "regional", amount: 30000, perDay: false }], DEFAULT_PAY_RULES, "actual");
    expect(r.items).toEqual([]);
  });

  it("sumItems: 근무·초과와 그 밖을 나눈다", () => {
    expect(sumItems([{ kind: "work", amount: 10 }, { kind: "overtime", amount: 5 }, { kind: "other", amount: 3 }])).toEqual({ workAmount: 15, extraAmount: 3 });
  });
});
