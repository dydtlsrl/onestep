import Link from "next/link";
import { requireAdmin, TIER_LABEL, type MemberRole, type MemberStatus, type MemberTier } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import {
  parseMemberFilters,
  STATUS_FILTER_LABEL,
  STATUS_LABEL,
  TIER_FILTER_LABEL,
  type StatusFilter,
  type TierFilter,
} from "@/lib/members";
import { formatPhone, normalizePhone } from "@/lib/phone";

interface MemberRow {
  id: string;
  name: string;
  phone: string;
  region: string;
  career_years: number;
  role: MemberRole;
  status: MemberStatus;
  tier: MemberTier;
  created_at: string;
}

interface NoteCount {
  member_id: string;
  no_show_count: number;
  late_count: number;
}

const STATUS_BADGE: Record<MemberStatus, string> = {
  active: "bg-brand-soft text-brand-strong",
  restricted: "bg-warn-soft text-warn",
  pending: "bg-ground text-body",
  rejected: "border border-line text-muted",
  withdrawn: "border border-line text-muted",
};

const selectClass = "h-11 rounded-lg border border-field bg-white px-3 text-sm";

// 회원 목록. 이름이나 휴대폰 번호로 찾고, 상태·등급으로 거른다.
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase } = await requireAdmin();
  const filters = parseMemberFilters(await searchParams);

  let query = supabase
    .from("profiles")
    .select("id, name, phone, region, career_years, role, status, tier, created_at")
    .order("name", { ascending: true })
    .limit(1000);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.tier !== "all") query = query.eq("tier", filters.tier);
  if (filters.q) {
    const digits = normalizePhone(filters.q);
    query = digits.length >= 3
      ? query.or(`name.ilike.%${filters.q}%,phone.like.%${digits}%`)
      : query.ilike("name", `%${filters.q}%`);
  }

  const [{ data, error }, { data: counts }] = await Promise.all([
    query.returns<MemberRow[]>(),
    supabase.from("member_note_counts").select("member_id, no_show_count, late_count").returns<NoteCount[]>(),
  ]);
  const members = data ?? [];
  const countByMember = new Map((counts ?? []).map((c) => [c.member_id, c]));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">회원</h1>
        <p className="text-sm text-muted">이름을 누르면 등급 변경, 활동 제한, 관리자 기록을 볼 수 있어요.</p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-4">
        <div className="flex flex-[2_1_220px] flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-bold">
            이름 또는 휴대폰 번호
          </label>
          <input
            id="q"
            name="q"
            defaultValue={filters.q}
            placeholder="예: 김하늘, 5678"
            className="h-11 rounded-lg border border-field bg-white px-3 text-sm"
          />
        </div>
        <div className="flex flex-[1_1_130px] flex-col gap-1.5">
          <label htmlFor="status" className="text-sm font-bold">
            상태
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={selectClass}>
            {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_FILTER_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-[1_1_130px] flex-col gap-1.5">
          <label htmlFor="tier" className="text-sm font-bold">
            등급
          </label>
          <select id="tier" name="tier" defaultValue={filters.tier} className={selectClass}>
            {(Object.keys(TIER_FILTER_LABEL) as TierFilter[]).map((value) => (
              <option key={value} value={value}>
                {TIER_FILTER_LABEL[value]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
          찾기
        </button>
      </form>

      {error && <p className="text-sm font-bold text-warn">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}

      <p className="text-sm text-muted">{members.length}명</p>

      {members.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-[#f8f9fa] text-left text-[13px] text-body">
                <th scope="col" className="px-4 py-3 font-bold">이름</th>
                <th scope="col" className="px-3 py-3 font-bold">상태</th>
                <th scope="col" className="px-3 py-3 font-bold">휴대폰</th>
                <th scope="col" className="px-3 py-3 font-bold">지역</th>
                <th scope="col" className="px-3 py-3 text-right font-bold">경력</th>
                <th scope="col" className="px-3 py-3 font-bold">노쇼·지각</th>
                <th scope="col" className="px-4 py-3 font-bold">가입 신청일</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const c = countByMember.get(m.id);
                const issues = (c?.no_show_count ?? 0) + (c?.late_count ?? 0);
                return (
                  <tr key={m.id} className="border-b border-[#eef0f3] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Link href={`/admin/members/${m.id}`} className="font-bold text-ink underline-offset-4 hover:underline">
                          {m.name}
                        </Link>
                        {m.tier === "core" ? (
                          <span className="rounded bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">{TIER_LABEL.core}</span>
                        ) : (
                          <span className="rounded border border-field px-1.5 py-px text-[11px] text-body">{TIER_LABEL.general}</span>
                        )}
                        {m.role === "admin" && <span className="text-[11px] font-bold text-muted">대표</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${STATUS_BADGE[m.status]}`}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">{formatPhone(m.phone)}</td>
                    <td className="px-3 py-3 text-body">{m.region || "—"}</td>
                    <td className="px-3 py-3 text-right">{m.career_years}년</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {issues > 0 ? (
                        <span className="font-bold text-warn">
                          노쇼 {c?.no_show_count ?? 0} · 지각 {c?.late_count ?? 0}
                        </span>
                      ) : (
                        <span className="text-muted">없음</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDate(m.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!error && members.length === 0 && (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-[15px] text-muted">
          조건에 맞는 회원이 없어요.
        </div>
      )}
    </>
  );
}
