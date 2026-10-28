-- 14번: 리뷰 반영 (11~13번 파일을 이미 실행한 DB를 위해 따로 고친다)
--
-- 적용 방법: 20261108000000_roster.sql(13번)을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우지 않는다. 이름 없는 명단은 "기본 명단"으로 바꾼다.
--
-- 1. 탈퇴: 정산을 만들지 않은 지난 일정 때문에 영영 탈퇴하지 못하는 일이 없게, 대표가 "받을 보수 없음"을 확인하면 처리할 수 있다
-- 2. 명단 이름을 꼭 정한다. 빈 이름은 초대 링크에서 "모든 명단"이라는 뜻이라 섞이면 다른 명단 번호도 가입되기 때문이다
-- 3. 탈퇴한 사람이 다시 가입하면 예전 회원 기본 시급·가입 시각·정산 정보 보관 기한을 지운다
-- 4. 오류 기록: 로그인 전 기록이 한도를 다 써도 로그인한 사람의 오류는 계속 남게 한도를 나눈다


-- 1. 탈퇴 (대표가 받을 보수 없음을 확인하면 넘길 수 있게) ------------------------------------------------

drop function public.withdraw_member(uuid, text);

create function public.withdraw_member(p_member_id uuid, p_reason text default '', p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_blocker text;
  v_last_paid date;
  v_by_admin boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_by_admin := p_member_id <> v_uid;
  if v_by_admin and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_profile from public.profiles where id = p_member_id for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'CANNOT_TARGET_ADMIN';
  end if;
  if v_profile.status = 'withdrawn' then
    raise exception 'ALREADY_WITHDRAWN';
  end if;

  -- 받을 보수가 남은 것으로 보이지만 실제로는 없을 때(정산을 만들지 않은 연습 일정 등), 대표가 확인하고 넘길 수 있다
  v_blocker := public.withdraw_blocker(p_member_id);
  if v_blocker is not null and not (v_blocker = 'HAS_PENDING_PAYMENT' and p_force and v_by_admin) then
    raise exception '%', v_blocker;
  end if;

  update public.applications
  set status = 'cancelled', cancelled_at = now(), cancel_reason = '회원 탈퇴'
  where member_id = p_member_id and status in ('applied', 'waitlisted');

  update public.contracts
  set status = 'voided', voided_at = now(), void_reason = '회원 탈퇴'
  where member_id = p_member_id and status = 'requested';

  delete from public.member_notes where member_id = p_member_id;
  delete from public.notifications where user_id = p_member_id;

  -- 보수를 받은 적이 있으면 마지막 지급일이 속한 해의 다음 해부터 5년(그해 12월 31일까지) 보관
  select max(pay_date) into v_last_paid from public.payments where member_id = p_member_id and status = 'paid';
  if v_last_paid is null then
    delete from public.member_private where member_id = p_member_id;
  else
    update public.member_private
    set retain_until = make_date(extract(year from v_last_paid)::integer + 5, 12, 31)
    where member_id = p_member_id;
  end if;

  update public.profiles
  set status = 'withdrawn',
      withdrawn_at = now(),
      withdraw_reason = v_reason,
      region = '',
      career_years = 0,
      career_note = '',
      referrer_name = '',
      status_reason = ''
  where id = p_member_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'member.withdraw', 'profile', p_member_id,
          jsonb_build_object('by_admin', v_by_admin, 'forced', v_blocker is not null, 'kept_private_until', (select retain_until from public.member_private where member_id = p_member_id)));

  -- 본인이 탈퇴하면 대표에게 알린다
  if not v_by_admin then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'member.withdrawn', left(v_profile.name || '님이 탈퇴했어요', 100), left(v_reason, 300), '/admin/members/' || p_member_id
    from public.profiles where role = 'admin' and status = 'active';
  end if;

  perform public.purge_expired_private();
end;
$$;

