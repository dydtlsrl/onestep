import Link from "next/link";
import { requireAdmin, TIER_LABEL, type MemberStatus, type MemberTier } from "@/lib/auth";
import { reportLoadError } from "@/lib/error-log";
import { formatPhone } from "@/lib/phone";
import { getSiteUrl } from "@/lib/site-url";
import { memberStatusByPhone } from "./member-status";
import { GroupLinkForm, PersonalLink, RemoveJoinedForm, RemoveListForm, RemoveRowButton, RosterImport } from "./roster-forms";

interface RosterRow {
  id: string;
  list_name: string;
  name: string;
  phone: string;
  tier: MemberTier;
  memo: string;
}

interface PersonalInvite {
  code: string;
  roster_id: string;
  used_count: number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
}

type RowStatus = "none" | "linked" | "pending" | "joined" | "rejected";

const STATUS: Record<RowStatus, { label: string; className: string }> = {
  none: { label: "가입 전", className: "border border-line text-muted" },
  linked: { label: "개인 링크 만듦", className: "bg-ground text-body" },
  pending: { label: "가입 신청함", className: "bg-warn-soft text-warn" },
  joined: { label: "가입함", className: "bg-brand-soft text-brand-strong" },
  rejected: { label: "거절됨", className: "border border-line text-muted" },
};

const FILTERS: { key: "all" | "todo" | RowStatus; label: string }[] = [
  { key: "all", label: "모두" },
  { key: "todo", label: "아직 가입 안 함" },
  { key: "pending", label: "가입 신청함" },
  { key: "joined", label: "가입함" },
];

const untilLabel = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(iso)) : null;

// 사람마다 지금 쓸 수 있는 개인 링크 (가장 최근 것)
function usableLinks(invites: PersonalInvite[]): Map<string, PersonalInvite> {
  const now = Date.now();
  const map = new Map<string, PersonalInvite>();
  for (const inv of invites) {
    const usable = inv.is_active && (inv.max_uses === null || inv.used_count < inv.max_uses) && (!inv.expires_at || new Date(inv.expires_at).getTime() > now);
    if (usable && !map.has(inv.roster_id)) map.set(inv.roster_id, inv);
  }
  return map;
}

function memberStatus(status: MemberStatus | undefined): RowStatus | null {
  if (status === "pending") return "pending";
  if (status === "active" || status === "restricted") return "joined";
  if (status === "rejected") return "rejected";
  return null;
}

