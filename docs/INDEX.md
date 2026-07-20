# Doctrine Index

> Machine-readable router. Grep this, then `Read` the one slice you need — don't
> pull all doctrine into context. `CLAUDE.md` carries the always-loaded global
> rules + a compact version of this map. Full format: **[file](path)** — purpose ·
> *load when* · trigger keywords.

## Core

- **[architecture.md](architecture.md)** — the two runtime layers + the pure core ·
  *load when* touching how host/renderer/installer fit together · `extension host`,
  `renderer injector`, `chat-config`, `onPowermodeStart`, provenance.
- **[renderer-injection.md](renderer-injection.md)** — patching workbench.html ·
  *load when* changing injection/markers/backup/CSP · `stripPatch`, `applyPatch`,
  `workbench.vscode-juicer.bak`, `locateWorkbench`, markers.
- **[live-config.md](live-config.md)** — live updates + preset switching ·
  *load when* touching config propagation or the "needs reload" behavior ·
  `__vscodeJuicerConfigUrl`, `startLiveConfigPolling`, `applyLiveConfig`,
  `resolveRuntime`, `lastAppliedChatPreset`.
- **[presets.md](presets.md)** — the two preset systems · *load when* adding/editing
  a preset · `vscodeJuicer.presets`, `vscodeJuicer.chat.preset`, `juicy-subtle-v1`,
  `legacy`, `insanity`, `safetyOff`.
- **[effects.md](effects.md)** — what the juice is + backlog · *load when* adding an
  effect or gamification feature · `combo`, `shake`, `particles`, WPM, heat, backlog.
- **[sidebar-ui.md](sidebar-ui.md)** — the data-driven Control Deck webview ·
  *load when* adding/editing a sidebar setting or step-button behavior ·
  `chat-settings-fields`, `FIELDS`, `CATEGORIES`, `deriveSteps`, stepper.

## Tooling, ops & context

- **[testing.md](testing.md)** — the pure-logic test seams + CI · *load when* adding
  a test or touching CI · `vitest`, `jsdom`, `chat-config`, `validate:bundle`.
- **[publishing.md](publishing.md)** — VSIX build + GitHub Releases + local install ·
  *load when* releasing or changing packaging · `vsce`, `.vscodeignore`,
  `release.yml`, `update-local.sh`.
- **[llm-update-guide.md](llm-update-guide.md)** — runbook to direct the user through
  updating their local copy · *load when* the user asks how to update/install.
- **[marketplace.md](marketplace.md)** — why the marketplace is deferred + the future
  split path · *load when* marketplace/publishing-safety comes up.
- **[METRICS.md](METRICS.md)** — rationale + guardrails for this docs system ·
  *load when* editing the docs system, `docs-audit`, or the token ceiling.

## Retired / tombstones

- **Custom CSS / JS Loader integration** — deliberately NOT used. Do not reintroduce
  it as a shortcut for renderer effects. → [marketplace.md](marketplace.md)
- **Renderer `require('fs')` live-config transport** — dead. It silently no-op'd in
  the sandboxed renderer (caused "preset needs reload"). Replaced by a relative
  `fetch` of `__vscodeJuicerConfigUrl`. → [live-config.md](live-config.md)
