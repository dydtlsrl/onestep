-- 12번 테스트: 회원 탈퇴, 다시 가입, 처리방침용 회사 정보
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000007a'),  -- 대표
  ('00000000-0000-0000-0000-00000000007b'),  -- 회원 A: 지난 일정, 보수 받음
  ('00000000-0000-0000-0000-00000000007c'),  -- 회원 B: 신청만, 정산 정보·관리자 기록 있음
  ('00000000-0000-0000-0000-00000000007d'),  -- 회원 C: 다가오는 확정 일정
  ('00000000-0000-0000-0000-00000000007e'),  -- 승인 대기
  ('00000000-0000-0000-0000-00000000007f');  -- 새로 가입하는 사람

insert into public.profiles (id, name, phone, region, career_note, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000007a', '대표8', '01096000001', '', '', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000007b', '탈퇴가', '01096000002', '서울', '감독 3회', 'member', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000007c', '탈퇴나', '01096000003', '부산', '', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000007d', '탈퇴다', '01096000004', '', '', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000007e', '대기라', '01096000005', '', '', 'member', 'pending', 'general', now());

insert into public.invites (code, memo) values ('withdrawtest_invite_0001', '다시 가입 테스트');

select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select public.create_event('{"type":"written_exam","title":"지난 시험"}',
  '[{"day_date":"2026-01-10","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000}]', '[]', '', '') as ev_past \gset
select public.create_event('{"type":"written_exam","title":"먼 미래 시험"}',
  '[{"day_date":"2099-01-10","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000}]', '[]', '', '') as ev_future \gset
select public.set_event_status(:'ev_past', 'open_all');
select public.set_event_status(:'ev_future', 'open_all');
reset role;
select id as day_past from public.event_days where event_id = :'ev_past' \gset
select id as day_future from public.event_days where event_id = :'ev_future' \gset

select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select public.add_member_to_event(:'ev_past', :'day_past', '00000000-0000-0000-0000-00000000007b');
select public.add_member_to_event(:'ev_future', :'day_future', '00000000-0000-0000-0000-00000000007d');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000007c');
set role authenticated;
select public.apply_to_event(:'ev_future', array[:'day_future']::uuid[]);
insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000007c', 'v1:rrnB', '900101-1******', '국민', 'v1:accB', '****1234', '탈퇴나');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000007b');
set role authenticated;
insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000007b', 'v1:rrnA', '900101-1******', '신한', 'v1:accA', '****5678', '탈퇴가');
reset role;
insert into public.member_notes (member_id, type, content, created_by)
  values ('00000000-0000-0000-0000-00000000007c', 'memo', '성실함', '00000000-0000-0000-0000-00000000007a');


-- 1. 탈퇴를 막는 경우 --------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000007d');
set role authenticated;
select tests.expect_true(public.withdraw_blocker('00000000-0000-0000-0000-00000000007d') = 'HAS_UPCOMING_WORK', 'C: 다가오는 확정 일정');
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000007d')$$, 'HAS_UPCOMING_WORK');
select tests.expect_error($$select public.withdraw_blocker('00000000-0000-0000-0000-00000000007b')$$, 'NOT_ALLOWED');
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000007c')$$, 'NOT_ALLOWED');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000007b');
set role authenticated;
select tests.expect_true(public.withdraw_blocker('00000000-0000-0000-0000-00000000007b') = 'HAS_PENDING_PAYMENT', 'A: 지난 일정 정산 전');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000007a')$$, 'CANNOT_TARGET_ADMIN');
select public.save_payment(:'ev_past', '00000000-0000-0000-0000-00000000007b', '2026-01-31',
  '[{"kind":"work","label":"근무","amount":99000}]', '{"type":"other","rule":{"rate":0.08},"income_tax":0,"local_tax":0}') as pay_a \gset
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000007b');
set role authenticated;
select tests.expect_true(public.withdraw_blocker('00000000-0000-0000-0000-00000000007b') = 'HAS_PENDING_PAYMENT', 'A: 지급 예정이면 아직 못 함');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select public.set_payment_status(array[:'pay_a']::uuid[], 'paid');
reset role;


-- 2. 탈퇴: 보수를 받은 회원은 정산 정보를 5년 보관 ------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000007b');
set role authenticated;
select tests.expect_true(public.withdraw_blocker('00000000-0000-0000-0000-00000000007b') is null, 'A: 지급 끝나면 탈퇴 가능');
select public.withdraw_member('00000000-0000-0000-0000-00000000007b', '이사');
select tests.expect_true(not public.is_active_member(), 'A: 탈퇴 뒤 활동 회원 아님');
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000007b')$$, 'ALREADY_WITHDRAWN');
reset role;

