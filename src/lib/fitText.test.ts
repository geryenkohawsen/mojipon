import { describe, expect, it } from "vitest";
import { calculateFittedFontSize, TEXT_TOO_LONG } from "./fitText";

function makeMeasurer(perCharPx: number) {
  return (text: string, fontSize: number) => text.length * fontSize * perCharPx;
}

describe("calculateFittedFontSize", () => {
  it("returns default size for short text that fits", () => {
    const r = calculateFittedFontSize({
      text: "OK",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(0.5),
    });
    expect(r.size).toBe(64);
    expect(r.warnings).toEqual([]);
  });

  it("shrinks to fit", () => {
    const r = calculateFittedFontSize({
      text: "LongerText",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(0.5),
    });
    expect(r.size).toBeLessThan(64);
    expect(r.size).toBeGreaterThanOrEqual(24);
  });

  it("returns minSize and warning when still overflows", () => {
    const r = calculateFittedFontSize({
      text: "AAAAAAAAAAAAAAAAAAAA",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(1),
    });
    expect(r.size).toBe(24);
    expect(r.warnings).toContain(TEXT_TOO_LONG);
  });
});
