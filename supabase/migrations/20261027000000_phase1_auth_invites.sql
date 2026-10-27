-- 1단계: 초대 링크, 가입 신청, 대표 승인
--
-- 적용 방법 (둘 중 하나)
--   1. Supabase 대시보드 > SQL Editor에 이 파일 내용을 붙여 넣고 Run
--   2. Supabase CLI: npx supabase db push
--
-- 원칙
--   - 모든 테이블에 행 단위 보안(RLS)을 켜고, 필요한 것만 허용한다.
--   - 회원 상태·등급을 바꾸는 일은 아래 함수(RPC)로만 한다. 함수가 권한을 확인하고 기록을 남긴다.
--   - 오류는 영문 코드(예: PHONE_TAKEN)로 돌려주고, 화면에서 한국어 문장으로 바꿔 보여 준다.


-- 상태값 ---------------------------------------------------------------------

create type public.member_role as enum ('admin', 'member');
create type public.member_status as enum ('pending', 'active', 'rejected', 'restricted', 'withdrawn');
create type public.member_tier as enum ('core', 'general');


-- 테이블 ---------------------------------------------------------------------

-- 초대 링크. code가 링크 주소(/join/<code>)에 들어간다.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Za-z0-9_-]{16,64}$'),
  memo text not null default '' check (char_length(memo) <= 100),
  max_uses integer check (max_uses is null or max_uses > 0),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 회원. 로그인 계정(auth.users) 1개당 1행. 가입 신청을 하면 생긴다.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  -- 숫자만 저장한다 (예: 01012345678)
  phone text not null unique check (phone ~ '^01[016789][0-9]{7,8}$'),
  region text not null default '' check (char_length(region) <= 40),
  career_years integer not null default 0 check (career_years between 0 and 60),
  career_note text not null default '' check (char_length(career_note) <= 1000),
  referrer_name text not null default '' check (char_length(referrer_name) <= 40),
  role public.member_role not null default 'member',
  status public.member_status not null default 'pending',
  tier public.member_tier not null default 'general',
  -- 거절·제한 사유
  status_reason text not null default '' check (char_length(status_reason) <= 500),
  invite_id uuid references public.invites (id) on delete set null,
  privacy_agreed_at timestamptz not null,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status);
create index profiles_invite_id_idx on public.profiles (invite_id);

-- 누가 언제 무엇을 했는지 남기는 기록. 함수만 쓰고, 대표만 읽는다.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- 함수 -----------------------------------------------------------------------

-- 지금 로그인한 사람이 활동 중인 대표(관리자)인지
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'active'
  );
$$;

-- 초대 링크를 쓸 수 있는지만 알려 준다. 메모 등 다른 정보는 내보내지 않는다.
create function public.check_invite(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invites i
    where i.code = p_code
      and i.is_active
      and (i.expires_at is null or i.expires_at > now())
      and (i.max_uses is null or i.used_count < i.max_uses)
  );
$$;

-- 가입 신청. 초대 링크 확인, 입력값 검사, 회원 행 생성, 사용 횟수 증가를 한 번에 한다.
create function public.submit_application(
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
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if not coalesce(p_privacy_agreed, false) then
    raise exception 'PRIVACY_REQUIRED';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
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

  if exists (select 1 from public.profiles where phone = v_phone) then
    raise exception 'PHONE_TAKEN';
  end if;

  begin
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
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'profiles_pkey' then
        raise exception 'ALREADY_APPLIED';
      end if;
      raise exception 'PHONE_TAKEN';
    when check_violation then
      raise exception 'INVALID_INPUT';
  end;

  update public.invites
  set used_count = used_count + 1
  where id = v_invite.id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'member.apply', 'profile', v_uid, jsonb_build_object('invite_id', v_invite.id));
end;
$$;

-- 가입 승인 (대표만). 승인하면서 등급을 정한다.
create function public.approve_member(p_member_id uuid, p_tier public.member_tier)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    and status = 'pending';

  if not found then
    raise exception 'NOT_PENDING';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.approve', 'profile', p_member_id, jsonb_build_object('tier', p_tier));
end;
$$;

-- 가입 거절 (대표만). 사유를 남긴다.
create function public.reject_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if char_length(v_reason) > 500 then
    raise exception 'INVALID_INPUT';
  end if;

  update public.profiles
  set status = 'rejected',
      status_reason = v_reason
  where id = p_member_id
    and status = 'pending';

  if not found then
    raise exception 'NOT_PENDING';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.reject', 'profile', p_member_id, jsonb_build_object('reason', v_reason));
end;
$$;


-- 권한 -----------------------------------------------------------------------
-- Supabase는 새 테이블·함수에 anon(로그인 안 한 사람)과 authenticated(로그인한 사람)
-- 권한을 기본으로 준다. 모두 거둔 뒤 필요한 것만 다시 준다.

revoke all on public.invites, public.profiles, public.audit_logs from anon, authenticated;

grant select on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.invites to authenticated;
grant insert (code, memo, max_uses, expires_at) on public.invites to authenticated;
grant update (memo, is_active) on public.invites to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.check_invite(text) from public, anon, authenticated;
revoke all on function public.submit_application(text, text, text, text, integer, text, text, boolean) from public, anon, authenticated;
revoke all on function public.approve_member(uuid, public.member_tier) from public, anon, authenticated;
revoke all on function public.reject_member(uuid, text) from public, anon, authenticated;

grant execute on function public.check_invite(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.submit_application(text, text, text, text, integer, text, text, boolean) to authenticated;
grant execute on function public.approve_member(uuid, public.member_tier) to authenticated;
grant execute on function public.reject_member(uuid, text) to authenticated;


-- 행 단위 보안 (RLS) ---------------------------------------------------------

alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "회원은 자기 정보를, 대표는 모든 회원을 본다"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "대표만 초대 링크를 본다"
  on public.invites for select to authenticated
  using ((select public.is_admin()));

create policy "대표만 초대 링크를 만든다"
  on public.invites for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "대표만 초대 링크를 고친다"
  on public.invites for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "대표만 기록을 본다"
  on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
