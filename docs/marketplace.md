# Marketplace (Deferred)

> Why the chat effects can't be marketplace-safe today, what IS safe, and the
> split-architecture path for later. Captured so it is not re-litigated or
> prematurely attempted.

**Key files:** `out/src/chat-renderer-installer.js`, `renderer/vscode-juicer-injector.js`
**Related:** [renderer-injection.md](renderer-injection.md), [publishing.md](publishing.md), [architecture.md](architecture.md)
**last-verified:** 2026-07-20

## The constraint

The Copilot Chat / webview effects require patching `workbench.html` — there is **no
public VS Code API** to hook the chat input or decorate that webview. The patch
strips the CSP meta and injects a script, which unavoidably triggers VS Code's
"installation appears corrupt" banner. This technique is the same one Custom CSS / JS
Loader uses; Microsoft tolerates but discourages it and has been tightening
enforcement. So the chat renderer effects **cannot be made marketplace-safe**.

Decision: keep the working workbench-patch approach and distribute via GitHub
Releases VSIX ([publishing.md](publishing.md)). Do not attempt a marketplace listing
of the current unified extension.

## What IS marketplace-safe

- Editor text effects via `createTextEditorDecorationType` (real text documents only)
  — exactly what the original power-mode ships to the marketplace.
- The extension's own webviews.
- Status-bar / notification UI.

## Future split-architecture path (when a listing is wanted)

Split into: (1) a **marketplace-safe editor-effects core** (decorations / status bar /
own-webview HUD, zero workbench patching), publishable and review-clean; and (2) a
**sideloaded opt-in chat-renderer add-on** (the current workbench patch), distributed
via GitHub Releases only. This gives a marketplace presence without takedown risk.

## In progress: the Composer prototype

A concrete instance of option (1) above is being prototyped: a fully extension-owned
webview ("Composer") hosting the same juice effects, forwarding composed text into
real Copilot Chat via the built-in `workbench.action.chat.open` command instead of
patching anything. → [composer.md](composer.md) for the design and status. This is
**not merged, not a conclusion** — it lives on its own branch/PR pending hands-on
testing, since the forwarding command's real-world feel can't be verified without a
real VS Code window.

## Tombstone

Do **not** reintroduce Custom CSS / JS Loader integration as a shortcut — it was
explicitly ruled out for this project.
