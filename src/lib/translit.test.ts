import { describe, expect, it } from "vitest";
import { katakanaToHiragana, kanaToRomaji, transliterateMixed } from "./translit";

describe("katakanaToHiragana", () => {
  it("converts katakana reading to hiragana", () => {
    expect(katakanaToHiragana("ナンデスカ")).toBe("なんですか");
  });
  it("leaves hiragana untouched", () => {
    expect(katakanaToHiragana("ありがとう")).toBe("ありがとう");
  });
});

describe("kanaToRomaji", () => {
  it("romanizes hiragana", () => {
    expect(kanaToRomaji("なんですか")).toBe("nandesuka");
  });
  it("keeps long vowel as ou", () => {
    expect(kanaToRomaji("ありがとう")).toBe("arigatou");
  });
  it("handles sokuon", () => {
    expect(kanaToRomaji("やった")).toBe("yatta");
  });
});

describe("transliterateMixed", () => {
  it("transliterates kana segments and preserves latin", () => {
    expect(transliterateMixed("LGTMです")).toBe("lgtmdesu");
  });
  it("lowercases plain latin", () => {
    expect(transliterateMixed("LGTM")).toBe("lgtm");
  });
});
