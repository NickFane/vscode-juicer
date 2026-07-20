import { describe, it, expect } from "vitest";
import { RUNTIME_KEYS } from "../out/src/chat-config.js";
import { CATEGORIES, FIELDS, niceStep, deriveSteps, clampValue } from "../out/src/chat-settings-fields.js";

describe("FIELDS coverage", () => {
  it("has exactly one descriptor per RUNTIME_KEYS entry plus enabled/preset/safetyOff", () => {
    const keys = FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
    for (const key of RUNTIME_KEYS) {
      expect(keys, `missing ${key}`).toContain(key);
    }
    expect(keys).toContain("enabled");
    expect(keys).toContain("preset");
    expect(keys).toContain("safetyOff");
    expect(keys.length).toBe(RUNTIME_KEYS.length + 3);
  });

  it("every field belongs to a known category", () => {
    const categoryIds = new Set(CATEGORIES.map((c) => c.id));
    for (const field of FIELDS) {
      expect(categoryIds.has(field.category), `${field.key} -> ${field.category}`).toBe(true);
    }
  });

  it("every numeric field has min < max, and insanityMax (if set) >= max", () => {
    for (const field of FIELDS.filter((f) => f.type === "number")) {
      expect(field.min, field.key).toBeLessThan(field.max);
      if (field.insanityMax !== undefined) {
        expect(field.insanityMax, field.key).toBeGreaterThanOrEqual(field.max);
      }
    }
  });

  it("every enum field lists at least 2 options", () => {
    for (const field of FIELDS.filter((f) => f.type === "enum")) {
      expect(field.options.length, field.key).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("niceStep", () => {
  it("never returns less than 1", () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(0.4)).toBe(1);
  });

  it("rounds to a 1/2/5-times-a-power-of-ten value", () => {
    expect(niceStep(1.2)).toBe(1);
    expect(niceStep(2.4)).toBe(2);
    expect(niceStep(5.9)).toBe(5);
    expect(niceStep(59.9)).toBe(50);
  });
});

describe("deriveSteps", () => {
  it("matches the particle-size example: base 1, ladder [1, 2, 4]", () => {
    const { base, ladder } = deriveSteps(1, 120);
    expect(base).toBe(1);
    expect(ladder).toEqual([1, 2, 4]);
  });

  it("scales up for wide-range fields (particle lifetime)", () => {
    const { ladder } = deriveSteps(40, 6000);
    expect(ladder).toEqual([50, 100, 200]);
  });

  it("scales further when the insanity-unlocked max is used", () => {
    const normal = deriveSteps(1, 120);
    const insanity = deriveSteps(1, 200);
    expect(insanity.base).toBeGreaterThan(normal.base);
  });
});

describe("clampValue", () => {
  it("clamps into [min, max]", () => {
    expect(clampValue(50, 0, 10)).toBe(10);
    expect(clampValue(-5, 0, 10)).toBe(0);
    expect(clampValue(5, 0, 10)).toBe(5);
  });
});
