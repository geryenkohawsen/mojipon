import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  resolveZipEntries,
  buildZip,
  EMPTY_ZIP,
  PACK_COLLISION,
} from "./pack";

const blob = new Blob([new Uint8Array([1])], { type: "image/png" });

describe("resolveZipEntries", () => {
  it("sanitizes filenames and dedupes pack-level collisions", () => {
    const r = resolveZipEntries([
      { filename: "ok.png", blob },
      { filename: "ok.png", blob },
    ]);
    expect(r.files.map((f) => f.filename)).toEqual(["ok.png", "ok_2.png"]);
    expect(r.warnings).toContain(PACK_COLLISION);
  });

  it("strips unsafe path chars from each filename", () => {
    const r = resolveZipEntries([{ filename: "../bad.png", blob }]);
    expect(r.files[0].filename).toBe("bad.png");
  });
});

describe("buildZip", () => {
  it("throws EMPTY_ZIP when input is empty", async () => {
    await expect(buildZip([])).rejects.toThrow(EMPTY_ZIP);
  });

  it("produces a zip containing the resolved filenames", async () => {
    const r = resolveZipEntries([
      { filename: "lgtm.png", blob },
      { filename: "了解.png", blob },
    ]);
    const zipBlob = await buildZip(r.files);
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(["lgtm.png", "了解.png"].sort());
  });
});
