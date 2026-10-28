-- 10·11번 테스트: 개발자 화면 (시범 운영 지표 설정, 오류 기록)
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000006a'),  -- 대표
  ('00000000-0000-0000-0000-00000000006b'),  -- 회원
  ('00000000-0000-0000-0000-00000000006c');  -- 개발자 (회원 정보 없음)

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000006a', '대표7', '01095000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000006b', '이시범', '01095000002', 'member', 'active', 'core', now());

insert into public.developers (user_id, note) values ('00000000-0000-0000-0000-00000000006c', '개발자');

select tests.expect_count($$select 1 from public.app_settings where key = 'pilot' and value -> 'event_ids' = '[]'::jsonb$$, 1, '시범 설정: 처음 값');


-- 1. 시범 운영 지표 설정: 개발자만 보고 바꾼다 ---------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000006b');
set role authenticated;
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot'$$, 0, '회원: 시범 설정 안 보임');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": 5}')$$, 'NOT_DEVELOPER');
select tests.expect_true(not public.is_developer(), '회원: 개발자 아님');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000006a');
set role authenticated;
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot'$$, 0, '대표: 시범 설정 안 보임');
select tests.expect_count($$select 1 from public.app_settings where key = 'tax'$$, 1, '대표: 다른 설정은 봄');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'pilot'$$, 0, '대표: 시범 설정 이력 안 보임');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": 5}')$$, 'NOT_DEVELOPER');
select tests.expect_error($$select public.dev_pilot_source()$$, 'NOT_DEVELOPER');
select tests.expect_error($$select * from public.dev_errors(7)$$, 'NOT_DEVELOPER');
select public.update_setting('company', '{"name":"원스텝","ceo":"대표7"}', '대표는 그대로 저장');
reset role;
select tests.expect_count($$select 1 from public.app_settings where key = 'company' and value ->> 'ceo' = '대표7' and updated_by = '00000000-0000-0000-0000-00000000006a'$$, 1, '대표: 회사 정보 저장은 그대로');

select tests.act_as('00000000-0000-0000-0000-00000000006c');
set role authenticated;
select tests.expect_true(public.is_developer(), '개발자: 개발자임');
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot'$$, 1, '개발자: 시범 설정 봄');
select tests.expect_count($$select 1 from public.app_settings where key = 'tax'$$, 0, '개발자: 다른 설정은 안 보임');
select tests.expect_error($$select public.update_setting('tax', '{"type":"other","threshold":true,"include_extras":true}')$$, 'NOT_ADMIN');
select tests.expect_count($$select 1 from public.profiles$$, 0, '개발자: 회원 표 직접 못 읽음');
select tests.expect_error($$select * from public.app_errors$$, '%permission denied%');
select tests.expect_error($$select public.update_setting('pilot', '{"event_ids": "x"}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"event_ids": ["not-a-uuid"]}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"event_ids": [1]}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": -1}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": 1.5}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": "5"}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"target_reduction_pct": 101}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"note": 3}')$$, 'INVALID_INPUT');
select tests.expect_error(format($$select public.update_setting('pilot', %L)$$, jsonb_build_object('note', repeat('가', 1001))), 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('pilot', '{"unknown": 1}')$$, 'INVALID_INPUT');
select public.update_setting('pilot', '{"event_ids": ["4b8f3a2e-1c5d-4e6f-8a9b-0c1d2e3f4a5b"], "invite_ids": [], "invited_count": 8, "baseline_minutes": null, "target_reduction_pct": 30, "ceo_responses": 1, "ceo_yes": 1, "member_responses": 0, "member_yes": 0, "incident_privacy": 0, "incident_pay": 0, "incident_outage": 0, "note": "시범 1차"}', '시범 대상');
select tests.expect_true((public.dev_pilot_source() -> 'members') @> '[{"name": "이시범"}]'::jsonb, '개발자: 지표 재료에 회원 있음');
select tests.expect_true(not ((public.dev_pilot_source() -> 'members') @> '[{"name": "대표7"}]'::jsonb), '개발자: 지표 재료에 대표 없음');
select tests.expect_true((public.dev_pilot_source() -> 'members' -> 0) ? 'phone' = false, '개발자: 지표 재료에 전화번호 없음');
reset role;
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot' and version = 2 and (value ->> 'invited_count')::int = 8 and updated_by is null$$, 1, '시범 설정: 저장, 버전 올림 (회원 정보 없는 개발자)');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'pilot'$$, 2, '시범 설정: 이력 남김');
select tests.expect_count($$select 1 from public.audit_logs where action = 'settings.pilot' and actor_id = '00000000-0000-0000-0000-00000000006c'$$, 1, '시범 설정: 기록에 개발자');


