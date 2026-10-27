"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { messageForError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface RateState {
  error?: string;
  ok?: string;
}

const digitsOnly = (value: FormDataEntryValue | null) => String(value ?? "").replace(/[^0-9]/g, "");

const roleSchema = z
  .object({
    name: z.string().trim().min(1, "이름을 적어 주세요.").max(30, "이름은 30자까지 쓸 수 있어요."),
    payType: z.enum(["hourly", "daily"], { error: "지급 방식을 골라 주세요." }),
    defaultRate: z.coerce
      .number({ error: "단가는 숫자로 적어 주세요." })
      .int("단가는 원 단위 숫자로 적어 주세요.")
      .min(0, "0원 이상으로 적어 주세요.")
      .max(10_000_000, "1,000만 원 이하로 적어 주세요."),
    minPaidHours: z.union([
      z.literal(""),
      z.coerce.number({ error: "최소 보장 시간은 숫자로 적어 주세요." }).min(0).max(24, "24시간 이하로 적어 주세요."),
    ]),
    overtimeRate: z.union([
      z.literal(""),
      z.coerce.number({ error: "초과 금액은 숫자로 적어 주세요." }).int().min(0).max(10_000_000),
    ]),
    description: z.string().trim().max(200, "설명은 200자까지 쓸 수 있어요."),
    sortOrder: z.coerce.number({ error: "순서는 숫자로 적어 주세요." }).int().min(0).max(999),
  })
  .transform((v) => ({
    name: v.name,
    pay_type: v.payType,
    default_rate: v.defaultRate,
    // 시급은 최소 보장 시간만, 일급은 초과 1시간당 금액만 쓴다
    min_paid_hours: v.payType === "hourly" && v.minPaidHours !== "" ? Math.round(v.minPaidHours * 10) / 10 : null,
    overtime_rate: v.payType === "daily" && v.overtimeRate !== "" ? v.overtimeRate : null,
    description: v.description,
    sort_order: v.sortOrder,
  }));

function readRole(formData: FormData) {
  return roleSchema.safeParse({
    name: formData.get("name") ?? "",
    payType: formData.get("payType"),
    // "130,000"처럼 쉼표를 넣어도 되게 숫자만 남긴다
    defaultRate: digitsOnly(formData.get("defaultRate")) || "x",
    minPaidHours: String(formData.get("minPaidHours") ?? "").trim(),
    overtimeRate: digitsOnly(formData.get("overtimeRate")),
    description: formData.get("description") ?? "",
    sortOrder: formData.get("sortOrder") || "0",
  });
}

function saveError(error: { code?: string }): string {
  if (error.code === "23505") return "같은 이름의 단가가 이미 있어요.";
  return "저장하지 못했어요. 대표 계정으로 로그인했는지 확인해 주세요.";
}

// 단가표 수정은 DB 권한 규칙(RLS)이 대표만 허용한다

export async function createRole(_prev: RateState, formData: FormData): Promise<RateState> {
  const parsed = readRole(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("job_roles").insert(parsed.data);
  if (error) return { error: saveError(error) };

  revalidatePath("/admin/rates");
  return { ok: `${parsed.data.name} 단가를 추가했어요.` };
}

export async function updateRole(_prev: RateState, formData: FormData): Promise<RateState> {
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = readRole(formData);
  if (!id.success) return { error: "잘못된 요청이에요." };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("job_roles").update(parsed.data).eq("id", id.data);
  if (error) return { error: saveError(error) };

  revalidatePath("/admin/rates");
  return { ok: "저장했어요." };
}

export async function setRoleActive(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const active = formData.get("active") === "true";

  const supabase = await createClient();
  // 숨기면 세팅일·진행일 기본 표시도 함께 뗀다
  await supabase.from("job_roles").update(active ? { is_active: true } : { is_active: false, default_for: null }).eq("id", id.data);
  revalidatePath("/admin/rates");
  revalidatePath("/admin/events/new");
}

// 세팅일 기본·진행일 기본으로 정하거나 뗀다 (종류마다 하나)
export async function setRateDefault(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("id"));
  const kind = z.enum(["setup", "main"]).safeParse(formData.get("kind"));
  if (!id.success || !kind.success) return;
  const on = formData.get("on") === "true";

  const supabase = await createClient();
  await supabase.from("job_roles").update({ default_for: null }).eq("default_for", kind.data);
  if (on) await supabase.from("job_roles").update({ default_for: kind.data }).eq("id", id.data).eq("is_active", true);
  revalidatePath("/admin/rates");
  revalidatePath("/admin/events/new");
}

const rulesSchema = z.object({
  multiplier: z.coerce.number({ error: "배율은 숫자로 적어 주세요." }).min(1, "1배 이상으로 적어 주세요.").max(3, "3배 이하로 적어 주세요."),
  unitMinutes: z.coerce.number().refine((v) => [10, 15, 30, 60].includes(v), "계산 단위를 골라 주세요."),
  rounding: z.enum(["floor", "ceil", "round"], { error: "단위 미만 처리를 골라 주세요." }),
  minHours: z.coerce.number({ error: "최소 보장 시간은 숫자로 적어 주세요." }).min(0).max(12, "12시간 이하로 적어 주세요."),
  hourlyRate: z.coerce.number({ error: "기본 시급은 숫자로 적어 주세요." }).int().min(0).max(1_000_000, "기본 시급이 너무 커요."),
  reason: z.string().trim().max(200, "변경 사유는 200자까지 쓸 수 있어요."),
});

// 공통 계산 규칙 저장. DB 함수가 대표인지 확인하고, 버전을 올리고, 이력을 남긴다.
export async function updatePayRules(_prev: RateState, formData: FormData): Promise<RateState> {
  const parsed = rulesSchema.safeParse({
    multiplier: formData.get("multiplier"),
    unitMinutes: formData.get("unitMinutes"),
    rounding: formData.get("rounding"),
    minHours: formData.get("minHours") || "0",
    hourlyRate: String(formData.get("hourlyRate") ?? "").replace(/[^0-9]/g, "") || "11000",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력한 내용을 확인해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_pay_rules", {
    p_overtime_multiplier: parsed.data.multiplier,
    p_overtime_unit_minutes: parsed.data.unitMinutes,
    p_overtime_rounding: parsed.data.rounding,
    p_default_min_paid_hours: parsed.data.minHours,
    p_reason: parsed.data.reason,
    p_default_hourly_rate: parsed.data.hourlyRate,
  });
  if (error) return { error: messageForError(error) };

  revalidatePath("/admin/rates");
  return { ok: "계산 규칙을 저장했어요." };
}
