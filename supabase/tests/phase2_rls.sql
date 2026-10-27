-- 2단계 권한·흐름 테스트 (일정 공개, 신청·선발, 알림, 출석 확인). 하루짜리 일정으로 확인한다.
-- 여러 날짜 일정은 phase2b_rls.sql
-- 실행: npm run db:test

\set ON_ERROR_STOP on
set client_min_messages = notice;

-- 준비 데이터 ------------------------------------------------------------------

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000003a'),  -- 대표
  ('00000000-0000-0000-0000-00000000003b'),  -- 핵심
  ('00000000-0000-0000-0000-00000000003c'),  -- 일반
  ('00000000-0000-0000-0000-00000000003d'),  -- 일반 2
  ('00000000-0000-0000-0000-00000000003e'),  -- 승인 대기
  ('00000000-0000-0000-0000-00000000003f');  -- 제한

insert into public.profiles (id, name, phone, role, status, tier, privacy_agreed_at) values
  ('00000000-0000-0000-0000-00000000003a', '대표4', '01092000001', 'admin', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000003b', '이도윤', '01092000002', 'member', 'active', 'core', now()),
  ('00000000-0000-0000-0000-00000000003c', '박서연', '01092000003', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000003d', '강민재', '01092000004', 'member', 'active', 'general', now()),
  ('00000000-0000-0000-0000-00000000003e', '정유나', '01092000005', 'member', 'pending', 'general', now()),
  ('00000000-0000-0000-0000-00000000003f', '서지훈', '01092000006', 'member', 'restricted', 'general', now());


-- 1. 일정 만들기 -------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_error($$select public.create_event('{}', '[{}]', '[]', '', '')$$, 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_error($$select public.create_event('{"type":"written_exam","title":"x"}', '[]', '[]', '', '')$$, 'DAYS_REQUIRED');
select tests.expect_error($$select public.create_event('{"type":"written_exam","title":"x"}', '[{"day_date":"2026-11-08","start_time":"08:00","end_time":"13:00","positions":[]}]', '[]', '', '')$$, 'POSITIONS_REQUIRED');
select tests.expect_error($$select public.create_event('{"type":"written_exam","title":"x"}', '[{"day_date":"2026-11-08","start_time":"13:00","end_time":"08:00","positions":[{"role_name":"감독관","pay_type":"hourly","rate":12000,"headcount":1}]}]', '[]', '', '')$$, 'INVALID_INPUT');
select tests.expect_error($$select public.create_event('{"type":"written_exam","title":"x","chat_link":"http://x"}', '[{"day_date":"2026-11-08","start_time":"08:00","end_time":"13:00","positions":[{"role_name":"감독관","pay_type":"hourly","rate":12000,"headcount":1}]}]', '[]', '', '')$$, 'INVALID_INPUT');
select tests.expect_count('select * from public.events', 0, '잘못 만든 일정은 남지 않음');

select public.create_event(
  '{"type":"written_exam","title":"대기업 공채 필기시험","location_name":"OO중학교","address":"서울 송파구","notice":"신분증 지참","chat_link":"https://open.kakao.com/o/test","pay_date":"2026-11-15"}',
  '[{"day_date":"2026-11-08","gather_time":"07:30","start_time":"08:00","end_time":"13:00","positions":[{"role_name":"감독관","pay_type":"hourly","rate":12000,"min_paid_hours":4,"overtime_rate":99999,"headcount":2},{"role_name":"안내","pay_type":"daily","rate":110000,"min_paid_hours":3,"overtime_rate":15000,"headcount":1}]}]',
  '[{"type":"transport","tier":"all","amount":10000},{"type":"regional","tier":"core","amount":30000},{"type":"regional","tier":"general","amount":0}]',
  '고객사A', '내부 메모'
) as ev1 \gset
reset role;

select id as pos_sup from public.event_positions where event_id = :'ev1' and role_name = '감독관' \gset
select id as pos_guide from public.event_positions where event_id = :'ev1' and role_name = '안내' \gset
select id as day1 from public.event_days where event_id = :'ev1' \gset

select tests.expect_count($$select 1 from public.events where status = 'draft' and title = '대기업 공채 필기시험' and start_date = '2026-11-08' and end_date = '2026-11-08'$$, 1, '대표: 임시저장 상태로 생성, 날짜는 1일차에서');
select tests.expect_count($$select 1 from public.event_positions where role_name = '감독관' and pay_type = 'hourly' and min_paid_hours = 4 and overtime_rate is null and sort_order = 1$$, 1, '시급 역할: 최소 보장 시간만 저장 (초과 금액은 버림)');
select tests.expect_count($$select 1 from public.event_positions where role_name = '안내' and pay_type = 'daily' and overtime_rate = 15000 and min_paid_hours is null$$, 1, '일급 역할: 초과 금액만 저장');
select tests.expect_count($$select 1 from public.event_extra_rules$$, 2, '추가 지급: 0원은 저장하지 않음');


-- 2. 임시저장 일정은 회원에게 안 보인다 --------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_count('select * from public.events', 0, '핵심 회원: 임시저장 일정이 안 보임');
select tests.expect_count('select * from public.event_positions', 0, '핵심 회원: 임시저장 일정의 역할이 안 보임');
select tests.expect_count('select * from public.event_internal', 0, '회원: 고객사 정보는 안 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_sup'), 'EVENT_NOT_OPEN');
reset role;


-- 3. 핵심 먼저 공개 ----------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_error(format($$select public.set_event_status(%L, 'completed')$$, :'ev1'), 'INVALID_TRANSITION');
select public.set_event_status(:'ev1', 'open_core');
reset role;

select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000003b' and type = 'event.open'$$, 1, '핵심 공개: 핵심 회원에게 알림');
select tests.expect_count($$select 1 from public.notifications where user_id in ('00000000-0000-0000-0000-00000000003c', '00000000-0000-0000-0000-00000000003a') and type = 'event.open'$$, 0, '핵심 공개: 일반 회원·대표에게는 알림 없음');

select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select tests.expect_count('select * from public.events', 0, '일반 회원: 핵심 공개 일정이 안 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_sup'), 'EVENT_NOT_OPEN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_count('select * from public.events', 1, '핵심 회원: 핵심 공개 일정이 보임');
select tests.expect_count('select * from public.event_positions', 2, '핵심 회원: 모집 역할이 보임');
select tests.expect_count('select * from public.event_extra_rules', 2, '핵심 회원: 교통비·지방비가 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', '00000000-0000-0000-0000-000000000000'), 'INVALID_INPUT');
select public.apply_to_event(:'ev1', array[:'pos_sup']::uuid[]);
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_sup'), 'ALREADY_APPLIED_EVENT');
select tests.expect_count('select * from public.applications', 1, '핵심 회원: 자기 신청이 보임');
select tests.expect_count($$select * from public.app_settings where key = 'pay_rules'$$, 1, '활동 회원: 보수 계산 규칙을 볼 수 있음');
reset role;


-- 4. 전체 공개 -------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select public.set_event_status(:'ev1', 'open_all');
reset role;

select tests.expect_count($$select 1 from public.notifications where type = 'event.open' and user_id in ('00000000-0000-0000-0000-00000000003c', '00000000-0000-0000-0000-00000000003d')$$, 2, '전체 공개: 일반 회원들에게 알림');
select tests.expect_count($$select 1 from public.notifications where type = 'event.open' and user_id = '00000000-0000-0000-0000-00000000003b'$$, 1, '전체 공개: 핵심 회원은 알림을 두 번 받지 않음');
select tests.expect_count($$select 1 from public.notifications where user_id in ('00000000-0000-0000-0000-00000000003e', '00000000-0000-0000-0000-00000000003f')$$, 0, '승인 대기·제한 회원은 알림 없음');

select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select tests.expect_count('select * from public.events', 1, '일반 회원: 전체 공개 일정이 보임');
select public.apply_to_event(:'ev1', array[:'pos_sup']::uuid[]);
select tests.expect_count('select * from public.applications', 1, '일반 회원: 다른 사람 신청은 안 보임');
select tests.expect_count(format('select * from public.position_selected_counts(array[%L]::uuid[])', :'ev1'), 2, '일반 회원: 역할별 확정 인원(남은 자리)은 볼 수 있음');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003d');
set role authenticated;
select public.apply_to_event(:'ev1', array[:'pos_guide']::uuid[]);
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003e');
set role authenticated;
select tests.expect_count('select * from public.events', 0, '승인 대기: 일정이 안 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_sup'), 'NOT_ACTIVE_MEMBER');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000003f');
set role authenticated;
select tests.expect_count('select * from public.events', 0, '제한 회원: 일정이 안 보임');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_sup'), 'NOT_ACTIVE_MEMBER');
select tests.expect_count($$select * from public.app_settings$$, 0, '제한 회원: 보수 계산 규칙도 안 보임');
reset role;


