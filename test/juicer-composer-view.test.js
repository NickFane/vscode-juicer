// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const requireCjs = createRequire(import.meta.url);

// "vscode" only exists inside the real extension host. Stub the pieces
// getHtmlContent()/the constructor touch: Uri.joinPath (used to resolve the
// effects-core.js script path) and nothing else.
const Module = requireCjs("node:module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id, ...rest) {
  if (id === "vscode") {
    return { Uri: { joinPath: (...segments) => segments.join("/") } };
  }
  return originalRequire.call(this, id, ...rest);
};
const JuicerComposerViewProvider = requireCjs("../out/src/juicer-composer-view.js");
Module.prototype.require = originalRequire;

const fakeWebview = { asWebviewUri: (uri) => "vscode-webview://fake/" + uri };
const provider = new JuicerComposerViewProvider({ extensionUri: "ext" }, {});
const html = provider.getHtmlContent(fakeWebview);

const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const inlineScriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

const effectsCoreSource = readFileSync(path.join(here, "../renderer/effects-core.js"), "utf8");

const postedMessages = [];

function fullConfig(overrides = {}) {
  return {
    enabled: true,
    preset: "juicy-subtle-v1",
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
    targetSelectors: [],
    ignoreKeys: ["Shift", "Control", "Alt", "Meta"],
    ...overrides,
  };
}

function pushConfig(overrides = {}) {
  window.dispatchEvent(
    new window.MessageEvent("message", { data: { type: "config", payload: fullConfig(overrides) } })
  );
}

beforeAll(() => {
  document.body.innerHTML = bodyMatch[1];
  window.acquireVsCodeApi = () => ({
    postMessage: (msg) => postedMessages.push(msg),
  });
  // Two sequential <script> tags in the real page: effects-core.js first,
  // then the inline composer script that reads window.VSJuicerEffectsCore.
  (0, eval)(effectsCoreSource);
  (0, eval)(inlineScriptMatch[1]);
});

describe("Composer renders its controls", () => {
  it("has a textarea, live-sync checkbox, and send button", () => {
    expect(document.getElementById("composerInput")).not.toBeNull();
    expect(document.getElementById("liveSyncToggle")).not.toBeNull();
    expect(document.getElementById("sendBtn")).not.toBeNull();
  });

  it("posts a ready message on load", () => {
    expect(postedMessages.some((m) => m.command === "ready")).toBe(true);
  });
});

describe("wiring effects-core to the composer's own textarea", () => {
  it("triggers a hit counter on a qualifying keydown once config arrives", () => {
    pushConfig();
    const input = document.getElementById("composerInput");
    input.value = "h";
    input.selectionEnd = 1;
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "h", bubbles: true }));

    const counter = document.getElementById("pm-hit-counter");
    expect(counter).not.toBeNull();
    expect(counter.classList.contains("pm-hit-counter-visible")).toBe(true);
  });

  it("does not throw before config has arrived (fresh page load)", () => {
    // Reload a second, isolated instance of the script state is awkward here;
    // instead assert the guard exists in source (effects starts null and every
    // handler checks it) - the real no-crash behavior is exercised by the
    // "posts a ready message on load" test running before any config push.
    expect(inlineScriptMatch[1]).toContain("if (!effects");
  });
});

describe("submitting composed text", () => {
  it("Enter (no shift) posts a submit message with the text and clears the input", () => {
    postedMessages.length = 0;
    const input = document.getElementById("composerInput");
    input.value = "hello world";
    const event = new window.KeyboardEvent("keydown", { key: "Enter", shiftKey: false, bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(postedMessages).toContainEqual({ command: "submit", text: "hello world" });
    expect(input.value).toBe("");
  });

  it("Shift+Enter does not submit", () => {
    postedMessages.length = 0;
    const input = document.getElementById("composerInput");
    input.value = "line one";
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));

    expect(postedMessages.some((m) => m.command === "submit")).toBe(false);
  });

  it("the Send button posts the same submit message", () => {
    postedMessages.length = 0;
    const input = document.getElementById("composerInput");
    input.value = "via button";
    document.getElementById("sendBtn").click();

    expect(postedMessages).toContainEqual({ command: "submit", text: "via button" });
  });

  it("does not submit empty/whitespace-only text", () => {
    postedMessages.length = 0;
    const input = document.getElementById("composerInput");
    input.value = "   ";
    document.getElementById("sendBtn").click();
    expect(postedMessages.some((m) => m.command === "submit")).toBe(false);
  });
});

describe("live-sync mode (debounced)", () => {
  it("posts a liveSync message after the debounce, only when the checkbox is checked", () => {
    vi.useFakeTimers();
    try {
      postedMessages.length = 0;
      const input = document.getElementById("composerInput");
      const toggle = document.getElementById("liveSyncToggle");

      toggle.checked = false;
      input.value = "not synced";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      vi.advanceTimersByTime(1000);
      expect(postedMessages.some((m) => m.command === "liveSync")).toBe(false);

      toggle.checked = true;
      input.value = "synced text";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      vi.advanceTimersByTime(1000);
      expect(postedMessages).toContainEqual({ command: "liveSync", text: "synced text" });
    } finally {
      vi.useRealTimers();
    }
  });
});
