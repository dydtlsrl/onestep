// 일정 폼에 필요한 단가표와 계산 규칙을 불러온다
import type { requireAdmin } from "@/lib/auth";
import { DAY_COLUMNS, EVENT_COLUMNS, EXTRA_COLUMNS, type DayRow, type EventRow, type ExtraRuleRow } from "@/lib/events";
import { parsePayRules } from "@/lib/pay";
import type { RoleOption, SavedEvent } from "./event-form-values";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export async function loadRolesAndRules(supabase: Supabase) {
  const [{ data: roles }, { data: setting }] = await Promise.all([
    supabase
      .from("job_roles")
      .select("id, name, pay_type, default_rate, min_paid_hours, overtime_rate, default_for")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .returns<RoleOption[]>(),
    supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>(),
  ]);
  return {
    roles: (roles ?? []).map((r) => ({ ...r, min_paid_hours: r.min_paid_hours === null ? null : Number(r.min_paid_hours) })),
    rules: parsePayRules(setting?.value),
  };
}

// 복사할 일정 하나 (내용·날짜·추가 지급). 없으면 null
export async function loadSavedEvent(supabase: Supabase, id: string): Promise<SavedEvent | null> {
  const [{ data: event }, { data: internal }, { data: chat }, { data: days }, { data: extras }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<EventRow>(),
    supabase.from("event_internal").select("client_name, memo").eq("event_id", id).maybeSingle<{ client_name: string; memo: string }>(),
    supabase.from("event_chat_links").select("chat_link").eq("event_id", id).maybeSingle<{ chat_link: string }>(),
    supabase.from("event_days").select(DAY_COLUMNS).eq("event_id", id).order("day_date").order("start_time").returns<DayRow[]>(),
    supabase.from("event_extra_rules").select(EXTRA_COLUMNS).eq("event_id", id).returns<ExtraRuleRow[]>(),
  ]);
  if (!event) return null;
  return { event, internal, chatLink: chat?.chat_link ?? "", days: days ?? [], extras: extras ?? [] };
}