-- 2. 오류 기록: 누구나 남기고, 개발자만 본다 ------------------------------------------------------

select tests.act_as(null);
set role anon;
select public.log_app_error('auth', 'error', 'bad_oauth_state', '세션 교환 실패', '/auth/callback', '', 'Mozilla/5.0 KAKAOTALK', '{}');
select tests.expect_error($$select * from public.app_errors$$, '%permission denied%');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000006b');
set role authenticated;
select public.log_app_error('action', 'warn', 'DEADLINE_PASSED', '신청이 마감되었어요.', '/events/x', '', 'iPhone', '{"action": "apply"}');
select public.log_app_error('weird', 'loud', repeat('c', 300), repeat('m', 3000), '/x', '', '', '"not an object"');
select tests.expect_error($$select * from public.dev_errors(7)$$, 'NOT_DEVELOPER');
select tests.expect_error($$select public.dev_resolve_errors(array[1::bigint], true, '')$$, 'NOT_DEVELOPER');
reset role;

select tests.expect_count($$select 1 from public.app_errors where user_id is null and source = 'auth'$$, 1, '오류: 로그인 전에도 남음');
select tests.expect_count($$select 1 from public.app_errors where user_id = '00000000-0000-0000-0000-00000000006b'$$, 2, '오류: 로그인한 사람은 누구인지 남음');
select tests.expect_count($$select 1 from public.app_errors where source = 'server' and level = 'error' and char_length(code) = 100 and char_length(message) = 1000 and detail = '{}'::jsonb$$, 1, '오류: 틀린 값은 고치고 길이를 자름');

-- 한 사람이 1분에 30건을 넘게 남기면 건너뛴다
select tests.act_as('00000000-0000-0000-0000-00000000006b');
set role authenticated;
select public.log_app_error('client', 'error', 'loop', '', '/') from generate_series(1, 40);
reset role;
select tests.expect_count($$select 1 from public.app_errors where user_id = '00000000-0000-0000-0000-00000000006b'$$, 30, '오류: 한 사람 1분 30건까지');

select tests.act_as('00000000-0000-0000-0000-00000000006c');
set role authenticated;
select tests.expect_count($$select 1 from public.dev_errors(7) where user_name = '이시범' and user_role = 'member'$$, 30, '개발자: 오류 목록에 회원 이름');
select tests.expect_count($$select 1 from public.dev_errors(7) where user_id is null$$, 1, '개발자: 로그인 전 오류도 봄');
select public.dev_resolve_errors(array(select id from public.dev_errors(7) where code = 'DEADLINE_PASSED'), true, '안내 문구로 충분');
select tests.expect_count($$select 1 from public.dev_errors(7) where resolved_at is not null and resolved_note = '안내 문구로 충분'$$, 1, '개발자: 처리함 표시');
select public.dev_resolve_errors(array(select id from public.dev_errors(7) where code = 'DEADLINE_PASSED'), false);
select tests.expect_count($$select 1 from public.dev_errors(7) where resolved_at is not null$$, 0, '개발자: 처리함 되돌리기');
select tests.expect_error($$select public.dev_resolve_errors(array[1::bigint], true, repeat('x', 301))$$, 'INVALID_INPUT');
reset role;

\echo 'ALL PHASE 4 (DEV CONSOLE) RLS TESTS PASSED'
