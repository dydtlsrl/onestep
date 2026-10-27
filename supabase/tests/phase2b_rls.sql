-- 2단계 보완 테스트: 여러 날짜 일정, 날짜만 골라 신청, 역할·단가는 대표가 사람마다
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


-- 1. 3일짜리 일정: 11/7 세팅, 11/8·11/9 진행 ------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.create_event(
  '{"type":"interview","title":"공사 채용 면접","chat_link":"https://open.kakao.com/o/multi"}',
  '[{"day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","headcount":3,"pay_type":"hourly","rate":12000},
    {"day_date":"2026-11-07","kind":"setup","start_time":"14:00","end_time":"18:00","headcount":2,"pay_type":"hourly","rate":11000,"min_paid_hours":4},
    {"day_date":"2026-11-09","start_time":"08:30","end_time":"18:00","headcount":2,"pay_type":"daily","rate":110000,"overtime_rate":15000,"min_paid_hours":3}]',
  '[{"type":"transport","tier":"all","amount":10000,"per_day":true},{"type":"regional","tier":"core","amount":30000,"per_day":false}]',
  '', ''
) as ev \gset
reset role;

select id as day_setup from public.event_days where event_id = :'ev' and kind = 'setup' \gset
select id as day8 from public.event_days where event_id = :'ev' and day_date = '2026-11-08' \gset
select id as day9 from public.event_days where event_id = :'ev' and day_date = '2026-11-09' \gset

select tests.expect_count(format($$select 1 from public.events where id = %L and start_date = '2026-11-07' and end_date = '2026-11-09'$$, :'ev'), 1, '여러 날짜: 첫날·마지막 날을 날짜에서 계산');
select tests.expect_count(format($$select 1 from public.event_days where event_id = %L$$, :'ev'), 3, '여러 날짜: 날짜 3개 저장');
select tests.expect_count(format($$select 1 from public.event_days where id = %L and rate = 11000 and min_paid_hours = 4 and headcount = 2$$, :'day_setup'), 1, '세팅일: 시급 11,000원·최소 4시간');
select tests.expect_count(format($$select 1 from public.event_days where id = %L and pay_type = 'daily' and overtime_rate = 15000 and min_paid_hours is null$$, :'day9'), 1, '일급 날짜: 초과 금액만 저장');
select tests.expect_count($$select 1 from public.event_extra_rules where type = 'regional' and not per_day$$, 1, '추가 지급: 일정당 한 번 저장');
select tests.expect_true((select public.event_label(e) from public.events e where e.id = :'ev') = '11/7~11/9 공사 채용 면접', '알림 문구: 날짜 범위');

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
select tests.expect_count('select * from public.event_days', 3, '회원: 공개 일정의 날짜가 보임 (세팅일 포함)');
select tests.expect_error(format('select public.apply_to_event(%L, array[]::uuid[])', :'ev'), 'CHOOSE_DAYS');
select tests.expect_error(format($$select public.apply_to_event(%L, array['00000000-0000-0000-0000-000000000000']::uuid[])$$, :'ev'), 'INVALID_INPUT');
select public.apply_to_event(:'ev', array[:'day_setup', :'day8', :'day9']::uuid[]);
select tests.expect_count('select * from public.applications', 3, '회원: 세팅일·진행일 모두 날짜만 골라 신청');
select tests.expect_count($$select * from public.applications where role_name = '' and rate_override is null$$, 3, '신청: 역할·개별 단가는 비어 있음');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev', :'day9'), 'ALREADY_APPLIED_EVENT');
select tests.expect_count(format('select * from public.day_selected_counts(array[%L]::uuid[])', :'ev'), 3, '회원: 날짜별 확정 인원이 보임');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004c');
set role authenticated;
select public.apply_to_event(:'ev', array[:'day9']::uuid[]);
select tests.expect_count('select * from public.applications', 1, '회원: 하루만 골라 신청');
reset role;

-- 모든 날짜 참여 필수
update public.events set all_days_required = true where id = :'ev';
select tests.act_as('00000000-0000-0000-0000-00000000004d');
set role authenticated;
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev', :'day8'), 'ALL_DAYS_REQUIRED');
select public.apply_to_event(:'ev', array[:'day_setup', :'day8', :'day9']::uuid[]);
select public.cancel_application(:'ev', '');
select tests.expect_count($$select * from public.applications where status = 'cancelled'$$, 3, '취소: 이 일정의 신청을 모두 취소');
reset role;
update public.events set all_days_required = false where id = :'ev';
select tests.act_as('00000000-0000-0000-0000-00000000004d');
set role authenticated;
select public.apply_to_event(:'ev', array[:'day8', :'day9']::uuid[]);
select tests.expect_count($$select * from public.applications where status = 'applied'$$, 2, '취소한 뒤 날짜를 다시 골라 신청');
reset role;


