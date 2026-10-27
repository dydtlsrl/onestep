-- 3·4단계 테스트: 정산 정보 암호문 보호, 전자계약, 정산, 설정
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 준비 데이터 ------------------------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000005a'),  -- 대표
  ('00000000-0000-0000-0000-00000000005b'),  -- 회원 A
  ('00000000-0000-0000-0000-00000000005c'),  -- 회원 B
  ('00000000-0000-0000-0000-00000000005d');  -- 대기 회원

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000005a', '대표6', '01094000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000005b', '서하늘', '01094000002', 'member', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000005c', '김도윤', '01094000003', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000005d', '박대기', '01094000004', 'member', 'pending', 'general', now());

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select public.create_event(
  '{"type":"written_exam","title":"계약 테스트 시험"}',
  '[{"day_date":"2026-12-05","start_time":"08:00","end_time":"17:00","headcount":3,"pay_type":"hourly","rate":11000}]',
  '[]', '', ''
) as ev \gset
select public.set_event_status(:'ev', 'open_all');
reset role;
select id as day from public.event_days where event_id = :'ev' \gset

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select public.apply_to_event(:'ev', array[:'day']::uuid[]);
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000005c');
set role authenticated;
select public.apply_to_event(:'ev', array[:'day']::uuid[]);
reset role;
select id as app_a from public.applications where member_id = '00000000-0000-0000-0000-00000000005b' \gset
select id as app_b from public.applications where member_id = '00000000-0000-0000-0000-00000000005c' \gset


-- 1. 설정 ----------------------------------------------------------------------------

