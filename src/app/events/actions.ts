"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { createClient } from "@/lib/supabase/server";

export interface ApplyState {
  error?: string;
  ok?: string;
}

// 신청과 취소는 DB 함수가 회원 상태, 공개 범위, 마감 시각을 다시 확인한다

function refresh(eventId: string) {
  revalidatePath("/");
  revalidatePath(`/events/${eventId}`);
}

export async function applyToEvent(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const dayIds = z.array(z.uuid()).min(1).max(31).safeParse(formData.getAll("dayId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  if (!dayIds.success) return { error: "참여할 날짜를 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_to_event", { p_event_id: eventId.data, p_day_ids: dayIds.data });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return { ok: "신청했어요. 선발 결과는 알림으로 알려 드려요." };
}

export async function cancelMyApplication(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_application", { p_event_id: eventId.data, p_reason: reason });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return { ok: "신청을 취소했어요." };
}
