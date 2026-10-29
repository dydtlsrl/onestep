-- 15번 테스트: 대표 미리 등록 (처음 로그인하면 바로 대표)
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 이미 로그인해 본 계정 둘: 회원 정보 없음 / 회원으로 가입함
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'already@gmail.com'),
  ('00000000-0000-0000-0000-0000000000ab', 'member@gmail.com');
insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-0000000000ab', '회원가', '01099000002', 'member', 'active', 'general', now());


-- 1. 앱(로그인 전·회원)에서는 쓸 수 없다 -------------------------------------------------------

select tests.act_as(null);
set role anon;
select tests.expect_error($$select public.preregister_admin('x@gmail.com', '가', '01099000009')$$, '%permission denied%');
select tests.expect_error($$select * from public.admin_preregistrations$$, '%permission denied%');
reset role;

select tests.act_as('00000000-0000-0000-0000-0000000000ab');
set role authenticated;
select tests.expect_error($$select public.preregister_admin('x@gmail.com', '가', '01099000009')$$, '%permission denied%');
select tests.expect_error($$select public.claim_admin_preregistration('00000000-0000-0000-0000-0000000000ab', 'x@gmail.com')$$, '%permission denied%');
select tests.expect_error($$select * from public.admin_preregistrations$$, '%permission denied%');
reset role;


-- 2. 미리 등록 → 처음 로그인하면 대표 ------------------------------------------------------------

select tests.expect_true(public.preregister_admin(' CEO@Gmail.com ', ' 대표님 ', '010-9900-0001') like '등록했어요%', '등록: 로그인 전');
select tests.expect_count($$select 1 from public.admin_preregistrations where email = 'ceo@gmail.com' and name = '대표님' and phone = '01099000001' and claimed_at is null$$, 1, '등록: 소문자·숫자만으로 저장');

-- 이름·번호를 고쳐 다시 등록하면 덮어쓴다
select public.preregister_admin('ceo@gmail.com', '대표', '01099000011');
select tests.expect_count($$select 1 from public.admin_preregistrations where email = 'ceo@gmail.com' and name = '대표' and phone = '01099000011'$$, 1, '다시 등록: 덮어씀');

-- Google 로그인으로 계정이 처음 생기는 순간
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ac', 'Ceo@gmail.com');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000ac' and name = '대표' and phone = '01099000011' and role = 'admin' and status = 'active' and tier = 'core' and approved_at is not null$$, 1, '첫 로그인: 대표 계정');
select tests.expect_count($$select 1 from public.admin_preregistrations where email = 'ceo@gmail.com' and claimed_by = '00000000-0000-0000-0000-0000000000ac' and claimed_at is not null$$, 1, '첫 로그인: 언제 들어왔는지 남음');
select tests.expect_count($$select 1 from public.audit_logs where action = 'admin.preregistered' and actor_id = '00000000-0000-0000-0000-0000000000ac'$$, 1, '첫 로그인: 기록');

select tests.act_as('00000000-0000-0000-0000-0000000000ac');
set role authenticated;
select tests.expect_true(public.is_admin(), '첫 로그인: 대표 권한');
reset role;

-- 미리 등록하지 않은 Gmail은 그대로 (가입 신청 전)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000ad', 'someone@gmail.com');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000ae');
select tests.expect_count($$select 1 from public.profiles where id in ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-0000000000ae')$$, 0, '등록 안 한 Gmail·이메일 없는 계정: 회원 정보 없음');


-- 3. 이미 로그인해 본 계정은 등록하는 즉시 대표 ------------------------------------------------------

select tests.expect_true(public.preregister_admin('already@gmail.com', '먼저온대표', '01099000003') like '이미 로그인해 본%', '이미 로그인: 바로 대표');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000aa' and role = 'admin'$$, 1, '이미 로그인: 대표 계정');


-- 4. 막는 경우 --------------------------------------------------------------------------------

select tests.expect_error($$select public.preregister_admin('member@gmail.com', '회원가', '01099000004')$$, 'ALREADY_HAS_PROFILE');
select tests.expect_error($$select public.preregister_admin('ceo@gmail.com', '대표', '01099000011')$$, 'ALREADY_HAS_PROFILE');
select tests.expect_error($$select public.preregister_admin('new@gmail.com', '새대표', '010-9900-0002')$$, 'PHONE_TAKEN');
select tests.expect_error($$select public.preregister_admin('not-an-email', '가', '01099000005')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.preregister_admin('a@gmail.com', '', '01099000005')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.preregister_admin('a@gmail.com', '가', '0212345678')$$, 'INVALID_INPUT');

-- 첫 로그인 전에 다른 사람이 그 번호로 가입하면: 로그인은 되고, 대표 등록 실패를 오류 기록에 남긴다
select public.preregister_admin('late@gmail.com', '늦은대표', '01099000006');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000af');
insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-0000000000af', '먼저가입', '01099000006', 'member', 'pending', 'general', now());
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b0', 'late@gmail.com');
select tests.expect_count($$select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000b0'$$, 1, '등록 실패해도 로그인 계정은 생김');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b0'$$, 0, '등록 실패: 회원 정보 없음');
select tests.expect_count($$select 1 from public.admin_preregistrations where email = 'late@gmail.com' and claimed_at is null$$, 1, '등록 실패: 미리 등록은 그대로');
select tests.expect_count($$select 1 from public.app_errors where code = 'ADMIN_PREREG_FAILED' and user_id = '00000000-0000-0000-0000-0000000000b0'$$, 1, '등록 실패: 오류 기록');

\echo 'ALL PHASE 8 (ADMIN PREREGISTRATION) RLS TESTS PASSED'
