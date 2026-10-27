-- 3·4단계: 내 정산 정보(암호화), 전자계약, 정산
--
-- 적용 방법: 20261103000000_rate_presets.sql을 적용한 뒤, 이 파일 내용을 SQL Editor에 붙여 넣고 Run
--   - 데이터를 지우지 않는다.
--   - 앱 서버의 환경변수 PII_ENCRYPTION_KEY가 있어야 주민번호·계좌번호를 저장할 수 있다 (README 참고).
--
-- 원칙
--   - 주민번호·계좌번호는 앱 서버에서 AES-256-GCM으로 암호화한 값만 DB에 들어온다. 암호화 키는 DB에 없다.
--     암호문 칸은 누구도 화면 API로 직접 읽을 수 없고, 대표가 아래 함수로 읽을 때마다 열람 기록이 남는다.
--   - 계약서는 요청할 때의 문구와 보수 내용을 그대로 복사해 둔다(양식을 고쳐도 바뀌지 않는다).
--     서명하면 서명 이미지·시각·IP·기기와 문서 해시(SHA-256)를 남긴다.
--   - 정산 금액은 앱 서버가 단가표·출석·세금 설정으로 계산해 넣고, DB 함수가 합계가 맞는지 다시 확인한다.
--     세목이 정해지기 전에는 "확정 전"으로만 저장되고, 이체 파일에 들어가지 않는다.


-- 설정: 회사 정보, 계약서 주민번호 표시(SET-09), 세금(SET-01·02) ---------------------------------

insert into public.app_settings (key, value) values
  ('company', '{"name": "원스텝", "ceo": "", "biz_no": "", "address": "", "phone": ""}'),
  ('contract', '{"rrn_display": "masked"}'),
  ('tax', '{"type": "unset", "threshold": true, "include_extras": true}')
on conflict (key) do nothing;

insert into public.app_settings_history (key, value, version, effective_from, change_reason)
select key, value, version, effective_from, '처음 값'
from public.app_settings
where key in ('company', 'contract', 'tax');

-- 설정 저장 (대표만). 키마다 값 모양을 확인하고 버전·이력을 남긴다.
create function public.update_setting(p_key text, p_value jsonb, p_reason text default '')
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


-- 내 정산 정보 (MEM-06) ---------------------------------------------------------------

create table public.member_private (
  member_id uuid primary key references public.profiles (id) on delete cascade,
  rrn_enc text not null check (rrn_enc like 'v1:%' and char_length(rrn_enc) <= 200),
  rrn_masked text not null check (rrn_masked ~ '^\d{6}-\d\*{6}$'),
  bank_name text not null check (char_length(btrim(bank_name)) between 1 and 30),
  account_enc text not null check (account_enc like 'v1:%' and char_length(account_enc) <= 200),
  account_masked text not null check (char_length(account_masked) between 4 and 30),
  account_holder text not null check (char_length(btrim(account_holder)) between 1 and 30),
  address text not null default '' check (char_length(address) <= 200),
  updated_at timestamptz not null default now()
);

create trigger member_private_set_updated_at
  before update on public.member_private
  for each row execute function public.set_updated_at();

-- 대표가 암호문을 읽는다 (이체 파일, 계약서 주민번호 전체 표시, 회원 상세의 원문 보기). 읽을 때마다 기록한다.
create function public.admin_private_secrets(p_member_ids uuid[], p_purpose text)
returns table (member_id uuid, rrn_enc text, account_enc text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if p_purpose not in ('view', 'transfer', 'contract') then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'private.read', 'profile',
          case when cardinality(p_member_ids) = 1 then p_member_ids[1] end,
          jsonb_build_object('purpose', p_purpose, 'count', cardinality(p_member_ids), 'member_ids', to_jsonb(p_member_ids)));

  return query
  select m.member_id, m.rrn_enc, m.account_enc
  from public.member_private m
  where m.member_id = any (p_member_ids);
