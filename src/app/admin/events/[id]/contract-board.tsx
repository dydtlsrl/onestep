"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatDateTime } from "@/lib/format";
import { CONTRACT_STATUS_LABEL, type ContractStatus } from "@/lib/settlement";
import { remindContracts, requestContracts, voidContract, type SettleState } from "./settle-actions";

export interface ContractRow {
  memberId: string;
  name: string;
  hasPrivate: boolean;
  contract: { id: string; status: ContractStatus; requestedAt: string; signedAt: string | null } | null;
}

const BADGE: Record<ContractStatus | "none", string> = {
  none: "border border-line text-muted",
  requested: "bg-warn-soft text-warn",
  signed: "bg-brand text-white",
  voided: "border border-line text-muted",
};

function Result({ state }: { state: SettleState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm font-bold text-warn">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-sm font-bold text-brand-strong">
        {state.ok}
      </p>
    );
  return null;
}

function VoidForm({ eventId, contractId }: { eventId: string; contractId: string }) {
  const [state, action] = useActionState<SettleState, FormData>(voidContract, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline underline-offset-4">무효로 하기</summary>
      <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="contractId" value={contractId} />
        <input name="reason" required maxLength={300} placeholder="이유 (예: 금액 수정)" aria-label="무효 이유" className="h-10 w-48 rounded-lg border border-field px-3 text-sm" />
        <SubmitButton variant="secondary" pendingText="처리 중…" className="h-10">
          무효
        </SubmitButton>
        <Result state={state} />
      </form>
    </details>
  );
}

function SendOne({ eventId, memberId }: { eventId: string; memberId: string }) {
  const [state, action] = useActionState<SettleState, FormData>(requestContracts, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="memberId" value={memberId} />
      <SubmitButton variant="secondary" pendingText="보내는 중…" className="h-9 text-[13px]">
        보내기
      </SubmitButton>
      <Result state={state} />
    </form>
  );
}

// 일정 상세의 "계약" 탭: 확정자에게 계약서 보내기, 서명 현황, 다시 알림, 무효
export function ContractBoard({ eventId, rows, canSend }: { eventId: string; rows: ContractRow[]; canSend: boolean }) {
  const [sendState, sendAction] = useActionState<SettleState, FormData>(requestContracts, {});
  const [remindState, remindAction] = useActionState<SettleState, FormData>(remindContracts, {});
  const notSent = rows.filter((r) => !r.contract || r.contract.status === "voided").length;
  const waiting = rows.filter((r) => r.contract?.status === "requested").length;
  const signed = rows.filter((r) => r.contract?.status === "signed").length;

  return (
    <section className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["서명 완료", signed],
          ["서명 대기", waiting],
          ["안 보냄", notSent],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl border border-line bg-white p-3">
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="text-xl font-bold">{n}명</dd>
          </div>
        ))}
      </dl>

      {canSend ? (
        <div className="flex flex-wrap gap-2">
          <form action={sendAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <SubmitButton pendingText="보내는 중…" disabled={notSent === 0}>
              {notSent > 0 ? `안 보낸 ${notSent}명에게 계약서 보내기` : "모두 보냈어요"}
            </SubmitButton>
          </form>
          <form action={remindAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <SubmitButton variant="secondary" pendingText="알리는 중…" disabled={waiting === 0}>
              서명 안 한 {waiting}명에게 다시 알림
            </SubmitButton>
          </form>
        </div>
      ) : (
        <p className="rounded-lg bg-ground px-4 py-3 text-sm text-body">공개 전이거나 취소된 일정이라 계약서를 보낼 수 없어요.</p>
      )}
      <Result state={sendState} />
      <Result state={remindState} />
      <p className="text-[13px] leading-relaxed text-muted">
        계약서는 &ldquo;계약서 양식&rdquo; 메뉴의 최신 양식에, 지금 정해진 날짜·역할·단가로 계산한 예상 보수를 넣어 보내요. 보낸 뒤에 단가나 역할을 바꿨다면 무효로 하고 다시 보내세요. 확정을 풀면 계약서는 자동으로 무효가 돼요.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">확정된 사람이 없어요. 신청자·선발 탭에서 먼저 확정해 주세요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
          {rows.map((r) => {
            const status = r.contract?.status ?? "none";
            return (
              <li key={r.memberId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <span className="w-24 font-bold">{r.name}</span>
                <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${BADGE[status]}`}>{status === "none" ? "안 보냄" : CONTRACT_STATUS_LABEL[status]}</span>
                <span className="text-[13px] text-muted">
                  {r.contract?.signedAt ? `서명 ${formatDateTime(r.contract.signedAt)}` : r.contract && r.contract.status === "requested" ? `보냄 ${formatDateTime(r.contract.requestedAt)}` : ""}
                </span>
                {!r.hasPrivate && <span className="text-[13px] text-warn">정산 정보 미등록</span>}
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  {r.contract && (
                    <Link href={`/contracts/${r.contract.id}`} className="text-sm font-bold text-brand-strong underline underline-offset-4">
                      보기
                    </Link>
                  )}
                  {r.contract && r.contract.status !== "voided" && <VoidForm eventId={eventId} contractId={r.contract.id} />}
                  {canSend && (!r.contract || r.contract.status === "voided") && <SendOne eventId={eventId} memberId={r.memberId} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
