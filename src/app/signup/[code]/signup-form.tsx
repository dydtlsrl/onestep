"use client";

import { useActionState } from "react";
import { Notice } from "@/components/page-shell";
import { SubmitButton } from "@/components/submit-button";
import { submitApplication, type SignupState } from "./actions";

const inputClass =
  "h-12 w-full rounded-lg border border-field bg-white px-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft";

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[13px] text-muted">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-bold text-warn">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldName = keyof NonNullable<SignupState["fieldErrors"]>;

export function SignupForm({ code }: { code: string }) {
  const [state, formAction] = useActionState<SignupState, FormData>(submitApplication, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  // 오류가 있으면 입력칸과 오류 문구를 연결해 화면 읽기 도구가 함께 읽게 한다
  const invalid = (field: FieldName) =>
    e[field] ? { "aria-invalid": true as const, "aria-describedby": `${field}-error` } : {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="code" value={code} />

      <Field id="name" label="이름 (필수)" error={e.name}>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          maxLength={40}
          defaultValue={v.name}
          className={inputClass}
          {...invalid("name")}
        />
      </Field>

      <Field id="phone" label="휴대폰 번호 (필수)" hint="일정 안내와 본인 확인에 써요." error={e.phone}>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-1234-5678"
          required
          defaultValue={v.phone}
          className={inputClass}
          {...invalid("phone")}
        />
      </Field>

      <Field id="region" label="활동 가능 지역" hint="예: 서울·경기" error={e.region}>
        <input
          id="region"
          name="region"
          maxLength={40}
          defaultValue={v.region}
          className={inputClass}
          {...invalid("region")}
        />
      </Field>

      <Field id="careerYears" label="진행요원 경력 (필수, 년)" error={e.careerYears}>
        <input
          id="careerYears"
          name="careerYears"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          required
          defaultValue={v.careerYears ?? "0"}
          className={inputClass}
          {...invalid("careerYears")}
        />
      </Field>

      <Field id="careerNote" label="경력 사항" hint="주로 했던 일, 기억에 남는 현장 등을 자유롭게 적어 주세요." error={e.careerNote}>
        <textarea
          id="careerNote"
          name="careerNote"
          rows={4}
          maxLength={1000}
          defaultValue={v.careerNote}
          className="w-full rounded-lg border border-field bg-white p-3 text-[15px] outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
          {...invalid("careerNote")}
        />
      </Field>

      <Field id="referrerName" label="추천인 이름" hint="원스텝을 소개해 준 분이 있다면 적어 주세요." error={e.referrerName}>
        <input
          id="referrerName"
          name="referrerName"
          maxLength={40}
          defaultValue={v.referrerName}
          className={inputClass}
          {...invalid("referrerName")}
        />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-line bg-ground p-4">
        <legend className="px-1 text-sm font-bold">개인정보 수집·이용 동의 (필수)</legend>
        <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-[13px] leading-relaxed text-body">
          <dt className="font-bold">수집 항목</dt>
          <dd>
            이름, 휴대폰 번호, 활동 가능 지역, 경력, 추천인 이름. 로그인한 카카오·Google 계정의 이메일, 이름(닉네임),
            프로필 사진
          </dd>
          <dt className="font-bold">이용 목적</dt>
          <dd>회원 확인, 일정 안내와 선발, 연락</dd>
          <dt className="font-bold">보유 기간</dt>
          <dd>탈퇴할 때까지. 법령에 따라 보관해야 하는 정보는 그 기간까지</dd>
        </dl>
        <p className="text-[13px] leading-relaxed text-muted">
          동의하지 않을 수 있지만, 동의하지 않으면 가입할 수 없어요. 주민등록번호와 계좌번호는 지금 받지 않고, 첫 계약서
          서명 때 따로 받아요.
        </p>
        <label htmlFor="privacy" className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            id="privacy"
            name="privacy"
            type="checkbox"
            required
            defaultChecked={v.privacy === "on"}
            className="h-5 w-5 accent-brand"
            {...invalid("privacy")}
          />
          <span className="text-[15px] font-bold">위 내용에 동의합니다</span>
        </label>
        {e.privacy && (
          <p id="privacy-error" className="text-[13px] font-bold text-warn">
            {e.privacy}
          </p>
        )}
      </fieldset>

      {state.error && (
        <div role="alert">
          <Notice tone="warn">{state.error}</Notice>
        </div>
      )}

      <SubmitButton pendingText="신청하는 중…" className="h-12 text-[15px]">
        가입 신청하기
      </SubmitButton>
    </form>
  );
}
