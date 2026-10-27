"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { messageForError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface MemberActionState {
  error?: string;
  ok?: string;
}

const memberId = z.uuid();

function refresh(id: string) {
  revalidatePath(`/admin/members/${id}`);
  revalidatePath("/admin/members");
}

// 아래 기능은 모두 DB 함수나 권한 규칙(RLS)이 대표인지 다시 확인한다

export async function setTier(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  const tier = z.enum(["core", "general"]).safeParse(formData.get("tier"));
  if (!id.success || !tier.success) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_tier", { p_member_id: id.data, p_tier: tier.data });
  if (error) return { error: messageForError(error) };

  refresh(id.data);
  return { ok: "등급을 저장했어요." };
}

export async function restrictMember(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "제한 사유를 적어 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("restrict_member", { p_member_id: id.data, p_reason: reason });
  if (error) return { error: messageForError(error) };

  refresh(id.data);
  return { ok: "활동을 제한했어요." };
}

export async function unrestrictMember(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unrestrict_member", { p_member_id: id.data });
  if (error) return { error: messageForError(error) };

  refresh(id.data);
  return { ok: "제한을 풀었어요." };
}

const noteSchema = z.object({
  memberId: z.uuid(),
  type: z.enum(["memo", "no_show", "late", "caution", "praise"]),
  content: z.string().trim().min(1, "내용을 적어 주세요.").max(1000, "1,000자까지 쓸 수 있어요."),
});

export async function addNote(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const parsed = noteSchema.safeParse({
    memberId: formData.get("memberId"),
    type: formData.get("type"),
    content: formData.get("content") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_notes")
    .insert({ member_id: parsed.data.memberId, type: parsed.data.type, content: parsed.data.content });
  if (error) return { error: "기록을 저장하지 못했어요. 대표 계정으로 로그인했는지 확인해 주세요." };

  refresh(parsed.data.memberId);
  return { ok: "기록을 남겼어요." };
}

export async function deleteNote(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("noteId"));
  const member = memberId.safeParse(formData.get("memberId"));
  if (!id.success || !member.success) return;

  const supabase = await createClient();
  await supabase.from("member_notes").delete().eq("id", id.data);
  refresh(member.data);
}
