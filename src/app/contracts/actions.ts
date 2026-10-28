"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface SignState {
  error?: string;
  ok?: string;
}

// 서명. 서명 이미지·시각·IP·기기 정보와 문서 해시는 DB 함수가 함께 기록한다.
export async function signContract(_prev: SignState, formData: FormData): Promise<SignState> {
  const id = z.uuid().safeParse(formData.get("contractId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  if (formData.get("agree") !== "on") return { error: "계약 내용을 확인했다고 체크해 주세요." };
  const signature = String(formData.get("signature") ?? "");

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  const userAgent = h.get("user-agent") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.rpc("sign_contract", {
    p_contract_id: id.data,
    p_signature: signature,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) return { error: await actionError(error) };

  revalidatePath(`/contracts/${id.data}`);
  revalidatePath("/contracts");
  revalidatePath("/");
  return { ok: "서명했어요. 이 화면에서 언제든 다시 볼 수 있어요." };
}
