-- 단가표를 "자주 쓰는 보수 조건 모음"으로 쓴다: 세팅일 기본·진행일 기본 표시
--
-- 적용 방법: 20261102000000_day_signup.sql을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우지 않는다.
--
-- 바뀌는 것
--   - 단가표의 한 줄을 "세팅일 기본" 또는 "진행일 기본"으로 표시할 수 있다 (종류마다 하나).
--     일정을 만들 때 세팅일·진행일을 추가하면 이 값이 자동으로 들어간다.
--   - 단가표가 비어 있거나 기본이 없으면 "세팅 (기본)" 시급 11,000원·최소 4시간,
--     "진행 (기본)" 시급 11,000원을 만들어 기본으로 표시한다. 대표가 자유롭게 고치거나 숨길 수 있다.


alter table public.job_roles add column default_for public.event_day_kind;

-- 종류마다 기본은 하나
create unique index job_roles_default_for_key on public.job_roles (default_for) where default_for is not null;

grant insert (default_for) on public.job_roles to authenticated;
grant update (default_for) on public.job_roles to authenticated;


-- 처음 기본값 (보통 필기시험 세팅 4시간 44,000원·8시간 88,000원 기준) -------------------------------

insert into public.job_roles (name, description, pay_type, default_rate, min_paid_hours, sort_order)
values ('세팅 (기본)', '세팅일에 자동으로 들어가는 단가', 'hourly', 11000, 4, 0)
on conflict (name) do nothing;

insert into public.job_roles (name, description, pay_type, default_rate, min_paid_hours, sort_order)
values ('진행 (기본)', '진행일에 자동으로 들어가는 단가', 'hourly', 11000, null, 0)
on conflict (name) do nothing;

update public.job_roles set default_for = 'setup'
where name = '세팅 (기본)' and is_active
  and not exists (select 1 from public.job_roles where default_for = 'setup');

update public.job_roles set default_for = 'main'
where name = '진행 (기본)' and is_active
  and not exists (select 1 from public.job_roles where default_for = 'main');
