import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin, TIER_LABEL, type MemberTier } from "@/lib/auth";
import {
  DAY_COLUMNS,
  EVENT_COLUMNS,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  EXTRA_COLUMNS,
  dailyExtras,
  dayLabel,
  describeExtras,
  extrasForTier,
  extrasTotal,
  formatEventRange,
  formatTime,
  scheduledMinutes,
  toRoleRate,
  type ApplicationStatus,
  type Attendance,
  type DayRow,
  type EventRow,
  type ExtraRuleRow,
} from "@/lib/events";
import { formatDate, formatDateTime, formatWon } from "@/lib/format";
import { calculatePay, effectiveRate, PAY_TYPE_LABEL, parsePayRules, type PayRules, type RoleRate } from "@/lib/pay";
import { STATUS_BADGE } from "../badges";
import { EventForm } from "../event-form";
import { eventToFormValues, type SavedEvent } from "../event-form-values";
import { loadRolesAndRules } from "../load";
import { loadSettlement } from "@/lib/settlement-load";
import { AttendanceBoard, type AttendanceDay, type PersonTotal } from "./attendance-board";
import { ContractBoard, type ContractRow } from "./contract-board";
import { PaymentBoard, type PaymentRow, type SavedPayment } from "./payment-board";
import { SelectionBoard, type ApplicantRow, type DayOption, type MemberOption } from "./selection-board";
import { StatusActions } from "./status-actions";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
type Tab = "applicants" | "attendance" | "contracts" | "payments" | "info";

interface InternalRow {
  client_name: string;
  memo: string;
}

interface AppRow {
  id: string;
  member_id: string;
  day_id: string;
  status: ApplicationStatus;
  added_by_admin: boolean;
  attendance: Attendance;
  overtime_minutes: number;
  applied_at: string;
  notified_status: ApplicationStatus | null;
  role_name: string;
  rate_override: number | null;
  member: { name: string; tier: MemberTier; default_rate: number | null } | null;
}

// 신청자가 많을 때 주소가 너무 길어지지 않게 나눠서 불러온다
function chunk<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const rateLabel = (r: RoleRate) => `${PAY_TYPE_LABEL[r.payType]} ${formatWon(r.rate)}`;

// 이 신청에 적용되는 단가와, 기본과 다르면 그 이유
function applicationRate(a: AppRow, day: DayRow | undefined): { rate: RoleRate; text: string } {
  const base = toRoleRate(day ?? { pay_type: "hourly", rate: 0, min_paid_hours: null, overtime_rate: null });
  const rate = effectiveRate(base, a.member?.default_rate ?? null, a.rate_override);
  const reason = a.rate_override !== null ? " · 이 일정만" : rate.rate !== base.rate ? " · 회원 기본" : "";
  return { rate, text: `${rateLabel(rate)}${reason}` };
}

async function loadEvent(supabase: Supabase, id: string) {
  const [{ data: event }, { data: internal }, { data: chat }, { data: days }, { data: extras }, { data: apps }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<EventRow>(),
    supabase.from("event_internal").select("client_name, memo").eq("event_id", id).maybeSingle<InternalRow>(),
    supabase.from("event_chat_links").select("chat_link").eq("event_id", id).maybeSingle<{ chat_link: string }>(),
    supabase.from("event_days").select(DAY_COLUMNS).eq("event_id", id).order("day_date").order("start_time").returns<DayRow[]>(),
    supabase.from("event_extra_rules").select(EXTRA_COLUMNS).eq("event_id", id).returns<ExtraRuleRow[]>(),
    supabase
      .from("applications")
      .select(
        "id, member_id, day_id, status, added_by_admin, attendance, overtime_minutes, applied_at, notified_status, role_name, rate_override, member:profiles!applications_member_id_fkey(name, tier, default_rate)",
      )
      .eq("event_id", id)
      .order("applied_at")
      .returns<AppRow[]>(),
  ]);
  return {
    event,
    internal,
    chatLink: chat?.chat_link ?? "",
    days: days ?? [],
    extras: extras ?? [],
    apps: apps ?? [],
  };
}

