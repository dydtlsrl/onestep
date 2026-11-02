// 일정 하나의 계약·정산에 필요한 값을 한 번에 불러와 사람별로 묶는다. 서버에서만 쓴다.
import "server-only";
import { parseCompany, parseRrnDisplay, type ContractTerms } from "@/lib/contract";
import {
  DAY_COLUMNS,
  EVENT_COLUMNS,
  EXTRA_COLUMNS,
  dayLabel,
  extrasForTier,
  formatTime,
  paidMinutes,
  suggestPayDate,
  type Attendance,
  type DayRow,
  type EventRow,
  type ExtraRuleRow,
} from "@/lib/events";
import { calculatePay, parsePayRules } from "@/lib/pay";
import { formatPhone } from "@/lib/phone";
import { buildPaymentItems, describeWork, rateFor, type BuildResult, type SelectedDay } from "@/lib/settlement";
import type { createClient } from "@/lib/supabase/server";
import { calculateTax, parseTaxSettings, type TaxResult, type TaxSettings } from "@/lib/tax";
import type { MemberTier } from "@/lib/tier";

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface SelectedApp {
  member_id: string;
  day_id: string;
  attendance: Attendance;
  overtime_minutes: number;
  role_name: string;
  rate_override: number | null;
  member: { name: string; phone: string; tier: MemberTier; default_rate: number | null } | null;
}

export interface MemberSettlement {
  memberId: string;
  name: string;
  phone: string;
  tier: MemberTier;
  days: SelectedDay[];
  actual: BuildResult;
  tax: TaxResult;
}

export async function loadSettlement(supabase: Supabase, eventId: string) {
  const [{ data: event }, { data: days }, { data: extras }, { data: apps }, { data: settings }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle<EventRow>(),
    supabase.from("event_days").select(DAY_COLUMNS).eq("event_id", eventId).returns<DayRow[]>(),
    supabase.from("event_extra_rules").select(EXTRA_COLUMNS).eq("event_id", eventId).returns<ExtraRuleRow[]>(),
    supabase
      .from("applications")
      .select("member_id, day_id, attendance, overtime_minutes, role_name, rate_override, member:profiles!applications_member_id_fkey(name, phone, tier, default_rate)")
      .eq("event_id", eventId)
      .eq("status", "selected")
      .returns<SelectedApp[]>(),
    supabase.from("app_settings").select("key, value").in("key", ["pay_rules", "tax", "company", "contract"]).returns<{ key: string; value: unknown }[]>(),
  ]);
  if (!event) return null;

  const setting = (key: string) => (settings ?? []).find((s) => s.key === key)?.value;
  const rules = parsePayRules(setting("pay_rules"));
  const tax: TaxSettings = parseTaxSettings(setting("tax"));
  const dayById = new Map((days ?? []).map((d) => [d.id, d]));

  const byMember = new Map<string, { app: SelectedApp; days: SelectedDay[] }>();
  for (const a of apps ?? []) {
    const day = dayById.get(a.day_id);
    if (!day) continue;
    const entry = byMember.get(a.member_id) ?? { app: a, days: [] };
    entry.days.push({ day, attendance: a.attendance, overtimeMinutes: a.overtime_minutes, roleName: a.role_name, rateOverride: a.rate_override });
    byMember.set(a.member_id, entry);
  }

  const members: MemberSettlement[] = [...byMember.entries()]
    .map(([memberId, { app, days: selected }]) => {
      const tier = app.member?.tier ?? "general";
      const actual = buildPaymentItems(selected, app.member?.default_rate ?? null, extrasForTier(extras ?? [], tier), rules);
      return {
        memberId,
        name: app.member?.name ?? "(알 수 없음)",
        phone: app.member?.phone ?? "",
        tier,
        days: selected,
        actual,
        tax: calculateTax(actual.workAmount, actual.extraAmount, tax),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  const payDate = event.pay_date ?? suggestPayDate(event.end_date);
  return {
    event,
    members,
    rules,
    tax,
    payDate,
    extras: extras ?? [],
    company: parseCompany(setting("company")),
    rrnDisplay: parseRrnDisplay(setting("contract")),
    memberDefaultRate: (memberId: string) => byMember.get(memberId)?.app.member?.default_rate ?? null,
  };
}

export type Settlement = NonNullable<Awaited<ReturnType<typeof loadSettlement>>>;

// 계약서에 복사해 둘 내용. 계약서는 일정이 끝난 뒤 보내므로 정산과 같은 출석 기록 기준이다 (결정 #34·#35).
// 참석·지각한 날, 휴게시간을 뺀 근무 시간, 초과 근무, 교통비·지방비를 모두 넣는다.
export function contractTerms(s: Settlement, m: MemberSettlement): ContractTerms {
  const memberDefault = s.memberDefaultRate(m.memberId);
  const worked = m.days
    .filter((d) => d.attendance === "attended" || d.attendance === "late")
    .sort((a, b) => a.day.day_date.localeCompare(b.day.day_date) || a.day.start_time.localeCompare(b.day.start_time));
  const days = worked.map((d) => {
    const rate = rateFor(d.day, memberDefault, d.rateOverride);
    const pay = calculatePay(rate, s.rules, { scheduledMinutes: paidMinutes(d.day), overtimeMinutes: d.overtimeMinutes });
    const overtime = pay.overtimePay > 0 ? ` + 초과 ${Number(pay.overtimeHours.toFixed(2))}시간` : "";
    return {
      label: dayLabel(d.day),
      time: `${formatTime(d.day.start_time)}–${formatTime(d.day.end_time)}${d.day.break_minutes > 0 ? ` (휴게 ${d.day.break_minutes}분)` : ""}`,
      role: d.roleName,
      pay: describeWork(rate, pay.regularHours) + overtime,
      amount: pay.total,
    };
  });
  return {
    kind: "employment",
    period: worked.length > 0 ? { start: worked[0].day.day_date, end: worked[worked.length - 1].day.day_date } : null,
    company: s.company,
    member: { name: m.name, phone: formatPhone(m.phone) },
    event: { title: s.event.title, location: s.event.location_name, address: s.event.address },
    days,
    extras: m.actual.items.filter((i) => i.kind !== "work" && i.kind !== "overtime").map((i) => ({ label: i.label, amount: i.amount })),
    total: m.actual.workAmount + m.actual.extraAmount,
    pay_date: s.payDate,
    rrn_display: s.rrnDisplay,
  };
}
