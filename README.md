# couples-coach-app (codename)

Standalone native couples-coaching app — the successor to
[PairGPT](https://github.com/web-max/chatgpt-relationship-app) (frozen). Each
partner talks privately with an AI coach that remembers them, chooses exactly what
crosses to the other, and works each conflict to a mutually-agreed finish.

> **Start with [`SPEC.md`](SPEC.md)** (the soul) and
> [`KEY-DECISIONS.md`](KEY-DECISIONS.md) (the twelve founding decisions). Building
> anything database-shaped? Read [`docs/reference/BLUEPRINTS.md`](docs/reference/BLUEPRINTS.md)
> first — the predecessor already paid for those lessons.

## Status

**Pre-build.** Founding docs and layout only; no application code yet. The product
needs a real name — the codename carries no meaning and the repo gets renamed when
naming happens.

## Layout

```
app/        Expo / React Native app (iOS + Android) — not yet generated
backend/    Relay (AI providers), session meter, E2EE vault, PairGPT importer
db/         Postgres schema, migrations, RLS policies, shared types
docs/       Reference docs and design ledgers
```

Two deploys (app stores + backend), one database, one repo.

## The rules that never bend

- A partner only ever sees what the owner explicitly approved.
- Transcripts transit, never persist: no readable conversation content at rest.
- Safety is enforced in the database (RLS), once, inherited by every client.
- Two keys for shared history: resolution, unlocking, deletion, and import of the
  shared record all take both partners' yes.
