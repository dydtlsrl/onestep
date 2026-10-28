"use server";

import { redirect } from "next/navigation";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface WithdrawState {
  error?: string;
}

// 본인 탈퇴. DB 함수가 확정 일정·받을 보수가 남았는지 다시 확인하고, 지울 것과 남길 것을 처리한다.
export async function withdrawSelf(_prev: WithdrawState, formData: FormData): Promise<WithdrawState> {
  if (formData.get("confirm") !== "on") return { error: "안내를 확인했다고 체크해 주세요." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { error: await actionError({ message: "NOT_AUTHENTICATED" }) };

  const { error } = await supabase.rpc("withdraw_member", { p_member_id: userId, p_reason: reason });
  if (error) return { error: await actionError(error) };

  await supabase.auth.signOut();
  redirect("/login?withdrawn=1");
}
