import { describe, expect, it } from "vitest";
import {
  dailyExtras,
  dayLabel,
  describeExtras,
  extrasForTier,
  extrasTotal,
  formatEventDate,
  formatEventRange,
  formatShortDate,
  isoToKstLocal,
  kstLocalToIso,
  scheduledMinutes,
  paidMinutes,
  suggestPayDate,
  todayKst,
  visibleApplicationStatus,
} from "./events";

describe("formatEventDate", () => {
  it("요일을 붙여 보여 준다", () => {
    expect(formatEventDate("2026-11-08")).toBe("11월 8일 (일)");
    expect(formatEventDate("2026-10-31")).toBe("10월 31일 (토)");
  });
});

describe("scheduledMinutes", () => {
  it("시작부터 종료까지 분", () => {
    expect(scheduledMinutes("08:00:00", "13:00:00")).toBe(300);
    expect(scheduledMinutes("09:30", "17:00")).toBe(450);
  });
});

describe("suggestPayDate", () => {
  it("마지막 날 다음 날부터 가장 가까운 15일 또는 말일", () => {
    expect(suggestPayDate("2026-11-08")).toBe("2026-11-15");
    expect(suggestPayDate("2026-11-14")).toBe("2026-11-15");
    expect(suggestPayDate("2026-11-15")).toBe("2026-11-30");
    expect(suggestPayDate("2026-10-31")).toBe("2026-11-15");
    expect(suggestPayDate("2026-10-24")).toBe("2026-10-31");
  });

  it("말일이 지나면 다음 달 15일, 2월 말일도 맞춘다", () => {
    expect(suggestPayDate("2026-12-31")).toBe("2027-01-15");
    expect(suggestPayDate("2027-02-20")).toBe("2027-02-28");
  });
});

describe("paidMinutes", () => {
  it("휴게시간을 뺀다", () => {
    expect(paidMinutes({ start_time: "08:00:00", end_time: "17:00:00", break_minutes: 60 })).toBe(480);
    expect(paidMinutes({ start_time: "08:00:00", end_time: "17:00:00", break_minutes: 0 })).toBe(540);
  });
});

describe("extrasForTier", () => {
  const rules = [
    { type: "transport" as const, tier: "all" as const, amount: 10000, per_day: true },
    { type: "regional" as const, tier: "core" as const, amount: 30000, per_day: false },
    { type: "regional" as const, tier: "general" as const, amount: 20000, per_day: false },
  ];

  it("교통비는 전원, 지방비는 등급별", () => {
    expect(extrasForTier(rules, "core")).toEqual([
      { type: "transport", amount: 10000, perDay: true },
      { type: "regional", amount: 30000, perDay: false },
    ]);
    expect(extrasForTier(rules, "general")[1]).toEqual({ type: "regional", amount: 20000, perDay: false });
  });

  it("없으면 빈 목록", () => {
    expect(extrasForTier([], "core")).toEqual([]);
  });

  it("참여한 날 수에 맞춰 더한다 (일정당 항목은 한 번)", () => {
    const items = extrasForTier(rules, "core");
    expect(dailyExtras(items)).toBe(10000);
    expect(extrasTotal(items, 3)).toBe(10000 * 3 + 30000);
    expect(extrasTotal(items, 0)).toBe(0);
    expect(describeExtras(items, true)).toBe("교통비 10,000원 (참여한 날마다) · 지방비 30,000원 (일정당 한 번)");
    expect(describeExtras(items, false)).toBe("교통비 10,000원 · 지방비 30,000원");
  });
});

describe("날짜 표시", () => {
  it("짧은 날짜, 기간, 날짜 이름", () => {
    expect(formatShortDate("2026-11-07")).toBe("11/7(토)");
    expect(formatEventRange("2026-11-08", "2026-11-08")).toBe("11월 8일 (일)");
    expect(formatEventRange("2026-11-07", "2026-11-09")).toBe("11월 7일 (토) ~ 11월 9일 (월)");
    expect(dayLabel({ day_date: "2026-11-07", kind: "setup" })).toBe("11/7(토) 세팅");
  });
});

describe("한국 시간 변환", () => {
  it("입력칸 값과 DB 시각을 오간다", () => {
    expect(kstLocalToIso("2026-11-03T18:00")).toBe("2026-11-03T18:00:00+09:00");
    expect(kstLocalToIso("")).toBeNull();
    expect(isoToKstLocal("2026-11-03T09:00:00+00:00")).toBe("2026-11-03T18:00");
    expect(isoToKstLocal(null)).toBe("");
  });

  it("오늘 날짜는 한국 시간 기준", () => {
    expect(todayKst(Date.parse("2026-10-26T16:00:00Z"))).toBe("2026-10-27");
  });
});

describe("visibleApplicationStatus", () => {
  it("결과 알림 전에는 확정·미선발을 신청 완료로 보여 준다", () => {
    expect(visibleApplicationStatus("selected", null)).toBe("applied");
    expect(visibleApplicationStatus("rejected", "selected")).toBe("applied");
  });

  it("알림을 보낸 결과와 대기·취소는 그대로 보여 준다", () => {
    expect(visibleApplicationStatus("selected", "selected")).toBe("selected");
    expect(visibleApplicationStatus("rejected", "rejected")).toBe("rejected");
    expect(visibleApplicationStatus("waitlisted", null)).toBe("waitlisted");
    expect(visibleApplicationStatus("cancelled", "selected")).toBe("cancelled");
  });
});
