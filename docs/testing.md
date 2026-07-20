# Testing

> Fast, deterministic unit tests over the seams where an LLM is most likely to
> break something. No real-VS-Code integration (by design).

**Key files:** `test/*.test.js`, `vitest.config.js`, `out/src/chat-config.js`, `.github/workflows/ci.yml`
**Related:** [live-config.md](live-config.md), [architecture.md](architecture.md), [publishing.md](publishing.md)
**last-verified:** 2026-07-20

## Run

- `npm test` — `pretest` runs `validate:bundle` (syntax parse of the two entry
  files), then `vitest run`.
- `npm run test:watch` — watch mode.

## What is tested (the pure seams)

The testable logic lives in the dependency-free `out/src/chat-config.js`, so tests
need no `vscode`:

- `test/chat-config.test.js` — presets have every runtime key; `resolveRuntime`
  precedence; `stripPatch` reversibility + idempotence; `makeInjectedBlock` markers;
  `applyPatch` CSP-strip + inject + idempotence.
- `test/preset-switch.test.js` — models the config flow to prove the preset-switch
  bug and its fix (B2).
- `test/renderer-injector.test.js` — loads the real injector in jsdom: config-merge
  precedence, `applyLiveConfig` live update, DEFAULT_CONFIG↔preset shape sync, and a
  guard that the sandbox-safe transport is in place.

## Adding a test

Prefer adding logic to `chat-config.js` (pure) and testing it there. For renderer
behavior, drive it through the globals the injector exposes
(`window.__vscodeJuicerApplyConfig`, `window.vscodeJuicer.getConfig()`) under the
`// @vitest-environment jsdom` docblock. Anything touching `vscode`/`fs` is not
unit-tested — keep such code thin and push logic into the pure core.

## CI

`.github/workflows/ci.yml` runs `validate:bundle`, `npm test`, and `docs-audit` on
every push/PR (Node 22, no VS Code download needed).
