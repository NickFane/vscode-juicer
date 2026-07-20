# Publishing & Local Updates

> How a build becomes an installable VSIX, and how the user's machine pulls it down.
> Distribution is GitHub Releases only — not the marketplace. → [marketplace.md](marketplace.md)

**Key files:** `.github/workflows/release.yml`, `scripts/update-local.sh`, `.vscodeignore`, `package.json`
**Related:** [marketplace.md](marketplace.md), [llm-update-guide.md](llm-update-guide.md), [testing.md](testing.md)
**last-verified:** 2026-07-20

## Build

`npm run package` runs `vsce package -o dist/`, producing `dist/vscode-juicer-<ver>.vsix`.
`.vscodeignore` keeps the VSIX to runtime files only (`out/**`, `renderer/**`, icon,
README, LICENSE) and excludes docs/tests/tooling.

## Release pipeline

`.github/workflows/release.yml` fires on a `v*` tag: install → test → docs-audit →
`vsce package` → attach the `.vsix` to a **GitHub Release**. That release asset is
the single distribution channel.

Cut a release:

```sh
npm version <patch|minor|major>
git push --follow-tags
```

## Local install / update (the user's machine)

Grab the latest `.vsix` from GitHub Releases (or run `scripts/update-local.sh`), then:

```sh
code --install-extension vscode-juicer-<ver>.vsix --force
```

Then run **VSCode Juicer: Enable Renderer Effects** (patches workbench.html) and
reload once if the injector itself changed. Config-only changes apply live. Full
operator steps live in [llm-update-guide.md](llm-update-guide.md).

## Publisher note

`publisher` is `nicholasfane-local` — a placeholder that is fine for local VSIX
installs. A real marketplace publisher id is only needed if/when the marketplace
path is pursued.
