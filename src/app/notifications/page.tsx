import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireMember } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { markAllRead, openNotification } from "./actions";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

// 내 알림 목록. 누르면 읽음으로 바뀌고 관련 화면으로 간다.
export default async function NotificationsPage() {
  const { supabase } = await requireMember("/notifications");
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<NotificationRow[]>();
  const items = data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <PageShell>
      <Link href="/" className="-mt-3 text-sm text-muted underline-offset-4 hover:underline">
        ← 처음 화면
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">알림</h1>
        {unread > 0 && (
          <form action={markAllRead}>
            <SubmitButton variant="secondary" pendingText="처리 중…" className="h-10">
              모두 읽음
            </SubmitButton>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-5 text-[15px] text-muted">아직 받은 알림이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <form action={openNotification}>
                <input type="hidden" name="id" value={n.id} />
                <button
                  type="submit"
                  className={`flex w-full flex-col gap-1 rounded-xl border p-4 text-left ${n.read_at ? "border-line bg-white" : "border-brand bg-brand-soft"}`}
                >
                  <span className="flex items-center gap-2">
                    {!n.read_at && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    <span className="font-bold text-ink">{n.title}</span>
                    {!n.read_at && <span className="sr-only">(안 읽음)</span>}
                  </span>
                  {n.body && <span className="text-sm leading-relaxed text-body">{n.body}</span>}
                  <span className="text-[12px] text-muted">{formatDateTime(n.created_at)}</span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[13px] text-muted">최근 50개까지 보여요.</p>
    </PageShell>
  );
}
