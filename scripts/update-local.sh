#!/usr/bin/env bash
# Fetch the latest VSCode Juicer release VSIX from GitHub and install it locally.
#
# Usage: ./scripts/update-local.sh
# Requires: curl, and the `code` CLI on PATH. Uses `gh` if available (nicer),
# otherwise falls back to the public GitHub API.
set -euo pipefail

REPO="NickFane/vscode-juicer"
EXT_ID="nicholasfane-local.vscode-juicer"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Looking up the latest release of $REPO ..."

VSIX_URL=""
if command -v gh >/dev/null 2>&1; then
  # gh resolves the asset download URL for the latest release.
  VSIX_URL="$(gh release view --repo "$REPO" \
    --json assets --jq '.assets[] | select(.name|endswith(".vsix")) | .url' \
    | head -n1)"
else
  API="https://api.github.com/repos/$REPO/releases/latest"
  VSIX_URL="$(curl -fsSL "$API" \
    | grep -oE '"browser_download_url": *"[^"]+\.vsix"' \
    | head -n1 | sed -E 's/.*"(https[^"]+)"/\1/')"
fi

if [ -z "$VSIX_URL" ]; then
  echo "No .vsix asset found on the latest release. Has a release been published?" >&2
  exit 1
fi

echo "Downloading $VSIX_URL"
VSIX_PATH="$TMPDIR/vscode-juicer.vsix"
if command -v gh >/dev/null 2>&1; then
  gh release download --repo "$REPO" --pattern '*.vsix' --dir "$TMPDIR" --clobber
  VSIX_PATH="$(ls "$TMPDIR"/*.vsix | head -n1)"
else
  curl -fsSL "$VSIX_URL" -o "$VSIX_PATH"
fi

if ! command -v code >/dev/null 2>&1; then
  echo "The 'code' CLI is not on PATH. Install it from VS Code: Shell Command: Install 'code' command." >&2
  echo "Downloaded VSIX left at: $VSIX_PATH" >&2
  exit 1
fi

echo "Installing $EXT_ID ..."
code --install-extension "$VSIX_PATH" --force

cat <<'EOF'

Done. Next steps in VS Code:
  1. Run  "VSCode Juicer: Enable Renderer Effects"  (patches workbench.html)
  2. If the injector changed, run  "Developer: Reload Window"  once
  3. The "installation appears corrupt" banner is expected and dismissable.
EOF
