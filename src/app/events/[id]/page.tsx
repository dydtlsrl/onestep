import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NotificationBell } from "@/components/notification-bell";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { isActiveAdmin, requireMember, type MemberTier } from "@/lib/auth";
import {
  DAY_COLUMNS,
  EVENT_COLUMNS,
  EVENT_TYPE_LABEL,
  EXTRA_COLUMNS,
  MEMBER_APPLICATION_LABEL,
  MEMBER_EVENT_STATUS_LABEL,
  dayLabel,
  describeExtras,
  extrasForTier,
  formatEventRange,
  formatTime,
  scheduledMinutes,
  toRoleRate,
  visibleApplicationStatus,
  type ApplicationStatus,
  type DayRow,
  type EventRow,
  type ExtraRuleRow,
  type SelectedCount,
} from "@/lib/events";
import { formatDate, formatDateTime, formatWon } from "@/lib/format";
import { calculatePay, effectiveRate, PAY_TYPE_LABEL, parsePayRules } from "@/lib/pay";
import { ApplyForm, CancelForm, type DayChoice } from "./apply-forms";

type Supabase = Awaited<ReturnType<typeof requireMember>>["supabase"];

interface MyApplication {
  day_id: string;
  status: ApplicationStatus;
  notified_status: ApplicationStatus | null;
  role_name: string;
  rate_override: number | null;
}

const MY_BADGE: Record<ApplicationStatus, string> = {
  applied: "bg-ground text-body",
  waitlisted: "bg-warn-soft text-warn",
  selected: "bg-brand text-white",
  rejected: "border border-line text-muted",
  cancelled: "border border-line text-muted",
};

function timeText(day: DayRow): string {
  return `${day.gather_time ? `집합 ${formatTime(day.gather_time)} · ` : ""}${formatTime(day.start_time)}–${formatTime(day.end_time)}`;
}

async function loadEvent(supabase: Supabase, id: string, userId: string, tier: MemberTier) {
  const [{ data: event }, { data: days }, { data: extras }, { data: mine }, { data: counts }, { data: chat }, { data: setting }, { data: me }] =
    await Promise.all([
      supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<EventRow>(),
      supabase.from("event_days").select(DAY_COLUMNS).eq("event_id", id).order("day_date").order("start_time").returns<DayRow[]>(),
      supabase.from("event_extra_rules").select(EXTRA_COLUMNS).eq("event_id", id).returns<ExtraRuleRow[]>(),
      supabase
        .from("applications")
        .select("day_id, status, notified_status, role_name, rate_override")
        .eq("event_id", id)
        .eq("member_id", userId)
        .returns<MyApplication[]>(),
      supabase.rpc("day_selected_counts", { p_event_ids: [id] }),
      supabase.from("event_chat_links").select("chat_link").eq("event_id", id).maybeSingle<{ chat_link: string }>(),
      supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>(),
      supabase.from("profiles").select("default_rate").eq("id", userId).maybeSingle<{ default_rate: number | null }>(),
    ]);
  if (!event) return null;

  const rules = parsePayRules(setting?.value);
  const selected = new Map(((counts ?? []) as SelectedCount[]).map((c) => [c.day_id, c.selected_count]));
  const myApps = new Map((mine ?? []).map((a) => [a.day_id, a]));
  // 회원에게 보여 줄 예상 보수: 대표가 이 사람만 정한 단가 → 회원 기본 시급과 날짜 단가 중 높은 쪽 → 날짜 단가
  const dayChoices: DayChoice[] = (days ?? []).map((d) => {
    const rate = effectiveRate(toRoleRate(d), me?.default_rate ?? null, myApps.get(d.id)?.rate_override ?? null);
    const total = calculatePay(rate, rules, { scheduledMinutes: scheduledMinutes(d.start_time, d.end_time), overtimeMinutes: 0 }).total;
    return {
      id: d.id,
      label: dayLabel(d),
      timeText: timeText(d),
      payText: `${PAY_TYPE_LABEL[rate.payType]} ${formatWon(rate.rate)} · 예상 ${formatWon(total)}`,
      remaining: Math.max(0, d.headcount - (selected.get(d.id) ?? 0)),
    };
  });

  return {
    event,
    days: dayChoices,
    extras: extrasForTier(extras ?? [], tier),
    mine: (mine ?? []).map((a) => ({ ...a, shown: visibleApplicationStatus(a.status, a.notified_status) })),
    chatLink: chat?.chat_link ?? "",
    deadlinePassed: event.apply_deadline !== null && new Date(event.apply_deadline).getTime() <= Date.now(),
  };
}

function InfoRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-20 shrink-0 text-sm text-muted">{term}</dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-[15px]">{children}</dd>
    </div>
  );
}