// 신청자 표에 붙일 참여 횟수, 노쇼·지각 횟수, 가장 최근 관리자 기록
async function loadMemberHistory(supabase: Supabase, memberIds: string[]) {
  const [{ data: participation }, { data: counts }, noteParts] = await Promise.all([
    supabase.from("member_participation").select("member_id, attended_count").returns<{ member_id: string; attended_count: number }[]>(),
    supabase.from("member_note_counts").select("member_id, no_show_count, late_count").returns<{ member_id: string; no_show_count: number; late_count: number }[]>(),
    Promise.all(
      chunk(memberIds).map((ids) =>
        supabase
          .from("member_notes")
          .select("member_id, content")
          .in("member_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000)
          .returns<{ member_id: string; content: string }[]>(),
      ),
    ),
  ]);
  const lastNote = new Map<string, string>();
  for (const part of noteParts) for (const n of part.data ?? []) if (!lastNote.has(n.member_id)) lastNote.set(n.member_id, n.content);
  return {
    participation: new Map((participation ?? []).map((p) => [p.member_id, Number(p.attended_count)])),
    counts: new Map((counts ?? []).map((c) => [c.member_id, c])),
    lastNote,
  };
}

async function loadActiveMembers(supabase: Supabase, selectedHere: Set<string>): Promise<MemberOption[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, phone, tier")
    .eq("status", "active")
    .eq("role", "member")
    .order("name")
    .returns<{ id: string; name: string; phone: string; tier: MemberTier }[]>();
  return (data ?? [])
    .map((m) => ({ id: m.id, label: `${m.name} · ${TIER_LABEL[m.tier]} · ${m.phone.slice(-4)}`, selectedHere: selectedHere.has(m.id) }))
    .sort((a, b) => Number(b.selectedHere) - Number(a.selectedHere));
}

// 역할 이름 입력칸에 보여 줄 추천 (단가표의 역할 이름)
async function loadRoleNames(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase.from("job_roles").select("name").eq("is_active", true).order("sort_order").returns<{ name: string }[]>();
  return (data ?? []).map((r) => r.name);
}

type EventData = SavedEvent;

// 저장된 출석으로 사람별 보수·추가 지급 합계를 낸다
function personTotals(apps: AppRow[], days: DayRow[], extras: ExtraRuleRow[], rules: PayRules): PersonTotal[] {
  const dayById = new Map(days.map((d) => [d.id, d]));
  const byMember = new Map<string, PersonTotal>();
  for (const a of apps) {
    if (a.status !== "selected") continue;
    const tier = a.member?.tier ?? "general";
    const total = byMember.get(a.member_id) ?? { memberId: a.member_id, name: a.member?.name ?? "(알 수 없음)", tier, workedDays: 0, totalDays: 0, pay: 0, extras: 0 };
    total.totalDays += 1;
    const day = dayById.get(a.day_id);
    if ((a.attendance === "attended" || a.attendance === "late") && day) {
      total.workedDays += 1;
      total.pay += calculatePay(applicationRate(a, day).rate, rules, {
        scheduledMinutes: scheduledMinutes(day.start_time, day.end_time),
        overtimeMinutes: a.overtime_minutes,
      }).total;
    }
    byMember.set(a.member_id, total);
  }
  return [...byMember.values()]
    .map((t) => ({ ...t, extras: extrasTotal(extrasForTier(extras, t.tier), t.workedDays) }))
    .sort((x, y) => x.name.localeCompare(y.name, "ko"));
}

interface ContractDbRow {
  id: string;
  member_id: string;
  status: "requested" | "signed" | "voided";
  requested_at: string;
  signed_at: string | null;
}

interface PaymentDbRow {
  member_id: string;
  status: SavedPayment["status"];
  pay_date: string;
  gross: number;
  income_tax: number;
  local_tax: number;
  net: number;
  edited: boolean;
  memo: string;
  held_reason: string;
  payment_items: { kind: PaymentRow["computed"]["items"][number]["kind"]; label: string; amount: number; day_id: string | null; sort_order: number }[];
}

// "계약"·"정산" 탭: 확정자별 계약 현황과 정산
async function settleTab(supabase: Supabase, event: EventRow, tab: "contracts" | "payments") {
  // 계약·정산 목록은 확정자 계산과 같이 불러 DB를 오가는 횟수를 줄인다 (.then으로 바로 요청을 보낸다)
  const contractsQuery =
    tab === "contracts"
      ? supabase.from("contracts").select("id, member_id, status, requested_at, signed_at").eq("event_id", event.id).order("requested_at").returns<ContractDbRow[]>().then((r) => r)
      : null;
  const paymentsQuery =
    tab === "payments"
      ? supabase
          .from("payments")
          .select("member_id, status, pay_date, gross, income_tax, local_tax, net, edited, memo, held_reason, payment_items(kind, label, amount, day_id, sort_order)")
          .eq("event_id", event.id)
          .returns<PaymentDbRow[]>()
          .then((r) => r)
      : null;
  const s = await loadSettlement(supabase, event.id);
  const memberIds = s?.members.map((m) => m.memberId) ?? [];
  const { data: privRows } = memberIds.length
    ? await supabase.from("member_private").select("member_id").in("member_id", memberIds).returns<{ member_id: string }[]>()
    : { data: [] };
  const hasPrivate = new Set((privRows ?? []).map((p) => p.member_id));
  const canAct = event.status !== "draft" && event.status !== "cancelled";

  if (tab === "contracts") {
    const { data } = await contractsQuery!;
    // 사람마다 가장 최근 계약서 (무효가 아닌 것이 있으면 그것)
    const latest = new Map<string, ContractDbRow>();
    for (const c of data ?? []) {
      const prev = latest.get(c.member_id);
      if (!prev || prev.status === "voided") latest.set(c.member_id, c);
    }
    const rows: ContractRow[] = (s?.members ?? []).map((m) => {
      const c = latest.get(m.memberId);
      return {
        memberId: m.memberId,
        name: m.name,
        hasPrivate: hasPrivate.has(m.memberId),
        contract: c ? { id: c.id, status: c.status, requestedAt: c.requested_at, signedAt: c.signed_at } : null,
      };
    });
    return <ContractBoard eventId={event.id} rows={rows} canSend={canAct} />;
  }

  const { data } = await paymentsQuery!;
  const saved = new Map((data ?? []).map((p) => [p.member_id, p]));
  const rows: PaymentRow[] = (s?.members ?? []).map((m) => {
    const p = saved.get(m.memberId);
    return {
      memberId: m.memberId,
      name: m.name,
      hasPrivate: hasPrivate.has(m.memberId),
      computed: {
        items: m.actual.items,
        gross: m.actual.workAmount + m.actual.extraAmount,
        unknownDays: m.actual.unknownDays,
        missingOvertimeRate: m.actual.missingOvertimeRate,
      },
      saved: p
        ? {
            status: p.status,
            payDate: p.pay_date,
            gross: p.gross,
            incomeTax: p.income_tax,
            localTax: p.local_tax,
            net: p.net,
            edited: p.edited,
            memo: p.memo,
            heldReason: p.held_reason,
            items: [...p.payment_items].sort((a, b) => a.sort_order - b.sort_order).map(({ kind, label, amount, day_id }) => ({ kind, label, amount, day_id })),
          }
        : null,
    };
  });
  return <PaymentBoard eventId={event.id} rows={rows} tax={s?.tax ?? { type: "unset", threshold: true, includeExtras: true }} defaultPayDate={s?.payDate ?? event.end_date} canSettle={canAct} />;
}

function InfoRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-[#eef0f3] py-2.5 last:border-0">
      <dt className="w-28 shrink-0 text-sm text-muted">{term}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-sm">{children}</dd>
    </div>
  );
}