end;
$$;

-- 회원이 자기 주민번호 암호문을 읽는다 (계약서에 주민번호 전체를 표시하도록 설정한 경우)
create function public.my_private_secrets()
returns table (rrn_enc text, account_enc text)
language sql
stable
security definer
set search_path = ''
as $$
  select rrn_enc, account_enc from public.member_private where member_id = auth.uid();
$$;


-- 계약서 양식 (CON-01) -------------------------------------------------------------------

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version >= 1),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 양식을 고치면 새 버전으로 저장한다 (이미 보낸 계약서는 그대로)
create function public.save_contract_template(p_title text, p_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80
    or char_length(btrim(coalesce(p_body, ''))) not between 1 and 20000 then
    raise exception 'INVALID_INPUT';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from public.contract_templates;
  insert into public.contract_templates (version, title, body, created_by)
  values (v_version, btrim(p_title), p_body, auth.uid());

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'contract.template', 'contract_template', null, jsonb_build_object('version', v_version));
  return v_version;
end;
$$;

-- 처음 양식 (대표가 기존 위드싸인 문구로 바꾼다)
insert into public.contract_templates (version, title, body) values (1, '단기 용역 계약서', $tpl${{회사명}}(이하 "회사")와 {{이름}}(이하 "용역자")는 아래 용역에 관하여 다음과 같이 계약을 맺는다.

제1조 (용역 내용)
용역자는 회사가 고객사로부터 의뢰받은 「{{행사명}}」의 현장 운영 업무를 수행한다. 일자·시간·장소·역할은 위 "용역 내용과 보수"와 같다.

제2조 (보수와 지급)
① 회사는 용역의 대가로 위 표의 보수를 지급한다. 초과 근무가 있으면 회사의 보수 계산 규칙에 따라 더해 지급한다.
② 보수는 관련 법령에 따른 세금을 원천징수한 뒤 {{지급예정일}}까지 용역자가 등록한 계좌로 지급한다.
③ 용역자가 정당한 사유 없이 용역을 수행하지 않은 날의 보수는 지급하지 않는다.

제3조 (성실 의무와 비밀 유지)
① 용역자는 회사와 고객사의 현장 안내에 따라 성실히 업무를 수행한다.
② 용역자는 업무 중 알게 된 시험·면접 내용, 응시자 개인정보, 고객사 정보를 외부에 알리거나 다른 목적으로 쓰지 않는다. 이 의무는 계약이 끝난 뒤에도 유지된다.

제4조 (계약의 해제)
회사 또는 고객사의 사정으로 일정이 취소되면 이 계약은 효력을 잃는다. 용역자가 참여할 수 없게 되면 즉시 회사에 알린다.

제5조 (기타)
이 계약은 독립된 용역 계약이며 근로계약이 아니다. 이 계약에 정하지 않은 사항은 관련 법령과 일반 관례에 따른다.$tpl$);


-- 전자계약 (CON-02~06) -------------------------------------------------------------------

create type public.contract_status as enum ('requested', 'signed', 'voided');

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  template_id uuid references public.contract_templates (id) on delete set null,
  template_version integer not null,
  status public.contract_status not null default 'requested',
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 25000),
  -- 요청할 때의 회사 정보, 회원 이름·연락처, 날짜별 시간·역할·보수, 합계, 지급 예정일
  terms jsonb not null,
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles (id) on delete set null,
  notified_at timestamptz not null default now(),
  signed_at timestamptz,
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and char_length(signature) <= 300000)),
  signer_rrn_masked text,
  signer_address text,
  sign_ip text check (char_length(sign_ip) <= 100),
  sign_user_agent text check (char_length(sign_user_agent) <= 500),
  document_hash text,
  voided_at timestamptz,
  void_reason text not null default '' check (char_length(void_reason) <= 300),
  check (status <> 'signed' or (signed_at is not null and signature is not null and document_hash is not null)),
  check (status <> 'requested' or signed_at is null)
);

