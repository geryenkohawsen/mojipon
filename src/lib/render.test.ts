import { describe, expect, it } from "vitest";
import { drawEmojiToCanvas, exportCanvasToPng } from "./render";

function makeMockContext() {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    ctx: {
      fillStyle: "",
      font: "",
      textAlign: "" as CanvasTextAlign,
      textBaseline: "" as CanvasTextBaseline,
      clearRect: (...a: unknown[]) => calls.push({ method: "clearRect", args: a }),
      fillRect: (...a: unknown[]) => calls.push({ method: "fillRect", args: a }),
      fillText: (...a: unknown[]) => calls.push({ method: "fillText", args: a }),
      measureText: (text: string) => ({ width: text.length * 30 }),
    },
  };
}

describe("drawEmojiToCanvas", () => {
  it("clears, fills background, fills text", async () => {
    const { ctx, calls } = makeMockContext();
    const canvas = {
      width: 128,
      height: 128,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;

    await drawEmojiToCanvas(canvas, {
      text: "OK",
      bgColor: "#fff",
      textColor: "#000",
      fontFamily: '"Noto Sans JP"',
      maxFontSize: 64,
      minFontSize: 24,
    });

    expect(ctx.fillStyle).toBeTruthy();
    expect(ctx.font).toContain('"Noto Sans JP"');
    const methods = calls.map((c) => c.method);
    expect(methods).toContain("clearRect");
    expect(methods).toContain("fillRect");
    expect(methods).toContain("fillText");
  });
});

describe("exportCanvasToPng", () => {
  it("resolves with png blob when toBlob succeeds", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => cb(blob),
    } as unknown as HTMLCanvasElement;
    await expect(exportCanvasToPng(canvas)).resolves.toBe(blob);
  });

  it("rejects when toBlob returns null", async () => {
    const canvas = {
      toBlob: (cb: (b: Blob | null) => void) => cb(null),
    } as unknown as HTMLCanvasElement;
    await expect(exportCanvasToPng(canvas)).rejects.toThrow("PNG export failed");
  });
});
