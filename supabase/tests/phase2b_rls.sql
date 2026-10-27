-- 2단계 보완 테스트: 여러 날짜 일정 (세팅일 대표 지정 + 진행일 공개 모집)
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 준비 데이터 ------------------------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000004a'),  -- 대표
  ('00000000-0000-0000-0000-00000000004b'),  -- 핵심 A
  ('00000000-0000-0000-0000-00000000004c'),  -- 일반 B
  ('00000000-0000-0000-0000-00000000004d');  -- 일반 C

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000004a', '대표5', '01093000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000004b', '한지민', '01093000002', 'member', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000004c', '오세린', '01093000003', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000004d', '유지호', '01093000004', 'member', 'active', 'general', now());


-- 1. 3일짜리 일정 만들기: 11/7 세팅(대표 지정), 11/8·11/9 진행(공개 모집) ---------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.create_event(
  '{"type":"interview","title":"공사 채용 면접","chat_link":"https://open.kakao.com/o/multi"}',
  '[{"day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2},{"role_name":"안내","pay_type":"hourly","rate":11000,"headcount":1}]},
    {"day_date":"2026-11-07","kind":"setup","recruit":"assign","start_time":"14:00","end_time":"18:00","positions":[{"role_name":"세팅 인력","pay_type":"hourly","rate":12000,"headcount":2}]},
    {"day_date":"2026-11-09","start_time":"08:30","end_time":"18:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2}]}]',
  '[{"type":"transport","tier":"all","amount":10000,"per_day":true},{"type":"regional","tier":"core","amount":30000,"per_day":false}]',
  '', ''
) as ev \gset
reset role;

select id as day_setup from public.event_days where event_id = :'ev' and kind = 'setup' \gset
select id as day8 from public.event_days where event_id = :'ev' and day_date = '2026-11-08' \gset
select id as day9 from public.event_days where event_id = :'ev' and day_date = '2026-11-09' \gset
select id as pos_setup from public.event_positions where day_id = :'day_setup' \gset
select id as pos8 from public.event_positions where day_id = :'day8' and role_name = '진행요원' \gset
select id as pos8_guide from public.event_positions where day_id = :'day8' and role_name = '안내' \gset
select id as pos9 from public.event_positions where day_id = :'day9' \gset

select tests.expect_count(format($$select 1 from public.events where id = %L and start_date = '2026-11-07' and end_date = '2026-11-09'$$, :'ev'), 1, '여러 날짜: 첫날·마지막 날을 날짜에서 계산');
select tests.expect_count(format($$select 1 from public.event_days where event_id = %L$$, :'ev'), 3, '여러 날짜: 날짜 3개 저장');
select tests.expect_count(format($$select 1 from public.event_positions where event_id = %L$$, :'ev'), 4, '여러 날짜: 날짜별 역할 저장');
select tests.expect_count($$select 1 from public.event_extra_rules where type = 'regional' and not per_day$$, 1, '추가 지급: 일정당 한 번 저장');
select tests.expect_true((select public.event_label(e) from public.events e where e.id = :'ev') = '11/7~11/9 공사 채용 면접', '알림 문구: 날짜 범위');

-- 임시저장 일정의 날짜는 회원에게 안 보인다
select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_count('select * from public.event_days', 0, '회원: 임시저장 일정의 날짜가 안 보임');
reset role;


-- 2. 공개와 날짜별 신청 --------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.set_event_status(:'ev', 'open_all');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_count('select * from public.event_days', 3, '회원: 공개 일정의 날짜가 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[]::uuid[])', :'ev'), 'CHOOSE_DAYS');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev', :'pos_setup'), 'INVALID_INPUT');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L, %L]::uuid[])', :'ev', :'pos8', :'pos8_guide'), 'INVALID_INPUT');
select public.apply_to_event(:'ev', array[:'pos8', :'pos9']::uuid[]);
select tests.expect_count('select * from public.applications', 2, '회원: 고른 날짜마다 신청');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev', :'pos9'), 'ALREADY_APPLIED_EVENT');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004c');
set role authenticated;
select public.apply_to_event(:'ev', array[:'pos9']::uuid[]);
select tests.expect_count('select * from public.applications', 1, '회원: 하루만 골라 신청');
reset role;