revoke all on function public.withdraw_member(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.withdraw_member(uuid, text, boolean) to authenticated;


-- 2. 명단 이름 필수 ---------------------------------------------------------------------------------

update public.roster set list_name = '기본 명단' where btrim(list_name) = '';
alter table public.roster drop constraint roster_list_name_check;
alter table public.roster add constraint roster_list_name_check check (char_length(btrim(list_name)) between 1 and 40);
alter table public.roster alter column list_name drop default;


-- 3. 다시 가입 ---------------------------------------------------------------------------------------

create or replace function public.submit_application(
  p_code text,
  p_name text,
  p_phone text,
  p_region text,
  p_career_years integer,
  p_career_note text,
  p_referrer_name text,
  p_privacy_agreed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_status public.member_status;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not coalesce(p_privacy_agreed, false) then
    raise exception 'PRIVACY_REQUIRED';
  end if;

  select status into v_status from public.profiles where id = v_uid;
  if found and v_status <> 'withdrawn' then
    raise exception 'ALREADY_APPLIED';
  end if;

  -- 같은 링크로 동시에 가입해도 최대 사용 횟수를 넘지 않도록 잠근다
  select * into v_invite
  from public.invites
  where code = p_code
  for update;

  if not found
    or not v_invite.is_active
    or (v_invite.expires_at is not null and v_invite.expires_at <= now())
    or (v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses)
  then
    raise exception 'INVITE_INVALID';
  end if;

  if v_name = ''
    or char_length(v_name) > 40
    or v_phone !~ '^01[016789][0-9]{7,8}$'
    or p_career_years is null
    or p_career_years not between 0 and 60
  then
    raise exception 'INVALID_INPUT';
  end if;

  if exists (select 1 from public.profiles where phone = v_phone and status <> 'withdrawn' and id <> v_uid) then
    raise exception 'PHONE_TAKEN';
  end if;

  -- 명단 전용 링크: 개인 링크는 그 사람 번호만, 단체 링크는 그 명단(비어 있으면 모든 명단)에 있는 번호만
  if v_invite.roster_id is not null then
    if not exists (select 1 from public.roster where id = v_invite.roster_id and phone = v_phone) then
      raise exception 'NOT_ON_ROSTER';
    end if;
  elsif v_invite.roster_only then
    if not exists (
      select 1 from public.roster
      where phone = v_phone and (v_invite.roster_list = '' or list_name = v_invite.roster_list)
    ) then
      raise exception 'NOT_ON_ROSTER';
    end if;
  end if;

  begin
    if v_status = 'withdrawn' then
      update public.profiles
      set name = v_name, phone = v_phone,
          region = btrim(coalesce(p_region, '')),
          career_years = p_career_years,
          career_note = btrim(coalesce(p_career_note, '')),
          referrer_name = btrim(coalesce(p_referrer_name, '')),
          invite_id = v_invite.id, privacy_agreed_at = now(),
          status = 'pending', tier = 'general', status_reason = '',
          approved_at = null, approved_by = null, withdrawn_at = null, withdraw_reason = '',
          default_rate = null, created_at = now()
      where id = v_uid;
      -- 다시 회원이 되므로 탈퇴 때 정한 보관 기한은 없앤다 (정산 정보는 본인이 내 정보에서 고칠 수 있다)
      update public.member_private set retain_until = null where member_id = v_uid;
    else
      insert into public.profiles (
        id, name, phone, region, career_years, career_note, referrer_name,
        invite_id, privacy_agreed_at
      )
      values (
        v_uid, v_name, v_phone,
        btrim(coalesce(p_region, '')),
        p_career_years,
        btrim(coalesce(p_career_note, '')),
        btrim(coalesce(p_referrer_name, '')),
        v_invite.id, now()
      );
    end if;
  exception
    when unique_violation then
      raise exception 'PHONE_TAKEN';
    when check_violation then
      raise exception 'INVALID_INPUT';
  end;

  update public.invites
  set used_count = used_count + 1
  where id = v_invite.id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'member.apply', 'profile', v_uid,
          jsonb_build_object('invite_id', v_invite.id, 'rejoin', coalesce(v_status = 'withdrawn', false)));
end;
$$;

revoke all on function public.submit_application(text, text, text, text, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_application(text, text, text, text, integer, text, text, boolean) to authenticated;


-- 4. 오류 기록 한도 -----------------------------------------------------------------------------------

create or replace function public.log_app_error(
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
  -- 로그인 전(누구나 부를 수 있음)과 로그인한 사람의 한도를 따로 둔다.
  -- 로그인 전 기록이 한도를 다 써도 회원·대표가 겪은 오류는 계속 남는다.
  if v_uid is null then
    if (select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 minute') >= 30
      or (select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 day') >= 1000
    then
      return;
    end if;
  elsif (select count(*) from public.app_errors where user_id = v_uid and created_at > now() - interval '1 minute') >= 30
    or (select count(*) from public.app_errors where user_id is not null and created_at > now() - interval '1 day') >= 5000
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
