-- 0001_init.sql — founding schema: relationships, memberships, sessions.
-- Trust rules ported from the predecessor (docs/reference/BLUEPRINTS.md):
-- RLS is the gate; every row scopes to a relationship; RPC-only writes;
-- no anon grants; identity always from auth.uid().

create table public.relationships (
  id         uuid primary key default gen_random_uuid(),
  status     text not null default 'solo' check (status in ('solo', 'active')),
  created_at timestamptz not null default now()
);

create table public.relationship_members (
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (relationship_id, user_id)
);

-- One active relationship per user. Plain unique for now: memberships have no
-- inactive state yet; relax to a partial index when lifecycle lands.
create unique index relationship_members_one_per_user
  on public.relationship_members (user_id);

-- Coaching-session METADATA only — transcripts live on the device, never here
-- (SPEC.md: transcripts transit, never persist).
create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  model           text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index sessions_user_started on public.sessions (user_id, started_at desc);

alter table public.relationships enable row level security;
alter table public.relationship_members enable row level security;
alter table public.sessions enable row level security;

create policy member_reads_relationship on public.relationships
  for select to authenticated
  using (exists (
    select 1 from public.relationship_members m
    where m.relationship_id = relationships.id and m.user_id = auth.uid()
  ));

create policy member_reads_own_membership on public.relationship_members
  for select to authenticated
  using (user_id = auth.uid());

-- Sessions are private coaching: owner-only, never the partner.
create policy owner_reads_own_sessions on public.sessions
  for select to authenticated
  using (user_id = auth.uid());

-- No anon surface at all; authenticated reads pass through RLS; all writes
-- happen via SECURITY DEFINER RPCs (migration 0002) — no direct write grants.
revoke all on all tables in schema public from anon;
grant select on public.relationships, public.relationship_members, public.sessions
  to authenticated;
