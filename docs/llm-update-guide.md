# LLM Guide: Updating the User's Local Copy

> A copy-pasteable runbook an LLM follows to direct the user through pulling down
> and installing a new build. Read this when the user asks "how do I update my
> local juicer" or after you ship a change they want to run.

**Key files:** `scripts/update-local.sh`, `.github/workflows/release.yml`
**Related:** [publishing.md](publishing.md), [renderer-injection.md](renderer-injection.md), [live-config.md](live-config.md)
**last-verified:** 2026-07-20

## Decide which case applies

1. **Config-only change** (preset values, a setting default): no reinstall needed —
   changes apply live via the fetch poller once the current injector is loaded.
2. **Renderer injector changed** (`renderer/vscode-juicer-injector.js`): needs a
   fresh install **and one window reload** (the injected `<script>` is baked into
   workbench.html at patch time).
3. **Extension-host change** (`out/src/**` other than the injector): reinstall the
   VSIX; reload picks it up.

If unsure, treat it as case 2 (reinstall + reload) — it always works.

## The steps to give the user

1. **Get the VSIX.** Either run the helper:
   ```sh
   ./scripts/update-local.sh
   ```
   or download the latest `vscode-juicer-<ver>.vsix` from the GitHub Releases page.
2. **Install it:**
   ```sh
   code --install-extension vscode-juicer-<ver>.vsix --force
   ```
3. **Enable renderer effects** (patches workbench.html): run the command
   **VSCode Juicer: Enable Renderer Effects** from the Command Palette.
4. **Reload once** if the injector changed: **Developer: Reload Window**.
5. Expect the **"installation appears corrupt"** banner — it is expected (the patch
   strips the CSP meta). It is dismissable and harmless. → [marketplace.md](marketplace.md)

## Uninstall / restore

- Run **VSCode Juicer: Disable Renderer Effects** to restore `workbench.html` from
  the `workbench.vscode-juicer.bak` backup.
- Then `code --uninstall-extension nicholasfane-local.vscode-juicer` if fully removing.

## After a VS Code update

VS Code updates overwrite the patched workbench HTML. Re-run **Enable Renderer
Effects** (the extension also re-patches on activation) and reload.
