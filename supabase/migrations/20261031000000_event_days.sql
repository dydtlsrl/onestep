-- 2단계 보완: 여러 날짜로 된 일정 (필기시험 세팅일 + 시험일, 면접장 세팅 + 면접 1~n일)
--
-- 적용 방법: 20261030000000_events.sql을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 이미 만든 일정은 "1일차짜리 일정"으로 바뀐다. 날짜·시간은 1일차로 옮겨지고 신청·출석 기록도 그대로 남는다.
--   - SQL Editor가 "destructive operation" 경고를 띄운다. 옛 열(일정의 날짜·시간)과 옛 함수를 지우기 때문이며,
--     지우기 전에 값을 새 표로 옮긴다.
--
-- 바뀌는 것
--   - 일정 1건 안에 날짜(일차)를 여러 개 둔다. 날짜마다 종류(세팅·진행·기타), 시간, 모집 역할·인원·단가가 따로다.
--   - 날짜마다 "공개 모집" 또는 "대표 지정"을 고른다. 대표 지정인 날은 회원 신청 화면에 나오지 않는다.
--   - 회원은 공개 모집인 날짜를 골라 신청한다. "모든 날짜 참여 필수" 일정은 모든 공개 모집 날짜를 함께 신청해야 한다.
--   - 신청·선발·출석·초과 시간은 날짜별로 기록한다. 선발 결과 알림은 한 사람에게 한 번만 보낸다.
--   - 교통비·지방비는 "참여한 날마다" 또는 "일정당 한 번"을 고른다.
--   - 고친 것: 알림 제목·내용이 길이 제한(100자·300자)을 넘어 공개·취소가 실패하던 문제,
--     활동 제한·탈퇴한 회원이 전에 받은 톡방 링크를 계속 볼 수 있던 문제


-- 상태값 ---------------------------------------------------------------------

create type public.event_day_kind as enum ('setup', 'main', 'other');
create type public.day_recruit as enum ('open', 'assign');


-- 날짜(일차) -------------------------------------------------------------------

create table public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  day_date date not null,
  kind public.event_day_kind not null default 'main',
  recruit public.day_recruit not null default 'open',
  gather_time time,
  start_time time not null,
  end_time time not null,
  sort_order integer not null default 0,
  unique (id, event_id),
  check (end_time > start_time),
  check (gather_time is null or gather_time <= start_time)
);

create index event_days_event_idx on public.event_days (event_id, day_date);

-- 이미 만든 일정의 날짜·시간을 1일차로 옮긴다
insert into public.event_days (event_id, day_date, gather_time, start_time, end_time, sort_order)
select id, event_date, gather_time, start_time, end_time, 1
from public.events;


-- 일정: 첫날·마지막 날, 모든 날짜 참여 필수 ------------------------------------------

alter table public.events rename column event_date to start_date;
alter table public.events
  add column end_date date,
  add column all_days_required boolean not null default false;
update public.events set end_date = start_date;
alter table public.events
  alter column end_date set not null,
  add constraint events_date_range check (end_date >= start_date);
-- 시간은 날짜마다 따로 둔다 (값은 위에서 옮겼다)
alter table public.events
  drop column gather_time,
  drop column start_time,
  drop column end_time;

create index events_end_date_idx on public.events (end_date);


-- 모집 역할: 날짜에 붙인다 -------------------------------------------------------------

alter table public.event_positions add column day_id uuid;
update public.event_positions p
set day_id = d.id
from public.event_days d
where d.event_id = p.event_id;
alter table public.event_positions
  alter column day_id set not null,
  add constraint event_positions_day_fkey foreign key (day_id, event_id)
    references public.event_days (id, event_id) on delete cascade,
  add constraint event_positions_id_day_key unique (id, day_id);

create index event_positions_day_id_idx on public.event_positions (day_id);


-- 신청: 날짜마다 한 번 -----------------------------------------------------------------

alter table public.applications add column day_id uuid;
update public.applications a
set day_id = p.day_id
from public.event_positions p
where p.id = a.position_id;
alter table public.applications
  alter column day_id set not null,
  drop constraint applications_event_id_member_id_key,
  add constraint applications_day_id_member_id_key unique (day_id, member_id),
  add constraint applications_day_fkey foreign key (day_id, event_id)
    references public.event_days (id, event_id),
  -- 역할이 같은 날짜의 것인지 DB가 확인한다
  add constraint applications_position_day_fkey foreign key (position_id, day_id)
    references public.event_positions (id, day_id);

