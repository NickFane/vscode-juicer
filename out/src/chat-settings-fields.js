"use strict";

/**
 * Pure, dependency-free descriptor of every `vscodeJuicer.chat.*` setting the
 * sidebar exposes, plus the step-button magnitude math. No `vscode`/DOM deps so
 * it's unit-testable (mirrors the `chat-config.js` convention). The sidebar
 * webview script (browser-sandboxed, no module system) duplicates `deriveSteps`/
 * `niceStep`/`clampValue` verbatim — keep both copies in sync if this changes.
 */

const CATEGORIES = [
  { id: "core", title: "Renderer Core" },
  { id: "combo", title: "Combo" },
  { id: "particles", title: "Particles" },
  { id: "shake", title: "Shake" },
  { id: "hitCounter", title: "Hit Counter" },
  { id: "input", title: "Input Detection (Advanced)" }
];

// Every RUNTIME_KEYS entry (chat-config.js) plus the top-level enabled/preset/
// safetyOff settings that live outside RUNTIME_KEYS. Numeric fields carry a
// `min`/`max` used normally and an `insanityMax` unlocked when the active
// preset is `insanity` (mirrors the old hardcoded applyRangeProfile ranges).
const FIELDS = [
  { key: "enabled", label: "Enable Renderer Effects", category: "core", type: "boolean" },
  {
    key: "preset",
    label: "Preset",
    category: "core",
    type: "enum",
    options: ["juicy-subtle-v1", "legacy", "insanity"]
  },
  {
    key: "safetyOff",
    label: "Safety Off",
    category: "core",
    type: "boolean",
    dangerous: true,
    hint: "Unlocks extreme values. Set automatically by the insanity preset."
  },

  {
    key: "comboDecayMs",
    label: "Combo Decay (ms)",
    category: "combo",
    type: "number",
    min: 100,
    max: 6000,
    insanityMax: 20000
  },
  {
    key: "comboShakeThreshold",
    label: "Combo Shake Threshold",
    category: "combo",
    type: "number",
    min: 1,
    max: 300,
    insanityMax: 500
  },

  {
    key: "particlesPerKeystroke",
    label: "Particles / Keystroke",
    category: "particles",
    type: "number",
    min: 1,
    max: 300,
    insanityMax: 500
  },
  {
    key: "particleLifetimeMs",
    label: "Particle Lifetime (ms)",
    category: "particles",
    type: "number",
    min: 40,
    max: 6000,
    insanityMax: 10000
  },
  {
    key: "particleSizePx",
    label: "Particle Size (px)",
    category: "particles",
    type: "number",
    min: 1,
    max: 120,
    insanityMax: 200
  },
  {
    key: "particleDistanceMin",
    label: "Particle Distance Min (px)",
    category: "particles",
    type: "number",
    min: 0,
    max: 200,
    insanityMax: 400
  },
  {
    key: "particleDistanceMax",
    label: "Particle Distance Max (px)",
    category: "particles",
    type: "number",
    min: 0,
    max: 400,
    insanityMax: 2000
  },
  {
    key: "particleOffsetX",
    label: "Particle Offset X (px)",
    category: "particles",
    type: "number",
    min: -100,
    max: 100
  },
  {
    key: "particleOffsetY",
    label: "Particle Offset Y (px)",
    category: "particles",
    type: "number",
    min: -100,
    max: 100
  },
  {
    key: "particleSaturation",
    label: "Particle Saturation (%)",
    category: "particles",
    type: "number",
    min: 0,
    max: 100
  },
  {
    key: "particleLightness",
    label: "Particle Lightness (%)",
    category: "particles",
    type: "number",
    min: 0,
    max: 100
  },
  {
    key: "particleFollowTextColor",
    label: "Follow Text Color",
    category: "particles",
    type: "boolean"
  },

  { key: "shakeEnabled", label: "Shake Enabled", category: "shake", type: "boolean" },
  {
    key: "shakeDurationMs",
    label: "Shake Duration (ms)",
    category: "shake",
    type: "number",
    min: 1,
    max: 2400,
    insanityMax: 4000
  },
  {
    key: "shakeDistancePx",
    label: "Shake Distance (px)",
    category: "shake",
    type: "number",
    min: 1,
    max: 120,
    insanityMax: 220
  },
  { key: "shakeLoop", label: "Loop While Combo Active", category: "shake", type: "boolean" },

  { key: "hitCounterEnabled", label: "Hit Counter Enabled", category: "hitCounter", type: "boolean" },
  {
    key: "hitCounterLifetimeMs",
    label: "Hit Counter Lifetime (ms)",
    category: "hitCounter",
    type: "number",
    min: 100,
    max: 3000,
    insanityMax: 6000
  },
  {
    key: "hitCounterOffsetX",
    label: "Hit Counter Offset X (px)",
    category: "hitCounter",
    type: "number",
    min: -100,
    max: 100
  },
  {
    key: "hitCounterOffsetY",
    label: "Hit Counter Offset Y (px)",
    category: "hitCounter",
    type: "number",
    min: -200,
    max: 50
  },
  {
    key: "hitCounterFloatEnabled",
    label: "Float Like Damage Numbers",
    category: "hitCounter",
    type: "boolean"
  },
  {
    key: "hitCounterFloatDistancePx",
    label: "Float Distance (px)",
    category: "hitCounter",
    type: "number",
    min: 0,
    max: 200,
    insanityMax: 400
  },

  {
    key: "countNavigationKeys",
    label: "Count Navigation Keys",
    category: "input",
    type: "boolean"
  },
  {
    key: "anchorMode",
    label: "Anchor Mode",
    category: "input",
    type: "enum",
    options: ["caret-or-pointer", "pointer"]
  },
  { key: "targetSelectors", label: "Target Selectors", category: "input", type: "array-readonly" },
  { key: "ignoreKeys", label: "Ignored Keys", category: "input", type: "array-readonly" }
];

/** Round a raw step magnitude to a "nice" 1/2/5-times-a-power-of-ten value. */
function niceStep(raw) {
  if (raw <= 1) {
    return 1;
  }
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / pow;
  let niceNorm;
  if (norm < 1.5) {
    niceNorm = 1;
  } else if (norm < 3) {
    niceNorm = 2;
  } else if (norm < 7) {
    niceNorm = 5;
  } else {
    niceNorm = 10;
  }
  return Math.max(1, Math.round(niceNorm * pow));
}

/**
 * Derive the step-button ladder for a numeric field from its active range.
 * `base` is ~1% of the range (rounded to a nice number); the ladder is
 * [base, base*2, base*4] mirrored on both sides of the slider — e.g. particle
 * size (1-120) yields base=1, so buttons read -4/-2/-1 ... +1/+2/+4.
 */
function deriveSteps(min, max) {
  const range = Math.max(1, max - min);
  const base = niceStep(range * 0.01);
  return { base, ladder: [base, base * 2, base * 4] };
}

function clampValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

module.exports = {
  CATEGORIES,
  FIELDS,
  niceStep,
  deriveSteps,
  clampValue
};
