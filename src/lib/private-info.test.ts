import { describe, expect, it } from "vitest";
import { maskAccount, maskRrn, normalizeAccount, normalizeRrn } from "./private-info";

describe("주민등록번호", () => {
  it("하이픈·공백이 있어도 받는다", () => {
    expect(normalizeRrn("900101-1234567")).toBe("900101-1234567");
    expect(normalizeRrn("900101 1234567")).toBe("900101-1234567");
    expect(normalizeRrn("0502283234567")).toBe("050228-3234567");
  });

  it("자릿수·날짜·성별 자리가 틀리면 거절", () => {
    expect(normalizeRrn("900101-123456")).toBeNull();
    expect(normalizeRrn("901301-1234567")).toBeNull();
    expect(normalizeRrn("900230-1234567")).toBeNull();
    expect(normalizeRrn("900101-9234567")).toBeNull();
    expect(normalizeRrn("010229-3234567")).toBeNull(); // 2001년은 윤년이 아님
  });

  it("뒷자리 첫 숫자만 남기고 가린다", () => {
    expect(maskRrn("900101-1234567")).toBe("900101-1******");
  });
});

describe("계좌번호", () => {
  it("숫자만 남긴다", () => {
    expect(normalizeAccount("1002-123-456789")).toBe("1002123456789");
    expect(normalizeAccount(" 3333 01 1234567 ")).toBe("3333011234567");
  });

  it("문자나 짧은 번호는 거절", () => {
    expect(normalizeAccount("1234")).toBeNull();
    expect(normalizeAccount("1002-abc-4567")).toBeNull();
    expect(normalizeAccount("12345678901234567")).toBeNull();
  });

  it("끝 4자리만 보인다", () => {
    expect(maskAccount("1002123456789")).toBe("****6789");
  });
});
