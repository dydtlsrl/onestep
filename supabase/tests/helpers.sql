-- 테스트 도우미 함수. run.sh가 테스트 파일들보다 먼저 한 번 적용한다.

create schema tests;

create function tests.expect_error(p_sql text, p_like text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like p_like then
      raise notice 'PASS  % -> %', left(p_sql, 70), sqlerrm;
      return;
    end if;
    raise exception 'FAIL  % raised "%" (expected like "%")', p_sql, sqlerrm, p_like;
  end;
  raise exception 'FAIL  % did not raise (expected like "%")', p_sql, p_like;
end;
$$;

create function tests.expect_count(p_sql text, p_expected bigint, p_label text)
returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute format('select count(*) from (%s) t', p_sql) into v_count;
  if v_count <> p_expected then
    raise exception 'FAIL  % : expected % rows, got %', p_label, p_expected, v_count;
  end if;
  raise notice 'PASS  % (% rows)', p_label, v_count;
end;
$$;

create function tests.expect_true(p_value boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'FAIL  %', p_label;
  end if;
  raise notice 'PASS  %', p_label;
end;
$$;

-- 요청한 사람을 바꾼다 (null이면 로그인 안 한 사람)
create function tests.act_as(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end,
    false);
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;


