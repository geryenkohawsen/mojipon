import { describe, expect, it } from "vitest";
import { detectScriptClass } from "./script";

describe("detectScriptClass", () => {
  it("classifies pure latin", () => {
    expect(detectScriptClass("LGTM")).toBe("latin");
  });
  it("classifies hiragana as kana", () => {
    expect(detectScriptClass("ありがとう")).toBe("kana");
  });
  it("classifies katakana as kana", () => {
    expect(detectScriptClass("カタカナ")).toBe("kana");
  });
  it("classifies kanji input", () => {
    expect(detectScriptClass("確認中")).toBe("kanji");
  });
  it("treats any kanji as kanji even with latin", () => {
    expect(detectScriptClass("LGTM了解")).toBe("kanji");
  });
  it("treats parenthesized kanji as kanji", () => {
    expect(detectScriptClass("(笑)")).toBe("kanji");
  });
  it("classifies latin + kana mix as mixed", () => {
    expect(detectScriptClass("LGTMです")).toBe("mixed");
  });
  it("classifies symbol-only input as symbol", () => {
    expect(detectScriptClass("🔥")).toBe("symbol");
    expect(detectScriptClass("✅")).toBe("symbol");
    expect(detectScriptClass("!?!")).toBe("symbol");
  });
  it("classifies empty as empty", () => {
    expect(detectScriptClass("")).toBe("empty");
    expect(detectScriptClass("   ")).toBe("empty");
  });
});