select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000007b' and status = 'withdrawn' and withdrawn_at is not null and withdraw_reason = '이사' and region = '' and career_note = '' and name = '탈퇴가'$$, 1, 'A: 상태·지울 칸');
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-00000000007b' and retain_until = '2031-12-31'$$, 1, 'A: 정산 정보는 지급한 해 다음 해부터 5년 보관');
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'paid'$$, :'pay_a'), 1, 'A: 지급 기록 남음');
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000007a' and type = 'member.withdrawn' and link = '/admin/members/00000000-0000-0000-0000-00000000007b'$$, 1, '대표에게 탈퇴 알림');
select tests.expect_count($$select 1 from public.audit_logs where action = 'member.withdraw' and target_id = '00000000-0000-0000-0000-00000000007b'$$, 1, 'A: 기록');

-- 보관 기한이 지나면 지운다
update public.member_private set retain_until = '2020-12-31' where member_id = '00000000-0000-0000-0000-00000000007b';
select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select tests.expect_true(public.purge_expired_private() = 1, '보관 기한 지난 정산 정보 지움');
reset role;
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-00000000007b'$$, 0, 'A: 정산 정보 없어짐');


-- 3. 탈퇴: 보수를 받은 적 없으면 정산 정보 바로 지움, 처리 전 신청 취소, 관리자 기록 지움 ----------------------

select tests.act_as('00000000-0000-0000-0000-00000000007c');
set role authenticated;
select public.withdraw_member('00000000-0000-0000-0000-00000000007c');
reset role;
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-00000000007c'$$, 0, 'B: 정산 정보 바로 지움');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000007c'$$, 0, 'B: 관리자 기록 지움');
select tests.expect_count($$select 1 from public.applications where member_id = '00000000-0000-0000-0000-00000000007c' and status = 'cancelled' and cancel_reason = '회원 탈퇴'$$, 1, 'B: 처리 전 신청 취소');

-- 대표가 본인 요청을 받아 처리 (승인 대기 회원). 대표에게는 알림을 보내지 않는다.
select tests.act_as('00000000-0000-0000-0000-00000000007a');
set role authenticated;
select public.withdraw_member('00000000-0000-0000-0000-00000000007e', '전화로 요청');
reset role;
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000007e' and status = 'withdrawn'$$, 1, '대표가 탈퇴 처리');
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000007a' and type = 'member.withdrawn'$$, 2, '대표가 처리한 탈퇴는 알림 없음 (A·B만)');


-- 4. 다시 가입: 같은 계정은 새 신청으로, 탈퇴한 사람의 번호는 다른 사람도 쓸 수 있음 ----------------------------

select tests.act_as('00000000-0000-0000-0000-00000000007f');
set role authenticated;
select public.submit_application('withdrawtest_invite_0001', '새사람', '010-9600-0002', '', 0, '', '', true);
reset role;
select tests.expect_count($$select 1 from public.profiles where phone = '01096000002'$$, 2, '탈퇴한 번호로 다른 사람 가입');

select tests.act_as('00000000-0000-0000-0000-00000000007c');
set role authenticated;
select tests.expect_error($$select public.submit_application('withdrawtest_invite_0001', '탈퇴나', '01096000002', '', 0, '', '', true)$$, 'PHONE_TAKEN');
select public.submit_application('withdrawtest_invite_0001', '탈퇴나', '01096000003', '대구', 2, '다시 왔어요', '', true);
select tests.expect_error($$select public.submit_application('withdrawtest_invite_0001', '탈퇴나', '01096000003', '', 0, '', '', true)$$, 'ALREADY_APPLIED');
reset role;
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000007c' and status = 'pending' and region = '대구' and withdrawn_at is null and approved_at is null$$, 1, 'B: 같은 계정으로 다시 신청');
select tests.expect_count($$select 1 from public.applications where member_id = '00000000-0000-0000-0000-00000000007c'$$, 1, 'B: 예전 기록은 그대로');


-- 5. 처리방침 회사 정보: 로그인 전에도 이름·대표자·연락처만 ------------------------------------------------

select tests.act_as(null);
set role anon;
select tests.expect_true(public.public_company_info() ? 'name' and not (public.public_company_info() ? 'biz_no'), '처리방침 회사 정보 (누구나)');
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-00000000007d')$$, '%permission denied%');
reset role;

\echo 'ALL PHASE 5 (WITHDRAWAL) RLS TESTS PASSED'
