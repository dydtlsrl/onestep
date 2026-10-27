import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationBell } from "@/components/notification-bell";
import { Card, PageShell } from "@/components/page-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentMember, isActiveAdmin, TIER_LABEL } from "@/lib/auth";
import {
  MEMBER_APPLICATION_LABEL,
  MEMBER_EVENT_STATUS_LABEL,
  dayLabel,
  formatEventRange,
  formatTime,
  todayKst,
  visibleApplicationStatus,
  type ApplicationStatus,
  type DayKind,
  type EventStatus,
  type SelectedCount,
} from "@/lib/events";
import { formatDateTime } from "@/lib/format";

type Supabase = Awaited<ReturnType<typeof getCurrentMember>>["supabase"];

interface HomeDay {
  id: string;
  day_date: string;
  kind: DayKind;
  headcount: number;
  gather_time: string | null;
  start_time: string;
  end_time: string;
}

interface HomeEvent {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  location_name: string;
  status: EventStatus;
  apply_deadline: string | null;
  event_days: HomeDay[];
}

interface HomeApplication {
  event_id: string;
  day_id: string;
  status: ApplicationStatus;
  notified_status: ApplicationStatus | null;
}

// 날짜가 여러 개일 때 일정 하나의 대표 상태 (확정 > 신청 > 대기 > 미선발 > 취소)
const STATUS_ORDER: ApplicationStatus[] = ["selected", "applied", "waitlisted", "rejected", "cancelled"];

// 다가오는 일정 중 내 일정(신청·확정)과 지금 신청할 수 있는 일정을 나눠 불러온다
async function loadHome(supabase: Supabase, userId: string) {
  const now = Date.now();
  const { data } = await supabase
    .from("events")
    .select(
      "id, title, start_date, end_date, location_name, status, apply_deadline, event_days(id, day_date, kind, headcount, gather_time, start_time, end_time)",
    )
    .gte("end_date", todayKst(now))
    .in("status", ["open_core", "open_all", "closed", "cancelled"])
    .order("start_date")
    .limit(100)
    .returns<HomeEvent[]>();
  const events = data ?? [];
  const ids = events.map((e) => e.id);
  if (ids.length === 0) return { mine: [], open: [] };

  const [{ data: apps }, { data: counts }, { data: chats }] = await Promise.all([
    supabase.from("applications").select("event_id, day_id, status, notified_status").eq("member_id", userId).in("event_id", ids).returns<HomeApplication[]>(),
    supabase.rpc("day_selected_counts", { p_event_ids: ids }),
    supabase.from("event_chat_links").select("event_id, chat_link").in("event_id", ids).returns<{ event_id: string; chat_link: string }[]>(),
  ]);
  const chatOf = new Map((chats ?? []).map((c) => [c.event_id, c.chat_link]));
  const selectedOf = new Map(((counts ?? []) as SelectedCount[]).map((c) => [c.day_id, c.selected_count]));

  const rows = events.map((e) => {
    const days = [...e.event_days].sort((a, b) => a.day_date.localeCompare(b.day_date) || a.start_time.localeCompare(b.start_time));
    const mine = (apps ?? []).filter((a) => a.event_id === e.id).map((a) => ({ dayId: a.day_id, shown: visibleApplicationStatus(a.status, a.notified_status) }));
    const myStatus = STATUS_ORDER.find((s) => mine.some((a) => a.shown === s)) ?? null;
    return {
      ...e,
      days,
      myStatus,
      selectedDays: days.filter((d) => mine.some((a) => a.dayId === d.id && a.shown === "selected")),
      chatLink: chatOf.get(e.id) ?? "",
      remaining: days.reduce((sum, d) => sum + Math.max(0, d.headcount - (selectedOf.get(d.id) ?? 0)), 0),
      deadlinePassed: e.apply_deadline !== null && new Date(e.apply_deadline).getTime() <= now,
    };
  });
  return {
    mine: rows.filter((e) => e.myStatus !== null && e.myStatus !== "cancelled"),
    open: rows.filter((e) => (e.status === "open_core" || e.status === "open_all") && (e.myStatus === null || e.myStatus === "cancelled")),
  };
}

type HomeRow = Awaited<ReturnType<typeof loadHome>>["mine"][number];

const MY_BADGE: Record<ApplicationStatus, string> = {
  applied: "bg-ground text-body",
  waitlisted: "bg-warn-soft text-warn",
  selected: "bg-brand text-white",
  rejected: "border border-line text-muted",
  cancelled: "border border-line text-muted",
};

const dayTime = (d: HomeDay) => `${d.gather_time ? `집합 ${formatTime(d.gather_time)} · ` : ""}${formatTime(d.start_time)}–${formatTime(d.end_time)}`;

