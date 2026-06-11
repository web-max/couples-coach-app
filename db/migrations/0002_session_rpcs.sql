-- 0002_session_rpcs.sql — RPC-only writes for sessions.
-- SECURITY DEFINER with pinned search_path; EXECUTE for authenticated only,
-- never anon (predecessor rule: no RPC is ever granted to anon).

create or replace function public.start_session(p_model text default null)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rel uuid;
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select relationship_id into v_rel
    from public.relationship_members
   where user_id = v_uid;

  if v_rel is null then
    insert into public.relationships default values returning id into v_rel;
    insert into public.relationship_members (relationship_id, user_id)
      values (v_rel, v_uid);
  end if;

  insert into public.sessions (relationship_id, user_id, model)
    values (v_rel, v_uid, p_model)
    returning * into v_session;
  return v_session;
end;
$$;

create or replace function public.end_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.sessions
     set ended_at = now()
   where id = p_session_id
     and user_id = auth.uid()
     and ended_at is null;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'session not found, not yours, or already ended';
  end if;
end;
$$;

revoke all on function public.start_session(text) from public, anon;
revoke all on function public.end_session(uuid) from public, anon;
grant execute on function public.start_session(text) to authenticated;
grant execute on function public.end_session(uuid) to authenticated;