-- 5. 신청 취소와 마감 ----------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003d');
set role authenticated;
select public.cancel_application(:'ev1', '일정이 겹침');
select tests.expect_count($$select 1 from public.applications where status = 'cancelled' and cancel_reason = '일정이 겹침'$$, 1, '회원: 선발 전에는 직접 취소');
select public.apply_to_event(:'ev1', array[:'pos_guide']::uuid[]);
select tests.expect_count($$select 1 from public.applications where status = 'applied'$$, 1, '회원: 취소한 뒤 다시 신청');
reset role;

update public.events set apply_deadline = now() - interval '1 minute' where id = :'ev1';
select tests.act_as('00000000-0000-0000-0000-00000000003d');
set role authenticated;
select public.cancel_application(:'ev1', '');
select tests.expect_error(format('select public.apply_to_event(%L, array[%L]::uuid[])', :'ev1', :'pos_guide'), 'DEADLINE_PASSED');
reset role;
update public.events set apply_deadline = null where id = :'ev1';


-- 6. 선발 -----------------------------------------------------------------------------

select id as app_core from public.applications where event_id = :'ev1' and member_id = '00000000-0000-0000-0000-00000000003b' \gset
select id as app_general from public.applications where event_id = :'ev1' and member_id = '00000000-0000-0000-0000-00000000003c' \gset
select id as app_general2 from public.applications where event_id = :'ev1' and member_id = '00000000-0000-0000-0000-00000000003d' \gset

