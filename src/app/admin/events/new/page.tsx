import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { EMPTY_EVENT, EventForm } from "../event-form";
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
          단가표에 역할이 없어요. <Link href="/admin/rates" className="font-bold underline">단가표</Link>에서 먼저 역할을 만들면 편해요. (직접 입력도 가능해요)
        </p>
      )}
      <EventForm mode="create" initial={EMPTY_EVENT} roles={roles} rules={rules} />
    </>
  );
}