function EventCard({ event, children }: { event: HomeRow; children?: React.ReactNode }) {
  const multiDay = event.days.length > 1;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <Link href={`/events/${event.id}`} className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-brand-strong">
          {formatEventRange(event.start_date, event.end_date)}
          {multiDay && ` · ${event.days.length}일`}
        </span>
        <span className="text-[16px] font-bold leading-snug text-ink">{event.title}</span>
        {!multiDay && event.days[0] && (
          <span className="text-sm text-body">
            {dayTime(event.days[0])}
            {event.location_name && ` · ${event.location_name}`}
          </span>
        )}
        {multiDay && (
          <>
            {event.location_name && <span className="text-sm text-body">{event.location_name}</span>}
            <ul className="flex flex-col text-[13px] text-body">
              {event.days.slice(0, 4).map((d) => (
                <li key={d.id}>
                  <span className="font-bold">{dayLabel(d)}</span> {dayTime(d)}
                </li>
              ))}
              {event.days.length > 4 && <li className="text-muted">외 {event.days.length - 4}일</li>}
            </ul>
          </>
        )}
      </Link>
      {children}
    </li>
  );
}

// 첫 화면. 로그인 여부와 회원 상태에 따라 알맞은 곳으로 보낸다.
export default async function HomePage() {
  const { supabase, userId, profile } = await getCurrentMember();

  if (!userId) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-xl font-bold">원스텝 진행요원 전용 공간</h1>
          <p className="text-[15px] leading-relaxed text-body">
            일정 확인, 신청, 계약, 정산을 한곳에서 할 수 있어요. 처음이라면 대표님께 받은 초대 링크로 가입해 주세요.
          </p>
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-lg bg-brand text-[15px] font-bold text-white hover:bg-brand-strong"
          >
            이미 가입했어요 · 로그인
          </Link>
        </Card>
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <Card>
          <h1 className="text-xl font-bold">아직 가입 신청 전이에요</h1>
          <p className="text-[15px] leading-relaxed text-body">
            원스텝은 초대받은 분만 가입할 수 있어요. 대표님께 받은 초대 링크를 다시 눌러 가입 신청을 해 주세요.
          </p>
          <details className="text-sm text-muted">
            <summary className="cursor-pointer">내 계정 ID 보기</summary>
            <p className="mt-2 break-all rounded-md bg-ground px-3 py-2 font-mono text-xs text-body">{userId}</p>
            <p className="mt-2 leading-relaxed">대표 계정을 처음 등록할 때 필요한 값이에요. (README의 &lsquo;첫 대표 계정 만들기&rsquo;)</p>
          </details>
        </Card>
        <SignOutButton />
      </PageShell>
    );
  }

  if (profile.status !== "active") redirect("/pending");
  if (isActiveAdmin(profile)) redirect("/admin");

  const { mine, open } = await loadHome(supabase, userId);

  return (
    <PageShell actions={<NotificationBell />}>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">{profile.name}님, 안녕하세요</h1>
        <span className="rounded-md bg-navy px-2 py-0.5 text-xs font-bold text-white">{TIER_LABEL[profile.tier]}</span>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="my-events">
        <h2 id="my-events" className="text-lg font-bold">
          내 일정
        </h2>
        {mine.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-5 text-[15px] text-muted">신청한 일정이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.map((e) => (
              <EventCard key={e.id} event={e}>
                <div className="flex flex-wrap items-center gap-2">
                  {e.status === "cancelled" ? (
                    <span className="rounded-md bg-warn-soft px-2 py-0.5 text-xs font-bold text-warn">일정 취소</span>
                  ) : (
                    e.myStatus && <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${MY_BADGE[e.myStatus]}`}>{MEMBER_APPLICATION_LABEL[e.myStatus]}</span>
                  )}
                  {e.status !== "cancelled" && e.days.length > 1 && e.selectedDays.length > 0 && (
                    <span className="text-[13px] text-body">{e.selectedDays.map((d) => dayLabel(d)).join(", ")}</span>
                  )}
                </div>
                {e.status !== "cancelled" && e.myStatus === "selected" && e.chatLink && (
                  <a
                    href={e.chatLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-11 items-center justify-center rounded-lg bg-[#fee500] text-sm font-bold text-[#191919]"
                  >
                    확정자 톡방 들어가기
                  </a>
                )}
              </EventCard>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="open-events">
        <h2 id="open-events" className="text-lg font-bold">
          신청할 수 있는 일정
        </h2>
        {open.length === 0 ? (
          <p className="rounded-xl border border-line bg-white p-5 text-[15px] text-muted">지금 모집 중인 일정이 없어요. 새 일정이 열리면 알림으로 알려 드려요.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {open.map((e) => (
              <EventCard key={e.id} event={e}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                  <span className="font-bold text-brand-strong">{MEMBER_EVENT_STATUS_LABEL[e.status]}</span>
                  <span className="text-muted">{e.remaining > 0 ? `${e.remaining}자리 남음` : "대기 신청 가능"}</span>
                  {e.apply_deadline && (
                    <span className={e.deadlinePassed ? "font-bold text-warn" : "text-muted"}>
                      {e.deadlinePassed ? "신청 마감" : `${formatDateTime(e.apply_deadline)} 마감`}
                    </span>
                  )}
                </div>
                <Link
                  href={`/events/${e.id}`}
                  className="flex h-11 items-center justify-center rounded-lg border border-brand text-sm font-bold text-brand-strong hover:bg-brand-soft"
                >
                  자세히 보고 신청하기
                </Link>
              </EventCard>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[13px] leading-relaxed text-muted">계약서 서명과 정산 내역은 다음 단계에서 열려요.</p>
      <SignOutButton />
    </PageShell>
  );
}