-- 일정 하나에 회원 한 명당 유효한 계약은 하나
create unique index contracts_active_key on public.contracts (event_id, member_id) where status <> 'voided';
create index contracts_member_idx on public.contracts (member_id, requested_at desc);

-- 서명 요청 (대표만). 문구와 보수 내용은 앱 서버가 양식·일정으로 만들어 넘긴다.
create function public.request_contract(
  p_event_id uuid,
  p_member_id uuid,
  p_template_id uuid,
  p_title text,
  p_body text,
  p_terms jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_version integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select * into v_event from public.events where id = p_event_id;
  if not found then
    raise exception 'EVENT_NOT_FOUND';
  end if;
  if v_event.status in ('draft', 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;
  if not exists (
    select 1 from public.applications where event_id = p_event_id and member_id = p_member_id and status = 'selected'
  ) then
    raise exception 'NOT_SELECTED';
  end if;
  if exists (select 1 from public.contracts where event_id = p_event_id and member_id = p_member_id and status <> 'voided') then
    raise exception 'CONTRACT_EXISTS';
  end if;
  select version into v_version from public.contract_templates where id = p_template_id;
  if not found or jsonb_typeof(p_terms) <> 'object' then
    raise exception 'INVALID_INPUT';
  end if;

  begin
    insert into public.contracts (event_id, member_id, template_id, template_version, title, body, terms, requested_by)
    values (p_event_id, p_member_id, p_template_id, v_version, btrim(p_title), p_body, p_terms, auth.uid())
    returning id into v_id;
  exception when check_violation or not_null_violation then
    raise exception 'INVALID_INPUT';
  end;

  insert into public.notifications (user_id, type, title, body, link)
  values (p_member_id, 'contract.requested', left('계약서 서명 요청: ' || public.event_label(v_event), 100),
          '내용을 확인하고 휴대폰에서 바로 서명해 주세요.', '/contracts/' || v_id);

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'contract.request', 'contract', v_id, jsonb_build_object('event_id', p_event_id, 'member_id', p_member_id));
  return v_id;
end;
$$;

-- 서명하지 않은 사람에게 다시 알림 (대표만)
create function public.remind_contracts(p_event_id uuid)
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
    update public.contracts set notified_at = now()
    where event_id = p_event_id and status = 'requested'
    returning id, member_id
  )
  insert into public.notifications (user_id, type, title, body, link)
  select member_id, 'contract.reminder', left('계약서 서명을 기다리고 있어요: ' || public.event_label(v_event), 100),
         '서명해야 일정에 참여할 수 있어요.', '/contracts/' || id
  from targets;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 계약 무효 (대표만, 사유 필수)
create function public.void_contract(p_contract_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if v_reason = '' or char_length(v_reason) > 300 then
    raise exception 'REASON_REQUIRED';
  end if;
  update public.contracts set status = 'voided', voided_at = now(), void_reason = v_reason
  where id = p_contract_id and status <> 'voided';
  if not found then
    raise exception 'CONTRACT_NOT_FOUND';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'contract.void', 'contract', p_contract_id, jsonb_build_object('reason', v_reason));
end;
$$;

-- 회원 서명. 정산 정보(주민번호·계좌)가 먼저 있어야 한다. 문서 해시는 DB가 계산한다.
create function public.sign_contract(p_contract_id uuid, p_signature text, p_ip text, p_user_agent text)
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
    || v_private.rrn_masked || '|' || v_private.address || '|' || p_signature || '|' || v_signed_at::text,
    'UTF8')), 'hex');

  update public.contracts
  set status = 'signed', signed_at = v_signed_at, signature = p_signature,
      signer_rrn_masked = v_private.rrn_masked, signer_address = v_private.address,
      sign_ip = left(coalesce(p_ip, ''), 100), sign_user_agent = left(coalesce(p_user_agent, ''), 500),
      document_hash = v_hash
  where id = p_contract_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'contract.sign', 'contract', p_contract_id, jsonb_build_object('hash', v_hash));
  return v_hash;
