// 회원 등급. 서버와 브라우저 화면에서 같이 쓴다 (auth.ts는 서버 전용이라 따로 둔다).
export type MemberTier = "core" | "general";

export const TIER_LABEL: Record<MemberTier, string> = { core: "핵심", general: "일반" };
