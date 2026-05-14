import { describe, expect, it, vi } from "vitest";
import { ensureFontsReady, FONT_LOAD_TIMEOUT } from "./fonts";

describe("ensureFontsReady", () => {
  it("resolves when document.fonts.load resolves", async () => {
    const load = vi.fn().mockResolvedValue([]);
    const readyPromise = Promise.resolve();
    const fakeDoc = { fonts: { load, ready: readyPromise } };
    const result = await ensureFontsReady('"Noto Sans JP"', 64, 1000, fakeDoc as never);
    expect(result.warnings).toEqual([]);
    expect(load).toHaveBeenCalledWith('64px "Noto Sans JP"');
  });

  it("returns warning when load times out", async () => {
    const load = () => new Promise(() => {});
    const fakeDoc = { fonts: { load, ready: new Promise(() => {}) } };
    const result = await ensureFontsReady('"Noto Sans JP"', 64, 50, fakeDoc as never);
    expect(result.warnings).toContain(FONT_LOAD_TIMEOUT);
  });
});
