-- 2단계: 일정 등록·공개, 신청·선발, 출석 확인, 앱 안 알림
--
-- 적용 방법: 앞의 세 파일을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--
-- 원칙
--   - 일정·신청을 바꾸는 일은 모두 아래 함수로만 한다. 함수가 권한과 상태를 확인하고 기록을 남긴다.
--   - 회원은 자기가 볼 수 있는 일정만 본다: 핵심 공개는 핵심 회원만, 전체 공개·마감은 활동 회원 모두,
--     완료·취소된 일정은 신청했던 사람만.
--   - 모집 역할에는 등록할 때의 단가를 복사해 둔다. 단가표를 나중에 바꿔도 이 일정의 금액은 그대로다.


-- 상태값 ---------------------------------------------------------------------

create type public.event_type as enum ('written_exam', 'interview', 'event', 'other');
create type public.event_status as enum ('draft', 'open_core', 'open_all', 'closed', 'completed', 'cancelled');
create type public.application_status as enum ('applied', 'waitlisted', 'selected', 'rejected', 'cancelled');
create type public.attendance_status as enum ('unknown', 'attended', 'late', 'no_show');
create type public.extra_pay_type as enum ('transport', 'regional');


-- 테이블 ---------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  type public.event_type not null default 'written_exam',
  title text not null check (char_length(btrim(title)) between 1 and 80),
  event_date date not null,
  gather_time time,
  start_time time not null,
  end_time time not null,
  location_name text not null default '' check (char_length(location_name) <= 80),
  address text not null default '' check (char_length(address) <= 200),
  notice text not null default '' check (char_length(notice) <= 2000),
  status public.event_status not null default 'draft',
  apply_deadline timestamptz,
  pay_date date,
  core_opened_at timestamptz,
  general_opened_at timestamptz,
  closed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time),
  check (gather_time is null or gather_time <= start_time)
);

create index events_date_idx on public.events (event_date);
create index events_status_idx on public.events (status);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- 고객사 등 회원에게 보이면 안 되는 일정 정보 (대표만)
create table public.event_internal (
  event_id uuid primary key references public.events (id) on delete cascade,
  client_name text not null default '' check (char_length(client_name) <= 60),
  memo text not null default '' check (char_length(memo) <= 1000)
);

-- 확정자 톡방 링크. 대표와, 확정 알림을 받은 회원만 본다.
create table public.event_chat_links (
  event_id uuid primary key references public.events (id) on delete cascade,
  chat_link text not null default '' check (chat_link = '' or (chat_link ~ '^https://' and char_length(chat_link) <= 300))
);

-- 모집 역할. 등록할 때의 단가표 값을 복사해 둔다.
create table public.event_positions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  role_id uuid references public.job_roles (id) on delete set null,
  role_name text not null check (char_length(btrim(role_name)) between 1 and 30),
  pay_type public.pay_type not null,
  rate integer not null check (rate between 0 and 10000000),
  min_paid_hours numeric(3, 1) check (min_paid_hours is null or min_paid_hours between 0 and 24),
  overtime_rate integer check (overtime_rate is null or overtime_rate between 0 and 10000000),
  headcount integer not null check (headcount between 1 and 500),
  sort_order integer not null default 0,
  unique (id, event_id)
);

create index event_positions_event_id_idx on public.event_positions (event_id);

-- 일정별 추가 지급 기본값: 교통비(전원), 지방비(등급별)
create table public.event_extra_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  type public.extra_pay_type not null,
  tier text not null default 'all' check (tier in ('all', 'core', 'general')),
  amount integer not null check (amount between 1 and 1000000),
  unique (event_id, type, tier)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  position_id uuid not null,
  member_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'applied',
  added_by_admin boolean not null default false,
  attendance public.attendance_status not null default 'unknown',
  overtime_minutes integer not null default 0 check (overtime_minutes between 0 and 1440),
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  -- 마지막으로 알림을 보낸 선발 결과. 지금 상태와 다르면 알림을 다시 보낸다.
  notified_status public.application_status,
  notified_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text not null default '' check (char_length(cancel_reason) <= 300),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id),
  -- 역할이 같은 일정의 것인지 DB가 확인한다
  foreign key (position_id, event_id) references public.event_positions (id, event_id)
);

