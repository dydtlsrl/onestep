-- 14번 테스트: 리뷰 반영 (대표의 탈퇴 확인 처리, 다시 가입 초기화, 오류 기록 한도 나누기)
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000009a'),  -- 대표
  ('00000000-0000-0000-0000-00000000009b'),  -- 정산을 안 만든 지난 일정이 있는 회원
  ('00000000-0000-0000-0000-00000000009c');  -- 오류 기록하는 회원

insert into public.profiles (id, name, phone, role, status, tier, default_rate, privacy_agreed_at, created_at) values
  ('00000000-0000-0000-0000-00000000009a', '대표10', '01098000001', 'admin', 'active', 'core', null, now(), now()),
  ('00000000-0000-0000-0000-00000000009b', '연습회원', '01098000002', 'member', 'active', 'core', 15000, now(), '2026-01-01'),
  ('00000000-0000-0000-0000-00000000009c', '기록회원', '01098000003', 'member', 'active', 'general', null, now(), now());

select tests.act_as('00000000-0000-0000-0000-00000000009a');
set role authenticated;
select public.create_event('{"type":"written_exam","title":"연습 시험"}',
  '[{"day_date":"2026-02-10","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000}]', '[]', '', '') as ev \gset
select public.set_event_status(:'ev', 'open_all');
reset role;
select id as day from public.event_days where event_id = :'ev' \gset
select tests.act_as('00000000-0000-0000-0000-00000000009a');
set role authenticated;
select public.add_member_to_event(:'ev', :'day', '00000000-0000-0000-0000-00000000009b');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000009b');
set role authenticated;
insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000009b', 'v1:r', '900101-1******', '국민', 'v1:a', '****1234', '연습회원');
reset role;


-- 1. 받을 보수 없음 확인: 본인은 못 넘기고, 대표만 확인하고 넘긴다 ----------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000009b');
set role authenticated;
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000009b', '', true)$$, 'HAS_PENDING_PAYMENT');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000009a');
set role authenticated;
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000009b')$$, 'HAS_PENDING_PAYMENT');
select public.withdraw_member('00000000-0000-0000-0000-00000000009b', '연습 일정만 있음', true);
reset role;
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000009b' and status = 'withdrawn'$$, 1, '대표가 확인하고 탈퇴 처리');
select tests.expect_count($$select 1 from public.audit_logs where action = 'member.withdraw' and target_id = '00000000-0000-0000-0000-00000000009b' and (detail ->> 'forced')::boolean$$, 1, '확인하고 넘긴 것은 기록에 남음');
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-00000000009b'$$, 0, '받은 보수가 없으니 정산 정보 바로 지움');


-- 2. 다시 가입하면 예전 기본 시급·가입 시각·보관 기한을 지운다 ----------------------------------------------

insert into public.invites (code, memo) values ('reviewfix_rejoin_000001', '다시 가입');
-- 보수를 받은 적 있는 탈퇴 회원처럼 정산 정보를 보관 중으로 만든다
insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder, retain_until)
  values ('00000000-0000-0000-0000-00000000009b', 'v1:r', '900101-1******', '국민', 'v1:a', '****1234', '연습회원', '2031-12-31');
select tests.act_as('00000000-0000-0000-0000-00000000009b');
set role authenticated;
select public.submit_application('reviewfix_rejoin_000001', '연습회원', '01098000002', '', 0, '', '', true);
reset role;
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000009b' and status = 'pending' and default_rate is null and created_at > now() - interval '1 minute'$$, 1, '다시 가입: 기본 시급·가입 시각 초기화');
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-00000000009b' and retain_until is null$$, 1, '다시 가입: 보관 기한 없앰');


-- 3. 로그인 전 기록이 한도를 다 써도 로그인한 사람의 오류는 남는다 -------------------------------------------

select tests.act_as(null);
set role anon;
select public.log_app_error('client', 'error', 'spam', '', '/join/x') from generate_series(1, 40);
reset role;
select tests.expect_true((select count(*) from public.app_errors where user_id is null and created_at > now() - interval '1 minute') = 30, '로그인 전: 모두 합쳐 1분 30건까지');

select tests.act_as('00000000-0000-0000-0000-00000000009c');
set role authenticated;
select public.log_app_error('server', 'error', 'RealBug', '진짜 오류', '/contracts/1');
reset role;
select tests.expect_count($$select 1 from public.app_errors where code = 'RealBug' and user_id = '00000000-0000-0000-0000-00000000009c'$$, 1, '로그인한 사람의 오류는 따로 남음');

\echo 'ALL PHASE 7 (REVIEW FIXES) RLS TESTS PASSED'
