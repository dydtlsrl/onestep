"use client";

import { useActionState, useState } from "react";
import { SignaturePad } from "@/components/signature-pad";
import { SubmitButton } from "@/components/submit-button";
import { signContract, type SignState } from "../actions";

export function SignForm({ contractId }: { contractId: string }) {
  const [state, action] = useActionState<SignState, FormData>(signContract, {});
  const [signed, setSigned] = useState(false);
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border-2 border-brand bg-white p-5 print:hidden">
      <input type="hidden" name="contractId" value={contractId} />
      <h2 className="text-lg font-bold">서명하기</h2>
      <SignaturePad name="signature" onChange={setSigned} />
      <label className="flex items-start gap-2 text-[15px]">
        <input type="checkbox" name="agree" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5" />
        <span>위 계약 내용을 모두 읽었고, 이에 동의해 전자서명합니다.</span>
      </label>
      <SubmitButton pendingText="서명 저장 중…" disabled={!signed || !agreed} className="h-12 text-[15px]">
        서명 완료
      </SubmitButton>
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
    </form>
  );
}
