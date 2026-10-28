import { PROFILE_COLUMNS, requireAdmin, TIER_LABEL, type MemberTier, type Profile } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { reportLoadError } from "@/lib/error-log";
import { formatPhone } from "@/lib/phone";
import { DecisionForms } from "./decision-forms";

type PendingProfile = Profile & { invites: { memo: string } | null };

interface RosterMatch {
  phone: string;
  name: string;
  tier: MemberTier;
  memo: string;
  list_name: string;
}

// 가입 승인 대기 목록. 오래된 신청부터 보여 준다.
export default async function ApplicationsPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select(`${PROFILE_COLUMNS}, invites(memo)`)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .returns<PendingProfile[]>();

  const pending = data ?? [];
  // 기존 인력 명단과 휴대폰 번호로 맞춰 본다 (명단이 비어 있으면 표시하지 않는다)
  const [{ data: matches }, { count: rosterCount }] = await Promise.all([
    pending.length
      ? supabase.from("roster").select("phone, name, tier, memo, list_name").in("phone", pending.map((p) => p.phone)).returns<RosterMatch[]>()
      : Promise.resolve({ data: [] as RosterMatch[] }),
    supabase.from("roster").select("id", { count: "exact", head: true }),
  ]);
  const rosterByPhone = new Map((matches ?? []).map((m) => [m.phone, m]));

  await reportLoadError("/admin/applications", error);
  return (
    <>
      <p className="text-sm text-muted">신청서를 확인하고 등급을 정해 승인해 주세요. 승인하면 회원이 바로 이용할 수 있어요.</p>

      {error && <p className="text-sm font-bold text-warn">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}

      {!error && pending.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-[15px] text-muted">
          승인을 기다리는 신청이 없어요.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {pending.map((p) => {
          const match = rosterByPhone.get(p.phone);
          return (
          <li key={p.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{p.name}</h2>
              <span className="text-sm text-muted">신청 {formatDateTime(p.created_at)}</span>
            </div>
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">휴대폰</dt>
              <dd>{formatPhone(p.phone)}</dd>
              <dt className="text-muted">활동 지역</dt>
              <dd>{p.region || "—"}</dd>
              <dt className="text-muted">경력</dt>
              <dd>{p.career_years}년</dd>
              <dt className="text-muted">경력 사항</dt>
              <dd className="whitespace-pre-line">{p.career_note || "—"}</dd>
              <dt className="text-muted">추천인</dt>
              <dd>{p.referrer_name || "—"}</dd>
              <dt className="text-muted">초대 링크</dt>
              <dd>{p.invites?.memo || "—"}</dd>
            </dl>
            {match ? (
              <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-strong">
                <b>명단에 있어요</b> · {match.list_name || "명단"}: {match.name} ({TIER_LABEL[match.tier]}){match.memo && ` · ${match.memo}`}
                {match.name.replace(/\s/g, "") !== p.name.replace(/\s/g, "") && (
                  <span className="font-bold text-warn"> · 이름이 달라요 (신청: {p.name})</span>
                )}
              </p>
            ) : (
              (rosterCount ?? 0) > 0 && (
                <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">명단에 없는 휴대폰 번호예요. 아는 사람인지 확인해 주세요.</p>
              )
            )}
            <DecisionForms memberId={p.id} name={p.name} defaultTier={match?.tier ?? "general"} />
          </li>
          );
        })}
      </ul>
    </>
  );
}
