// 지금 로그인한 사람과 회원 정보를 읽는다. 서버에서만 쓴다.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MemberTier } from "@/lib/tier";

export { TIER_LABEL, type MemberTier } from "@/lib/tier";

export type MemberRole = "admin" | "member";
export type MemberStatus = "pending" | "active" | "rejected" | "restricted" | "withdrawn";

export interface Profile {
  id: string;
  name: string;
  phone: string;
  region: string;
  career_years: number;
  career_note: string;
  referrer_name: string;
  role: MemberRole;
  status: MemberStatus;
  tier: MemberTier;
  created_at: string;
}

export const PROFILE_COLUMNS =
  "id, name, phone, region, career_years, career_note, referrer_name, role, status, tier, created_at";

export async function getCurrentMember() {
  const supabase = await createClient();
  // getClaims는 로그인 토큰의 서명을 확인한다. 쿠키 내용을 그대로 믿지 않는다.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  if (!userId) return { supabase, userId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle<Profile>();

  return { supabase, userId, profile: profile ?? null };
}

export function isActiveAdmin(profile: Profile | null): boolean {
  return profile?.role === "admin" && profile.status === "active";
}

// 대표 화면 앞에서 부른다. 대표가 아니면 다른 화면으로 보낸다.
// 화면을 숨기는 것일 뿐이고, 실제 데이터 보호는 DB 권한 규칙(RLS)이 한다.
export async function requireAdmin() {
  const member = await getCurrentMember();
  if (!member.userId) redirect("/login");
  if (!isActiveAdmin(member.profile)) redirect("/");
  return member as typeof member & { userId: string; profile: Profile };
}

// 회원 화면 앞에서 부른다. 승인된 활동 회원(대표 포함)만 통과한다.
export async function requireMember(path = "/") {
  const member = await getCurrentMember();
  if (!member.userId) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!member.profile) redirect("/");
  if (member.profile.status !== "active") redirect("/pending");
  return member as typeof member & { userId: string; profile: Profile };
}
