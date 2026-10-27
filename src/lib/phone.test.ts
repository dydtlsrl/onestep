import { describe, expect, it } from "vitest";
import { formatPhone, isValidMobile, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("숫자만 남긴다", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone(" 010 1234 5678 ")).toBe("01012345678");
    expect(normalizePhone("010.1234.5678")).toBe("01012345678");
  });
});

describe("isValidMobile", () => {
  it("휴대폰 번호를 받아들인다", () => {
    expect(isValidMobile("01012345678")).toBe(true);
    expect(isValidMobile("0111234567")).toBe(true);
  });

  it("휴대폰이 아닌 번호는 거절한다", () => {
    expect(isValidMobile("0212345678")).toBe(false);
    expect(isValidMobile("0101234567890")).toBe(false);
    expect(isValidMobile("01512345678")).toBe(false);
    expect(isValidMobile("")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("하이픈을 넣어 보여 준다", () => {
    expect(formatPhone("01012345678")).toBe("010-1234-5678");
    expect(formatPhone("0111234567")).toBe("011-123-4567");
  });
});
