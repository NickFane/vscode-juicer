# Architecture

> Two runtime layers: the extension host (editor effects) and the renderer
> injector (chat/webview effects). Understanding the split is the key to the whole repo.

**Key files:** `out/src/extension.js`, `out/src/chat-renderer-installer.js`, `renderer/vscode-juicer-injector.js`, `out/src/chat-config.js`
**Related:** [renderer-injection.md](renderer-injection.md), [live-config.md](live-config.md), [effects.md](effects.md)
**last-verified:** 2026-07-20

## The two layers

VSCode Juicer runs as **extension host and renderer injector**, because the two
surfaces deliver keystrokes differently:

1. **Extension host** (`out/src/extension.js`) — sees real text documents via
   `onDidChangeTextDocument`. Drives the classic editor effects (combo, shake,
   cursor explosions) through the plugin classes in `out/src/screen-shaker/`,
   `out/src/cursor-exploder/`, `out/src/combo/`. This is the marketplace-safe surface.

2. **Renderer injector** (`renderer/vscode-juicer-injector.js`) — runs inside the
   workbench web page. Copilot Chat / webview typing does **not** flow through
   `onDidChangeTextDocument`, so effects there need code running in the renderer.
   The extension patches the workbench HTML to load this script (see
   [renderer-injection.md](renderer-injection.md)).

## Pure core

`out/src/chat-config.js` is the **only** dependency-free module (no `vscode`, no
`fs`): presets, marker strip/inject (`stripPatch`/`applyPatch`), the
`resolveRuntime` merge, and `makeInjectedBlock`. The installer talks to
`vscode`/`fs` and delegates all logic here so it is unit-testable. → [testing.md](testing.md)

## Provenance note

The editor-side code descends from `vscode-power-mode`. Its internal plugin
contract still uses the historical method names `onPowermodeStart` /
`onPowermodeStop` (shared across `combo-plugin.js`, `screen-shaker.js`,
`cursor-exploder.js`, `editor-combo-meter.js`). These are **internal identifiers,
not user-facing branding** — do not rename them casually; it is a cross-file
contract with no user benefit to changing.
