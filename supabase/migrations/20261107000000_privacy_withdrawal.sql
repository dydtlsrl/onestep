-- 12번: 회원 탈퇴, 개인정보 처리방침 화면
--
-- 적용 방법: 20261106000000_dev_console.sql(11번)을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우지 않는다. 칸 몇 개와 함수를 더하고, 휴대폰 번호 중복 검사를 탈퇴한 회원은 빼고 하도록 바꾼다.
--
-- 탈퇴하면
--   - 지움: 지역·경력·추천인, 관리자 기록, 알림, 처리 전 신청(취소), 서명 전 계약서(무효)
--   - 지움: 정산 정보(주민번호·계좌·주소). 단 보수를 받은 적이 있으면 세무 신고 자료라서
--           마지막 지급일이 속한 해의 다음 해부터 5년 동안 보관한 뒤 지운다 (retain_until)
--   - 남김: 이름·휴대폰(계약·지급 기록을 누구 것인지 알기 위해), 서명한 계약서, 지급 기록, 참여 기록
--   - 로그인 계정(auth.users)은 지우지 않는다. 지우면 지급 기록이 함께 지워지기 때문이다.
--     같은 계정으로 초대 링크를 다시 열면 새로 가입 신청을 할 수 있다.
-- 확정된 일정이 남았거나 아직 받지 않은 보수가 있으면 탈퇴할 수 없다 (대표에게 먼저 알리도록).


-- 칸 ---------------------------------------------------------------------------------------

alter table public.profiles
  add column withdrawn_at timestamptz,
  add column withdraw_reason text not null default '' check (char_length(withdraw_reason) <= 200);

alter table public.member_private
  add column retain_until date;

-- 휴대폰 번호는 탈퇴하지 않은 회원끼리만 겹치지 않게 (탈퇴한 사람의 번호로 새로 가입할 수 있게)
alter table public.profiles drop constraint profiles_phone_key;
create unique index profiles_phone_key on public.profiles (phone) where status <> 'withdrawn';


-- 탈퇴를 막는 이유 -----------------------------------------------------------------------------
-- HAS_UPCOMING_WORK: 확정된 일정이 아직 끝나지 않음 / HAS_PENDING_PAYMENT: 받을 보수가 정산·지급되지 않음

create function public.withdraw_blocker(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_member_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.applications a
    join public.event_days d on d.id = a.day_id
    join public.events e on e.id = a.event_id
    where a.member_id = p_member_id and a.status = 'selected' and e.status <> 'cancelled' and d.day_date >= v_today
  ) then
    return 'HAS_UPCOMING_WORK';
  end if;

  if exists (
    select 1
    from public.applications a
    join public.events e on e.id = a.event_id
    where a.member_id = p_member_id and a.status = 'selected' and e.status <> 'cancelled' and a.attendance <> 'no_show'
      and not exists (
        select 1 from public.payments p
        where p.event_id = a.event_id and p.member_id = p_member_id and p.status in ('paid', 'cancelled')
      )
  ) or exists (
    select 1 from public.payments p where p.member_id = p_member_id and p.status in ('draft', 'scheduled', 'held')
  ) then
    return 'HAS_PENDING_PAYMENT';
  end if;

  return null;
end;
$$;


-- 보관 기간이 지난 정산 정보 지우기 (탈퇴한 회원만). 탈퇴할 때마다 함께 돌고, 대표도 부를 수 있다.

create function public.purge_expired_private()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 기한이 지난 것만 지우므로 누가 불러도 괜찮다 (탈퇴하는 회원의 권한으로도 돈다)
  delete from public.member_private m
  using public.profiles p
  where p.id = m.member_id and p.status = 'withdrawn' and m.retain_until is not null and m.retain_until < (now() at time zone 'Asia/Seoul')::date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- 탈퇴 (본인, 또는 본인 요청을 받은 대표) ------------------------------------------------------------

create function public.withdraw_member(p_member_id uuid, p_reason text default '')
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

  v_blocker := public.withdraw_blocker(p_member_id);
  if v_blocker is not null then
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
          jsonb_build_object('by_admin', v_by_admin, 'kept_private_until', (select retain_until from public.member_private where member_id = p_member_id)));

  -- 본인이 탈퇴하면 대표에게 알린다
  if not v_by_admin then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'member.withdrawn', left(v_profile.name || '님이 탈퇴했어요', 100), left(v_reason, 300), '/admin/members/' || p_member_id
    from public.profiles where role = 'admin' and status = 'active';
  end if;

  perform public.purge_expired_private();
end;
$$;


-- 가입 신청: 탈퇴한 사람이 같은 계정으로 다시 신청할 수 있게 한다 -----------------------------------
-- 1번 파일의 함수에서 바뀐 곳: 탈퇴한 회원 정보가 있으면 새 신청으로 덮어쓰고(같은 ID, 예전 기록 유지),
-- 휴대폰 번호 중복은 탈퇴하지 않은 다른 회원과만 본다.

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
          approved_at = null, approved_by = null, withdrawn_at = null, withdraw_reason = ''
      where id = v_uid;
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


-- 개인정보 처리방침 화면에 넣을 회사 정보 (누구나, 로그인 전 포함) --------------------------------------
-- 설정(company)은 대표만 읽으므로 처리방침에 필요한 칸만 따로 준다.

create function public.public_company_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'name', coalesce(value ->> 'name', ''),
    'ceo', coalesce(value ->> 'ceo', ''),
    'address', coalesce(value ->> 'address', ''),
    'phone', coalesce(value ->> 'phone', '')
  )
  from public.app_settings where key = 'company';
$$;


-- 권한 -----------------------------------------------------------------------------------------

revoke all on function public.withdraw_blocker(uuid) from public, anon, authenticated;
revoke all on function public.purge_expired_private() from public, anon, authenticated;
revoke all on function public.withdraw_member(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_application(text, text, text, text, integer, text, text, boolean) from public, anon, authenticated;
revoke all on function public.public_company_info() from public, anon, authenticated;

grant execute on function public.withdraw_blocker(uuid) to authenticated;
grant execute on function public.purge_expired_private() to authenticated;
grant execute on function public.withdraw_member(uuid, text) to authenticated;
grant execute on function public.submit_application(text, text, text, text, integer, text, text, boolean) to authenticated;
grant execute on function public.public_company_info() to anon, authenticated;
