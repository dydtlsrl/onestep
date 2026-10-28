-- 10번: 시범 운영 지표 (PRD 9장)
--
-- 적용 방법: 20261104000000_contracts_payments.sql(9번)을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우거나 바꾸지 않는다. 설정 한 줄(pilot)을 더하고 설정 저장 함수가 그 값을 받게 한다.
--
-- 지표 숫자(가입률, 앱 신청 비율, 24시간 안 서명, 처리 시간)는 이미 있는 데이터로 화면에서 계산한다.
-- 여기에는 계산할 대상(시범 일정·초대 링크)과 앱 밖에서 생기는 값(초대한 인원, 기존 처리 시간,
-- 인터뷰 응답 수, 사고 건수)만 저장한다. 대표만 읽고 쓴다 (회원은 보수 규칙 설정만 볼 수 있다).


-- 설정: 시범 운영 ---------------------------------------------------------------------------------

insert into public.app_settings (key, value) values
  ('pilot', '{"event_ids": [], "invite_ids": [], "invited_count": null, "baseline_minutes": null, "target_reduction_pct": null,
              "ceo_responses": 0, "ceo_yes": 0, "member_responses": 0, "member_yes": 0,
              "incident_privacy": 0, "incident_pay": 0, "incident_outage": 0, "note": ""}')
on conflict (key) do nothing;

insert into public.app_settings_history (key, value, version, effective_from, change_reason)
select key, value, version, effective_from, '처음 값'
from public.app_settings
where key = 'pilot'
  and not exists (select 1 from public.app_settings_history h where h.key = 'pilot');

-- 설정 저장 (대표만). 9번의 함수에 pilot 키를 더한다. 나머지 키의 검사는 그대로다.
create or replace function public.update_setting(p_key text, p_value jsonb, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if char_length(v_reason) > 200 or jsonb_typeof(p_value) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;

  if p_key = 'company' then
    if exists (
      select 1 from jsonb_each(p_value) e
      where e.key not in ('name', 'ceo', 'biz_no', 'address', 'phone')
         or jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 200
    ) or coalesce(btrim(p_value ->> 'name'), '') = '' then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'contract' then
    if p_value ->> 'rrn_display' not in ('masked', 'full') then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'tax' then
    if p_value ->> 'type' not in ('unset', 'other', 'business', 'none')
      or jsonb_typeof(p_value -> 'threshold') <> 'boolean'
      or jsonb_typeof(p_value -> 'include_extras') <> 'boolean' then
      raise exception 'INVALID_INPUT';
    end if;
  elsif p_key = 'pilot' then
    -- 시범 운영 지표: 대상 일정·초대 링크(ID 목록)와 대표가 직접 적는 숫자, 메모
    if exists (
      select 1 from jsonb_each(p_value) e
      where case
        when e.key in ('event_ids', 'invite_ids') then
          case when jsonb_typeof(e.value) <> 'array' then true
               when jsonb_array_length(e.value) > 100 then true
               else exists (
                 select 1 from jsonb_array_elements(e.value) x
                 where jsonb_typeof(x) <> 'string'
                    or (x #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               )
          end
        when e.key in ('invited_count', 'baseline_minutes', 'target_reduction_pct',
                       'ceo_responses', 'ceo_yes', 'member_responses', 'member_yes',
                       'incident_privacy', 'incident_pay', 'incident_outage') then
          case when jsonb_typeof(e.value) = 'null' then false
               when jsonb_typeof(e.value) <> 'number' then true
               else (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
                 or (e.value #>> '{}')::numeric < 0
                 or (e.value #>> '{}')::numeric > case when e.key = 'target_reduction_pct' then 100 else 100000 end
          end
        when e.key = 'note' then
          jsonb_typeof(e.value) <> 'string' or char_length(e.value #>> '{}') > 1000
        else true
      end
    ) then
      raise exception 'INVALID_INPUT';
    end if;
  else
    raise exception 'SETTING_NOT_FOUND';
  end if;

  update public.app_settings
  set value = p_value, version = version + 1, effective_from = now(), updated_by = auth.uid(), updated_at = now()
  where key = p_key
  returning version into v_version;
  if not found then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  insert into public.app_settings_history (key, value, version, effective_from, changed_by, change_reason)
  values (p_key, p_value, v_version, now(), auth.uid(), v_reason);

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'settings.' || p_key, 'setting', null, p_value || jsonb_build_object('version', v_version));
end;
$$;

revoke all on function public.update_setting(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.update_setting(text, jsonb, text) to authenticated;
