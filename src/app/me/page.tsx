import Link from "next/link";
import { Card, PageShell } from "@/components/page-shell";
import { requireMember, TIER_LABEL } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { PrivateInfoForm, type PrivateSummary } from "./private-info-form";

// 내 정보 (MEM-06): 기본 정보와 정산 정보(주민번호·계좌)
export default async function MyInfoPage() {
  const { supabase, userId, profile } = await requireMember("/me");
  const { data: priv } = await supabase
    .from("member_private")
    .select("rrn_masked, bank_name, account_masked, account_holder, address, updated_at")
    .eq("member_id", userId)
    .maybeSingle<PrivateSummary & { updated_at: string }>();

  return (
    <PageShell>
      <Link href="/" className="-mt-3 inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
        ← 처음 화면
      </Link>
      <h1 className="text-xl font-bold">내 정보</h1>

      <Card>
        <dl className="grid grid-cols-[5rem_1fr] gap-y-2 text-[15px]">
          <dt className="text-muted">이름</dt>
          <dd className="font-bold">{profile.name}</dd>
          <dt className="text-muted">연락처</dt>
          <dd>{formatPhone(profile.phone)}</dd>
          <dt className="text-muted">등급</dt>
          <dd>{TIER_LABEL[profile.tier]}</dd>
        </dl>
        <p className="text-[13px] text-muted">이름·연락처를 바꾸려면 대표님께 말씀해 주세요.</p>
      </Card>

      <Card>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">정산 정보</h2>
          <p className="text-sm text-body">계약서 서명과 보수 지급에 필요해요.</p>
        </div>
        {priv ? (
          <dl className="grid grid-cols-[5rem_1fr] gap-y-2 rounded-lg bg-ground p-4 text-[15px]">
            <dt className="text-muted">주민번호</dt>
            <dd className="font-mono">{priv.rrn_masked}</dd>
            <dt className="text-muted">계좌</dt>
            <dd>
              {priv.bank_name} <span className="font-mono">{priv.account_masked}</span> · {priv.account_holder}
            </dd>
            <dt className="text-muted">주소</dt>
            <dd>{priv.address || "—"}</dd>
            <dt className="text-muted">저장</dt>
            <dd className="text-sm text-muted">{formatDateTime(priv.updated_at)}</dd>
          </dl>
        ) : (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">아직 등록하지 않았어요. 계약서에 서명하려면 먼저 등록해 주세요.</p>
        )}
        <PrivateInfoForm current={priv ?? null} defaultHolder={profile.name} />
      </Card>
    </PageShell>
  );
}
