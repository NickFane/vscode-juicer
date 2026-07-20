# Live Config & Preset Switching

> How renderer config updates reach the already-loaded injector without a reload,
> and how preset changes propagate. This is where the historical "preset needs
> reload" bug lived.

**Key files:** `renderer/vscode-juicer-injector.js`, `out/src/chat-renderer-installer.js`, `out/src/extension.js`, `out/src/chat-config.js`
**Related:** [presets.md](presets.md), [renderer-injection.md](renderer-injection.md), [testing.md](testing.md)
**last-verified:** 2026-07-20

## The transport (sandbox-safe)

The workbench renderer is sandboxed — there is **no Node `require('fs')`** there.
The original poller used `fs.readFileSync` inside a `try/catch`, so it silently
no-op'd and config only refreshed on a window reload.

Current design:

- The installer writes the runtime config to `vscode-juicer-live-config.json`
  **next to `workbench.html`** (in the workbench dir), via `writeLiveConfigFile`.
- `makeInjectedBlock` exposes that relative filename as `window.__vscodeJuicerConfigUrl`
  plus an inline `window.__vscodeJuicerConfig` snapshot for correct first paint.
- The renderer's `startLiveConfigPolling` does `fetch(configUrl, {cache:'no-store'})`
  every 500 ms and calls `applyLiveConfig` when the text changes.

> Environment caveat: the relative-fetch transport must be verified against a real
> sandboxed workbench (a dev machine). If a future VS Code build blocks the fetch,
> fall back to a "Reload to apply" toast — but verify before assuming.

## applyLiveConfig

`applyLiveConfig(newCfg)` `Object.assign`s into the live `config` (every field the
renderer reads per-keystroke updates immediately) and pushes the animation-timing
CSS custom properties (`--pm-shake-duration`, etc.). No config value is cached at
load beyond `safetyOff`/`particleDistanceRange`, which it recomputes.

## Preset switching (the enum fix)

`resolveRuntime(presetName, get)` reads each key as `get(key, presetDefault)`, so an
explicit per-key value always wins. `applyPreset` writes every preset key explicitly,
which means that once any preset is applied, flipping only the `preset` dropdown was
inert. Fix: `extension.js`'s config-change handler detects a `vscodeJuicer.chat.preset`
change and **re-applies the preset** (writes the new per-key values), guarded by
`lastAppliedChatPreset` against a write-loop.

## Rule

If you change the renderer config shape, update **both** the installer globals
(`makeInjectedBlock`, `chat-config.js`) **and** the renderer polling/application
code (`DEFAULT_CONFIG`, `applyLiveConfig`) together — a test enforces they stay in sync.
