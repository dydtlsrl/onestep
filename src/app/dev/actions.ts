"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface ResolveState {
  error?: string;
}

const schema = z.object({
  ids: z
    .string()
    .transform((v) => v.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))
    .pipe(z.array(z.number()).min(1).max(1000)),
  resolved: z.enum(["true", "false"]).transform((v) => v === "true"),
  note: z.string().trim().max(300, "메모는 300자까지 적을 수 있어요."),
});

// 같은 오류 묶음을 한 번에 "처리함"으로 표시하거나 되돌린다. DB 함수가 개발자인지 다시 확인한다.
export async function resolveErrors(_prev: ResolveState, formData: FormData): Promise<ResolveState> {
  const parsed = schema.safeParse({ ids: formData.get("ids") ?? "", resolved: formData.get("resolved"), note: formData.get("note") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "다시 시도해 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dev_resolve_errors", { p_ids: parsed.data.ids, p_resolved: parsed.data.resolved, p_note: parsed.data.note });
  if (error) return { error: await actionError(error) };
  revalidatePath("/dev");
  return {};
}
