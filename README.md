# VSCode Juicer

VSCode Juicer is a standalone extension that keeps the original editor-side combo, shake, and explosion behavior and adds a renderer injector for Copilot Chat and other webview-backed inputs.

It runs as one extension. No separate Custom CSS or JS loader is required.

## Why this exists

The marketplace extension only listens to `vscode.workspace.onDidChangeTextDocument`. That API sees editor documents, not typing inside Copilot Chat webviews. The missing behavior has to live at two layers:

* Extension host: editor combo meter, shake, and explosion behavior.
* Renderer injector: window-level keydown listener for chat and other non-TextDocument inputs.

Both layers live in one repo so the shipped extension and renderer runtime stay in sync.

## Layout

* `out/`: extension-host runtime bundle.
* `renderer/vscode-juicer-injector.js`: renderer companion script for Copilot Chat and other tracked surfaces.

## Current constraints

* This is a JS-first codebase built from the installed extension bundle. The marketplace package on disk does not include TypeScript sources or source maps.
* The injector can only approximate caret location inside isolated webviews. Effects anchor to the last pointer position in the relevant surface.
* VS Code updates can overwrite direct workbench patches. Re-enable the renderer from the extension after updates if needed.

## Install flow

1. Package this extension with `npm run package` and install the VSIX.
2. Enable `VSCode Juicer` for editor effects if desired.
3. Enable `VSCode Juicer: Enable Renderer Effects` from the Command Palette.
4. Reload VS Code once after first install.

The extension patches workbench HTML directly and injects renderer code + config automatically.

## Chat renderer commands

* `VSCode Juicer: Enable Renderer Effects`
* `VSCode Juicer: Disable Renderer Effects`
* `VSCode Juicer: Open Chat Renderer Settings`
* `VSCode Juicer: Apply Preset (Juicy Subtle v1)`

## Presets

`vscodeJuicer.chat.preset` supports:

* `juicy-subtle-v1` (current tuned profile)
* `legacy` (larger/richer original feel)
* `insanity` (maximal joke preset)

Use the preset command to quickly jump between the tuned baseline and the over-the-top profile.

## Validation

Run `npm run validate:bundle` to syntax-check both layers.

## Next implementation slice

Chat renderer configuration lives under `vscodeJuicer.chat.*` and is bridged into the injected renderer runtime automatically.
