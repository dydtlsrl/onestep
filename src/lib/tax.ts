// 원천징수 계산 (PRD SET-01·02). 세목은 대표가 세무사와 확인한 뒤 설정에서 고른다.
//   - 기타소득: 필요경비 60%를 뺀 금액의 20% → 지급액의 8%, 지방소득세는 그 10%
//     과세최저한: 기타소득금액(지급액의 40%)이 5만 원 이하, 곧 지급액 125,000원 이하면 세금 없음
//   - 사업소득: 지급액의 3%, 지방소득세는 그 10% (합계 3.3%)
//     소액부징수: 소득세가 1,000원 미만이면 걷지 않음
//   - 원천징수 없음: 세금 0원
//   - 정하지 않음: 세금을 계산하지 않고, 정산은 "확정 전"으로만 저장된다
// 세금은 10원 미만을 버린다.

export type TaxType = "unset" | "other" | "business" | "none";

export interface TaxSettings {
  type: TaxType;
  threshold: boolean; // 과세최저한(기타소득)·소액부징수(사업소득)를 적용할지
  includeExtras: boolean; // 교통비·지방비도 세금 계산에 넣을지 (실비로 보면 뺀다)
}

export const DEFAULT_TAX_SETTINGS: TaxSettings = { type: "unset", threshold: true, includeExtras: true };

export const TAX_TYPE_LABEL: Record<TaxType, string> = {
  unset: "아직 정하지 않음",
  other: "기타소득 (8.8%)",
  business: "사업소득 (3.3%)",
  none: "원천징수 없음",
};

export const OTHER_INCOME_THRESHOLD = 125000;
export const SMALL_TAX_LIMIT = 1000;

export interface TaxResult {
  type: TaxType;
  base: number; // 세금 계산에 넣은 금액
  incomeTax: number;
  localTax: number;
  exempt: boolean; // 과세최저한·소액부징수로 0원이 되었는지
  rule: { type: TaxType; rate: number; threshold: boolean; include_extras: boolean };
}

const floor10 = (value: number) => Math.floor(value / 10 + 1e-9) * 10;

export function calculateTax(workAmount: number, extraAmount: number, settings: TaxSettings): TaxResult {
  const base = workAmount + (settings.includeExtras ? extraAmount : 0);
  const rate = settings.type === "other" ? 0.08 : settings.type === "business" ? 0.03 : 0;
  const rule = { type: settings.type, rate, threshold: settings.threshold, include_extras: settings.includeExtras };

  let incomeTax = floor10(base * rate);
  let exempt = false;
  if (settings.threshold && incomeTax > 0) {
    if (settings.type === "other" && base <= OTHER_INCOME_THRESHOLD) exempt = true;
    if (settings.type === "business" && incomeTax < SMALL_TAX_LIMIT) exempt = true;
  }
  if (exempt) incomeTax = 0;
  return { type: settings.type, base, incomeTax, localTax: floor10(incomeTax * 0.1), exempt, rule };
}

export function parseTaxSettings(value: unknown): TaxSettings {
  const v = (value ?? {}) as Record<string, unknown>;
  const type = v.type;
  return {
    type: type === "other" || type === "business" || type === "none" ? type : "unset",
    threshold: typeof v.threshold === "boolean" ? v.threshold : DEFAULT_TAX_SETTINGS.threshold,
    includeExtras: typeof v.include_extras === "boolean" ? v.include_extras : DEFAULT_TAX_SETTINGS.includeExtras,
  };
}
