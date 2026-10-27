import { requireAdmin } from "@/lib/auth";
import { parseCompany, parseRrnDisplay } from "@/lib/contract";
import { hasPiiKey } from "@/lib/crypto";
import { formatDateTime } from "@/lib/format";
import { parseTaxSettings, TAX_TYPE_LABEL } from "@/lib/tax";
import { CompanyForm, ContractSettingForm, TaxForm } from "./forms";

interface SettingRow {
  key: string;
  value: unknown;
  version: number;
  updated_at: string;
}

function Section({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        {meta && <span className="text-[13px] text-muted">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

// 설정 (SET-01·02·09, 회사 정보). 값을 바꾸면 버전과 이력이 남는다.
export default async function SettingsPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("app_settings").select("key, value, version, updated_at").in("key", ["company", "contract", "tax"]).returns<SettingRow[]>();
  const byKey = new Map((data ?? []).map((r) => [r.key, r]));
  const meta = (key: string) => {
    const r = byKey.get(key);
    return r ? `${r.version}번째 값 · ${formatDateTime(r.updated_at)}` : "마이그레이션 9 적용 전";
  };
  const tax = parseTaxSettings(byKey.get("tax")?.value);
  const keyReady = hasPiiKey();

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">설정</h1>

      <div className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${keyReady ? "bg-brand-soft text-brand-strong" : "bg-warn-soft text-warn"}`}>
        {keyReady
          ? "개인정보 암호화 키가 설정되어 있어요. 회원이 주민번호·계좌를 등록할 수 있어요."
          : "개인정보 암호화 키(PII_ENCRYPTION_KEY)가 없어요. README의 '암호화 키 만들기'를 따라 설정해야 회원이 주민번호·계좌를 등록할 수 있어요."}
      </div>
      {tax.type === "unset" && (
        <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm leading-relaxed text-warn">
          세금 처리 방식이 아직 정해지지 않았어요. 지금은 정산이 &ldquo;확정 전&rdquo;으로만 저장돼요. 현재: {TAX_TYPE_LABEL[tax.type]}
        </div>
      )}

      <Section title="세금 (원천징수)" meta={meta("tax")}>
        <TaxForm tax={tax} />
      </Section>
      <Section title="회사 정보" meta={meta("company")}>
        <CompanyForm company={parseCompany(byKey.get("company")?.value)} />
      </Section>
      <Section title="계약서" meta={meta("contract")}>
        <ContractSettingForm display={parseRrnDisplay(byKey.get("contract")?.value)} />
      </Section>
    </>
  );
}
