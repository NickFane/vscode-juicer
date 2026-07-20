"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const {
  resolveRuntime,
  presetConfigEntries,
  makeInjectedBlock,
  applyPatch,
  stripPatch
} = require("./chat-config");

const BACKUP_FILE = "workbench.vscode-juicer.bak";
// Live-config sidecar. Written INTO the workbench dir (next to workbench.html) so the
// sandboxed renderer — which has no Node `require('fs')` — can fetch it with a relative URL.
const LIVE_CONFIG_FILE = "vscode-juicer-live-config.json";

function locateWorkbench() {
  const appDir = require.main
    ? path.dirname(require.main.filename)
    : globalThis._VSCODE_FILE_ROOT;

  if (!appDir) {
    return null;
  }

  const basePath = path.join(appDir, "vs", "code");
  const workbenchDirCandidates = [
    path.join(basePath, "electron-browser", "workbench"),
    path.join(basePath, "electron-browser"),
    path.join(basePath, "electron-sandbox", "workbench"),
    path.join(basePath, "electron-sandbox")
  ];

  const htmlFileNameCandidates = [
    "workbench-dev.html",
    "workbench.esm.html",
    "workbench.html",
    "workbench-apc-extension.html"
  ];

  for (const workbenchDir of workbenchDirCandidates) {
    for (const htmlFileName of htmlFileNameCandidates) {
      const htmlPath = path.join(workbenchDir, htmlFileName);
      if (fs.existsSync(htmlPath)) {
        return { workbenchDir, htmlPath };
      }
    }
  }

  return null;
}

async function writeLiveConfigFile(loc, runtime) {
  // Returns the RELATIVE filename the renderer fetches, or null on failure.
  try {
    const configFilePath = path.join(loc.workbenchDir, LIVE_CONFIG_FILE);
    await fs.promises.writeFile(
      configFilePath,
      JSON.stringify(runtime, null, 2),
      "utf8"
    );
    return LIVE_CONFIG_FILE;
  } catch (_e) {
    return null;
  }
}

function getChatSettings() {
  const cfg = vscode.workspace.getConfiguration("vscodeJuicer.chat");
  const presetName = cfg.get("preset", "juicy-subtle-v1");
  const runtime = resolveRuntime(presetName, (key, fallback) => cfg.get(key, fallback));
  return {
    enabled: cfg.get("enabled", true),
    runtime
  };
}

async function ensureBackup(loc, currentHtml) {
  const backupPath = path.join(loc.workbenchDir, BACKUP_FILE);
  if (!fs.existsSync(backupPath)) {
    await fs.promises.writeFile(backupPath, currentHtml, "utf8");
  }
}

async function installOrUpdateRenderer(context) {
  const loc = locateWorkbench();
  if (!loc) {
    vscode.window.showWarningMessage("VSCode Juicer: Unable to locate VS Code workbench file.");
    return;
  }

  const injectorPath = path.join(context.extensionPath, "renderer", "vscode-juicer-injector.js");
  if (!fs.existsSync(injectorPath)) {
    vscode.window.showWarningMessage("VSCode Juicer: Missing renderer/vscode-juicer-injector.js in extension folder.");
    return;
  }

  const { runtime } = getChatSettings();
  const injectorSource = await fs.promises.readFile(injectorPath, "utf8");
  const configUrl = await writeLiveConfigFile(loc, runtime);
  let html = await fs.promises.readFile(loc.htmlPath, "utf8");

  // Recover from empty/corrupted workbench file using our backup
  if (!html || !html.includes("</head>")) {
    const backupPath = path.join(loc.workbenchDir, BACKUP_FILE);
    if (fs.existsSync(backupPath)) {
      html = await fs.promises.readFile(backupPath, "utf8");
    } else {
      vscode.window.showWarningMessage("VSCode Juicer: workbench.html appears empty and no backup was found. Try reinstalling VS Code.");
      return;
    }
  }

  await ensureBackup(loc, html);

  const injected = makeInjectedBlock(runtime, injectorSource, configUrl);
  const next = applyPatch(html, injected);

  await fs.promises.writeFile(loc.htmlPath, next, "utf8");
}

async function uninstallRenderer() {
  const loc = locateWorkbench();
  if (!loc) {
    vscode.window.showWarningMessage("VSCode Juicer: Unable to locate VS Code workbench file.");
    return;
  }

  // Best-effort cleanup of the live-config sidecar file.
  try {
    await fs.promises.unlink(path.join(loc.workbenchDir, LIVE_CONFIG_FILE));
  } catch (_e) {
    // not present — fine
  }

  const backupPath = path.join(loc.workbenchDir, BACKUP_FILE);
  if (fs.existsSync(backupPath)) {
    const backup = await fs.promises.readFile(backupPath, "utf8");
    await fs.promises.writeFile(loc.htmlPath, backup, "utf8");
    return;
  }

  const html = await fs.promises.readFile(loc.htmlPath, "utf8");
  const stripped = stripPatch(html);
  if (stripped !== html) {
    await fs.promises.writeFile(loc.htmlPath, stripped, "utf8");
  }
}

async function syncRendererFromConfiguration(context) {
  const chat = getChatSettings();
  if (!chat.enabled) {
    await uninstallRenderer();
    return;
  }
  await installOrUpdateRenderer(context);
}

async function applyPreset(context, presetName) {
  const cfg = vscode.workspace.getConfiguration("vscodeJuicer.chat");

  await cfg.update("preset", presetName, vscode.ConfigurationTarget.Global);

  for (const [key, value] of presetConfigEntries(presetName)) {
    await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  }

  await cfg.update("enabled", true, vscode.ConfigurationTarget.Global);
}

async function openChatSettings() {
  await vscode.commands.executeCommand("workbench.action.openSettings", "vscodeJuicer.chat");
}

module.exports = {
  syncRendererFromConfiguration,
  installOrUpdateRenderer,
  uninstallRenderer,
  applyPreset,
  openChatSettings
};
