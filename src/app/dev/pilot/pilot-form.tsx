"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import type { PilotSettings } from "@/lib/pilot";
import { savePilot, type PilotState } from "./actions";

const input = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

export interface EventOption {
  id: string;
  title: string;
  label: string; // 날짜·상태
}

export interface InviteOption {
  id: string;
  memo: string;
  label: string; // 만든 날·가입 수
}

function NumberField({ name, label, value, help, step }: { name: string; label: string; value: number | null; help?: string; step?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`pilot-${name}`} className="text-sm font-bold">
        {label}
      </label>
      <input id={`pilot-${name}`} name={name} type="number" inputMode="decimal" min={0} step={step ?? "1"} defaultValue={value ?? ""} className={input} />
      {help && <span className="text-[13px] text-muted">{help}</span>}
    </div>
  );
}

function Picker({ legend, help, name, options, checked }: { legend: string; help: string; name: string; options: { id: string; title: string; label: string }[]; checked: string[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-bold">{legend}</legend>
      <p className="text-[13px] text-muted">{help}</p>
      {options.length === 0 ? (
        <p className="rounded-lg border border-line p-3 text-sm text-muted">아직 없어요.</p>
      ) : (
        <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto rounded-lg border border-line p-2">
          {options.map((o) => (
            <label key={o.id} className="flex min-h-11 items-start gap-2 rounded-md px-2 py-2 has-[:checked]:bg-brand-soft">
              <input type="checkbox" name={name} value={o.id} defaultChecked={checked.includes(o.id)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex flex-col">
                <span className="text-sm font-bold">{o.title}</span>
                <span className="text-[13px] text-muted">{o.label}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

// 시범 대상과 앱 밖에서 생기는 값. 고를 때마다 위의 지표가 다시 계산된다.
export function PilotForm({ settings, events, invites }: { settings: PilotSettings; events: EventOption[]; invites: InviteOption[] }) {
  const [state, action] = useActionState<PilotState, FormData>(savePilot, {});
  const baselineHours = settings.baselineMinutes === null ? null : Math.round((settings.baselineMinutes / 60) * 10) / 10;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Picker
          legend="시범 일정"
          help="고르지 않으면 공개한 모든 일정(취소 제외)으로 계산해요."
          name="event_ids"
          options={events}
          checked={settings.eventIds}
        />
        <Picker
          legend="시범 초대 링크"
          help="이 링크로 가입한 사람만 가입률에 넣어요. 고르지 않으면 대표를 뺀 모든 가입자로 계산해요."
          name="invite_ids"
          options={invites.map((i) => ({ id: i.id, title: i.memo || "메모 없음", label: i.label }))}
          checked={settings.inviteIds}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <NumberField name="invited_count" label="초대한 인원" value={settings.invitedCount} help="링크를 보낸 사람 수. 가입률의 분모예요." />
        <NumberField
          name="baseline_minutes"
          label="기존 처리 시간 (시간)"
          value={baselineHours}
          step="0.5"
          help="앱 쓰기 전, 일정 1건을 등록부터 계약 완료까지 하는 데 걸리던 시간"
        />
        <NumberField name="target_reduction_pct" label="목표 감소율 (%)" value={settings.targetReductionPct} help="비우면 기존보다 줄기만 하면 달성" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">시범 후 인터뷰 (의견 질문지)</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <NumberField name="ceo_responses" label="대표 응답" value={settings.ceoResponses} />
          <NumberField name="ceo_yes" label="그중 ‘계속 쓰겠다’" value={settings.ceoYes} />
          <NumberField name="member_responses" label="인력 응답" value={settings.memberResponses} />
          <NumberField name="member_yes" label="그중 ‘계속 쓰겠다’" value={settings.memberYes} />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">운영 사고 (없으면 0)</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumberField name="incident_privacy" label="개인정보가 잘못 보임" value={settings.incidentPrivacy} />
          <NumberField name="incident_pay" label="잘못된 지급액" value={settings.incidentPay} />
          <NumberField name="incident_outage" label="앱을 못 써서 업무가 멈춤" value={settings.incidentOutage} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pilot-note" className="text-sm font-bold">
          메모 <span className="font-normal text-muted">(목표에 못 미친 이유, 사고 내용과 재발 방지 등)</span>
        </label>
        <textarea id="pilot-note" name="note" defaultValue={settings.note} maxLength={1000} rows={4} className="rounded-lg border border-field bg-white p-3 text-sm" />
      </div>

      <div>
        <SubmitButton pendingText="저장 중…">저장</SubmitButton>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm font-bold text-brand-strong">
          {state.ok}
        </p>
      )}
    </form>
  );
}
