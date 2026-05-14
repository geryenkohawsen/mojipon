import * as wanakana from "wanakana";

function normalizeLongVowels(s: string): string {
  return s
    .replace(/ō/g, "ou")
    .replace(/ū/g, "uu")
    .replace(/ē/g, "ee")
    .replace(/ā/g, "aa")
    .replace(/ī/g, "ii")
    .replace(/Ō/g, "OU")
    .replace(/Ū/g, "UU")
    .replace(/Ē/g, "EE")
    .replace(/Ā/g, "AA")
    .replace(/Ī/g, "II");
}

export function katakanaToHiragana(input: string): string {
  return wanakana.toHiragana(input, { passRomaji: true });
}

export function kanaToRomaji(input: string): string {
  return normalizeLongVowels(wanakana.toRomaji(input)).toLowerCase();
}

export function transliterateMixed(input: string): string {
  return normalizeLongVowels(wanakana.toRomaji(input)).toLowerCase();
}
