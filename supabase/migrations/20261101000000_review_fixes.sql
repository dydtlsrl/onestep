-- 2단계 리뷰 반영: 알림 길이 제한, 활동 제한된 회원의 톡방 링크
--
-- 적용 방법: 20261031000000_event_days.sql을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 함수 두 개를 고쳐 쓰고 톡방 링크 권한 규칙을 바꾼다. 데이터는 바꾸지 않는다.
--   - 옛 권한 규칙을 지우므로 "destructive operation" 경고가 뜰 수 있다.
--
-- 고치는 것
--   - 알림 제목은 100자, 내용은 300자까지다. 제목이 긴 일정을 공개하거나 300자가 넘는 사유로 취소하면
--     알림 저장이 실패해 상태 변경까지 취소됐다. 이제 알림에 들어갈 글만 자른다 (일정의 취소 사유는 전체 저장).
--   - 여러 날짜에 신청한 사람에게 취소 알림이 날짜 수만큼 가던 것을 한 번으로 줄인다.
--   - 확정 알림을 받은 뒤 활동 제한·탈퇴된 회원이 톡방 링크를 계속 볼 수 있었다. 이제 활동 회원만 본다.


-- 공개·마감·완료·취소 (대표만) ---------------------------------------------------------

create or replace function public.set_event_status(p_event_id uuid, p_status public.event_status, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  if not (
    (v_event.status = 'draft' and p_status in ('open_core', 'open_all', 'cancelled'))
    or (v_event.status = 'open_core' and p_status in ('open_all', 'closed', 'completed', 'cancelled'))
    or (v_event.status = 'open_all' and p_status in ('closed', 'completed', 'cancelled'))
    or (v_event.status = 'closed' and p_status in ('open_all', 'completed', 'cancelled'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if p_status = 'cancelled' and (v_reason = '' or char_length(v_reason) > 500) then
    raise exception 'REASON_REQUIRED';
  end if;

  update public.events
  set status = p_status,
      core_opened_at = case when p_status = 'open_core' then now() else core_opened_at end,
      general_opened_at = case when p_status = 'open_all' and general_opened_at is null then now() else general_opened_at end,
      closed_at = case when p_status = 'closed' then now() else closed_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end,
      cancel_reason = case when p_status = 'cancelled' then v_reason else cancel_reason end
  where id = p_event_id;

  -- 공개 알림: 핵심 공개면 핵심 회원에게, 전체 공개면 아직 알림을 받지 않은 회원에게
  if p_status = 'open_core' then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'event.open', left('핵심 인력 먼저 공개: ' || public.event_label(v_event), 100), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member' and tier = 'core';
  elsif p_status = 'open_all' and v_event.general_opened_at is null then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'event.open', left('새 일정: ' || public.event_label(v_event), 100), '신청을 받고 있어요.', '/events/' || p_event_id
    from public.profiles
    where status = 'active' and role = 'member'
      and (v_event.status = 'draft' or tier = 'general');
  elsif p_status = 'cancelled' then
    -- 날짜가 여러 개여도 한 사람에게 한 번만 알린다
    insert into public.notifications (user_id, type, title, body, link)
    select distinct a.member_id, 'event.cancelled', left('일정 취소: ' || public.event_label(v_event), 100), left(v_reason, 300), '/events/' || p_event_id
    from public.applications a
    where a.event_id = p_event_id and a.status in ('applied', 'waitlisted', 'selected');
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'event.status', 'event', p_event_id,
          jsonb_build_object('from', v_event.status, 'to', p_status, 'reason', v_reason));
end;
$$;


-- 선발 결과 알림. 결과가 바뀐 날짜가 있는 사람에게 한 번씩 보낸다. 확정된 날짜가 하나라도 있으면 확정 알림이다.
create or replace function public.notify_selection_results(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;

  with targets as (
    update public.applications
    set notified_status = status, notified_at = now()
    where event_id = p_event_id
      and status in ('selected', 'rejected')
      and notified_status is distinct from status
    returning member_id
  ),
  summary as (
    select a.member_id,
           string_agg(public.day_label(d) || ' ' || p.role_name, ', ' order by d.day_date, d.start_time)
             filter (where a.status = 'selected') as selected_days
    from public.applications a
    join public.event_days d on d.id = a.day_id
    join public.event_positions p on p.id = a.position_id
    where a.event_id = p_event_id
      and a.member_id in (select member_id from targets)
    group by a.member_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select member_id,
         case when selected_days is not null then 'application.selected' else 'application.rejected' end,
         left(case when selected_days is not null then '확정되었어요: ' else '선발 결과: ' end || public.event_label(v_event), 100),
         case when selected_days is not null
              then left('확정: ' || selected_days || '. 집합 안내와 확정자 톡방 링크를 확인해 주세요.', 300)
              else '이번 일정은 함께하지 못하게 되었어요. 다음 일정에서 만나요.' end,
         '/events/' || p_event_id
  from summary;
  get diagnostics v_count = row_count;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'application.notify', 'event', p_event_id, jsonb_build_object('count', v_count));

  return v_count;
end;
$$;


-- 톡방 링크: 활동 회원이어야 한다 -------------------------------------------------------------

drop policy if exists "대표와 확정자만 톡방 링크를 본다" on public.event_chat_links;
drop policy if exists "대표와 활동 중인 확정자만 톡방 링크를 본다" on public.event_chat_links;
create policy "대표와 활동 중인 확정자만 톡방 링크를 본다"
  on public.event_chat_links for select to authenticated
  using (
    (select public.is_admin())
    or (
      (select public.is_active_member())
      and exists (
        select 1 from public.applications a
        where a.event_id = event_chat_links.event_id
          and a.member_id = (select auth.uid())
          and a.status = 'selected'
          and a.notified_status = 'selected'
      )
    )
  );