create index applications_member_id_idx on public.applications (member_id);
create index applications_event_status_idx on public.applications (event_id, status);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- 앱 안 알림
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null check (char_length(title) <= 100),
  body text not null default '' check (char_length(body) <= 300),
  link text not null default '' check (char_length(link) <= 300),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- 관리자 기록에 관련 일정과 자동 기록 출처를 붙인다 (출석 확인에서 자동으로 남긴 노쇼·지각)
alter table public.member_notes
  add column event_id uuid references public.events (id) on delete set null,
  add column auto_source text check (auto_source is null or auto_source in ('attendance'));

-- 회원별 실제 참여 횟수 (확정되고 참석·지각으로 확인된 일정). 보는 사람의 권한 규칙을 그대로 따른다.
create view public.member_participation
with (security_invoker = true)
as
select member_id, count(*) as attended_count
from public.applications
where status = 'selected' and attendance in ('attended', 'late')
group by member_id;


-- 도우미 함수 ------------------------------------------------------------------

-- 지금 사람이 이 일정을 볼 수 있는지 (권한 규칙과 함수에서 같이 쓴다)
create function public.can_view_event(p_event_id uuid, p_status public.event_status)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then true
    when not public.is_active_member() then false
    when p_status = 'open_core' then
      exists (select 1 from public.profiles where id = (select auth.uid()) and tier = 'core')
      or exists (select 1 from public.applications where event_id = p_event_id and member_id = (select auth.uid()))
    when p_status in ('open_all', 'closed') then true
    when p_status in ('completed', 'cancelled') then
      exists (select 1 from public.applications where event_id = p_event_id and member_id = (select auth.uid()))
    else false
  end;
$$;

-- 일정 날짜를 알림 문구용으로 (예: 11/8)
create function public.event_label(p_event public.events)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_event.event_date, 'FMMM/FMDD') || ' ' || p_event.title;
$$;

