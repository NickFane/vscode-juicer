// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { RUNTIME_KEYS } from "../out/src/chat-config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const injectorSource = readFileSync(
  path.join(here, "../renderer/vscode-juicer-injector.js"),
  "utf8"
);

beforeAll(() => {
  // storedConfig (localStorage) is lower precedence than runtimeConfig (window.*)
  window.localStorage.setItem(
    "vscodeJuicerConfig",
    JSON.stringify({ particleSizePx: 7, shakeDurationMs: 222 })
  );
  window.__vscodeJuicerConfig = { shakeDurationMs: 111 };
  // Intentionally leave __vscodeJuicerConfigUrl unset so the live poller stays idle
  // (no fetch/timer churn during the test).
  // Indirect eval runs in global scope where jsdom's window/document are globals.
  (0, eval)(injectorSource);
});

describe("renderer config merge precedence", () => {
  it("window.__vscodeJuicerConfig wins over localStorage", () => {
    expect(window.vscodeJuicer.getConfig().shakeDurationMs).toBe(111);
  });

  it("localStorage wins over built-in defaults", () => {
    expect(window.vscodeJuicer.getConfig().particleSizePx).toBe(7);
  });

  it("built-in defaults fill in untouched keys", () => {
    expect(window.vscodeJuicer.getConfig().comboDecayMs).toBe(1500);
  });
});

describe("renderer DEFAULT_CONFIG stays in sync with the preset shape", () => {
  it("exposes exactly the runtime keys the installer writes", () => {
    const keys = Object.keys(window.vscodeJuicer.getConfig()).sort();
    expect(keys).toEqual([...RUNTIME_KEYS].sort());
  });
});

describe("applyLiveConfig (B4 — live update without reload)", () => {
  it("updates in-memory config and the driving CSS custom property", () => {
    window.__vscodeJuicerApplyConfig({ shakeDurationMs: 999 });
    expect(window.vscodeJuicer.getConfig().shakeDurationMs).toBe(999);
    expect(
      document.documentElement.style.getPropertyValue("--pm-shake-duration")
    ).toBe("999ms");
  });

  it("ignores non-object payloads", () => {
    const before = window.vscodeJuicer.getConfig().shakeDurationMs;
    window.__vscodeJuicerApplyConfig(null);
    window.__vscodeJuicerApplyConfig("nope");
    expect(window.vscodeJuicer.getConfig().shakeDurationMs).toBe(before);
  });
});

describe("live-config transport (B1 — sandbox-safe)", () => {
  it("uses a fetchable config URL, not Node require('fs')", () => {
    expect(injectorSource).toContain("__vscodeJuicerConfigUrl");
    expect(injectorSource).toMatch(/fetch\(configUrl/);
    // the old Node transport (fs.readFileSync) must be gone
    expect(injectorSource).not.toContain("readFileSync");
    expect(injectorSource).not.toContain("__vscodeJuicerConfigPath");
  });
});

describe("hit counter combo growth and float", () => {
  // jsdom has no real layout engine: getBoundingClientRect/offsetWidth always report 0.
  // These tests exercise the deterministic fallback paths and the class/CSS-variable
  // wiring; the actual adaptive-width overlap fix, visual growth, and float smoothness
  // can only be confirmed in a real VS Code window (see docs/testing.md / juicer-dev skill).

  function dispatchTypingKeydown(target, key = "a") {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
  }

  function trackedInput() {
    const el = document.createElement("div");
    el.className = "interactive-input-part";
    document.body.appendChild(el);
    return el;
  }

  it("shows the hit counter on a qualifying keydown", () => {
    const input = trackedInput();
    dispatchTypingKeydown(input);
    const counter = document.getElementById("pm-hit-counter");
    expect(counter).not.toBeNull();
    expect(counter.classList.contains("pm-hit-counter-visible")).toBe(true);
  });

  it("increases --pm-hit-growth as combo climbs, then plateaus at the cap", () => {
    const input = trackedInput();
    const counter = document.getElementById("pm-hit-counter");

    dispatchTypingKeydown(input);
    const growthAtOne = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));

    for (let i = 0; i < 20; i++) {
      dispatchTypingKeydown(input);
    }
    const growthAtTwentyOne = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));
    expect(growthAtTwentyOne).toBeGreaterThan(growthAtOne);

    // combo is reset by the hide timer in real usage, but within a single burst (no
    // timers fired) combo keeps climbing; dispatch well past the growth cap (60).
    for (let i = 0; i < 60; i++) {
      dispatchTypingKeydown(input);
    }
    const growthPastCap = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));
    dispatchTypingKeydown(input);
    const growthOneMore = parseFloat(counter.style.getPropertyValue("--pm-hit-growth"));
    expect(growthOneMore).toBe(growthPastCap);
  });

  it("toggles the float class and distance variable via live config", () => {
    const input = trackedInput();
    const counter = document.getElementById("pm-hit-counter");

    window.__vscodeJuicerApplyConfig({
      hitCounterFloatEnabled: true,
      hitCounterFloatDistancePx: 77
    });
    dispatchTypingKeydown(input);
    expect(counter.classList.contains("pm-hit-float")).toBe(true);
    expect(counter.style.getPropertyValue("--pm-hit-float-distance")).toBe("77px");

    window.__vscodeJuicerApplyConfig({ hitCounterFloatEnabled: false });
    dispatchTypingKeydown(input);
    expect(counter.classList.contains("pm-hit-float")).toBe(false);
  });

  it("positions the speed multiplier using the jsdom fallback half-width (overlap fix)", () => {
    window.__vscodeJuicerApplyConfig({ safetyOff: true }); // bypass the WPM>=50 gate
    const input = trackedInput();
    dispatchTypingKeydown(input);

    const multiplier = document.getElementById("pm-speed-multiplier");
    expect(multiplier).not.toBeNull();
    // hitCounterOffsetX default (16) + fallback half-width (60) + gap (10) = 86.
    // Anchor x/y come from lastPointer (window center) since jsdom rects are all zero.
    const expectedLeft = window.innerWidth / 2 + 16 + 60 + 10;
    expect(multiplier.style.left).toBe(`${expectedLeft}px`);
  });
});
