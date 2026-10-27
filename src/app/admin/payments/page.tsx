import Link from "next/link";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { formatEventDate } from "@/lib/events";
import { formatWon } from "@/lib/format";
import { type PaymentStatus } from "@/lib/settlement";
import { parseTaxSettings, TAX_TYPE_LABEL } from "@/lib/tax";
import { PaymentTable, type PayRow } from "./payment-table";

interface Row {
  id: string;
  member_id: string;
  event_id: string;
  pay_date: string;
  status: PaymentStatus;
  gross: number;
  income_tax: number;
  local_tax: number;
  net: number;
  held_reason: string;
  member: { name: string } | null;
  event: { title: string } | null;
}

// 정산 (PAY-03~06): 지급일별 목록, 지급 완료·보류, 이체 파일
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await requireAdmin();
  const requested = z.iso.date().safeParse((await searchParams).date);

  const [{ data }, { data: taxSetting }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, member_id, event_id, pay_date, status, gross, income_tax, local_tax, net, held_reason, member:profiles!payments_member_id_fkey(name), event:events(title)")
      .neq("status", "cancelled")
      .order("pay_date", { ascending: false })
      .limit(2000)
      .returns<Row[]>(),
    supabase.from("app_settings").select("value").eq("key", "tax").maybeSingle<{ value: unknown }>(),
  ]);
  const all = data ?? [];
  const tax = parseTaxSettings(taxSetting?.value);

  // 지급일별 묶음
  const dates = [...new Set(all.map((p) => p.pay_date))].sort((a, b) => b.localeCompare(a));
  const summary = dates.map((date) => {
    const list = all.filter((p) => p.pay_date === date);
    const count = (s: PaymentStatus) => list.filter((p) => p.status === s).length;
    return { date, total: list.reduce((s, p) => s + p.net, 0), draft: count("draft"), scheduled: count("scheduled"), held: count("held"), paid: count("paid"), people: list.length };
  });
  const upcoming = summary.filter((d) => d.scheduled + d.draft + d.held > 0).map((d) => d.date);
  const current = requested.success && dates.includes(requested.data) ? requested.data : (upcoming.at(-1) ?? dates[0]);
  const list = all.filter((p) => p.pay_date === current);

  const memberIds = [...new Set(list.map((p) => p.member_id))];
  const { data: privs } = memberIds.length
    ? await supabase.from("member_private").select("member_id, bank_name, account_masked").in("member_id", memberIds).returns<{ member_id: string; bank_name: string; account_masked: string }[]>()
    : { data: [] };
  const accountOf = new Map((privs ?? []).map((p) => [p.member_id, `${p.bank_name} ${p.account_masked}`]));

  const rows: PayRow[] = list
    .map((p) => ({
      id: p.id,
      name: p.member?.name ?? "(알 수 없음)",
      eventId: p.event_id,
      eventTitle: p.event?.title ?? "",
      status: p.status,
      gross: p.gross,
      tax: p.income_tax + p.local_tax,
      net: p.net,
      account: accountOf.get(p.member_id) ?? "미등록",
      heldReason: p.status === "held" ? p.held_reason : "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.eventTitle.localeCompare(b.eventTitle, "ko"));
  const cur = summary.find((d) => d.date === current);
  const scheduledNet = list.filter((p) => p.status === "scheduled").reduce((s, p) => s + p.net, 0);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">정산</h1>
        <p className="text-sm text-body">
          일정 상세의 &ldquo;정산&rdquo; 탭에서 만든 정산을 지급일별로 모아 처리해요. 세금: {TAX_TYPE_LABEL[tax.type]}{" "}
          <Link href="/admin/settings" className="underline underline-offset-4">
            바꾸기
          </Link>
        </p>
      </div>

      {dates.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-8 text-center text-muted">아직 만든 정산이 없어요. 일정 상세의 정산 탭에서 &ldquo;출석 기록으로 정산 만들기&rdquo;를 눌러 주세요.</p>
      ) : (
        <>
          <nav aria-label="지급일" className="flex gap-2 overflow-x-auto pb-1">
            {summary.map((d) => (
              <Link
                key={d.date}
                href={`/admin/payments?date=${d.date}`}
                aria-current={d.date === current ? "page" : undefined}
                className={`flex min-w-36 flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm ${d.date === current ? "border-brand bg-brand-soft" : "border-line bg-white"}`}
              >
                <span className="font-bold">{formatEventDate(d.date)}</span>
                <span className="text-[13px] text-body">
                  {d.people}명 · {formatWon(d.total)}
                </span>
                <span className="text-[12px] text-muted">
                  {d.paid === d.people ? "모두 지급" : [d.scheduled && `예정 ${d.scheduled}`, d.draft && `확정 전 ${d.draft}`, d.held && `보류 ${d.held}`, d.paid && `완료 ${d.paid}`].filter(Boolean).join(" · ")}
                </span>
              </Link>
            ))}
          </nav>

          {cur && (
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">{formatEventDate(cur.date)} 지급</h2>
                <span className="text-sm text-muted">지급 예정 {cur.scheduled}명 · {formatWon(scheduledNet)}</span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <a
                    href={`/admin/payments/export?date=${cur.date}&kind=transfer`}
                    className={`flex h-11 items-center rounded-lg px-4 text-sm font-bold ${cur.scheduled ? "bg-navy text-white" : "pointer-events-none bg-line text-muted"}`}
                    aria-disabled={cur.scheduled === 0}
                  >
                    이체 파일 받기 (CSV)
                  </a>
                  <a href={`/admin/payments/export?date=${cur.date}&kind=tax`} className="flex h-11 items-center rounded-lg border border-field bg-white px-4 text-sm font-bold">
                    원천징수 명세 받기
                  </a>
                </span>
              </div>
              {cur.draft > 0 && (
                <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
                  확정 전 {cur.draft}명은 세금이 정해지지 않아 이체 파일에 들어가지 않아요. 설정에서 세금을 정한 뒤 일정의 정산 탭에서 다시 계산해 주세요.
                </p>
              )}
              <PaymentTable key={cur.date} rows={rows} />
              <p className="text-[13px] leading-relaxed text-muted">
                이체 파일에는 &ldquo;지급 예정&rdquo;인 사람만 들어가요. 엑셀로 열어 은행 대량이체 양식에 맞게 붙여 넣고, 이체한 뒤 &ldquo;지급 완료로 바꾸기&rdquo;를 누르면 회원에게 알림이 가요. 파일을 받을 때마다 계좌·주민번호 열람 기록이 남아요.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