end;
$$;


-- 정산 (PAY-01~07) ---------------------------------------------------------------------

create type public.payment_status as enum ('draft', 'scheduled', 'held', 'paid', 'cancelled');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  pay_date date not null,
  status public.payment_status not null default 'draft',
  work_amount integer not null check (work_amount >= 0),
  extra_amount integer not null check (extra_amount >= 0),
  gross integer not null check (gross >= 0),
  -- 세금은 저장할 때의 설정을 그대로 남긴다 (설정을 바꿔도 지난 내역은 그대로)
  tax_type text not null check (tax_type in ('unset', 'other', 'business', 'none')),
  tax_rule jsonb not null default '{}'::jsonb,
  income_tax integer not null default 0 check (income_tax >= 0),
  local_tax integer not null default 0 check (local_tax >= 0),
  net integer not null check (net >= 0),
  edited boolean not null default false,
  memo text not null default '' check (char_length(memo) <= 300),
  held_reason text not null default '' check (char_length(held_reason) <= 300),
  confirmed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, member_id),
  check (gross = work_amount + extra_amount),
  check (net = gross - income_tax - local_tax)
);

create index payments_pay_date_idx on public.payments (pay_date, status);
create index payments_member_idx on public.payments (member_id, pay_date desc);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create table public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  kind text not null check (kind in ('work', 'overtime', 'transport', 'regional', 'other')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  amount integer not null check (amount between 0 and 10000000),
  day_id uuid references public.event_days (id) on delete set null,
  sort_order integer not null default 0
);

create index payment_items_payment_idx on public.payment_items (payment_id, sort_order);

-- 지급 항목 저장 (대표만). 새로 만들거나, 아직 지급하지 않은 항목을 고친다.
-- p_edited: 대표가 직접 고쳤으면 true, 자동 계산으로 저장(되돌리기 포함)이면 false
-- p_items: [{"kind","label","amount","day_id"}], p_tax: {"type","rule","income_tax","local_tax"}
create function public.save_payment(
  p_event_id uuid,
  p_member_id uuid,
  p_pay_date date,
  p_items jsonb,
  p_tax jsonb,
  p_edited boolean default false,
  p_memo text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.payment_status;
  v_work integer;
  v_extra integer;
  v_income integer := coalesce((p_tax ->> 'income_tax')::integer, 0);
  v_local integer := coalesce((p_tax ->> 'local_tax')::integer, 0);
  v_type text := coalesce(p_tax ->> 'type', 'unset');
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 or p_pay_date is null then
    raise exception 'INVALID_INPUT';
  end if;
  if exists (select 1 from public.events where id = p_event_id and status = 'cancelled') then
    raise exception 'EVENT_LOCKED';
  end if;
  if not exists (
    select 1 from public.applications
    where event_id = p_event_id and member_id = p_member_id and status = 'selected'
  ) then
    raise exception 'NOT_SELECTED';
  end if;

  select id, status into v_id, v_status from public.payments where event_id = p_event_id and member_id = p_member_id for update;
  if v_status in ('paid', 'held') then
    raise exception 'PAYMENT_LOCKED';
  end if;

  begin
    select coalesce(sum((i ->> 'amount')::integer) filter (where i ->> 'kind' in ('work', 'overtime')), 0),
           coalesce(sum((i ->> 'amount')::integer) filter (where i ->> 'kind' not in ('work', 'overtime')), 0)
    into v_work, v_extra
    from jsonb_array_elements(p_items) i;

    if v_id is null then
      insert into public.payments (event_id, member_id, pay_date, status, work_amount, extra_amount, gross,
        tax_type, tax_rule, income_tax, local_tax, net, edited, memo, confirmed_at)
      values (p_event_id, p_member_id, p_pay_date, case when v_type = 'unset' then 'draft' else 'scheduled' end::public.payment_status,
        v_work, v_extra, v_work + v_extra, v_type, coalesce(p_tax -> 'rule', '{}'::jsonb), v_income, v_local,
        v_work + v_extra - v_income - v_local, coalesce(p_edited, false), btrim(coalesce(p_memo, '')),
        case when v_type = 'unset' then null else now() end)
      returning id into v_id;
    else
      update public.payments
      set pay_date = p_pay_date,
          status = case when v_type = 'unset' then 'draft' else 'scheduled' end::public.payment_status,
          work_amount = v_work, extra_amount = v_extra, gross = v_work + v_extra,
          tax_type = v_type, tax_rule = coalesce(p_tax -> 'rule', '{}'::jsonb),
          income_tax = v_income, local_tax = v_local, net = v_work + v_extra - v_income - v_local,
          edited = coalesce(p_edited, false), memo = btrim(coalesce(p_memo, '')),
          confirmed_at = case when v_type = 'unset' then null else now() end
      where id = v_id;
      delete from public.payment_items where payment_id = v_id;
    end if;

    insert into public.payment_items (payment_id, kind, label, amount, day_id, sort_order)
    select v_id, i ->> 'kind', btrim(i ->> 'label'), (i ->> 'amount')::integer, nullif(i ->> 'day_id', '')::uuid, t.ord
    from jsonb_array_elements(p_items) with ordinality as t(i, ord);
  exception
    when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or foreign_key_violation then
      raise exception 'INVALID_INPUT';
  end;

  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'payment.save', 'payment', v_id,
          jsonb_build_object('gross', v_work + v_extra, 'tax_type', v_type, 'edited', coalesce(p_edited, false)));
  return v_id;
