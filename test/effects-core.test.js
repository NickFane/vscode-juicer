// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const effectsSource = readFileSync(path.join(here, "../renderer/effects-core.js"), "utf8");

const DEFAULT_TEST_CONFIG = {
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
  particleFollowTextColor: false,
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
  safetyOff: false
};

beforeAll(() => {
  (0, eval)(effectsSource);
});

describe("createEffects is exposed as a host-agnostic factory", () => {
  it("attaches window.VSJuicerEffectsCore.createEffects", () => {
    expect(typeof window.VSJuicerEffectsCore).toBe("object");
    expect(typeof window.VSJuicerEffectsCore.createEffects).toBe("function");
  });

  it("has no window.__vscodeJuicer* globals or fetch dependency", () => {
    expect(effectsSource).not.toContain("__vscodeJuicerConfig");
    expect(effectsSource).not.toContain("fetch(");
    expect(effectsSource).not.toContain("localStorage");
  });
});

describe("triggerKeystroke", () => {
  let effects;
  let config;

  beforeEach(() => {
    document.body.innerHTML = "";
    config = { ...DEFAULT_TEST_CONFIG };
    effects = window.VSJuicerEffectsCore.createEffects(config);
    effects.injectStyles();
  });

  it("shows a hit counter at the given anchor with combo growth applied", () => {
    effects.triggerKeystroke({ x: 100, y: 200 }, null);
    const counter = document.getElementById("pm-hit-counter");
    expect(counter).not.toBeNull();
    expect(counter.textContent).toBe("1 HIT");
    expect(counter.classList.contains("pm-hit-counter-visible")).toBe(true);
    expect(counter.style.left).toBe((100 + config.hitCounterOffsetX) + "px");
    expect(counter.style.top).toBe((200 + config.hitCounterOffsetY) + "px");
  });

  it("increases --pm-hit-growth as combo climbs, then plateaus at the cap (60)", () => {
    effects.triggerKeystroke({ x: 0, y: 0 }, null);
    const counter = document.getElementById("pm-hit-counter");
    const growthAtOne = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));

    for (let i = 0; i < 60; i++) effects.triggerKeystroke({ x: 0, y: 0 }, null);
    const growthAtSixtyOne = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));
    expect(growthAtSixtyOne).toBeGreaterThan(growthAtOne);

    effects.triggerKeystroke({ x: 0, y: 0 }, null);
    const growthOneMore = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));
    expect(growthOneMore).toBe(growthAtSixtyOne);
  });

  it("positions the speed multiplier to the right of the hit counter without overlap", () => {
    config.safetyOff = true; // bypass the WPM>=50 gate so the multiplier always shows
    effects.triggerKeystroke({ x: 50, y: 60 }, null);
    const multiplier = document.getElementById("pm-speed-multiplier");
    expect(multiplier).not.toBeNull();
    // jsdom has no layout, so offsetWidth is 0 -> the deterministic fallback applies.
    const expectedLeft = 50 + config.hitCounterOffsetX + 60 + 10;
    expect(multiplier.style.left).toBe(expectedLeft + "px");
  });

  it("toggles the float class and distance variable when hitCounterFloatEnabled", () => {
    config.hitCounterFloatEnabled = true;
    config.hitCounterFloatDistancePx = 77;
    effects.triggerKeystroke({ x: 0, y: 0 }, null);
    const counter = document.getElementById("pm-hit-counter");
    expect(counter.classList.contains("pm-hit-float")).toBe(true);
    expect(counter.style.getPropertyValue("--pm-hit-float-distance")).toBe("77px");
  });

  it("adds the combo-glow class and intensity variable to a supplied container", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    effects.triggerKeystroke({ x: 0, y: 0 }, container);
    expect(container.classList.contains("pm-combo-glow")).toBe(true);
    expect(container.style.getPropertyValue("--pm-combo-intensity")).not.toBe("");
  });

  it("does not touch a null container (host owns whether to pass one)", () => {
    expect(() => effects.triggerKeystroke({ x: 0, y: 0 }, null)).not.toThrow();
  });

  it("spawns particle elements on the page", () => {
    effects.triggerKeystroke({ x: 10, y: 10 }, null);
    expect(document.querySelectorAll(".pm-particle").length).toBe(config.particlesPerKeystroke);
  });

  it("tracks combo count via getCombo()", () => {
    expect(effects.getCombo()).toBe(0);
    effects.triggerKeystroke({ x: 0, y: 0 }, null);
    effects.triggerKeystroke({ x: 0, y: 0 }, null);
    expect(effects.getCombo()).toBe(2);
  });
});

describe("recordTypedChars / WPM", () => {
  it("computes a WPM estimate from typed character volume", () => {
    document.body.innerHTML = "";
    const config = { ...DEFAULT_TEST_CONFIG };
    const effects = window.VSJuicerEffectsCore.createEffects(config);
    expect(effects.getWpm()).toBe(0);
    effects.recordTypedChars(50); // 50 chars / 5 chars-per-word, over a 5s window -> >0 WPM
    expect(effects.getWpm()).toBeGreaterThan(0);
  });
});

describe("applyLiveConfigVars", () => {
  it("pushes config timing values onto CSS custom properties of the given root", () => {
    const config = { ...DEFAULT_TEST_CONFIG, shakeDurationMs: 999, hitCounterLifetimeMs: 1234 };
    const effects = window.VSJuicerEffectsCore.createEffects(config);
    const root = document.createElement("div");
    effects.applyLiveConfigVars(root);
    expect(root.style.getPropertyValue("--pm-shake-duration")).toBe("999ms");
    expect(root.style.getPropertyValue("--pm-hit-lifetime")).toBe("1234ms");
  });
});

describe("injectStyles", () => {
  it("installs the shared stylesheet exactly once even if called twice", () => {
    document.head.innerHTML = "";
    const effects = window.VSJuicerEffectsCore.createEffects({ ...DEFAULT_TEST_CONFIG });
    effects.injectStyles();
    effects.injectStyles();
    expect(document.head.querySelectorAll("#vscode-juicer-effects-style").length).toBe(1);
  });
});
