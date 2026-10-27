-- 1단계 권한 규칙 테스트
-- 실행: npm run db:test
-- 실패하면 FAIL 메시지와 함께 바로 멈춘다. 통과한 항목은 PASS로 출력된다.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 준비 데이터 (관리자 권한으로 직접 넣음) --------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', null),
  ('00000000-0000-0000-0000-0000000000b1', null),
  ('00000000-0000-0000-0000-0000000000c1', null),
  ('00000000-0000-0000-0000-0000000000d1', null),
  ('00000000-0000-0000-0000-0000000000e1', null);

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at, approved_at)
values ('00000000-0000-0000-0000-00000000000a', '대표', '01000000000', 'admin', 'active', 'core', now(), now());

insert into public.invites (code, memo, max_uses, expires_at, is_active, created_by) values
  ('VALIDCODE0000001', '핵심 인력용', null, null, true, '00000000-0000-0000-0000-00000000000a'),
  ('EXPIREDCODE00001', '만료', null, now() - interval '1 day', true, '00000000-0000-0000-0000-00000000000a'),
  ('INACTIVECODE0001', '중지', null, null, false, '00000000-0000-0000-0000-00000000000a'),
  ('ONEUSECODE000001', '1회용', 1, null, true, '00000000-0000-0000-0000-00000000000a');


-- 1. 로그인 안 한 사람 ----------------------------------------------------------

select tests.act_as(null);
set role anon;

select tests.expect_error('select * from public.profiles', 'permission denied%');
select tests.expect_error('select * from public.invites', 'permission denied%');
select tests.expect_error('select * from public.audit_logs', 'permission denied%');
select tests.expect_true(public.check_invite('VALIDCODE0000001'), 'anon: 유효한 초대 링크는 true');
select tests.expect_true(not public.check_invite('EXPIREDCODE00001'), 'anon: 만료된 링크는 false');
select tests.expect_true(not public.check_invite('INACTIVECODE0001'), 'anon: 중지된 링크는 false');
select tests.expect_true(not public.check_invite('NOPE000000000000'), 'anon: 없는 링크는 false');
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '홍길동', '01011112222', '', 1, '', '', true)$$, 'permission denied%');
select tests.expect_error($$select public.approve_member('00000000-0000-0000-0000-0000000000a1', 'core')$$, 'permission denied%');

reset role;


-- 2. 가입 신청 -------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-0000000000a1');
set role authenticated;

select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '김하늘', '010-1234-5678', '서울', 5, '', '', false)$$, 'PRIVACY_REQUIRED');
select tests.expect_error($$select public.submit_application('EXPIREDCODE00001', '김하늘', '010-1234-5678', '서울', 5, '', '', true)$$, 'INVITE_INVALID');
select tests.expect_error($$select public.submit_application('INACTIVECODE0001', '김하늘', '010-1234-5678', '서울', 5, '', '', true)$$, 'INVITE_INVALID');
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '  ', '010-1234-5678', '서울', 5, '', '', true)$$, 'INVALID_INPUT');
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '김하늘', '02-123-4567', '서울', 5, '', '', true)$$, 'INVALID_INPUT');
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '김하늘', '010-1234-5678', '서울', 99, '', '', true)$$, 'INVALID_INPUT');

select public.submit_application('VALIDCODE0000001', ' 김하늘 ', '010-1234-5678', '서울', 5, '시험 감독 5년', '이도윤', true);
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' and status = 'pending' and phone = '01012345678' and name = '김하늘'$$, 1, 'A: 신청하면 승인 대기 상태로 생기고 번호는 숫자만 저장');
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '김하늘', '010-9999-8888', '서울', 5, '', '', true)$$, 'ALREADY_APPLIED');

