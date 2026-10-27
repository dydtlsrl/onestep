// 계약서 양식의 {{빈칸}}을 채운다. 요청할 때 만든 내용(terms)은 계약서에 그대로 저장된다.

export const PLACEHOLDERS: { key: string; help: string }[] = [
  { key: "회사명", help: "설정의 회사 이름" },
  { key: "대표자", help: "설정의 대표자 이름" },
  { key: "이름", help: "회원 이름" },
  { key: "행사명", help: "일정 이름" },
  { key: "일자", help: "참여하는 날짜들" },
  { key: "장소", help: "장소 이름과 주소" },
  { key: "역할", help: "대표가 정한 역할 (없으면 현장 배정)" },
  { key: "금액", help: "예상 보수 합계" },
  { key: "지급예정일", help: "일정의 지급 예정일" },
];

export interface CompanyInfo {
  name: string;
  ceo: string;
  biz_no: string;
  address: string;
  phone: string;
}

export function parseCompany(value: unknown): CompanyInfo {
  const v = (value ?? {}) as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  return { name: s(v.name) || "원스텝", ceo: s(v.ceo), biz_no: s(v.biz_no), address: s(v.address), phone: s(v.phone) };
}

export type RrnDisplay = "masked" | "full";

export function parseRrnDisplay(value: unknown): RrnDisplay {
  return (value as { rrn_display?: unknown } | null)?.rrn_display === "full" ? "full" : "masked";
}

export interface ContractDay {
  label: string; // 11/7(토) 세팅
  time: string; // 08:00–17:00
  role: string;
  pay: string; // 시급 11,000원 × 9시간
  amount: number;
}

// 계약서에 복사해 두는 요청 시점의 내용
export interface ContractTerms {
  company: CompanyInfo;
  member: { name: string; phone: string };
  event: { title: string; location: string; address: string };
  days: ContractDay[];
  extras: { label: string; amount: number }[];
  total: number;
  pay_date: string | null;
  rrn_display: RrnDisplay; // 요청할 때의 설정 (회원은 설정을 읽을 수 없어 계약서에 같이 둔다)
}

export function parseTerms(value: unknown): ContractTerms | null {
  const v = value as Partial<ContractTerms> | null;
  if (!v || !v.company || !v.member || !v.event || !Array.isArray(v.days)) return null;
  return {
    company: parseCompany(v.company),
    member: v.member,
    event: v.event,
    days: v.days,
    extras: Array.isArray(v.extras) ? v.extras : [],
    total: typeof v.total === "number" ? v.total : 0,
    pay_date: typeof v.pay_date === "string" ? v.pay_date : null,
    rrn_display: v.rrn_display === "full" ? "full" : "masked",
  };
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function formatPayDate(date: string | null): string {
  if (!date) return "회사가 정한 지급일";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export function placeholderValues(terms: ContractTerms): Record<string, string> {
  const roles = [...new Set(terms.days.map((d) => d.role).filter(Boolean))];
  return {
    회사명: terms.company.name,
    대표자: terms.company.ceo,
    이름: terms.member.name,
    행사명: terms.event.title,
    일자: terms.days.map((d) => d.label).join(", "),
    장소: [terms.event.location, terms.event.address].filter(Boolean).join(" · ") || "현장 안내에 따름",
    역할: roles.length > 0 ? roles.join(", ") : "현장 배정",
    금액: won(terms.total),
    지급예정일: formatPayDate(terms.pay_date),
  };
}

// 모르는 {{빈칸}}은 그대로 둔다 (양식을 고칠 때 오타를 알아차리게)
export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export function unknownPlaceholders(body: string): string[] {
  const known = new Set(PLACEHOLDERS.map((p) => p.key));
  const found = [...body.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((k) => !known.has(k)))];
}
