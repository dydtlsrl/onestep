"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatWon } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/settlement";
import { setPaymentStatus, type PayStatusState } from "./actions";

export interface PayRow {
  id: string;
  name: string;
  eventId: string;
  eventTitle: string;
  status: PaymentStatus;
  gross: number;
  tax: number;
  net: number;
  account: string; // 은행 ****1234 또는 미등록
  heldReason: string;
}

const BADGE: Record<PaymentStatus, string> = {
  draft: "bg-ground text-body",
  scheduled: "bg-brand-soft text-brand-strong",
  held: "bg-warn-soft text-warn",
  paid: "bg-brand text-white",
  cancelled: "border border-line text-muted",
};

// 누른 버튼의 status 값(paid·held·scheduled)이 함께 전송된다
function StatusButton({ status, disabled, primary, children }: { status: string; disabled: boolean; primary?: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  const look = primary
    ? "bg-brand text-white hover:bg-brand-strong disabled:bg-line disabled:text-muted"
    : "border border-field bg-white text-ink hover:bg-ground disabled:text-muted";
  return (
    <button type="submit" name="status" value={status} disabled={disabled || pending} className={`h-11 rounded-lg px-4 text-sm font-bold ${look}`}>
      {pending ? "처리 중…" : children}
    </button>
  );
}

// 지급일 하나의 정산 목록. 골라서 지급 완료·보류·보류 해제
export function PaymentTable({ rows }: { rows: PayRow[] }) {
  const [state, action] = useActionState<PayStatusState, FormData>(setPaymentStatus, {});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const selectable = rows.filter((r) => r.status !== "paid" && r.status !== "cancelled");
  const allChecked = selectable.length > 0 && selectable.every((r) => checked.has(r.id));
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={action} className="flex flex-col gap-3">
      {[...checked].map((id) => (
        <input key={id} type="hidden" name="paymentId" value={id} />
      ))}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-ground text-left text-[13px] text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="모두 고르기"
                  checked={allChecked}
                  onChange={() => setChecked(allChecked ? new Set() : new Set(selectable.map((r) => r.id)))}
                  className="h-4 w-4"
                />
              </th>
              <th scope="col" className="px-3 py-2">이름</th>
              <th scope="col" className="px-3 py-2">일정</th>
              <th scope="col" className="px-3 py-2">상태</th>
              <th scope="col" className="px-3 py-2">계좌</th>
              <th scope="col" className="px-3 py-2 text-right">세전</th>
              <th scope="col" className="px-3 py-2 text-right">세금</th>
              <th scope="col" className="px-3 py-2 text-right">실지급</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const canCheck = r.status !== "paid" && r.status !== "cancelled";
              return (
                <tr key={r.id} className={checked.has(r.id) ? "bg-brand-soft" : undefined}>
                  <td className="px-3 py-2">
                    {canCheck && <input type="checkbox" aria-label={`${r.name} 고르기`} checked={checked.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" />}
                  </td>
                  <td className="px-3 py-2 font-bold whitespace-nowrap">{r.name}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/events/${r.eventId}?tab=payments`} className="underline-offset-4 hover:underline">
                      {r.eventTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap ${BADGE[r.status]}`}>{PAYMENT_STATUS_LABEL[r.status]}</span>
                    {r.heldReason && <span className="mt-1 block text-[12px] text-warn">{r.heldReason}</span>}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${r.account === "미등록" ? "font-bold text-warn" : ""}`}>{r.account}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatWon(r.gross)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatWon(r.tax)}</td>
                  <td className="px-3 py-2 text-right font-bold whitespace-nowrap">{formatWon(r.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{checked.size}명 고름</span>
        <span className="ml-auto">
          <StatusButton status="paid" disabled={checked.size === 0} primary>
            지급 완료로 바꾸기
          </StatusButton>
        </span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted underline underline-offset-4">보류하거나 보류 풀기</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input name="reason" maxLength={300} placeholder="보류 사유 (예: 계좌 확인 필요)" aria-label="보류 사유" className="h-11 w-64 rounded-lg border border-field px-3" />
          <StatusButton status="held" disabled={checked.size === 0}>
            보류
          </StatusButton>
          <StatusButton status="scheduled" disabled={checked.size === 0}>
            보류 풀기
          </StatusButton>
        </div>
      </details>
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
