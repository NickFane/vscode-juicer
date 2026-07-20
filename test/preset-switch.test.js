import { describe, it, expect } from "vitest";
import {
  resolveRuntime,
  presetConfigEntries,
  PRESETS
} from "../out/src/chat-config.js";

/**
 * Models the extension-host config flow to prove the preset-switch fix (B2).
 *
 * `store` stands in for the user's global settings. `get` mirrors the installer's
 * `cfg.get(key, fallback)`. `applyPreset` mirrors installer.applyPreset writing the
 * preset's per-key values into settings.
 */
function makeStore() {
  const store = new Map();
  const get = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
  const applyPreset = (name) => {
    store.set("preset", name);
    for (const [key, value] of presetConfigEntries(name)) {
      store.set(key, value);
    }
  };
  return { store, get, applyPreset };
}

describe("preset switching (B2)", () => {
  it("REGRESSION: changing only the preset key leaves stale explicit values (the bug)", () => {
    const { store, get, applyPreset } = makeStore();

    // User applies legacy -> explicit legacy values are written to settings.
    applyPreset("legacy");
    expect(resolveRuntime("legacy", get).particlesPerKeystroke).toBe(
      PRESETS.legacy.particlesPerKeystroke
    );

    // User flips ONLY the preset dropdown to juicy-subtle-v1 (no re-apply).
    store.set("preset", "juicy-subtle-v1");

    // Bug: the explicit legacy value still wins -> runtime is stuck on legacy.
    expect(resolveRuntime("juicy-subtle-v1", get).particlesPerKeystroke).toBe(
      PRESETS.legacy.particlesPerKeystroke
    );
  });

  it("FIX: re-applying the preset on change yields the new preset's runtime", () => {
    const { get, applyPreset } = makeStore();

    applyPreset("legacy");
    // The fix re-applies the preset whenever the dropdown changes.
    applyPreset("juicy-subtle-v1");

    const runtime = resolveRuntime("juicy-subtle-v1", get);
    expect(runtime.particlesPerKeystroke).toBe(
      PRESETS["juicy-subtle-v1"].particlesPerKeystroke
    );
    expect(runtime.particleSizePx).toBe(PRESETS["juicy-subtle-v1"].particleSizePx);
    expect(runtime.shakeLoop).toBe(PRESETS["juicy-subtle-v1"].shakeLoop);
  });

  it("does not force-write safetyOff even when applying insanity", () => {
    const { store, applyPreset } = makeStore();
    applyPreset("insanity");
    expect(store.has("safetyOff")).toBe(false);
  });
});
