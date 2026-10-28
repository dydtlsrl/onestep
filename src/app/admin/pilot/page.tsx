import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { EVENT_STATUS_LABEL, formatEventRange, type EventStatus } from "@/lib/events";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  averageMinutes,
  durationStatus,
  eventDuration,
  formatMinutes,
  parsePilotSettings,
  percent,
  PILOT_TARGET,
  rateStatus,
  signTotal,
  summarizeApplications,
  summarizeContracts,
  summarizeSignups,
  type ContractInput,
  type MetricStatus,
} from "@/lib/pilot";
import { PilotForm } from "./pilot-form";

interface EventRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  status: EventStatus;
  created_at: string;
}

interface InviteRow {
  id: string;
  memo: string;
  used_count: number;
  created_at: string;
}

interface MemberRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  invite_id: string | null;
}

interface ApplicationRow {
  event_id: string;
  member_id: string;
  status: string;
  added_by_admin: boolean;
  decided_at: string | null;
}

interface ContractRow {
  event_id: string;
  member_id: string;
  status: ContractInput["status"];
  requested_at: string;
  signed_at: string | null;
}

const STATUS_STYLE: Record<MetricStatus, { label: string; className: string }> = {
  met: { label: "목표 달성", className: "bg-brand-soft text-brand-strong" },
  missed: { label: "목표 미달", className: "bg-warn-soft text-warn" },
  none: { label: "아직 결과 없음", className: "border border-line text-muted" },
};

