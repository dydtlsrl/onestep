// 지금 로그인한 사람과 회원 정보를 읽는다. 서버에서만 쓴다.
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
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

// 한 번의 요청 안에서는 결과를 다시 쓴다. 레이아웃과 페이지가 각각 불러도 로그인 확인·회원 조회는 한 번만 한다.
export const getCurrentMember = cache(async () => {
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
});

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

// 개발자 화면(/dev) 앞에서 부른다. 개발자는 회원 정보가 없어도 된다 (developers 표에 등록된 로그인 계정).
// 개발자가 아니면 화면이 있다는 것도 알리지 않는다 (404).
const isDeveloper = cache(async () => {
  const { supabase, userId } = await getCurrentMember();
  if (!userId) return false;
  const { data } = await supabase.rpc("is_developer");
  return data === true;
});

export async function requireDeveloper(path = "/dev") {
  const member = await getCurrentMember();
  if (!member.userId) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (!(await isDeveloper())) notFound();
  return member as typeof member & { userId: string };
}