select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_error(format($$select public.decide_applications(array[%L]::uuid[], 'selected')$$, :'app_core'), 'NOT_ADMIN');
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_count('select * from public.applications', 3, '대표: 모든 신청이 보임');
select tests.expect_count('select * from public.event_internal', 1, '대표: 고객사 정보가 보임');
select tests.expect_error(format($$select public.decide_applications(array[%L]::uuid[], 'cancelled')$$, :'app_core'), 'INVALID_INPUT');
select tests.expect_true(public.decide_applications(array[:'app_core'::uuid], 'selected') = 1, '대표: 핵심 회원 확정');
select tests.expect_true(public.decide_applications(array[:'app_general'::uuid], 'rejected') = 1, '대표: 일반 회원 미선발');
select tests.expect_true(public.decide_applications(array[:'app_general2'::uuid], 'selected') = 0, '대표: 취소한 신청은 바꾸지 않음');
reset role;

-- 확정된 뒤에는 회원이 직접 취소할 수 없다
select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_error(format('select public.cancel_application(%L)', :'ev1'), 'ASK_ADMIN');
select tests.expect_count('select * from public.event_chat_links', 0, '확정자: 결과 알림 전에는 톡방 링크가 안 보임');
select tests.expect_error('select chat_link from public.events', 'column "chat_link" does not exist');
reset role;


-- 7. 선발 결과 알림 ------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_true(public.notify_selection_results(:'ev1') = 2, '대표: 확정·미선발 2명에게 알림');
select tests.expect_true(public.notify_selection_results(:'ev1') = 0, '대표: 다시 눌러도 같은 알림은 보내지 않음');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000003b' and type = 'application.selected'$$, 1, '확정자: 확정 알림');
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000003c' and type = 'application.rejected'$$, 1, '미선발자: 결과 알림');

select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_count($$select 1 from public.event_chat_links where chat_link = 'https://open.kakao.com/o/test'$$, 1, '확정자: 확정 알림 뒤 톡방 링크가 보임');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select tests.expect_count('select * from public.event_chat_links', 0, '미선발자: 톡방 링크가 안 보임');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_count('select * from public.event_chat_links', 1, '대표: 톡방 링크가 보임');
reset role;


