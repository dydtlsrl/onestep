import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin, TIER_LABEL, type MemberTier } from "@/lib/auth";
import {
  EVENT_COLUMNS,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  POSITION_COLUMNS,
  extrasForTier,
  formatEventDate,
  formatTime,
  isoToKstLocal,
  scheduledMinutes,
  toRoleRate,
  type ApplicationStatus,
  type Attendance,
  type EventRow,
  type ExtraRuleRow,
  type PositionRow,
} from "@/lib/events";
import { formatDate, formatDateTime, formatWon } from "@/lib/format";
import { PAY_TYPE_LABEL, parsePayRules } from "@/lib/pay";
import { STATUS_BADGE } from "../badges";
import { EventForm, type EventFormValues } from "../event-form";
import { loadRolesAndRules } from "../load";
import { AttendanceBoard, type AttendanceRow } from "./attendance-board";
import { SelectionBoard, type ApplicantRow, type MemberOption, type PositionStat } from "./selection-board";
import { StatusActions } from "./status-actions";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];
type Tab = "applicants" | "attendance" | "info";

interface InternalRow {
  client_name: string;
  memo: string;
}

interface AppRow {
  id: string;
  member_id: string;
  position_id: string;
  status: ApplicationStatus;
  added_by_admin: boolean;
  attendance: Attendance;
  overtime_minutes: number;
  applied_at: string;
  notified_status: ApplicationStatus | null;
  member: { name: string; tier: MemberTier } | null;
}

