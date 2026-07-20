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
