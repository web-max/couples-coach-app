#!/usr/bin/env bash
#
# Apply every migration in supabase/migrations/ against a throwaway local Postgres,
# in filename order, and fail loudly on the first error. Ported from the
# predecessor repo (web-max/chatgpt-relationship-app scripts/test-migrations.sh).
#
# Why this exists: our migrations target Supabase, which provides objects a bare
# Postgres lacks (the auth schema, auth.uid(), the anon/authenticated roles, an
# extensions schema for pgcrypto). The portability rule (KEY-DECISIONS §11) says
# the data layer is standard Postgres — so a thin compatibility shim is all that
# stands between our SQL and any local Postgres. This lets Claude Code (and
# developers) verify a migration applies cleanly before it reaches main, with no
# Docker, no remote Supabase project, and no credentials.
#
# Requires: a local PostgreSQL *server* install (initdb/pg_ctl/psql). It does NOT
# require the Supabase CLI or Docker. On Debian/Ubuntu: `apt-get install
# postgresql`. The cluster is created in a temp dir, listens on a unix socket
# only (no TCP port), and is destroyed on exit.
#
# Usage: npm run db:test   (or: bash scripts/test-migrations.sh)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/supabase/migrations"

# --- locate the Postgres server binaries ----------------------------------
BINDIR="$(pg_config --bindir 2>/dev/null || true)"
if [ -z "$BINDIR" ] || [ ! -x "$BINDIR/initdb" ]; then
  BINDIR="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "$BINDIR" ] || [ ! -x "$BINDIR/initdb" ]; then
  echo "error: PostgreSQL server binaries (initdb/pg_ctl) not found." >&2
  echo "       Install a local Postgres, e.g. 'apt-get install postgresql'." >&2
  exit 1
fi

# Postgres refuses to run as root. When invoked as root (e.g. a cloud agent
# container) we run the cluster as the unprivileged 'postgres' system user;
# otherwise we run as the current user.
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  PG_USER="postgres"
  run_pg() { sudo -u postgres "$@"; }
else
  PG_USER="$(id -un)"
  run_pg() { "$@"; }
fi

WORKDIR="$(mktemp -d /tmp/cca-migtest.XXXXXX)"
DATA="$WORKDIR/data"
mkdir -p "$DATA"
[ "$PG_USER" = "postgres" ] && chown -R postgres:postgres "$WORKDIR"

cleanup() {
  run_pg "$BINDIR/pg_ctl" -D "$DATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

PSQL=("$BINDIR/psql" -h "$WORKDIR" -p 5433 -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

echo "→ initializing throwaway cluster (PostgreSQL $("$BINDIR/postgres" --version | awk '{print $3}'))"
run_pg "$BINDIR/initdb" -D "$DATA" -U postgres --auth=trust >/dev/null
# Unix-socket only: no TCP port, so this never collides with a real local server.
run_pg "$BINDIR/pg_ctl" -D "$DATA" \
  -o "-k $WORKDIR -p 5433 -c listen_addresses=''" \
  -l "$WORKDIR/server.log" -w start >/dev/null

# --- Supabase-compatibility shim -------------------------------------------
# The minimum surface our migrations reference. Mirrors Supabase semantics:
# auth.uid()/auth.role() read the request.jwt.claims GUC, so RLS can be
# exercised by SET-ing that claim inside a transaction.
echo "→ applying Supabase compatibility shim"
run_pg "${PSQL[@]}" <<'SQL'
create role anon            nologin noinherit;
create role authenticated   nologin noinherit;
create role service_role    nologin noinherit bypassrls;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists auth;

-- Only the auth.users columns our migrations actually touch.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  confirmed_at       timestamptz,
  email_confirmed_at timestamptz,
  created_at         timestamptz default now()
);
grant usage on schema auth to anon, authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', 'anon');
$$;
SQL

# --- apply every migration in filename order --------------------------------
count=0
if compgen -G "$MIGRATIONS_DIR/*.sql" >/dev/null 2>&1; then
  echo "→ applying migrations from supabase/migrations/"
  for f in "$MIGRATIONS_DIR"/*.sql; do
    if run_pg "${PSQL[@]}" -f "$f" >/dev/null 2>"$WORKDIR/err.log"; then
      echo "  ok   $(basename "$f")"
      count=$((count + 1))
    else
      echo "  FAIL $(basename "$f")" >&2
      echo "----------------------------------------" >&2
      cat "$WORKDIR/err.log" >&2
      exit 1
    fi
  done
fi

echo "✓ all $count migrations applied cleanly"

# --- run behavioral tests, if any ------------------------------------------
# Each db/tests/*.sql exercises the applied schema with assertions (RAISE
# EXCEPTION on a failed expectation). ON_ERROR_STOP makes any failure abort psql
# nonzero, so a broken expectation fails the run. Test files manage their own
# setup/teardown (BEGIN ... ROLLBACK) for isolation.
TESTS_DIR="$REPO_ROOT/db/tests"
if compgen -G "$TESTS_DIR/*.sql" >/dev/null 2>&1; then
  echo "→ running behavioral tests from db/tests/"
  tcount=0
  for f in "$TESTS_DIR"/*.sql; do
    if run_pg "${PSQL[@]}" -f "$f" >/dev/null 2>"$WORKDIR/err.log"; then
      echo "  ok   $(basename "$f")"
      tcount=$((tcount + 1))
    else
      echo "  FAIL $(basename "$f")" >&2
      echo "----------------------------------------" >&2
      cat "$WORKDIR/err.log" >&2
      exit 1
    fi
  done
  echo "✓ all $tcount behavioral test files passed"
fi
