# Presets

> Two independent preset systems live in this repo. Do not confuse them.

**Key files:** `out/src/chat-config.js` (chat presets), `out/src/config/*.js` (editor visual presets), `package.json` (both enums)
**Related:** [live-config.md](live-config.md), [effects.md](effects.md)
**last-verified:** 2026-07-20

## 1. Editor visual presets

Setting `vscodeJuicer.presets` — enum `particles | fireworks | flames | magic |
clippy | simple-rift | exploding-rift`. These are the **editor visual presets**:
ThemeConfig objects (explosion gifs + CSS/timing) defined in `out/src/config/*.js`
and wired via the `themes` map in `extension.js`. They drive the editor-side cursor
exploder, not the chat renderer.

## 2. Chat renderer presets

Setting `vscodeJuicer.chat.preset` — enum `juicy-subtle-v1 | legacy | insanity`.
Defined in `PRESETS` in `chat-config.js` (and mirrored as `DEFAULT_CONFIG` for the
baseline in the injector). Each is a flat object of ~24 runtime fields.

- `juicy-subtle-v1` — tuned, restrained baseline (the default).
- `legacy` — bigger particles, looping shake, hit counter off.
- `insanity` — intentionally extreme; sets `safetyOff: true` and unlocks meme
  particles + screen flash. Can make the editor borderline unusable.

## safetyOff

`safetyOff` is the danger flag `insanity` sets. `applyPreset` / `presetConfigEntries`
**never force-write `safetyOff`** — it stays opt-in so applying insanity does not
silently trap the user. It is resolved from the preset only when unset (default false).

## Adding / changing a chat preset

Update `PRESETS` in `chat-config.js`, the `enum` in `package.json`
(`vscodeJuicer.chat.preset`), and — if you change field shape — the renderer's
`DEFAULT_CONFIG`. Every preset must define every `RUNTIME_KEYS` entry (a test enforces this).
