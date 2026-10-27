// 회원 관리 화면에서 쓰는 이름표와 검색 조건
import type { MemberStatus, MemberTier } from "@/lib/auth";

export type NoteType = "memo" | "no_show" | "late" | "caution" | "praise";

export const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: "승인 대기",
  active: "활동",
  rejected: "거절",
  restricted: "제한",
  withdrawn: "탈퇴",
};

export const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: "memo", label: "메모" },
  { value: "no_show", label: "노쇼" },
  { value: "late", label: "지각" },
  { value: "caution", label: "주의" },
  { value: "praise", label: "칭찬" },
];

export const NOTE_TYPE_LABEL = Object.fromEntries(NOTE_TYPES.map((t) => [t.value, t.label])) as Record<
  NoteType,
  string
>;

const STATUS_FILTERS = ["all", "active", "restricted", "pending", "rejected"] as const;
const TIER_FILTERS = ["all", "core", "general"] as const;

export type StatusFilter = (typeof STATUS_FILTERS)[number];
export type TierFilter = (typeof TIER_FILTERS)[number];

export interface MemberFilters {
  q: string;
  status: StatusFilter;
  tier: TierFilter;
}

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// 주소의 ?q=&status=&tier= 값을 읽는다. 모르는 값은 기본값으로 바꾼다.
export function parseMemberFilters(params: Record<string, string | string[] | undefined>): MemberFilters {
  const status = first(params.status) as StatusFilter;
  const tier = first(params.tier) as TierFilter;
  return {
    q: cleanSearch(first(params.q)),
    status: STATUS_FILTERS.includes(status) ? status : "active",
    tier: TIER_FILTERS.includes(tier) ? tier : "all",
  };
}

// 검색어에서 DB 검색식을 깨뜨릴 수 있는 기호를 지운다 (쉼표, 괄호, 와일드카드 등)
export function cleanSearch(value: string): string {
  return value.replace(/[,()*%_\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

export const TIER_FILTER_LABEL: Record<TierFilter, string> = { all: "전체 등급", core: "핵심", general: "일반" };
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  all: "전체 상태",
  active: "활동",
  restricted: "제한",
  pending: "승인 대기",
  rejected: "거절",
};

export function isTier(value: unknown): value is MemberTier {
  return value === "core" || value === "general";
}
