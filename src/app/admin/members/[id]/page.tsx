import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin, TIER_LABEL, type MemberRole, type MemberStatus, type MemberTier } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { NOTE_TYPE_LABEL, STATUS_LABEL, type NoteType } from "@/lib/members";
import { formatPhone } from "@/lib/phone";
import { MemberControls } from "./member-controls";
import { MemberRateForm } from "./member-rate-form";
import { PrivateCard, type PrivateMasked } from "./private-card";
import { parsePayRules } from "@/lib/pay";
import { DeleteNoteButton, NoteForm } from "./note-form";

interface MemberDetail {
  id: string;
  name: string;
  phone: string;
  region: string;
  career_years: number;
  career_note: string;
  referrer_name: string;
  role: MemberRole;
  status: MemberStatus;
  tier: MemberTier;
  status_reason: string;
  default_rate: number | null;
  created_at: string;
  approved_at: string | null;
  invites: { memo: string } | null;
}

interface NoteRow {
  id: string;
  type: NoteType;
  content: string;
  created_at: string;
  author: { name: string } | null;
}

const NOTE_BADGE: Record<NoteType, string> = {
  memo: "bg-ground text-body",
  no_show: "bg-warn-soft text-warn",
  late: "bg-warn-soft text-warn",
  caution: "bg-warn-soft text-warn",
  praise: "bg-brand-soft text-brand-strong",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

// 회원 상세: 신청 정보, 등급·상태 관리, 관리자 기록
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const { supabase } = await requireAdmin();
  const [{ data: member }, { data: notes }, { data: setting }, { data: priv }, { data: participation }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, phone, region, career_years, career_note, referrer_name, role, status, tier, status_reason, default_rate, created_at, approved_at, invites(memo)",
      )
      .eq("id", id)
      .maybeSingle<MemberDetail>(),
    supabase
      .from("member_notes")
      .select("id, type, content, created_at, author:profiles!member_notes_created_by_fkey(name)")
      .eq("member_id", id)
      .order("created_at", { ascending: false })
      .returns<NoteRow[]>(),
    supabase.from("app_settings").select("value").eq("key", "pay_rules").maybeSingle<{ value: unknown }>(),
    supabase.from("member_private").select("rrn_masked, bank_name, account_masked, account_holder, address").eq("member_id", id).maybeSingle<PrivateMasked>(),
    supabase.from("member_participation").select("attended_count").eq("member_id", id).maybeSingle<{ attended_count: number }>(),
  ]);

  if (!member) notFound();
  const timeline = notes ?? [];
  const noShow = timeline.filter((n) => n.type === "no_show").length;
  const late = timeline.filter((n) => n.type === "late").length;

  return (
    <>
      <Link href="/admin/members" className="text-sm text-muted underline-offset-4 hover:underline">
        ← 회원 목록
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{member.name}</h1>
        <span className="rounded-md bg-navy px-2 py-0.5 text-xs font-bold text-white">{TIER_LABEL[member.tier]}</span>
        <span className="rounded-md border border-line px-2 py-0.5 text-xs font-bold text-body">{STATUS_LABEL[member.status]}</span>
        {member.role === "admin" && <span className="text-xs font-bold text-muted">대표 계정</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Section title="신청 정보">
            <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">휴대폰</dt>
              <dd>
                <a href={`tel:${member.phone}`} className="underline-offset-4 hover:underline">
                  {formatPhone(member.phone)}
                </a>
              </dd>
              <dt className="text-muted">활동 지역</dt>
              <dd>{member.region || "—"}</dd>
              <dt className="text-muted">경력</dt>
              <dd>{member.career_years}년</dd>
              <dt className="text-muted">경력 사항</dt>
              <dd className="whitespace-pre-line">{member.career_note || "—"}</dd>
              <dt className="text-muted">추천인</dt>
              <dd>{member.referrer_name || "—"}</dd>
              <dt className="text-muted">초대 링크</dt>
              <dd>{member.invites?.memo || "—"}</dd>
              <dt className="text-muted">신청일</dt>
              <dd>{formatDate(member.created_at)}</dd>
              <dt className="text-muted">승인일</dt>
              <dd>{member.approved_at ? formatDate(member.approved_at) : "—"}</dd>
            </dl>
          </Section>
          <Section title="정산 정보">
            <PrivateCard memberId={member.id} info={priv ?? null} />
          </Section>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="활동 요약">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-ground p-3">
                <p className="text-[13px] text-muted">참여</p>
                <p className="text-xl font-bold">{Number(participation?.attended_count ?? 0)}</p>
              </div>
              <div className={`rounded-lg p-3 ${noShow ? "bg-warn-soft" : "bg-ground"}`}>
                <p className="text-[13px] text-muted">노쇼</p>
                <p className={`text-xl font-bold ${noShow ? "text-warn" : ""}`}>{noShow}</p>
              </div>
              <div className={`rounded-lg p-3 ${late ? "bg-warn-soft" : "bg-ground"}`}>
                <p className="text-[13px] text-muted">지각</p>
                <p className={`text-xl font-bold ${late ? "text-warn" : ""}`}>{late}</p>
              </div>
            </div>
          </Section>

          <Section title="등급과 상태">
            {member.status === "pending" ? (
              <p className="text-sm text-body">
                승인 대기 중이에요.{" "}
                <Link href="/admin/applications" className="font-bold text-brand underline underline-offset-4">
                  가입 승인
                </Link>
                에서 처리해 주세요.
              </p>
            ) : member.status === "rejected" || member.status === "withdrawn" ? (
              <p className="text-sm text-body">{STATUS_LABEL[member.status]} 상태라 바꿀 수 있는 것이 없어요.</p>
            ) : (
              <MemberControls
                memberId={member.id}
                tier={member.tier}
                status={member.status}
                statusReason={member.status_reason}
                isAdmin={member.role === "admin"}
              />
            )}
            {member.role === "member" && (member.status === "active" || member.status === "restricted") && (
              <div className="border-t border-line pt-4">
                <MemberRateForm memberId={member.id} rate={member.default_rate} defaultHourlyRate={parsePayRules(setting?.value).defaultHourlyRate} />
              </div>
            )}
          </Section>
        </div>
      </div>

      <Section title="관리자 기록 (대표만 보임)">
        <NoteForm memberId={member.id} />
        <ol className="flex flex-col border-t border-line">
          {timeline.map((note) => (
            <li key={note.id} className="flex flex-col gap-1.5 border-b border-[#eef0f3] py-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${NOTE_BADGE[note.type]}`}>
                  {NOTE_TYPE_LABEL[note.type]}
                </span>
                <span>{formatDateTime(note.created_at)}</span>
                {note.author?.name && <span>· {note.author.name}</span>}
                <span className="ml-auto">
                  <DeleteNoteButton noteId={note.id} memberId={member.id} />
                </span>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed">{note.content}</p>
            </li>
          ))}
          {timeline.length === 0 && <li className="py-6 text-center text-sm text-muted">아직 남긴 기록이 없어요.</li>}
        </ol>
      </Section>
    </>
  );
}
