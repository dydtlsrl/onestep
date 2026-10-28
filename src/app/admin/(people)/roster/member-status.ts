// 명단의 휴대폰 번호로 가입한 회원과 상태를 찾는다 (명단 화면과 서버 액션이 같이 쓴다)
import "server-only";
import type { MemberStatus } from "@/lib/auth";
import { chunk } from "@/lib/chunk";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// 이 번호들 중 가입한(탈퇴하지 않은) 회원의 번호와 상태
export async function memberStatusByPhone(supabase: Supabase, phones: string[]) {
  const map = new Map<string, MemberStatus>();
  for (const part of chunk(phones)) {
    const { data, error } = await supabase.from("profiles").select("phone, status").in("phone", part).neq("status", "withdrawn").returns<{ phone: string; status: MemberStatus }[]>();
    if (error) return { map, error };
    for (const m of data ?? []) map.set(m.phone, m.status);
  }
  return { map, error: null };
}
