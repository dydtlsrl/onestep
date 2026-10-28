"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { decryptPii } from "@/lib/crypto";
import { actionError } from "@/lib/error-log";
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
  if (error) return { error: await actionError(error) };

  refresh(id.data);
  return { ok: "등급을 저장했어요." };
}

// 회원 기본 시급. 비우면 일정의 단가를 그대로 쓴다.
export async function setMemberRate(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  const raw = String(formData.get("rate") ?? "").replace(/[^0-9]/g, "");
  const rate = raw === "" ? null : Number(raw);
  if (rate !== null && rate > 10_000_000) return { error: "시급이 너무 커요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_rate", { p_member_id: id.data, p_rate: rate });
  if (error) return { error: await actionError(error) };

  refresh(id.data);
  return { ok: rate === null ? "기본 시급을 비웠어요. 일정 단가를 써요." : "기본 시급을 저장했어요." };
}

export async function restrictMember(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "제한 사유를 적어 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("restrict_member", { p_member_id: id.data, p_reason: reason });
  if (error) return { error: await actionError(error) };

  refresh(id.data);
  return { ok: "활동을 제한했어요." };
}

export async function unrestrictMember(_prev: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("unrestrict_member", { p_member_id: id.data });
  if (error) return { error: await actionError(error) };

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

export interface RevealState {
  error?: string;
  rrn?: string;
  account?: string;
}

// 주민번호·계좌번호 원문 보기. DB 함수가 열람 기록을 남긴다.
export async function revealPrivate(_prev: RevealState, formData: FormData): Promise<RevealState> {
  const id = memberId.safeParse(formData.get("memberId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_private_secrets", { p_member_ids: [id.data], p_purpose: "view" });
  if (error) return { error: await actionError(error) };
  const row = (data as { rrn_enc: string; account_enc: string }[] | null)?.[0];
  if (!row) return { error: "등록된 정산 정보가 없어요." };
  try {
    return { rrn: decryptPii(row.rrn_enc), account: decryptPii(row.account_enc) };
  } catch {
    return { error: "암호를 풀지 못했어요. 암호화 키(PII_ENCRYPTION_KEY)가 저장할 때와 같은지 확인해 주세요." };
  }
}
