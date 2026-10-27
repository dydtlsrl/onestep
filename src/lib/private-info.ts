// 주민등록번호·계좌번호 확인과 가리기. 화면과 서버가 같이 쓴다.

export const BANKS = [
  "KB국민은행", "신한은행", "우리은행", "하나은행", "NH농협은행", "IBK기업은행", "카카오뱅크", "토스뱅크",
  "케이뱅크", "SC제일은행", "한국씨티은행", "iM뱅크(대구)", "부산은행", "경남은행", "광주은행", "전북은행",
  "제주은행", "새마을금고", "신협", "우체국", "수협은행", "KDB산업은행", "지역농축협", "저축은행",
] as const;

// 숫자만 남긴다
const digits = (value: string) => value.replace(/\D/g, "");

// 주민등록번호 13자리. 앞 6자리가 실제 날짜이고 7번째 자리가 1~8이면 받는다.
// 2020년 10월 이후 번호는 끝자리 검증식이 없어 검증식은 쓰지 않는다.
export function normalizeRrn(value: string): string | null {
  const d = digits(value);
  if (d.length !== 13) return null;
  const g = Number(d[6]);
  if (g < 1 || g > 8) return null;
  const century = g === 1 || g === 2 || g === 5 || g === 6 ? 1900 : 2000;
  const year = century + Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const day = Number(d.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${d.slice(0, 6)}-${d.slice(6)}`;
}

// 900101-1****** (생년월일과 성별 자리만 보인다)
export function maskRrn(normalized: string): string {
  return `${normalized.slice(0, 8)}******`;
}

// 계좌번호: 숫자와 - 만, 숫자 8~16자리
export function normalizeAccount(value: string): string | null {
  const cleaned = value.trim().replace(/\s/g, "");
  if (!/^[\d-]+$/.test(cleaned)) return null;
  const d = digits(cleaned);
  if (d.length < 8 || d.length > 16) return null;
  return d;
}

// ****5678 (끝 4자리만 보인다)
export function maskAccount(normalized: string): string {
  return `****${normalized.slice(-4)}`;
}
