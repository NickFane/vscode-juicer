# Docs System — Rationale & Guardrails

> Why this repo uses progressive-disclosure docs, and the rules the `docs-audit`
> script enforces. Meta-doc; read when editing the docs system itself.

**Key files:** `scripts/docs-audit.ts`, `CLAUDE.md`, `docs/INDEX.md`, `docs/coverage.json`, `.githooks/pre-commit`
**Related:** [INDEX.md](INDEX.md)
**last-verified:** 2026-07-20

## Why

The original `CLAUDE.md` was a single long handoff doc, auto-loaded every session.
Irrelevant context measurably dilutes an LLM's attention. The fix is
**progressive disclosure**: a thin always-loaded router (`CLAUDE.md`) + on-demand
topic slices (`docs/*.md`), with a machine-readable map (`INDEX.md`) and a
faithfulness guard (`coverage.json`) so slicing can't silently drop doctrine.

## Always-loaded budget

`CLAUDE.md` + every skill's YAML frontmatter must stay under **3000 tokens**
(`CEILING_TOKENS` in `docs-audit.ts`; token ≈ chars/4). Slices are lazily loaded and
don't count. If the router grows past the ceiling, move detail into a slice.

## The guardrail (`npm run docs-audit`)

Runs on `node --experimental-strip-types` (no deps). FATAL → exit 1.

- **FATAL** always-loaded token ceiling exceeded.
- **FATAL** broken relative `*.md` link in `CLAUDE.md` or any slice.
- **FATAL** a `docs/*.md` slice not referenced in `INDEX.md` (orphan).
- **FATAL** a `coverage.json` sentinel missing from its `dest` slice.
- **WARN** a line ≥80 chars duplicated across slices (single-source-of-truth drift).
- **WARN** a slice missing a `last-verified` date or older than 6 months.

Wired via `.githooks/pre-commit` (`core.hooksPath` set by the `prepare` script) and
run in CI. Bypass a commit with `git commit --no-verify`.

## Rules for future edits

- New doctrine → add it to the relevant slice **and** a `coverage.json`
  `{topic, dest, sentinel}` entry. Don't grow `CLAUDE.md` unless the rule is
  genuinely cross-cutting (enforce-on-every-task).
- New slice → link it from `INDEX.md` and give it a `last-verified` date.
- Keep each fact in exactly one slice; cross-link instead of copying.
