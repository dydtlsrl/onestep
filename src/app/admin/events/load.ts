// 일정 폼에 필요한 단가표와 계산 규칙을 불러온다
import type { requireAdmin } from "@/lib/auth";
import { parsePayRules } from "@/lib/pay";
import type { RoleOption } from "./event-form-values";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export async function loadRolesAndRules(supabase: Supabase) {
  const [{ data: roles }, { data: setting }] = await Promise.all([
    supabase
      .from("job_roles")
      .select("id, name, pay_type, default_rate, min_paid_hours, overtime_rate")
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
