export type ScriptClass = "kanji" | "kana" | "latin" | "mixed" | "symbol" | "empty";

const KANJI_RE = /\p{Script=Han}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
const LATIN_RE = /\p{Script=Latin}/u;

export function detectScriptClass(text: string): ScriptClass {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "empty";

  const hasKanji = KANJI_RE.test(trimmed);
  if (hasKanji) return "kanji";

  const hasKana = KANA_RE.test(trimmed);
  const hasLatin = LATIN_RE.test(trimmed);

  if (hasKana && hasLatin) return "mixed";
  if (hasKana) return "kana";
  if (hasLatin) return "latin";

  return "symbol";
}