-- 모든 날짜 참여 필수
update public.events set all_days_required = true where id = :'ev';
select tests.act_as('00000000-0000-0000-0000-00000000004d');
set role authenticated;
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev', :'pos8'), 'ALL_DAYS_REQUIRED');
select public.apply_to_event(:'ev', array[:'pos8_guide', :'pos9']::uuid[]);
select tests.expect_count('select * from public.applications', 2, '전체 필수: 공개 모집 날짜를 모두 신청 (대표 지정 날짜는 빼고)');
select public.cancel_application(:'ev', '');
select tests.expect_count($$select * from public.applications where status = 'cancelled'$$, 2, '취소: 이 일정의 신청을 모두 취소');
select public.apply_to_event(:'ev', array[:'pos8', :'pos9']::uuid[]);
select tests.expect_count($$select * from public.applications where status = 'applied'$$, 2, '취소한 뒤 날짜를 다시 골라 신청');
reset role;
update public.events set all_days_required = false where id = :'ev';


-- 3. 선발: 대표 지정 날짜 추가, 날짜별 결정 --------------------------------------------------------

select id as a8 from public.applications where day_id = :'day8' and member_id = '00000000-0000-0000-0000-00000000004b' \gset
select id as a9 from public.applications where day_id = :'day9' and member_id = '00000000-0000-0000-0000-00000000004b' \gset
select id as b9 from public.applications where day_id = :'day9' and member_id = '00000000-0000-0000-0000-00000000004c' \gset

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.add_member_to_event(:'ev', :'pos_setup', '00000000-0000-0000-0000-00000000004b');
select tests.expect_count(format($$select 1 from public.applications where day_id = %L and status = 'selected' and added_by_admin$$, :'day_setup'), 1, '대표 지정 날짜: 확정자로 직접 추가');
select tests.expect_true(public.decide_applications(array[:'a8', :'b9']::uuid[], 'selected') = 2, '날짜별 확정');
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'rejected') = 1, '다른 날짜는 미선발');

select tests.expect_true(public.notify_selection_results(:'ev') = 2, '결과 알림: 날짜가 여러 개여도 한 사람에게 한 번');
select tests.expect_true(public.notify_selection_results(:'ev') = 0, '결과 알림: 다시 눌러도 같은 알림은 안 감');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000004b' and type = 'application.selected' and body like '확정: 11/7 세팅 세팅 인력, 11/8 진행 진행요원.%'$$, 1, '결과 알림: 확정된 날짜와 역할을 적음');

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'selected') = 1, '미선발 → 확정으로 바꿈');
select tests.expect_true(public.notify_selection_results(:'ev') = 1, '결과가 바뀐 날짜가 있으면 다시 알림');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000004b' and type like 'application.%'$$, 2, '확정자: 알림 2개 (처음 + 바뀐 뒤)');

select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_count('select * from public.event_chat_links', 1, '확정자: 톡방 링크가 보임');
select tests.expect_error(format('select public.cancel_application(%L)', :'ev'), 'ASK_ADMIN');
reset role;

-- 확정 알림을 받은 뒤 활동 제한되면 톡방 링크도 못 본다
update public.profiles set status = 'restricted' where id = '00000000-0000-0000-0000-00000000004b';
select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_count('select * from public.event_chat_links', 0, '제한된 확정자: 톡방 링크가 안 보임');
reset role;
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-00000000004b';


-- 4. 출석: 날짜별 기록 -------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.set_attendance(:'a8', 'late', 0);
select public.set_attendance(:'a9', 'no_show', 0);
reset role;
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000004b' and auto_source = 'attendance'$$, 2, '출석: 날짜마다 따로 자동 기록');
select tests.expect_count($$select 1 from public.member_notes where content = '11/9 진행 · 공사 채용 면접 · 노쇼'$$, 1, '출석: 기록에 날짜 이름');

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'waitlisted') = 1, '확정 → 대기로 바꿈');
reset role;
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000004b' and auto_source = 'attendance' and type = 'late'$$, 1, '확정을 푼 날짜의 기록만 지움 (다른 날짜 지각 기록은 그대로)');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000004b' and auto_source = 'attendance'$$, 1, '확정을 푼 날짜의 노쇼 기록은 지움');
select tests.expect_count($$select 1 from public.member_participation where member_id = '00000000-0000-0000-0000-00000000004b' and attended_count = 1$$, 1, '참여 횟수: 날짜가 여러 개여도 일정 1회');


-- 5. 수정: 신청자가 있는 날짜는 뺄 수 없다, 날짜 추가 ---------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
-- 신청자가 있는 11/9를 빼면 막는다
select tests.expect_error(format($$select public.update_event(%L, '{"type":"interview","title":"공사 채용 면접"}',
  '[{"id":"%s","day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","positions":[{"id":"%s","role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2},{"id":"%s","role_name":"안내","pay_type":"hourly","rate":11000,"headcount":1}]},
    {"id":"%s","day_date":"2026-11-07","kind":"setup","recruit":"assign","start_time":"14:00","end_time":"18:00","positions":[{"id":"%s","role_name":"세팅 인력","pay_type":"hourly","rate":12000,"headcount":2}]}]',
  '[]', '', '')$$, :'ev', :'day8', :'pos8', :'pos8_guide', :'day_setup', :'pos_setup'), 'POSITION_IN_USE');
