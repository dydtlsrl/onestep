import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// 머리글의 알림 종. 안 읽은 알림 수를 보여 준다.
export async function NotificationBell() {
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const unread = count ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `알림 ${unread}개 안 읽음` : "알림"}
      className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink hover:bg-ground"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-warn px-1 text-[11px] font-bold text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
