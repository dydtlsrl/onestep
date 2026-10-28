-- 13번: 기존 인력 명단으로 초대 (MEM-07)
--
-- 적용 방법: 20261107000000_privacy_withdrawal.sql(12번)을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우지 않는다. 명단 표(roster)를 만들고, 초대 링크에 명단 조건 칸을 더한다.
--
-- 대표가 엑셀 명단(이름·휴대폰·등급·메모)을 붙여 넣으면
--   - 명단으로 단체 링크를 만들 수 있다: 최대 가입 수 = 명단 인원, "명단에 있는 번호만 가입" 선택
--   - 사람마다 1회용 개인 링크를 만들 수 있다: 그 사람 번호로만 가입
--   - 가입 승인 때 휴대폰 번호로 명단과 대조해 이름·등급을 보여 준다
-- 명단은 대표만 보고 고친다. 가입이 끝난 사람은 대표가 명단에서 지운다 (회원 정보와 겹치므로).


-- 명단 -------------------------------------------------------------------------------------------

create table public.roster (
  id uuid primary key default gen_random_uuid(),
  list_name text not null default '' check (char_length(list_name) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  phone text not null unique check (phone ~ '^01[016789][0-9]{7,8}$'),
  tier public.member_tier not null default 'general',
  memo text not null default '' check (char_length(memo) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index roster_list_idx on public.roster (list_name);

create trigger roster_set_updated_at
  before update on public.roster
  for each row execute function public.set_updated_at();

alter table public.roster enable row level security;
revoke all on public.roster from anon, authenticated;
grant select, insert, update, delete on public.roster to authenticated;

create policy "대표만 명단을 보고 고친다"
  on public.roster for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- 초대 링크의 명단 조건 ------------------------------------------------------------------------------

alter table public.invites
  add column roster_only boolean not null default false,
  add column roster_list text not null default '' check (char_length(roster_list) <= 40),
  add column roster_id uuid references public.roster (id) on delete set null;

create index invites_roster_id_idx on public.invites (roster_id);

grant insert (roster_only, roster_list, roster_id) on public.invites to authenticated;

-- 명단에서 사람을 지우면 그 사람의 개인 링크도 끈다 (다른 사람이 쓰지 못하게)
create function public.on_roster_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites set is_active = false where roster_id = old.id;
  return old;
end;
$$;

create trigger roster_disable_invites
  before delete on public.roster
  for each row execute function public.on_roster_deleted();

revoke all on function public.on_roster_deleted() from public, anon, authenticated;


-- 가입 신청: 명단 조건 검사를 더한다 (12번 함수에서 바뀐 곳은 "명단 전용 링크" 부분뿐) -----------------------

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

revoke all on function public.submit_application(text, text, text, text, integer, text, text, boolean) from public, anon, authenticated;
grant execute on function public.submit_application(text, text, text, text, integer, text, text, boolean) to authenticated;