-- 8. 직접 추가와 출석 확인 ------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_error(format($$select public.add_member_to_event(%L, %L, '00000000-0000-0000-0000-00000000003e')$$, :'ev1', :'pos_guide'), 'MEMBER_NOT_FOUND');
select public.add_member_to_event(:'ev1', :'pos_guide', '00000000-0000-0000-0000-00000000003d');
select tests.expect_count($$select 1 from public.applications where member_id = '00000000-0000-0000-0000-00000000003d' and status = 'selected' and added_by_admin$$, 1, '대표: 취소했던 회원을 직접 확정');

select tests.expect_error(format($$select public.set_attendance(%L, 'attended', 0)$$, :'app_general'), 'NOT_SELECTED');
select tests.expect_error(format($$select public.set_attendance(%L, 'attended', -5)$$, :'app_core'), 'INVALID_INPUT');
select public.set_attendance(:'app_core', 'attended', 60);
select public.set_attendance(:'app_general2', 'no_show', 30);
reset role;

select tests.expect_count($$select 1 from public.applications where member_id = '00000000-0000-0000-0000-00000000003b' and attendance = 'attended' and overtime_minutes = 60$$, 1, '출석: 참석과 초과 60분 저장');
select tests.expect_count($$select 1 from public.applications where member_id = '00000000-0000-0000-0000-00000000003d' and attendance = 'no_show' and overtime_minutes = 0$$, 1, '출석: 노쇼는 초과 시간 0');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000003d' and type = 'no_show' and auto_source = 'attendance' and content = '11/8 진행 · 대기업 공채 필기시험 · 노쇼' and application_id is not null$$, 1, '출석: 노쇼가 관리자 기록에 자동으로 남음');

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select public.set_attendance(:'app_general2', 'late', 0);
reset role;
select tests.expect_count($$select type from public.member_notes where member_id = '00000000-0000-0000-0000-00000000003d' and auto_source = 'attendance'$$, 1, '출석: 바꾸면 자동 기록도 하나만 남음');
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000003d' and type = 'late' and auto_source = 'attendance'$$, 1, '출석: 노쇼 → 지각으로 바뀜');

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_count($$select 1 from public.member_participation where attended_count = 1$$, 2, '대표: 참석·지각한 회원의 참여 횟수');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000003b');
set role authenticated;
select tests.expect_count($$select 1 from public.member_participation$$, 1, '회원: 내 참여 횟수만 보임');
reset role;
set role anon;
select tests.expect_error('select * from public.member_participation', 'permission denied%');
reset role;


-- 9. 일정 수정 ----------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_error(format($$select public.update_event(%L,
  '{"type":"written_exam","title":"대기업 공채 필기시험"}',
  '[{"id":"%s","day_date":"2026-11-08","start_time":"08:00","end_time":"13:00","positions":[{"id":"%s","role_name":"감독관","pay_type":"hourly","rate":12000,"headcount":3}]}]', '[]', '', '')$$, :'ev1', :'day1', :'pos_sup'), 'POSITION_IN_USE');
select public.update_event(:'ev1',
  '{"type":"written_exam","title":"대기업 공채 필기시험 (수정)","chat_link":"https://open.kakao.com/o/test"}',
  format('[{"id":"%s","day_date":"2026-11-08","gather_time":"07:30","start_time":"08:00","end_time":"14:00","positions":[{"id":"%s","role_name":"감독관","pay_type":"hourly","rate":12500,"min_paid_hours":4,"headcount":3},{"id":"%s","role_name":"안내","pay_type":"daily","rate":110000,"overtime_rate":15000,"headcount":1},{"role_name":"대기실","pay_type":"hourly","rate":11000,"headcount":1}]}]', :'day1', :'pos_sup', :'pos_guide')::jsonb,
  '[]', '고객사A', '');
