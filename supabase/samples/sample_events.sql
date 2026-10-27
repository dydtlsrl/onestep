-- 시험용 샘플 일정 5개 (개발·점검용. 실제 운영 DB에는 넣지 않는다)
-- 7번 마이그레이션(20261102000000_day_signup.sql)까지 적용한 DB용이다.
--
-- 사용법: Supabase SQL Editor에 붙여 넣고 Run. 제목이 "[샘플]"로 시작한다.
-- 지우기: 맨 아래 "지우기" 줄만 따로 실행한다. 샘플 일정에 들어온 신청도 같이 지워진다.
--
-- 1. 대기업 필기시험: 세팅일(시급 11,000원, 최소 4시간) + 시험일, 전체 공개 중
-- 2. 공공기관 면접: 세팅일 + 면접 2일, 핵심 공개 중, 지방비는 일정당 한 번
-- 3. 자격증 필기시험: 하루짜리 일급, 임시저장 (회원에게 안 보임)
-- 4. 채용박람회: 2일 모두 참여 필수, 전체 공개 중
-- 5. 대학 입학 면접: 하루짜리, 신청 마감 시각 있음, 전체 공개 중

do $$
declare
  v_ev uuid;
begin
  -- 1 ---------------------------------------------------------------------------
  insert into public.events (type, title, start_date, end_date, location_name, address, notice, status,
    apply_deadline, pay_date, core_opened_at, general_opened_at)
  values ('written_exam', '[샘플] 대기업 하반기 공채 필기시험', '2026-11-07', '2026-11-08', 'OO중학교', '서울 송파구 올림픽로 000',
    E'검정 계열 단정한 복장, 신분증 지참\n휴대폰은 시험 중 무음', 'open_all', null, '2026-11-15', now(), now())
  returning id into v_ev;
  insert into public.event_internal (event_id, client_name, memo) values (v_ev, '샘플 고객사 A', '샘플 데이터');
  insert into public.event_chat_links (event_id, chat_link) values (v_ev, 'https://open.kakao.com/o/sample1');
  insert into public.event_extra_rules (event_id, type, tier, amount, per_day) values (v_ev, 'transport', 'all', 10000, true);
  insert into public.event_days (event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate, min_paid_hours)
  values (v_ev, '2026-11-07', 'setup', null, '14:00', '18:00', 1, 4, 'hourly', 11000, 4),
         (v_ev, '2026-11-08', 'main', '07:30', '08:00', '13:00', 2, 24, 'hourly', 11000, 4);

  -- 2 ---------------------------------------------------------------------------
  insert into public.events (type, title, start_date, end_date, location_name, address, notice, status,
    apply_deadline, pay_date, core_opened_at)
  values ('interview', '[샘플] 공공기관 신입 채용 면접', '2026-11-11', '2026-11-13', 'OO컨벤션센터', '대전 유성구 엑스포로 000',
    '정장 착용, 면접자 개인정보 외부 유출 금지', 'open_core', null, '2026-11-30', now())
  returning id into v_ev;
  insert into public.event_internal (event_id, client_name, memo) values (v_ev, '샘플 고객사 B', '샘플 데이터');
  insert into public.event_chat_links (event_id, chat_link) values (v_ev, 'https://open.kakao.com/o/sample2');
  insert into public.event_extra_rules (event_id, type, tier, amount, per_day)
  values (v_ev, 'transport', 'all', 15000, true),
         (v_ev, 'regional', 'core', 30000, false),
         (v_ev, 'regional', 'general', 20000, false);
  insert into public.event_days (event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate, min_paid_hours)
  values (v_ev, '2026-11-11', 'setup', null, '13:00', '17:00', 1, 3, 'hourly', 11000, 4),
         (v_ev, '2026-11-12', 'main', '08:00', '08:30', '18:00', 2, 8, 'hourly', 11000, 8),
         (v_ev, '2026-11-13', 'main', '08:00', '08:30', '18:00', 3, 8, 'hourly', 11000, 8);

  -- 3 ---------------------------------------------------------------------------
  insert into public.events (type, title, start_date, end_date, location_name, address, notice, status, pay_date)
  values ('written_exam', '[샘플] 국가자격증 필기시험 감독', '2026-11-15', '2026-11-15', 'OO고등학교', '경기 성남시 분당구 000',
    '감독 교육 07:20 시작', 'draft', '2026-11-30')
  returning id into v_ev;
  insert into public.event_internal (event_id, client_name, memo) values (v_ev, '샘플 고객사 C', '샘플 데이터');
  insert into public.event_chat_links (event_id, chat_link) values (v_ev, '');
  insert into public.event_days (event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate, overtime_rate)
  values (v_ev, '2026-11-15', 'main', '07:20', '07:40', '12:30', 1, 10, 'daily', 70000, 15000);

  -- 4 ---------------------------------------------------------------------------
  insert into public.events (type, title, start_date, end_date, location_name, address, notice, status,
    pay_date, all_days_required, core_opened_at, general_opened_at)
  values ('event', '[샘플] 기업 채용박람회 운영', '2026-11-20', '2026-11-21', 'OO전시장 2홀', '서울 강남구 영동대로 000',
    '이틀 모두 나올 수 있는 분만 신청해 주세요. 점심 제공', 'open_all', '2026-11-30', true, now(), now())
  returning id into v_ev;
  insert into public.event_internal (event_id, client_name, memo) values (v_ev, '샘플 고객사 D', '샘플 데이터');
  insert into public.event_chat_links (event_id, chat_link) values (v_ev, 'https://open.kakao.com/o/sample4');
  insert into public.event_extra_rules (event_id, type, tier, amount, per_day) values (v_ev, 'transport', 'all', 10000, true);
  insert into public.event_days (event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate)
  values (v_ev, '2026-11-20', 'main', '08:30', '09:00', '18:00', 1, 5, 'hourly', 11000),
         (v_ev, '2026-11-21', 'main', '08:30', '09:00', '18:00', 2, 5, 'hourly', 11000);

  -- 5 ---------------------------------------------------------------------------
  insert into public.events (type, title, start_date, end_date, location_name, address, notice, status,
    apply_deadline, pay_date, core_opened_at, general_opened_at)
  values ('interview', '[샘플] OO대학교 수시 입학 면접', '2026-11-28', '2026-11-28', 'OO대학교 본관', '부산 금정구 000',
    '대기실 안내와 면접장 진행. 수험생 응대 친절하게', 'open_all', '2026-11-25 18:00+09', '2026-12-15', now(), now())
  returning id into v_ev;
  insert into public.event_internal (event_id, client_name, memo) values (v_ev, '샘플 고객사 E', '샘플 데이터');
  insert into public.event_chat_links (event_id, chat_link) values (v_ev, 'https://open.kakao.com/o/sample5');
  insert into public.event_extra_rules (event_id, type, tier, amount, per_day)
  values (v_ev, 'regional', 'core', 40000, true), (v_ev, 'regional', 'general', 30000, true);
  insert into public.event_days (event_id, day_date, kind, gather_time, start_time, end_time, sort_order, headcount, pay_type, rate, min_paid_hours)
  values (v_ev, '2026-11-28', 'main', '07:30', '08:00', '17:00', 1, 12, 'hourly', 11000, 6);
end $$;


-- 지우기 (필요할 때 이 줄만 실행) ------------------------------------------------------
-- delete from public.events where title like '[샘플]%';
