import { type ContractTerms } from "@/lib/contract";
import { formatFullDateTime } from "@/lib/format";

export interface ContractView {
  title: string;
  body: string;
  terms: ContractTerms;
  status: "requested" | "signed" | "voided";
  requested_at: string;
  signed_at: string | null;
  signature: string | null;
  document_hash: string | null;
  sign_ip: string | null;
  voided_at: string | null;
  void_reason: string;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function Party({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="flex-1 basis-60 border border-ink/70">
      <div className="border-b border-ink/70 bg-ground px-3 py-1.5 text-sm font-bold print:bg-transparent">{title}</div>
      <dl className="grid grid-cols-[5.5rem_1fr] gap-y-1 px-3 py-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="break-all">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// A4 한 장 모양의 계약서. 화면에서도, 인쇄(PDF로 저장)할 때도 이 모양 그대로 나온다.
export function ContractDocument({ contract, rrn, address }: { contract: ContractView; rrn: string; address: string }) {
  const t = contract.terms;
  const signedDate = contract.signed_at ? formatFullDateTime(contract.signed_at) : null;
  return (
    <article className="contract-paper relative mx-auto flex w-full max-w-[210mm] flex-col gap-5 bg-white px-5 py-8 text-ink shadow-sm sm:px-12 print:max-w-none print:px-0 print:py-0 print:shadow-none">
      {contract.status === "voided" && (
        <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm font-bold text-warn print:border print:border-warn">
          무효가 된 계약서예요{contract.void_reason ? ` · ${contract.void_reason}` : ""}
        </p>
      )}
      <h1 className="text-center text-2xl font-bold tracking-[0.2em]">{contract.title}</h1>

      <div className="flex flex-wrap gap-3">
        <Party
          title="회사 (갑)"
          rows={[
            ["상호", t.company.name],
            ["대표자", t.company.ceo],
            ["사업자번호", t.company.biz_no],
            ["주소", t.company.address],
            ["연락처", t.company.phone],
          ]}
        />
        <Party
          title="용역자 (을)"
          rows={[
            ["이름", t.member.name],
            ["주민등록번호", rrn],
            ["주소", address],
            ["연락처", t.member.phone],
          ]}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">용역 내용과 보수</h2>
        <p className="text-[13px] text-body">
          {t.event.title}
          {(t.event.location || t.event.address) && ` · ${[t.event.location, t.event.address].filter(Boolean).join(" ")}`}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-ground print:bg-transparent">
                {["일자·시간", "역할", "보수 기준", "금액"].map((h) => (
                  <th key={h} scope="col" className="border border-ink/50 px-2 py-1.5 text-left font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.days.map((d) => (
                <tr key={d.label}>
                  <td className="border border-ink/50 px-2 py-1.5">
                    <span className="block whitespace-nowrap">{d.label}</span>
                    <span className="block whitespace-nowrap text-body">{d.time}</span>
                  </td>
                  <td className="border border-ink/50 px-2 py-1.5">{d.role || "현장 배정"}</td>
                  <td className="border border-ink/50 px-2 py-1.5">{d.pay}</td>
                  <td className="border border-ink/50 px-2 py-1.5 text-right whitespace-nowrap">{won(d.amount)}</td>
                </tr>
              ))}
              {t.extras.map((e) => (
                <tr key={e.label}>
                  <td colSpan={3} className="border border-ink/50 px-2 py-1.5">
                    {e.label}
                  </td>
                  <td className="border border-ink/50 px-2 py-1.5 text-right whitespace-nowrap">{won(e.amount)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td colSpan={3} className="border border-ink/50 px-2 py-1.5">
                  합계 (세전, 초과 근무 별도)
                </td>
                <td className="border border-ink/50 px-2 py-1.5 text-right whitespace-nowrap">{won(t.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="text-[14px] leading-7 whitespace-pre-wrap">{contract.body}</section>

      <section className="mt-2 flex flex-col items-center gap-4 border-t border-line pt-5">
        <p className="text-[15px]">{signedDate ? `서명일시: ${signedDate}` : "아래에 서명하면 계약이 맺어져요."}</p>
        <div className="flex w-full flex-wrap justify-around gap-6 text-[14px]">
          <div className="flex flex-col items-center gap-1">
            <span className="text-muted">회사 (갑)</span>
            <span className="font-bold">
              {t.company.name} {t.company.ceo && `대표 ${t.company.ceo}`}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-muted">용역자 (을)</span>
            <span className="font-bold">{t.member.name}</span>
            {contract.signature ? (
              // eslint-disable-next-line @next/next/no-img-element -- 서명 이미지는 DB에 저장된 data URL이다
              <img src={contract.signature} alt={`${t.member.name} 서명`} className="h-20 w-48 object-contain" />
            ) : (
              <span className="flex h-20 w-48 items-center justify-center rounded border border-dashed border-field text-[13px] text-muted">(서명)</span>
            )}
          </div>
        </div>
      </section>

      {contract.document_hash && (
        <p className="text-[11px] leading-relaxed break-all text-muted">
          전자서명 기록 · 문서 확인값(SHA-256) {contract.document_hash}
          {contract.sign_ip && ` · 접속 IP ${contract.sign_ip}`}
        </p>
      )}
    </article>
  );
}
