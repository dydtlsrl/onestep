-- 1B단계 권한 규칙 테스트 (회원 관리, 관리자 기록, 단가표)
-- 실행: npm run db:test
-- 1단계 테스트와 섞이지 않도록 자기 사용자와 대표 계정을 따로 만든다.

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 준비 데이터 ------------------------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000001a'),  -- 대표
  ('00000000-0000-0000-0000-00000000001b'),  -- 활동 회원 (일반)
  ('00000000-0000-0000-0000-00000000001c'),  -- 활동 회원 (핵심)
  ('00000000-0000-0000-0000-00000000001d'),  -- 승인 대기
  ('00000000-0000-0000-0000-00000000001e');  -- 회원 행 없음

insert into public.profiles (id, name, phone, role, status, tier, referrer_name, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000001a', '대표2', '01090000001', 'admin', 'active', 'core', '', now()),
  ('00000000-0000-0000-0000-00000000001b', '박서연', '01090000002', 'member', 'active', 'general', '', now()),
  ('00000000-0000-0000-0000-00000000001c', '윤지아', '01090000003', 'member', 'active', 'core', '', now()),
  ('00000000-0000-0000-0000-00000000001d', '정유나', '01090000004', 'member', 'pending', 'general', '이도윤', now());

insert into public.job_roles (name, default_rate, sort_order, is_active) values
  ('감독관', 130000, 1, true),
  ('예전 역할', 90000, 9, false);


-- 1. 로그인 안 한 사람 ----------------------------------------------------------

select tests.act_as(null);
set role anon;
select tests.expect_error('select * from public.job_roles', 'permission denied%');
select tests.expect_error('select * from public.member_notes', 'permission denied%');
select tests.expect_error('select * from public.member_note_counts', 'permission denied%');
reset role;


-- 2. 활동 회원 ------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000001b');
set role authenticated;
select tests.expect_count('select * from public.member_notes', 0, '회원: 관리자 기록이 보이지 않음');
select tests.expect_count('select * from public.member_note_counts', 0, '회원: 노쇼·지각 횟수가 보이지 않음');
select tests.expect_error($$insert into public.member_notes (member_id, type, content) values ('00000000-0000-0000-0000-00000000001c', 'praise', '칭찬')$$, 'new row violates row-level security policy%');
select tests.expect_count('select * from public.job_roles', 1, '회원: 숨기지 않은 단가표만 보임');
select tests.expect_error($$insert into public.job_roles (name, default_rate) values ('해킹', 1)$$, 'new row violates row-level security policy%');
update public.job_roles set default_rate = 1;
reset role;
select tests.expect_count($$select 1 from public.job_roles where default_rate = 1$$, 0, '회원: 단가를 고쳐도 반영되지 않음');
set role authenticated;
select tests.expect_error($$select public.set_member_tier('00000000-0000-0000-0000-00000000001b', 'core')$$, 'NOT_ADMIN');
select tests.expect_error($$select public.restrict_member('00000000-0000-0000-0000-00000000001c', '사유')$$, 'NOT_ADMIN');
select tests.expect_error($$select public.unrestrict_member('00000000-0000-0000-0000-00000000001c')$$, 'NOT_ADMIN');
reset role;

-- 승인 대기·회원 행 없는 사람은 단가표도 못 본다
select tests.act_as('00000000-0000-0000-0000-00000000001d');
set role authenticated;
select tests.expect_count('select * from public.job_roles', 0, '승인 대기: 단가표가 보이지 않음');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000001e');
set role authenticated;
select tests.expect_count('select * from public.job_roles', 0, '회원 행 없음: 단가표가 보이지 않음');
reset role;


-- 3. 대표: 등급 변경, 활동 제한 ---------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000001a');
set role authenticated;

select public.set_member_tier('00000000-0000-0000-0000-00000000001b', 'core');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000001b' and tier = 'core'$$, 1, '대표: 등급을 핵심으로 변경');
select tests.expect_count($$select 1 from public.audit_logs where action = 'member.set_tier' and target_id = '00000000-0000-0000-0000-00000000001b'$$, 1, '대표: 등급 변경 기록이 남음');
select tests.expect_error($$select public.set_member_tier('00000000-0000-0000-0000-00000000001d', 'core')$$, 'MEMBER_NOT_FOUND');

select tests.expect_error($$select public.restrict_member('00000000-0000-0000-0000-00000000001b', '   ')$$, 'REASON_REQUIRED');
select tests.expect_error($$select public.restrict_member('00000000-0000-0000-0000-00000000001a', '실수')$$, 'CANNOT_TARGET_ADMIN');
select public.restrict_member('00000000-0000-0000-0000-00000000001b', '노쇼 반복');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000001b' and status = 'restricted' and status_reason = '노쇼 반복'$$, 1, '대표: 활동 제한 (사유 저장)');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000001b' and type = 'caution' and content like '활동 제한%'$$, 1, '대표: 제한하면 관리자 기록에 자동으로 남음');
select tests.expect_error($$select public.restrict_member('00000000-0000-0000-0000-00000000001b', '다시')$$, 'NOT_ACTIVE');
reset role;

