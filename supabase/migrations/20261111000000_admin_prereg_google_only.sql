-- 16번: 대표 미리 등록은 Google로 확인된 Gmail로 로그인했을 때만
-- 15번은 "그 이메일로 계정이 생기면" 대표로 만들었다. Supabase는 화면에 없는 이메일·비밀번호 가입도 공개 키로 부를 수 있어서,
-- 대표 Gmail 주소만 아는 사람이 그 주소로 가입해 대표 자리를 가져갈 수 있었다.
-- 이제 Google 로그인이고, 이메일 확인(email_confirmed_at)이 끝난 계정만 대표가 된다.
-- Google 로그인은 계정을 만든 뒤 확인·로그인 수단을 따로 적으므로, 추가뿐 아니라 그 두 칸이 바뀔 때도 확인한다.

create or replace function public.claim_admin_preregistration(p_user_id uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pre public.admin_preregistrations;
begin
  if not exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and lower(u.email) = lower(btrim(coalesce(p_email, '')))
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) ? 'google'
  ) then
    return false;
  end if;

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

drop trigger claim_admin_on_signup on auth.users;
create trigger claim_admin_on_signup
  after insert or update of email_confirmed_at, raw_app_meta_data on auth.users
  for each row execute function public.claim_admin_on_signup();


-- 이미 있는 계정도 Google로 확인된 계정일 때만 바로 대표로 만든다
create or replace function public.preregister_admin(p_email text, p_name text, p_phone text)
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

  if v_user is not null and public.claim_admin_preregistration(v_user, v_email) then
    return '이미 로그인해 본 계정이라 지금 대표로 만들었어요. 새로고침하면 대표 화면이 열려요.';
  end if;
  return '등록했어요. 이 Gmail로 Google 로그인하면 바로 대표 화면이 열려요.';
end;
$$;
