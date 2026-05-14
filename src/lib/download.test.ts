import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { downloadBlob } from "./download";

describe("downloadBlob", () => {
  let createSpy: ReturnType<typeof vi.spyOn>;
  let revokeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });
  afterEach(() => {
    createSpy.mockRestore();
    revokeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("creates and revokes an object URL and triggers a click", () => {
    const blob = new Blob(["x"]);
    const anchorClick = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag as keyof HTMLElementTagNameMap);
      if (tag === "a") {
        (el as HTMLAnchorElement).click = anchorClick;
      }
      return el;
    });

    downloadBlob(blob, "mojipon-emoji.zip");

    expect(createSpy).toHaveBeenCalledWith(blob);
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalledWith("blob:test");
  });
});
