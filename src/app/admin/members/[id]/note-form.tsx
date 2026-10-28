"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { NOTE_TYPES } from "@/lib/members";
import { addNote, deleteNote, type MemberActionState } from "./actions";

// 관리자 기록 작성
export function NoteForm({ memberId }: { memberId: string }) {
  const [state, action] = useActionState<MemberActionState, FormData>(addNote, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm font-bold">종류</legend>
        {NOTE_TYPES.map((t, i) => (
          <label
            key={t.value}
            className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-field bg-white px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft has-[:checked]:font-bold has-[:checked]:text-brand-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand"
          >
            <input type="radio" name="type" value={t.value} defaultChecked={i === 0} className="sr-only" />
            {t.label}
          </label>
        ))}
      </fieldset>
      <label htmlFor="content" className="mt-1 text-sm font-bold">
        내용
      </label>
      <textarea
        id="content"
        name="content"
        rows={3}
        maxLength={1000}
        required
        placeholder="예: 10/24 필기시험, 집합 15분 늦음. 사전 연락 있었음"
        className="w-full rounded-lg border border-field bg-white p-3 text-sm"
      />
      <p className="text-[13px] leading-relaxed text-muted">
        날짜와 있었던 일을 사실대로 적어 주세요. 회원이 개인정보 열람을 요구하면 이 기록을 보여 줘야 할 수 있어요.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="저장 중…">기록 남기기</SubmitButton>
        {state.error && (
          <p role="alert" className="text-sm font-bold text-warn">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p role="status" className="text-sm font-bold text-brand-strong">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

// 잘못 쓴 기록 삭제 (한 번 더 묻는다)
export function DeleteNoteButton({ noteId, memberId }: { noteId: string; memberId: string }) {
  return (
    <form
      action={deleteNote}
      onSubmit={(e) => {
        if (!window.confirm("이 기록을 지울까요? 지우면 되돌릴 수 없어요.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="noteId" value={noteId} />
      <input type="hidden" name="memberId" value={memberId} />
      <button type="submit" className="inline-flex min-h-10 items-center text-[13px] text-muted underline underline-offset-4 hover:text-warn">
        삭제
      </button>
    </form>
  );
}