create index applications_event_member_idx on public.applications (event_id, member_id);


-- 추가 지급: 참여한 날마다 / 일정당 한 번 ---------------------------------------------------

alter table public.event_extra_rules add column per_day boolean not null default true;


-- 출석 자동 기록: 어느 날짜의 신청에서 나왔는지 ------------------------------------------------

alter table public.member_notes
  add column application_id uuid references public.applications (id) on delete set null;
update public.member_notes n
set application_id = a.id
from public.applications a
where n.auto_source = 'attendance'
  and a.event_id = n.event_id
  and a.member_id = n.member_id;


-- 참여 횟수: 참석·지각한 날이 하루라도 있는 일정 수 ------------------------------------------

create or replace view public.member_participation
with (security_invoker = true)
as
select member_id, count(distinct event_id) as attended_count
from public.applications
where status = 'selected' and attendance in ('attended', 'late')
group by member_id;


-- 도우미 함수 ------------------------------------------------------------------

-- 일정 날짜를 알림 문구용으로 (예: 11/7~11/8 공채 필기시험)
create or replace function public.event_label(p_event public.events)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_event.start_date, 'FMMM/FMDD')
    || case when p_event.end_date > p_event.start_date then '~' || to_char(p_event.end_date, 'FMMM/FMDD') else '' end
    || ' ' || p_event.title;
$$;

-- 날짜 이름 (예: 11/8 진행)
create function public.day_label(p_day public.event_days)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_day.day_date, 'FMMM/FMDD') || ' '
    || case p_day.kind when 'setup' then '세팅' when 'main' then '진행' else '기타' end;
$$;

-- 날짜와 모집 역할을 저장한다 (create_event·update_event가 같이 쓴다)
-- p_days: [{"id"(고칠 때만),"day_date","kind","recruit","gather_time","start_time","end_time",
--           "positions":[{"id"(고칠 때만),"role_id","role_name","pay_type","rate","min_paid_hours","overtime_rate","headcount"}]}]
create function public.save_event_days(p_event_id uuid, p_days jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_day_ord bigint;
  v_day_id uuid;
  v_pos jsonb;
  v_pos_ord bigint;
  v_pos_id uuid;
  r record;
  v_keep_days uuid[];
  v_keep_positions uuid[];
begin
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'DAYS_REQUIRED';
  end if;
  if jsonb_array_length(p_days) > 31 then
    raise exception 'INVALID_INPUT';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_days) d
    where jsonb_typeof(d -> 'positions') is distinct from 'array' or jsonb_array_length(d -> 'positions') = 0
  ) then
    raise exception 'POSITIONS_REQUIRED';
  end if;

  select coalesce(array_agg((d ->> 'id')::uuid) filter (where nullif(d ->> 'id', '') is not null), '{}')
  into v_keep_days
  from jsonb_array_elements(p_days) d;

  select coalesce(array_agg((p ->> 'id')::uuid) filter (where nullif(p ->> 'id', '') is not null), '{}')
  into v_keep_positions
  from jsonb_array_elements(p_days) d
  cross join lateral jsonb_array_elements(d -> 'positions') p;

  -- 지우려는 역할(빠진 날짜의 역할 포함)에 신청자가 있으면 막는다
  if exists (
    select 1 from public.applications a
    where a.event_id = p_event_id and a.position_id <> all (v_keep_positions)
  ) then
    raise exception 'POSITION_IN_USE';
  end if;

  delete from public.event_positions where event_id = p_event_id and id <> all (v_keep_positions);
  delete from public.event_days where event_id = p_event_id and id <> all (v_keep_days);

  for v_day, v_day_ord in select t.item, t.ord from jsonb_array_elements(p_days) with ordinality as t(item, ord) loop
    v_day_id := nullif(v_day ->> 'id', '')::uuid;
    if v_day_id is null then
      insert into public.event_days (event_id, day_date, kind, recruit, gather_time, start_time, end_time, sort_order)
      values (
        p_event_id,
        (v_day ->> 'day_date')::date,
        coalesce(nullif(v_day ->> 'kind', ''), 'main')::public.event_day_kind,
        coalesce(nullif(v_day ->> 'recruit', ''), 'open')::public.day_recruit,
        nullif(v_day ->> 'gather_time', '')::time,
        (v_day ->> 'start_time')::time,
        (v_day ->> 'end_time')::time,
        v_day_ord
      )
      returning id into v_day_id;
    else
      update public.event_days
      set day_date = (v_day ->> 'day_date')::date,
          kind = coalesce(nullif(v_day ->> 'kind', ''), 'main')::public.event_day_kind,
          recruit = coalesce(nullif(v_day ->> 'recruit', ''), 'open')::public.day_recruit,
          gather_time = nullif(v_day ->> 'gather_time', '')::time,
          start_time = (v_day ->> 'start_time')::time,
          end_time = (v_day ->> 'end_time')::time,
          sort_order = v_day_ord
      where id = v_day_id and event_id = p_event_id;
      if not found then
        raise exception 'INVALID_INPUT';
      end if;
    end if;

    for v_pos, v_pos_ord in select t.item, t.ord from jsonb_array_elements(v_day -> 'positions') with ordinality as t(item, ord) loop
      v_pos_id := nullif(v_pos ->> 'id', '')::uuid;
      select * into r from jsonb_to_record(v_pos) as x(
        role_id uuid, role_name text, pay_type public.pay_type, rate integer,
        min_paid_hours numeric, overtime_rate integer, headcount integer
      );
      if v_pos_id is null then
        insert into public.event_positions (
          event_id, day_id, role_id, role_name, pay_type, rate, min_paid_hours, overtime_rate, headcount, sort_order
        )
        values (
          p_event_id, v_day_id, r.role_id, btrim(r.role_name), r.pay_type, r.rate,
          case when r.pay_type = 'hourly' then r.min_paid_hours end,
          case when r.pay_type = 'daily' then r.overtime_rate end,
          r.headcount, v_pos_ord
        );
      else
        -- 역할은 다른 날짜로 옮기지 않는다
        update public.event_positions
        set role_id = r.role_id,
            role_name = btrim(r.role_name),
            pay_type = r.pay_type,
            rate = r.rate,
            min_paid_hours = case when r.pay_type = 'hourly' then r.min_paid_hours end,
            overtime_rate = case when r.pay_type = 'daily' then r.overtime_rate end,
            headcount = r.headcount,
            sort_order = v_pos_ord
        where id = v_pos_id and day_id = v_day_id;
        if not found then
          raise exception 'INVALID_INPUT';
        end if;
      end if;
    end loop;
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


