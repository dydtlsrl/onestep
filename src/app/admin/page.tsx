import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { chunk } from "@/lib/chunk";
import {
  eventProgress,
  nextPayDay,
  overduePayments,
  SETUP_STEPS,
  TASK_TEXT,
  type DashApp,
  type DashContract,
  type DashEvent,
  type DashPayment,
  type EventProgress,
  type SetupState,
} from "@/lib/dashboard";
import { reportLoadError } from "@/lib/error-log";
import { formatEventDate, formatEventRange, todayKst, type EventStatus } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { parseTaxSettings } from "@/lib/tax";
import { getPendingCount } from "./pending-count";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

interface EventRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  event_days: { id: string; day_date: string }[];
}

function today(): string {
  return todayKst(Date.now());
}

function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// 최근 45일 안에 끝났거나 앞으로 있을 일정과, 그 일정의 신청·계약·정산 (계약서·정산은 끝난 뒤에 하므로 지난 일정도 본다)
async function loadWork(supabase: Supabase, day: string) {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, start_date, end_date, status, event_days(id, day_date)")
    .gte("end_date", daysBefore(day, 45))
    .order("start_date")
    .limit(100)
    .returns<EventRow[]>();
  const ids = (events ?? []).map((e) => e.id);
  const apps: DashApp[] = [];
  const contracts: DashContract[] = [];
  const payments: DashPayment[] = [];
  for (const part of chunk(ids)) {
    const [a, c, p] = await Promise.all([
      supabase.from("applications").select("event_id, member_id, day_id, status, notified_status, attendance").in("event_id", part).in("status", ["selected", "rejected"]).returns<DashApp[]>(),
      supabase.from("contracts").select("event_id, member_id, status").in("event_id", part).returns<DashContract[]>(),
      supabase.from("payments").select("event_id, member_id, status, pay_date, net").in("event_id", part).returns<DashPayment[]>(),
    ]);
    apps.push(...(a.data ?? []));
    contracts.push(...(c.data ?? []));
    payments.push(...(p.data ?? []));
  }
  // 지급일은 오래전 일정의 것도 남아 있을 수 있어 따로 본다
  const { data: open } = await supabase.from("payments").select("event_id, member_id, status, pay_date, net").in("status", ["draft", "scheduled"]).returns<DashPayment[]>();

  const progress = (events ?? []).map((e) =>
    eventProgress({ ...e, days: e.event_days } satisfies DashEvent, apps, contracts, payments, day),
  );
  return { progress, open: open ?? [], error };
}

async function loadSetup(supabase: Supabase): Promise<SetupState> {
  const [{ data: settings }, templates, roster, members, events] = await Promise.all([
    supabase.from("app_settings").select("key, value").in("key", ["company", "tax"]).returns<{ key: string; value: unknown }[]>(),
    supabase.from("contract_templates").select("id", { count: "exact", head: true }).not("created_by", "is", null),
    supabase.from("roster").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "member"),
    supabase.from("events").select("id", { count: "exact", head: true }),
  ]);
  const setting = (key: string) => (settings ?? []).find((s) => s.key === key)?.value as Record<string, unknown> | undefined;
  const company = setting("company") ?? {};
  return {
    company: Boolean(company.ceo) && Boolean(company.phone),
    tax: parseTaxSettings(setting("tax")).type !== "unset",
    template: (templates.count ?? 0) > 0,
    members: (roster.count ?? 0) + (members.count ?? 0) > 0,
    events: (events.count ?? 0) > 0,
  };
}

