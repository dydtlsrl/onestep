"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface PilotState {
  error?: string;
  ok?: string;
}

const uuid = z.guid();

// 빈칸은 null(아직 모름). 숫자는 0 이상 정수.
const optionalInt = (label: string, max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > max) {
        ctx.addIssue({ code: "custom", message: `${label}은(는) 0~${max} 사이 정수로 적어 주세요.` });
        return z.NEVER;
      }
      return n;
    });

// 기존 처리 시간은 시간 단위(0.5 단위까지)로 받아 분으로 저장한다
const hoursToMinutes = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      ctx.addIssue({ code: "custom", message: "기존 처리 시간은 0~1000시간 사이로 적어 주세요." });
      return z.NEVER;
    }
    return Math.round(n * 60);
  });

const schema = z
  .object({
    invited_count: optionalInt("초대한 인원", 1000),
    baseline_minutes: hoursToMinutes,
    target_reduction_pct: optionalInt("목표 감소율", 100),
    ceo_responses: optionalInt("대표 응답 수", 1000),
    ceo_yes: optionalInt("대표 '계속 쓰겠다'", 1000),
    member_responses: optionalInt("인력 응답 수", 1000),
    member_yes: optionalInt("인력 '계속 쓰겠다'", 1000),
    incident_privacy: optionalInt("개인정보 사고", 1000),
    incident_pay: optionalInt("잘못된 지급", 1000),
    incident_outage: optionalInt("업무 중단", 1000),
    note: z.string().trim().max(1000, "메모는 1000자까지 적을 수 있어요."),
  })
  .refine((v) => (v.ceo_yes ?? 0) <= (v.ceo_responses ?? 0) && (v.member_yes ?? 0) <= (v.member_responses ?? 0), {
    message: "'계속 쓰겠다' 응답은 전체 응답 수보다 많을 수 없어요.",
  });

const FIELDS = [
  "invited_count",
  "baseline_minutes",
  "target_reduction_pct",
  "ceo_responses",
  "ceo_yes",
  "member_responses",
  "member_yes",
  "incident_privacy",
  "incident_pay",
  "incident_outage",
  "note",
] as const;

// 시범 대상(일정·초대 링크)과 앱 밖의 값을 저장한다. DB 함수(update_setting)가 개발자인지와 값 모양을 다시 확인한다.
export async function savePilot(_prev: PilotState, formData: FormData): Promise<PilotState> {
  const parsed = schema.safeParse(Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const pick = (name: string) => [...new Set(formData.getAll(name).map(String))].filter((v) => uuid.safeParse(v).success).slice(0, 100);
  const v = parsed.data;
  const value = {
    event_ids: pick("event_ids"),
    invite_ids: pick("invite_ids"),
    invited_count: v.invited_count,
    baseline_minutes: v.baseline_minutes,
    target_reduction_pct: v.target_reduction_pct,
    ceo_responses: v.ceo_responses ?? 0,
    ceo_yes: v.ceo_yes ?? 0,
    member_responses: v.member_responses ?? 0,
    member_yes: v.member_yes ?? 0,
    incident_privacy: v.incident_privacy ?? 0,
    incident_pay: v.incident_pay ?? 0,
    incident_outage: v.incident_outage ?? 0,
    note: v.note,
  };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_setting", { p_key: "pilot", p_value: value, p_reason: "시범 운영 지표" });
  if (error) return { error: await actionError(error) };
  revalidatePath("/dev/pilot");
  return { ok: "저장했어요." };
}
