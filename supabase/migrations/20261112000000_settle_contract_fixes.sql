-- 17번: 정산·계약서를 실제 운영에 맞춘다
-- 1. 날짜별 휴게시간(분): 기업마다 달라서 일정마다 정한다. 시급은 근무 시간에서 빼고 계산한다.
-- 2. 정산 취소(cancel_payment): 노쇼 등으로 받을 보수가 없어진 사람의 확정 전·지급 예정 정산을 취소한다.
-- 3. 보류 풀기: 세금 방식을 정하기 전에 보류한 정산도 풀 수 있게("확정 전"으로 돌아감).
-- 4. 탈퇴 확인 처리(force)라도 아직 주지 않은 정산이 있으면 막는다 (HAS_UNPAID_PAYMENT).
-- 5. 계약서에 서명할 때 계좌(은행 + 가린 번호)도 남긴다.
-- 6. 계약서 기본 양식을 근로계약서로 바꾼다 (대표가 양식을 아직 고치지 않았을 때만 새 버전으로 넣는다).


-- 1. 휴게시간 ----------------------------------------------------------------------------

alter table public.event_days
  add column break_minutes integer not null default 0
  check (break_minutes between 0 and 600);
alter table public.event_days
  add constraint event_days_break_shorter check (break_minutes * interval '1 minute' < end_time - start_time);

create or replace function public.save_event_days(p_event_id uuid, p_days jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day jsonb;
  v_ord bigint;
  v_day_id uuid;
  r record;
  v_keep uuid[];
begin
  if jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) = 0 then
    raise exception 'DAYS_REQUIRED';
  end if;
  if jsonb_array_length(p_days) > 31 then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(array_agg((d ->> 'id')::uuid) filter (where nullif(d ->> 'id', '') is not null), '{}')
  into v_keep
  from jsonb_array_elements(p_days) d;

  -- 신청이 있는 날짜는 뺄 수 없다
  if exists (
    select 1 from public.applications a
    where a.event_id = p_event_id and a.day_id <> all (v_keep)
  ) then
    raise exception 'DAY_IN_USE';
  end if;

  delete from public.event_days where event_id = p_event_id and id <> all (v_keep);

  for v_day, v_ord in select t.item, t.ord from jsonb_array_elements(p_days) with ordinality as t(item, ord) loop
    v_day_id := nullif(v_day ->> 'id', '')::uuid;
    select * into r from jsonb_to_record(v_day) as x(
      day_date date, kind text, gather_time text, start_time time, end_time time,
      headcount integer, pay_type public.pay_type, rate integer, min_paid_hours numeric, overtime_rate integer,
      break_minutes integer
    );
    if v_day_id is null then
      insert into public.event_days (
        event_id, day_date, kind, gather_time, start_time, end_time, sort_order,
        headcount, pay_type, rate, min_paid_hours, overtime_rate, break_minutes
      )
      values (
        p_event_id, r.day_date, coalesce(nullif(r.kind, ''), 'main')::public.event_day_kind,
        nullif(r.gather_time, '')::time, r.start_time, r.end_time, v_ord,
        r.headcount, r.pay_type, r.rate,
        case when r.pay_type = 'hourly' then r.min_paid_hours end,
        case when r.pay_type = 'daily' then r.overtime_rate end,
        coalesce(r.break_minutes, 0)
      );
    else
      update public.event_days
      set day_date = r.day_date,
          kind = coalesce(nullif(r.kind, ''), 'main')::public.event_day_kind,
          gather_time = nullif(r.gather_time, '')::time,
          start_time = r.start_time,
          end_time = r.end_time,
          sort_order = v_ord,
          headcount = r.headcount,
          pay_type = r.pay_type,
          rate = r.rate,
          min_paid_hours = case when r.pay_type = 'hourly' then r.min_paid_hours end,
          overtime_rate = case when r.pay_type = 'daily' then r.overtime_rate end,
          break_minutes = coalesce(r.break_minutes, 0)
      where id = v_day_id and event_id = p_event_id;
      if not found then
        raise exception 'INVALID_INPUT';
      end if;
    end if;
  end loop;

  update public.events e
  set start_date = d.first_day, end_date = d.last_day
  from (
    select min(day_date) as first_day, max(day_date) as last_day
    from public.event_days where event_id = p_event_id
  ) d
  where e.id = p_event_id;
end;
$$;


-- 2. 정산 취소 ----------------------------------------------------------------------------

create function public.cancel_payment(p_event_id uuid, p_member_id uuid, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  update public.payments
  set status = 'cancelled', memo = left(btrim(coalesce(p_reason, '')), 300)
  where event_id = p_event_id and member_id = p_member_id and status in ('draft', 'scheduled')
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'payment.cancel', 'payment', v_id, jsonb_build_object('reason', left(btrim(coalesce(p_reason, '')), 300)));
  return true;
