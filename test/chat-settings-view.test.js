// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { RUNTIME_KEYS } from "../out/src/chat-config.js";
import { FIELDS } from "../out/src/chat-settings-fields.js";

const requireCjs = createRequire(import.meta.url);

// "vscode" is not a real installed package - it only exists inside the real
// extension host at runtime. Stub it so chat-settings-view.js's top-level
// `require("vscode")` succeeds; getHtmlContent() never touches the value.
const Module = requireCjs("node:module");
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id, ...rest) {
  if (id === "vscode") return {};
  return originalRequire.call(this, id, ...rest);
};
const ChatSettingsViewProvider = requireCjs("../out/src/chat-settings-view.js");
Module.prototype.require = originalRequire;

const html = new ChatSettingsViewProvider({}, {}).getHtmlContent();
const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/);
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);

const postedMessages = [];

function fullSettingsState(overrides = {}) {
  const settings = { enabled: true, preset: "juicy-subtle-v1" };
  for (const field of FIELDS) {
    if (field.key === "enabled" || field.key === "preset") continue;
    if (field.type === "boolean") settings[field.key] = false;
    else if (field.type === "enum") settings[field.key] = field.options[0];
    else if (field.type === "array-readonly") settings[field.key] = ["a", "b"];
    else settings[field.key] = field.min;
  }
  return {
    settings: { ...settings, ...overrides },
    stats: { combo: 3, wpm: 42, maxCombo: 10, totalTyped: 100, totalEvents: 50 },
  };
}

beforeAll(() => {
  document.body.innerHTML = bodyMatch[1];
  window.acquireVsCodeApi = () => ({
    postMessage: (msg) => postedMessages.push(msg),
  });
  (0, eval)(scriptMatch[1]);
});

describe("sidebar renders every field into a category", () => {
  it("creates a <details> section per non-empty category, open for core", () => {
    const detailsEls = document.querySelectorAll("#categories details");
    // core, combo, particles, shake, hitCounter, input all have >=1 field
    expect(detailsEls.length).toBe(6);
    const core = [...detailsEls].find((d) => d.querySelector("summary").textContent === "Renderer Core");
    expect(core.open).toBe(true);
  });

  it("renders a control for every FIELDS entry", () => {
    // one control element per number/boolean/enum field
    expect(document.querySelectorAll('input[type="range"]').length).toBe(
      FIELDS.filter((f) => f.type === "number").length
    );
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(
      FIELDS.filter((f) => f.type === "boolean").length
    );
    expect(document.querySelectorAll("select").length).toBe(FIELDS.filter((f) => f.type === "enum").length);
  });
});

describe("stepper buttons match deriveSteps (particle size example)", () => {
  it("renders -4/-2/-1 and +1/+2/+4 for particleSizePx at its normal range", () => {
    window.dispatchEvent(new window.MessageEvent("message", { data: { type: "state", payload: fullSettingsState() } }));

    const details = [...document.querySelectorAll("#categories details")].find(
      (d) => d.querySelector("summary").textContent === "Particles"
    );
    const row = [...details.querySelectorAll(".field-label")].find((el) =>
      el.textContent.startsWith("Particle Size")
    ).closest(".stepper-row");
    const leftLabels = [...row.querySelectorAll(".stepper-group")[0].children].map((b) => b.textContent);
    const rightLabels = [...row.querySelectorAll(".stepper-group")[1].children].map((b) => b.textContent);
    expect(leftLabels).toEqual(["-4", "-2", "-1"]);
    expect(rightLabels).toEqual(["+1", "+2", "+4"]);
  });
});

describe("render() applies a full state push to every control type", () => {
  it("updates status pill, sliders, checkboxes, selects, and array previews", () => {
    const state = fullSettingsState({
      enabled: false,
      particleSizePx: 55,
      shakeEnabled: true,
      anchorMode: "pointer",
      targetSelectors: [".foo", ".bar"],
    });
    window.dispatchEvent(new window.MessageEvent("message", { data: { type: "state", payload: state } }));

    expect(document.getElementById("statusPill").textContent).toBe("OFF");
    expect(document.getElementById("comboValue").textContent).toBe("3");

    const sizeSlider = document.querySelector('input[type="range"][min="1"][max="120"]');
    expect(sizeSlider).not.toBeNull();
    expect(sizeSlider.value).toBe("55");

    const shakeCheckbox = [...document.querySelectorAll(".row-inline")]
      .find((r) => r.textContent.includes("Shake Enabled"))
      .querySelector('input[type="checkbox"]');
    expect(shakeCheckbox.checked).toBe(true);

    const anchorSelect = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "pointer")
    );
    expect(anchorSelect.value).toBe("pointer");
  });
});

describe("stepper click posts a clamped setConfig message", () => {
  it("increments particleSizePx by the ladder value and clamps at the active max", () => {
    window.dispatchEvent(
      new window.MessageEvent("message", { data: { type: "state", payload: fullSettingsState({ particleSizePx: 119 }) } })
    );
    postedMessages.length = 0;

    const sizeSlider = document.querySelector('input[type="range"][min="1"][max="120"]');
    const row = sizeSlider.previousSibling; // .stepper-row
    const rightGroup = row.querySelectorAll(".stepper-group")[1];
    const plusFourBtn = [...rightGroup.children].find((b) => b.textContent === "+4");
    plusFourBtn.click();

    expect(sizeSlider.value).toBe("120"); // 119 + 4 clamped to max 120
    const last = postedMessages[postedMessages.length - 1];
    expect(last).toEqual({ command: "setConfig", key: "particleSizePx", value: 120 });
  });
});

describe("switching to insanity widens ranges and rescales the stepper ladder", () => {
  it("particleSizePx max becomes 200 and the ladder doubles to 2/4/8", () => {
    window.dispatchEvent(new window.MessageEvent("message", { data: { type: "state", payload: fullSettingsState() } }));

    const presetSelect = [...document.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "insanity")
    );
    presetSelect.value = "insanity";
    presetSelect.dispatchEvent(new window.Event("change"));

    const sizeSlider = document.querySelector('input[min="1"][max="200"]');
    expect(sizeSlider).not.toBeNull();

    const row = sizeSlider.previousSibling;
    const rightGroup = row.querySelectorAll(".stepper-group")[1];
    const rightLabels = [...rightGroup.children].map((b) => b.textContent);
    expect(rightLabels).toEqual(["+2", "+4", "+8"]);

    const applyMsg = postedMessages.find((m) => m.command === "applyPreset");
    expect(applyMsg).toEqual({ command: "applyPreset", preset: "insanity" });
  });
});
