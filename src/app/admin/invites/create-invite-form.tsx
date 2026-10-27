"use client";

import { useActionState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";
import { createInvite, type CreateInviteState } from "./actions";

const fieldClass = "h-11 rounded-lg border border-field bg-white px-3 text-sm";

export function CreateInviteForm() {
  const [state, formAction] = useActionState<CreateInviteState, FormData>(createInvite, {});

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <h2 className="text-lg font-bold">새 초대 링크</h2>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-[2_1_220px] flex-col gap-1.5">
          <label htmlFor="memo" className="text-sm font-bold">
            메모 (어디에 보낼 링크인지)
          </label>
          <input id="memo" name="memo" maxLength={100} placeholder="예: 핵심 인력 단톡방" className={fieldClass} />
        </div>
        <div className="flex flex-[1_1_120px] flex-col gap-1.5">
          <label htmlFor="maxUses" className="text-sm font-bold">
            최대 가입 수
          </label>
          <input id="maxUses" name="maxUses" type="number" min={1} max={1000} placeholder="제한 없음" className={fieldClass} />
        </div>
        <div className="flex flex-[1_1_140px] flex-col gap-1.5">
          <label htmlFor="expiresInDays" className="text-sm font-bold">
            사용 기간
          </label>
          <select id="expiresInDays" name="expiresInDays" defaultValue="30" className={fieldClass}>
            <option value="1">1일</option>
            <option value="7">7일</option>
            <option value="30">30일</option>
            <option value="90">90일</option>
            <option value="">기간 제한 없음</option>
          </select>
        </div>
        <SubmitButton pendingText="만드는 중…">링크 만들기</SubmitButton>
      </form>

      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
      {state.link && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-soft p-3">
          <span className="min-w-0 flex-1 break-all text-sm text-brand-strong">{state.link}</span>
          <CopyButton value={state.link} />
        </div>
      )}
    </section>
  );
}
