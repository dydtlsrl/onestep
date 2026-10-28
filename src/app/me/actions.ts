"use server";

import { revalidatePath } from "next/cache";
import { encryptPii, hasPiiKey } from "@/lib/crypto";
import { actionError } from "@/lib/error-log";
import { maskAccount, maskRrn, readPrivateForm } from "@/lib/private-form";
import { createClient } from "@/lib/supabase/server";

export interface PrivateState {
  error?: string;
  ok?: string;
}

// 주민번호·계좌번호는 여기(서버)에서 암호화한 뒤에 DB로 보낸다. 원래 값은 저장하지 않는다.
export async function savePrivateInfo(_prev: PrivateState, formData: FormData): Promise<PrivateState> {
  if (!hasPiiKey()) return { error: await actionError({ message: "PII_KEY_MISSING" }) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return { error: await actionError({ message: "NOT_AUTHENTICATED" }) };

  const { data: existing } = await supabase.from("member_private").select("member_id").eq("member_id", userId).maybeSingle();
  const { data, error: formError } = readPrivateForm(formData, existing !== null);
  if (!data) return { error: formError };

  const row: Record<string, string> = { bank_name: data.bank, account_holder: data.holder, address: data.address };
  if (data.rrn) {
    row.rrn_enc = encryptPii(data.rrn);
    row.rrn_masked = maskRrn(data.rrn);
  }
  if (data.account) {
    row.account_enc = encryptPii(data.account);
    row.account_masked = maskAccount(data.account);
  }

  const { error } = existing
    ? await supabase.from("member_private").update(row).eq("member_id", userId)
    : await supabase.from("member_private").insert({ member_id: userId, ...row });
  if (error) return { error: await actionError(error) };

  revalidatePath("/me");
  revalidatePath("/contracts", "layout");
  return { ok: "정산 정보를 안전하게 저장했어요." };
}
