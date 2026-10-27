import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { TemplateForm } from "./template-form";

interface TemplateRow {
  id: string;
  version: number;
  title: string;
  body: string;
  created_at: string;
}

// 계약서 양식 (CON-01). 고치면 새 버전으로 쌓이고, 가장 최근 버전으로 계약서를 보낸다.
export default async function ContractTemplatePage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("contract_templates").select("id, version, title, body, created_at").order("version", { ascending: false }).limit(20).returns<TemplateRow[]>();
  const versions = data ?? [];
  const latest = versions[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">계약서 양식</h1>
        <p className="text-sm text-body">일정 상세의 &ldquo;계약&rdquo; 탭에서 확정자에게 보낼 때 이 양식을 써요. 기존 위드싸인 문구가 있다면 본문에 붙여 넣으세요.</p>
      </div>
      {latest ? (
        <section className="rounded-xl border border-line bg-white p-5">
          <TemplateForm key={latest.id} title={latest.title} body={latest.body} />
        </section>
      ) : (
        <p className="rounded-xl border border-line bg-white p-5 text-muted">양식이 없어요. 마이그레이션 9를 적용했는지 확인해 주세요.</p>
      )}
      {versions.length > 1 && (
        <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-5">
          <h2 className="font-bold">이전 버전</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {versions.slice(1).map((v) => (
              <li key={v.id}>
                <details>
                  <summary className="cursor-pointer">
                    {v.version}번째 · {v.title} · <span className="text-muted">{formatDateTime(v.created_at)}</span>
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-ground p-3 text-[13px] whitespace-pre-wrap">{v.body}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
