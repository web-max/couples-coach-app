# CLAUDE.md

- **You have superpowers skills** (`.claude/skills/`). Use them — even a 1% chance one applies, invoke it.
- **Always use caveman skill** — caveman mode (full) for prose. Code/commits/PRs/security → normal prose. "stop caveman" disables.
- **Source of truth — read first.** `SPEC.md` (product intent) and `KEY-DECISIONS.md` (settled decisions) are authoritative — check them **before any design / library / infra / product decision, and before asking the user one**; they usually already answer it. For a non-trivial feature/behavior change, also reconcile the wider canonical docs it *touches*. Anything auth, data-exposure, or public-surface shaped gets priority security scrutiny (`SPEC.md` security section; `docs/reference/BLUEPRINTS.md` for the predecessor's hardened patterns) — trivial edits exempt. If code conflicts with `SPEC.md`, surface it — don't silently follow the code.
- **Capture decisions back.** If a decision genuinely isn't covered and you have to ask the user, then once they decide, **propose a concise principle-level edit to the right doc** — `SPEC.md` for product intent, `KEY-DECISIONS.md` for settled architecture — so the same question never needs asking again. Record the durable **principle and its *why*, at the docs' existing altitude** — never a granular or one-off technical call. **Suggest it for approval; don't apply it silently.**

> Skills vendored as plain markdown (work in any container). The vendored
> `doc-reconciliation` skill carries this repo's doc map.

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- Check `SPEC.md` / `KEY-DECISIONS.md` before asking a design/product question — the answer is often already there. If it genuinely isn't, ask, then propose capturing the answer back as a principle.
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
