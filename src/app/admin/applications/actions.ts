"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface DecisionState {
  error?: string;
}

const memberIdSchema = z.uuid();

// 승인·거절 권한은 DB 함수가 다시 확인한다 (대표가 아니면 NOT_ADMIN)
export async function approveApplication(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const memberId = memberIdSchema.safeParse(formData.get("memberId"));
  if (!memberId.success) return { error: "잘못된 요청이에요." };
  const tier = formData.get("tier") === "core" ? "core" : "general";

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_member", { p_member_id: memberId.data, p_tier: tier });
  if (error) return { error: await actionError(error) };

  revalidatePath("/admin", "layout");
  return {};
}

export async function rejectApplication(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const memberId = memberIdSchema.safeParse(formData.get("memberId"));
  if (!memberId.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length > 500) return { error: "사유는 500자까지 쓸 수 있어요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_member", { p_member_id: memberId.data, p_reason: reason });
  if (error) return { error: await actionError(error) };

  revalidatePath("/admin", "layout");
  return {};
}