reset role;
select tests.expect_count($$select 1 from public.event_positions where role_name = '감독관' and rate = 12500 and headcount = 3$$, 1, '수정: 있는 역할의 단가·인원 변경');
select tests.expect_count(format($$select 1 from public.event_positions where event_id = %L$$, :'ev1'), 3, '수정: 새 역할 추가');
select tests.expect_count(format($$select 1 from public.event_extra_rules where event_id = %L$$, :'ev1'), 0, '수정: 추가 지급을 비움');
select tests.expect_count($$select 1 from public.event_days where end_time = '14:00'$$, 1, '수정: 날짜의 시간 변경');


-- 10. 완료와 취소 -------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select public.set_event_status(:'ev1', 'closed');
select public.set_event_status(:'ev1', 'completed');
select tests.expect_error(format($$select public.set_event_status(%L, 'open_all')$$, :'ev1'), 'INVALID_TRANSITION');
select tests.expect_error(format($$select public.update_event(%L, '{}', '[{}]', '[]', '', '')$$, :'ev1'), 'EVENT_LOCKED');
select tests.expect_true(public.decide_applications(array[:'app_core'::uuid], 'rejected') = 0, '완료된 일정의 선발은 바꾸지 않음');
select tests.expect_true(public.decide_applications(array[:'app_general2'::uuid], 'rejected') = 0, '완료된 일정: 지각자도 바꾸지 않음');
reset role;
select tests.expect_count($$select 1 from public.member_notes where member_id = '00000000-0000-0000-0000-00000000003d' and type = 'late' and auto_source = 'attendance'$$, 1, '완료된 일정: 바뀌지 않은 신청의 출석 기록은 그대로');
select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;

select public.create_event(
  '{"type":"interview","title":"공공기관 면접"}',
  '[{"day_date":"2026-11-11","start_time":"09:00","end_time":"17:00","positions":[{"role_name":"대기실","pay_type":"hourly","rate":11000,"headcount":2}]}]', '[]', '', ''
) as ev2 \gset
select public.set_event_status(:'ev2', 'open_all');
reset role;

select id as pos_ev2 from public.event_positions where event_id = :'ev2' \gset
select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select public.apply_to_event(:'ev2', array[:'pos_ev2']::uuid[]);
reset role;

select tests.act_as('00000000-0000-0000-0000-00000000003a');
set role authenticated;
select tests.expect_error(format($$select public.set_event_status(%L, 'cancelled', '')$$, :'ev2'), 'REASON_REQUIRED');
select public.set_event_status(:'ev2', 'cancelled', '고객사 사정으로 취소');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000003c' and type = 'event.cancelled' and body = '고객사 사정으로 취소'$$, 1, '취소: 신청자에게 알림');

-- 완료·취소된 일정은 신청했던 사람만 본다
select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select tests.expect_count('select * from public.events', 2, '신청했던 회원: 완료·취소 일정이 보임');
reset role;
select tests.act_as('00000000-0000-0000-0000-00000000003d');
set role authenticated;
select tests.expect_count('select * from public.events', 1, '신청하지 않은 취소 일정은 안 보임');
reset role;


-- 11. 알림 -------------------------------------------------------------------------------

select tests.act_as('00000000-0000-0000-0000-00000000003c');
set role authenticated;
select tests.expect_count($$select * from public.notifications where user_id <> '00000000-0000-0000-0000-00000000003c'$$, 0, '알림: 다른 사람 알림은 안 보임');
update public.notifications set read_at = now();
select tests.expect_count('select * from public.notifications where read_at is null', 0, '알림: 자기 알림 읽음 처리');
select tests.expect_error($$update public.notifications set title = '바꿈'$$, 'permission denied%');
select tests.expect_error($$insert into public.notifications (user_id, type, title) values ('00000000-0000-0000-0000-00000000003b', 'x', 'x')$$, 'permission denied%');
reset role;
select tests.expect_count($$select 1 from public.notifications where user_id = '00000000-0000-0000-0000-00000000003b' and read_at is not null$$, 0, '알림: 다른 사람 알림은 읽음 처리되지 않음');

-- 화면이 쓰는 외래 키 이름 (applications → profiles 연결에 이름을 붙여 부른다)
select tests.expect_count($$select 1 from pg_constraint where conname = 'applications_member_id_fkey'$$, 1, '외래 키 이름: applications_member_id_fkey');

\echo 'ALL PHASE 2 RLS TESTS PASSED'