select tests.expect_count($$select 1 from public.app_settings where key = 'tax' and value ->> 'type' = 'unset'$$, 1, '세금: 처음엔 미정');

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select tests.expect_error($$select public.update_setting('tax', '{"type":"other","threshold":true,"include_extras":true}')$$, 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_error($$select public.update_setting('tax', '{"type":"weird","threshold":true,"include_extras":true}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('company', '{"name":""}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('company', '{"name":"원스텝","fax":"1"}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('contract', '{"rrn_display":"half"}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('nope', '{}')$$, 'SETTING_NOT_FOUND');
select public.update_setting('company', '{"name":"원스텝","ceo":"홍길동","biz_no":"123-45-67890","address":"서울","phone":"02-000-0000"}', '사업자 정보');
reset role;
select tests.expect_count($$select 1 from public.app_settings where key = 'company' and version = 2 and value ->> 'ceo' = '홍길동'$$, 1, '설정: 회사 정보 저장, 버전 올림');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'company'$$, 2, '설정: 이력 남김');


-- 2. 정산 정보: 암호문은 화면 API로 읽을 수 없다 -------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select tests.expect_error($$insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000005b', 'plain', '900101-1******', '국민', 'v1:x', '****1234', '서하늘')$$, '%check%');
select tests.expect_error($$insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000005c', 'v1:a', '900101-1******', '국민', 'v1:x', '****1234', '남')$$, '%row-level security%');
insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder, address)
  values ('00000000-0000-0000-0000-00000000005b', 'v1:rrnA', '900101-1******', '국민은행', 'v1:accA', '****1234', '서하늘', '서울시');
select tests.expect_error('select rrn_enc from public.member_private', '%permission denied%');
select tests.expect_count('select member_id, rrn_masked, account_masked from public.member_private', 1, '회원: 자기 가린 값만 봄');
select tests.expect_count($$select * from public.my_private_secrets() where rrn_enc = 'v1:rrnA'$$, 1, '회원: 자기 암호문은 함수로 받음');
select tests.expect_error($$select public.admin_private_secrets(array['00000000-0000-0000-0000-00000000005b']::uuid[], 'view')$$, 'NOT_ADMIN');
update public.member_private set address = '부산시' where member_id = '00000000-0000-0000-0000-00000000005b';
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005d');
set role authenticated;
select tests.expect_error($$insert into public.member_private (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder)
  values ('00000000-0000-0000-0000-00000000005d', 'v1:a', '900101-1******', '국민', 'v1:x', '****1234', '박')$$, '%row-level security%');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005c');
set role authenticated;
select tests.expect_count('select member_id from public.member_private', 0, '다른 회원: 남의 정산 정보 안 보임');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_count('select member_id, rrn_masked from public.member_private', 1, '대표: 가린 값 봄');
select tests.expect_error('select account_enc from public.member_private', '%permission denied%');
select tests.expect_error($$select public.admin_private_secrets(array['00000000-0000-0000-0000-00000000005b']::uuid[], 'fun')$$, 'INVALID_INPUT');
select tests.expect_count($$select * from public.admin_private_secrets(array['00000000-0000-0000-0000-00000000005b']::uuid[], 'view') where account_enc = 'v1:accA'$$, 1, '대표: 함수로 암호문 받음');
reset role;
select tests.expect_count($$select 1 from public.audit_logs where action = 'private.read' and detail ->> 'purpose' = 'view'$$, 1, '열람 기록 남김');
select tests.expect_count($$select 1 from public.member_private where address = '부산시'$$, 1, '회원: 자기 정보 고침');


-- 3. 계약 ----------------------------------------------------------------------------

select id as tpl from public.contract_templates where version = 1 \gset

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_error(format($$select public.request_contract(%L, '00000000-0000-0000-0000-00000000005b', %L, '계약', '본문', '{}')$$, :'ev', :'tpl'), 'NOT_SELECTED');
select public.decide_applications(array[:'app_a', :'app_b']::uuid[], 'selected');
select tests.expect_error(format($$select public.request_contract(%L, '00000000-0000-0000-0000-00000000005b', %L, '계약', '본문', '[]')$$, :'ev', :'tpl'), 'INVALID_INPUT');
select public.request_contract(:'ev', '00000000-0000-0000-0000-00000000005b', :'tpl', '계약 테스트 시험 용역 계약서', '본문 A', '{"total":99000}') as con_a \gset
select public.request_contract(:'ev', '00000000-0000-0000-0000-00000000005c', :'tpl', '계약 테스트 시험 용역 계약서', '본문 B', '{"total":99000}') as con_b \gset
select tests.expect_error(format($$select public.request_contract(%L, '00000000-0000-0000-0000-00000000005b', %L, '계약', '본문', '{}')$$, :'ev', :'tpl'), 'CONTRACT_EXISTS');
select tests.expect_true(public.remind_contracts(:'ev') = 2, '대표: 서명 안 한 사람에게 다시 알림');
select tests.expect_count('select * from public.contract_templates', 1, '대표: 양식 봄');
select tests.expect_true(public.save_contract_template('새 양식', '{{이름}} 본문') = 2, '양식 고치면 새 버전');
reset role;
select tests.expect_count($$select 1 from public.notifications where type = 'contract.requested'$$, 2, '서명 요청 알림');

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select tests.expect_count('select id, status from public.contracts', 1, '회원: 자기 계약서만 봄');
select tests.expect_count('select * from public.contract_templates', 0, '회원: 양식 안 보임');
select tests.expect_error(format($$select public.sign_contract(%L, 'not-an-image', '1.2.3.4', 'ua')$$, :'con_a'), 'SIGNATURE_REQUIRED');
select tests.expect_error(format($$select public.sign_contract(%L, 'data:image/png;base64,' || repeat('A', 300), '', '')$$, :'con_b'), 'CONTRACT_NOT_FOUND');
select public.sign_contract(:'con_a', 'data:image/png;base64,' || repeat('A', 300), '1.2.3.4', 'test-agent') as hash \gset
select tests.expect_true(length(:'hash') = 64, '서명: 문서 해시(SHA-256)');
select tests.expect_error(format($$select public.sign_contract(%L, 'data:image/png;base64,' || repeat('A', 300), '', '')$$, :'con_a'), 'CONTRACT_NOT_OPEN');
select tests.expect_error(format($$update public.contracts set status = 'voided' where id = %L$$, :'con_a'), '%permission denied%');
reset role;
select tests.expect_count(format($$select 1 from public.contracts where id = %L and status = 'signed' and signer_rrn_masked = '900101-1******' and signer_address = '부산시' and sign_ip = '1.2.3.4'$$, :'con_a'), 1, '서명: 가린 주민번호·주소·IP 기록');

-- 정산 정보 없는 회원은 서명 못 함
select tests.act_as('00000000-0000-0000-0000-00000000005c');
set role authenticated;
select tests.expect_error(format($$select public.sign_contract(%L, 'data:image/png;base64,' || repeat('A', 300), '', '')$$, :'con_b'), 'PRIVATE_REQUIRED');
reset role;

-- 확정 취소 → 계약 무효
select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_error(format($$select public.void_contract(%L, '')$$, :'con_b'), 'REASON_REQUIRED');
select public.decide_applications(array[:'app_b']::uuid[], 'waitlisted');
reset role;
select tests.expect_count(format($$select 1 from public.contracts where id = %L and status = 'voided' and void_reason = '확정 취소'$$, :'con_b'), 1, '확정 취소 → 계약 자동 무효');
select tests.expect_count(format($$select 1 from public.contracts where id = %L and status = 'signed'$$, :'con_a'), 1, '다른 사람 계약은 그대로');

-- 다시 확정하면 새로 요청할 수 있다
select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select public.decide_applications(array[:'app_b']::uuid[], 'selected');
select public.request_contract(:'ev', '00000000-0000-0000-0000-00000000005c', :'tpl', '재요청', '본문 B2', '{}') as con_b2 \gset
select public.void_contract(:'con_b2', '내용 수정');
select tests.expect_error(format($$select public.void_contract(%L, '다시')$$, :'con_b2'), 'CONTRACT_NOT_FOUND');
reset role;


-- 4. 정산 ----------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[{"kind":"work","label":"근무","amount":99000}]', '{}')$$, :'ev'), 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005d', '2026-12-15', '[{"kind":"work","label":"근무","amount":1}]', '{}')$$, :'ev'), 'NOT_SELECTED');
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[]', '{}')$$, :'ev'), 'INVALID_INPUT');
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[{"kind":"bonus","label":"x","amount":1}]', '{}')$$, :'ev'), 'INVALID_INPUT');
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[{"kind":"work","label":"x","amount":-5}]', '{}')$$, :'ev'), 'INVALID_INPUT');
-- 세금 미정이면 확정 전
select public.save_payment(:'ev', '00000000-0000-0000-0000-00000000005b', '2026-12-15',
  format('[{"kind":"work","label":"근무 9시간","amount":99000,"day_id":"%s"},{"kind":"transport","label":"교통비","amount":10000}]', :'day')::jsonb,
  '{"type":"unset"}') as pay_a \gset
