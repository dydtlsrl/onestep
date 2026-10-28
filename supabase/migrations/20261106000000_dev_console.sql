-- 11번: 개발자 전용 화면 (/dev) — 오류 기록, 시범 운영 지표를 대표 화면에서 옮김
--
-- 적용 방법: 20261105000000_pilot_metrics.sql(10번)을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우거나 바꾸지 않는다. 테이블 2개(developers, app_errors)와 함수를 더한다.
--   - 적용한 뒤 개발자 계정을 한 번 등록한다 (README "개발자 화면").
--
-- 원칙
--   - 개발자는 회원이 아니다. 로그인 계정(auth.users)만 있으면 되고, 회원 목록·지표에 나오지 않는다.
--   - 개발자는 회원 표를 직접 읽지 못한다. 아래 dev_ 함수가 필요한 칸만 골라 준다 (주민번호·계좌는 없음).
--   - 오류 기록은 로그인 전 화면(초대·로그인)에서도 남아야 해서 누구나 log_app_error를 부를 수 있다.
--     대신 길이를 자르고, 1분·하루 개수를 제한하고, 180일이 지난 기록은 지운다.
--   - 시범 운영 지표 설정(pilot)은 개발자만 보고 바꾼다. 대표 화면에서는 보이지 않는다.


-- 개발자 ---------------------------------------------------------------------------------------

create table public.developers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text not null default '' check (char_length(note) <= 100),
  created_at timestamptz not null default now()
);

alter table public.developers enable row level security;
revoke all on public.developers from anon, authenticated;

-- 지금 로그인한 사람이 개발자인지
create function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.developers where user_id = (select auth.uid()));
$$;


-- 오류 기록 ------------------------------------------------------------------------------------
-- source: server(화면을 만들다 난 오류), action(버튼을 눌러 저장하다 난 오류), client(휴대폰·PC 브라우저), auth(로그인)
-- level: error(버그일 수 있음), warn(앱이 사용자에게 안내한 오류, 예: 신청 마감)

create table public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('server', 'action', 'client', 'auth')),
  level text not null check (level in ('error', 'warn')),
  code text not null default '' check (char_length(code) <= 100),
  message text not null default '' check (char_length(message) <= 1000),
  path text not null default '' check (char_length(path) <= 300),
  digest text not null default '' check (char_length(digest) <= 100),
  user_agent text not null default '' check (char_length(user_agent) <= 500),
  detail jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_note text not null default '' check (char_length(resolved_note) <= 300)
);

create index app_errors_created_at_idx on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;

-- 오류 남기기 (누구나). 기록이 실패해도 화면이 멈추면 안 되므로 틀린 값은 고쳐서 넣고, 넘치면 조용히 건너뛴다.
create function public.log_app_error(
  p_source text,
  p_level text,
  p_code text,
  p_message text,
  p_path text,
  p_digest text default '',
  p_user_agent text default '',
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if (select count(*) from public.app_errors where created_at > now() - interval '1 minute') >= 120
    or (v_uid is not null and (select count(*) from public.app_errors where created_at > now() - interval '1 minute' and user_id = v_uid) >= 30)
    or (select count(*) from public.app_errors where created_at > now() - interval '1 day') >= 5000
  then
    return;
  end if;

  insert into public.app_errors (user_id, source, level, code, message, path, digest, user_agent, detail)
  values (
    v_uid,
    case when p_source in ('server', 'action', 'client', 'auth') then p_source else 'server' end,
    case when p_level = 'warn' then 'warn' else 'error' end,
    left(coalesce(p_code, ''), 100),
    left(coalesce(p_message, ''), 1000),
    left(coalesce(p_path, ''), 300),
    left(coalesce(p_digest, ''), 100),
    left(coalesce(p_user_agent, ''), 500),
    case when jsonb_typeof(p_detail) = 'object' and pg_column_size(p_detail) <= 4000 then p_detail else '{}'::jsonb end
  );

  if random() < 0.02 then
    delete from public.app_errors where created_at < now() - interval '180 days';
  end if;
end;
$$;

-- 오류 목록 (개발자만). 누가 겪었는지 알 수 있게 회원 이름·역할을 붙인다.
create function public.dev_errors(p_days integer default 7)
returns table (
  id bigint,
  created_at timestamptz,
  source text,
  level text,
  code text,
  message text,
  path text,
  digest text,
  user_agent text,
  detail jsonb,
  resolved_at timestamptz,
  resolved_note text,
  user_id uuid,
  user_name text,
  user_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_developer() then
    raise exception 'NOT_DEVELOPER';
  end if;
  return query
  select e.id, e.created_at, e.source, e.level, e.code, e.message, e.path, e.digest, e.user_agent, e.detail,
         e.resolved_at, e.resolved_note, e.user_id, p.name,
         case when d.user_id is not null then 'developer' else p.role::text end
  from public.app_errors e
  left join public.profiles p on p.id = e.user_id
  left join public.developers d on d.user_id = e.user_id
  where e.created_at > now() - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 180))
  order by e.created_at desc
  limit 1000;