-- 3. 선발, 역할·개별 단가, 회원 기본 시급 --------------------------------------------------------------

select id as a_setup from public.applications where day_id = :'day_setup' and member_id = '00000000-0000-0000-0000-00000000004b' \gset
select id as a8 from public.applications where day_id = :'day8' and member_id = '00000000-0000-0000-0000-00000000004b' \gset
select id as a9 from public.applications where day_id = :'day9' and member_id = '00000000-0000-0000-0000-00000000004b' \gset
select id as b9 from public.applications where day_id = :'day9' and member_id = '00000000-0000-0000-0000-00000000004c' \gset

select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_error(format($$select public.set_application_detail(%L, '감독관', null)$$, :'a8'), 'NOT_ADMIN');
select tests.expect_error($$select public.set_member_rate('00000000-0000-0000-0000-00000000004b', 20000)$$, 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select tests.expect_error(format($$select public.set_application_detail(%L, '', -1)$$, :'a8'), 'INVALID_INPUT');
select public.set_application_detail(:'a8', ' 감독관 ', 14000);
select public.set_member_rate('00000000-0000-0000-0000-00000000004b', 13000);
select public.add_member_to_event(:'ev', :'day_setup', '00000000-0000-0000-0000-00000000004c');
select tests.expect_count(format($$select 1 from public.applications where day_id = %L and member_id = '00000000-0000-0000-0000-00000000004c' and status = 'selected' and added_by_admin$$, :'day_setup'), 1, '대표: 신청 안 한 날짜에 직접 추가');
select tests.expect_true(public.decide_applications(array[:'a_setup', :'a8', :'b9']::uuid[], 'selected') = 3, '날짜별 확정');
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'rejected') = 1, '다른 날짜는 미선발');
select tests.expect_true(public.notify_selection_results(:'ev') = 2, '결과 알림: 날짜가 여러 개여도 한 사람에게 한 번');
reset role;
select tests.expect_count(format($$select 1 from public.applications where id = %L and role_name = '감독관' and rate_override = 14000$$, :'a8'), 1, '역할 이름(앞뒤 공백 제거)과 개별 단가 저장');
select tests.expect_count($$select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000004b' and default_rate = 13000$$, 1, '회원 기본 시급 저장');
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000004b' and type = 'application.selected' and body like '확정: 11/7 세팅, 11/8 진행 감독관.%'$$, 1, '결과 알림: 확정된 날짜와 정해진 역할을 적음');

select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select tests.expect_count('select * from public.event_chat_links', 1, '확정자: 톡방 링크가 보임');
select tests.expect_count($$select 1 from public.profiles where default_rate = 13000$$, 1, '회원: 자기 기본 시급은 볼 수 있음');
select tests.expect_error($$update public.profiles set default_rate = 99999 where id = '00000000-0000-0000-0000-00000000004b'$$, 'permission denied%');
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
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'selected') = 1, '미선발 → 확정으로 바꿈');
select public.set_attendance(:'a8', 'late', 0);
select public.set_attendance(:'a9', 'no_show', 0);
reset role;
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000004b' and auto_source = 'attendance'$$, 2, '출석: 날짜마다 따로 자동 기록');
select tests.expect_count($$select 1 from public.member_notes where content = '11/9 진행 · 공사 채용 면접 · 노쇼'$$, 1, '출석: 기록에 날짜 이름');

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select tests.expect_true(public.decide_applications(array[:'a9']::uuid[], 'waitlisted') = 1, '확정 → 대기로 바꿈');
reset role;
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000004b' and auto_source = 'attendance'$$, 1, '확정을 푼 날짜의 기록만 지움');
select tests.expect_count($$select 1 from public.member_participation where member_id = '00000000-0000-0000-0000-00000000004b' and attended_count = 1$$, 1, '참여 횟수: 날짜가 여러 개여도 일정 1회');


-- 5. 수정: 신청이 있는 날짜는 뺄 수 없다, 날짜 추가 ---------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select tests.expect_error(format($$select public.update_event(%L, '{"type":"interview","title":"공사 채용 면접"}',
  '[{"id":"%s","day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","headcount":3,"pay_type":"hourly","rate":12000},
    {"id":"%s","day_date":"2026-11-07","kind":"setup","start_time":"14:00","end_time":"18:00","headcount":2,"pay_type":"hourly","rate":11000}]',
  '[]', '', '')$$, :'ev', :'day8', :'day_setup'), 'DAY_IN_USE');
