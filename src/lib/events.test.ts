import { describe, expect, it } from "vitest";
import {
  extrasForTier,
  formatEventDate,
  isoToKstLocal,
  kstLocalToIso,
  scheduledMinutes,
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
  it("행사 7일 뒤 이후 가장 가까운 15일 또는 말일", () => {
    expect(suggestPayDate("2026-11-08")).toBe("2026-11-15");
    expect(suggestPayDate("2026-10-31")).toBe("2026-11-15");
    expect(suggestPayDate("2026-10-24")).toBe("2026-10-31");
    expect(suggestPayDate("2026-10-03")).toBe("2026-10-15");
  });

  it("말일을 넘기면 다음 달 15일, 2월 말일도 맞춘다", () => {
    expect(suggestPayDate("2026-12-28")).toBe("2027-01-15");
    expect(suggestPayDate("2027-02-10")).toBe("2027-02-28");
  });
});

describe("extrasForTier", () => {
  const rules = [
    { type: "transport" as const, tier: "all" as const, amount: 10000 },
    { type: "regional" as const, tier: "core" as const, amount: 30000 },
    { type: "regional" as const, tier: "general" as const, amount: 20000 },
  ];

  it("교통비는 전원, 지방비는 등급별", () => {
    expect(extrasForTier(rules, "core")).toEqual({ transport: 10000, regional: 30000 });
    expect(extrasForTier(rules, "general")).toEqual({ transport: 10000, regional: 20000 });
  });

  it("없으면 0", () => {
    expect(extrasForTier([], "core")).toEqual({ transport: 0, regional: 0 });
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
