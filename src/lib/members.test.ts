import { describe, expect, it } from "vitest";
import { cleanSearch, parseMemberFilters } from "./members";

describe("cleanSearch", () => {
  it("검색식을 깨뜨리는 기호를 지운다", () => {
    expect(cleanSearch("김,하늘)")).toBe("김 하늘");
    expect(cleanSearch("name.eq.x,role.eq.admin")).toBe("name eq x role eq admin");
    expect(cleanSearch("100%_*")).toBe("100");
  });

  it("앞뒤 공백을 지우고 40자로 자른다", () => {
    expect(cleanSearch("  김하늘  ")).toBe("김하늘");
    expect(cleanSearch("가".repeat(50))).toHaveLength(40);
  });
});

describe("parseMemberFilters", () => {
  it("기본값은 활동 회원, 전체 등급", () => {
    expect(parseMemberFilters({})).toEqual({ q: "", status: "active", tier: "all" });
  });

  it("알맞은 값은 그대로, 모르는 값은 기본값", () => {
    expect(parseMemberFilters({ q: "010", status: "restricted", tier: "core" })).toEqual({
      q: "010",
      status: "restricted",
      tier: "core",
    });
    expect(parseMemberFilters({ status: "admin", tier: ["vip"] })).toEqual({ q: "", status: "active", tier: "all" });
  });
});
