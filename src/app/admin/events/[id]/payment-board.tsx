"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatWon } from "@/lib/format";
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, sumItems, type PaymentItemDraft, type PaymentItemKind, type PaymentStatus } from "@/lib/settlement";
import { calculateTax, TAX_TYPE_LABEL, type TaxSettings } from "@/lib/tax";
import { generatePayments, saveEditedPayment, type SettleState } from "./settle-actions";

export interface SavedPayment {
  status: PaymentStatus;
  payDate: string;
  gross: number;
  incomeTax: number;
  localTax: number;
  net: number;
  edited: boolean;
  memo: string;
  heldReason: string;
  items: PaymentItemDraft[];
}

export interface PaymentRow {
  memberId: string;
  name: string;
  hasPrivate: boolean;
  computed: { items: PaymentItemDraft[]; gross: number; unknownDays: number; missingOvertimeRate: boolean };
  saved: SavedPayment | null;
}

const BADGE: Record<PaymentStatus, string> = {
  draft: "bg-ground text-body",
  scheduled: "bg-brand-soft text-brand-strong",
  held: "bg-warn-soft text-warn",
  paid: "bg-brand text-white",
  cancelled: "border border-line text-muted",
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

type DraftRow = PaymentItemDraft & { key: number; amountText: string };

function editorKey(saved: SavedPayment | null): string {
  return saved ? `${saved.status}|${saved.edited}|${saved.payDate}|${JSON.stringify(saved.items)}` : "new";
}

// 한 사람의 지급 항목을 직접 고친다. 세금은 설정대로 바로 다시 계산해 보여 준다.
function ItemEditor({ eventId, row, tax, defaultPayDate }: { eventId: string; row: PaymentRow; tax: TaxSettings; defaultPayDate: string }) {
  const [state, action] = useActionState<SettleState, FormData>(saveEditedPayment, {});
  const [resetState, resetAction] = useActionState<SettleState, FormData>(generatePayments, {});
  const start = row.saved?.items.length ? row.saved.items : row.computed.items;
  const [items, setItems] = useState<DraftRow[]>(start.map((i, n) => ({ ...i, key: n, amountText: String(i.amount) })));
  const [nextKey, setNextKey] = useState(start.length);

  const parsed = items.map((i) => ({ kind: i.kind, label: i.label.trim(), amount: Number(i.amountText.replace(/[,\s원]/g, "")), day_id: i.day_id }));
  const valid = parsed.length > 0 && parsed.every((i) => i.label && Number.isInteger(i.amount) && i.amount >= 0);
  const { workAmount, extraAmount } = sumItems(valid ? parsed : []);
  const t = calculateTax(workAmount, extraAmount, tax);

  const update = (key: number, patch: Partial<DraftRow>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="memberId" value={row.memberId} />
        <input type="hidden" name="items" value={JSON.stringify(parsed)} />
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.key} className="flex flex-wrap items-center gap-2">
              <select
                aria-label="항목 종류"
                value={i.kind}
                onChange={(e) => update(i.key, { kind: e.target.value as PaymentItemKind })}
                className="h-10 rounded-lg border border-field bg-white px-2 text-sm"
              >
                {(Object.keys(PAYMENT_KIND_LABEL) as PaymentItemKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PAYMENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <input
                aria-label="항목 이름"
                value={i.label}
                maxLength={60}
                onChange={(e) => update(i.key, { label: e.target.value })}
                className="h-10 min-w-0 flex-[1_1_220px] rounded-lg border border-field px-3 text-sm"
              />
              <input
                aria-label="금액(원)"
                inputMode="numeric"
                value={i.amountText}
                onChange={(e) => update(i.key, { amountText: e.target.value })}
                className="h-10 w-28 rounded-lg border border-field px-3 text-right text-sm"
              />
              <button type="button" onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))} className="h-10 rounded-lg px-2 text-sm text-muted underline">
                빼기
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            onClick={() => {
              setItems((l) => [...l, { kind: "other", label: "", amount: 0, amountText: "", day_id: null, key: nextKey }]);
              setNextKey((k) => k + 1);
            }}
            className="h-9 rounded-lg border border-dashed border-field px-3 text-sm"
          >
            + 항목 추가 (식비·보너스·공제 조정 등)
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-bold">지급 예정일</span>
            <input type="date" name="payDate" defaultValue={row.saved?.payDate ?? defaultPayDate} required className="h-10 rounded-lg border border-field px-3" />
          </label>
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1 text-sm">
            <span className="font-bold">메모 (대표만)</span>
            <input name="memo" defaultValue={row.saved?.memo ?? ""} maxLength={300} placeholder="예: 식비 별도 지급" className="h-10 rounded-lg border border-field px-3" />
          </label>
        </div>
        <p className="text-sm text-body">
          세전 {formatWon(workAmount + extraAmount)} − 소득세 {formatWon(t.incomeTax)} − 지방세 {formatWon(t.localTax)} ={" "}
          <strong>{formatWon(workAmount + extraAmount - t.incomeTax - t.localTax)}</strong>
          {t.exempt && " (과세최저한·소액부징수로 세금 없음)"}
        </p>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingText="저장 중…" disabled={!valid}>
            이대로 저장
          </SubmitButton>
        </div>
        <Result state={state} />
      </form>
      {row.saved?.edited && (
        <form action={resetAction} className="flex flex-col gap-1">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="memberId" value={row.memberId} />
          <input type="hidden" name="reset" value="1" />
          <div>
            <SubmitButton variant="secondary" pendingText="계산 중…">
              고친 내용 버리고 자동 계산으로 되돌리기
            </SubmitButton>
          </div>
          <Result state={resetState} />
        </form>
      )}
    </div>
  );
}

