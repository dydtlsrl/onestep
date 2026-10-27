// 초대 링크를 지금 쓸 수 있는지 확인한다 (로그인 전에도 확인 가능)
import type { SupabaseClient } from "@supabase/supabase-js";
import { isInviteCodeFormat } from "@/lib/invite-code";

export async function isInviteUsable(supabase: SupabaseClient, code: string): Promise<boolean> {
  if (!isInviteCodeFormat(code)) return false;
  const { data, error } = await supabase.rpc("check_invite", { p_code: code });
  return !error && data === true;
}