end;
$$;

-- 지급 완료·보류·되돌리기 (대표만). 지급 완료면 회원에게 알린다.
create function public.set_payment_status(p_payment_ids uuid[], p_status public.payment_status, p_reason text default '')
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
    set status = p_status,
        paid_at = case when p_status = 'paid' then now() else null end,
        held_reason = case when p_status = 'held' then v_reason else '' end
    where p.id = any (p_payment_ids)
      and (
        (p_status = 'paid' and p.status = 'scheduled')
        or (p_status = 'held' and p.status in ('scheduled', 'draft'))
        or (p_status = 'scheduled' and p.status = 'held' and p.tax_type <> 'unset')
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

-- 이체 파일을 내려받은 기록 (대표만)
create function public.log_payment_export(p_pay_date date, p_count integer, p_total bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, detail)
  values (auth.uid(), 'payment.export', 'payment', null,
          jsonb_build_object('pay_date', p_pay_date, 'count', p_count, 'total', p_total));
end;
$$;


-- 자동 처리: 일정 취소·확정 취소 → 계약 무효, 지급 전 항목 취소 ----------------------------------------

create function public.on_event_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.contracts set status = 'voided', voided_at = now(), void_reason = '일정 취소'
    where event_id = new.id and status <> 'voided';
    update public.payments set status = 'cancelled'
    where event_id = new.id and status in ('draft', 'scheduled', 'held');
  end if;
  return new;
end;
$$;

create trigger events_cancel_contracts
  after update of status on public.events
  for each row execute function public.on_event_cancelled();

-- 확정이 풀려 이 일정에 확정된 날짜가 하나도 없으면 계약을 무효로 하고, 지급 전 정산도 취소한다
create function public.on_selection_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'selected' and new.status <> 'selected' and not exists (
    select 1 from public.applications
    where event_id = new.event_id and member_id = new.member_id and status = 'selected' and id <> new.id
  ) then
    update public.contracts set status = 'voided', voided_at = now(), void_reason = '확정 취소'
    where event_id = new.event_id and member_id = new.member_id and status <> 'voided';
    update public.payments set status = 'cancelled'
    where event_id = new.event_id and member_id = new.member_id and status in ('draft', 'scheduled', 'held');
  end if;
  return new;
end;
$$;

create trigger applications_void_contract
  after update of status on public.applications
  for each row execute function public.on_selection_removed();


-- 권한 -----------------------------------------------------------------------

revoke all on public.member_private, public.contract_templates, public.contracts, public.payments, public.payment_items
  from anon, authenticated;

-- 암호문 칸(rrn_enc, account_enc)은 읽기 권한을 주지 않는다
grant select (member_id, rrn_masked, bank_name, account_masked, account_holder, address, updated_at)
  on public.member_private to authenticated;
grant insert (member_id, rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder, address)
  on public.member_private to authenticated;
grant update (rrn_enc, rrn_masked, bank_name, account_enc, account_masked, account_holder, address)
  on public.member_private to authenticated;

grant select on public.contract_templates to authenticated;
grant select (id, event_id, member_id, template_id, template_version, status, title, body, terms, requested_at,
  notified_at, signed_at, signature, signer_rrn_masked, signer_address, sign_ip, sign_user_agent, document_hash,
  voided_at, void_reason) on public.contracts to authenticated;
grant select on public.payments, public.payment_items to authenticated;

revoke all on function public.update_setting(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_private_secrets(uuid[], text) from public, anon, authenticated;
revoke all on function public.my_private_secrets() from public, anon, authenticated;
revoke all on function public.save_contract_template(text, text) from public, anon, authenticated;
revoke all on function public.request_contract(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.remind_contracts(uuid) from public, anon, authenticated;
revoke all on function public.void_contract(uuid, text) from public, anon, authenticated;
revoke all on function public.sign_contract(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.save_payment(uuid, uuid, date, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.set_payment_status(uuid[], public.payment_status, text) from public, anon, authenticated;
revoke all on function public.log_payment_export(date, integer, bigint) from public, anon, authenticated;
revoke all on function public.on_event_cancelled() from public, anon, authenticated;
revoke all on function public.on_selection_removed() from public, anon, authenticated;

grant execute on function public.update_setting(text, jsonb, text) to authenticated;
grant execute on function public.admin_private_secrets(uuid[], text) to authenticated;
grant execute on function public.my_private_secrets() to authenticated;
grant execute on function public.save_contract_template(text, text) to authenticated;
grant execute on function public.request_contract(uuid, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.remind_contracts(uuid) to authenticated;
grant execute on function public.void_contract(uuid, text) to authenticated;
grant execute on function public.sign_contract(uuid, text, text, text) to authenticated;
grant execute on function public.save_payment(uuid, uuid, date, jsonb, jsonb, boolean, text) to authenticated;
grant execute on function public.set_payment_status(uuid[], public.payment_status, text) to authenticated;
grant execute on function public.log_payment_export(date, integer, bigint) to authenticated;

alter table public.member_private enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.payments enable row level security;
alter table public.payment_items enable row level security;

create policy "자기 정산 정보를 보고, 대표는 모두 본다"
  on public.member_private for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

create policy "활동 회원은 자기 정산 정보만 넣는다"
  on public.member_private for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.is_active_member()));

create policy "활동 회원은 자기 정산 정보만 고친다"
  on public.member_private for update to authenticated
  using (member_id = (select auth.uid()) and (select public.is_active_member()))
  with check (member_id = (select auth.uid()));

create policy "대표만 계약서 양식을 본다"
  on public.contract_templates for select to authenticated
  using ((select public.is_admin()));

create policy "자기 계약서를 보고, 대표는 모두 본다"
  on public.contracts for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

create policy "자기 정산 내역을 보고, 대표는 모두 본다"
  on public.payments for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

create policy "자기 지급 항목을 보고, 대표는 모두 본다"
  on public.payment_items for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));

-- 회원은 확정 전 금액(세금 미정)을 보지 않도록 화면에서 거른다. 상태는 함께 보여 준다.
