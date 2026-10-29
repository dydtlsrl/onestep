-- 로컬 PostgreSQL에서 Supabase 환경을 흉내 내는 준비 파일 (테스트 전용, 실제 Supabase에는 적용하지 않음)
-- Supabase가 미리 만들어 두는 역할, auth 스키마, 기본 권한을 비슷하게 만든다.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase의 auth.uid()와 같은 방식: 요청의 JWT(sub)에서 사용자 ID를 읽는다
create function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase처럼 public 스키마의 새 테이블·함수에 기본 권한을 준다.
-- 마이그레이션이 이 권한을 제대로 거둬들이는지 확인하기 위해서다.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
