import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { STATUS_BADGE } from "./badges";
import {
  DAY_KIND_LABEL,
  EVENT_STATUS_LABEL,
  EVENT_TYPE_LABEL,
  formatEventRange,
  formatTime,
  todayKst,
  type DayKind,
  type ApplicationStatus,
  type EventStatus,
  type EventType,
} from "@/lib/events";
import { reportLoadError } from "@/lib/error-log";

interface ListRow {
  id: string;
  type: EventType;
  title: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  event_days: { day_date: string; kind: DayKind; start_time: string; end_time: string; headcount: number }[];
  applications: { status: ApplicationStatus }[];
}

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

async function loadEvents(supabase: Supabase, past: boolean) {
  const today = todayKst(Date.now());
  let query = supabase
    .from("events")
    .select("id, type, title, start_date, end_date, status, event_days(day_date, kind, start_time, end_time, headcount), applications(status)")
    .limit(200);
  // 여러 날짜 일정은 마지막 날이 지나야 지난 일정이 된다
  query = past
    ? query.lt("end_date", today).order("start_date", { ascending: false })
    : query.gte("end_date", today).order("start_date", { ascending: true });
  return query.returns<ListRow[]>();
}

// 일정 목록. 다가오는 일정이 먼저, 지난 일정은 따로 본다.
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase } = await requireAdmin();
  const past = (await searchParams).view === "past";
  const { data, error } = await loadEvents(supabase, past);
  const events = data ?? [];

  await reportLoadError("/admin/events", error);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">일정</h1>
          <p className="text-sm text-muted">일정을 만들고, 핵심 인력에게 먼저 공개하고, 신청자를 선발해요.</p>
        </div>
        <Link href="/admin/events/new" className="flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
          새 일정
        </Link>
      </div>

      <nav aria-label="일정 보기" className="flex gap-1 border-b border-line">
        {[
          { href: "/admin/events", label: "다가오는 일정", active: !past },
          { href: "/admin/events?view=past", label: "지난 일정", active: past },
        ].map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={`-mb-px border-b-[3px] px-4 py-3 text-[15px] ${tab.active ? "border-brand font-bold text-ink" : "border-transparent text-muted"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {error && <p className="text-sm font-bold text-warn">일정을 불러오지 못했어요. 네 번째 마이그레이션을 적용했는지 확인해 주세요.</p>}

      {events.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="stack-table w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                <th scope="col" className="px-4 py-3 font-bold">날짜</th>
                <th scope="col" className="px-3 py-3 font-bold">일정</th>
                <th scope="col" className="px-3 py-3 font-bold">상태</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">확정 / 모집 (날짜 합계)</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">처리 전 신청</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const headcount = e.event_days.reduce((sum, d) => sum + d.headcount, 0);
                const selected = e.applications.filter((a) => a.status === "selected").length;
                const waiting = e.applications.filter((a) => a.status === "applied").length;
                const days = [...e.event_days].sort((a, b) => a.day_date.localeCompare(b.day_date));
                return (
                  <tr key={e.id} className="border-b border-[#eef0f3] last:border-0">
                    <td data-label="날짜" className="whitespace-nowrap px-4 py-3">
                      <div className="font-bold">{formatEventRange(e.start_date, e.end_date)}</div>
                      <div className="text-[13px] text-muted">
                        {days.length === 1
                          ? `${formatTime(days[0].start_time)}–${formatTime(days[0].end_time)}`
                          : `${days.length}일 · ${days.map((d) => DAY_KIND_LABEL[d.kind]).join("·")}`}
                      </div>
                    </td>
                    <td className="stack-first px-3 py-3">
                      <Link href={`/admin/events/${e.id}`} className="font-bold text-ink underline-offset-4 hover:underline max-md:text-base max-md:underline">
                        {e.title}
                      </Link>
                      <div className="text-[13px] text-muted">{EVENT_TYPE_LABEL[e.type]}</div>
                    </td>
                    <td data-label="상태" className="px-3 py-3">
                      <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[e.status]}`}>
                        {EVENT_STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td data-label="확정 / 모집" className="whitespace-nowrap px-3 py-3 text-right">
                      <strong>{selected}</strong> / {headcount}명
                    </td>
                    <td data-label="처리 전 신청" className="px-4 py-3 text-right">
                      {waiting > 0 ? <span className="font-bold text-warn">{waiting}건</span> : <span className="text-muted">없음</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!error && events.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-[15px] text-muted">
          {past ? "지난 일정이 없어요." : "다가오는 일정이 없어요. ‘새 일정’으로 만들어 주세요."}
        </div>
      )}
    </>
  );
}
