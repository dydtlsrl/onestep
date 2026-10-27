import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { requireMember } from "@/lib/auth";
import { formatEventRange } from "@/lib/events";
import { formatDate, formatWon } from "@/lib/format";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/settlement";

interface Row {
  id: string;
  pay_date: string;
  status: PaymentStatus;
  gross: number;
  income_tax: number;
  local_tax: number;
  net: number;
  held_reason: string;
  paid_at: string | null;
  event: { title: string; start_date: string; end_date: string } | null;
  payment_items: { id: string; label: string; amount: number; sort_order: number }[];
}

const BADGE: Record<PaymentStatus, string> = {
  draft: "bg-ground text-body",
  scheduled: "bg-brand-soft text-brand-strong",
  held: "bg-warn-soft text-warn",
  paid: "bg-brand text-white",
  cancelled: "border border-line text-muted",
};

const payDay = (date: string) => formatDate(`${date}T00:00:00+09:00`);

// 내 정산 내역 (PAY-07). 금액은 대표가 확정한 뒤(지급 예정)부터 보여 준다.
export default async function MyPaymentsPage() {
  const { supabase } = await requireMember("/payments");
  const { data } = await supabase
    .from("payments")
    .select("id, pay_date, status, gross, income_tax, local_tax, net, held_reason, paid_at, event:events(title, start_date, end_date), payment_items(id, label, amount, sort_order)")
    .order("pay_date", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = (data ?? []).filter((p) => p.status !== "cancelled");
  const paidTotal = rows.filter((p) => p.status === "paid").reduce((s, p) => s + p.net, 0);
  const upcoming = rows.filter((p) => p.status === "scheduled").reduce((s, p) => s + p.net, 0);

  return (
    <PageShell>
      <Link href="/" className="-mt-3 text-sm text-muted underline-offset-4 hover:underline">
        ← 처음 화면
      </Link>
      <h1 className="text-xl font-bold">정산 내역</h1>

      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-white p-4">
          <dt className="text-[13px] text-muted">받을 예정</dt>
          <dd className="text-lg font-bold">{formatWon(upcoming)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <dt className="text-[13px] text-muted">받은 금액</dt>
          <dd className="text-lg font-bold">{formatWon(paidTotal)}</dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-5 text-[15px] text-muted">아직 정산 내역이 없어요. 일정이 끝나면 대표님이 정산해 드려요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((p) => {
            const settled = p.status !== "draft";
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${BADGE[p.status]}`}>{settled ? PAYMENT_STATUS_LABEL[p.status] : "정산 중"}</span>
                  <span className="text-[13px] text-muted">{p.event ? formatEventRange(p.event.start_date, p.event.end_date) : ""}</span>
                </div>
                <span className="font-bold">{p.event?.title ?? "일정"}</span>
                {settled ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm text-body">{p.status === "paid" ? "받은 금액" : `${payDay(p.pay_date)} 지급 예정`}</span>
                      <span className="text-lg font-bold">{formatWon(p.net)}</span>
                    </div>
                    {p.status === "held" && p.held_reason && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">보류 사유: {p.held_reason}</p>}
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted">자세히 보기</summary>
                      <ul className="mt-2 flex flex-col gap-1">
                        {[...p.payment_items].sort((a, b) => a.sort_order - b.sort_order).map((i) => (
                          <li key={i.id} className="flex justify-between gap-3">
                            <span className="text-body">{i.label}</span>
                            <span className="whitespace-nowrap">{formatWon(i.amount)}</span>
                          </li>
                        ))}
                        <li className="flex justify-between border-t border-line pt-1 font-bold">
                          <span>세전 합계</span>
                          <span>{formatWon(p.gross)}</span>
                        </li>
                        <li className="flex justify-between text-body">
                          <span>소득세 · 지방소득세</span>
                          <span>
                            −{formatWon(p.income_tax)} · −{formatWon(p.local_tax)}
                          </span>
                        </li>
                      </ul>
                    </details>
                  </>
                ) : (
                  <p className="text-sm text-muted">대표님이 금액을 확인하고 있어요.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