reset role;
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'draft' and work_amount = 99000 and extra_amount = 10000 and gross = 109000 and net = 109000$$, :'pay_a'), 1, '정산: 세금 미정 → 확정 전');

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_true(public.set_payment_status(array[:'pay_a']::uuid[], 'paid') = 0, '확정 전은 지급 완료로 못 바꿈');
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[{"kind":"work","label":"근무","amount":100}]', '{"type":"other","income_tax":50,"local_tax":5000}')$$, :'ev'), 'INVALID_INPUT');
-- 기타소득 8% (교통비 포함 109,000 → 8,720원, 지방세 870원)
select public.save_payment(:'ev', '00000000-0000-0000-0000-00000000005b', '2026-12-15',
  '[{"kind":"work","label":"근무 9시간","amount":99000},{"kind":"transport","label":"교통비","amount":10000}]',
  '{"type":"other","rule":{"rate":0.08},"income_tax":8720,"local_tax":870}', true, '확인함');
reset role;
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'scheduled' and net = 99410 and edited and confirmed_at is not null$$, :'pay_a'), 1, '정산: 세금 정하면 지급 예정, 실수령액 계산');
select tests.expect_count(format($$select 1 from public.payment_items where payment_id = %L$$, :'pay_a'), 2, '정산: 항목 다시 저장');

select tests.act_as('00000000-0000-0000-0000-00000000005c');
set role authenticated;
select tests.expect_count('select * from public.payments', 0, '다른 회원: 남의 정산 안 보임');
select tests.expect_count('select * from public.payment_items', 0, '다른 회원: 남의 항목 안 보임');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select tests.expect_error(format($$select public.set_payment_status(array[%L]::uuid[], 'held')$$, :'pay_a'), 'REASON_REQUIRED');
select tests.expect_true(public.set_payment_status(array[:'pay_a']::uuid[], 'held', '계좌 확인') = 1, '보류');
select tests.expect_error(format($$select public.save_payment(%L, '00000000-0000-0000-0000-00000000005b', '2026-12-15', '[{"kind":"work","label":"근무","amount":1}]', '{}')$$, :'ev'), 'PAYMENT_LOCKED');
select tests.expect_true(public.set_payment_status(array[:'pay_a']::uuid[], 'scheduled') = 1, '보류 풀기');
select tests.expect_true(public.set_payment_status(array[:'pay_a']::uuid[], 'paid') = 1, '지급 완료');
select public.log_payment_export('2026-12-15', 1, 99410);
reset role;
select tests.expect_count($$select 1 from public.notifications where type = 'payment.paid' and body like '99,410원%'$$, 1, '지급 완료 알림');
select tests.expect_count($$select 1 from public.audit_logs where action = 'payment.export'$$, 1, '이체 파일 기록');

select tests.act_as('00000000-0000-0000-0000-00000000005b');
set role authenticated;
select tests.expect_count($$select * from public.payments where status = 'paid'$$, 1, '회원: 자기 지급 내역 봄');
select tests.expect_count('select * from public.payment_items', 2, '회원: 자기 지급 항목 봄');
reset role;

-- 김도윤 정산을 만든 뒤 일정 취소 → 계약 무효, 지급 전 정산 취소, 지급 완료는 그대로
select tests.act_as('00000000-0000-0000-0000-00000000005a');
set role authenticated;
select public.request_contract(:'ev', '00000000-0000-0000-0000-00000000005c', :'tpl', '재요청', '본문 B3', '{}') as con_b3 \gset
select public.save_payment(:'ev', '00000000-0000-0000-0000-00000000005c', '2026-12-15', '[{"kind":"work","label":"근무","amount":99000}]', '{"type":"none"}') as pay_b \gset
select public.set_event_status(:'ev', 'cancelled', '고객사 취소');
reset role;
select tests.expect_count(format($$select 1 from public.contracts where id = %L and status = 'voided' and void_reason = '일정 취소'$$, :'con_b3'), 1, '일정 취소 → 계약 무효');
select tests.expect_count(format($$select 1 from public.contracts where id = %L and status = 'voided'$$, :'con_a'), 1, '일정 취소 → 서명한 계약도 무효');
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'cancelled'$$, :'pay_b'), 1, '일정 취소 → 지급 전 정산 취소');
select tests.expect_count(format($$select 1 from public.payments where id = %L and status = 'paid'$$, :'pay_a'), 1, '일정 취소 → 지급 완료는 그대로');
\echo 'ALL PHASE 3 (CONTRACTS, PAYMENTS) RLS TESTS PASSED'
