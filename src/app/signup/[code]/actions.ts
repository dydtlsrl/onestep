"use server";

import { redirect } from "next/navigation";
import { messageForError } from "@/lib/errors";
import { readSignupForm, type SignupInput } from "@/lib/signup-schema";
import { createClient } from "@/lib/supabase/server";

type FieldName = keyof SignupInput;

export interface SignupState {
  error?: string;
  fieldErrors?: Partial<Record<FieldName, string>>;
  // 오류가 났을 때 입력한 내용을 다시 채워 주기 위해 돌려준다
  values?: Partial<Record<FieldName, string>>;
}

export async function submitApplication(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const values = Object.fromEntries(
    ["name", "phone", "region", "careerYears", "careerNote", "referrerName", "privacy"].map((key) => [
      key,
      String(formData.get(key) ?? ""),
    ]),
  ) as SignupState["values"];

  const parsed = readSignupForm(formData);
  if (!parsed.success) {
    const fieldErrors: SignupState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as FieldName | undefined;
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { error: "입력한 내용을 확인해 주세요.", fieldErrors, values };
  }

  const input = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_application", {
    p_code: input.code,
    p_name: input.name,
    p_phone: input.phone,
    p_region: input.region,
    p_career_years: input.careerYears,
    p_career_note: input.careerNote,
    p_referrer_name: input.referrerName,
    p_privacy_agreed: true,
  });

  if (error) return { error: messageForError(error), values };

  redirect("/pending");
}
