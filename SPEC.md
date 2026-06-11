# SPEC.md — Spirit & Intent (codename: couples-coach-app)

This is the *why* and the *soul* of the product — read it to understand what we're
building and the principles that should survive every refactor. Technical detail
belongs in `docs/` as it gets designed. The product needs a real name; the codename
carries no meaning.

## The product in one sentence

A native mobile app where each partner talks privately with an AI coach that
genuinely remembers them, chooses exactly what crosses to the other, and works each
conflict turn by turn to a mutually-agreed finish — the coach seeing both sides,
the couple building a consensual record of growth without ever exposing raw venting.

## Lineage

This is the standalone successor to **PairGPT** (the frozen ChatGPT-connector
product). Same soul — consensual both-sides coaching — new engine: our own AI, full
conversations, real memory, no ChatGPT dependency. The predecessor's repo holds the
battle-tested trust blueprints we adapt (see `docs/reference/BLUEPRINTS.md`).

## What it is

- **Coaching happens in the app, with our AI.** Full conversations, voice or text.
  The backend relays to AI providers; the model is a config choice, never an app
  dependency. We pay for inference and meter usage (see `KEY-DECISIONS.md`).

- **Your words stay yours: transcripts transit, never persist.** Full transcripts
  live on the user's device, with an opt-in end-to-end-encrypted backup only the
  user's key can open. Our servers process conversation content in transit — that
  is how chatting works — and never store it readable. At rest we hold only what
  the owner approved for sharing plus the distilled coach docs.

- **A coach that remembers.** After sessions, the AI distills the full conversation
  into a **personal coach doc** — patterns, triggers, what's helped — stored with
  the account, private to its owner, so a lost phone never erases the coach's
  memory. A **relationship coach doc** is built server-side from both partners'
  material via send–build–purge–deliver: by default only from already-shared
  artifacts; each partner may independently and reversibly opt in to include their
  own private material; the output never quotes or attributes one side.

- **The consent ritual, coach-assisted.** At session end the coach drafts a
  partner-safe summary; the owner reads, edits, and approves before anything
  crosses. Summaries land in **situations** (one per ongoing topic); once read by
  the partner they lock against silent rewriting; resolution takes both partners'
  yes. The coach removes the friction — drafting, filing — never the steps.

## What it is NOT

- **Not surveillance.** A partner only ever sees what the owner explicitly approved
  — never raw chat, never drafts, never the personal coach doc.
- **Not a transcript warehouse.** No readable conversation content at rest on our
  servers, ever. The E2EE vault is opaque to us by construction.
- **Not a therapist** and not a content moderator; it is a coaching tool.
- **Not a public feed or a scoreboard.** No public per-couple surface of any kind.

## Core principles (the spirit)

1. **Consent and ownership are sacred.** The owner approves every crossing; only
   the owner edits or deletes their own material.
2. **Trust is built into the data model.** Read-locks, two-party resolution and
   deletion — history nobody can quietly rewrite.
3. **Safety is the database's job, enforced once.** Couple scoping, partner-read
   rules, locks: enforced in Postgres RLS, inherited by every client, never
   re-implemented in app code.
4. **We process, we never keep.** The honest privacy promise: conversation content
   crosses our servers in transit and is never stored readable. Custody of raw
   words belongs to the device and the user-keyed vault.
5. **Reversible by default.** Opt-ins are per-person, explained plainly, and
   revocable; deletion is mutual with a grace period.
6. **Minimal, honest, portable.** Store the least we need; no vendor lock-in
   without an escape route; plain language over therapy-speak, calm over salesy.

## Who it's for

Couples — multi-tenant from day one (everything scopes to the relationship), each
user in exactly one active relationship at a time. Former PairGPT users migrate via
a one-time import: private material on the owner's sole say-so, the shared record
only when both partners have joined and both consent.

## Security: the reasoning

The at-rest surface is deliberately small: approved shared artifacts and coach
docs, scoped by RLS; opaque E2EE blobs; no anonymous read surface. The new exposure
relative to the predecessor is **transit processing** (relay traffic to AI
providers) and **short-lived build windows** (relationship-doc inputs, purged
immediately after) — both bounded in time, neither queryable at rest. The promise
to protect above all: *you control exactly what becomes shared, and nothing crosses
without your explicit yes.* A trust breach is brand-ending for this product; data
sensitivity sets the floor, and the floor is high.
