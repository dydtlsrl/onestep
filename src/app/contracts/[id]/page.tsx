import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ContractDocument, type ContractView } from "@/components/contract-document";
import { PrintButton } from "@/components/print-button";
import { requireMember } from "@/lib/auth";
import { parseTerms } from "@/lib/contract";
import { contractRrn } from "@/lib/contract-load";
import { PrivateInfoForm, type PrivateSummary } from "../../me/private-info-form";
import { SignForm } from "./sign-form";

interface ContractRow extends Omit<ContractView, "terms"> {
  id: string;
  member_id: string;
  event_id: string;
  terms: unknown;
  signer_rrn_masked: string | null;
  signer_address: string | null;
}

// 계약서 보기·서명 (CON-03~05). 회원은 자기 계약서만, 대표는 모두 볼 수 있다(DB 권한 규칙).
export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, userId, profile } = await requireMember(`/contracts/${id}`);

  const { data: contract } = await supabase
    .from("contracts")
    .select("id, member_id, event_id, title, body, terms, status, requested_at, signed_at, signature, document_hash, sign_ip, voided_at, void_reason, signer_rrn_masked, signer_address")
    .eq("id", id)
    .maybeSingle<ContractRow>();
  const terms = parseTerms(contract?.terms);
  if (!contract || !terms) notFound();

  const { data: priv } = await supabase
    .from("member_private")
    .select("rrn_masked, bank_name, account_masked, account_holder, address")
    .eq("member_id", contract.member_id)
    .maybeSingle<PrivateSummary>();

  const isOwner = contract.member_id === userId;
  const masked = contract.signer_rrn_masked ?? priv?.rrn_masked ?? "";
  const rrn = await contractRrn(supabase, { display: terms.rrn_display, memberId: contract.member_id, viewerId: userId, masked });
  const address = contract.signer_address ?? priv?.address ?? "";
  const back = profile.role === "admin" ? `/admin/events/${contract.event_id}?tab=contracts` : "/contracts";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-3 py-6 sm:px-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={back} className="inline-flex min-h-10 items-center self-start text-sm text-muted underline-offset-4 hover:underline">
          ← {profile.role === "admin" ? "일정의 계약 목록" : "내 계약서"}
        </Link>
        <PrintButton />
      </div>

      {isOwner && contract.status === "requested" && (
        <p className="rounded-lg bg-brand-soft px-4 py-3 text-sm leading-relaxed text-brand-strong print:hidden">
          내용을 끝까지 읽고 아래에서 서명해 주세요. 서명한 계약서는 이 화면에서 언제든 다시 보고 PDF로 저장할 수 있어요.
        </p>
      )}

      <ContractDocument contract={{ ...contract, terms }} rrn={rrn || "(정산 정보 등록 전)"} address={address} />

      {isOwner && contract.status === "requested" &&
        (priv ? (
          <SignForm contractId={contract.id} />
        ) : (
          <section className="flex flex-col gap-4 rounded-xl border-2 border-brand bg-white p-5 print:hidden">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">먼저 정산 정보를 등록해 주세요</h2>
              <p className="text-sm text-body">계약서와 보수 지급에 필요해요. 등록하면 바로 아래에 서명란이 나와요.</p>
            </div>
            <PrivateInfoForm current={null} defaultHolder={terms.member.name} />
          </section>
        ))}
    </main>
  );
}
