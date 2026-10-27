"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { generateInviteCode } from "@/lib/invite-code";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export interface CreateInviteState {
  error?: string;
  link?: string;
}

const createSchema = z.object({
  memo: z.string().trim().max(100, "메모는 100자까지 쓸 수 있어요."),
  maxUses: z.union([z.literal(""), z.coerce.number().int().min(1, "1 이상").max(1000, "1,000 이하")]),
  expiresInDays: z.enum(["", "1", "7", "30", "90"]),
});

// 초대 링크 만들기. 대표만 만들 수 있다는 규칙은 DB 권한 규칙(RLS)이 지킨다.
export async function createInvite(_prev: CreateInviteState, formData: FormData): Promise<CreateInviteState> {
  const parsed = createSchema.safeParse({
    memo: formData.get("memo") ?? "",
    maxUses: formData.get("maxUses") ?? "",
    expiresInDays: formData.get("expiresInDays") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const { memo, maxUses, expiresInDays } = parsed.data;
  const code = generateInviteCode();
  const expiresAt = expiresInDays
    ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const supabase = await createClient();
  const { error } = await supabase.from("invites").insert({
    code,
    memo,
    max_uses: maxUses === "" ? null : maxUses,
    expires_at: expiresAt,
  });
  if (error) return { error: "초대 링크를 만들지 못했어요. 대표 계정으로 로그인했는지 확인해 주세요." };

  revalidatePath("/admin/invites");
  return { link: `${await getSiteUrl()}/join/${code}` };
}

// 초대 링크 켜기·끄기
export async function setInviteActive(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  await supabase.from("invites").update({ is_active: active }).eq("id", id.data);
  revalidatePath("/admin/invites");
}
