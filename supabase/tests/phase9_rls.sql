-- 17번 테스트: 휴게시간, 정산 취소, 보류 풀기, 탈퇴 확인 처리 보호, 서명 계좌, 근로계약서 기본 양식
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000f1'),  -- 대표
  ('00000000-0000-0000-0000-0000000000f2'),  -- 노쇼한 회원
  ('00000000-0000-0000-0000-0000000000f3');  -- 정산이 남은 채 탈퇴 요청한 회원

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-0000000000f1', '대표11', '01097100001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-0000000000f2', '노쇼회원', '01097100002', 'member', 'active', 'core', now()),
  ('00000000-0000-0000-0000-0000000000f3', '미지급회원', '01097100003', 'member', 'active', 'core', now());

insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder, address) values
  ('00000000-0000-0000-0000-0000000000f2', 'v1:r', '900101-1******', 'KB국민은행', 'v1:a', '****1234', '노쇼회원', '서울 마포구'),
  ('00000000-0000-0000-0000-0000000000f3', 'v1:r', '900101-2******', '신한은행', 'v1:a', '****5678', '미지급회원', '');


-- 1. 휴게시간: 날짜마다 저장, 근무 시간보다 길면 안 됨 ------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.create_event('{"type":"written_exam","title":"휴게 시험"}',
  '[{"day_date":"2026-02-10","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000,"break_minutes":60}]', '[]', '', '') as ev \gset
select tests.expect_error($$select public.create_event('{"type":"written_exam","title":"휴게 너무 김"}',
  '[{"day_date":"2026-02-10","start_time":"08:00","end_time":"09:00","headcount":3,"pay_type":"hourly","rate":11000,"break_minutes":60}]', '[]', '', '')$$, 'INVALID_INPUT');
select public.set_event_status(:'ev', 'open_all');
reset role;
select id as day from public.event_days where event_id = :'ev' \gset
select tests.expect_count(format($$select 1 from public.event_days where id = %L and break_minutes = 60$$, :'day'), 1, '휴게시간 저장');

-- 휴게시간을 안 보낸 예전 화면은 0분
select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.create_event('{"type":"written_exam","title":"휴게 없음"}',
  '[{"day_date":"2026-02-11","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000}]', '[]', '', '') as ev_nobreak \gset
reset role;
select tests.expect_count(format($$select 1 from public.event_days where event_id = %L and break_minutes = 0$$, :'ev_nobreak'), 1, '휴게시간 없으면 0분');

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.add_member_to_event(:'ev', :'day', '00000000-0000-0000-0000-0000000000f2');
select public.add_member_to_event(:'ev', :'day', '00000000-0000-0000-0000-0000000000f3');
reset role;


-- 2. 정산 취소: 대표만, 확정 전·지급 예정만 ------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.save_payment(:'ev', '00000000-0000-0000-0000-0000000000f2', '2026-02-15',
  '[{"kind":"work","label":"근무","amount":88000}]', '{"type":"unset"}') as pay_noshow \gset
reset role;

select tests.act_as('00000000-0000-0000-0000-0000000000f2');
set role authenticated;
select tests.expect_error(format($$select public.cancel_payment(%L, '00000000-0000-0000-0000-0000000000f2', '')$$, :'ev'), 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select tests.expect_true(public.cancel_payment(:'ev', '00000000-0000-0000-0000-0000000000f2', '노쇼'), '노쇼: 정산 취소');
select tests.expect_true(not public.cancel_payment(:'ev', '00000000-0000-0000-0000-0000000000f2', '노쇼'), '이미 취소한 것은 그대로');
reset role;
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'cancelled'$$, :'pay_noshow'), 1, '취소 상태');
select tests.expect_count($$select 1 from public.audit_logs where action = 'payment.cancel'$$, 1, '취소 기록');

-- 다시 계산하면 취소한 정산도 되살아난다
select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.save_payment(:'ev', '00000000-0000-0000-0000-0000000000f2', '2026-02-15',
  '[{"kind":"work","label":"근무","amount":88000}]', '{"type":"unset"}');
reset role;
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'draft'$$, :'pay_noshow'), 1, '취소한 정산 다시 계산');


-- 3. 세금 방식을 정하기 전에 보류한 정산도 풀 수 있다 ------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select tests.expect_true(public.set_payment_status(array[:'pay_noshow']::uuid[], 'held', '확인 중') = 1, '확정 전 정산 보류');
select tests.expect_true(not public.cancel_payment(:'ev', '00000000-0000-0000-0000-0000000000f2', ''), '보류한 것은 취소 안 함');
select tests.expect_true(public.set_payment_status(array[:'pay_noshow']::uuid[], 'scheduled') = 1, '보류 풀기');
reset role;
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'draft' and held_reason = ''$$, :'pay_noshow'), 1, '세금 방식 전이면 확정 전으로 돌아감');


-- 4. 탈퇴 확인 처리라도 아직 주지 않은 정산이 있으면 막는다 ------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.save_payment(:'ev', '00000000-0000-0000-0000-0000000000f3', '2026-02-15',
  '[{"kind":"work","label":"근무","amount":88000}]', '{"type":"business","rule":{"rate":0.03},"income_tax":2640,"local_tax":260}') as pay_unpaid \gset
select tests.expect_error($$select public.withdraw_member('00000000-0000-0000-0000-0000000000f3', '', true)$$, 'HAS_UNPAID_PAYMENT');
select public.set_payment_status(array[:'pay_unpaid']::uuid[], 'paid');
select public.withdraw_member('00000000-0000-0000-0000-0000000000f3', '지급 끝', true);
reset role;
select tests.expect_count($$select 1 from public.member_private where member_id = '00000000-0000-0000-0000-0000000000f3' and retain_until is not null$$, 1, '지급 뒤 탈퇴: 정산 정보 보관');


-- 5. 서명할 때 계좌(은행 + 가린 번호)를 남긴다 ---------------------------------------------------

select id as tpl from public.contract_templates order by version desc limit 1 \gset
select tests.act_as('00000000-0000-0000-0000-0000000000f1');
set role authenticated;
select public.request_contract(:'ev', '00000000-0000-0000-0000-0000000000f2', :'tpl', '근로계약서', '본문', '{"total":77000}') as con \gset
reset role;
select tests.act_as('00000000-0000-0000-0000-0000000000f2');
set role authenticated;
select public.sign_contract(:'con', 'data:image/png;base64,' || repeat('A', 300), '1.2.3.4', 'ua');
select tests.expect_count(format($$select 1 from public.contracts where id = %L and signer_account = 'KB국민은행 ****1234'$$, :'con'), 1, '서명: 계좌 남김 (본인이 봄)');
reset role;


-- 6. 계약서 기본 양식은 근로계약서 ---------------------------------------------------------------

select tests.expect_count($$select 1 from public.contract_templates where version = 2 and title = '근로계약서' and body like '%{{근로계약기간}}%'$$, 1, '기본 양식: 근로계약서');

\echo 'ALL PHASE 9 (SETTLE, CONTRACT FIXES) RLS TESTS PASSED'
