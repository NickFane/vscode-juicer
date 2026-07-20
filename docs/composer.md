# Composer (Prototype)

> A fully extension-owned webview that hosts the juice effects and forwards
> composed text into real Copilot Chat — no workbench patching. Exploratory;
> lives on `claude/juicer-composer-prototype`, not merged into `main`.

**Key files:** `renderer/effects-core.js`, `out/src/juicer-composer-view.js`, `out/src/extension.js` (`getChatEffectConfig`, `submitToChat`)
**Related:** [marketplace.md](marketplace.md), [architecture.md](architecture.md), [effects.md](effects.md)
**last-verified:** 2026-07-20

## Why this exists

Every effect on the patched renderer requires modifying `workbench.html`, which
trips VS Code's "installation appears corrupt" checksum banner — confirmed to be a
byte-level integrity check with no smaller/safer patch that avoids it. Research
found `workbench.action.chat.open` is a stable, documented, built-in command
(confirmed via an official Microsoft-maintainer answer) that accepts
`{ query: string, isPartialQuery: boolean }` — `isPartialQuery: true` prefills the
real chat input without submitting; omitted/`false` submits. No proposed API, no
chat-participant registration, no patch required.

## Design

`renderer/effects-core.js` is the particle/hit-counter/growth/float/shake/combo/WPM
logic extracted from `vscode-juicer-injector.js`, made host-agnostic: no
`window.__vscodeJuicer*` globals, no `fetch`, no anchor-guessing across arbitrary
external DOM. A host supplies a plain config object and, on each qualifying
keystroke, calls `effects.triggerKeystroke({x, y}, containerEl)` with coordinates it
already knows (because it owns its own input element) — no CSS-selector matching needed,
unlike the injector which has to search someone else's DOM.

`out/src/juicer-composer-view.js` is a `registerWebviewViewProvider` host (same
shape as `chat-settings-view.js`) that:
- Loads `effects-core.js` via a genuine `<script src>` (`webview.asWebviewUri`),
  not string duplication.
- Hosts a `<textarea>`; on keydown/beforeinput calls into `effects-core` the same
  way the patched renderer does, anchored via a mirror-div caret-coordinate
  estimate (textareas have no native caret-position API).
- Reads the *same* `vscodeJuicer.chat.*` settings as the patched renderer, via a
  shared `getChatEffectConfig()` helper in `extension.js` (no new settings surface).
- **Submit modes**, both via `workbench.action.chat.open`:
  - **Compose-then-send** (default): Enter/Send submits (`isPartialQuery: false`).
  - **Live-sync** (opt-in checkbox in the webview, not a settings.json toggle):
    debounced (400ms) `isPartialQuery: true` calls mirror text into the real chat
    input as you type.

## What's deliberately NOT done in this prototype

- `vscode-juicer-injector.js` / `chat-renderer-installer.js` are **untouched** —
  the patched renderer still works exactly as before. Unifying the injector to
  also consume `effects-core.js` is a **deferred follow-up**, done only after this
  prototype is validated, to avoid regressing an already-shipped, tested component
  for an exploratory branch that might be abandoned.
- No new `vscodeJuicer.composer.*` settings were added — the live-sync toggle is
  plain in-webview UI state (resets on reload), not persisted config, to keep the
  prototype's surface minimal until the mechanism itself is validated.

## What needs real-VS-Code testing (cannot be verified in this sandbox)

- Whether `workbench.action.chat.open` behaves as documented across chat modes.
- Whether live-sync feels smooth or steals focus/scroll on rapid typing.
- Caret-anchor accuracy of the mirror-div technique against real font metrics.
- General feel of the effects in a small sidebar-embedded webview vs. the full
  patched-renderer experience.

## Testing

`test/effects-core.test.js` — the extracted logic in isolation (growth cap,
float toggle, overlap-fix positioning, particle count, WPM).
`test/juicer-composer-view.test.js` — loads the real webview HTML/script into
jsdom, wires `effects-core.js` the same way the browser would, and drives
keydown/submit/live-sync-debounce behavior.
