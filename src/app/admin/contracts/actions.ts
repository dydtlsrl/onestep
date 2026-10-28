"use server";

import { revalidatePath } from "next/cache";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface TemplateState {
  error?: string;
  ok?: string;
}

// 양식을 고치면 새 버전으로 저장한다. 이미 보낸 계약서는 보낼 때의 문구 그대로 남는다.
export async function saveTemplate(_prev: TemplateState, formData: FormData): Promise<TemplateState> {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!title || title.length > 80) return { error: "제목은 1~80자로 적어 주세요." };
  if (!body || body.length > 20000) return { error: "본문은 1~20,000자로 적어 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_contract_template", { p_title: title, p_body: body });
  if (error) return { error: await actionError(error) };
  revalidatePath("/admin/contracts");
  return { ok: `${data}번째 양식으로 저장했어요. 이제부터 보내는 계약서에 쓰여요.` };
}
