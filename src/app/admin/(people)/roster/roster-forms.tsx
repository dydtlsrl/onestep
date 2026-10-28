"use client";

import { useActionState, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { SubmitButton } from "@/components/submit-button";
import { formatPhone } from "@/lib/phone";
import { inviteMessage, parseRoster, smsHref } from "@/lib/roster";
import { TIER_LABEL } from "@/lib/tier";
import { createGroupLink, createPersonalLink, importRoster, removeJoined, removeRosterRows, type LinkState, type RosterState } from "./actions";

const field = "h-11 rounded-lg border border-field bg-white px-3 text-sm";

function Message({ state }: { state: { error?: string; ok?: string } }) {
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

// 명단 넣기: 엑셀에서 복사해 붙여 넣으면 바로 미리 읽어 보여 준다 (서버에서 같은 방법으로 다시 읽는다)
export function RosterImport({ lists }: { lists: string[] }) {
  const [state, action] = useActionState<RosterState, FormData>(importRoster, {});
  const [text, setText] = useState("");
  const [defaultTier, setDefaultTier] = useState<"core" | "general">("general");
  const preview = useMemo(() => parseRoster(text, defaultTier), [text, defaultTier]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-[2_1_220px] flex-col gap-1.5">
          <label htmlFor="listName" className="text-sm font-bold">
            명단 이름
          </label>
          <input id="listName" name="listName" list="roster-lists" required maxLength={40} placeholder="예: 핵심 인력, 전체 인력" className={field} />
          <datalist id="roster-lists">
            {lists.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <fieldset className="flex flex-[1_1_220px] flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-bold">등급 칸이 없을 때</legend>
          <div className="flex gap-4">
            {(["general", "core"] as const).map((t) => (
              <label key={t} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" name="defaultTier" value={t} checked={defaultTier === t} onChange={() => setDefaultTier(t)} className="h-4 w-4 accent-brand" />
                {TIER_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="rosterText" className="text-sm font-bold">
          엑셀에서 복사해 붙여 넣기
        </label>
        <textarea
          id="rosterText"
          name="text"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"이름\t휴대폰\t등급\t메모\n김하늘\t010-1234-5678\t핵심\t감독 10회"}
          className="rounded-lg border border-field bg-white p-3 font-mono text-[13px]"
        />
        <p className="text-[13px] leading-relaxed text-muted">
          엑셀에서 이름·휴대폰(필수), 등급(핵심·일반), 메모 칸을 줄째 골라 복사(Ctrl+C)한 뒤 여기에 붙여 넣으세요. 열 순서는 상관없어요. 이미 있는 번호는 새 내용으로
          고쳐요.
        </p>
      </div>

      {text.trim() && (
        <div className="flex flex-col gap-2 rounded-lg bg-ground p-3 text-sm">
          <p className="font-bold">
            {preview.rows.length}명 읽음
            {preview.rows.filter((r) => r.tier === "core").length > 0 && ` (핵심 ${preview.rows.filter((r) => r.tier === "core").length}명)`}
            {preview.skipped.length > 0 && <span className="text-warn"> · 못 읽은 줄 {preview.skipped.length}개</span>}
          </p>
          <ul className="flex flex-col gap-0.5 text-[13px] text-body">
            {preview.rows.slice(0, 5).map((r) => (
              <li key={r.phone}>
                {r.name} · {formatPhone(r.phone)} · {TIER_LABEL[r.tier]}
                {r.memo && ` · ${r.memo}`}
              </li>
            ))}
            {preview.rows.length > 5 && <li className="text-muted">… 외 {preview.rows.length - 5}명</li>}
          </ul>
          {preview.skipped.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-[13px] text-warn">
              {preview.skipped.slice(0, 10).map((s) => (
                <li key={s.line}>
                  {s.line}번째 줄: {s.reason} — <span className="text-body">{s.text.slice(0, 60)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <SubmitButton pendingText="넣는 중…" disabled={preview.rows.length === 0}>
          {preview.rows.length > 0 ? `명단에 ${preview.rows.length}명 넣기` : "명단에 넣기"}
        </SubmitButton>
      </div>
      <Message state={state} />
    </form>
  );
}

function LinkResult({ link, until }: { link: string; until?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-brand-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-[13px] text-brand-strong">{link}</code>
        <CopyButton value={link} />
      </div>
      {until && <p className="text-[13px] text-brand-strong">{until}까지 쓸 수 있어요. 초대 링크 탭에서 끄거나 다시 볼 수 있어요.</p>}
    </div>
  );
}

// 명단으로 단체 링크 (최대 가입 수 = 아직 가입하지 않은 사람 수)
export function GroupLinkForm({ listName, remaining }: { listName: string; remaining: number }) {
  const [state, action] = useActionState<LinkState, FormData>(createGroupLink, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="listName" value={listName} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          사용 기간
          <select name="days" defaultValue="14" className="h-10 rounded-lg border border-field bg-white px-2 text-sm">
            <option value="3">3일</option>
            <option value="7">7일</option>
            <option value="14">14일</option>
            <option value="30">30일</option>
          </select>
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="rosterOnly" defaultChecked className="h-4 w-4 accent-brand" />
          명단에 있는 번호만 가입
        </label>
        <SubmitButton variant="secondary" pendingText="만드는 중…" disabled={remaining === 0} className="h-10">
          단체 링크 만들기 (최대 {remaining}명)
        </SubmitButton>
      </div>
      {state.error && (
        <p role="alert" className="text-sm font-bold text-warn">
          {state.error}
        </p>
      )}
      {state.link && <LinkResult link={state.link} until={state.until} />}
    </form>
  );
}

// 한 사람의 1회용 개인 링크: 문자 보내기(휴대폰), 링크 복사(카톡 1:1)
export function PersonalLink({ rosterId, name, phone, existing }: { rosterId: string; name: string; phone: string; existing: { link: string; until: string | null } | null }) {
  const [state, action] = useActionState<LinkState, FormData>(createPersonalLink, {});
  const current = state.link ? { link: state.link, until: state.until ?? null } : existing;
  return (
    <form action={action} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="rosterId" value={rosterId} />
      {current ? (
        <>
          <a
            href={smsHref(phone, inviteMessage(name, current.link, current.until))}
            className="flex h-9 items-center rounded-md bg-brand px-3 text-sm font-bold text-white hover:bg-brand-strong"
          >
            문자 보내기
          </a>
          <CopyButton value={inviteMessage(name, current.link, current.until)} label="문구 복사" />
          <SubmitButton variant="secondary" pendingText="…" className="h-9 px-3 text-[13px] font-normal">
            새 링크
          </SubmitButton>
        </>
      ) : (
        <SubmitButton variant="secondary" pendingText="만드는 중…" className="h-9 px-3">
          개인 링크 만들기
        </SubmitButton>
      )}
      {state.error && (
        <p role="alert" className="w-full text-[13px] font-bold text-warn">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function RemoveRowButton({ rosterId, name }: { rosterId: string; name: string }) {
  const [state, action] = useActionState<RosterState, FormData>(removeRosterRows, {});
  return (
    <form action={action}>
      <input type="hidden" name="rosterId" value={rosterId} />
      <button type="submit" aria-label={`${name} 명단에서 지우기`} className="h-9 rounded-md px-2 text-[13px] text-muted underline underline-offset-4 hover:text-ink">
        지우기
      </button>
      {state.error && <span className="text-[13px] text-warn">{state.error}</span>}
    </form>
  );
}

export function RemoveListForm({ listName, count }: { listName: string; count: number }) {
  const [state, action] = useActionState<RosterState, FormData>(removeRosterRows, {});
  return (
    <details>
      <summary className="min-h-10 cursor-pointer py-2 text-[13px] text-muted">이 명단 지우기</summary>
      <form action={action} className="flex flex-wrap items-center gap-2 pb-2">
        <input type="hidden" name="listName" value={listName} />
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="h-4 w-4 accent-brand" />
          {count}명을 명단에서 지워요 (가입한 회원은 그대로)
        </label>
        <SubmitButton variant="secondary" pendingText="지우는 중…" className="h-10">
          지우기
        </SubmitButton>
        <Message state={state} />
      </form>
    </details>
  );
}

// 가입이 끝난 사람을 명단에서 지운다 (회원 정보와 겹치는 개인정보 줄이기)
export function RemoveJoinedForm({ count }: { count: number }) {
  const [state, action] = useActionState<RosterState, FormData>(() => removeJoined(), {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm text-body">
        가입한 {count}명은 회원 목록에 있어서 명단에 남겨 둘 필요가 없어요. 개인정보를 줄이려면 명단에서 지워 주세요.
      </p>
      <SubmitButton variant="secondary" pendingText="지우는 중…" className="h-10 self-start sm:self-auto">
        가입한 {count}명 명단에서 지우기
      </SubmitButton>
      <Message state={state} />
    </form>
  );
}
