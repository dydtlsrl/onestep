-- 10번 테스트: 시범 운영 지표 설정
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000006a'),  -- 대표
  ('00000000-0000-0000-0000-00000000006b');  -- 회원

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000006a', '대표7', '01095000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000006b', '이시범', '01095000002', 'member', 'active', 'core', now());

select tests.expect_count($$select 1 from public.app_settings where key = 'pilot' and value -> 'event_ids' = '[]'::jsonb$$, 1, '시범 설정: 처음 값');

-- 회원은 시범 설정을 보지도, 바꾸지도 못한다
select tests.act_as('00000000-0000-0000-0000-00000000006b');
set role authenticated;
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot'$$, 0, '회원: 시범 설정 안 보임');
select tests.expect_error($$select public.update_setting('pilot', '{"invited_count": 5}')$$, 'NOT_ADMIN');
reset role;

-- 대표: 모양이 틀린 값은 거절
select tests.act_as('00000000-0000-0000-0000-00000000006a');
set role authenticated;
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

-- 대표: 저장하면 버전이 오르고 이력이 남는다. 다른 설정 검사는 그대로다.
select public.update_setting('pilot', '{"event_ids": ["4b8f3a2e-1c5d-4e6f-8a9b-0c1d2e3f4a5b"], "invite_ids": [], "invited_count": 8, "baseline_minutes": null, "target_reduction_pct": 30, "ceo_responses": 1, "ceo_yes": 1, "member_responses": 0, "member_yes": 0, "incident_privacy": 0, "incident_pay": 0, "incident_outage": 0, "note": "시범 1차"}', '시범 대상');
select tests.expect_error($$select public.update_setting('tax', '{"type":"weird","threshold":true,"include_extras":true}')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.update_setting('nope', '{}')$$, 'SETTING_NOT_FOUND');
reset role;
select tests.expect_count($$select 1 from public.app_settings where key = 'pilot' and version = 2 and (value ->> 'invited_count')::int = 8$$, 1, '시범 설정: 저장, 버전 올림');
select tests.expect_count($$select 1 from public.app_settings_history where key = 'pilot'$$, 2, '시범 설정: 이력 남김');

\echo 'ALL PHASE 4 (PILOT) RLS TESTS PASSED'
