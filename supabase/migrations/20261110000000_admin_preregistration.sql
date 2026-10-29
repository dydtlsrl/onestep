-- 15번: 대표 미리 등록
-- 대표(관리자)의 Gmail·이름·휴대폰을 미리 넣어 두면, 그 Gmail로 처음 로그인하는 순간 대표 계정이 만들어진다.
-- 개발자가 대표의 첫 로그인을 기다렸다가 SQL을 실행하지 않아도 된다.
-- 등록: select public.preregister_admin('대표gmail@gmail.com', '대표 이름', '01012345678');  (SQL Editor에서만)

create table public.admin_preregistrations (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  phone text not null check (phone ~ '^01[016789][0-9]{7,8}$'),
  created_at timestamptz not null default now(),
  -- 처음 로그인해서 대표 계정이 만들어진 때 (= 대표의 첫 로그인)
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);

-- 앱에서는 읽지도 쓰지도 않는다. SQL Editor(관리자)와 아래 함수만 쓴다.
alter table public.admin_preregistrations enable row level security;
revoke all on public.admin_preregistrations from anon, authenticated;


-- 미리 등록한 Gmail이면 대표 계정을 만든다. 만들었으면 true.
create function public.claim_admin_preregistration(p_user_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pre public.admin_preregistrations;
begin
  select * into v_pre
  from public.admin_preregistrations
  where email = lower(btrim(coalesce(p_email, ''))) and claimed_at is null
  for update;
  if not found or exists (select 1 from public.profiles where id = p_user_id) then
    return false;
  end if;

  insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at, approved_at)
  values (p_user_id, v_pre.name, v_pre.phone, 'admin', 'active', 'core', now(), now());

  update public.admin_preregistrations
  set claimed_by = p_user_id, claimed_at = now()
  where email = v_pre.email;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (p_user_id, 'admin.preregistered', 'profile', p_user_id, jsonb_build_object('email', v_pre.email));
  return true;
end;
$$;

revoke all on function public.claim_admin_preregistration(uuid, text) from public, anon, authenticated;


-- 처음 로그인(계정 생성) 때 실행한다. 대표 등록이 실패해도 로그인은 막지 않고, 개발자 오류 기록에 남긴다.
create function public.claim_admin_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.claim_admin_preregistration(new.id, new.email);
  exception when others then
    insert into public.app_errors (user_id, source, level, code, message, path)
    values (new.id, 'auth', 'error', 'ADMIN_PREREG_FAILED', left(sqlerrm, 1000), '/auth/callback');
  end;
  return new;
end;
$$;

revoke all on function public.claim_admin_on_signup() from public, anon, authenticated;

create trigger claim_admin_on_signup
  after insert on auth.users
  for each row execute function public.claim_admin_on_signup();


-- 개발자가 SQL Editor에서 실행한다. 이미 로그인해 본 Gmail이면 바로 대표로 만든다.
create function public.preregister_admin(p_email text, p_name text, p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = v_email limit 1;
  if v_user is not null and exists (select 1 from public.profiles where id = v_user) then
    raise exception 'ALREADY_HAS_PROFILE';
  end if;
  if exists (select 1 from public.profiles where phone = v_phone and status <> 'withdrawn') then
    raise exception 'PHONE_TAKEN';
  end if;

  begin
    insert into public.admin_preregistrations (email, name, phone)
    values (v_email, btrim(coalesce(p_name, '')), v_phone)
    on conflict (email) do update
      set name = excluded.name, phone = excluded.phone, created_at = now(), claimed_by = null, claimed_at = null;
  exception when check_violation then
    raise exception 'INVALID_INPUT';
  end;

  if v_user is null then
    return '등록했어요. 이 Gmail로 처음 로그인하면 바로 대표 화면이 열려요.';
  end if;
  perform public.claim_admin_preregistration(v_user, v_email);
  return '이미 로그인해 본 계정이라 지금 대표로 만들었어요. 새로고침하면 대표 화면이 열려요.';
end;
$$;

revoke all on function public.preregister_admin(text, text, text) from public, anon, authenticated;
-- 자동 테스트(e2e)가 관리용 키로 부른다
grant execute on function public.preregister_admin(text, text, text) to service_role;