end;
$$;

revoke all on function public.cancel_payment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_payment(uuid, uuid, text) to authenticated;


-- 3. 보류 풀기 ----------------------------------------------------------------------------

create or replace function public.set_payment_status(p_payment_ids uuid[], p_status public.payment_status, p_reason text default '')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_status not in ('paid', 'held', 'scheduled') or char_length(v_reason) > 300 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_status = 'held' and v_reason = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  with changed as (
    update public.payments p
    -- 보류 풀기: 세금 방식을 정하기 전에 보류한 것은 "확정 전"으로 돌아간다
    set status = case when p_status = 'scheduled' and p.tax_type = 'unset' then 'draft'::public.payment_status else p_status end,
        paid_at = case when p_status = 'paid' then now() else null end,
        held_reason = case when p_status = 'held' then v_reason else '' end
    where p.id = any (p_payment_ids)
      and (
        (p_status = 'paid' and p.status = 'scheduled')
        or (p_status = 'held' and p.status in ('scheduled', 'draft'))
        or (p_status = 'scheduled' and p.status = 'held')
      )
    returning p.id, p.member_id, p.net, p.event_id
  ),
  notified as (
    insert into public.notifications (user_id, type, title, body, link)
    select c.member_id, 'payment.paid', left('보수가 지급되었어요: ' || public.event_label(e), 100),
           to_char(c.net, 'FM999,999,999') || '원 (세금 공제 후)', '/payments'
    from changed c join public.events e on e.id = c.event_id
    where p_status = 'paid'
    returning 1
  )
  select count(*) into v_count from changed;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'payment.status', 'payment', null,
          jsonb_build_object('status', p_status, 'count', v_count, 'ids', to_jsonb(p_payment_ids), 'reason', v_reason));
  return v_count;
end;
$$;


-- 4. 탈퇴 확인 처리 ------------------------------------------------------------------------