// 회원이 보는 일정 상세: 날짜별 시간·역할·보수, 날짜를 골라 신청과 취소, 확정 뒤 톡방 링크
export default async function MemberEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, userId, profile } = await requireMember(`/events/${id}`);
  if (isActiveAdmin(profile)) redirect(`/admin/events/${id}`);

  const data = await loadEvent(supabase, id, userId, profile.tier);
  if (!data) notFound();
  const { event, days, extras, mine, chatLink, deadlinePassed } = data;

  const multiDay = days.length > 1;
  const active = mine.filter((a) => a.shown !== "cancelled");
  const anySelected = active.some((a) => a.shown === "selected");
  const canCancel = !anySelected && active.some((a) => a.shown === "applied" || a.shown === "waitlisted");
  const open = (event.status === "open_core" || event.status === "open_all") && !deadlinePassed;
  const dayIndex = new Map(days.map((d, i) => [d.id, i]));
  // 취소했던 신청이 있으면 그때 고른 날짜를 미리 골라 둔다
  const initialDays = mine.filter((a) => a.shown === "cancelled").map((a) => a.day_id);

  return (
    <PageShell actions={<NotificationBell />}>
      <Link href="/" className="-mt-3 inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 일정 목록
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className={`rounded-md px-2 py-0.5 font-bold ${event.status === "cancelled" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-strong"}`}>
            {MEMBER_EVENT_STATUS_LABEL[event.status]}
          </span>
          <span className="text-muted">{EVENT_TYPE_LABEL[event.type]}</span>
          {multiDay && <span className="text-muted">· {days.length}일 일정</span>}
        </div>
        <h1 className="text-xl font-bold leading-snug">{event.title}</h1>
        <dl className="flex flex-col">
          <InfoRow term="날짜">{formatEventRange(event.start_date, event.end_date)}</InfoRow>
          {!multiDay && days[0] && <InfoRow term="시간">{days[0].timeText}</InfoRow>}
          {(event.location_name || event.address) && (
            <InfoRow term="장소">{[event.location_name, event.address].filter(Boolean).join("\n")}</InfoRow>
          )}
          {event.apply_deadline && <InfoRow term="신청 마감">{formatDateTime(event.apply_deadline)}</InfoRow>}
          {event.pay_date && <InfoRow term="지급 예정">{formatDate(`${event.pay_date}T00:00:00+09:00`)}</InfoRow>}
        </dl>
      </Card>

      {event.status === "cancelled" && (
        <Notice tone="warn">
          이 일정은 취소되었어요.{event.cancel_reason && ` 사유: ${event.cancel_reason}`}
        </Notice>
      )}

      <Card>
        <h2 className="text-lg font-bold">{multiDay ? "날짜별 시간과 보수" : "시간과 보수"}</h2>
        <ul className="flex flex-col gap-2">
          {days.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-4 py-3">
              <span className="flex flex-col">
                <span className="font-bold">{multiDay ? d.label : d.timeText}</span>
                {multiDay && <span className="text-[13px] text-body">{d.timeText}</span>}
                <span className="text-[13px] text-body">{d.payText}</span>
              </span>
              <span className="text-[13px] text-muted">{d.remaining > 0 ? `${d.remaining}자리 남음` : "다 찼어요"}</span>
            </li>
          ))}
        </ul>
        {extras.length > 0 && <p className="text-sm text-body">추가 지급: {describeExtras(extras, multiDay)}</p>}
        <p className="text-[13px] leading-relaxed text-muted">예상 보수는 정해진 근무 시간 기준, 세금 공제 전 금액이에요. 초과 근무는 행사 뒤 따로 더해져요.</p>
      </Card>

      {event.notice && (
        <Card>
          <h2 className="text-lg font-bold">안내사항</h2>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-body">{event.notice}</p>
        </Card>
      )}

      {event.status !== "cancelled" && (
        <Card>
          <h2 className="text-lg font-bold">내 신청</h2>
          {active.length > 0 && (
            <ul className="flex flex-col gap-2">
              {[...active]
                .sort((x, y) => (dayIndex.get(x.day_id) ?? 0) - (dayIndex.get(y.day_id) ?? 0))
                .map((a) => {
                  const day = days[dayIndex.get(a.day_id) ?? -1];
                  // 역할은 확정 알림을 받은 뒤에 보여 준다
                  const role = a.shown === "selected" && a.role_name ? ` · ${a.role_name}` : "";
                  return (
                    <li key={a.day_id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
                      <span className="flex flex-col">
                        <span className="font-bold">
                          {multiDay ? day?.label : day?.timeText}
                          {role}
                        </span>
                        {multiDay && <span className="text-[13px] text-muted">{day?.timeText}</span>}
                      </span>
                      <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${MY_BADGE[a.shown]}`}>{MEMBER_APPLICATION_LABEL[a.shown]}</span>
                    </li>
                  );
                })}
            </ul>
          )}

          {anySelected && (
            <>
              <Notice>확정되었어요. 집합 시간에 늦지 않게 와 주세요. 취소가 필요하면 대표님께 바로 연락해 주세요.</Notice>
              {chatLink ? (
                <a
                  href={chatLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-12 items-center justify-center rounded-lg bg-[#fee500] text-[15px] font-bold text-[#191919]"
                >
                  확정자 톡방 들어가기
                </a>
              ) : (
                <p className="text-sm text-muted">톡방 링크는 대표님이 등록하면 여기에 보여요.</p>
              )}
            </>
          )}
          {!anySelected && active.length > 0 && active.every((a) => a.shown === "rejected") && (
            <p className="text-[15px] text-body">이번 일정은 함께하지 못하게 되었어요. 다음 일정에서 만나요.</p>
          )}
          {!anySelected && active.some((a) => a.shown === "applied") && <p className="text-[15px] text-body">선발 결과는 알림으로 알려 드려요.</p>}
          {canCancel && event.status !== "completed" && <CancelForm eventId={event.id} />}

          {active.length === 0 &&
            (open && days.length > 0 ? (
              <>
                {mine.some((a) => a.shown === "cancelled") && <p className="text-[13px] text-muted">신청을 취소했어요. 다시 신청할 수 있어요.</p>}
                <ApplyForm eventId={event.id} days={days} allRequired={event.all_days_required} initialDays={initialDays} />
              </>
            ) : (
              active.length === 0 && (
                <p className="text-[15px] text-muted">{deadlinePassed ? "신청 마감 시간이 지났어요." : "지금은 신청을 받지 않아요."}</p>
              )
            ))}
        </Card>
      )}
    </PageShell>
  );
}
