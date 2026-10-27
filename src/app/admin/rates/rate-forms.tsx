"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatWon } from "@/lib/format";
import { createRole, setRoleActive, updateRole, type RateState } from "./actions";

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  default_rate: number;
  sort_order: number;
  is_active: boolean;
}

const fieldClass = "h-11 w-full rounded-lg border border-field bg-white px-3 text-sm";

function Message({ state }: { state: RateState }) {
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

// 역할 입력칸 묶음 (추가·수정에서 같이 쓴다)
function RoleFields({ idPrefix, role, nextOrder }: { idPrefix: string; role?: RoleRow; nextOrder?: number }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-[2_1_160px] flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className="text-sm font-bold">
          역할 이름
        </label>
        <input id={`${idPrefix}-name`} name="name" required maxLength={30} defaultValue={role?.name} placeholder="예: 감독관" className={fieldClass} />
      </div>
      <div className="flex flex-[1_1_140px] flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-rate`} className="text-sm font-bold">
          인력 단가 (원)
        </label>
        <input
          id={`${idPrefix}-rate`}
          name="defaultRate"
          inputMode="numeric"
          required
          defaultValue={role ? String(role.default_rate) : ""}
          placeholder="예: 130000"
          className={`${fieldClass} text-right`}
        />
      </div>
      <div className="flex flex-[3_1_220px] flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-desc`} className="text-sm font-bold">
          설명
        </label>
        <input id={`${idPrefix}-desc`} name="description" maxLength={200} defaultValue={role?.description} placeholder="예: 고사실 감독" className={fieldClass} />
      </div>
      <div className="flex w-20 flex-col gap-1.5">
        <label htmlFor={`${idPrefix}-order`} className="text-sm font-bold">
          순서
        </label>
        <input
          id={`${idPrefix}-order`}
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          defaultValue={role?.sort_order ?? nextOrder ?? 0}
          className={`${fieldClass} text-right`}
        />
      </div>
    </div>
  );
}

export function CreateRoleForm({ nextOrder }: { nextOrder: number }) {
  const [state, action] = useActionState<RateState, FormData>(createRole, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <RoleFields idPrefix="new" nextOrder={nextOrder} />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="추가 중…">역할 추가</SubmitButton>
        <Message state={state} />
      </div>
    </form>
  );
}

// 단가표 한 줄. 평소에는 값만 보이고, 고치기를 누르면 입력칸이 열린다.
export function RoleItem({ role }: { role: RoleRow }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<RateState, FormData>(async (prev: RateState, formData: FormData) => {
    const result = await updateRole(prev, formData);
    if (!result.error) setEditing(false);
    return result;
  }, {});

  return (
    <li className={`flex flex-col gap-3 border-b border-[#eef0f3] py-4 last:border-0 ${role.is_active ? "" : "opacity-60"}`}>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-8 text-right text-sm text-muted">{role.sort_order}</span>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col">
            <span className="flex items-center gap-2 font-bold">
              {role.name}
              {!role.is_active && <span className="rounded border border-line px-1.5 text-[11px] font-bold text-muted">숨김</span>}
            </span>
            {role.description && <span className="text-sm text-muted">{role.description}</span>}
          </div>
          <span className="text-[15px] font-bold">{formatWon(role.default_rate)}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground"
            >
              고치기
            </button>
            <form action={setRoleActive}>
              <input type="hidden" name="id" value={role.id} />
              <input type="hidden" name="active" value={role.is_active ? "false" : "true"} />
              <button type="submit" className="h-9 rounded-md border border-field bg-white px-3 text-sm font-bold text-ink hover:bg-ground">
                {role.is_active ? "숨기기" : "다시 보이기"}
              </button>
            </form>
          </div>
          <Message state={state} />
        </div>
      ) : (
        <form action={action} className="flex flex-col gap-3 rounded-lg bg-ground p-3">
          <input type="hidden" name="id" value={role.id} />
          <RoleFields idPrefix={role.id} role={role} />
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton pendingText="저장 중…">저장</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-11 rounded-lg border border-field bg-white px-4 text-sm font-bold text-ink"
            >
              취소
            </button>
            <Message state={state} />
          </div>
        </form>
      )}
    </li>
  );
}
