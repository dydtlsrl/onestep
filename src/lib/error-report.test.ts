import { describe, expect, it } from "vitest";
import { cleanPath, describeDevice, flowForPath, groupErrors, summarizeFlows, type ErrorRow } from "./error-report";

describe("cleanPath", () => {
  it("경로만 남긴다", () => {
    expect(cleanPath("https://onestep.app/events/abc?x=1#y")).toBe("/events/abc");
    expect(cleanPath("/login?next=/dev")).toBe("/login");
    expect(cleanPath(null)).toBe("");
  });
});

describe("flowForPath", () => {
  it("화면 주소로 흐름을 정한다", () => {
    expect(flowForPath("/join/abcdefabcdefabcdef")).toBe("가입·로그인");
    expect(flowForPath("/auth/callback")).toBe("가입·로그인");
    expect(flowForPath("/events/1")).toBe("일정 신청");
    expect(flowForPath("/contracts/1")).toBe("계약 서명");
    expect(flowForPath("/admin/events/1")).toBe("대표: 일정·선발·계약");
    expect(flowForPath("/admin/members")).toBe("대표: 회원·가입 승인");
    expect(flowForPath("/admin")).toBe("대표: 기타");
    expect(flowForPath("/withdraw")).toBe("탈퇴·처리방침");
    expect(flowForPath("/")).toBe("첫 화면 (내 일정)");
    expect(flowForPath("/eventsx")).toBe("기타");
    expect(flowForPath("")).toBe("알 수 없음");
  });
});

describe("describeDevice", () => {
  it("기기와 카카오톡 안 브라우저", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) KAKAOTALK 10.4.5")).toBe("iPhone · 카카오톡 안");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; SM-S918N) Chrome/120 Mobile")).toBe("Android");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows PC");
    expect(describeDevice("")).toBe("알 수 없음");
  });
});

const row = (over: Partial<ErrorRow>): ErrorRow => ({
  id: 1,
  created_at: "2026-11-01T00:00:00Z",
  source: "action",
  level: "warn",
  code: "DEADLINE_PASSED",
  message: "DEADLINE_PASSED",
  path: "/events/1",
  digest: "",
  user_agent: "iPhone",
  detail: {},
  resolved_at: null,
  resolved_note: "",
  user_id: "a",
  user_name: "가",
  user_role: "member",
  ...over,
});

describe("groupErrors", () => {
  it("같은 오류끼리 묶고, 처리 안 한 것 → 버그 의심 → 최근 것 순서", () => {
    const groups = groupErrors([
      row({ id: 1 }),
      row({ id: 2, user_id: "b", created_at: "2026-11-02T00:00:00Z" }),
      row({ id: 3, user_id: null, path: "/events/2", resolved_at: "2026-11-03T00:00:00Z", resolved_note: "문구로 충분" }),
      row({ id: 4, level: "error", source: "server", code: "TypeError", message: "x is undefined", path: "/contracts/1", created_at: "2026-10-30T00:00:00Z" }),
      row({ id: 5, level: "error", source: "client", code: "Error", message: "old", resolved_at: "2026-11-05T00:00:00Z", created_at: "2026-11-05T00:00:00Z" }),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["TypeError", "DEADLINE_PASSED", "Error"]);
    expect(groups[1]).toMatchObject({ count: 3, openIds: [1, 2], users: 3, flows: ["일정 신청"], lastAt: "2026-11-02T00:00:00Z", resolvedNote: "문구로 충분" });
    expect(groups[1].resolvedIds).toEqual([3]);
    expect(groups[2]).toMatchObject({ openIds: [], resolvedIds: [5] });
  });
});

describe("summarizeFlows", () => {
  it("흐름별 버그·안내 건수, 버그 많은 흐름부터", () => {
    const s = summarizeFlows([
      row({ id: 1 }),
      row({ id: 2, level: "error", path: "/contracts/1" }),
      row({ id: 3, level: "error", path: "/contracts/2", resolved_at: "2026-11-02T00:00:00Z" }),
    ]);
    expect(s).toEqual([
      { flow: "계약 서명", errors: 2, warns: 0, open: 1, lastAt: "2026-11-01T00:00:00Z" },
      { flow: "일정 신청", errors: 0, warns: 1, open: 1, lastAt: "2026-11-01T00:00:00Z" },
    ]);
  });
});