-- 일정 만들기·고치기 (대표만) -------------------------------------------------------
-- p_event: {"type","title","location_name","address","notice","chat_link","apply_deadline","pay_date","all_days_required"}
-- p_days: save_event_days 참고
-- p_extras: [{"type":"transport|regional","tier":"all|core|general","amount","per_day"}]

drop function public.create_event(jsonb, jsonb, jsonb, text, text);
drop function public.update_event(uuid, jsonb, jsonb, jsonb, text, text);

create function public.create_event(
  p_event jsonb,
  p_days jsonb,
  p_extras jsonb,
  p_client_name text,
  p_internal_memo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  begin
    -- 날짜는 save_event_days가 첫날·마지막 날로 고쳐 넣는다
    insert into public.events (
      type, title, start_date, end_date, location_name, address, notice,
      apply_deadline, pay_date, all_days_required, created_by
    )
    values (
      (p_event ->> 'type')::public.event_type,
      btrim(p_event ->> 'title'),
      current_date,
      current_date,
      btrim(coalesce(p_event ->> 'location_name', '')),
      btrim(coalesce(p_event ->> 'address', '')),
      btrim(coalesce(p_event ->> 'notice', '')),
      nullif(p_event ->> 'apply_deadline', '')::timestamptz,
      nullif(p_event ->> 'pay_date', '')::date,
      coalesce((p_event ->> 'all_days_required')::boolean, false),
      auth.uid()
    )
    returning id into v_id;

    insert into public.event_internal (event_id, client_name, memo)
    values (v_id, btrim(coalesce(p_client_name, '')), btrim(coalesce(p_internal_memo, '')));

    insert into public.event_chat_links (event_id, chat_link)
    values (v_id, btrim(coalesce(p_event ->> 'chat_link', '')));

    perform public.save_event_days(v_id, p_days);

    insert into public.event_extra_rules (event_id, type, tier, amount, per_day)
    select v_id, x.type, coalesce(x.tier, 'all'), x.amount, coalesce(x.per_day, true)
    from jsonb_to_recordset(coalesce(p_extras, '[]'::jsonb))
      as x(type public.extra_pay_type, tier text, amount integer, per_day boolean)
    where x.amount > 0;
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or unique_violation or foreign_key_violation or numeric_value_out_of_range then
      raise exception 'INVALID_INPUT';
  end;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.create', 'event', v_id, jsonb_build_object('title', p_event ->> 'title'));

  return v_id;
end;
$$;

create function public.update_event(
  p_event_id uuid,
  p_event jsonb,
  p_days jsonb,
  p_extras jsonb,
  p_client_name text,
  p_internal_memo text
)
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
  if v_status in ('completed', 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;

  begin
    update public.events
    set type = (p_event ->> 'type')::public.event_type,
        title = btrim(p_event ->> 'title'),
        location_name = btrim(coalesce(p_event ->> 'location_name', '')),
        address = btrim(coalesce(p_event ->> 'address', '')),
        notice = btrim(coalesce(p_event ->> 'notice', '')),
        apply_deadline = nullif(p_event ->> 'apply_deadline', '')::timestamptz,
        pay_date = nullif(p_event ->> 'pay_date', '')::date,
        all_days_required = coalesce((p_event ->> 'all_days_required')::boolean, false)
    where id = p_event_id;

    insert into public.event_internal (event_id, client_name, memo)
    values (p_event_id, btrim(coalesce(p_client_name, '')), btrim(coalesce(p_internal_memo, '')))
    on conflict (event_id) do update set client_name = excluded.client_name, memo = excluded.memo;

    insert into public.event_chat_links (event_id, chat_link)
    values (p_event_id, btrim(coalesce(p_event ->> 'chat_link', '')))
    on conflict (event_id) do update set chat_link = excluded.chat_link;

    perform public.save_event_days(p_event_id, p_days);

    delete from public.event_extra_rules where event_id = p_event_id;
    insert into public.event_extra_rules (event_id, type, tier, amount, per_day)
    select p_event_id, x.type, coalesce(x.tier, 'all'), x.amount, coalesce(x.per_day, true)
    from jsonb_to_recordset(coalesce(p_extras, '[]'::jsonb))
      as x(type public.extra_pay_type, tier text, amount integer, per_day boolean)
    where x.amount > 0;
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or unique_violation or foreign_key_violation or numeric_value_out_of_range then
      raise exception 'INVALID_INPUT';
  end;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.update', 'event', p_event_id, '{}'::jsonb);
end;
$$;


-- 신청·취소 (회원) ----------------------------------------------------------------------

drop function public.apply_to_event(uuid, uuid);

-- 공개 모집인 날짜의 역할을 날짜마다 하나씩 골라 신청한다
create function public.apply_to_event(p_event_id uuid, p_position_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_found integer;
  v_days uuid[];
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
  if coalesce(cardinality(p_position_ids), 0) = 0 then
    raise exception 'CHOOSE_DAYS';
  end if;

  -- 이 일정의 공개 모집 날짜 역할인지, 날짜마다 하나씩인지 확인한다
  select count(*), array_agg(distinct p.day_id)
  into v_found, v_days
  from public.event_positions p
  join public.event_days d on d.id = p.day_id
  where p.id = any (p_position_ids) and p.event_id = p_event_id and d.recruit = 'open';
  if v_found <> cardinality(p_position_ids) or v_found <> cardinality(v_days) then
    raise exception 'INVALID_INPUT';
  end if;

  if exists (
    select 1 from public.applications a
    join public.event_days d on d.id = a.day_id
    where a.event_id = p_event_id and a.member_id = v_uid and a.status <> 'cancelled' and d.recruit = 'open'
  ) then
    raise exception 'ALREADY_APPLIED_EVENT';
  end if;

  if v_event.all_days_required and exists (
    select 1 from public.event_days d
    where d.event_id = p_event_id and d.recruit = 'open' and d.id <> all (v_days)
  ) then
    raise exception 'ALL_DAYS_REQUIRED';
  end if;

  -- 취소했던 날짜는 다시 신청한다
  insert into public.applications (event_id, day_id, position_id, member_id)
  select p_event_id, p.day_id, p.id, v_uid
  from public.event_positions p
  where p.id = any (p_position_ids)
  on conflict (day_id, member_id) do update
  set status = 'applied', position_id = excluded.position_id, applied_at = now(),
      cancelled_at = null, cancel_reason = '', decided_at = null, decided_by = null,
      notified_status = null, notified_at = null, attendance = 'unknown', overtime_minutes = 0
  where public.applications.status = 'cancelled';
end;
$$;

-- 이 일정의 확정 전 신청(신청·대기)을 모두 취소한다. 확정된 날짜가 있으면 대표에게 요청한다.
create or replace function public.cancel_application(p_event_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  if not exists (
    select 1 from public.applications
    where event_id = p_event_id and member_id = auth.uid() and status in ('applied', 'waitlisted', 'selected')
  ) then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  select status into v_status from public.events where id = p_event_id for update;
  if v_status in ('completed', 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;

  -- 확정된 뒤에는 회원이 직접 취소하지 않고 대표에게 요청한다 (PRD SET-06 기본값)
  if exists (
    select 1 from public.applications
    where event_id = p_event_id and member_id = auth.uid() and status = 'selected'
  ) then
    raise exception 'ASK_ADMIN';
  end if;

  update public.applications
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(btrim(coalesce(p_reason, '')), 300)
  where event_id = p_event_id and member_id = auth.uid() and status in ('applied', 'waitlisted');
end;
$$;


-- 선발 (대표만) ------------------------------------------------------------------------

-- 여러 신청(날짜별)의 상태를 한 번에 바꾼다. 확정에서 다른 상태로 바꾸면 그 날의 출석 기록도 지운다.
create or replace function public.decide_applications(p_application_ids uuid[], p_status public.application_status)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_status not in ('applied', 'waitlisted', 'selected', 'rejected') then
    raise exception 'INVALID_INPUT';
  end if;

  -- 실제로 바뀐 신청에 대해서만 출석 자동 기록을 지운다
  with changed as (
    update public.applications a
    set status = p_status,
        decided_at = case when p_status = 'applied' then null else now() end,
        decided_by = case when p_status = 'applied' then null else auth.uid() end,
        attendance = case when p_status = 'selected' then a.attendance else 'unknown' end,
        overtime_minutes = case when p_status = 'selected' then a.overtime_minutes else 0 end
    from public.events e
    where a.id = any (p_application_ids)
      and e.id = a.event_id
      and a.status <> 'cancelled'
      and e.status not in ('completed', 'cancelled')
    returning a.id
  ),
  removed as (
    delete from public.member_notes n
    using changed c
    where p_status <> 'selected'
      and n.application_id = c.id and n.auto_source = 'attendance'
    returning n.id
  )
  select count(*) into v_count from changed;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.decide', 'application', null,
          jsonb_build_object('status', p_status, 'count', v_count, 'ids', to_jsonb(p_application_ids)));

  return v_count;
end;
$$;

-- 신청하지 않은 회원을 그 날짜의 확정자로 추가 (대표 지정 날짜, 전화로 섭외한 경우 등)
create or replace function public.add_member_to_event(p_event_id uuid, p_position_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_day_id uuid;
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
  select day_id into v_day_id from public.event_positions where id = p_position_id and event_id = p_event_id;
  if v_day_id is null then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.applications (event_id, day_id, position_id, member_id, status, added_by_admin, decided_at, decided_by)
  values (p_event_id, v_day_id, p_position_id, p_member_id, 'selected', true, now(), auth.uid())
  on conflict (day_id, member_id) do update
  set status = 'selected', position_id = excluded.position_id, added_by_admin = true,
      decided_at = now(), decided_by = auth.uid(), cancelled_at = null, cancel_reason = '';

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.add', 'event', p_event_id,
          jsonb_build_object('member_id', p_member_id, 'day_id', v_day_id));
end;
$$;

-- 선발 결과 알림. 결과가 바뀐 날짜가 있는 사람에게 한 번씩 보낸다. 확정된 날짜가 하나라도 있으면 확정 알림이다.
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
           string_agg(public.day_label(d) || ' ' || p.role_name, ', ' order by d.day_date, d.start_time)
             filter (where a.status = 'selected') as selected_days
    from public.applications a
    join public.event_days d on d.id = a.day_id
    join public.event_positions p on p.id = a.position_id
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


-- 출석 확인 (대표만, 날짜별) ----------------------------------------------------------------

create or replace function public.set_attendance(p_application_id uuid, p_attendance public.attendance_status, p_overtime_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
  v_event public.events%rowtype;
  v_day public.event_days%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_app from public.applications where id = p_application_id for update;
  if not found or v_app.status <> 'selected' then
    raise exception 'NOT_SELECTED';
  end if;
  select * into v_event from public.events where id = v_app.event_id;
  if v_event.status = 'cancelled' then
    raise exception 'EVENT_LOCKED';
  end if;
  if p_overtime_minutes is null or p_overtime_minutes < 0 or p_overtime_minutes > 1440 then
    raise exception 'INVALID_INPUT';
  end if;
  select * into v_day from public.event_days where id = v_app.day_id;

  update public.applications
  set attendance = p_attendance,
      overtime_minutes = case when p_attendance in ('attended', 'late') then p_overtime_minutes else 0 end
  where id = p_application_id;

  delete from public.member_notes
  where application_id = p_application_id and auto_source = 'attendance';

  if p_attendance in ('late', 'no_show') then
    insert into public.member_notes (member_id, type, content, created_by, event_id, application_id, auto_source)
    values (
      v_app.member_id,
      p_attendance::text::public.note_type,
      public.day_label(v_day) || ' · ' || v_event.title || case when p_attendance = 'late' then ' · 지각' else ' · 노쇼' end,
      auth.uid(),
      v_event.id,
      p_application_id,
      'attendance'
    );
  end if;
end;
$$;


-- 공개·마감·완료·취소 (대표만) ---------------------------------------------------------
-- 4번 파일과 같고, 알림 제목(100자)·내용(300자)을 길이 제한에 맞게 자른다.
-- 제목이 긴 일정을 공개하거나 긴 사유(최대 500자)로 취소할 때 알림 저장이 실패해 상태 변경까지 취소되던 문제를 막는다.

create or replace function public.set_event_status(p_event_id uuid, p_status public.event_status, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not (
    (v_event.status = 'draft' and p_status in ('open_core', 'open_all', 'cancelled'))
    or (v_event.status = 'open_core' and p_status in ('open_all', 'closed', 'completed', 'cancelled'))
    or (v_event.status = 'open_all' and p_status in ('closed', 'completed', 'cancelled'))
    or (v_event.status = 'closed' and p_status in ('open_all', 'completed', 'cancelled'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_status = 'cancelled' and (v_reason = '' or char_length(v_reason) > 500) then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.events
  set status = p_status,
      core_opened_at = case when p_status = 'open_core' then now() else core_opened_at end,
      general_opened_at = case when p_status = 'open_all' and general_opened_at is null then now() else general_opened_at end,
      closed_at = case when p_status = 'closed' then now() else closed_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancel_reason = case when p_status = 'cancelled' then v_reason else cancel_reason end
  where id = p_event_id;

  -- 공개 알림: 핵심 공개면 핵심 회원에게, 전체 공개면 아직 알림을 받지 않은 회원에게
  if p_status = 'open_core' then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'event.open', left('핵심 인력 먼저 공개: ' || public.event_label(v_event), 100), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member' and tier = 'core';
  elsif p_status = 'open_all' and v_event.general_opened_at is null then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'event.open', left('새 일정: ' || public.event_label(v_event), 100), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member'
      and (v_event.status = 'draft' or tier = 'general');
  elsif p_status = 'cancelled' then
    -- 날짜가 여러 개여도 한 사람에게 한 번만 알린다
    insert into public.notifications (user_id, type, title, body, link)
    select distinct a.member_id, 'event.cancelled', left('일정 취소: ' || public.event_label(v_event), 100), left(v_reason, 300), '/events/' || p_event_id
    from public.applications a
    where a.event_id = p_event_id and a.status in ('applied', 'waitlisted', 'selected');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.status', 'event', p_event_id,
          jsonb_build_object('from', v_event.status, 'to', p_status, 'reason', v_reason));
end;
$$;


-- 권한 -----------------------------------------------------------------------

revoke all on public.event_days from anon, authenticated;
grant select on public.event_days to authenticated;

revoke all on function public.day_label(public.event_days) from public, anon, authenticated;
revoke all on function public.save_event_days(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_event(jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.update_event(uuid, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.apply_to_event(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.create_event(jsonb, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.update_event(uuid, jsonb, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.apply_to_event(uuid, uuid[]) to authenticated;

alter table public.event_days enable row level security;

-- 톡방 링크: 활동 회원이어야 한다 (확정 알림을 받은 뒤 제한·탈퇴되면 더 이상 못 본다)
drop policy "대표와 확정자만 톡방 링크를 본다" on public.event_chat_links;
create policy "대표와 활동 중인 확정자만 톡방 링크를 본다"
  on public.event_chat_links for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.is_active_member())
      and exists (
        select 1 from public.applications a
        where a.event_id = event_chat_links.event_id
          and a.member_id = (select auth.uid())
          and a.status = 'selected'
          and a.notified_status = 'selected'
      )
    )
  );

create policy "볼 수 있는 일정의 날짜만 본다"
  on public.event_days for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
