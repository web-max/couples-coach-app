-- Behavioral test: RLS scoping + session RPCs.
-- Superuser does setup; RLS is exercised by switching to the authenticated
-- role and SET-ing request.jwt.claims (mirrors the harness shim semantics).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@test'),
  ('00000000-0000-0000-0000-0000000000b1', 'bob@test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- start_session auto-creates the relationship, owns the session.
do $$
declare s public.sessions;
begin
  s := public.start_session('test-model');
  if s.user_id <> '00000000-0000-0000-0000-0000000000a1'
    then raise exception 'FAIL: session owner mismatch'; end if;
  if s.relationship_id is null
    then raise exception 'FAIL: no relationship auto-created'; end if;
  if s.model <> 'test-model'
    then raise exception 'FAIL: model not recorded'; end if;
end $$;

-- Second session reuses the relationship (one per user).
do $$
declare n int;
begin
  perform public.start_session(null);
  select count(distinct relationship_id) into n from public.sessions;
  if n <> 1 then raise exception 'FAIL: expected 1 relationship, got %', n; end if;
  select count(*) into n from public.relationships;
  if n <> 1 then raise exception 'FAIL: visible relationships = % (want 1)', n; end if;
end $$;

-- Direct writes are blocked: no insert policy / no insert grant.
do $$
begin
  begin
    insert into public.sessions (relationship_id, user_id)
      values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL: direct insert into sessions allowed';
  exception
    when raise_exception then raise;
    when others then null; -- expected: permission denied
  end;
end $$;

-- Bob sees nothing of Alice's.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare n int;
begin
  select count(*) into n from public.sessions;
  if n <> 0 then raise exception 'FAIL: bob sees % sessions', n; end if;
  select count(*) into n from public.relationships;
  if n <> 0 then raise exception 'FAIL: bob sees % relationships', n; end if;
  select count(*) into n from public.relationship_members;
  if n <> 0 then raise exception 'FAIL: bob sees % memberships', n; end if;
end $$;

-- Bob cannot end Alice's session (id smuggled in via superuser peek).
reset role;
create temporary table _t as select id from public.sessions where ended_at is null limit 1;
grant select on _t to authenticated;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare v_sid uuid;
begin
  select id into v_sid from _t;
  begin
    perform public.end_session(v_sid);
    raise exception 'FAIL: bob ended alice''s session';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if; -- anything else: expected rejection
  end;
end $$;

-- Alice ends it; double-end fails.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$
declare v_sid uuid; v_ended timestamptz;
begin
  select id into v_sid from _t;
  perform public.end_session(v_sid);
  select ended_at into v_ended from public.sessions where id = v_sid;
  if v_ended is null then raise exception 'FAIL: ended_at not set'; end if;
  begin
    perform public.end_session(v_sid);
    raise exception 'FAIL: double-end succeeded';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- anon sees nothing and can execute nothing.
set local role anon;
do $$
declare n int := -1;
begin
  begin
    select count(*) into n from public.sessions;
  exception when others then n := 0; -- permission denied also acceptable
  end;
  if n <> 0 then raise exception 'FAIL: anon sees % sessions', n; end if;
  begin
    perform public.start_session(null);
    raise exception 'FAIL: anon executed start_session';
  exception
    when raise_exception then
      if sqlerrm like 'FAIL:%' then raise; end if;
    when others then null; -- expected: permission denied
  end;
end $$;

rollback;
