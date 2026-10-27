-- 1B단계: 회원 관리(등급 변경, 활동 제한, 관리자 기록)와 단가표
--
-- 적용 방법: 1단계 마이그레이션을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
-- (Supabase CLI를 쓰면 npx supabase db push)


-- 상태값 ---------------------------------------------------------------------

create type public.note_type as enum ('memo', 'no_show', 'late', 'caution', 'praise');


-- 테이블 ---------------------------------------------------------------------

-- 대표만 쓰고 보는 인력 기록 (PRD MEM-05). 회원에게는 보이지 않는다.
-- 관련 일정(event_id)은 일정 기능을 만드는 2단계에서 추가한다.
create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  type public.note_type not null default 'memo',
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index member_notes_member_id_idx on public.member_notes (member_id, created_at desc);

-- 단가표: 역할별 인력 1회 보수 (PRD RATE-01). 고객사 청구 단가가 아니다.
-- 지난 일정이 참조할 수 있도록 지우지 않고 숨긴다(is_active).
create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 30),
  description text not null default '' check (char_length(description) <= 200),
  default_rate integer not null check (default_rate between 0 and 10000000),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_roles_set_updated_at
  before update on public.job_roles
  for each row execute function public.set_updated_at();

-- 회원별 노쇼·지각 횟수. 호출한 사람의 권한(RLS)으로 계산한다.
create view public.member_note_counts
with (security_invoker = true)
as
select
  member_id,
  count(*) filter (where type = 'no_show') as no_show_count,
  count(*) filter (where type = 'late') as late_count,
  max(created_at) as last_note_at
from public.member_notes
group by member_id;


-- 함수 -----------------------------------------------------------------------

-- 지금 로그인한 사람이 활동 중인 회원(대표 포함)인지
create function public.is_active_member()
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
      and status = 'active'
  );
$$;

-- 등급 변경 (대표만)
create function public.set_member_tier(p_member_id uuid, p_tier public.member_tier)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.member_tier;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select tier into v_old
  from public.profiles
  where id = p_member_id and status in ('active', 'restricted')
  for update;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  if v_old = p_tier then
    return;
  end if;

  update public.profiles set tier = p_tier where id = p_member_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.set_tier', 'profile', p_member_id, jsonb_build_object('from', v_old, 'to', p_tier));
end;
$$;

-- 활동 제한 (대표만). 사유가 꼭 있어야 하고, 대표 계정은 제한할 수 없다.
create function public.restrict_member(p_member_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role public.member_role;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  if v_reason = '' or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED';
  end if;

  select role into v_role from public.profiles where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_role = 'admin' then
    raise exception 'CANNOT_TARGET_ADMIN';
  end if;

  update public.profiles
  set status = 'restricted', status_reason = v_reason
  where id = p_member_id and status = 'active';

  if not found then
    raise exception 'NOT_ACTIVE';
  end if;

  insert into public.member_notes (member_id, type, content, created_by)
  values (p_member_id, 'caution', '활동 제한: ' || v_reason, auth.uid());

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.restrict', 'profile', p_member_id, jsonb_build_object('reason', v_reason));
end;
$$;

-- 활동 제한 해제 (대표만)
create function public.unrestrict_member(p_member_id uuid)
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
  set status = 'active', status_reason = ''
  where id = p_member_id and status = 'restricted';

  if not found then
    raise exception 'NOT_RESTRICTED';
  end if;

  insert into public.member_notes (member_id, type, content, created_by)
  values (p_member_id, 'memo', '활동 제한 해제', auth.uid());

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.unrestrict', 'profile', p_member_id, '{}'::jsonb);
end;
$$;

-- 가입 승인 시 가입일·추천인을 관리자 기록에 자동으로 남긴다 (PRD MEM-05 ②)
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

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'member.approve', 'profile', p_member_id, jsonb_build_object('tier', p_tier));
end;
$$;


-- 권한 -----------------------------------------------------------------------

revoke all on public.member_notes, public.job_roles, public.member_note_counts from anon, authenticated;

grant select, delete on public.member_notes to authenticated;
grant insert (member_id, type, content) on public.member_notes to authenticated;
grant select on public.member_note_counts to authenticated;
grant select on public.job_roles to authenticated;
grant insert (name, description, default_rate, sort_order) on public.job_roles to authenticated;
grant update (name, description, default_rate, sort_order, is_active) on public.job_roles to authenticated;

revoke all on function public.is_active_member() from public, anon, authenticated;
revoke all on function public.set_member_tier(uuid, public.member_tier) from public, anon, authenticated;
revoke all on function public.restrict_member(uuid, text) from public, anon, authenticated;
revoke all on function public.unrestrict_member(uuid) from public, anon, authenticated;

grant execute on function public.is_active_member() to authenticated;
grant execute on function public.set_member_tier(uuid, public.member_tier) to authenticated;
grant execute on function public.restrict_member(uuid, text) to authenticated;
grant execute on function public.unrestrict_member(uuid) to authenticated;


-- 행 단위 보안 (RLS) ---------------------------------------------------------

alter table public.member_notes enable row level security;
alter table public.job_roles enable row level security;

create policy "대표만 관리자 기록을 본다"
  on public.member_notes for select to authenticated
  using ((select public.is_admin()));

create policy "대표만 관리자 기록을 쓴다"
  on public.member_notes for insert to authenticated
  with check ((select public.is_admin()) and created_by = (select auth.uid()));

create policy "대표만 관리자 기록을 지운다"
  on public.member_notes for delete to authenticated
  using ((select public.is_admin()));

create policy "활동 회원은 단가표를 본다"
  on public.job_roles for select to authenticated
  using ((select public.is_admin()) or ((select public.is_active_member()) and is_active));

create policy "대표만 단가표를 만든다"
  on public.job_roles for insert to authenticated
  with check ((select public.is_admin()));

create policy "대표만 단가표를 고친다"
  on public.job_roles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
