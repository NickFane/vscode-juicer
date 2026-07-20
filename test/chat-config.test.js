import { describe, it, expect } from "vitest";
import {
  PRESETS,
  RUNTIME_KEYS,
  getPreset,
  resolveRuntime,
  presetConfigEntries,
  stripPatch,
  makeInjectedBlock,
  applyPatch,
  SESSION_MARKER,
  START_MARKER,
  END_MARKER
} from "../out/src/chat-config.js";

describe("getPreset", () => {
  it("returns each known preset", () => {
    for (const name of ["juicy-subtle-v1", "legacy", "insanity"]) {
      expect(getPreset(name)).toBe(PRESETS[name]);
    }
  });

  it("falls back to juicy-subtle-v1 for unknown names", () => {
    expect(getPreset("does-not-exist")).toBe(PRESETS["juicy-subtle-v1"]);
    expect(getPreset(undefined)).toBe(PRESETS["juicy-subtle-v1"]);
  });
});

describe("preset shape", () => {
  it("every preset defines every runtime key", () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      for (const key of RUNTIME_KEYS) {
        expect(preset[key], `${name}.${key}`).not.toBeUndefined();
      }
    }
  });

  it("only insanity opts into safetyOff", () => {
    expect(PRESETS.insanity.safetyOff).toBe(true);
    expect(PRESETS["juicy-subtle-v1"].safetyOff).toBeUndefined();
    expect(PRESETS.legacy.safetyOff).toBeUndefined();
  });

  it("hitCounterFloatEnabled defaults to false in every preset", () => {
    expect(PRESETS["juicy-subtle-v1"].hitCounterFloatEnabled).toBe(false);
    expect(PRESETS.legacy.hitCounterFloatEnabled).toBe(false);
    expect(PRESETS.insanity.hitCounterFloatEnabled).toBe(false);
  });
});

describe("resolveRuntime", () => {
  const noOverrides = (key, fallback) => fallback;

  it("returns preset defaults when nothing is overridden", () => {
    const runtime = resolveRuntime("legacy", noOverrides);
    expect(runtime.particlesPerKeystroke).toBe(PRESETS.legacy.particlesPerKeystroke);
    expect(runtime.shakeLoop).toBe(PRESETS.legacy.shakeLoop);
  });

  it("lets explicit values win over preset defaults", () => {
    const store = { particlesPerKeystroke: 99 };
    const get = (key, fallback) => (key in store ? store[key] : fallback);
    const runtime = resolveRuntime("juicy-subtle-v1", get);
    expect(runtime.particlesPerKeystroke).toBe(99);
    // untouched keys still resolve to the preset default
    expect(runtime.particleSizePx).toBe(PRESETS["juicy-subtle-v1"].particleSizePx);
  });

  it("resolves safetyOff from the preset when unset, defaulting to false", () => {
    expect(resolveRuntime("insanity", noOverrides).safetyOff).toBe(true);
    expect(resolveRuntime("juicy-subtle-v1", noOverrides).safetyOff).toBe(false);
  });

  it("lets an explicit hitCounterFloatDistancePx override the preset default", () => {
    const store = { hitCounterFloatDistancePx: 77 };
    const get = (key, fallback) => (key in store ? store[key] : fallback);
    const runtime = resolveRuntime("juicy-subtle-v1", get);
    expect(runtime.hitCounterFloatDistancePx).toBe(77);
    expect(runtime.hitCounterFloatEnabled).toBe(PRESETS["juicy-subtle-v1"].hitCounterFloatEnabled);
  });
});

describe("presetConfigEntries", () => {
  it("includes every runtime key and never safetyOff", () => {
    const entries = presetConfigEntries("insanity");
    const keys = entries.map(([k]) => k);
    expect(keys).not.toContain("safetyOff");
    for (const key of RUNTIME_KEYS) {
      expect(keys, `missing ${key}`).toContain(key);
    }
  });
});

describe("stripPatch", () => {
  const clean = "<html><head><title>x</title></head><body></body></html>";
  const block = makeInjectedBlock({ a: 1 }, "INJECTED_SOURCE", "cfg.json");
  const injected = clean.replace("</head>", `${block}</head>`);

  it("removes an injected managed block back to the original", () => {
    expect(stripPatch(injected)).toBe(clean);
  });

  it("is a no-op on already-clean HTML", () => {
    expect(stripPatch(clean)).toBe(clean);
  });

  it("is idempotent", () => {
    expect(stripPatch(stripPatch(injected))).toBe(clean);
  });
});

describe("makeInjectedBlock", () => {
  it("wraps the injector in all three markers with an inline config snapshot", () => {
    const block = makeInjectedBlock({ particleSizePx: 4 }, "INJECTOR", "cfg.json");
    expect(block).toContain(SESSION_MARKER);
    expect(block).toContain(START_MARKER);
    expect(block).toContain(END_MARKER);
    expect(block).toContain("window.__vscodeJuicerConfig = ");
    expect(block).toContain('"particleSizePx": 4');
    expect(block).toContain("INJECTOR");
  });

  it("exposes the config URL only when a locator is provided", () => {
    expect(makeInjectedBlock({}, "X", "live.json")).toContain(
      'window.__vscodeJuicerConfigUrl = "live.json"'
    );
    expect(makeInjectedBlock({}, "X", null)).not.toContain(
      "__vscodeJuicerConfigUrl"
    );
  });
});

describe("applyPatch", () => {
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src none;" />';
  const html = `<html><head>${csp}<title>x</title></head><body></body></html>`;
  const block = makeInjectedBlock({ a: 1 }, "INJECTOR", "cfg.json");

  it("strips the CSP meta and injects the block before </head>", () => {
    const out = applyPatch(html, block);
    expect(out).not.toContain("Content-Security-Policy");
    expect(out).toContain(START_MARKER);
    expect(out.indexOf(START_MARKER)).toBeLessThan(out.indexOf("</head>"));
  });

  it("is idempotent (re-sync replaces, never stacks, the block)", () => {
    const once = applyPatch(html, block);
    const twice = applyPatch(once, block);
    expect(twice).toBe(once);
    // exactly one managed block
    expect(once.split(START_MARKER).length - 1).toBe(1);
    expect(twice.split(START_MARKER).length - 1).toBe(1);
  });
});
