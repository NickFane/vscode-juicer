# VSCode Juicer

A standalone VS Code extension that adds gamification "juice" to typing: editor-side
combo/shake/explosion effects **plus** renderer-side effects for Copilot Chat and
other webview inputs (delivered by patching the workbench HTML).

> **Doctrine lives in `docs/` — load a slice on demand, not all at once.** This file
> is the always-in-context router: universal rules + a map of where each subsystem's
> detail lives. When a task touches a subsystem, `Read` the one `docs/*.md` slice
> named below (or grep [docs/INDEX.md](docs/INDEX.md)). Do NOT paste subsystem detail
> back here — a pre-commit hook (`pnpm`/`npm run docs-audit`) enforces a token ceiling.
> Add new doctrine to the relevant slice + `docs/coverage.json`.

## Identity
- Package `vscode-juicer`, publisher `nicholasfane-local` (local placeholder — see
  [docs/publishing.md](docs/publishing.md)), extension id `nicholasfane-local.vscode-juicer`.
- Settings namespace `vscodeJuicer.*`; chat settings `vscodeJuicer.chat.*`.
- Distribution is **GitHub Releases VSIX**, not the marketplace. → [docs/marketplace.md](docs/marketplace.md)

## Stack
- **Extension host** — `out/src/extension.js`: editor effects on real text docs,
  commands, sidebar webview, config sync, typing stats. → [docs/architecture.md](docs/architecture.md)
- **Renderer injector** — `renderer/vscode-juicer-injector.js`: chat/webview effects,
  injected into the workbench. → [docs/effects.md](docs/effects.md), [docs/live-config.md](docs/live-config.md)
- **Installer** — `out/src/chat-renderer-installer.js`: patches `workbench.html`
  (locate, strip, inject, backup/restore). → [docs/renderer-injection.md](docs/renderer-injection.md)
- **Pure core** — `out/src/chat-config.js`: the only `vscode`/`fs`-free module
  (presets, strip/inject, merge). All logic lives here to stay testable. → [docs/testing.md](docs/testing.md)
- **Sidebar** — `out/src/chat-settings-view.js` (webview host) + `out/src/chat-settings-fields.js`
  (pure field/category descriptors + step-button math). → [docs/sidebar-ui.md](docs/sidebar-ui.md)

## Global rules (enforce on every task)
- **Workbench injection is single-source & marker-managed** — always strip the old
  block before reinjecting; keep it reversible via the backup. → [docs/renderer-injection.md](docs/renderer-injection.md)
- **The renderer is sandboxed — no Node** (`require` is undefined). Renderer↔host
  transport must be browser-safe (fetch), never `fs`. → [docs/live-config.md](docs/live-config.md)
- **Change config shape → update installer globals AND renderer polling/apply
  together** (a test enforces the shape stays in sync). → [docs/live-config.md](docs/live-config.md)
- **New `RUNTIME_KEYS` entry → add a `chat-settings-fields.js` `FIELDS` descriptor**
  too (a test enforces 1:1 coverage) or it never reaches the sidebar. → [docs/sidebar-ui.md](docs/sidebar-ui.md)
- **Change package identity → update manifest ids, command ids, settings namespaces,
  storage keys, and workbench markers together.** → [docs/architecture.md](docs/architecture.md)
- **Do NOT reintroduce Custom CSS / JS Loader integration.** → [docs/marketplace.md](docs/marketplace.md)
- **`onPowermodeStart`/`onPowermodeStop` are internal contract names, not branding** —
  don't rename casually. → [docs/architecture.md](docs/architecture.md)
- **Prefer editing the repo copy, then package/install from it** — never edit the
  installed extension folder or `workbench.html` by hand. → [docs/publishing.md](docs/publishing.md)

## Documentation map (load a slice when the task matches)
Full index with trigger keywords: [docs/INDEX.md](docs/INDEX.md).

| Topic | Slice | Load when |
|---|---|---|
| Two-layer architecture, pure core | [docs/architecture.md](docs/architecture.md) | host vs renderer, `chat-config`, provenance |
| Workbench patching | [docs/renderer-injection.md](docs/renderer-injection.md) | markers, `stripPatch`/`applyPatch`, backup, CSP |
| Live config + preset switching | [docs/live-config.md](docs/live-config.md) | `__vscodeJuicerConfigUrl`, `applyLiveConfig`, "needs reload" |
| Presets | [docs/presets.md](docs/presets.md) | `vscodeJuicer.chat.preset`, `insanity`, `safetyOff` |
| Effects + backlog | [docs/effects.md](docs/effects.md) | combo, shake, particles, WPM, new juice ideas |
| Testing | [docs/testing.md](docs/testing.md) | `vitest`, jsdom, adding a test, CI |
| Publishing / VSIX | [docs/publishing.md](docs/publishing.md) | release, `.vscodeignore`, `vsce` |
| Updating local copy | [docs/llm-update-guide.md](docs/llm-update-guide.md) | user asks how to install/update |
| Marketplace (deferred) | [docs/marketplace.md](docs/marketplace.md) | marketplace safety, split architecture |

## Dev workflow
- `npm install` (wires the pre-commit hook via `prepare`).
- `npm test` — `validate:bundle` (syntax) + Vitest. `npm run test:watch` for watch.
- `npm run docs-audit` — checks the docs system (token ceiling, links, coverage,
  staleness); also runs via the pre-commit hook.
- `npm run package` — build the VSIX into `dist/`. → [docs/publishing.md](docs/publishing.md)