// 완료·취소된 일정은 고칠 수 없으니 읽기 전용으로 보여 준다
function EventSummary({ event, internal, chatLink, days, extras }: EventData) {
  const core = extrasForTier(extras, "core");
  const general = extrasForTier(extras, "general");
  const multiDay = days.length > 1;
  return (
    <section className="rounded-xl border border-line bg-white px-5 py-2">
      <dl>
        <InfoRow term="장소">{[event.location_name, event.address].filter(Boolean).join(" · ") || "—"}</InfoRow>
        {days.map((d) => (
          <InfoRow key={d.id} term={dayLabel(d)}>
            {`${formatTime(d.start_time)}–${formatTime(d.end_time)} · ${d.headcount}명 · ${rateLabel(toRoleRate(d))}`}
          </InfoRow>
        ))}
        <InfoRow term="추가 지급">
          {core.length + general.length > 0 ? `핵심: ${describeExtras(core, multiDay) || "없음"}\n일반: ${describeExtras(general, multiDay) || "없음"}` : "없음"}
        </InfoRow>
        {multiDay && <InfoRow term="참여 방식">{event.all_days_required ? "모든 날짜 참여 필수" : "날짜를 골라 신청"}</InfoRow>}
        <InfoRow term="안내사항">{event.notice || "—"}</InfoRow>
        <InfoRow term="확정자 톡방">{chatLink || "—"}</InfoRow>
        <InfoRow term="지급 예정일">{event.pay_date ? formatDate(`${event.pay_date}T00:00:00+09:00`) : "—"}</InfoRow>
        <InfoRow term="고객사 (대표만)">{internal?.client_name || "—"}</InfoRow>
        <InfoRow term="메모 (대표만)">{internal?.memo || "—"}</InfoRow>
      </dl>
    </section>
  );
}

