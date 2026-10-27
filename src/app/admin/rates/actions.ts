"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export interface RateState {
  error?: string;
  ok?: string;
}

const roleSchema = z.object({
  name: z.string().trim().min(1, "역할 이름을 적어 주세요.").max(30, "역할 이름은 30자까지 쓸 수 있어요."),
  defaultRate: z.coerce
    .number({ error: "단가는 숫자로 적어 주세요." })
    .int("단가는 원 단위 숫자로 적어 주세요.")
    .min(0, "0원 이상으로 적어 주세요.")
    .max(10_000_000, "1,000만 원 이하로 적어 주세요."),
  description: z.string().trim().max(200, "설명은 200자까지 쓸 수 있어요."),
  sortOrder: z.coerce.number({ error: "순서는 숫자로 적어 주세요." }).int().min(0).max(999),
});

function readRole(formData: FormData) {
  return roleSchema.safeParse({
    name: formData.get("name") ?? "",
    // "130,000"처럼 쉼표를 넣어도 되게 숫자만 남긴다
    defaultRate: String(formData.get("defaultRate") ?? "").replace(/[^0-9]/g, "") || "x",
    description: formData.get("description") ?? "",
    sortOrder: formData.get("sortOrder") || "0",
  });
}

function saveError(error: { code?: string }): string {
  if (error.code === "23505") return "같은 이름의 역할이 이미 있어요.";
  return "저장하지 못했어요. 대표 계정으로 로그인했는지 확인해 주세요.";
}

// 단가표 수정은 DB 권한 규칙(RLS)이 대표만 허용한다

export async function createRole(_prev: RateState, formData: FormData): Promise<RateState> {
  const parsed = readRole(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("job_roles").insert({
    name: parsed.data.name,
    default_rate: parsed.data.defaultRate,
    description: parsed.data.description,
    sort_order: parsed.data.sortOrder,
  });
  if (error) return { error: saveError(error) };

  revalidatePath("/admin/rates");
  return { ok: `${parsed.data.name} 역할을 추가했어요.` };
}

export async function updateRole(_prev: RateState, formData: FormData): Promise<RateState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = readRole(formData);
  if (!id.success) return { error: "잘못된 요청이에요." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_roles")
    .update({
      name: parsed.data.name,
      default_rate: parsed.data.defaultRate,
      description: parsed.data.description,
      sort_order: parsed.data.sortOrder,
    })
    .eq("id", id.data);
  if (error) return { error: saveError(error) };

  revalidatePath("/admin/rates");
  return { ok: "저장했어요." };
}

export async function setRoleActive(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  await supabase.from("job_roles").update({ is_active: active }).eq("id", id.data);
  revalidatePath("/admin/rates");
}
