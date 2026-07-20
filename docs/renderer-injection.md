# Renderer Injection

> How the extension patches the VS Code workbench HTML to load the renderer
> injector — locating, marker-managing, backing up, and cleanly reversing the patch.

**Key files:** `out/src/chat-renderer-installer.js`, `out/src/chat-config.js`
**Related:** [architecture.md](architecture.md), [live-config.md](live-config.md), [marketplace.md](marketplace.md)
**last-verified:** 2026-07-20

## Managed block + markers

The injector is wrapped in a single managed `<script>` block delimited by three
markers (in `chat-config.js`):

- `<!-- !! VSCODE-JUICER-SESSION !! -->`
- `<!-- !! VSCODE-JUICER-START !! -->`
- `<!-- !! VSCODE-JUICER-END !! -->`

Injection is **single-source and marker-managed**. `applyPatch(html, block)`
always strips the old managed block before reinjecting, drops the CSP meta tag,
and inserts the block before `</head>`. It is **idempotent** — re-syncing replaces
the block, never stacks it.

## Locating the workbench

`locateWorkbench()` probes `electron-browser` / `electron-sandbox` dirs and several
html filenames (`workbench.html`, `workbench.esm.html`, …) under the running app's
`vs/code` dir. Returns `{ workbenchDir, htmlPath }` or null.

## CSP

The transform removes the workbench's `Content-Security-Policy` meta tag so the
inline injected script can execute. This is what triggers VS Code's "installation
appears corrupt" banner — expected and unavoidable for this technique. → [marketplace.md](marketplace.md)

## Backup & reversibility

Before the first patch, the original HTML is copied to `workbench.vscode-juicer.bak`
in the workbench dir. `uninstallRenderer()` restores from that backup (or falls
back to `stripPatch`). True reversibility relies on the **backup**, not on strip
alone (strip does not restore the removed CSP meta). VS Code updates overwrite the
patched HTML — the extension re-patches on next activation/config change.

## Rules

- Keep injection single-source and marker-managed.
- Do **not** reintroduce Custom CSS / JS Loader integration.
- Any workbench write goes through the installer; never edit `workbench.html` elsewhere.
