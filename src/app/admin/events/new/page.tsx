import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { EventForm } from "../event-form";
import { emptyEvent } from "../event-form-values";
import { loadRolesAndRules } from "../load";

export default async function NewEventPage() {
  const { supabase } = await requireAdmin();
  const { roles, rules } = await loadRolesAndRules(supabase);

  return (
    <>
      <Link href="/admin/events" className="text-sm text-muted underline-offset-4 hover:underline">
        ← 일정 목록
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">새 일정</h1>
      {roles.length === 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          단가표가 비어 있어요. 날짜마다 단가를 직접 적거나, <Link href="/admin/rates" className="font-bold underline">단가표</Link>에 자주 쓰는 단가를 저장해 두면 버튼 한 번으로 불러올 수 있어요.
        </p>
      )}
      <EventForm mode="create" initial={emptyEvent(rules, roles)} roles={roles} rules={rules} />
    </>
  );
}
