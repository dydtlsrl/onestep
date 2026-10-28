-- 연습 데이터 지우기. 시범 사용을 시작하기 전, 그리고 실제 운영을 시작하기 직전에 Supabase SQL Editor에서 실행한다.
-- 되돌릴 수 없다. 남겨 둘 것이 있으면 먼저 백업한다 (docs/backup.md).
--
-- 남김: 관리자 계정(role = admin), 설정(세금·회사 정보·계산 규칙)과 변경 이력, ★기본 단가, 기본 계약서 양식(1번)
-- 지움: 일정 전체(날짜·모집·신청·출석·계약서·정산 포함), 관리자가 아닌 회원, 정산 정보(주민번호·계좌),
--       회원 메모, 알림, 기존 인력 명단, 초대 링크, 직접 만든 단가·계약서 양식, 기록(audit_logs)
-- 로그인 계정(auth.users)은 지우지 않는다. 지운 회원은 초대 링크로 다시 가입할 수 있다.

begin;
delete from public.events;            -- 일정에 딸린 날짜·모집·신청·계약서·정산도 같이 지워진다 (on delete cascade)
delete from public.notifications;
delete from public.member_notes;
delete from public.member_private;
delete from public.profiles where role <> 'admin';
delete from public.roster;            -- 기존 인력 명단 (13번)
delete from public.invites;
delete from public.job_roles where default_for is null;
delete from public.contract_templates where version > 1;
delete from public.audit_logs;
commit;

-- 확인: 모두 0이어야 하고, 관리자 수만 1 이상
select
  (select count(*) from public.events)        as 일정,
  (select count(*) from public.profiles where role <> 'admin') as 회원,
  (select count(*) from public.invites)       as 초대링크,
  (select count(*) from public.notifications) as 알림,
  (select count(*) from public.profiles where role = 'admin')  as 관리자;
