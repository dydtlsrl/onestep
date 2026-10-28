import { describe, expect, it } from "vitest";
import {
  averageMinutes,
  DEFAULT_PILOT_SETTINGS,
  durationStatus,
  eventDuration,
  formatMinutes,
  parsePilotSettings,
  percent,
  rateStatus,
  signTotal,
  summarizeApplications,
  summarizeContracts,
  summarizeSignups,
  type ContractInput,
} from "./pilot";

describe("parsePilotSettings", () => {
  it("비었거나 틀린 값은 기본값", () => {
    expect(parsePilotSettings(null)).toEqual(DEFAULT_PILOT_SETTINGS);
    expect(parsePilotSettings({ event_ids: "x", invited_count: -1, ceo_yes: 1.5, note: 3 })).toEqual(DEFAULT_PILOT_SETTINGS);
  });

  it("저장된 값을 읽는다", () => {
    const s = parsePilotSettings({ event_ids: ["a"], invite_ids: ["b"], invited_count: 8, baseline_minutes: 0, target_reduction_pct: 30, member_yes: 4, note: "1차" });
    expect(s).toMatchObject({ eventIds: ["a"], inviteIds: ["b"], invitedCount: 8, baselineMinutes: 0, targetReductionPct: 30, memberYes: 4, note: "1차" });
  });
});

describe("rateStatus, percent", () => {
  it("대상이 없으면 아직 모름", () => {
    expect(rateStatus(0, 0, 0.9)).toBe("none");
    expect(percent(0, 0)).toBe("—");
  });
  it("목표 이상이면 달성", () => {
    expect(rateStatus(9, 10, 0.9)).toBe("met");
    expect(rateStatus(8, 10, 0.9)).toBe("missed");
    expect(percent(2, 3)).toBe("67%");
  });
});

describe("summarizeSignups", () => {
  const invite = "2026-11-01T00:00:00Z";
  const base = { status: "active", createdAt: "2026-11-02T00:00:00Z", inviteCreatedAt: invite };

  it("승인과 정산 정보 등록 중 늦은 때가 마친 때, 초대 링크를 만든 때부터 센다", () => {
    const s = summarizeSignups([
      { ...base, id: "a", name: "가", approvedAt: "2026-11-03T00:00:00Z", privateUpdatedAt: "2026-11-05T12:00:00Z" },
      { ...base, id: "b", name: "나", approvedAt: "2026-11-03T00:00:00Z", privateUpdatedAt: "2026-11-16T00:00:00Z" },
      { ...base, id: "c", name: "다", approvedAt: "2026-11-03T00:00:00Z", privateUpdatedAt: null },
      { ...base, id: "d", name: "라", status: "pending", approvedAt: null, privateUpdatedAt: null },
    ]);
    expect(s).toMatchObject({ applied: 4, approved: 3, completed: 2, completedInTime: 1 });
    expect(s.rows[0]).toMatchObject({ days: 4.5, withinTarget: true, completedAt: "2026-11-05T12:00:00.000Z" });
    expect(s.rows[1]).toMatchObject({ days: 15, withinTarget: false });
  });

  it("초대 링크가 없으면 가입 신청 때부터, 거절된 사람은 승인으로 안 센다", () => {
    const s = summarizeSignups([
      { ...base, id: "a", name: "가", inviteCreatedAt: null, approvedAt: "2026-11-03T00:00:00Z", privateUpdatedAt: "2026-11-03T00:00:00Z" },
      { ...base, id: "b", name: "나", status: "rejected", approvedAt: "2026-11-03T00:00:00Z", privateUpdatedAt: null },
    ]);
    expect(s.rows[0].days).toBe(1);
    expect(s).toMatchObject({ approved: 1, completed: 1 });
  });
});

describe("summarizeApplications", () => {
  it("일정마다 한 사람을 한 건, 한 날짜라도 본인이 신청했으면 앱 신청", () => {
    expect(
      summarizeApplications([
        { eventId: "e1", memberId: "a", addedByAdmin: false },
        { eventId: "e1", memberId: "a", addedByAdmin: true },
        { eventId: "e1", memberId: "b", addedByAdmin: true },
        { eventId: "e2", memberId: "a", addedByAdmin: false },
      ]),
    ).toEqual({ total: 3, viaApp: 2 });
  });
});