create or replace function public.withdraw_member(p_member_id uuid, p_reason text default '', p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
  v_blocker text;
  v_last_paid date;
  v_by_admin boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  v_by_admin := p_member_id <> v_uid;
  if v_by_admin and not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_profile from public.profiles where id = p_member_id for update;
  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;
  if v_profile.role = 'admin' then
    raise exception 'CANNOT_TARGET_ADMIN';
  end if;
  if v_profile.status = 'withdrawn' then
    raise exception 'ALREADY_WITHDRAWN';
  end if;

  -- 받을 보수가 남은 것으로 보이지만 실제로는 없을 때(정산을 만들지 않은 연습 일정 등), 대표가 확인하고 넘길 수 있다
  v_blocker := public.withdraw_blocker(p_member_id);
  if v_blocker is not null and not (v_blocker = 'HAS_PENDING_PAYMENT' and p_force and v_by_admin) then
    raise exception '%', v_blocker;
  end if;
  -- 확인 처리로 넘기더라도, 아직 주지 않은 정산이 실제로 있으면 막는다 (계좌·주민번호를 지우면 지급·세무 신고를 못 한다)
  if v_blocker is not null and exists (
    select 1 from public.payments where member_id = p_member_id and status in ('draft', 'scheduled', 'held')
  ) then
    raise exception 'HAS_UNPAID_PAYMENT';
  end if;

  update public.applications
  set status = 'cancelled', cancelled_at = now(), cancel_reason = '회원 탈퇴'
  where member_id = p_member_id and status in ('applied', 'waitlisted');

  update public.contracts
  set status = 'voided', voided_at = now(), void_reason = '회원 탈퇴'
  where member_id = p_member_id and status = 'requested';

  delete from public.member_notes where member_id = p_member_id;
  delete from public.notifications where user_id = p_member_id;

  -- 보수를 받은 적이 있으면 마지막 지급일이 속한 해의 다음 해부터 5년(그해 12월 31일까지) 보관
  select max(pay_date) into v_last_paid from public.payments where member_id = p_member_id and status = 'paid';
  if v_last_paid is null then
    delete from public.member_private where member_id = p_member_id;
  else
    update public.member_private
    set retain_until = make_date(extract(year from v_last_paid)::integer + 5, 12, 31)
    where member_id = p_member_id;
  end if;

  update public.profiles
  set status = 'withdrawn',
      withdrawn_at = now(),
      withdraw_reason = v_reason,
      region = '',
      career_years = 0,
      career_note = '',
      referrer_name = '',
      status_reason = ''
  where id = p_member_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (v_uid, 'member.withdraw', 'profile', p_member_id,
          jsonb_build_object('by_admin', v_by_admin, 'forced', v_blocker is not null, 'kept_private_until', (select retain_until from public.member_private where member_id = p_member_id)));

  -- 본인이 탈퇴하면 대표에게 알린다
  if not v_by_admin then
    insert into public.notifications (user_id, type, title, body, link)
    select id, 'member.withdrawn', left(v_profile.name || '님이 탈퇴했어요', 100), left(v_reason, 300), '/admin/members/' || p_member_id
    from public.profiles where role = 'admin' and status = 'active';
  end if;

  perform public.purge_expired_private();
end;
$$;


-- 5. 서명할 때 계좌도 남긴다 ------------------------------------------------------------------

alter table public.contracts add column signer_account text;
grant select (signer_account) on public.contracts to authenticated;

create or replace function public.sign_contract(p_contract_id uuid, p_signature text, p_ip text, p_user_agent text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts%rowtype;
  v_private public.member_private%rowtype;
  v_status public.event_status;
  v_signed_at timestamptz := now();
  v_hash text;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if not found or v_contract.member_id is distinct from auth.uid() then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  if not public.is_active_member() then
    raise exception 'NOT_ACTIVE_MEMBER';
  end if;
  if v_contract.status <> 'requested' then
    raise exception 'CONTRACT_NOT_OPEN';
  end if;
  select status into v_status from public.events where id = v_contract.event_id;
  if v_status = 'cancelled' then
    raise exception 'EVENT_LOCKED';
  end if;
  select * into v_private from public.member_private where member_id = auth.uid();
  if not found then
    raise exception 'PRIVATE_REQUIRED';
  end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%'
    or char_length(p_signature) < 200 or char_length(p_signature) > 300000 then
    raise exception 'SIGNATURE_REQUIRED';
  end if;

  v_hash := encode(sha256(convert_to(
    v_contract.id::text || '|' || v_contract.title || '|' || v_contract.body || '|' || v_contract.terms::text || '|'
    || v_private.rrn_masked || '|' || v_private.address || '|' || v_private.bank_name || ' ' || v_private.account_masked || '|'
    || p_signature || '|' || v_signed_at::text,
    'UTF8')), 'hex');

  update public.contracts
  set status = 'signed', signed_at = v_signed_at, signature = p_signature,
      signer_rrn_masked = v_private.rrn_masked, signer_address = v_private.address,
      signer_account = btrim(v_private.bank_name || ' ' || v_private.account_masked),
      sign_ip = left(coalesce(p_ip, ''), 100), sign_user_agent = left(coalesce(p_user_agent, ''), 500),
      document_hash = v_hash
  where id = p_contract_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'contract.sign', 'contract', p_contract_id, jsonb_build_object('hash', v_hash));
  return v_hash;
end;
$$;


-- 6. 계약서 기본 양식: 근로계약서 -----------------------------------------------------------------

insert into public.contract_templates (version, title, body)
select 2, '근로계약서', $tpl${{회사명}}(이하 "사업주")과 {{이름}}(이하 "근로자")은 다음과 같이 근로계약을 체결한다.

1. 근로계약기간: {{근로계약기간}}
2. 근무장소: {{장소}}
3. 업무의 내용: 「{{행사명}}」 현장 운영 ({{역할}})
4. 소정근로시간: 위 "근로 내용과 임금" 표의 날짜별 시간과 같다. 휴게시간은 표에 적힌 대로 근로시간에 넣지 않는다.
5. 근무일: 위 표의 날짜 (그 밖의 날은 휴일로 한다)
6. 임금
   ① 임금은 위 표와 같이 시간급 또는 일급으로 하며, 정한 시간을 넘어 일한 경우 사업주의 계산 규칙에 따라 더해 지급한다.
   ② 교통비·지방 출장비는 위 표에 적힌 금액을 함께 지급한다.
   ③ 임금 합계: {{금액}} (세금 공제 전)
   ④ 지급일: {{지급예정일}}
   ⑤ 지급방법: 관련 법령에 따른 세금을 원천징수한 뒤 근로자가 등록한 계좌로 지급한다.
7. 근로자는 업무 중 알게 된 시험·면접 내용, 응시자 개인정보, 고객사 정보를 외부에 알리거나 다른 목적으로 쓰지 않는다. 이 의무는 계약이 끝난 뒤에도 유지된다.
8. 근로계약서 교부: 사업주는 계약을 체결함과 동시에 이 계약서를 근로자에게 교부한다 (앱에서 언제든 보고 저장할 수 있음).
9. 기타: 이 계약에 정하지 않은 사항은 근로기준법 등 관련 법령에 따른다.$tpl$
where not exists (select 1 from public.contract_templates where version > 1);
