-- 13번 테스트: 기존 인력 명단, 명단 전용 초대 링크
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000008a'),  -- 대표
  ('00000000-0000-0000-0000-00000000008b'),  -- 활동 회원
  ('00000000-0000-0000-0000-00000000008c'),  -- 명단에 있는 사람 (단체 링크)
  ('00000000-0000-0000-0000-00000000008d'),  -- 명단에 없는 사람
  ('00000000-0000-0000-0000-00000000008e'),  -- 명단에 있는 사람 (개인 링크)
  ('00000000-0000-0000-0000-00000000008f');  -- 남의 개인 링크를 받은 사람

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000008a', '대표9', '01097000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000008b', '회원9', '01097000002', 'member', 'active', 'general', now());


-- 1. 명단은 대표만 ------------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000008b');
set role authenticated;
select tests.expect_error($$insert into public.roster (name, phone) values ('몰래', '01097000099')$$, '%row-level security%');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000008a');
set role authenticated;
insert into public.roster (list_name, name, phone, tier, memo) values
  ('핵심 인력', '명단가', '01097000003', 'core', '감독 10회'),
  ('핵심 인력', '명단나', '01097000005', 'core', ''),
  ('전체', '명단다', '01097000007', 'general', '');
select tests.expect_error($$insert into public.roster (name, phone) values ('중복', '01097000003')$$, '%duplicate key%');
select tests.expect_error($$insert into public.roster (name, phone) values ('번호틀림', '0212345678')$$, '%check%');
-- 같은 번호를 다시 넣으면 고쳐 쓴다 (엑셀을 고쳐 다시 붙여 넣을 때)
insert into public.roster (list_name, name, phone, tier) values ('핵심 인력', '명단가', '01097000003', 'general')
  on conflict (phone) do update set tier = excluded.tier;
select tests.expect_count($$select 1 from public.roster$$, 3, '대표: 명단 봄');
reset role;
select tests.expect_count($$select 1 from public.roster where phone = '01097000003' and tier = 'general'$$, 1, '같은 번호는 고쳐 씀');

select tests.act_as('00000000-0000-0000-0000-00000000008b');
set role authenticated;
select tests.expect_count($$select 1 from public.roster$$, 0, '회원: 명단 안 보임');
reset role;


-- 2. 단체 링크: 명단에 있는 번호만 ---------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000008a');
set role authenticated;
insert into public.invites (code, memo, max_uses, roster_only, roster_list) values ('rostertest_group_000001', '핵심 인력 명단', 2, true, '핵심 인력');
insert into public.invites (code, memo, max_uses, roster_id)
  select 'rostertest_personal_0001', '개인: 명단나', 1, id from public.roster where phone = '01097000005';
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000008d');
set role authenticated;
select tests.expect_error($$select public.submit_application('rostertest_group_000001', '모르는사람', '01097000004', '', 0, '', '', true)$$, 'NOT_ON_ROSTER');
-- 다른 명단(전체)에 있는 번호도 이 링크로는 안 됨
select tests.expect_error($$select public.submit_application('rostertest_group_000001', '명단다', '01097000007', '', 0, '', '', true)$$, 'NOT_ON_ROSTER');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000008c');
set role authenticated;
select public.submit_application('rostertest_group_000001', '명단가', '010-9700-0003', '', 0, '', '', true);
reset role;
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000008c' and status = 'pending'$$, 1, '명단 번호는 단체 링크로 가입');


-- 3. 개인 링크: 그 사람 번호만, 한 번만 --------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000008f');
set role authenticated;
select tests.expect_error($$select public.submit_application('rostertest_personal_0001', '다른사람', '01097000006', '', 0, '', '', true)$$, 'NOT_ON_ROSTER');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000008e');
set role authenticated;
select public.submit_application('rostertest_personal_0001', '명단나', '01097000005', '', 0, '', '', true);
reset role;
select tests.expect_count($$select 1 from public.invites where code = 'rostertest_personal_0001' and used_count = 1$$, 1, '개인 링크 사용');

select tests.act_as('00000000-0000-0000-0000-00000000008f');
set role authenticated;
select tests.expect_error($$select public.submit_application('rostertest_personal_0001', '명단나', '01097000005', '', 0, '', '', true)$$, 'INVITE_INVALID');
reset role;


-- 4. 명단에서 지우면 개인 링크도 꺼짐 ------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000008a');
set role authenticated;
insert into public.invites (code, memo, max_uses, roster_id)
  select 'rostertest_personal_0002', '개인: 명단다', 1, id from public.roster where phone = '01097000007';
delete from public.roster where phone = '01097000007';
reset role;
select tests.expect_count($$select 1 from public.invites where code = 'rostertest_personal_0002' and not is_active and roster_id is null$$, 1, '명단에서 지우면 개인 링크 꺼짐');

\echo 'ALL PHASE 6 (ROSTER) RLS TESTS PASSED'
