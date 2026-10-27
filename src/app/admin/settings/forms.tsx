"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { CompanyInfo, RrnDisplay } from "@/lib/contract";
import { TAX_TYPE_LABEL, type TaxSettings, type TaxType } from "@/lib/tax";
import { saveCompany, saveContractSetting, saveTax, type SettingState } from "./actions";

const input = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

function Result({ state }: { state: SettingState }) {
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

export function CompanyForm({ company }: { company: CompanyInfo }) {
  const [state, action] = useActionState<SettingState, FormData>(saveCompany, {});
  const fields: { key: keyof CompanyInfo; label: string; placeholder?: string }[] = [
    { key: "name", label: "회사 이름" },
    { key: "ceo", label: "대표자" },
    { key: "biz_no", label: "사업자등록번호", placeholder: "000-00-00000" },
    { key: "address", label: "주소" },
    { key: "phone", label: "연락처" },
  ];
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1.5">
            <label htmlFor={`co-${f.key}`} className="text-sm font-bold">
              {f.label}
            </label>
            <input id={`co-${f.key}`} name={f.key} defaultValue={company[f.key]} placeholder={f.placeholder} maxLength={200} className={input} />
          </div>
        ))}
      </div>
      <p className="text-[13px] text-muted">계약서의 &ldquo;회사 (갑)&rdquo; 칸에 들어가요. 이미 보낸 계약서는 바뀌지 않아요.</p>
      <div>
        <SubmitButton pendingText="저장 중…">회사 정보 저장</SubmitButton>
      </div>
      <Result state={state} />
    </form>
  );
}

export function ContractSettingForm({ display }: { display: RrnDisplay }) {
  const [state, action] = useActionState<SettingState, FormData>(saveContractSetting, {});
  const options: { value: RrnDisplay; label: string; help: string }[] = [
    { value: "masked", label: "뒷자리 가리기 (권장)", help: "900101-1****** 처럼 보여요." },
    { value: "full", label: "전체 표시", help: "대표가 볼 때마다 열람 기록이 남아요. 세무 신고 서류로 써야 할 때만 고르세요." },
  ];
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">계약서의 주민등록번호</legend>
        {options.map((o) => (
          <label key={o.value} className="flex items-start gap-2 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="rrn_display" value={o.value} defaultChecked={display === o.value} className="mt-1 h-4 w-4" />
            <span className="flex flex-col">
              <span className="text-sm font-bold">{o.label}</span>
              <span className="text-[13px] text-muted">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-[13px] text-muted">새로 보내는 계약서부터 적용돼요.</p>
      <div>
        <SubmitButton pendingText="저장 중…">저장</SubmitButton>
      </div>
      <Result state={state} />
    </form>
  );
}

const TAX_HELP: Record<TaxType, string> = {
  unset: "정산을 만들 수는 있지만 \"확정 전\"으로만 저장되고, 지급 완료·이체 파일에 넣을 수 없어요.",
  other: "일시적인 용역(기타소득). 지급액의 8% + 지방세 0.8%. 한 번에 125,000원 이하면 세금이 없어요(과세최저한).",
  business: "반복적인 용역(사업소득). 지급액의 3% + 지방세 0.3%. 소득세가 1,000원 미만이면 걷지 않아요(소액부징수).",
  none: "세금을 떼지 않고 전액 지급해요.",
};

export function TaxForm({ tax }: { tax: TaxSettings }) {
  const [state, action] = useActionState<SettingState, FormData>(saveTax, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">세금 처리 방식 (세무사와 확인 후 고르세요)</legend>
        {(Object.keys(TAX_TYPE_LABEL) as TaxType[]).map((t) => (
          <label key={t} className="flex items-start gap-2 rounded-lg border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
            <input type="radio" name="type" value={t} defaultChecked={tax.type === t} className="mt-1 h-4 w-4" />
            <span className="flex flex-col">
              <span className="text-sm font-bold">{TAX_TYPE_LABEL[t]}</span>
              <span className="text-[13px] text-muted">{TAX_HELP[t]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="threshold" defaultChecked={tax.threshold} className="h-4 w-4" />
        과세최저한·소액부징수 적용
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="include_extras" defaultChecked={tax.includeExtras} className="h-4 w-4" />
        교통비·지방비도 세금 계산에 넣기 (실비로 처리하면 끄세요)
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tax-reason" className="text-sm font-bold">
          바꾸는 이유 <span className="font-normal text-muted">(선택, 이력에 남아요)</span>
        </label>
        <input id="tax-reason" name="reason" maxLength={200} placeholder="예: 세무사 확인 (10/27)" className={input} />
      </div>
      <p className="text-[13px] text-muted">이미 만든 정산에는 바로 적용되지 않아요. 일정의 정산 탭에서 &ldquo;다시 계산&rdquo;을 누르면 새 설정으로 계산해요.</p>
      <div>
        <SubmitButton pendingText="저장 중…">세금 설정 저장</SubmitButton>
      </div>
      <Result state={state} />
    </form>
  );
}
