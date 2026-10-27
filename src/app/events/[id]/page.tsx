import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { NotificationBell } from "@/components/notification-bell";
import { Card, Notice, PageShell } from "@/components/page-shell";
import { isActiveAdmin, requireMember, type MemberTier } from "@/lib/auth";
import {
  EVENT_COLUMNS,
  EVENT_TYPE_LABEL,
  MEMBER_APPLICATION_LABEL,
  MEMBER_EVENT_STATUS_LABEL,
  POSITION_COLUMNS,
  extrasForTier,
  formatEventDate,
  formatTime,
  scheduledMinutes,
  toRoleRate,
  visibleApplicationStatus,
  type ApplicationStatus,
  type EventRow,
  type ExtraRuleRow,
  type PositionRow,
  type SelectedCount,
} from "@/lib/events";
import { formatDate, formatDateTime, formatWon } from "@/lib/format";
import { calculatePay, PAY_TYPE_LABEL, parsePayRules } from "@/lib/pay";
import { ApplyForm, CancelForm, type PositionChoice } from "./apply-forms";

type Supabase = Awaited<ReturnType<typeof requireMember>>["supabase"];

interface MyApplication {
  position_id: string;
  status: ApplicationStatus;
  notified_status: ApplicationStatus | null;
}

async function loadEvent(supabase: Supabase, id: string, userId: string, tier: MemberTier) {
  const [{ data: event }, { data: positions }, { data: extras }, { data: mine }, { data: counts }, { data: chat }, { data: setting }] =
    await Promise.all([
      supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle<EventRow>(),
      supabase.from("event_positions").select(POSITION_COLUMNS).eq("event_id", id).order("sort_order").returns<PositionRow[]>(),
      supabase.from("event_extra_rules").select("type, tier, amount").eq("event_id", id).returns<ExtraRuleRow[]>(),
      supabase.from("applications").select("position_id, status, notified_status").eq("event_id", id).eq("member_id", userId).maybeSingle<MyApplication>(),
      supabase.rpc("position_selected_counts", { p_event_ids: [id] }),
      supabase.from("event_chat_links").select("chat_link").eq("event_id", id).maybeSingle<{ chat_link: string }>(),
      supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>(),
    ]);
  if (!event) return null;

  const rules = parsePayRules(setting?.value);
  const minutes = scheduledMinutes(event.start_time, event.end_time);
  const selected = new Map(((counts ?? []) as SelectedCount[]).map((c) => [c.position_id, c.selected_count]));
  const extra = extrasForTier(extras ?? [], tier);
  const choices: PositionChoice[] = (positions ?? []).map((p) => {
    const pay = calculatePay(toRoleRate(p), rules, { scheduledMinutes: minutes, overtimeMinutes: 0 });
    return {
      id: p.id,
      name: p.role_name,
      payText: `${PAY_TYPE_LABEL[p.pay_type]} ${formatWon(p.rate)} · 예상 ${formatWon(pay.total)}`,
      remaining: Math.max(0, p.headcount - (selected.get(p.id) ?? 0)),
    };
  });

  return {
    event,
    choices,
    extra,
    mine,
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

// 회원이 보는 일정 상세: 일시·장소, 역할별 보수, 신청과 취소, 확정 뒤 톡방 링크
export default async function MemberEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase, userId, profile } = await requireMember(`/events/${id}`);
  if (isActiveAdmin(profile)) redirect(`/admin/events/${id}`);

  const data = await loadEvent(supabase, id, userId, profile.tier);
  if (!data) notFound();
  const { event, choices, extra, mine, chatLink, deadlinePassed } = data;

  const myStatus = mine ? visibleApplicationStatus(mine.status, mine.notified_status) : null;
  const active = myStatus !== null && myStatus !== "cancelled";
  const open = (event.status === "open_core" || event.status === "open_all") && !deadlinePassed;
  const myPosition = choices.find((c) => c.id === mine?.position_id);

  return (
    <PageShell actions={<NotificationBell />}>
      <Link href="/" className="-mt-3 text-sm text-muted underline-offset-4 hover:underline">
        ← 일정 목록
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className={`rounded-md px-2 py-0.5 font-bold ${event.status === "cancelled" ? "bg-warn-soft text-warn" : "bg-brand-soft text-brand-strong"}`}>
            {MEMBER_EVENT_STATUS_LABEL[event.status]}
          </span>
          <span className="text-muted">{EVENT_TYPE_LABEL[event.type]}</span>
        </div>
        <h1 className="text-xl font-bold leading-snug">{event.title}</h1>
        <dl className="flex flex-col">
          <InfoRow term="날짜">{formatEventDate(event.event_date)}</InfoRow>
          {event.gather_time && <InfoRow term="집합">{formatTime(event.gather_time)}</InfoRow>}
          <InfoRow term="근무">
            {formatTime(event.start_time)}–{formatTime(event.end_time)}
          </InfoRow>
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
        <h2 className="text-lg font-bold">역할과 보수</h2>
        <ul className="flex flex-col gap-2">
          {choices.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-ground px-4 py-3">
              <span className="flex flex-col">
                <span className="font-bold">{c.name}</span>
                <span className="text-[13px] text-body">{c.payText}</span>
              </span>
              <span className="text-[13px] text-muted">{c.remaining > 0 ? `${c.remaining}자리 남음` : "다 찼어요"}</span>
            </li>
          ))}
        </ul>
        {(extra.transport > 0 || extra.regional > 0) && (
          <p className="text-sm text-body">
            추가 지급: {[extra.transport > 0 && `교통비 ${formatWon(extra.transport)}`, extra.regional > 0 && `지방비 ${formatWon(extra.regional)}`].filter(Boolean).join(" · ")}
          </p>
        )}
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
          {myStatus === "selected" && (
            <>
              <Notice>
                확정되었어요{myPosition && ` (${myPosition.name})`}. 집합 시간에 늦지 않게 와 주세요. 취소가 필요하면 대표님께 바로 연락해 주세요.
              </Notice>
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
          {myStatus === "rejected" && <p className="text-[15px] text-body">이번 일정은 함께하지 못하게 되었어요. 다음 일정에서 만나요.</p>}
          {(myStatus === "applied" || myStatus === "waitlisted") && (
            <>
              <p className="text-[15px] text-body">
                <strong>{MEMBER_APPLICATION_LABEL[myStatus]}</strong>
                {myPosition && ` · ${myPosition.name}`}
                {myStatus === "applied" ? " — 선발 결과는 알림으로 알려 드려요." : " — 자리가 나면 연락드릴게요."}
              </p>
              {event.status !== "completed" && <CancelForm eventId={event.id} />}
            </>
          )}
          {!active &&
            (open ? (
              <ApplyForm eventId={event.id} positions={choices} initialPositionId={mine?.position_id} />
            ) : (
              <p className="text-[15px] text-muted">{deadlinePassed ? "신청 마감 시간이 지났어요." : "지금은 신청을 받지 않아요."}</p>
            ))}
          {myStatus === "cancelled" && open && <p className="text-[13px] text-muted">신청을 취소했어요. 다시 신청할 수 있어요.</p>}
        </Card>
      )}
    </PageShell>
  );
}
