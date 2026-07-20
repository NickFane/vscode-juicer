"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

const SESSION_MARKER = "<!-- !! VSCODE-JUICER-SESSION !! -->";
const START_MARKER = "<!-- !! VSCODE-JUICER-START !! -->";
const END_MARKER = "<!-- !! VSCODE-JUICER-END !! -->";
const BACKUP_FILE = "workbench.vscode-juicer.bak";

function getPreset(name) {
  const presets = {
    "juicy-subtle-v1": {
      comboDecayMs: 1500,
      comboShakeThreshold: 15,
      particlesPerKeystroke: 5,
      particleLifetimeMs: 260,
      particleSizePx: 4,
      particleDistanceMin: 6,
      particleDistanceMax: 16,
      particleOffsetX: 5,
      particleOffsetY: 0,
      particleSaturation: 90,
      particleLightness: 60,
      particleFollowTextColor: true,
      shakeEnabled: true,
      shakeDurationMs: 34,
      shakeDistancePx: 1,
      shakeLoop: false,
      hitCounterEnabled: true,
      hitCounterLifetimeMs: 520,
      hitCounterOffsetX: 16,
      hitCounterOffsetY: -16,
      countNavigationKeys: true,
      anchorMode: "caret-or-pointer",
      targetSelectors: [
        ".monaco-editor",
        ".interactive-session",
        ".interactive-input-part",
        ".interactive-input-editor"
      ],
      ignoreKeys: ["Shift", "Control", "Alt", "Meta"]
    },
    legacy: {
      comboDecayMs: 1500,
      comboShakeThreshold: 15,
      particlesPerKeystroke: 12,
      particleLifetimeMs: 700,
      particleSizePx: 10,
      particleDistanceMin: 28,
      particleDistanceMax: 92,
      particleOffsetX: 0,
      particleOffsetY: 0,
      particleSaturation: 90,
      particleLightness: 60,
      particleFollowTextColor: false,
      shakeEnabled: true,
      shakeDurationMs: 150,
      shakeDistancePx: 1,
      shakeLoop: true,
      hitCounterEnabled: false,
      hitCounterLifetimeMs: 700,
      hitCounterOffsetX: 10,
      hitCounterOffsetY: -18,
      countNavigationKeys: true,
      anchorMode: "caret-or-pointer",
      targetSelectors: [
        ".monaco-editor",
        ".interactive-session",
        ".interactive-input-part",
        ".interactive-input-editor"
      ],
      ignoreKeys: ["Shift", "Control", "Alt", "Meta"]
    },
    insanity: {
      safetyOff: true,
      comboDecayMs: 12000,
      comboShakeThreshold: 1,
      particlesPerKeystroke: 500,
      particleLifetimeMs: 3200,
      particleSizePx: 120,
      particleDistanceMin: 120,
      particleDistanceMax: 1500,
      particleOffsetX: 0,
      particleOffsetY: 0,
      particleSaturation: 100,
      particleLightness: 75,
      particleFollowTextColor: false,
      shakeEnabled: true,
      shakeDurationMs: 1400,
      shakeDistancePx: 80,
      shakeLoop: true,
      hitCounterEnabled: true,
      hitCounterLifetimeMs: 4000,
      hitCounterOffsetX: 40,
      hitCounterOffsetY: -40,
      countNavigationKeys: true,
      anchorMode: "caret-or-pointer",
      targetSelectors: [
        ".monaco-editor",
        ".interactive-session",
        ".interactive-input-part",
        ".interactive-input-editor"
      ],
      ignoreKeys: ["Shift", "Control", "Alt", "Meta"]
    }
  };

  return presets[name] || presets["juicy-subtle-v1"];
}

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

function stripPatch(html) {
  let next = html;
  next = next.replace(new RegExp(`${SESSION_MARKER}\\n?`, "g"), "");
  next = next.replace(
    /<!-- !! VSCODE-JUICER-START !! -->[\s\S]*?<!-- !! VSCODE-JUICER-END !! -->\n*/g,
    ""
  );
  return next;
}

