import { describe, expect, it } from "vitest";
import { buildVariants, READING_UNCERTAIN } from "./variants";

describe("buildVariants", () => {
  it("produces 3 variants for kanji with reading", () => {
    const r = buildVariants({
      original: "確認中",
      scriptClass: "kanji",
      effectiveReading: "かくにんちゅう",
      customFilename: undefined,
    });
    expect(r.variants.map((v) => v.filename)).toEqual([
      "kakuninchuu.png",
      "かくにんちゅう.png",
      "確認中.png",
    ]);
    expect(r.variants[0].safety).toBe("recommended-slack-name");
    expect(r.variants[1].safety).toBe("filename-safe");
    expect(r.variants[2].safety).toBe("filename-safe");
  });

  it("produces 2 variants for pure kana", () => {
    const r = buildVariants({
      original: "ありがとう",
      scriptClass: "kana",
      effectiveReading: "ありがとう",
      customFilename: undefined,
    });
    expect(r.variants.map((v) => v.filename)).toEqual([
      "arigatou.png",
      "ありがとう.png",
    ]);
  });

  it("produces 1 lowercased variant for latin", () => {
    const r = buildVariants({
      original: "LGTM",
      scriptClass: "latin",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    expect(r.variants.map((v) => v.filename)).toEqual(["lgtm.png"]);
    expect(r.variants[0].safety).toBe("recommended-slack-name");
  });

  it("produces 2 variants for mixed", () => {
    const r = buildVariants({
      original: "LGTMです",
      scriptClass: "mixed",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    expect(r.variants.map((v) => v.filename)).toEqual([
      "lgtmdesu.png",
      "LGTMです.png",
    ]);
  });

  it("returns only original when kanji has no reading", () => {
    const r = buildVariants({
      original: "確認中",
      scriptClass: "kanji",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    expect(r.variants.map((v) => v.filename)).toEqual(["確認中.png"]);
    expect(r.warnings).toContain(READING_UNCERTAIN);
  });

  it("uses customFilename for symbol input", () => {
    const r = buildVariants({
      original: "🔥",
      scriptClass: "symbol",
      effectiveReading: undefined,
      customFilename: "fire",
    });
    expect(r.variants.map((v) => v.filename)).toEqual(["fire.png"]);
    expect(r.variants[0].safety).toBe("needs-review");
  });

  it("returns empty for empty input", () => {
    const r = buildVariants({
      original: "",
      scriptClass: "empty",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    expect(r.variants).toEqual([]);
  });

  it("produces single variant for short latin", () => {
    const r = buildVariants({
      original: "ok",
      scriptClass: "latin",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    expect(r.variants).toHaveLength(1);
  });
});
