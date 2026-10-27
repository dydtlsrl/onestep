// 휴대폰 번호 다루기. DB에는 숫자만 저장하고(01012345678), 화면에는 하이픈을 넣어 보여 준다.

const MOBILE_PATTERN = /^01[016789]\d{7,8}$/;

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function isValidMobile(digits: string): boolean {
  return MOBILE_PATTERN.test(digits);
}

export function formatPhone(digits: string): string {
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}
