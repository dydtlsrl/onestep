import { CopyButton } from "@/components/copy-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { setInviteActive } from "./actions";
import { CreateInviteForm } from "./create-invite-form";
import { reportLoadError } from "@/lib/error-log";

interface InviteRow {
  id: string;
  code: string;
  memo: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

function inviteState(invite: InviteRow, now: number) {
  if (!invite.is_active) return { label: "꺼짐", className: "border border-line text-muted" };
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now)
    return { label: "만료", className: "bg-warn-soft text-warn" };
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses)
    return { label: "다 씀", className: "bg-warn-soft text-warn" };
  return { label: "사용 중", className: "bg-brand-soft text-brand-strong" };
}

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

// 목록을 불러오면서 각 링크의 상태(사용 중·만료·다 씀·꺼짐)를 계산한다
async function loadInvites(supabase: Supabase) {
  const { data, error } = await supabase
    .from("invites")
    .select("id, code, memo, max_uses, used_count, expires_at, is_active, created_at")
    .order("created_at", { ascending: false })
    .returns<InviteRow[]>();
  const now = Date.now();
  return { error, invites: (data ?? []).map((invite) => ({ ...invite, state: inviteState(invite, now) })) };
}

// 초대 링크 관리. 링크를 만들어 오픈톡방 등에 보내고, 필요 없으면 끈다.
export default async function InvitesPage() {
  const { supabase } = await requireAdmin();
  const [{ invites, error }, siteUrl] = await Promise.all([loadInvites(supabase), getSiteUrl()]);

  await reportLoadError("/admin/invites", error);
  return (
    <>
      <p className="text-sm text-muted">링크를 받은 사람만 가입 신청을 할 수 있어요. 가입은 대표가 승인해야 끝나요.</p>

      <CreateInviteForm />

      {error && <p className="text-sm font-bold text-warn">목록을 불러오지 못했어요. 새로고침해 주세요.</p>}

      <ul className="flex flex-col gap-3">
        {invites.map((invite) => {
          const { state } = invite;
          const link = `${siteUrl}/join/${invite.code}`;
          return (
            <li key={invite.id} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{invite.memo || "메모 없음"}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${state.className}`}>{state.label}</span>
                <span className="ml-auto text-sm text-muted">
                  가입 {invite.used_count}
                  {invite.max_uses !== null ? ` / ${invite.max_uses}` : ""}명 ·{" "}
                  {invite.expires_at ? `${formatDate(invite.expires_at)}까지` : "기간 제한 없음"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-md bg-ground px-3 py-2 text-xs text-body">{link}</code>
                <CopyButton value={link} />
                <form action={setInviteActive}>
                  <input type="hidden" name="id" value={invite.id} />
                  <input type="hidden" name="active" value={invite.is_active ? "false" : "true"} />
                  <button
                    type="submit"
                    className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground"
                  >
                    {invite.is_active ? "끄기" : "다시 켜기"}
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      {!error && invites.length === 0 && (
        <p className="text-center text-sm text-muted">아직 만든 초대 링크가 없어요.</p>
      )}
    </>
  );
}