-- 제한된 회원은 단가표를 못 본다
select tests.act_as('00000000-0000-0000-0000-00000000001b');
set role authenticated;
select tests.expect_count('select * from public.job_roles', 0, '제한된 회원: 단가표가 보이지 않음');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000001a');
set role authenticated;
select public.unrestrict_member('00000000-0000-0000-0000-00000000001b');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000001b' and status = 'active' and status_reason = ''$$, 1, '대표: 제한 해제');
select tests.expect_error($$select public.unrestrict_member('00000000-0000-0000-0000-00000000001c')$$, 'NOT_RESTRICTED');


-- 4. 대표: 관리자 기록 --------------------------------------------------------------

insert into public.member_notes (member_id, type, content) values ('00000000-0000-0000-0000-00000000001c', 'no_show', '10/3 당일 연락 두절');
insert into public.member_notes (member_id, type, content) values ('00000000-0000-0000-0000-00000000001c', 'late', '10/18 집합 10분 늦음');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000001c' and created_by = '00000000-0000-0000-0000-00000000001a'$$, 2, '대표: 기록 작성 (작성자 자동 기록)');
select tests.expect_count($$select 1 from public.member_note_counts where member_id = '00000000-0000-0000-0000-00000000001c' and no_show_count = 1 and late_count = 1$$, 1, '대표: 노쇼 1·지각 1 집계');
select tests.expect_error($$insert into public.member_notes (member_id, content, created_by) values ('00000000-0000-0000-0000-00000000001c', 'x', '00000000-0000-0000-0000-00000000001b')$$, 'permission denied%');
select tests.expect_error($$insert into public.member_notes (member_id, content) values ('00000000-0000-0000-0000-00000000001c', '   ')$$, '%violates check constraint%');
select tests.expect_error($$update public.member_notes set content = '고침'$$, 'permission denied%');
delete from public.member_notes where member_id = '00000000-0000-0000-0000-00000000001c' and type = 'late';
select tests.expect_count($$select 1 from public.member_note_counts where member_id = '00000000-0000-0000-0000-00000000001c' and late_count = 0$$, 1, '대표: 잘못 쓴 기록 삭제');

-- 승인하면 가입 기록이 자동으로 남는다
select public.approve_member('00000000-0000-0000-0000-00000000001d', 'general');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000001d' and content = '가입 승인 (일반) · 추천인 이도윤'$$, 1, '대표: 승인 시 가입·추천인 기록 자동 생성');


-- 5. 대표: 단가표 ------------------------------------------------------------------

insert into public.job_roles (name, description, default_rate, sort_order) values ('안내', '수험생 안내', 110000, 2);
select tests.expect_count('select * from public.job_roles', 3, '대표: 숨긴 것 포함 전체 단가표가 보임');
select tests.expect_error($$insert into public.job_roles (name, default_rate) values ('안내', 1)$$, '%duplicate key%');
select tests.expect_error($$insert into public.job_roles (name, default_rate) values ('음수', -1)$$, '%violates check constraint%');
update public.job_roles set default_rate = 120000 where name = '안내';
update public.job_roles set is_active = false where name = '감독관';
select tests.expect_count($$select 1 from public.job_roles where name = '안내' and default_rate = 120000$$, 1, '대표: 단가 수정');
select tests.expect_error($$delete from public.job_roles where name = '안내'$$, 'permission denied%');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000001c');
set role authenticated;
select tests.expect_count('select * from public.job_roles', 1, '회원: 숨긴 역할은 사라지고 새 역할만 보임');
reset role;

\echo 'ALL PHASE 1B RLS TESTS PASSED'