// 명단으로 초대 (MEM-07): 기존 엑셀 명단을 넣고, 단체 링크·개인 링크로 초대하고, 누가 가입했는지 본다
export default async function RosterPage({ searchParams }: { searchParams: Promise<{ list?: string; show?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const [{ data, error }, { data: invites }, siteUrl] = await Promise.all([
    supabase.from("roster").select("id, list_name, name, phone, tier, memo").order("list_name").order("name").limit(5000).returns<RosterRow[]>(),
    supabase
      .from("invites")
      .select("code, roster_id, used_count, max_uses, expires_at, is_active")
      .not("roster_id", "is", null)
      .order("created_at", { ascending: false })
      .returns<PersonalInvite[]>(),
    getSiteUrl(),
  ]);
  await reportLoadError("/admin/roster", error);

  const roster = data ?? [];
  const { map: statusByPhone, error: memberError } = await memberStatusByPhone(supabase, roster.map((r) => r.phone));
  await reportLoadError("/admin/roster", memberError);
  const usableLink = usableLinks(invites ?? []);

  const rows = roster.map((r) => {
    const status: RowStatus = memberStatus(statusByPhone.get(r.phone)) ?? (usableLink.has(r.id) ? "linked" : "none");
    return { ...r, status };
  });
  const lists = [...new Set(roster.map((r) => r.list_name))];
  const listFilter = params.list !== undefined && lists.includes(params.list) ? params.list : null;
  const show = FILTERS.some((f) => f.key === params.show) ? (params.show as (typeof FILTERS)[number]["key"]) : "all";
  const visible = rows.filter(
    (r) =>
      (listFilter === null || r.list_name === listFilter) &&
      (show === "all" || (show === "todo" ? r.status === "none" || r.status === "linked" : r.status === show)),
  );
  const joinedCount = rows.filter((r) => r.status === "joined").length;
  const href = (over: { list?: string | null; show?: string }) => {
    const q = new URLSearchParams();
    const list = over.list === undefined ? listFilter : over.list;
    if (list !== null) q.set("list", list);
    const s = over.show ?? show;
    if (s !== "all") q.set("show", s);
    const qs = q.toString();
    return `/admin/roster${qs ? `?${qs}` : ""}`;
  };
  const chip = (active: boolean) =>
    `flex h-10 items-center rounded-full border px-3.5 text-sm ${active ? "border-navy bg-navy font-bold text-white" : "border-field bg-white text-body hover:bg-ground"}`;

  return (
    <>
      <p className="text-sm text-muted">
        기존 인력 명단을 넣어 두면 단체 링크·개인 링크로 초대하고, 누가 가입했는지 볼 수 있어요. 가입 승인 탭에서도 명단과 맞춰 보여 줘요. 명단은 대표만 봐요.
      </p>

      <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-bold">명단 넣기</h2>
        <RosterImport lists={lists} />
      </section>

      {error && <p className="text-sm font-bold text-warn">명단을 불러오지 못했어요. 13번 마이그레이션을 실행했는지 확인해 주세요.</p>}

      {lists.map((list) => {
        const inList = rows.filter((r) => r.list_name === list);
        const remaining = inList.filter((r) => r.status === "none" || r.status === "linked").length;
        return (
          <section key={list} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{list || "이름 없는 명단"}</h2>
              <p className="text-sm text-muted">
                {inList.length}명 · 가입 전 {remaining} · 신청 {inList.filter((r) => r.status === "pending").length} · 가입{" "}
                {inList.filter((r) => r.status === "joined").length}
              </p>
            </div>
            <p className="text-[13px] leading-relaxed text-muted">
              단톡방에 올릴 링크를 만들어요. 최대 가입 수는 아직 가입하지 않은 사람 수로 정해져요. &ldquo;명단에 있는 번호만 가입&rdquo;을 켜면 링크가 퍼져도 이 명단에 없는
              번호로는 가입할 수 없어요.
            </p>
            <GroupLinkForm listName={list} remaining={remaining} />
            <RemoveListForm listName={list} count={inList.length} />
          </section>
        );
      })}

      {roster.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {lists.length > 1 && (
              <>
                <Link href={href({ list: null })} className={chip(listFilter === null)}>
                  모든 명단
                </Link>
                {lists.map((l) => (
                  <Link key={l} href={href({ list: l })} className={chip(listFilter === l)}>
                    {l || "이름 없음"}
                  </Link>
                ))}
                <span className="mx-1 h-6 w-px bg-line" aria-hidden />
              </>
            )}
            {FILTERS.map((f) => (
              <Link key={f.key} href={href({ show: f.key })} className={chip(show === f.key)}>
                {f.label}
              </Link>
            ))}
          </div>
          <p className="text-[13px] leading-relaxed text-muted">
            아직 가입하지 않은 사람에게는 개인 링크(1회용, 14일, 그 사람 번호로만 가입)를 보내요. 휴대폰에서 &ldquo;문자 보내기&rdquo;를 누르면 번호와 안내 문구가 채워진
            문자 앱이 열려요. 컴퓨터에서는 &ldquo;문구 복사&rdquo;로 카톡에 붙여 넣으세요.
          </p>

          <ul className="flex flex-col gap-2">
            {visible.map((r) => {
              const inv = usableLink.get(r.id);
              const st = STATUS[r.status];
              return (
                <li key={r.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold">{r.name}</span>
                      {r.tier === "core" ? (
                        <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{TIER_LABEL.core}</span>
                      ) : (
                        <span className="rounded border border-field px-1.5 py-px text-[11px] text-body">{TIER_LABEL.general}</span>
                      )}
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${st.className}`}>{st.label}</span>
                    </div>
                    <p className="text-[13px] text-muted">
                      {formatPhone(r.phone)}
                      {lists.length > 1 && ` · ${r.list_name || "이름 없는 명단"}`}
                      {r.memo && ` · ${r.memo}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(r.status === "none" || r.status === "linked") && (
                      <PersonalLink
                        rosterId={r.id}
                        name={r.name}
                        phone={r.phone}
                        existing={inv ? { link: `${siteUrl}/join/${inv.code}`, until: untilLabel(inv.expires_at) } : null}
                      />
                    )}
                    <RemoveRowButton rosterId={r.id} name={r.name} />
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && <li className="rounded-xl border border-line bg-white p-8 text-center text-[15px] text-muted">조건에 맞는 사람이 없어요.</li>}
          </ul>

          {joinedCount > 0 && <RemoveJoinedForm count={joinedCount} />}
        </section>
      )}
    </>
  );
}
