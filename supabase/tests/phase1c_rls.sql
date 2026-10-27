-- 단가표 보완(시급·일급, 보수 계산 규칙) 권한 테스트
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000002a'),  -- 대표
  ('00000000-0000-0000-0000-00000000002b');  -- 활동 회원

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000002a', '대표3', '01091000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000002b', '권태양', '01091000002', 'member', 'active', 'general', now());


-- 1. 처음 값 --------------------------------------------------------------------

select tests.expect_count($$select 1 from public.app_settings where key = 'pay_rules' and version = 1
  and value = '{"overtime_multiplier": 1.5, "overtime_unit_minutes": 60, "overtime_rounding": "floor", "default_min_paid_hours": 0, "default_hourly_rate": 11000}'::jsonb$$,
  1, '처음 값: 1.5배, 60분 단위, 버림, 최소 보장 0시간, 기본 시급 11,000원');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'pay_rules' and version = 1$$, 1, '처음 값 이력이 남음');


-- 2. 회원 -----------------------------------------------------------------------

select tests.act_as(null);
set role anon;
select tests.expect_error('select * from public.app_settings', 'permission denied%');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000002b');
set role authenticated;
-- 2단계부터 활동 회원은 예상 보수 계산을 위해 보수 계산 규칙(pay_rules)만 볼 수 있다
select tests.expect_count($$select * from public.app_settings where key <> 'pay_rules'$$, 0, '회원: 보수 계산 규칙 말고는 설정이 보이지 않음');
select tests.expect_count('select * from public.app_settings_history', 0, '회원: 설정 이력이 보이지 않음');
select tests.expect_error($$select public.update_pay_rules(2, 30, 'ceil', 4, '')$$, 'NOT_ADMIN');
select tests.expect_error($$update public.app_settings set value = '{}'$$, 'permission denied%');
reset role;


-- 3. 대표: 계산 규칙 ------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000002a');
set role authenticated;

select tests.expect_error($$select public.update_pay_rules(0.5, 60, 'floor', 0, '')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_pay_rules(1.5, 45, 'floor', 0, '')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_pay_rules(1.5, 60, 'up', 0, '')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_pay_rules(1.5, 60, 'floor', 13, '')$$, 'INVALID_INPUT');

select public.update_pay_rules(1.5, 30, 'ceil', 4, '대표 확인: 30분 단위 올림, 최소 4시간');
select tests.expect_count($$select 1 from public.app_settings where key = 'pay_rules' and version = 2
  and value ->> 'overtime_unit_minutes' = '30' and value ->> 'overtime_rounding' = 'ceil'
  and (value ->> 'default_min_paid_hours')::numeric = 4 and updated_by = '00000000-0000-0000-0000-00000000002a'$$,
  1, '대표: 규칙 변경 → 버전 2');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'pay_rules' and version = 2 and change_reason like '대표 확인%'$$, 1, '대표: 변경 이력과 사유가 남음');
select tests.expect_count($$select 1 from public.audit_logs where action = 'settings.pay_rules'$$, 1, '대표: 작업 기록이 남음');


-- 4. 대표: 시급·일급 역할 ---------------------------------------------------------------

insert into public.job_roles (name, default_rate) values ('대기실 관리', 12000);
select tests.expect_count($$select 1 from public.job_roles where name = '대기실 관리' and pay_type = 'hourly' and min_paid_hours is null$$, 1, '대표: 새 역할은 시급이 기본');
insert into public.job_roles (name, pay_type, default_rate, overtime_rate) values ('현장 총괄', 'daily', 180000, 25000);
select tests.expect_count($$select 1 from public.job_roles where name = '현장 총괄' and pay_type = 'daily' and overtime_rate = 25000$$, 1, '대표: 일급 역할과 초과 1시간당 금액');
update public.job_roles set min_paid_hours = 4.5 where name = '대기실 관리';
select tests.expect_count($$select 1 from public.job_roles where name = '대기실 관리' and min_paid_hours = 4.5$$, 1, '대표: 최소 보장 시간 설정');
select tests.expect_error($$update public.job_roles set min_paid_hours = 25 where name = '대기실 관리'$$, '%violates check constraint%');
select tests.expect_error($$insert into public.job_roles (name, pay_type, default_rate) values ('잘못', 'weekly', 1)$$, '%invalid input value for enum%');
reset role;

-- 세팅일·진행일 기본 단가 (8번 파일) --------------------------------------------------------
-- 위의 개수 검사는 이 파일이 만든 기본 두 줄을 빼고 센다 (default_for is null)

select tests.expect_count($$select 1 from public.job_roles where default_for = 'setup' and name = '세팅 (기본)' and default_rate = 11000 and min_paid_hours = 4$$, 1, '처음 값: 세팅일 기본 11,000원·최소 4시간');
select tests.expect_count($$select 1 from public.job_roles where default_for = 'main' and name = '진행 (기본)' and default_rate = 11000$$, 1, '처음 값: 진행일 기본 11,000원');

select tests.act_as('00000000-0000-0000-0000-00000000002a');
set role authenticated;
select tests.expect_error($$update public.job_roles set default_for = 'setup' where name = '대기실 관리'$$, '%duplicate key%');
update public.job_roles set default_for = null where default_for = 'setup';
update public.job_roles set default_for = 'setup' where name = '대기실 관리';
reset role;
select tests.expect_count($$select 1 from public.job_roles where default_for = 'setup' and name = '대기실 관리'$$, 1, '대표: 세팅일 기본을 다른 단가로 바꿈');

\echo 'ALL PAY RULES RLS TESTS PASSED'
