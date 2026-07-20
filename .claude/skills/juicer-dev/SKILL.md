---
name: juicer-dev
description: Build, install, and verify a VSCode Juicer change on a local VS Code. Use when packaging the extension, testing renderer/injector changes end-to-end, cutting a release VSIX, or diagnosing why an effect or preset change isn't showing up (patched workbench, live-config, reload requirements). Covers the edit -> package -> install -> reload -> verify loop and the validation checks.
---

# Juicer Dev Runbook

The mental model: **two layers** (extension host + injected renderer) and a
**patched workbench.html**. Most "it didn't work" reports are really "the injector
didn't reload" or "the preset didn't re-apply". Read [docs/live-config.md](../../docs/live-config.md)
and [docs/renderer-injection.md](../../docs/renderer-injection.md) before changing
the transport or the patch.

## 1. Validate & test first

```sh
npm run validate:bundle   # syntax parse of the two entry files
npm test                  # Vitest: pure core, preset switch, renderer merge
npm run docs-audit        # docs system guard (also runs on pre-commit)
```

## 2. Package a VSIX

```sh
npm run package           # -> dist/vscode-juicer-<ver>.vsix
```
`.vscodeignore` keeps the VSIX to runtime files (`out/**`, `renderer/**`, icon,
README, LICENSE). Confirm with `vsce ls` if unsure what ships.

## 3. Install & activate locally

```sh
code --install-extension dist/vscode-juicer-<ver>.vsix --force
```
Then run **VSCode Juicer: Enable Renderer Effects** (patches workbench.html).

## 4. Reload rules (the usual gotcha)

- Changed `renderer/vscode-juicer-injector.js`? → **reload the window once** (the
  injected `<script>` is baked in at patch time).
- Changed only config/preset values? → no reload; the fetch poller applies live.
- Expect the **"installation appears corrupt"** banner — expected, dismissable.

## 5. Verify the effect

Open Copilot Chat, type in the input, confirm particles/shake/hit-counter. To test
live config: change `vscodeJuicer.chat.preset` in Settings and confirm the renderer
changes within ~1s **without reloading** (this is the B1/B2 fix; if it only changes
after reload, the fetch transport is blocked in that VS Code build — see
[docs/live-config.md](../../docs/live-config.md)).

## 6. Restore / clean up

- **VSCode Juicer: Disable Renderer Effects** restores workbench.html from
  `workbench.vscode-juicer.bak`.
- Diff the restored file against the backup to confirm a clean revert.

## Branding / identity checks

```sh
rg -n 'powermode|power mode' out renderer package.json README.md -g '!**/*.map'
```
Hits should only be internal `onPowermode*` identifiers (a contract — do not rename)
or intentional attribution. User-facing strings must read "VSCode Juicer".
