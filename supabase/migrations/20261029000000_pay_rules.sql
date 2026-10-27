-- 단가표 보완: 시급·일급, 최소 보장 시간, 초과 시간 보수, 공통 계산 규칙
--
-- 적용 방법: 앞의 두 파일을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--
-- 계산 방식 (src/lib/pay.ts와 같아야 한다)
--   시급: 기본 = 단가 × max(정해진 근무 시간, 최소 보장 시간)
--         초과 = 단가 × 초과 배율 × 초과 시간
--   일급: 기본 = 단가 (1회)
--         초과 = 초과 1시간당 금액 × 초과 시간
--   초과 시간은 계산 단위(예: 60분)로 나누고, 단위 미만은 버림·올림·반올림 중 설정대로 처리한다.


-- 단가표 항목 추가 -------------------------------------------------------------

create type public.pay_type as enum ('hourly', 'daily');

-- 이미 등록한 역할은 "1회 금액"으로 넣은 것이므로 일급으로 두고, 새 역할부터 시급이 기본값이 된다
alter table public.job_roles
  add column pay_type public.pay_type not null default 'daily';
alter table public.job_roles
  alter column pay_type set default 'hourly';

alter table public.job_roles
  -- 시급 역할의 최소 보장 시간. 비우면 공통 규칙의 기본값을 쓴다
  add column min_paid_hours numeric(3, 1) check (min_paid_hours is null or min_paid_hours between 0 and 24),
  -- 일급 역할의 초과 1시간당 금액. 시급 역할은 단가 × 초과 배율로 계산하므로 쓰지 않는다
  add column overtime_rate integer check (overtime_rate is null or overtime_rate between 0 and 10000000);

grant insert (pay_type, min_paid_hours, overtime_rate) on public.job_roles to authenticated;
grant update (pay_type, min_paid_hours, overtime_rate) on public.job_roles to authenticated;


-- 공통 설정 --------------------------------------------------------------------
-- PRD 4.9절 설정값을 담는다. 지금은 보수 계산 규칙(pay_rules)만 쓴다.
-- 값이 바뀔 때마다 버전을 올리고 이력을 남긴다. 정산 때 적용한 버전을 함께 저장해 과거 금액이 바뀌지 않게 한다.

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.app_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  value jsonb not null,
  version integer not null,
  effective_from timestamptz not null,
  changed_by uuid references public.profiles (id) on delete set null,
  change_reason text not null default '' check (char_length(change_reason) <= 200),
  changed_at timestamptz not null default now()
);

-- 처음 값: 초과 배율 1.5배, 1시간 단위, 단위 미만 버림, 기본 최소 보장 시간 없음
insert into public.app_settings (key, value)
values ('pay_rules', '{"overtime_multiplier": 1.5, "overtime_unit_minutes": 60, "overtime_rounding": "floor", "default_min_paid_hours": 0}');

insert into public.app_settings_history (key, value, version, effective_from, change_reason)
select key, value, version, effective_from, '처음 값'
from public.app_settings
where key = 'pay_rules';

-- 보수 계산 규칙 변경 (대표만). 값을 검사하고 버전을 올린 뒤 이력을 남긴다.
create function public.update_pay_rules(
  p_overtime_multiplier numeric,
  p_overtime_unit_minutes integer,
  p_overtime_rounding text,
  p_default_min_paid_hours numeric,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
  v_version integer;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_overtime_multiplier is null or p_overtime_multiplier < 1 or p_overtime_multiplier > 3
    or p_overtime_unit_minutes is null or p_overtime_unit_minutes not in (10, 15, 30, 60)
    or p_overtime_rounding is null or p_overtime_rounding not in ('floor', 'ceil', 'round')
    or p_default_min_paid_hours is null or p_default_min_paid_hours < 0 or p_default_min_paid_hours > 12
    or char_length(v_reason) > 200
  then
    raise exception 'INVALID_INPUT';
  end if;

  v_value := jsonb_build_object(
    'overtime_multiplier', round(p_overtime_multiplier, 2),
    'overtime_unit_minutes', p_overtime_unit_minutes,
    'overtime_rounding', p_overtime_rounding,
    'default_min_paid_hours', round(p_default_min_paid_hours, 1)
  );

  update public.app_settings
  set value = v_value,
      version = version + 1,
      effective_from = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where key = 'pay_rules'
  returning version into v_version;

  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  insert into public.app_settings_history (key, value, version, effective_from, changed_by, change_reason)
  values ('pay_rules', v_value, v_version, now(), auth.uid(), v_reason);

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'settings.pay_rules', 'setting', null, v_value || jsonb_build_object('version', v_version));
end;
$$;


-- 권한 -----------------------------------------------------------------------

revoke all on public.app_settings, public.app_settings_history from anon, authenticated;
grant select on public.app_settings, public.app_settings_history to authenticated;

revoke all on function public.update_pay_rules(numeric, integer, text, numeric, text) from public, anon, authenticated;
grant execute on function public.update_pay_rules(numeric, integer, text, numeric, text) to authenticated;

alter table public.app_settings enable row level security;
alter table public.app_settings_history enable row level security;

create policy "대표만 설정을 본다"
  on public.app_settings for select to authenticated
  using ((select public.is_admin()));

create policy "대표만 설정 이력을 본다"
  on public.app_settings_history for select to authenticated
  using ((select public.is_admin()));