-- 역할별 확정 인원 (남은 자리 표시용). 볼 수 있는 일정의 것만 돌려준다.
create function public.position_selected_counts(p_event_ids uuid[])
returns table (event_id uuid, position_id uuid, selected_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.event_id, p.id, count(a.id) filter (where a.status = 'selected')::integer
  from public.event_positions p
  join public.events e on e.id = p.event_id
  left join public.applications a on a.position_id = p.id
  where p.event_id = any (p_event_ids)
    and public.can_view_event(e.id, e.status)
  group by p.event_id, p.id;
$$;


-- 일정 만들기·고치기 (대표만) -------------------------------------------------------
-- p_event: {"type","title","event_date","gather_time","start_time","end_time","location_name","address",
--           "notice","chat_link","apply_deadline","pay_date"}
-- p_positions: [{"id"(고칠 때만),"role_id","role_name","pay_type","rate","min_paid_hours","overtime_rate","headcount"}]
-- p_extras: [{"type":"transport|regional","tier":"all|core|general","amount"}]

create function public.create_event(
  p_event jsonb,
  p_positions jsonb,
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
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'POSITIONS_REQUIRED';
  end if;

  begin
    insert into public.events (
      type, title, event_date, gather_time, start_time, end_time, location_name, address,
      notice, apply_deadline, pay_date, created_by
    )
    values (
      (p_event ->> 'type')::public.event_type,
      btrim(p_event ->> 'title'),
      (p_event ->> 'event_date')::date,
      nullif(p_event ->> 'gather_time', '')::time,
      (p_event ->> 'start_time')::time,
      (p_event ->> 'end_time')::time,
      btrim(coalesce(p_event ->> 'location_name', '')),
      btrim(coalesce(p_event ->> 'address', '')),
      btrim(coalesce(p_event ->> 'notice', '')),
      nullif(p_event ->> 'apply_deadline', '')::timestamptz,
      nullif(p_event ->> 'pay_date', '')::date,
      auth.uid()
    )
    returning id into v_id;

    insert into public.event_internal (event_id, client_name, memo)
    values (v_id, btrim(coalesce(p_client_name, '')), btrim(coalesce(p_internal_memo, '')));

    insert into public.event_chat_links (event_id, chat_link)
    values (v_id, btrim(coalesce(p_event ->> 'chat_link', '')));

    insert into public.event_positions (
      event_id, role_id, role_name, pay_type, rate, min_paid_hours, overtime_rate, headcount, sort_order
    )
    select v_id, x.role_id, btrim(x.role_name), x.pay_type, x.rate,
           case when x.pay_type = 'hourly' then x.min_paid_hours end,
           case when x.pay_type = 'daily' then x.overtime_rate end,
           x.headcount, t.ord::integer
    from jsonb_array_elements(p_positions) with ordinality as t(item, ord)
    cross join lateral jsonb_to_record(t.item) as x(
      role_id uuid, role_name text, pay_type public.pay_type, rate integer,
      min_paid_hours numeric, overtime_rate integer, headcount integer
    );

    insert into public.event_extra_rules (event_id, type, tier, amount)
    select v_id, x.type, coalesce(x.tier, 'all'), x.amount
    from jsonb_to_recordset(coalesce(p_extras, '[]'::jsonb)) as x(type public.extra_pay_type, tier text, amount integer)
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
  p_positions jsonb,
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
  v_keep uuid[];
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
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'POSITIONS_REQUIRED';
  end if;

  -- 지우려는 역할에 신청자가 있으면 막는다
  select array_agg((item ->> 'id')::uuid) into v_keep
  from jsonb_array_elements(p_positions) as item
  where nullif(item ->> 'id', '') is not null;

  if exists (
    select 1 from public.applications a
    where a.event_id = p_event_id
      and a.position_id <> all (coalesce(v_keep, '{}'))
  ) then
    raise exception 'POSITION_IN_USE';
  end if;

  begin
    update public.events
    set type = (p_event ->> 'type')::public.event_type,
        title = btrim(p_event ->> 'title'),
        event_date = (p_event ->> 'event_date')::date,
        gather_time = nullif(p_event ->> 'gather_time', '')::time,
        start_time = (p_event ->> 'start_time')::time,
        end_time = (p_event ->> 'end_time')::time,
        location_name = btrim(coalesce(p_event ->> 'location_name', '')),
        address = btrim(coalesce(p_event ->> 'address', '')),
        notice = btrim(coalesce(p_event ->> 'notice', '')),
        apply_deadline = nullif(p_event ->> 'apply_deadline', '')::timestamptz,
        pay_date = nullif(p_event ->> 'pay_date', '')::date
    where id = p_event_id;

    insert into public.event_internal (event_id, client_name, memo)
    values (p_event_id, btrim(coalesce(p_client_name, '')), btrim(coalesce(p_internal_memo, '')))
    on conflict (event_id) do update set client_name = excluded.client_name, memo = excluded.memo;

    insert into public.event_chat_links (event_id, chat_link)
    values (p_event_id, btrim(coalesce(p_event ->> 'chat_link', '')))
    on conflict (event_id) do update set chat_link = excluded.chat_link;

    delete from public.event_positions
    where event_id = p_event_id and id <> all (coalesce(v_keep, '{}'));

    -- 있는 역할은 고치고, 새 역할은 추가한다
    with incoming as (
      select nullif(t.item ->> 'id', '')::uuid as id, t.ord::integer as ord, x.*
      from jsonb_array_elements(p_positions) with ordinality as t(item, ord)
      cross join lateral jsonb_to_record(t.item) as x(
        role_id uuid, role_name text, pay_type public.pay_type, rate integer,
        min_paid_hours numeric, overtime_rate integer, headcount integer
      )
    ),
    updated as (
      update public.event_positions p
      set role_id = i.role_id,
          role_name = btrim(i.role_name),
          pay_type = i.pay_type,
          rate = i.rate,
          min_paid_hours = case when i.pay_type = 'hourly' then i.min_paid_hours end,
          overtime_rate = case when i.pay_type = 'daily' then i.overtime_rate end,
          headcount = i.headcount,
          sort_order = i.ord
      from incoming i
      where p.id = i.id and p.event_id = p_event_id
      returning p.id
    )
    insert into public.event_positions (
      event_id, role_id, role_name, pay_type, rate, min_paid_hours, overtime_rate, headcount, sort_order
    )
    select p_event_id, i.role_id, btrim(i.role_name), i.pay_type, i.rate,
           case when i.pay_type = 'hourly' then i.min_paid_hours end,
           case when i.pay_type = 'daily' then i.overtime_rate end,
           i.headcount, i.ord
    from incoming i
    where i.id is null;

    delete from public.event_extra_rules where event_id = p_event_id;
    insert into public.event_extra_rules (event_id, type, tier, amount)
    select p_event_id, x.type, coalesce(x.tier, 'all'), x.amount
    from jsonb_to_recordset(coalesce(p_extras, '[]'::jsonb)) as x(type public.extra_pay_type, tier text, amount integer)
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


-- 공개·마감·완료·취소 (대표만) ---------------------------------------------------------

create function public.set_event_status(p_event_id uuid, p_status public.event_status, p_reason text default '')
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
    select id, 'event.open', '핵심 인력 먼저 공개: ' || public.event_label(v_event), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member' and tier = 'core';
  elsif p_status = 'open_all' and v_event.general_opened_at is null then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'event.open', '새 일정: ' || public.event_label(v_event), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member'
      and (v_event.status = 'draft' or tier = 'general');
  elsif p_status = 'cancelled' then
    insert into public.notifications (user_id, type, title, body, link)
    select a.member_id, 'event.cancelled', '일정 취소: ' || public.event_label(v_event), v_reason, '/events/' || p_event_id
    from public.applications a
    where a.event_id = p_event_id and a.status in ('applied', 'waitlisted', 'selected');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.status', 'event', p_event_id,
          jsonb_build_object('from', v_event.status, 'to', p_status, 'reason', v_reason));
end;
$$;


-- 신청·취소 (회원) ----------------------------------------------------------------------

create function public.apply_to_event(p_event_id uuid, p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event public.events%rowtype;
  v_existing public.applications%rowtype;
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
  if not exists (select 1 from public.event_positions where id = p_position_id and event_id = p_event_id) then
    raise exception 'INVALID_INPUT';
  end if;

  select * into v_existing from public.applications where event_id = p_event_id and member_id = v_uid;
  if found then
    if v_existing.status <> 'cancelled' then
      raise exception 'ALREADY_APPLIED_EVENT';
    end if;
    -- 취소했던 신청을 다시 낸다
    update public.applications
    set status = 'applied', position_id = p_position_id, applied_at = now(),
        cancelled_at = null, cancel_reason = '', decided_at = null, decided_by = null
    where id = v_existing.id;
  else
    insert into public.applications (event_id, position_id, member_id)
    values (p_event_id, p_position_id, v_uid);
  end if;
end;
$$;

create function public.cancel_application(p_event_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
  v_status public.event_status;
begin
  select * into v_app from public.applications where event_id = p_event_id and member_id = auth.uid() for update;
  if not found or v_app.status in ('cancelled', 'rejected') then
    raise exception 'APPLICATION_NOT_FOUND';
  end if;

  select status into v_status from public.events where id = p_event_id;
  if v_status in ('completed', 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;

  -- 확정된 뒤에는 회원이 직접 취소하지 않고 대표에게 요청한다 (PRD SET-06 기본값)
  if v_app.status = 'selected' then
    raise exception 'ASK_ADMIN';
  end if;

  update public.applications
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(btrim(coalesce(p_reason, '')), 300)
  where id = v_app.id;
end;
$$;


-- 선발 (대표만) ------------------------------------------------------------------------

-- 여러 신청의 상태를 한 번에 바꾼다. 확정에서 다른 상태로 바꾸면 출석 기록도 지운다.
create function public.decide_applications(p_application_ids uuid[], p_status public.application_status)
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
    returning a.member_id, a.event_id
  ),
  removed as (
    delete from public.member_notes n
    using changed c
    where p_status <> 'selected'
      and n.member_id = c.member_id and n.event_id = c.event_id and n.auto_source = 'attendance'
    returning n.id
  )
  select count(*) into v_count from changed;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.decide', 'application', null,
          jsonb_build_object('status', p_status, 'count', v_count, 'ids', to_jsonb(p_application_ids)));

  return v_count;
end;
$$;

-- 신청하지 않은 회원을 확정자로 추가 (전화로 섭외한 경우 등)
create function public.add_member_to_event(p_event_id uuid, p_position_id uuid, p_member_id uuid)
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
  if not exists (select 1 from public.event_positions where id = p_position_id and event_id = p_event_id) then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.applications (event_id, position_id, member_id, status, added_by_admin, decided_at, decided_by)
  values (p_event_id, p_position_id, p_member_id, 'selected', true, now(), auth.uid())
  on conflict (event_id, member_id) do update
  set status = 'selected', position_id = excluded.position_id, added_by_admin = true,
      decided_at = now(), decided_by = auth.uid(), cancelled_at = null, cancel_reason = '';

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.add', 'event', p_event_id, jsonb_build_object('member_id', p_member_id));
end;
$$;

-- 선발 결과 알림. 확정·미선발 중 아직 알리지 않은(또는 결과가 바뀐) 사람에게만 보낸다. 대기자는 보내지 않는다.
create function public.notify_selection_results(p_event_id uuid)
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
    returning member_id, status
  )
  insert into public.notifications (user_id, type, title, body, link)
  select member_id,
         'application.' || status,
         case when status = 'selected' then '확정되었어요: ' || public.event_label(v_event)
              else '선발 결과: ' || public.event_label(v_event) end,
         case when status = 'selected' then '집합 안내와 확정자 톡방 링크를 확인해 주세요.'
              else '이번 일정은 함께하지 못하게 되었어요. 다음 일정에서 만나요.' end,
         '/events/' || p_event_id
  from targets;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.notify', 'event', p_event_id, jsonb_build_object('count', v_count));

  return v_count;
end;
$$;


-- 출석 확인 (대표만) -------------------------------------------------------------------
-- 노쇼·지각으로 표시하면 관리자 기록에 자동으로 남긴다. 다시 바꾸면 자동 기록도 바뀐다.

create function public.set_attendance(p_application_id uuid, p_attendance public.attendance_status, p_overtime_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app public.applications%rowtype;
  v_event public.events%rowtype;
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

  update public.applications
  set attendance = p_attendance,
      overtime_minutes = case when p_attendance in ('attended', 'late') then p_overtime_minutes else 0 end
  where id = p_application_id;

  delete from public.member_notes
  where member_id = v_app.member_id and event_id = v_app.event_id and auto_source = 'attendance';

  if p_attendance in ('late', 'no_show') then
    insert into public.member_notes (member_id, type, content, created_by, event_id, auto_source)
    values (
      v_app.member_id,
      p_attendance::text::public.note_type,
      public.event_label(v_event) || case when p_attendance = 'late' then ' · 지각' else ' · 노쇼' end,
      auth.uid(),
      v_event.id,
      'attendance'
    );
  end if;
end;
$$;


-- 가입 승인 알림 추가 (1B의 approve_member에 알림만 더한다) -------------------------------

create or replace function public.approve_member(p_member_id uuid, p_tier public.member_tier)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer text;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  update public.profiles
  set status = 'active',
      tier = p_tier,
      status_reason = '',
      approved_at = now(),
      approved_by = auth.uid()
  where id = p_member_id
    and status = 'pending'
  returning referrer_name into v_referrer;

  if not found then
    raise exception 'NOT_PENDING';
  end if;

  insert into public.member_notes (member_id, type, content, created_by)
  values (
    p_member_id,
    'memo',
    '가입 승인 (' || case p_tier when 'core' then '핵심' else '일반' end || ')'
      || case when v_referrer <> '' then ' · 추천인 ' || v_referrer else '' end,
    auth.uid()
  );

  insert into public.notifications (user_id, type, title, body, link)
  values (p_member_id, 'member.approved', '가입이 승인되었어요', '이제 원스텝 일정을 보고 신청할 수 있어요.', '/');

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.approve', 'profile', p_member_id, jsonb_build_object('tier', p_tier));
end;
$$;


-- 권한 -----------------------------------------------------------------------

revoke all on public.events, public.event_internal, public.event_chat_links, public.event_positions,
  public.event_extra_rules, public.applications, public.notifications from anon, authenticated;

grant select on public.events, public.event_internal, public.event_chat_links, public.event_positions,
  public.event_extra_rules, public.applications, public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.member_participation from anon, authenticated;
grant select on public.member_participation to authenticated;

revoke all on function public.can_view_event(uuid, public.event_status) from public, anon, authenticated;
revoke all on function public.event_label(public.events) from public, anon, authenticated;
revoke all on function public.position_selected_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.create_event(jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.update_event(uuid, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.set_event_status(uuid, public.event_status, text) from public, anon, authenticated;
revoke all on function public.apply_to_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cancel_application(uuid, text) from public, anon, authenticated;
revoke all on function public.decide_applications(uuid[], public.application_status) from public, anon, authenticated;
revoke all on function public.add_member_to_event(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_selection_results(uuid) from public, anon, authenticated;
revoke all on function public.set_attendance(uuid, public.attendance_status, integer) from public, anon, authenticated;

grant execute on function public.can_view_event(uuid, public.event_status) to authenticated;
grant execute on function public.position_selected_counts(uuid[]) to authenticated;
grant execute on function public.create_event(jsonb, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.update_event(uuid, jsonb, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.set_event_status(uuid, public.event_status, text) to authenticated;
grant execute on function public.apply_to_event(uuid, uuid) to authenticated;
grant execute on function public.cancel_application(uuid, text) to authenticated;
grant execute on function public.decide_applications(uuid[], public.application_status) to authenticated;
grant execute on function public.add_member_to_event(uuid, uuid, uuid) to authenticated;
grant execute on function public.notify_selection_results(uuid) to authenticated;
grant execute on function public.set_attendance(uuid, public.attendance_status, integer) to authenticated;


-- 행 단위 보안 (RLS) ---------------------------------------------------------

alter table public.events enable row level security;
alter table public.event_internal enable row level security;
alter table public.event_chat_links enable row level security;
alter table public.event_positions enable row level security;
alter table public.event_extra_rules enable row level security;
alter table public.applications enable row level security;
alter table public.notifications enable row level security;

create policy "볼 수 있는 일정만 본다"
  on public.events for select to authenticated
  using (public.can_view_event(id, status));

create policy "대표만 고객사 등 내부 정보를 본다"
  on public.event_internal for select to authenticated
  using ((select public.is_admin()));

create policy "대표와 확정자만 톡방 링크를 본다"
  on public.event_chat_links for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.applications a
      where a.event_id = event_chat_links.event_id
        and a.member_id = (select auth.uid())
        and a.status = 'selected'
        and a.notified_status = 'selected'
    )
  );

create policy "볼 수 있는 일정의 모집 역할만 본다"
  on public.event_positions for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

create policy "볼 수 있는 일정의 추가 지급만 본다"
  on public.event_extra_rules for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

create policy "회원은 자기 신청을, 대표는 모든 신청을 본다"
  on public.applications for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

create policy "자기 알림만 본다"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "자기 알림만 읽음 처리한다"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 회원도 일정 상세에서 예상 보수를 볼 수 있게 보수 계산 규칙은 활동 회원에게 공개한다
drop policy "대표만 설정을 본다" on public.app_settings;
create policy "대표는 모든 설정을, 회원은 보수 규칙만 본다"
  on public.app_settings for select to authenticated
  using ((select public.is_admin()) or (key = 'pay_rules' and (select public.is_active_member())));
