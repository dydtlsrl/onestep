import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { requireMember } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { CONTRACT_STATUS_LABEL, type ContractStatus } from "@/lib/settlement";

interface Row {
  id: string;
  title: string;
  status: ContractStatus;
  requested_at: string;
  signed_at: string | null;
  event: { title: string; start_date: string } | null;
}

const BADGE: Record<ContractStatus, string> = {
  requested: "bg-brand text-white",
  signed: "bg-ground text-body",
  voided: "border border-line text-muted",
};

// 내 계약서 목록
export default async function MyContractsPage() {
  const { supabase } = await requireMember("/contracts");
  const { data } = await supabase
    .from("contracts")
    .select("id, title, status, requested_at, signed_at, event:events(title, start_date)")
    .order("requested_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <PageShell>
      <Link href="/" className="-mt-3 inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 처음 화면
      </Link>
      <h1 className="text-xl font-bold">내 계약서</h1>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-5 text-[15px] text-muted">받은 계약서가 없어요. 일정이 확정되면 대표님이 계약서를 보내 드려요.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/contracts/${c.id}`} className={`flex flex-col gap-1 rounded-xl border bg-white p-4 ${c.status === "requested" ? "border-brand" : "border-line"}`}>
                <span className="flex items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${BADGE[c.status]}`}>{CONTRACT_STATUS_LABEL[c.status]}</span>
                  <span className="font-bold text-ink">{c.event?.title ?? c.title}</span>
                </span>
                <span className="text-[13px] text-muted">
                  {c.signed_at ? `서명 ${formatDateTime(c.signed_at)}` : `받은 날 ${formatDateTime(c.requested_at)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
