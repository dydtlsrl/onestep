-- 2단계 보완 2: 날짜만 골라 신청하고, 역할은 대표가 나중에 나눈다
--
-- 적용 방법: 20261101000000_review_fixes.sql을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - "destructive operation" 경고가 뜬다. 모집 역할 표(event_positions)와 "대표 지정" 구분을 지우기 때문이며,
--     지우기 전에 인원·단가는 날짜로, 고른 역할 이름은 신청으로 옮긴다.
--
-- 바뀌는 것
--   - 회원은 날짜(세팅일·진행일)만 골라 신청한다. 역할은 고르지 않는다.
--   - 날짜마다 모집 인원과 단가(시급·일급, 최소 보장 시간, 일급 초과 금액)를 하나씩 정한다.
--   - 대표는 신청자마다 역할 이름(예: 감독관)과 "이 사람만 다른 단가"를 적을 수 있다.
--   - 회원마다 기본 시급을 정해 둘 수 있다 (회원 상세).
--   - 공통 계산 규칙에 "기본 시급"(처음 11,000원)을 둔다. 새 날짜를 만들 때 이 값이 들어간다.
--
-- 단가 정하는 순서 (화면과 정산이 같은 순서를 쓴다, src/lib/pay.ts effectiveRate)
--   1. 이 일정에서 이 사람만 정한 단가 (applications.rate_override)
--   2. 시급인 날이면 회원 기본 시급(profiles.default_rate)과 날짜 단가 중 높은 쪽
--   3. 날짜 단가 (event_days.rate)


-- 1. 날짜에 모집 인원과 단가 ----------------------------------------------------------------

alter table public.event_days
  add column headcount integer,
  add column pay_type public.pay_type,
  add column rate integer,
  add column min_paid_hours numeric(3, 1),
  add column overtime_rate integer;

-- 날짜의 역할들을 합친다: 인원은 더하고, 단가는 첫 번째 역할의 것을 쓴다
update public.event_days d
set headcount = s.headcount,
    pay_type = s.pay_type,
    rate = s.rate,
    min_paid_hours = s.min_paid_hours,
    overtime_rate = s.overtime_rate
from (
  select day_id,
         sum(headcount)::integer as headcount,
         (array_agg(pay_type order by sort_order))[1] as pay_type,
         (array_agg(rate order by sort_order))[1] as rate,
         (array_agg(min_paid_hours order by sort_order))[1] as min_paid_hours,
         (array_agg(overtime_rate order by sort_order))[1] as overtime_rate
  from public.event_positions
  group by day_id
) s
where s.day_id = d.id;

update public.event_days
set headcount = coalesce(headcount, 1),
    pay_type = coalesce(pay_type, 'hourly'),
    rate = coalesce(rate, 11000);

alter table public.event_days
  alter column headcount set not null,
  alter column headcount set default 1,
  alter column pay_type set not null,
  alter column pay_type set default 'hourly',
  alter column rate set not null,
  add constraint event_days_headcount_check check (headcount between 1 and 500),
  add constraint event_days_rate_check check (rate between 0 and 10000000),
  add constraint event_days_min_paid_hours_check check (min_paid_hours is null or min_paid_hours between 0 and 24),
  add constraint event_days_overtime_rate_check check (overtime_rate is null or overtime_rate between 0 and 10000000);


-- 2. 신청: 대표가 나중에 적는 역할 이름과, 이 사람만 다른 단가 -------------------------------------

alter table public.applications
  add column role_name text not null default '' check (char_length(role_name) <= 30),
  add column rate_override integer check (rate_override is null or rate_override between 0 and 10000000);

-- 회원이 고른 역할 이름을 옮기고, 그 역할 단가가 날짜 단가와 달랐으면 이 사람만 다른 단가로 남긴다
update public.applications a
set role_name = p.role_name,
    rate_override = case when p.pay_type = d.pay_type and p.rate <> d.rate then p.rate end
from public.event_positions p
join public.event_days d on d.id = p.day_id
where p.id = a.position_id;

alter table public.applications
  drop constraint applications_position_day_fkey,
  drop constraint applications_position_id_event_id_fkey,
  drop column position_id;


-- 3. 모집 역할 표와 "대표 지정" 구분을 없앤다 -------------------------------------------------