// 신청자가 많을 때 주소가 너무 길어지지 않게 나눠서 불러온다
function chunk<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function loadEvent(supabase: Supabase, id: string) {
  const [{ data: event }, { data: internal }, { data: chat }, { data: positions }, { data: extras }, { data: apps }] = await Promise.all([
    supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<EventRow>(),
    supabase.from("event_internal").select("client_name, memo").eq("event_id", id).maybeSingle<InternalRow>(),
    supabase.from("event_chat_links").select("chat_link").eq("event_id", id).maybeSingle<{ chat_link: string }>(),
    supabase.from("event_positions").select(POSITION_COLUMNS).eq("event_id", id).order("sort_order").returns<PositionRow[]>(),
    supabase.from("event_extra_rules").select("type, tier, amount").eq("event_id", id).returns<ExtraRuleRow[]>(),
    supabase
      .from("applications")
      .select(
        "id, member_id, position_id, status, added_by_admin, attendance, overtime_minutes, applied_at, notified_status, member:profiles!applications_member_id_fkey(name, tier)",
      )
      .eq("event_id", id)
      .order("applied_at")
      .returns<AppRow[]>(),
  ]);
  return { event, internal, chatLink: chat?.chat_link ?? "", positions: positions ?? [], extras: extras ?? [], apps: apps ?? [] };
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

async function loadActiveMembers(supabase: Supabase): Promise<MemberOption[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, name, phone, tier")
    .eq("status", "active")
    .eq("role", "member")
    .order("name")
    .returns<{ id: string; name: string; phone: string; tier: MemberTier }[]>();
  return (data ?? []).map((m) => ({ id: m.id, label: `${m.name} · ${TIER_LABEL[m.tier]} · ${m.phone.slice(-4)}` }));
}

interface EventData {
  event: EventRow;
  internal: InternalRow | null;
  chatLink: string;
  positions: PositionRow[];
  extras: ExtraRuleRow[];
}

function toFormValues({ event, internal, chatLink, positions, extras }: EventData): EventFormValues {
  const amount = (type: ExtraRuleRow["type"], tier: ExtraRuleRow["tier"]) => extras.find((e) => e.type === type && e.tier === tier)?.amount;
  const regionalAll = amount("regional", "all");
  const regionalCore = amount("regional", "core") ?? regionalAll;
  const regionalGeneral = amount("regional", "general") ?? regionalAll;
  const transport = amount("transport", "all");
  return {
    type: event.type,
    title: event.title,
    clientName: internal?.client_name ?? "",
    eventDate: event.event_date,
    gatherTime: formatTime(event.gather_time),
    startTime: formatTime(event.start_time),
    endTime: formatTime(event.end_time),
    locationName: event.location_name,
    address: event.address,
    notice: event.notice,
    chatLink,
    applyDeadline: isoToKstLocal(event.apply_deadline),
    payDate: event.pay_date ?? "",
    memo: internal?.memo ?? "",
    positions: positions.map((p) => ({
      key: p.id,
      id: p.id,
      roleId: p.role_id,
      roleName: p.role_name,
      payType: p.pay_type,
      rate: String(p.rate),
      minPaidHours: p.min_paid_hours === null ? "" : String(Number(p.min_paid_hours)),
      overtimeRate: p.overtime_rate === null ? "" : String(p.overtime_rate),
      headcount: String(p.headcount),
    })),
    transportOn: transport !== undefined,
    transportAmount: transport !== undefined ? String(transport) : "",
    regionalOn: regionalCore !== undefined || regionalGeneral !== undefined,
    regionalCore: regionalCore !== undefined ? String(regionalCore) : "",
    regionalGeneral: regionalGeneral !== undefined ? String(regionalGeneral) : "",
  };
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
function EventSummary({ event, internal, chatLink, positions, extras }: EventData) {
  const transport = extrasForTier(extras, "general").transport;
  const regional = { core: extrasForTier(extras, "core").regional, general: extrasForTier(extras, "general").regional };
  return (
    <section className="rounded-xl border border-line bg-white px-5 py-2">
      <dl>
        <InfoRow term="장소">{[event.location_name, event.address].filter(Boolean).join(" · ") || "—"}</InfoRow>
        <InfoRow term="모집 역할">
          {positions.map((p) => `${p.role_name} ${p.headcount}명 · ${PAY_TYPE_LABEL[p.pay_type]} ${formatWon(p.rate)}`).join("\n")}
        </InfoRow>
        <InfoRow term="추가 지급">
          {transport || regional.core || regional.general
            ? [transport && `교통비 ${formatWon(transport)}`, (regional.core || regional.general) && `지방비 핵심 ${formatWon(regional.core)} · 일반 ${formatWon(regional.general)}`]
                .filter(Boolean)
                .join("\n")
            : "없음"}
        </InfoRow>
        <InfoRow term="안내사항">{event.notice || "—"}</InfoRow>
        <InfoRow term="확정자 톡방">{chatLink || "—"}</InfoRow>
        <InfoRow term="지급 예정일">{event.pay_date ? formatDate(`${event.pay_date}T00:00:00+09:00`) : "—"}</InfoRow>
        <InfoRow term="고객사 (대표만)">{internal?.client_name || "—"}</InfoRow>
        <InfoRow term="메모 (대표만)">{internal?.memo || "—"}</InfoRow>
      </dl>
    </section>
  );
}

// 일정 상세: 공개 상태 바꾸기, 신청자 선발, 출석 확인, 일정 정보 수정
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
  const { event, internal, chatLink, positions, extras, apps } = await loadEvent(supabase, id);
  if (!event) notFound();
  const data: EventData = { event, internal, chatLink, positions, extras };

  const status = event.status;
  const showAttendance = status !== "draft";
  const tab: Tab = requested === "info" || (requested === "attendance" && showAttendance) ? requested : "applicants";
  const locked = status === "completed" || status === "cancelled";
  const positionName = new Map(positions.map((p) => [p.id, p.role_name]));
  const selected = apps.filter((a) => a.status === "selected");
  const headcount = positions.reduce((sum, p) => sum + p.headcount, 0);

  const tabs: { key: Tab; label: string }[] = [
    { key: "applicants", label: `신청자·선발 ${apps.filter((a) => a.status !== "cancelled").length}` },
    ...(showAttendance ? [{ key: "attendance" as const, label: `출석 확인 ${selected.length}` }] : []),
    { key: "info", label: "일정 정보" },
  ];

  let body: React.ReactNode = null;
  if (tab === "applicants") {
    const memberIds = apps.map((a) => a.member_id);
    const canAdd = !locked && status !== "draft";
    const [history, members] = await Promise.all([loadMemberHistory(supabase, memberIds), canAdd ? loadActiveMembers(supabase) : Promise.resolve([])]);
    const applicants: ApplicantRow[] = apps.map((a) => {
      const counts = history.counts.get(a.member_id);
      return {
        id: a.id,
        memberId: a.member_id,
        name: a.member?.name ?? "(알 수 없음)",
        tier: a.member?.tier ?? "general",
        positionId: a.position_id,
        positionName: positionName.get(a.position_id) ?? "",
        status: a.status,
        appliedAt: formatDateTime(a.applied_at),
        addedByAdmin: a.added_by_admin,
        participation: history.participation.get(a.member_id) ?? 0,
        noShow: counts?.no_show_count ?? 0,
        late: counts?.late_count ?? 0,
        lastNote: history.lastNote.get(a.member_id) ?? "",
      };
    });
    const stats: PositionStat[] = positions.map((p) => {
      const mine = apps.filter((a) => a.position_id === p.id);
      return {
        id: p.id,
        name: p.role_name,
        headcount: p.headcount,
        selected: mine.filter((a) => a.status === "selected").length,
        waitlisted: mine.filter((a) => a.status === "waitlisted").length,
        applied: mine.filter((a) => a.status === "applied").length,
      };
    });
    const pendingNotify = apps.filter((a) => (a.status === "selected" || a.status === "rejected") && a.notified_status !== a.status).length;
    body = (
      <>
        {status === "draft" && (
          <p className="rounded-lg bg-ground px-4 py-3 text-sm text-body">아직 공개 전이에요. 위의 버튼으로 공개하면 회원이 신청할 수 있어요.</p>
        )}
        <SelectionBoard
          eventId={event.id}
          positions={stats}
          applicants={applicants}
          members={members}
          editable={!locked}
          canAdd={canAdd}
          pendingNotify={pendingNotify}
        />
      </>
    );
  } else if (tab === "attendance") {
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>();
    const byId = new Map(positions.map((p) => [p.id, p]));
    const order = (a: AppRow) => byId.get(a.position_id)?.sort_order ?? 0;
    const rows: AttendanceRow[] = [...selected]
      .sort((x, y) => order(x) - order(y) || (x.member?.name ?? "").localeCompare(y.member?.name ?? "", "ko"))
      .map((a) => {
        const position = byId.get(a.position_id);
        const tier = a.member?.tier ?? "general";
        const extra = extrasForTier(extras, tier);
        return {
          id: a.id,
          name: a.member?.name ?? "(알 수 없음)",
          tier,
          positionName: position?.role_name ?? "",
          rate: toRoleRate(position ?? { pay_type: "hourly", rate: 0, min_paid_hours: null, overtime_rate: null }),
          attendance: a.attendance,
          overtimeMinutes: a.overtime_minutes,
          extras: extra.transport + extra.regional,
        };
      });
    body =
      status === "cancelled" ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">취소된 일정이라 출석을 확인할 수 없어요.</p>
      ) : (
        <AttendanceBoard eventId={event.id} rows={rows} rules={parsePayRules(setting?.value)} scheduledMinutes={scheduledMinutes(event.start_time, event.end_time)} />
      );
  } else if (locked) {
    body = <EventSummary {...data} />;
  } else {
    const { roles, rules } = await loadRolesAndRules(supabase);
    const used = new Set(apps.map((a) => a.position_id));
    body = (
      <EventForm
        mode="edit"
        eventId={event.id}
        initial={toFormValues(data)}
        roles={roles}
        rules={rules}
        lockedPositionIds={positions.filter((p) => used.has(p.id)).map((p) => p.id)}
      />
    );
  }

  return (
    <>
      <Link href="/admin/events" className="text-sm text-muted underline-offset-4 hover:underline">
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
          {formatEventDate(event.event_date)} · {event.gather_time && `집합 ${formatTime(event.gather_time)} · `}
          {formatTime(event.start_time)}–{formatTime(event.end_time)}
          {event.location_name && ` · ${event.location_name}`}
        </p>
        <p className="text-sm text-muted">
          확정 <strong className="text-ink">{selected.length}</strong> / 모집 {headcount}명
          {event.apply_deadline && ` · 신청 마감 ${formatDateTime(event.apply_deadline)}`}
        </p>
        {status === "cancelled" && event.cancel_reason && (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">취소 사유: {event.cancel_reason}</p>
        )}
        <StatusActions eventId={event.id} status={status} />
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
