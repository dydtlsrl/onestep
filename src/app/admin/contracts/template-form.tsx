"use client";

import { useActionState, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { PLACEHOLDERS, unknownPlaceholders } from "@/lib/contract";
import { saveTemplate, type TemplateState } from "./actions";

export function TemplateForm({ title, body }: { title: string; body: string }) {
  const [state, action] = useActionState<TemplateState, FormData>(saveTemplate, {});
  const [text, setText] = useState(body);
  const area = useRef<HTMLTextAreaElement>(null);
  const unknown = unknownPlaceholders(text);

  // 커서 위치에 {{빈칸}}을 넣는다
  function insert(key: string) {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setText((t) => t + token);
    const start = el.selectionStart;
    const next = text.slice(0, start) + token + text.slice(el.selectionEnd);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-title" className="text-sm font-bold">
          계약서 제목
        </label>
        <input id="tpl-title" name="title" defaultValue={title} maxLength={80} required className="h-11 rounded-lg border border-field bg-white px-3 text-sm" />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">빈칸 넣기</span>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button key={p.key} type="button" onClick={() => insert(p.key)} title={p.help} className="h-9 rounded-md border border-field bg-white px-2.5 text-[13px] hover:bg-ground">
              {`{{${p.key}}}`}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">빈칸은 계약서를 보낼 때 회원 이름·일정·금액으로 바뀌어요. 일자·시간·역할·금액 표와 회사·회원 정보 칸은 본문 위에 자동으로 들어가요.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tpl-body" className="text-sm font-bold">
          본문
        </label>
        <textarea
          id="tpl-body"
          ref={area}
          name="body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={22}
          maxLength={20000}
          className="rounded-lg border border-field bg-white p-3 text-sm leading-6"
        />
        <span className="text-right text-[12px] text-muted">{text.length.toLocaleString("ko-KR")} / 20,000자</span>
      </div>
      {unknown.length > 0 && (
        <p role="alert" className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn">
          모르는 빈칸이 있어요: {unknown.map((k) => `{{${k}}}`).join(", ")} — 오타가 아니라면 그대로 계약서에 보여요.
        </p>
      )}
      <div>
        <SubmitButton pendingText="저장 중…">새 버전으로 저장</SubmitButton>
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
