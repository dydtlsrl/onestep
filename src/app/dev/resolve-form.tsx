"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { resolveErrors, type ResolveState } from "./actions";

// 오류 묶음 하나를 처리함으로 (메모와 함께), 또는 처리한 묶음을 다시 열기
export function ResolveForm({ ids, resolved }: { ids: number[]; resolved: boolean }) {
  const [state, action] = useActionState<ResolveState, FormData>(resolveErrors, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ids" value={ids.join(",")} />
      <input type="hidden" name="resolved" value={String(resolved)} />
      {resolved && (
        <input
          name="note"
          maxLength={300}
          placeholder="메모 (예: 6c1f2a3에서 고침, 안내 문구로 충분)"
          aria-label="처리 메모"
          className="h-10 min-w-0 flex-[1_1_220px] rounded-lg border border-field bg-white px-3 text-sm"
        />
      )}
      <SubmitButton variant={resolved ? "primary" : "secondary"} pendingText="저장 중…" className="h-10">
        {resolved ? `처리함 (${ids.length}건)` : "다시 열기"}
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
    </form>
  );
}