describe("summarizeContracts", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const c = (status: ContractInput["status"], requestedAt: string, signedAt: string | null): ContractInput => ({
    eventId: "e",
    memberId: "m",
    status,
    requestedAt,
    signedAt,
  });

  it("24시간 안·늦음·밀림·기다림, 무효는 뺀다", () => {
    const s = summarizeContracts(
      [
        c("signed", "2026-11-08T00:00:00Z", "2026-11-09T00:00:00Z"), // 딱 24시간
        c("signed", "2026-11-08T00:00:00Z", "2026-11-09T00:01:00Z"),
        c("requested", "2026-11-09T11:00:00Z", null),
        c("requested", "2026-11-09T13:00:00Z", null),
        c("voided", "2026-11-01T00:00:00Z", null),
      ],
      now,
    );
    expect(s).toEqual({ onTime: 1, late: 1, overdue: 1, waiting: 1 });
    expect(signTotal(s)).toBe(3);
  });
});

describe("eventDuration", () => {
  const event = { id: "e", createdAt: "2026-11-01T00:00:00Z" };
  const sel = (memberId: string, status = "selected", decidedAt = "2026-11-02T00:00:00Z") => ({ eventId: "e", memberId, status, decidedAt });
  const signed = (memberId: string, signedAt: string): ContractInput => ({ eventId: "e", memberId, status: "signed", requestedAt: "2026-11-02T00:00:00Z", signedAt });

  it("확정자 전원이 서명하면 마지막 서명까지 걸린 시간", () => {
    const d = eventDuration(event, [sel("a"), sel("b", "selected", "2026-11-02T06:00:00Z"), sel("c", "rejected")], [
      signed("a", "2026-11-02T03:00:00Z"),
      signed("b", "2026-11-03T01:30:00Z"),
      signed("x", "2026-11-09T00:00:00Z"), // 확정자가 아니면 무시
    ]);
    expect(d).toMatchObject({ selected: 2, signed: 2, lastSelectedAt: "2026-11-02T06:00:00.000Z", minutes: 2 * 1440 + 90 });
  });

  it("한 명이라도 서명 전이면 아직 진행 중", () => {
    const d = eventDuration(event, [sel("a"), sel("b")], [signed("a", "2026-11-02T03:00:00Z")]);
    expect(d).toMatchObject({ selected: 2, signed: 1, completedAt: null, minutes: null });
    expect(eventDuration(event, [], []).minutes).toBeNull();
  });

  it("평균은 끝난 일정만", () => {
    const done = { selected: 1, signed: 1, lastSelectedAt: null, completedAt: "x", minutes: 100 };
    expect(averageMinutes([done, { ...done, minutes: 201 }, { ...done, minutes: null }])).toBe(151);
    expect(averageMinutes([])).toBeNull();
  });
});

describe("durationStatus", () => {
  const s = { ...DEFAULT_PILOT_SETTINGS, baselineMinutes: 600 };
  it("기존 시간이나 결과가 없으면 아직 모름", () => {
    expect(durationStatus(null, s)).toBe("none");
    expect(durationStatus(100, DEFAULT_PILOT_SETTINGS)).toBe("none");
  });
  it("목표 감소율이 없으면 줄기만 하면 달성", () => {
    expect(durationStatus(599, s)).toBe("met");
    expect(durationStatus(600, s)).toBe("missed");
  });
  it("목표 감소율이 있으면 그만큼 줄어야 달성", () => {
    expect(durationStatus(420, { ...s, targetReductionPct: 30 })).toBe("met");
    expect(durationStatus(421, { ...s, targetReductionPct: 30 })).toBe("missed");
  });
});

describe("formatMinutes", () => {
  it("일·시간·분", () => {
    expect(formatMinutes(1500)).toBe("1일 1시간");
    expect(formatMinutes(2880)).toBe("2일");
    expect(formatMinutes(90)).toBe("1시간 30분");
    expect(formatMinutes(120)).toBe("2시간");
    expect(formatMinutes(5)).toBe("5분");
  });
});
