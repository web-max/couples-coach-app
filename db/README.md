# db/

Postgres schema, migrations, RLS policies, and shared types. Designed natively
around app objects (sessions, coach docs, shared artifacts, situations) — but the
trust rules are ported from the predecessor: read
`docs/reference/BLUEPRINTS.md` before writing a single table.