function Badge({ status }: { status: MetricStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${s.className}`}>{s.label}</span>;
}

// status가 없으면 배지를 달지 않는다 (합격 기준을 아직 정하지 않은 지표)
function MetricCard({ title, value, detail, target, status }: { title: string; value: string; detail: string; target: string; status?: MetricStatus }) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-bold text-body">{title}</h2>
        {status && <Badge status={status} />}
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-sm text-body">{detail}</p>
      <p className="text-[13px] text-muted">목표: {target}</p>
    </section>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold">{title}</h2>
        {help && <p className="text-[13px] leading-relaxed text-muted">{help}</p>}
      </div>
      {children}
    </section>
  );
}

const th = "px-3 py-3 font-bold";
const td = "px-3 py-3";

// 시범 운영 지표 (PRD 9장). 시범 일정·초대 링크를 고르면 가입·신청·계약·처리 시간을 자동으로 계산한다.
export default async function PilotPage() {
  const { supabase } = await requireAdmin();

  const [{ data: setting }, { data: eventData }, { data: inviteData }] = await Promise.all([
    supabase.from("app_settings").select("value").eq("key", "pilot").maybeSingle<{ value: unknown }>(),
    supabase
      .from("events")
      .select("id, title, start_date, end_date, status, created_at")
      .neq("status", "draft")
      .order("start_date", { ascending: false })
      .limit(200)
      .returns<EventRow[]>(),
    supabase.from("invites").select("id, memo, used_count, created_at").order("created_at", { ascending: false }).limit(200).returns<InviteRow[]>(),
  ]);

  const settings = parsePilotSettings(setting?.value);
  const allEvents = eventData ?? [];
  const invites = inviteData ?? [];

  // 지워진 일정·링크는 건너뛴다 (연습 데이터 지우기 뒤)
  const chosenEvents = allEvents.filter((e) => settings.eventIds.includes(e.id));
  const events = chosenEvents.length > 0 ? chosenEvents : allEvents.filter((e) => e.status !== "cancelled");
  const eventIds = events.map((e) => e.id);
  const chosenInvites = invites.filter((i) => settings.inviteIds.includes(i.id));
  const inviteCreatedAt = new Map(invites.map((i) => [i.id, i.created_at]));

  let memberQuery = supabase
    .from("profiles")
    .select("id, name, status, created_at, approved_at, invite_id")
    .eq("role", "member")
    .order("created_at", { ascending: true })
    .limit(1000);
  if (chosenInvites.length > 0) memberQuery = memberQuery.in("invite_id", chosenInvites.map((i) => i.id));

  const none = Promise.resolve({ data: [] as never[] });
  const [{ data: memberData }, { data: privateData }, { data: appData }, { data: contractData }, { data: paymentData }] = await Promise.all([
    memberQuery.returns<MemberRow[]>(),
    supabase.from("member_private").select("member_id, updated_at").returns<{ member_id: string; updated_at: string }[]>(),
    eventIds.length
      ? supabase.from("applications").select("event_id, member_id, status, added_by_admin, decided_at").in("event_id", eventIds).returns<ApplicationRow[]>()
      : none,
    eventIds.length
      ? supabase.from("contracts").select("event_id, member_id, status, requested_at, signed_at").in("event_id", eventIds).returns<ContractRow[]>()
      : none,
    eventIds.length
      ? supabase.from("payments").select("event_id").in("event_id", eventIds).eq("edited", true).neq("status", "cancelled").returns<{ event_id: string }[]>()
      : none,
  ]);

  const privateAt = new Map((privateData ?? []).map((p) => [p.member_id, p.updated_at]));
  const signups = summarizeSignups(
    (memberData ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      createdAt: m.created_at,
      approvedAt: m.approved_at,
      inviteCreatedAt: m.invite_id ? (inviteCreatedAt.get(m.invite_id) ?? null) : null,
      privateUpdatedAt: privateAt.get(m.id) ?? null,
    })),
  );

  const applications = (appData ?? []).map((a) => ({
    eventId: a.event_id,
    memberId: a.member_id,
    status: a.status,
    addedByAdmin: a.added_by_admin,
    decidedAt: a.decided_at,
  }));
  const contracts: ContractInput[] = (contractData ?? []).map((c) => ({
    eventId: c.event_id,
    memberId: c.member_id,
    status: c.status,
    requestedAt: c.requested_at,
    signedAt: c.signed_at,
  }));
  const now = new Date();

  const applyAll = summarizeApplications(applications);
  const signAll = summarizeContracts(contracts, now);
  const perEvent = events.map((e) => ({
    event: e,
    apply: summarizeApplications(applications.filter((a) => a.eventId === e.id)),
    sign: summarizeContracts(contracts.filter((c) => c.eventId === e.id), now),
    duration: eventDuration({ id: e.id, createdAt: e.created_at }, applications, contracts),
  }));
  const average = averageMinutes(perEvent.map((p) => p.duration));
  const doneEvents = perEvent.filter((p) => p.duration.minutes !== null).length;
  const editedPayments = (paymentData ?? []).length;

  const signupBase = settings.invitedCount ?? signups.applied;
  const signupStatus = settings.invitedCount === null ? "none" : rateStatus(signups.completedInTime, signupBase, PILOT_TARGET.signupRate);
  const incidents = settings.incidentPrivacy + settings.incidentPay + settings.incidentOutage;

  const eventOptions = allEvents.map((e) => ({
    id: e.id,
    title: e.title,
    label: `${formatEventRange(e.start_date, e.end_date)} · ${EVENT_STATUS_LABEL[e.status]}`,
  }));
  const inviteOptions = invites.map((i) => ({ id: i.id, memo: i.memo, label: `${formatDate(i.created_at)} 만듦 · ${i.used_count}명 가입` }));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">시범 운영 지표</h1>
        <p className="text-sm text-muted">
          시범 일정과 초대 링크를 고르면 가입·신청·계약 숫자는 앱이 자동으로 셉니다. 인터뷰·사고 건수처럼 앱 밖의 값은 아래에 적어 주세요.
        </p>
      </div>

      {!setting && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
          시범 운영 설정이 아직 없어요. Supabase SQL Editor에서 <code>20261105000000_pilot_metrics.sql</code>(10번)을 실행해야 값을 저장할 수 있어요. 자동 지표는 지금도 볼 수 있어요.
        </div>
      )}
      <p className="text-[13px] text-muted">
        계산 대상: {chosenEvents.length > 0 ? `고른 일정 ${events.length}건` : `일정을 고르지 않아 공개한 모든 일정 ${events.length}건`} ·{" "}
        {chosenInvites.length > 0 ? `고른 초대 링크 ${chosenInvites.length}개로 가입한 ${signups.applied}명` : `모든 가입자 ${signups.applied}명`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          title="시범 가입률"
          value={settings.invitedCount === null ? `${signups.completedInTime}명` : percent(signups.completedInTime, signupBase)}
          detail={
            settings.invitedCount === null
              ? `2주 안에 승인·정산 정보까지 마친 사람. 초대한 인원을 적으면 비율로 보여요.`
              : `초대 ${signupBase}명 중 ${signups.completedInTime}명이 2주 안에 승인·정산 정보까지 마침`
          }
          target={`초대 후 2주 안에 ${PILOT_TARGET.signupRate * 100}% 이상 (전체 확산 단계 목표)`}
          status={signupStatus}
        />
        <MetricCard
          title="앱 신청 비율"
          value={percent(applyAll.viaApp, applyAll.total)}
          detail={`신청·직접 추가 ${applyAll.total}건 중 앱 신청 ${applyAll.viaApp}건`}
          target={`${PILOT_TARGET.appApplyRate * 100}% 이상`}
          status={rateStatus(applyAll.viaApp, applyAll.total, PILOT_TARGET.appApplyRate)}
        />
        <MetricCard
          title="24시간 안 계약 서명"
          value={percent(signAll.onTime, signTotal(signAll))}
          detail={`서명 요청 ${signTotal(signAll)}건 중 ${signAll.onTime}건${signAll.waiting ? ` · 아직 24시간이 안 된 ${signAll.waiting}건은 빼고 셈` : ""}`}
          target={`확정 후 24시간 안에 ${PILOT_TARGET.signRate * 100}% 이상`}
          status={rateStatus(signAll.onTime, signTotal(signAll), PILOT_TARGET.signRate)}
        />
        <MetricCard
          title="대표 처리 시간 (평균)"
          value={average === null ? "—" : formatMinutes(average)}
          detail={`등록부터 확정자 전원 서명까지, 끝난 일정 ${doneEvents}건 평균${
            settings.baselineMinutes === null ? " · 기존 시간을 적으면 비교해요" : ` · 기존 ${formatMinutes(settings.baselineMinutes)}`
          }`}
          target={settings.targetReductionPct ? `기존보다 ${settings.targetReductionPct}% 이상 줄이기` : "기존보다 줄이기"}
          status={durationStatus(average, settings)}
        />
        <MetricCard
          title="계속 쓰겠다 (인터뷰)"
          value={`대표 ${settings.ceoYes}/${settings.ceoResponses} · 인력 ${settings.memberYes}/${settings.memberResponses}`}
          detail="시범 후 의견 질문지 응답을 아래에 적어 주세요."
          target="합격 기준은 시범 전에 정하기"
        />
        <MetricCard
          title="운영 사고"
          value={`${incidents}건`}
          detail={`개인정보 ${settings.incidentPrivacy} · 잘못된 지급 ${settings.incidentPay} · 업무 중단 ${settings.incidentOutage}${
            editedPayments ? ` (참고: 대표가 직접 고친 정산 ${editedPayments}건)` : ""
          }`}
          target="0건. 생기면 출시 전에 원인과 재발 방지 검토"
          status={incidents === 0 ? "met" : "missed"}
        />
      </div>

      <Section title="일정별" help="처리 시간에는 밤·주말처럼 일하지 않은 시간도 들어가요. 확정자 전원이 서명해야 끝난 일정으로 셉니다.">
        {perEvent.length === 0 ? (
          <p className="text-sm text-muted">공개한 일정이 아직 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="stack-table w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                  <th scope="col" className={th}>일정</th>
                  <th scope="col" className={th}>앱 신청</th>
                  <th scope="col" className={th}>24시간 안 서명</th>
                  <th scope="col" className={th}>등록</th>
                  <th scope="col" className={th}>마지막 확정</th>
                  <th scope="col" className={th}>처리 시간</th>
                </tr>
              </thead>
              <tbody>
                {perEvent.map(({ event, apply, sign, duration }) => (
                  <tr key={event.id} className="border-b border-[#eef0f3] last:border-0">
                    <td className={`stack-first ${td}`}>
                      <Link href={`/admin/events/${event.id}`} className="font-bold underline-offset-4 hover:underline max-md:underline">
                        {event.title}
                      </Link>
                      <div className="text-[13px] text-muted">{formatEventRange(event.start_date, event.end_date)}</div>
                    </td>
                    <td data-label="앱 신청" className={td}>
                      {apply.total ? `${apply.viaApp}/${apply.total}` : "—"}
                    </td>
                    <td data-label="24시간 안 서명" className={td}>
                      {signTotal(sign) + sign.waiting === 0 ? (
                        "—"
                      ) : (
                        <>
                          {sign.onTime}/{signTotal(sign)}
                          {(sign.overdue > 0 || sign.waiting > 0) && (
                            <span className="ml-1 text-[13px] text-muted">
                              {[sign.overdue && `미서명 ${sign.overdue}`, sign.waiting && `기다리는 중 ${sign.waiting}`].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="등록" className={`whitespace-nowrap ${td}`}>{formatDateTime(event.created_at)}</td>
                    <td data-label="마지막 확정" className={`whitespace-nowrap ${td}`}>
                      {duration.lastSelectedAt ? formatDateTime(duration.lastSelectedAt) : "—"}
                    </td>
                    <td data-label="처리 시간" className={`whitespace-nowrap ${td}`}>
                      {duration.minutes !== null ? (
                        <span className="font-bold">{formatMinutes(duration.minutes)}</span>
                      ) : duration.selected > 0 ? (
                        <span className="text-muted">서명 {duration.signed}/{duration.selected}</span>
                      ) : (
                        <span className="text-muted">확정 전</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="가입"
        help="초대 링크를 만든 때부터, 대표 승인과 정산 정보(주민번호·계좌) 등록을 모두 마친 때까지 걸린 날이에요. 정산 정보를 나중에 고치면 고친 때로 바뀌어요."
      >
        {signups.rows.length === 0 ? (
          <p className="text-sm text-muted">가입한 사람이 아직 없어요.</p>
        ) : (
          <>
            <p className="text-sm text-body">
              가입 신청 {signups.applied}명 · 승인 {signups.approved}명 · 정산 정보까지 {signups.completed}명 · 2주 안에 마침 {signups.completedInTime}명
            </p>
            <div className="overflow-x-auto">
              <table className="stack-table w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                    <th scope="col" className={th}>이름</th>
                    <th scope="col" className={th}>가입 신청</th>
                    <th scope="col" className={th}>승인</th>
                    <th scope="col" className={th}>모두 마침</th>
                    <th scope="col" className={th}>걸린 날</th>
                  </tr>
                </thead>
                <tbody>
                  {signups.rows.map((r) => (
                    <tr key={r.id} className="border-b border-[#eef0f3] last:border-0">
                      <td className={`stack-first ${td}`}>
                        <Link href={`/admin/members/${r.id}`} className="font-bold underline-offset-4 hover:underline max-md:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td data-label="가입 신청" className={`whitespace-nowrap ${td}`}>{formatDateTime(r.createdAt)}</td>
                      <td data-label="승인" className={`whitespace-nowrap ${td}`}>{r.approvedAt ? formatDateTime(r.approvedAt) : "—"}</td>
                      <td data-label="모두 마침" className={`whitespace-nowrap ${td}`}>
                        {r.completedAt ? formatDateTime(r.completedAt) : <span className="text-muted">{r.approvedAt ? "정산 정보 없음" : "승인 전"}</span>}
                      </td>
                      <td data-label="걸린 날" className={`whitespace-nowrap ${td}`}>
                        {r.days === null ? "—" : <span className={r.withinTarget ? "font-bold text-brand-strong" : "font-bold text-warn"}>{r.days}일</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      <Section title="시범 대상과 직접 적는 값" help="저장하면 위 지표가 다시 계산돼요. 값을 바꿀 때마다 이력이 남아요.">
        <PilotForm settings={settings} events={eventOptions} invites={inviteOptions} />
      </Section>
    </>
  );
}
