"use strict";

/**
 * Pure, dependency-free core for the chat renderer.
 *
 * This module deliberately imports nothing (no `vscode`, no `fs`) so it can be
 * unit-tested in plain Node/Vitest. The installer (`chat-renderer-installer.js`)
 * is the only place that talks to `vscode`/`fs`; it delegates all preset resolution
 * and workbench-HTML string surgery here so there is a single source of truth.
 */

const SESSION_MARKER = "<!-- !! VSCODE-JUICER-SESSION !! -->";
const START_MARKER = "<!-- !! VSCODE-JUICER-START !! -->";
const END_MARKER = "<!-- !! VSCODE-JUICER-END !! -->";

// Runtime fields the renderer understands, in the same order the manifest and the
// old getChatSettings used. `safetyOff` is handled separately (never written by
// applyPreset) so it is intentionally NOT in this list.
const RUNTIME_KEYS = [
  "comboDecayMs",
  "comboShakeThreshold",
  "particlesPerKeystroke",
  "particleLifetimeMs",
  "particleSizePx",
  "particleDistanceMin",
  "particleDistanceMax",
  "particleOffsetX",
  "particleOffsetY",
  "particleSaturation",
  "particleLightness",
  "particleFollowTextColor",
  "shakeEnabled",
  "shakeDurationMs",
  "shakeDistancePx",
  "shakeLoop",
  "hitCounterEnabled",
  "hitCounterLifetimeMs",
  "hitCounterOffsetX",
  "hitCounterOffsetY",
  "hitCounterFloatEnabled",
  "hitCounterFloatDistancePx",
  "countNavigationKeys",
  "anchorMode",
  "targetSelectors",
  "ignoreKeys"
];

const PRESETS = {
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
    hitCounterFloatEnabled: false,
    hitCounterFloatDistancePx: 40,
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
    hitCounterFloatEnabled: false,
    hitCounterFloatDistancePx: 40,
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
    hitCounterFloatEnabled: false,
    hitCounterFloatDistancePx: 40,
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

const DEFAULT_PRESET = "juicy-subtle-v1";

function getPreset(name) {
  return PRESETS[name] || PRESETS[DEFAULT_PRESET];
}

/**
 * Resolve the effective renderer runtime for a preset, given a `get(key, fallback)`
 * reader (the installer passes a vscode-config-backed reader; tests pass a plain map).
 * Mirrors the old getChatSettings merge exactly.
 */
function resolveRuntime(presetName, get) {
  const preset = getPreset(presetName);
  const runtime = { safetyOff: get("safetyOff", preset.safetyOff || false) };
  for (const key of RUNTIME_KEYS) {
    runtime[key] = get(key, preset[key]);
  }
  return runtime;
}

/**
 * The config entries applyPreset writes to global settings when a preset is chosen.
 * Excludes `safetyOff` (never force-written — insanity's danger flag stays opt-in).
 */
function presetConfigEntries(presetName) {
  const preset = getPreset(presetName);
  return Object.entries(preset).filter(([key]) => key !== "safetyOff");
}

/** Remove any previously-injected managed block (marker-based, idempotent). */
function stripPatch(html) {
  let next = html;
  next = next.replace(new RegExp(`${SESSION_MARKER}\\n?`, "g"), "");
  next = next.replace(
    /<!-- !! VSCODE-JUICER-START !! -->[\s\S]*?<!-- !! VSCODE-JUICER-END !! -->\n*/g,
    ""
  );
  return next;
}

/**
 * Build the managed `<script>` block injected into workbench.html.
 * `configLocator` is a value the renderer can use to fetch live config (a URL);
 * it is exposed as `window.__vscodeJuicerConfigUrl`. An inline snapshot of the
 * config is always exposed as `window.__vscodeJuicerConfig` so the renderer has
 * correct values on first paint even before the first live poll.
 */
function makeInjectedBlock(configObject, injectorSource, configLocator) {
  const configScript = [
    `window.__vscodeJuicerConfig = ${JSON.stringify(configObject, null, 2)};`,
    configLocator
      ? `window.__vscodeJuicerConfigUrl = ${JSON.stringify(configLocator)};`
      : ""
  ]
    .filter(Boolean)
    .join("\n");
  return `${SESSION_MARKER}\n${START_MARKER}\n<script>\n${configScript}\n${injectorSource}\n</script>\n${END_MARKER}\n`;
}

/**
 * Full workbench-HTML transform: strip any prior block, drop the CSP meta (so the
 * inline script can run), then inject the managed block before </head>.
 * Idempotent: applying twice yields the same result as applying once.
 */
function applyPatch(html, block) {
  let next = stripPatch(html);
  next = next.replace(
    /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
    ""
  );
  next = next.replace(/<\/head>/, `${block}</head>`);
  return next;
}

module.exports = {
  SESSION_MARKER,
  START_MARKER,
  END_MARKER,
  RUNTIME_KEYS,
  PRESETS,
  DEFAULT_PRESET,
  getPreset,
  resolveRuntime,
  presetConfigEntries,
  stripPatch,
  makeInjectedBlock,
  applyPatch
};
