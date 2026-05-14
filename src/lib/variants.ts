import { kanaToRomaji, transliterateMixed } from "./translit";
import type { ScriptClass } from "./script";

export const READING_UNCERTAIN = "READING_UNCERTAIN";

export type VariantSafety =
  | "recommended-slack-name"
  | "filename-safe"
  | "needs-review";

export type Variant = {
  filename: string;
  label: string;
  safety: VariantSafety;
};

export type BuildVariantsInput = {
  original: string;
  scriptClass: ScriptClass;
  effectiveReading: string | undefined;
  customFilename: string | undefined;
};

export type BuildVariantsResult = {
  variants: Variant[];
  warnings: string[];
};

export function buildVariants(input: BuildVariantsInput): BuildVariantsResult {
  const { original, scriptClass, effectiveReading, customFilename } = input;
  const warnings: string[] = [];
  let variants: Variant[] = [];

  switch (scriptClass) {
    case "kanji": {
      if (!effectiveReading) {
        warnings.push(READING_UNCERTAIN);
        variants = [
          {
            filename: `${original}.png`,
            label: original,
            safety: "filename-safe",
          },
        ];
      } else {
        const romaji = kanaToRomaji(effectiveReading);
        variants = [
          { filename: `${romaji}.png`, label: romaji, safety: "recommended-slack-name" },
          { filename: `${effectiveReading}.png`, label: effectiveReading, safety: "filename-safe" },
          { filename: `${original}.png`, label: original, safety: "filename-safe" },
        ];
      }
      break;
    }
    case "kana": {
      const reading = effectiveReading ?? original;
      const romaji = kanaToRomaji(reading);
      variants = [
        { filename: `${romaji}.png`, label: romaji, safety: "recommended-slack-name" },
        { filename: `${original}.png`, label: original, safety: "filename-safe" },
      ];
      break;
    }
    case "latin": {
      const lowered = original.toLowerCase();
      variants = [
        { filename: `${lowered}.png`, label: lowered, safety: "recommended-slack-name" },
      ];
      break;
    }
    case "mixed": {
      const romaji = transliterateMixed(original);
      variants = [
        { filename: `${romaji}.png`, label: romaji, safety: "recommended-slack-name" },
        { filename: `${original}.png`, label: original, safety: "filename-safe" },
      ];
      break;
    }
    case "symbol": {
      if (customFilename && customFilename.trim().length > 0) {
        variants = [
          {
            filename: `${customFilename.trim()}.png`,
            label: customFilename.trim(),
            safety: "needs-review",
          },
        ];
      }
      break;
    }
    case "empty":
      variants = [];
      break;
  }

  variants = dedupeFilenames(variants);
  return { variants, warnings };
}

function dedupeFilenames(variants: Variant[]): Variant[] {
  const seen = new Map<string, number>();
  return variants.map((v) => {
    const count = seen.get(v.filename) ?? 0;
    seen.set(v.filename, count + 1);
    if (count === 0) return v;
    const dot = v.filename.lastIndexOf(".");
    const base = dot >= 0 ? v.filename.slice(0, dot) : v.filename;
    const ext = dot >= 0 ? v.filename.slice(dot) : "";
    return { ...v, filename: `${base}_${count + 1}${ext}` };
  });
}
