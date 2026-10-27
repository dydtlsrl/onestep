import { describe, expect, it } from "vitest";
import { calculateTax, parseTaxSettings } from "./tax";

const other = { type: "other" as const, threshold: true, includeExtras: true };

describe("calculateTax", () => {
  it("기타소득: 8%와 지방세 10%, 10원 미만 버림", () => {
    const r = calculateTax(99000, 10000, other);
    expect(r).toMatchObject({ base: 109000, incomeTax: 0, exempt: true }); // 125,000원 이하
    const big = calculateTax(176000, 10000, other);
    expect(big).toMatchObject({ base: 186000, incomeTax: 14880, localTax: 1480, exempt: false });
  });

  it("기타소득: 과세최저한 경계", () => {
    expect(calculateTax(125000, 0, other).incomeTax).toBe(0);
    expect(calculateTax(125010, 0, other).incomeTax).toBe(10000);
    expect(calculateTax(99000, 0, { ...other, threshold: false })).toMatchObject({ incomeTax: 7920, localTax: 790 });
  });

  it("교통비를 빼고 계산할 수 있다", () => {
    expect(calculateTax(176000, 30000, { ...other, includeExtras: false }).base).toBe(176000);
  });

  it("사업소득: 3.3%, 소득세 1,000원 미만은 0", () => {
    expect(calculateTax(88000, 0, { type: "business", threshold: true, includeExtras: true })).toMatchObject({
      incomeTax: 2640,
      localTax: 260,
    });
    expect(calculateTax(30000, 0, { type: "business", threshold: true, includeExtras: true })).toMatchObject({
      incomeTax: 0,
      exempt: true,
    });
  });

  it("원천징수 없음·미정은 0원", () => {
    expect(calculateTax(500000, 0, { type: "none", threshold: true, includeExtras: true }).incomeTax).toBe(0);
    expect(calculateTax(500000, 0, { type: "unset", threshold: true, includeExtras: true }).incomeTax).toBe(0);
  });
});

describe("parseTaxSettings", () => {
  it("이상한 값은 기본값", () => {
    expect(parseTaxSettings(null)).toEqual({ type: "unset", threshold: true, includeExtras: true });
    expect(parseTaxSettings({ type: "business", threshold: false, include_extras: false })).toEqual({
      type: "business",
      threshold: false,
      includeExtras: false,
    });
  });
});
