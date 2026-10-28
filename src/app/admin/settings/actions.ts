"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface SettingState {
  error?: string;
  ok?: string;
}

// DB 함수(update_setting)가 대표인지, 값 모양이 맞는지 다시 확인하고 이력을 남긴다

async function save(key: string, value: Record<string, unknown>, reason: string): Promise<SettingState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_setting", { p_key: key, p_value: value, p_reason: reason });
  if (error) return { error: await actionError(error) };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/events", "layout");
  return { ok: "저장했어요." };
}

const text = (max: number) => z.string().trim().max(max, `${max}자까지 적을 수 있어요.`);

export async function saveCompany(_prev: SettingState, formData: FormData): Promise<SettingState> {
  const parsed = z
    .object({ name: text(200).min(1, "회사 이름을 적어 주세요."), ceo: text(200), biz_no: text(200), address: text(200), phone: text(200) })
    .safeParse(Object.fromEntries(["name", "ceo", "biz_no", "address", "phone"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  return save("company", parsed.data, "회사 정보");
}

export async function saveContractSetting(_prev: SettingState, formData: FormData): Promise<SettingState> {
  const display = formData.get("rrn_display") === "full" ? "full" : "masked";
  return save("contract", { rrn_display: display }, "계약서 주민번호 표시");
}

export async function saveTax(_prev: SettingState, formData: FormData): Promise<SettingState> {
  const type = z.enum(["unset", "other", "business", "none"]).safeParse(formData.get("type"));
  if (!type.success) return { error: "세금 처리 방식을 골라 주세요." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
  return save("tax", { type: type.data, threshold: formData.get("threshold") === "on", include_extras: formData.get("include_extras") === "on" }, reason);
}