// 일정 상세: 공개 상태 바꾸기, 신청자 선발·역할·단가, 출석 확인, 일정 정보 수정
export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const requested = (await searchParams).tab;

  const { supabase } = await requireAdmin();
  const { event, internal, chatLink, days, extras, apps } = await loadEvent(supabase, id);
  if (!event) notFound();
  const data: EventData = { event, internal, chatLink, days, extras };

  const status = event.status;
  const showAttendance = status !== "draft";
  const tab: Tab =
    requested === "info" || (showAttendance && (requested === "attendance" || requested === "contracts" || requested === "payments")) ? requested : "applicants";
  const locked = status === "completed" || status === "cancelled";
  const dayById = new Map(days.map((d) => [d.id, d]));
  const dayOrder = new Map(days.map((d, i) => [d.id, i]));
  const selected = apps.filter((a) => a.status === "selected");

  const tabs: { key: Tab; label: string }[] = [
    { key: "applicants", label: `신청자·선발 ${new Set(apps.filter((a) => a.status !== "cancelled").map((a) => a.member_id)).size}명` },
    ...(showAttendance
      ? [
          { key: "attendance" as const, label: `출석 확인 ${new Set(selected.map((a) => a.member_id)).size}명` },
          { key: "contracts" as const, label: "계약" },
          { key: "payments" as const, label: "정산" },
        ]
      : []),
    { key: "info", label: "일정 정보" },
  ];

  let body: React.ReactNode = null;
  if (tab === "applicants") {
    const canAdd = !locked && status !== "draft";
    const [history, members, roleNames] = await Promise.all([
      loadMemberHistory(supabase, [...new Set(apps.map((a) => a.member_id))]),
      canAdd ? loadActiveMembers(supabase, new Set(selected.map((a) => a.member_id))) : Promise.resolve([]),
      loadRoleNames(supabase),
    ]);
    // 같은 사람의 날짜별 신청이 붙어 보이게: 처음 신청한 순서 → 날짜 순서
    const firstApplied = new Map<string, number>();
    apps.forEach((a, i) => {
      if (!firstApplied.has(a.member_id)) firstApplied.set(a.member_id, i);
    });
    const applicants: ApplicantRow[] = [...apps]
      .sort((x, y) => (firstApplied.get(x.member_id) ?? 0) - (firstApplied.get(y.member_id) ?? 0) || (dayOrder.get(x.day_id) ?? 0) - (dayOrder.get(y.day_id) ?? 0))
      .map((a) => {
        const counts = history.counts.get(a.member_id);
        const day = dayById.get(a.day_id);
        return {
          id: a.id,
          memberId: a.member_id,
          name: a.member?.name ?? "(알 수 없음)",
          tier: a.member?.tier ?? "general",
          dayId: a.day_id,
          dayLabel: day ? dayLabel(day) : "",
          roleName: a.role_name,
          rateOverride: a.rate_override,
          rateText: applicationRate(a, day).text,
          status: a.status,
          appliedAt: formatDateTime(a.applied_at),
          addedByAdmin: a.added_by_admin,
          participation: history.participation.get(a.member_id) ?? 0,
          noShow: counts?.no_show_count ?? 0,
          late: counts?.late_count ?? 0,
          lastNote: history.lastNote.get(a.member_id) ?? "",
        };
      });
    const dayOptions: DayOption[] = days.map((d) => {
      const mine = apps.filter((a) => a.day_id === d.id);
      return {
        id: d.id,
        label: dayLabel(d),
        rateText: rateLabel(toRoleRate(d)),
        headcount: d.headcount,
        selected: mine.filter((a) => a.status === "selected").length,
        waitlisted: mine.filter((a) => a.status === "waitlisted").length,
        applied: mine.filter((a) => a.status === "applied").length,
      };
    });
    const pendingNotify = new Set(apps.filter((a) => (a.status === "selected" || a.status === "rejected") && a.notified_status !== a.status).map((a) => a.member_id)).size;
    body = (
      <>
        {status === "draft" && (
          <p className="rounded-lg bg-ground px-4 py-3 text-sm text-body">아직 공개 전이에요. 위의 버튼으로 공개하면 회원이 신청할 수 있어요.</p>
        )}
        <SelectionBoard
          eventId={event.id}
          days={dayOptions}
          applicants={applicants}
          members={members}
          roleSuggestions={roleNames}
          editable={!locked}
          canAdd={canAdd}
          pendingNotify={pendingNotify}
        />
      </>
    );
  } else if (tab === "attendance") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>();
    const rules = parsePayRules(setting?.value);
    const attendanceDays: AttendanceDay[] = days.map((d) => ({
      id: d.id,
      label: dayLabel(d),
      scheduledMinutes: scheduledMinutes(d.start_time, d.end_time),
      rows: selected
        .filter((a) => a.day_id === d.id)
        .sort((x, y) => x.role_name.localeCompare(y.role_name, "ko") || (x.member?.name ?? "").localeCompare(y.member?.name ?? "", "ko"))
        .map((a) => {
          const tier = a.member?.tier ?? "general";
          const { rate, text } = applicationRate(a, d);
          return {
            id: a.id,
            name: a.member?.name ?? "(알 수 없음)",
            tier,
            roleName: a.role_name,
            rateText: text,
            rate,
            attendance: a.attendance,
            overtimeMinutes: a.overtime_minutes,
            extras: dailyExtras(extrasForTier(extras, tier)),
          };
        }),
    }));
    body =
      status === "cancelled" ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">취소된 일정이라 출석을 확인할 수 없어요.</p>
      ) : (
        <AttendanceBoard eventId={event.id} days={attendanceDays} rules={rules} totals={personTotals(apps, days, extras, rules)} />
      );
  } else if (tab === "contracts" || tab === "payments") {
    body = await settleTab(supabase, event, tab);
  } else if (locked) {
    body = <EventSummary {...data} />;
  } else {
    const { roles, rules } = await loadRolesAndRules(supabase);
    const used = new Set(apps.map((a) => a.day_id));
    body = (
      <EventForm
        mode="edit"
        eventId={event.id}
        initial={eventToFormValues(data)}
        roles={roles}
        rules={rules}
        lockedDayIds={days.filter((d) => used.has(d.id)).map((d) => d.id)}
      />
    );
  }

  return (
    <>
      <Link href="/admin/events" className="inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 일정 목록
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[status]}`}>{EVENT_STATUS_LABEL[status]}</span>
          <span className="text-sm text-muted">{EVENT_TYPE_LABEL[event.type]}</span>
          {internal?.client_name && <span className="text-sm text-muted">· {internal.client_name}</span>}
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
        <p className="text-[15px] text-body">
          {formatEventRange(event.start_date, event.end_date)}
          {event.location_name && ` · ${event.location_name}`}
          {days.length > 1 && event.all_days_required && " · 모든 날짜 참여 필수"}
        </p>
        <ul className="flex flex-col gap-1 text-sm text-body">
          {days.map((d) => {
            const count = selected.filter((a) => a.day_id === d.id).length;
            return (
              <li key={d.id} className="flex flex-wrap gap-x-2">
                <span className="font-bold">{dayLabel(d)}</span>
                <span>
                  {d.gather_time && `집합 ${formatTime(d.gather_time)} · `}
                  {formatTime(d.start_time)}–{formatTime(d.end_time)}
                </span>
                <span className="text-muted">
                  · {rateLabel(toRoleRate(d))} · 확정 <strong className="text-ink">{count}</strong> / {d.headcount}명
                </span>
              </li>
            );
          })}
        </ul>
        {event.apply_deadline && <p className="text-sm text-muted">신청 마감 {formatDateTime(event.apply_deadline)}</p>}
        {status === "cancelled" && event.cancel_reason && (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">취소 사유: {event.cancel_reason}</p>
        )}
        <StatusActions eventId={event.id} status={status} />
        <Link
          href={`/admin/events/new?copy=${event.id}`}
          className="inline-flex min-h-10 items-center self-start text-sm text-brand underline underline-offset-4 hover:text-brand-strong"
        >
          이 일정 복사해서 새로 만들기 (날짜만 바꾸기)
        </Link>
      </header>

      <nav aria-label="일정 상세 메뉴" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.key === "applicants" ? `/admin/events/${event.id}` : `/admin/events/${event.id}?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-[3px] px-4 py-3 text-[15px] ${tab === t.key ? "border-brand font-bold text-ink" : "border-transparent text-muted"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {body}
    </>
  );
}