function makeInjectedBlock(configObject, injectorSource, configFilePath) {
  const configScript = [
    `window.__vscodeJuicerConfig = ${JSON.stringify(configObject, null, 2)};`,
    configFilePath ? `window.__vscodeJuicerConfigPath = ${JSON.stringify(configFilePath)};` : ''
  ].filter(Boolean).join('\n');
  return `${SESSION_MARKER}\n${START_MARKER}\n<script>\n${configScript}\n${injectorSource}\n</script>\n${END_MARKER}\n`;
}

async function writeLiveConfigFile(context, runtime) {
  try {
    const storageDir = context.globalStorageUri
      ? context.globalStorageUri.fsPath
      : path.join(require('os').homedir(), '.vscode', 'vscode-juicer');
    await fs.promises.mkdir(storageDir, { recursive: true });
    const configFilePath = path.join(storageDir, 'vscode-juicer-live-config.json');
    await fs.promises.writeFile(configFilePath, JSON.stringify(runtime, null, 2), 'utf8');
    return configFilePath;
  } catch (_e) {
    return null;
  }
}

function getChatSettings() {
  const cfg = vscode.workspace.getConfiguration("vscodeJuicer.chat");
  const presetName = cfg.get("preset", "juicy-subtle-v1");
  const preset = getPreset(presetName);

  const runtime = {
    safetyOff: cfg.get("safetyOff", preset.safetyOff || false),
    comboDecayMs: cfg.get("comboDecayMs", preset.comboDecayMs),
    comboShakeThreshold: cfg.get("comboShakeThreshold", preset.comboShakeThreshold),
    particlesPerKeystroke: cfg.get("particlesPerKeystroke", preset.particlesPerKeystroke),
    particleLifetimeMs: cfg.get("particleLifetimeMs", preset.particleLifetimeMs),
    particleSizePx: cfg.get("particleSizePx", preset.particleSizePx),
    particleDistanceMin: cfg.get("particleDistanceMin", preset.particleDistanceMin),
    particleDistanceMax: cfg.get("particleDistanceMax", preset.particleDistanceMax),
    particleOffsetX: cfg.get("particleOffsetX", preset.particleOffsetX),
    particleOffsetY: cfg.get("particleOffsetY", preset.particleOffsetY),
    particleSaturation: cfg.get("particleSaturation", preset.particleSaturation),
    particleLightness: cfg.get("particleLightness", preset.particleLightness),
    particleFollowTextColor: cfg.get("particleFollowTextColor", preset.particleFollowTextColor),
    shakeEnabled: cfg.get("shakeEnabled", preset.shakeEnabled),
    shakeDurationMs: cfg.get("shakeDurationMs", preset.shakeDurationMs),
    shakeDistancePx: cfg.get("shakeDistancePx", preset.shakeDistancePx),
    shakeLoop: cfg.get("shakeLoop", preset.shakeLoop),
    hitCounterEnabled: cfg.get("hitCounterEnabled", preset.hitCounterEnabled),
    hitCounterLifetimeMs: cfg.get("hitCounterLifetimeMs", preset.hitCounterLifetimeMs),
    hitCounterOffsetX: cfg.get("hitCounterOffsetX", preset.hitCounterOffsetX),
    hitCounterOffsetY: cfg.get("hitCounterOffsetY", preset.hitCounterOffsetY),
    countNavigationKeys: cfg.get("countNavigationKeys", preset.countNavigationKeys),
    anchorMode: cfg.get("anchorMode", preset.anchorMode),
    targetSelectors: cfg.get("targetSelectors", preset.targetSelectors),
    ignoreKeys: cfg.get("ignoreKeys", preset.ignoreKeys)
  };

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
  const configFilePath = await writeLiveConfigFile(context, runtime);
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

  html = stripPatch(html);
  html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/, "");

  const injected = makeInjectedBlock(runtime, injectorSource, configFilePath);
  const next = html.replace(/<\/head>/, `${injected}</head>`);

  await fs.promises.writeFile(loc.htmlPath, next, "utf8");
}

async function uninstallRenderer() {
  const loc = locateWorkbench();
  if (!loc) {
    vscode.window.showWarningMessage("VSCode Juicer: Unable to locate VS Code workbench file.");
    return;
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
  const preset = getPreset(presetName);

  await cfg.update("preset", presetName, vscode.ConfigurationTarget.Global);

  for (const [key, value] of Object.entries(preset)) {
    if (key === "safetyOff") {
      continue;
    }
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