end;
$$;

-- 처리함 표시·되돌리기 (개발자만). 같은 오류 여러 건을 한 번에.
create function public.dev_resolve_errors(p_ids bigint[], p_resolved boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_developer() then
    raise exception 'NOT_DEVELOPER';
  end if;
  if cardinality(p_ids) > 1000 or char_length(coalesce(p_note, '')) > 300 then
    raise exception 'INVALID_INPUT';
  end if;
  update public.app_errors
  set resolved_at = case when p_resolved then now() end,
      resolved_note = case when p_resolved then btrim(coalesce(p_note, '')) else '' end
  where id = any (p_ids);
end;
$$;


-- 시범 운영 지표 재료 (개발자만) ---------------------------------------------------------------------
-- 지표는 앱 서버가 계산한다. 여기서는 필요한 칸만 넘긴다 (전화번호·주민번호·계좌·서명은 없음).

create function public.dev_pilot_source()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_developer() then
    raise exception 'NOT_DEVELOPER';
  end if;
  return jsonb_build_object(
    'settings', (select s.value from public.app_settings s where s.key = 'pilot'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'start_date', e.start_date, 'end_date', e.end_date,
                                          'status', e.status, 'created_at', e.created_at) order by e.start_date desc)
      from public.events e where e.status <> 'draft'), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'memo', i.memo, 'used_count', i.used_count, 'created_at', i.created_at)
                       order by i.created_at desc)
      from public.invites i), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'created_at', p.created_at,
                                          'approved_at', p.approved_at, 'invite_id', p.invite_id,
                                          'private_updated_at', m.updated_at) order by p.created_at)
      from public.profiles p left join public.member_private m on m.member_id = p.id
      where p.role = 'member'), '[]'::jsonb),
    'applications', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', a.event_id, 'member_id', a.member_id, 'status', a.status,
                                          'added_by_admin', a.added_by_admin, 'decided_at', a.decided_at))
      from public.applications a), '[]'::jsonb),
    'contracts', coalesce((
      select jsonb_agg(jsonb_build_object('event_id', c.event_id, 'member_id', c.member_id, 'status', c.status,
                                          'requested_at', c.requested_at, 'signed_at', c.signed_at))
      from public.contracts c), '[]'::jsonb),
    'edited_payments', coalesce((
      select jsonb_agg(p.event_id) from public.payments p where p.edited and p.status <> 'cancelled'), '[]'::jsonb)
  );
end;
$$;


-- 설정: 시범 운영 지표(pilot)는 개발자만 --------------------------------------------------------

drop policy "대표는 모든 설정을, 회원은 보수 규칙만 본다" on public.app_settings;
create policy "대표·개발자·회원별로 볼 수 있는 설정만 본다"
  on public.app_settings for select to authenticated
  using (
    ((select public.is_admin()) and key <> 'pilot')
    or (key = 'pilot' and (select public.is_developer()))
    or (key = 'pay_rules' and (select public.is_active_member()))
  );

drop policy "대표만 설정 이력을 본다" on public.app_settings_history;
create policy "대표는 시범 지표를 뺀 설정 이력을 본다"
  on public.app_settings_history for select to authenticated
  using ((select public.is_admin()) and key <> 'pilot');

