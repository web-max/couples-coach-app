# db/

Postgres schema, migrations, RLS policies, and shared types. Designed natively
around app objects (sessions, coach docs, shared artifacts, situations) — but the
trust rules are ported from the predecessor: read
`docs/reference/BLUEPRINTS.md` before writing a single table.

## Layout & testing

- Migrations live in `supabase/migrations/` at the repo root (standard Supabase
  layout, `YYYYMMDDHHMMSS_name.sql`, applied in timestamp order) so Supabase's
  GitHub integration auto-applies them on push. Session *metadata* only lives
  there; transcripts never touch the database.
- `tests/` — behavioral SQL tests (RLS scoping, RPC contracts); each file is
  self-isolating (`begin … rollback`) and fails via `raise exception`.
- Run both with `npm run db:test` — applies everything to a throwaway local
  Postgres with a Supabase shim (no Docker, no credentials, no remote project).