select public.update_event(:'ev', '{"type":"interview","title":"공사 채용 면접","chat_link":"https://open.kakao.com/o/multi"}',
  format('[{"id":"%s","day_date":"2026-11-07","kind":"setup","start_time":"13:00","end_time":"18:00","headcount":2,"pay_type":"hourly","rate":11000,"min_paid_hours":4},
    {"id":"%s","day_date":"2026-11-08","start_time":"08:30","end_time":"18:00","headcount":4,"pay_type":"hourly","rate":12000},
    {"id":"%s","day_date":"2026-11-09","start_time":"08:30","end_time":"18:00","headcount":2,"pay_type":"daily","rate":110000,"overtime_rate":15000},
    {"day_date":"2026-11-10","start_time":"08:30","end_time":"12:00","headcount":1,"pay_type":"hourly","rate":11000}]',
    :'day_setup', :'day8', :'day9')::jsonb,
  '[]', '', '');
reset role;
select tests.expect_count(format($$select 1 from public.event_days where event_id = %L$$, :'ev'), 4, '수정: 날짜 추가');
select tests.expect_count(format($$select 1 from public.events where id = %L and end_date = '2026-11-10'$$, :'ev'), 1, '수정: 마지막 날이 따라 바뀜');
select tests.expect_count(format($$select 1 from public.event_days where id = %L and start_time = '13:00' and sort_order = 1$$, :'day_setup'), 1, '수정: 날짜 순서와 시간 변경');
select tests.expect_count(format($$select 1 from public.applications where id = %L and role_name = '감독관' and rate_override = 14000$$, :'a8'), 1, '수정: 신청의 역할·개별 단가는 그대로');


-- 6. 긴 제목으로 공개, 긴 사유로 취소 (알림 길이 제한) ---------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.create_event(
  format('{"type":"event","title":"%s"}', repeat('가', 80))::jsonb,
  '[{"day_date":"2026-11-29","start_time":"09:00","end_time":"12:00","headcount":1,"pay_type":"hourly","rate":11000},
    {"day_date":"2026-12-01","start_time":"09:00","end_time":"12:00","headcount":1,"pay_type":"hourly","rate":11000}]',
  '[]', '', ''
) as ev3 \gset
select public.set_event_status(:'ev3', 'open_core');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000004b' and type = 'event.open' and char_length(title) = 100 and title like '핵심 인력 먼저 공개: 11/29~12/1 가%'$$, 1, '긴 제목: 공개 알림 제목을 100자로 잘라 공개 성공');

select array_agg(id) as ev3_days from public.event_days where event_id = :'ev3' \gset
select tests.act_as('00000000-0000-0000-0000-00000000004b');
set role authenticated;
select public.apply_to_event(:'ev3', :'ev3_days'::uuid[]);
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.set_event_status(:'ev3', 'cancelled', repeat('사', 450));
reset role;
select tests.expect_count(format($$select 1 from public.events where id = %L and status = 'cancelled' and char_length(cancel_reason) = 450$$, :'ev3'), 1, '긴 사유: 취소 성공, 일정에는 사유 전체 저장');
select tests.expect_count($$select 1 from public.notifications where type = 'event.cancelled' and user_id = '00000000-0000-0000-0000-00000000004b' and char_length(body) = 300$$, 1, '긴 사유: 취소 알림은 한 사람에게 한 번, 내용은 300자로');


-- 7. 공통 기본 시급 --------------------------------------------------------------------------

select tests.expect_true((select (value ->> 'default_hourly_rate')::integer from public.app_settings where key = 'pay_rules') = 11000, '기본 시급: 처음 11,000원');
select tests.act_as('00000000-0000-0000-0000-00000000004a');
set role authenticated;
select public.update_pay_rules(1.5, 60, 'floor', 0, '시급 인상', 11500);
select public.update_pay_rules(1.5, 60, 'floor', 0, '다른 값만 바꿈');
reset role;
select tests.expect_true((select (value ->> 'default_hourly_rate')::integer from public.app_settings where key = 'pay_rules') = 11500, '기본 시급: 바꾼 값 유지 (비우면 그대로)');

-- 화면이 쓰는 외래 키 이름 (applications → profiles 연결에 이름을 붙여 부른다)
select tests.expect_count($$select 1 from pg_constraint where conname = 'applications_member_id_fkey'$$, 1, '외래 키 이름: applications_member_id_fkey');

\echo 'ALL PHASE 2B (MULTI-DAY) RLS TESTS PASSED'