drop function public.position_selected_counts(uuid[]);
drop function public.apply_to_event(uuid, uuid[]);
drop function public.add_member_to_event(uuid, uuid, uuid);
drop table public.event_positions;

alter table public.event_days drop column recruit;
drop type public.day_recruit;


-- 4. 회원 기본 시급, 공통 기본 시급 ------------------------------------------------------------

alter table public.profiles
  add column default_rate integer check (default_rate is null or default_rate between 0 and 10000000);

update public.app_settings
set value = value || '{"default_hourly_rate": 11000}'::jsonb
where key = 'pay_rules' and not (value ? 'default_hourly_rate');


-- 도우미 함수 ------------------------------------------------------------------

-- 날짜별 확정 인원 (남은 자리 표시용). 볼 수 있는 일정의 것만 돌려준다.
create function public.day_selected_counts(p_event_ids uuid[])
returns table (event_id uuid, day_id uuid, selected_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.event_id, d.id, count(a.id) filter (where a.status = 'selected')::integer
  from public.event_days d
  join public.events e on e.id = d.event_id
  left join public.applications a on a.day_id = d.id
  where d.event_id = any (p_event_ids)
    and public.can_view_event(e.id, e.status)
  group by d.event_id, d.id;
$$;

-- 날짜를 저장한다 (create_event·update_event가 같이 쓴다)
-- p_days: [{"id"(고칠 때만),"day_date","kind","gather_time","start_time","end_time",
--           "headcount","pay_type","rate","min_paid_hours","overtime_rate"}]
create or replace function public.save_event_days(p_event_id uuid, p_days jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_ord bigint;
  v_day_id uuid;
  r record;
  v_keep uuid[];
begin
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'DAYS_REQUIRED';
  end if;
  if jsonb_array_length(p_days) > 31 then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(array_agg((d ->> 'id')::uuid) filter (where nullif(d ->> 'id', '') is not null), '{}')
  into v_keep
  from jsonb_array_elements(p_days) d;

  -- 신청이 있는 날짜는 뺄 수 없다
  if exists (
    select 1 from public.applications a
    where a.event_id = p_event_id and a.day_id <> all (v_keep)
  ) then
    raise exception 'DAY_IN_USE';
  end if;

  delete from public.event_days where event_id = p_event_id and id <> all (v_keep);

  for v_day, v_ord in select t.item, t.ord from jsonb_array_elements(p_days) with ordinality as t(item, ord) loop
    v_day_id := nullif(v_day ->> 'id', '')::uuid;
    select * into r from jsonb_to_record(v_day) as x(
      day_date date, kind text, gather_time text, start_time time, end_time time,
      headcount integer, pay_type public.pay_type, rate integer, min_paid_hours numeric, overtime_rate integer
    );
    if v_day_id is null then
      insert into public.event_days (
        event_id, day_date, kind, gather_time, start_time, end_time, sort_order,
        headcount, pay_type, rate, min_paid_hours, overtime_rate
      )
      values (
        p_event_id, r.day_date, coalesce(nullif(r.kind, ''), 'main')::public.event_day_kind,
        nullif(r.gather_time, '')::time, r.start_time, r.end_time, v_ord,
        r.headcount, r.pay_type, r.rate,
        case when r.pay_type = 'hourly' then r.min_paid_hours end,
        case when r.pay_type = 'daily' then r.overtime_rate end
      );
    else
      update public.event_days
      set day_date = r.day_date,
          kind = coalesce(nullif(r.kind, ''), 'main')::public.event_day_kind,
          gather_time = nullif(r.gather_time, '')::time,
          start_time = r.start_time,
          end_time = r.end_time,
          sort_order = v_ord,
          headcount = r.headcount,
          pay_type = r.pay_type,
          rate = r.rate,
          min_paid_hours = case when r.pay_type = 'hourly' then r.min_paid_hours end,
          overtime_rate = case when r.pay_type = 'daily' then r.overtime_rate end
      where id = v_day_id and event_id = p_event_id;
      if not found then
        raise exception 'INVALID_INPUT';
      end if;
    end if;
  end loop;

  update public.events e
  set start_date = d.first_day, end_date = d.last_day
  from (
    select min(day_date) as first_day, max(day_date) as last_day
    from public.event_days where event_id = p_event_id
  ) d
  where e.id = p_event_id;
end;
$$;


-- 신청·취소 (회원) ----------------------------------------------------------------------

-- 참여할 날짜를 골라 신청한다
create function public.apply_to_event(p_event_id uuid, p_day_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_found integer;
begin
  if v_uid is null or not public.is_active_member() then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status not in ('open_core', 'open_all')
    or not public.can_view_event(v_event.id, v_event.status) then
    raise exception 'EVENT_NOT_OPEN';
  end if;
  if v_event.apply_deadline is not null and v_event.apply_deadline <= now() then
    raise exception 'DEADLINE_PASSED';
  end if;
  if coalesce(cardinality(p_day_ids), 0) = 0 then
    raise exception 'CHOOSE_DAYS';
  end if;

  select count(*) into v_found from public.event_days where id = any (p_day_ids) and event_id = p_event_id;
  if v_found <> cardinality(p_day_ids) then
    raise exception 'INVALID_INPUT';
  end if;

  if exists (
    select 1 from public.applications
    where event_id = p_event_id and member_id = v_uid and status <> 'cancelled'
  ) then
    raise exception 'ALREADY_APPLIED_EVENT';
  end if;

  if v_event.all_days_required and exists (
    select 1 from public.event_days d where d.event_id = p_event_id and d.id <> all (p_day_ids)
  ) then
    raise exception 'ALL_DAYS_REQUIRED';
  end if;

  -- 취소했던 날짜는 다시 신청한다 (대표가 적은 역할·단가는 그대로 둔다)
  insert into public.applications (event_id, day_id, member_id)
  select p_event_id, d.id, v_uid
  from public.event_days d
  where d.id = any (p_day_ids)
  on conflict (day_id, member_id) do update
  set status = 'applied', applied_at = now(),
      cancelled_at = null, cancel_reason = '', decided_at = null, decided_by = null,
      notified_status = null, notified_at = null, attendance = 'unknown', overtime_minutes = 0
  where public.applications.status = 'cancelled';
end;
$$;


-- 선발 (대표만) ------------------------------------------------------------------------

-- 신청하지 않은 회원을 그 날짜의 확정자로 추가 (전화로 섭외한 경우 등)
create function public.add_member_to_event(p_event_id uuid, p_day_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select status into v_status from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_status in ('draft', 'completed', 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;
  if not exists (select 1 from public.profiles where id = p_member_id and status = 'active') then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.event_days where id = p_day_id and event_id = p_event_id) then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.applications (event_id, day_id, member_id, status, added_by_admin, decided_at, decided_by)
  values (p_event_id, p_day_id, p_member_id, 'selected', true, now(), auth.uid())
  on conflict (day_id, member_id) do update
  set status = 'selected', added_by_admin = true,
      decided_at = now(), decided_by = auth.uid(), cancelled_at = null, cancel_reason = '';

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.add', 'event', p_event_id,
          jsonb_build_object('member_id', p_member_id, 'day_id', p_day_id));
end;
$$;

-- 신청자의 역할 이름과 이 사람만 다른 단가를 적는다 (비우면 역할 없음·기본 단가)
create function public.set_application_detail(p_application_id uuid, p_role_name text, p_rate_override integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_status public.event_status;
  v_role text := btrim(coalesce(p_role_name, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if char_length(v_role) > 30 or (p_rate_override is not null and (p_rate_override < 0 or p_rate_override > 10000000)) then
    raise exception 'INVALID_INPUT';
  end if;

  select a.event_id, e.status into v_event_id, v_status
  from public.applications a join public.events e on e.id = a.event_id
  where a.id = p_application_id;
  if not found then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;
  if v_status = 'cancelled' then
    raise exception 'EVENT_LOCKED';
  end if;

  update public.applications
  set role_name = v_role, rate_override = p_rate_override
  where id = p_application_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.detail', 'application', p_application_id,
          jsonb_build_object('role_name', v_role, 'rate_override', p_rate_override));
end;
$$;

-- 선발 결과 알림. 결과가 바뀐 날짜가 있는 사람에게 한 번씩 보낸다. 확정된 날짜(와 역할)를 모아 적는다.
create or replace function public.notify_selection_results(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  with targets as (
    update public.applications
    set notified_status = status, notified_at = now()
    where event_id = p_event_id
      and status in ('selected', 'rejected')
      and notified_status is distinct from status
    returning member_id
  ),
  summary as (
    select a.member_id,
           string_agg(public.day_label(d) || case when a.role_name <> '' then ' ' || a.role_name else '' end,
                      ', ' order by d.day_date, d.start_time)
             filter (where a.status = 'selected') as selected_days
    from public.applications a
    join public.event_days d on d.id = a.day_id
    where a.event_id = p_event_id
      and a.member_id in (select member_id from targets)
    group by a.member_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select member_id,
         case when selected_days is not null then 'application.selected' else 'application.rejected' end,
         left(case when selected_days is not null then '확정되었어요: ' else '선발 결과: ' end || public.event_label(v_event), 100),
         case when selected_days is not null
              then left('확정: ' || selected_days || '. 집합 안내와 확정자 톡방 링크를 확인해 주세요.', 300)
              else '이번 일정은 함께하지 못하게 되었어요. 다음 일정에서 만나요.' end,
         '/events/' || p_event_id
  from summary;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.notify', 'event', p_event_id, jsonb_build_object('count', v_count));

  return v_count;
end;
$$;


-- 회원 기본 시급 (대표만) -------------------------------------------------------------------

create function public.set_member_rate(p_member_id uuid, p_rate integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_rate is not null and (p_rate < 0 or p_rate > 10000000) then
    raise exception 'INVALID_INPUT';
  end if;

  update public.profiles set default_rate = p_rate where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.rate', 'profile', p_member_id, jsonb_build_object('default_rate', p_rate));
end;
$$;


-- 공통 계산 규칙: 기본 시급 추가 ----------------------------------------------------------------
-- 3번 파일의 함수와 같고, 기본 시급(p_default_hourly_rate)을 받는다. 비우면(null) 지금 값을 그대로 둔다.

drop function public.update_pay_rules(numeric, integer, text, numeric, text);

create function public.update_pay_rules(
  p_overtime_multiplier numeric,
  p_overtime_unit_minutes integer,
  p_overtime_rounding text,
  p_default_min_paid_hours numeric,
  p_reason text default '',
  p_default_hourly_rate integer default null
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
  v_hourly integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if p_overtime_multiplier is null or p_overtime_multiplier < 1 or p_overtime_multiplier > 3
    or p_overtime_unit_minutes is null or p_overtime_unit_minutes not in (10, 15, 30, 60)
    or p_overtime_rounding is null or p_overtime_rounding not in ('floor', 'ceil', 'round')
    or p_default_min_paid_hours is null or p_default_min_paid_hours < 0 or p_default_min_paid_hours > 12
    or (p_default_hourly_rate is not null and (p_default_hourly_rate < 0 or p_default_hourly_rate > 1000000))
    or char_length(v_reason) > 200
  then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(p_default_hourly_rate, (value ->> 'default_hourly_rate')::integer, 11000)
  into v_hourly
  from public.app_settings where key = 'pay_rules';

  v_value := jsonb_build_object(
    'overtime_multiplier', round(p_overtime_multiplier, 2),
    'overtime_unit_minutes', p_overtime_unit_minutes,
    'overtime_rounding', p_overtime_rounding,
    'default_min_paid_hours', round(p_default_min_paid_hours, 1),
    'default_hourly_rate', coalesce(v_hourly, 11000)
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

revoke all on function public.day_selected_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.apply_to_event(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.add_member_to_event(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_application_detail(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.set_member_rate(uuid, integer) from public, anon, authenticated;
revoke all on function public.update_pay_rules(numeric, integer, text, numeric, text, integer) from public, anon, authenticated;

grant execute on function public.day_selected_counts(uuid[]) to authenticated;
grant execute on function public.apply_to_event(uuid, uuid[]) to authenticated;
grant execute on function public.add_member_to_event(uuid, uuid, uuid) to authenticated;
grant execute on function public.set_application_detail(uuid, text, integer) to authenticated;
grant execute on function public.set_member_rate(uuid, integer) to authenticated;
grant execute on function public.update_pay_rules(numeric, integer, text, numeric, text, integer) to authenticated;
