import Link from "next/link";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { formatEventRange } from "@/lib/events";
import { EventForm } from "../event-form";
import { copyEventValues, emptyEvent, eventToFormValues } from "../event-form-values";
import { loadRolesAndRules, loadSavedEvent } from "../load";

// 새 일정. ?copy=<일정ID>로 열면 그 일정의 내용·시간·인원·단가를 그대로 채우고 날짜만 비운다 (EVT-05)
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ copy?: string }> }) {
  const { supabase } = await requireAdmin();
  const copyId = z.uuid().safeParse((await searchParams).copy);
  const [{ roles, rules }, source] = await Promise.all([
    loadRolesAndRules(supabase),
    copyId.success ? loadSavedEvent(supabase, copyId.data) : Promise.resolve(null),
  ]);
  const initial = source ? copyEventValues(eventToFormValues(source)) : emptyEvent(rules, roles);

  return (
    <>
      <Link href="/admin/events" className="inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 일정 목록
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">{source ? "일정 복사" : "새 일정"}</h1>
      {source && (
        <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-strong">
          「{source.event.title}」({formatEventRange(source.event.start_date, source.event.end_date)})의 내용·시간·모집 인원·단가·추가 지급을 그대로
          가져왔어요. <b>날짜만 골라 주세요.</b>
          {source.days.length > 1 && " 1일차 날짜를 고르면 나머지 날짜도 원래 간격대로 채워져요."} 신청 마감·지급 예정일·톡방 링크는 비워 두었어요. 저장하면
          임시저장(공개 전) 상태로 만들어져요.
        </p>
      )}
      {copyId.success && !source && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">복사할 일정을 찾지 못해 빈 일정으로 열었어요.</p>
      )}
      {roles.length === 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          단가표가 비어 있어요. 날짜마다 단가를 직접 적거나, <Link href="/admin/rates" className="font-bold underline">단가표</Link>에 자주 쓰는 단가를 저장해 두면 버튼 한 번으로 불러올 수 있어요.
        </p>
      )}
      <EventForm mode="create" initial={initial} roles={roles} rules={rules} />
    </>
  );
}