-- 회원은 상태를 직접 바꾸거나 회원 행을 직접 만들 수 없다
select tests.expect_error($$update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'permission denied%');
select tests.expect_error($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1'$$, 'permission denied%');
select tests.expect_error($$insert into public.profiles (id, name, phone, privacy_agreed_at) values ('00000000-0000-0000-0000-0000000000e1', 'x', '01055556666', now())$$, 'permission denied%');
select tests.expect_error($$delete from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$$, 'permission denied%');

-- 승인 대기 회원은 대표 기능을 쓸 수 없다
select tests.expect_true(not public.is_admin(), 'A: 대표가 아님');
select tests.expect_error($$select public.approve_member('00000000-0000-0000-0000-0000000000a1', 'core')$$, 'NOT_ADMIN');
select tests.expect_error($$select public.reject_member('00000000-0000-0000-0000-0000000000a1', '')$$, 'NOT_ADMIN');
select tests.expect_count('select * from public.invites', 0, 'A: 초대 링크 목록이 보이지 않음');
select tests.expect_error($$insert into public.invites (code, memo) values ('HACKERCODE000001', 'x')$$, 'new row violates row-level security policy%');
select tests.expect_count('select * from public.audit_logs', 0, 'A: 기록이 보이지 않음');

reset role;

-- 같은 번호로 다른 계정이 가입할 수 없다 (형식이 달라도)
select tests.act_as('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select tests.expect_error($$select public.submit_application('VALIDCODE0000001', '다른 사람', '01012345678', '', 0, '', '', true)$$, 'PHONE_TAKEN');
select public.submit_application('ONEUSECODE000001', '박서연', '010 2222 3333', '부산', 2, '', '', true);
select tests.expect_count('select * from public.profiles', 1, 'B: 자기 정보만 보임 (A는 안 보임)');
reset role;

-- 1회용 링크는 한 번 쓰면 끝
select tests.act_as('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select tests.expect_true(not public.check_invite('ONEUSECODE000001'), 'C: 다 쓴 1회용 링크는 false');
select tests.expect_error($$select public.submit_application('ONEUSECODE000001', '최준호', '01033334444', '', 0, '', '', true)$$, 'INVITE_INVALID');
reset role;


-- 3. 대표 -----------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000000a');
set role authenticated;

select tests.expect_true(public.is_admin(), '대표: 관리자로 인식');
select tests.expect_count($$select * from public.profiles where status = 'pending'$$, 2, '대표: 승인 대기 회원이 모두 보임');
select tests.expect_count('select * from public.invites', 4, '대표: 초대 링크가 모두 보임');

select public.approve_member('00000000-0000-0000-0000-0000000000a1', 'core');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a1' and status = 'active' and tier = 'core' and approved_by = '00000000-0000-0000-0000-00000000000a'$$, 1, '대표: A 승인 (핵심)');
select tests.expect_error($$select public.approve_member('00000000-0000-0000-0000-0000000000a1', 'general')$$, 'NOT_PENDING');

select public.reject_member('00000000-0000-0000-0000-0000000000b1', '확인되지 않는 경력');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b1' and status = 'rejected' and status_reason = '확인되지 않는 경력'$$, 1, '대표: B 거절 (사유 저장)');

insert into public.invites (code, memo, max_uses) values ('NEWINVITECODE001', '11월 신규', 10);
select tests.expect_count($$select 1 from public.invites where code = 'NEWINVITECODE001' and created_by = '00000000-0000-0000-0000-00000000000a' and used_count = 0$$, 1, '대표: 초대 링크 생성 (만든 사람 자동 기록)');
select tests.expect_error($$insert into public.invites (code, used_count) values ('NEWINVITECODE002', 99)$$, 'permission denied%');
select tests.expect_error($$update public.invites set used_count = 0 where code = 'ONEUSECODE000001'$$, 'permission denied%');
update public.invites set is_active = false where code = 'NEWINVITECODE001';
select tests.expect_true(not public.check_invite('NEWINVITECODE001'), '대표: 링크를 끄면 더 이상 못 씀');
select tests.expect_count($$select * from public.audit_logs where action in ('member.apply', 'member.approve', 'member.reject')$$, 4, '대표: 신청·승인·거절 기록이 남음');

reset role;

-- 승인된 회원 A도 대표 기능은 못 쓴다
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
set role authenticated;
select tests.expect_true(not public.is_admin(), 'A(활동 회원): 대표가 아님');
select tests.expect_count('select * from public.profiles', 1, 'A(활동 회원): 여전히 자기 정보만 보임');
reset role;

-- 활동 상태가 아닌 대표 계정은 관리자 권한이 없다
update public.profiles set status = 'restricted' where id = '00000000-0000-0000-0000-00000000000a';
select tests.act_as('00000000-0000-0000-0000-00000000000a');
set role authenticated;
select tests.expect_true(not public.is_admin(), '제한된 대표 계정: 관리자 권한 없음');
select tests.expect_count('select * from public.invites', 0, '제한된 대표 계정: 초대 링크가 안 보임');
reset role;

\echo 'ALL PHASE 1 RLS TESTS PASSED'