function Card({ title, children, tone = "plain" }: { title: string; children: React.ReactNode; tone?: "plain" | "brand" | "warn" }) {
  const look = tone === "brand" ? "border-brand bg-brand-soft" : tone === "warn" ? "border-warn/40 bg-warn-soft" : "border-line bg-white";
  return (
    <section className={`flex flex-col gap-3 rounded-xl border p-4 sm:p-5 ${look}`}>
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

// 처음 할 일: 남은 단계만 크게 보여 주고, 끝낸 단계는 한 줄로 접는다
function SetupCard({ setup }: { setup: SetupState }) {
  const done = SETUP_STEPS.filter((s) => setup[s.key]);
  const left = SETUP_STEPS.filter((s) => !setup[s.key]);
  if (left.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">처음 할 일</h2>
          <span className="text-sm text-muted">
            {done.length} / {SETUP_STEPS.length} 완료
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ground" aria-hidden>
          <div className="h-full rounded-full bg-brand" style={{ width: `${(done.length / SETUP_STEPS.length) * 100}%` }} />
        </div>
      </div>
      <ol className="flex flex-col divide-y divide-line">
        {left.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="group flex min-h-14 items-center gap-3 py-3">
              <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-brand text-[13px] font-bold text-brand-strong">
                {SETUP_STEPS.indexOf(s) + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold group-hover:text-brand-strong">{s.title}</span>
                <span className="text-[13px] text-body">{s.help}</span>
              </span>
              <span className="shrink-0 text-sm font-bold text-brand-strong">하러 가기 →</span>
            </Link>
          </li>
        ))}
      </ol>
      {done.length > 0 && (
        <p className="text-[13px] text-muted">
          <span aria-hidden>✓ </span>
          끝낸 일: {done.map((s) => s.title).join(", ")}
        </p>
      )}
    </section>
  );
}

function TodayCard({ events }: { events: EventProgress[] }) {
  if (events.length === 0) return null;
  return (
    <Card title="오늘 현장" tone="brand">
      <ul className="flex flex-col divide-y divide-brand/15">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-3 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-bold">{e.title}</span>
              <span className="text-[13px] text-body">확정 {e.selected}명</span>
            </div>
            <Link
              href={`/admin/events/${e.id}?tab=attendance${e.todayDayId ? `&day=${e.todayDayId}` : ""}`}
              className="flex h-12 items-center justify-center whitespace-nowrap rounded-lg bg-brand px-5 text-base font-bold text-white hover:bg-brand-strong"
            >
              명단·출석 체크
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// 대표 첫 화면: 지금 해야 할 일을 모아 보여 주고, 누르면 그 화면으로 간다 (노트북·휴대폰 모두)
export default async function AdminHomePage() {
  const { supabase, profile } = await requireAdmin();
  const day = today();
  const [{ progress, open, error }, setup, pending] = await Promise.all([loadWork(supabase, day), loadSetup(supabase), getPendingCount()]);
  await reportLoadError("/admin", error);

  const tasks = progress.flatMap((p) => p.tasks);
  const pay = nextPayDay(open, day);
  const overdue = overduePayments(open, day);
  const upcoming = progress.filter((p) => p.start_date > day).slice(0, 3);
  const nothing = pending === 0 && tasks.length === 0 && overdue === 0;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{profile.name}님, 오늘 할 일</h1>
          <p className="text-sm text-muted">{formatEventDate(day)}</p>
        </div>
        <Link href="/admin/events/new" className="flex h-11 shrink-0 items-center rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
          + 새 일정
        </Link>
      </div>

      {error && <p className="text-sm font-bold text-warn">할 일을 불러오지 못했어요. 새로고침해 주세요.</p>}

      <SetupCard setup={setup} />
      <TodayCard events={progress.filter((p) => p.today)} />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="처리할 일">
          {nothing ? (
            <p className="text-sm text-body">지금 처리할 일이 없어요.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {pending > 0 && (
                <TaskRow href="/admin/applications" title="가입 승인" text={`${pending}명이 가입 승인을 기다려요`} action="승인하기" />
              )}
              {tasks.map((t) => (
                <TaskRow
                  key={`${t.eventId}-${t.kind}`}
                  href={`/admin/events/${t.eventId}?tab=${TASK_TEXT[t.kind].tab}`}
                  title={t.eventTitle}
                  text={TASK_TEXT[t.kind].label(t.count)}
                  action={TASK_TEXT[t.kind].action}
                />
              ))}
              {overdue > 0 && (
                <TaskRow href="/admin/payments" title="정산" text={`지급일이 지났는데 지급 완료로 바꾸지 않은 정산이 ${overdue}건 있어요`} action="정산 보기" />
              )}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          {/* 예정된 지급이 없으면 칸을 만들지 않는다 */}
          {pay && (
            <Card title="다음 지급일">
              <div className="flex flex-col gap-2">
                <p className="text-2xl font-bold">{formatEventDate(pay.date)}</p>
                <p className="text-sm text-body">
                  {pay.people}명 · 실지급 합계 <strong className="text-ink">{formatWon(pay.net)}</strong>
                </p>
                {pay.draft > 0 && (
                  <p className="text-[13px] font-bold text-warn">
                    {pay.draft}건은 세금 처리 방식을 정하지 않아 &ldquo;확정 전&rdquo;이에요.{" "}
                    <Link href="/admin/settings" className="underline underline-offset-4">
                      설정에서 정하기
                    </Link>
                  </p>
                )}
                <Link href={`/admin/payments?date=${pay.date}`} className="text-sm font-bold text-brand-strong underline underline-offset-4">
                  이체 파일 받기·지급 완료 처리
                </Link>
              </div>
            </Card>
          )}

          <Card title="다가오는 일정">
            {upcoming.length === 0 ? (
              <p className="text-sm text-body">다가오는 일정이 없어요.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link href={`/admin/events/${e.id}`} className="group flex min-h-12 items-center gap-3 py-2.5">
                      <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                        <span className="text-[13px] font-bold sm:w-28 sm:shrink-0 sm:text-sm">{formatEventRange(e.start_date, e.end_date)}</span>
                        <span className="truncate group-hover:text-brand-strong">{e.title}</span>
                      </span>
                      <span className="shrink-0 text-[13px] text-muted">확정 {e.selected}명</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/admin/events" className="text-sm font-bold text-brand-strong underline underline-offset-4">
              일정 전체 보기
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

function TaskRow({ href, title, text, action }: { href: string; title: string; text: string; action: string }) {
  return (
    <li>
      <Link href={href} className="group flex min-h-14 items-center gap-3 py-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] text-muted">{title}</span>
          <span className="font-bold group-hover:text-brand-strong">{text}</span>
        </span>
        <span className="shrink-0 text-sm font-bold text-brand-strong">{action} →</span>
      </Link>
    </li>
  );
}