-- 설정 저장. 10번의 함수에서 pilot은 대표 대신 개발자만 저장하게 바꾼다. 나머지 키의 검사는 그대로다.
create or replace function public.update_setting(p_key text, p_value jsonb, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  -- 개발자는 회원 정보(profiles)가 없을 수 있다. 그때는 바꾼 사람 칸을 비운다 (기록에는 남는다).
  v_actor uuid := (select id from public.profiles where id = (select auth.uid()));
begin
  -- 시범 운영 지표는 개발자만, 나머지 설정은 대표만 바꾼다
  if p_key = 'pilot' then
    if not public.is_developer() then
      raise exception 'NOT_DEVELOPER';
    end if;
  elsif not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if char_length(v_reason) > 200 or jsonb_typeof(p_value) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;

  if p_key = 'company' then
    if exists (
      select 1 from jsonb_each(p_value) e
      where e.key not in ('name', 'ceo', 'biz_no', 'address', 'phone')
         or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200
    ) or coalesce(btrim(p_value ->> 'name'), '') = '' then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'contract' then
    if p_value ->> 'rrn_display' not in ('masked', 'full') then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'tax' then
    if p_value ->> 'type' not in ('unset', 'other', 'business', 'none')
      or jsonb_typeof(p_value -> 'threshold') <> 'boolean'
      or jsonb_typeof(p_value -> 'include_extras') <> 'boolean' then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'pilot' then
    -- 시범 운영 지표: 대상 일정·초대 링크(ID 목록)와 대표가 직접 적는 숫자, 메모
    if exists (
      select 1 from jsonb_each(p_value) e
      where case
        when e.key in ('event_ids', 'invite_ids') then
          case when jsonb_typeof(e.value) <> 'array' then true
               when jsonb_array_length(e.value) > 100 then true
               else exists (
                 select 1 from jsonb_array_elements(e.value) x
                 where jsonb_typeof(x) <> 'string'
                    or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               )
          end
        when e.key in ('invited_count', 'baseline_minutes', 'target_reduction_pct',
                       'ceo_responses', 'ceo_yes', 'member_responses', 'member_yes',
                       'incident_privacy', 'incident_pay', 'incident_outage') then
          case when jsonb_typeof(e.value) = 'null' then false
               when jsonb_typeof(e.value) <> 'number' then true
               else (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
                 or (e.value #>> '{}')::numeric < 0
                 or (e.value #>> '{}')::numeric > case when e.key = 'target_reduction_pct' then 100 else 100000 end
          end
        when e.key = 'note' then
          jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 1000
        else true
      end
    ) then
      raise exception 'INVALID_INPUT';
    end if;
  else
    raise exception 'SETTING_NOT_FOUND';
  end if;

  update public.app_settings
  set value = p_value, version = version + 1, effective_from = now(), updated_by = v_actor, updated_at = now()
  where key = p_key
  returning version into v_version;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  insert into public.app_settings_history (key, value, version, effective_from, changed_by, change_reason)
  values (p_key, p_value, v_version, now(), v_actor, v_reason);

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'settings.' || p_key, 'setting', null, p_value || jsonb_build_object('version', v_version));
end;
$$;


-- 권한 -----------------------------------------------------------------------------------------

revoke all on function public.is_developer() from public, anon, authenticated;
revoke all on function public.log_app_error(text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dev_errors(integer) from public, anon, authenticated;
revoke all on function public.dev_resolve_errors(bigint[], boolean, text) from public, anon, authenticated;
revoke all on function public.dev_pilot_source() from public, anon, authenticated;
revoke all on function public.update_setting(text, jsonb, text) from public, anon, authenticated;

grant execute on function public.is_developer() to authenticated;
grant execute on function public.log_app_error(text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.dev_errors(integer) to authenticated;
grant execute on function public.dev_resolve_errors(bigint[], boolean, text) to authenticated;
grant execute on function public.dev_pilot_source() to authenticated;
grant execute on function public.update_setting(text, jsonb, text) to authenticated;
