import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("우리 사이트 안의 경로는 그대로 쓴다", () => {
    expect(safeNextPath("/signup/abc")).toBe("/signup/abc");
    expect(safeNextPath("/")).toBe("/");
  });

  it("다른 사이트로 가는 주소는 막는다", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath("javascript:alert(1)")).toBe("/");
  });

  it("값이 없으면 기본값", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("", "/login")).toBe("/login");
  });
});
