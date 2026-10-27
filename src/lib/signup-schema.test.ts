import { describe, expect, it } from "vitest";
import { generateInviteCode, isInviteCodeFormat } from "./invite-code";
import { readSignupForm } from "./signup-schema";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const valid = {
  code: "VALIDCODE0000001",
  name: " 김하늘 ",
  phone: "010-1234-5678",
  region: "서울",
  careerYears: "5",
  careerNote: "",
  referrerName: "",
  privacy: "on",
};

describe("readSignupForm", () => {
  it("올바른 입력은 정리해서 돌려준다", () => {
    const result = readSignupForm(form(valid));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("김하늘");
      expect(result.data.phone).toBe("01012345678");
      expect(result.data.careerYears).toBe(5);
    }
  });

  it("개인정보 동의가 없으면 실패", () => {
    const rest = { ...valid } as Partial<typeof valid>;
    delete rest.privacy;
    const result = readSignupForm(form(rest as Record<string, string>));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((i) => i.path[0] === "privacy")).toBe(true);
  });

  it("휴대폰 번호와 경력 범위를 검사한다", () => {
    const result = readSignupForm(form({ ...valid, phone: "02-123-4567", careerYears: "99" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("phone");
      expect(fields).toContain("careerYears");
    }
  });

  it("이름이 비어 있으면 실패", () => {
    expect(readSignupForm(form({ ...valid, name: "   " })).success).toBe(false);
  });
});

describe("generateInviteCode", () => {
  it("DB 규칙에 맞는 22글자 코드를 매번 다르게 만든다", () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    expect(a).toHaveLength(22);
    expect(isInviteCodeFormat(a)).toBe(true);
    expect(a).not.toBe(b);
  });
});
