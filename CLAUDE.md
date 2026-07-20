# VSCode Juicer Handoff

## Purpose

This repository is the new source of truth for the VS Code extension formerly hacked on locally as a Power Mode chat fork.

The goal is a standalone extension that:

- keeps the original editor-side combo / shake / explosion behavior
- adds renderer-side effects for Copilot Chat and other webview-backed inputs
- does not depend on Custom CSS / JS Loader
- patches the VS Code workbench directly when renderer effects are enabled

## Current Identity

- Repo: `git@github.com:NickFane/vscode-juicer.git`
- Package name: `vscode-juicer`
- Publisher: `nicholasfane-local`
- Extension id: `nicholasfane-local.vscode-juicer`
- Visible name: `VSCode Juicer`
- Settings namespace: `vscodeJuicer.*`
- Chat settings namespace: `vscodeJuicer.chat.*`

## Important Files

- `package.json`
  Extension manifest, commands, views, settings, package identity.

- `out/src/extension.js`
  Main extension-host entrypoint. Registers commands, status bar items, sidebar webview, config sync, and stats logic.

- `out/src/chat-renderer-installer.js`
  Workbench patcher. Locates `workbench.html`, strips the managed block, reinjects the renderer script, writes the live config file, and restores from backup when needed.

- `renderer/vscode-juicer-injector.js`
  Renderer-side script injected into the workbench. Handles particles, combo HUD, WPM, shake, hit counter, and live config polling.

- `README.md`
  Short operator-facing project notes.

## Runtime Architecture

There are two runtime layers.

1. Extension host
   Runs normal editor effects for real text documents.

2. Renderer injector
   Handles Copilot Chat / webview-backed typing that does not flow through `onDidChangeTextDocument` the same way.

The renderer is injected into VS Code workbench HTML by the extension itself.

## Renderer Injection Model

The extension writes a managed block into the workbench HTML.

Managed markers:

- `<!-- !! VSCODE-JUICER-SESSION !! -->`
- `<!-- !! VSCODE-JUICER-START !! -->`
- `<!-- !! VSCODE-JUICER-END !! -->`

The installer should always strip the old managed block before reinjecting.

Backup file name:

- `workbench.vscode-juicer.bak`

Relevant workbench path on this machine:

- `/Applications/Visual Studio Code 2.app/Contents/Resources/app/out/vs/code/electron-browser/workbench/workbench.html`

## Live Config Behavior

The renderer supports live updates without reload after the injector itself has been loaded once.

Mechanism:

- extension writes runtime config JSON to the extension global storage area
- workbench injector exposes config globals
- renderer polls the JSON file every 500ms
- renderer applies updated values in-memory and updates CSS custom properties

Important renderer globals:

- `window.__vscodeJuicerConfig`
- `window.__vscodeJuicerConfigPath`
- `window.__vscodeJuicerApplyConfig`
- `window.vscodeJuicer`

Stored renderer config key:

- `localStorage['vscodeJuicerConfig']`

## Presets

Known chat presets:

- `juicy-subtle-v1`
- `legacy`
- `insanity`

`insanity` is intentionally extreme and can make the editor borderline unusable.

## Known Constraints

- This repo is JS-first. It was assembled from the installed extension bundle and does not include original TypeScript sources.
- VS Code updates can overwrite the patched workbench HTML.
- One reload is still required after changing the injected runtime itself; live config only applies after the current injector version is loaded.
- Caret anchoring inside some webview surfaces is approximate.

## Local Repo Status

At handoff time:

- branch: `main`
- local branch is ahead of `origin/main` by 1 commit
- bootstrap commit exists locally: `f045a82 Bootstrap VSCode Juicer extension`

## GitHub Push Blocker

Push is currently blocked by GitHub identity mismatch.

Observed state:

- `workbook-key` authenticates successfully to GitHub
- `id_ed25519_github` and `nicholas-fane` also authenticate successfully
- all tested keys currently identify as GitHub account `nicholas-fane_isuctm`
- push to `NickFane/vscode-juicer` is denied for that account

Implication:

- do not push until the actual GitHub account for `NickFane` is configured locally or granted access

Useful commands:

- `ssh -T git@github.com`
- `ssh -T -i /Users/nicholas.fane/.ssh/workbook-key -o IdentitiesOnly=yes git@github.com`
- `gh auth status`

## Installed Extension Notes

Historical installed extension path used earlier in the session:

- `/Users/nicholas.fane/.vscode/extensions/nicholasfane-local.vscode-power-mode-chat-fork-3.0.2-local.0`

This old extension should not remain the active source of truth.

Preferred active extension after reinstall:

- `nicholasfane-local.vscode-juicer`

## Validation Commands

- `npm run validate:bundle`
- `git status --short --branch`
- `rg -n 'powermode|Power Mode' out renderer package.json README.md -g '!**/*.map'`

## Operational Guidance For Future Changes

- Keep workbench injection single-source and marker-managed.
- Do not reintroduce Custom CSS / JS Loader integration.
- If changing renderer config shape, update both installer globals and renderer polling/application code.
- If changing package identity, update manifest ids, command ids, settings namespaces, storage keys, and workbench marker names together.
- Prefer editing the repo copy, then packaging/installing from this repo, rather than editing the installed extension folder directly.