// 일정 상세의 "정산" 탭: 출석 기록으로 사람별 지급 항목·세금을 만들고, 필요하면 직접 고친다
export function PaymentBoard({
  eventId,
  rows,
  tax,
  defaultPayDate,
  canSettle,
}: {
  eventId: string;
  rows: PaymentRow[];
  tax: TaxSettings;
  defaultPayDate: string;
  canSettle: boolean;
}) {
  const [state, action] = useActionState<SettleState, FormData>(generatePayments, {});
  const [open, setOpen] = useState<string | null>(null);
  const unknown = rows.reduce((s, r) => s + r.computed.unknownDays, 0);
  const stale = rows.filter((r) => r.saved && !r.saved.edited && (r.saved.status === "draft" || r.saved.status === "scheduled") && r.saved.gross !== r.computed.gross).length;
  const savedRows = rows.filter((r) => r.saved && r.saved.status !== "cancelled");
  const total = (pick: (p: SavedPayment) => number) => savedRows.reduce((s, r) => s + (r.saved ? pick(r.saved) : 0), 0);

  return (
    <section className="flex flex-col gap-4">
      {tax.type === "unset" && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
          세금 처리 방식이 정해지지 않아 정산이 &ldquo;확정 전&rdquo;으로 저장돼요.{" "}
          <Link href="/admin/settings" className="font-bold underline underline-offset-4">
            설정에서 정하기
          </Link>
        </p>
      )}
      {unknown > 0 && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
          출석을 확인하지 않은 날이 {unknown}일 있어요. 일하지 않은 것으로 보고 정산에서 뺐어요. 일했다면 출석 확인 탭에서 참석으로 바꾼 뒤 다시
          계산해 주세요.
        </p>
      )}
      {stale > 0 && (
        <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm text-brand-strong">출석·단가가 바뀌어 다시 계산하면 금액이 달라지는 사람이 {stale}명 있어요.</p>
      )}

      {canSettle ? (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="eventId" value={eventId} />
          <SubmitButton pendingText="계산 중…" disabled={rows.length === 0}>
            {savedRows.length > 0 ? "출석 기록으로 다시 계산" : "출석 기록으로 정산 만들기"}
          </SubmitButton>
          <span className="text-[13px] text-muted">세금: {TAX_TYPE_LABEL[tax.type]} · 지급 완료·보류·직접 고친 정산은 그대로 둬요</span>
        </form>
      ) : (
        <p className="rounded-lg bg-ground px-4 py-3 text-sm text-body">공개 전이거나 취소된 일정은 정산할 수 없어요.</p>
      )}
      <Result state={state} />

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">확정된 사람이 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line bg-white">
          {rows.map((r) => {
            const s = r.saved;
            const locked = s?.status === "paid" || s?.status === "held";
            return (
              <li key={r.memberId} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="w-24 font-bold">{r.name}</span>
                  {s ? (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${BADGE[s.status]}`}>{PAYMENT_STATUS_LABEL[s.status]}</span>
                  ) : (
                    <span className="rounded-md border border-line px-2 py-0.5 text-xs font-bold text-muted">정산 전</span>
                  )}
                  {s?.edited && <span className="text-[13px] font-bold text-brand-strong">직접 고침</span>}
                  {!r.hasPrivate && <span className="text-[13px] text-warn">계좌 미등록</span>}
                  {r.computed.missingOvertimeRate && <span className="text-[13px] text-warn">일급 초과 금액 없음</span>}
                  <span className="ml-auto text-right text-sm">
                    {s && s.status !== "cancelled" ? (
                      <>
                        세전 {formatWon(s.gross)} · 세금 {formatWon(s.incomeTax + s.localTax)} · <strong className="text-[15px]">실지급 {formatWon(s.net)}</strong>
                      </>
                    ) : (
                      <span className="text-muted">예상 세전 {formatWon(r.computed.gross)}</span>
                    )}
                  </span>
                </div>
                {s?.status === "held" && s.heldReason && <p className="text-[13px] text-warn">보류 사유: {s.heldReason}</p>}
                {canSettle && !locked && (
                  <button
                    type="button"
                    onClick={() => setOpen(open === r.memberId ? null : r.memberId)}
                    aria-expanded={open === r.memberId}
                    className="inline-flex min-h-10 items-center self-start text-sm text-brand-strong underline underline-offset-4"
                  >
                    {open === r.memberId ? "닫기" : "항목 보기·고치기"}
                  </button>
                )}
                {locked && s && (
                  <ul className="flex flex-col gap-0.5 text-[13px] text-body">
                    {s.items.map((i, n) => (
                      <li key={n} className="flex justify-between gap-3">
                        <span>{i.label}</span>
                        <span>{formatWon(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {open === r.memberId && !locked && (
                  // 저장된 내용이 바뀌면(되돌리기·다시 계산) 편집기를 새로 연다. 예전에 고친 항목이 남아 다시 저장되지 않게.
                  <ItemEditor key={editorKey(s)} eventId={eventId} row={r} tax={tax} defaultPayDate={defaultPayDate} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {savedRows.length > 0 && (
        <p className="text-right text-sm text-body">
          {savedRows.length}명 · 세전 {formatWon(total((p) => p.gross))} · 세금 {formatWon(total((p) => p.incomeTax + p.localTax))} ·{" "}
          <strong>실지급 {formatWon(total((p) => p.net))}</strong>
        </p>
      )}
      <p className="text-[13px] leading-relaxed text-muted">
        지급 완료·보류·이체 파일은{" "}
        <Link href="/admin/payments" className="underline underline-offset-4">
          정산 메뉴
        </Link>
        에서 지급일별로 한꺼번에 처리해요.
      </p>
    </section>
  );
}
