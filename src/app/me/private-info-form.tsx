"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { BANKS } from "@/lib/private-info";
import { savePrivateInfo, type PrivateState } from "./actions";

export interface PrivateSummary {
  rrn_masked: string;
  bank_name: string;
  account_masked: string;
  account_holder: string;
  address: string;
}

const input = "h-12 w-full rounded-lg border border-field bg-white px-3 text-[15px]";

// 주민번호·계좌 등록/수정. 이미 등록했으면 주민번호·계좌번호 칸은 비워 두면 그대로 둔다.
export function PrivateInfoForm({ current, defaultHolder }: { current: PrivateSummary | null; defaultHolder: string }) {
  const [state, action] = useActionState<PrivateState, FormData>(savePrivateInfo, {});
  const editing = current !== null;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pi-rrn" className="text-sm font-bold">
          주민등록번호
        </label>
        <input
          id="pi-rrn"
          name="rrn"
          inputMode="numeric"
          autoComplete="off"
          maxLength={14}
          placeholder={editing ? `${current.rrn_masked} (바꿀 때만 입력)` : "예: 900101-1234567"}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pi-bank" className="text-sm font-bold">
          은행
        </label>
        <select id="pi-bank" name="bank" defaultValue={current?.bank_name ?? ""} required className={input}>
          <option value="" disabled>
            은행을 골라 주세요
          </option>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pi-account" className="text-sm font-bold">
          계좌번호
        </label>
        <input
          id="pi-account"
          name="account"
          inputMode="numeric"
          autoComplete="off"
          maxLength={30}
          placeholder={editing ? `${current.account_masked} (바꿀 때만 입력)` : "숫자만 적어도 돼요"}
          className={input}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pi-holder" className="text-sm font-bold">
          예금주
        </label>
        <input id="pi-holder" name="holder" defaultValue={current?.account_holder ?? defaultHolder} maxLength={30} required className={input} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pi-address" className="text-sm font-bold">
          주소 <span className="font-normal text-muted">(계약서에 들어가요)</span>
        </label>
        <input id="pi-address" name="address" defaultValue={current?.address ?? ""} maxLength={200} placeholder="예: 서울시 OO구 OO로 12" className={input} />
      </div>
      <p className="text-[13px] leading-relaxed text-muted">
        주민등록번호와 계좌번호는 암호화해서 보관해요. 보수 지급과 원천징수 신고에만 쓰고, 대표님이 볼 때마다 기록이 남아요.
      </p>
      <SubmitButton pendingText="저장 중…" className="h-12">
        {editing ? "정산 정보 고치기" : "정산 정보 등록하기"}
      </SubmitButton>
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
