"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionError } from "@/lib/error-log";
import { firstIssueMessage, readEventForm, toEventRpcArgs } from "@/lib/event-form";
import { createClient } from "@/lib/supabase/server";

export interface EventActionState {
  error?: string;
  ok?: string;
}

// 아래 기능은 모두 DB 함수가 대표인지 다시 확인한다

function refresh(eventId?: string) {
  revalidatePath("/admin/events");
  if (eventId) revalidatePath(`/admin/events/${eventId}`);
}

export async function createEvent(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const parsed = readEventForm(formData);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  const args = toEventRpcArgs(parsed.data);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_event", {
    p_event: args.event,
    p_days: args.days,
    p_extras: args.extras,
    p_client_name: args.clientName,
    p_internal_memo: args.memo,
  });
  if (error || typeof data !== "string") return { error: await actionError(error) };

  refresh();
  redirect(`/admin/events/${data}`);
}

export async function updateEvent(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const id = z.uuid().safeParse(formData.get("eventId"));
  if (!id.success) return { error: "잘못된 요청이에요." };
  const parsed = readEventForm(formData);
  if (!parsed.success) return { error: firstIssueMessage(parsed.error) };
  const args = toEventRpcArgs(parsed.data);

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_event", {
    p_event_id: id.data,
    p_event: args.event,
    p_days: args.days,
    p_extras: args.extras,
    p_client_name: args.clientName,
    p_internal_memo: args.memo,
  });
  if (error) return { error: await actionError(error) };

  refresh(id.data);
  return { ok: "일정을 저장했어요." };
}

const statusSchema = z.enum(["open_core", "open_all", "closed", "completed", "cancelled"]);

export async function changeEventStatus(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const id = z.uuid().safeParse(formData.get("eventId"));
  const status = statusSchema.safeParse(formData.get("status"));
  if (!id.success || !status.success) return { error: "잘못된 요청이에요." };
  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_event_status", { p_event_id: id.data, p_status: status.data, p_reason: reason });
  if (error) return { error: await actionError(error) };

  refresh(id.data);
  return {};
}

export async function decideApplications(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const ids = z.array(z.uuid()).min(1).safeParse(String(formData.get("ids") ?? "").split(",").filter(Boolean));
  const status = z.enum(["applied", "waitlisted", "selected", "rejected"]).safeParse(formData.get("status"));
  if (!eventId.success || !ids.success || !status.success) return { error: "처리할 신청을 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_applications", { p_application_ids: ids.data, p_status: status.data });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return {};
}

export async function addMemberToEvent(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const dayId = z.uuid().safeParse(formData.get("dayId"));
  const memberId = z.uuid().safeParse(formData.get("memberId"));
  if (!eventId.success || !dayId.success || !memberId.success) return { error: "회원과 날짜를 골라 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_member_to_event", {
    p_event_id: eventId.data,
    p_day_id: dayId.data,
    p_member_id: memberId.data,
  });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return { ok: "확정자로 넣었어요. 선발 결과 알림을 보내면 그 회원에게도 알림이 가요." };
}

// 신청자의 역할 이름과 "이 사람만 다른 단가"를 저장한다 (둘 다 비워도 된다)
export async function saveApplicationDetail(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  const appId = z.uuid().safeParse(formData.get("applicationId"));
  const roleName = z.string().trim().max(30, "역할 이름은 30자까지예요.").safeParse(String(formData.get("roleName") ?? ""));
  const rawRate = String(formData.get("rateOverride") ?? "").replace(/[^0-9]/g, "");
  const rate = rawRate === "" ? null : Number(rawRate);
  if (!eventId.success || !appId.success) return { error: "잘못된 요청이에요." };
  if (!roleName.success) return { error: roleName.error.issues[0]?.message ?? "역할 이름을 확인해 주세요." };
  if (rate !== null && rate > 10_000_000) return { error: "단가가 너무 커요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_application_detail", {
    p_application_id: appId.data,
    p_role_name: roleName.data,
    p_rate_override: rate,
  });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return { ok: "저장했어요." };
}

export async function notifyResults(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("notify_selection_results", { p_event_id: eventId.data });
  if (error) return { error: await actionError(error) };

  refresh(eventId.data);
  return { ok: data ? `${data}명에게 알림을 보냈어요.` : "새로 알릴 사람이 없어요." };
}

const attendanceRowSchema = z.object({
  applicationId: z.uuid(),
  attendance: z.enum(["unknown", "attended", "late", "no_show"]),
  overtimeMinutes: z.number().int().min(0, "초과 시간은 0~1440분으로 적어 주세요.").max(1440, "초과 시간은 0~1440분으로 적어 주세요."),
});

// 한 날짜의 출석을 한 번에 저장한다 (현장에서 휴대폰으로 "모두 참석" → 노쇼만 바꾸고 저장)
export async function saveAttendanceBatch(_prev: EventActionState, formData: FormData): Promise<EventActionState> {
  const eventId = z.uuid().safeParse(formData.get("eventId"));
  if (!eventId.success) return { error: "잘못된 요청이에요." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rows") ?? "[]"));
  } catch {
    return { error: "잘못된 요청이에요." };
  }
  const rows = z.array(attendanceRowSchema).min(1, "바꾼 사람이 없어요.").max(500).safeParse(raw);
  if (!rows.success) return { error: rows.error.issues[0]?.message ?? "입력한 내용을 다시 확인해 주세요." };

  const supabase = await createClient();
  let done = 0;
  for (const row of rows.data) {
    const { error } = await supabase.rpc("set_attendance", {
      p_application_id: row.applicationId,
      p_attendance: row.attendance,
      p_overtime_minutes: row.attendance === "attended" || row.attendance === "late" ? row.overtimeMinutes : 0,
    });
    if (error) {
      refresh(eventId.data);
      return { error: `${done}명 저장한 뒤 멈췄어요: ${await actionError(error)}` };
    }
    done += 1;
  }
  refresh(eventId.data);
  return { ok: `${done}명 저장했어요.` };
}