-- 역할을 다른 날짜로 옮기면 막는다
select tests.expect_error(format($$select public.update_event(%L, '{"type":"interview","title":"공사 채용 면접"}',
  '[{"id":"%s","day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","positions":[{"id":"%s","role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2},{"id":"%s","role_name":"안내","pay_type":"hourly","rate":11000,"headcount":1},{"id":"%s","role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2}]},
    {"id":"%s","day_date":"2026-11-07","kind":"setup","recruit":"assign","start_time":"14:00","end_time":"18:00","positions":[{"id":"%s","role_name":"세팅 인력","pay_type":"hourly","rate":12000,"headcount":2}]},
    {"id":"%s","day_date":"2026-11-09","start_time":"08:30","end_time":"18:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2}]}]',
  '[]', '', '')$$, :'ev', :'day8', :'pos8', :'pos8_guide', :'pos9', :'day_setup', :'pos_setup', :'day9'), 'INVALID_INPUT');
select public.update_event(:'ev', '{"type":"interview","title":"공사 채용 면접","chat_link":"https://open.kakao.com/o/multi"}',
  format('[{"id":"%s","day_date":"2026-11-07","kind":"setup","recruit":"assign","start_time":"13:00","end_time":"18:00","positions":[{"id":"%s","role_name":"세팅 인력","pay_type":"hourly","rate":12000,"headcount":2}]},
    {"id":"%s","day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","positions":[{"id":"%s","role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":3},{"id":"%s","role_name":"안내","pay_type":"hourly","rate":11000,"headcount":1}]},
    {"id":"%s","day_date":"2026-11-09","start_time":"08:30","end_time":"18:00","positions":[{"id":"%s","role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":2}]},
    {"day_date":"2026-11-10","start_time":"08:30","end_time":"12:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":1}]}]',
    :'day_setup', :'pos_setup', :'day8', :'pos8', :'pos8_guide', :'day9', :'pos9')::jsonb,
  '[]', '', '');
reset role;
select tests.expect_count(format($$select 1 from public.event_days where event_id = %L$$, :'ev'), 4, '수정: 날짜 추가');
select tests.expect_count(format($$select 1 from public.events where id = %L and end_date = '2026-11-10'$$, :'ev'), 1, '수정: 마지막 날이 따라 바뀜');
select tests.expect_count(format($$select 1 from public.event_days where id = %L and start_time = '13:00' and sort_order = 1$$, :'day_setup'), 1, '수정: 날짜 순서와 시간 변경');
select tests.expect_count(format($$select 1 from public.applications where event_id = %L and status <> 'cancelled'$$, :'ev'), 6, '수정: 신청은 그대로 (A 3 · B 1 · C 2)');


-- 6. 긴 제목으로 공개, 긴 사유로 취소 (알림 길이 제한) ---------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.create_event(
  format('{"type":"event","title":"%s"}', repeat('가', 80))::jsonb,
  '[{"day_date":"2026-11-29","start_time":"09:00","end_time":"12:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":1}]},
    {"day_date":"2026-12-01","start_time":"09:00","end_time":"12:00","positions":[{"role_name":"진행요원","pay_type":"hourly","rate":12000,"headcount":1}]}]',
  '[]', '', ''
) as ev3 \gset
select public.set_event_status(:'ev3', 'open_core');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000004b' and type = 'event.open' and char_length(title) = 100 and title like '핵심 인력 먼저 공개: 11/29~12/1 가%'$$, 1, '긴 제목: 공개 알림 제목을 100자로 잘라 공개 성공');

select id as ev3_pos from public.event_positions where event_id = :'ev3' order by sort_order limit 1 \gset
select array_agg(id) as ev3_positions from public.event_positions where event_id = :'ev3' \gset
select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select public.apply_to_event(:'ev3', :'ev3_positions'::uuid[]);
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.set_event_status(:'ev3', 'cancelled', repeat('사', 450));
reset role;
select tests.expect_count(format($$select 1 from public.events where id = %L and status = 'cancelled' and char_length(cancel_reason) = 450$$, :'ev3'), 1, '긴 사유: 취소 성공, 일정에는 사유 전체 저장');
select tests.expect_count($$select 1 from public.notifications where type = 'event.cancelled' and user_id = '00000000-0000-0000-0000-00000000004b' and char_length(body) = 300$$, 1, '긴 사유: 취소 알림은 한 사람에게 한 번, 내용은 300자로');

\echo 'ALL PHASE 2B (MULTI-DAY) RLS TESTS PASSED'
