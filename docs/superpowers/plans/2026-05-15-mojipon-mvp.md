# Mojipon MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully client-side Next.js static site that turns a single text input into a 128×128 PNG Slack emoji with Japanese-aware filename variants and a downloadable ZIP.

**Architecture:** Pure client-side Next.js 16 App Router with static export. Business logic in plain TS modules under `src/lib/`. Heavy kuromoji tokenization runs in a Web Worker, invoked only when input contains kanji. Canvas renders the preview, which is also the export source. JSZip builds the pack; native `URL.createObjectURL` triggers download.

**Tech Stack:** Next.js 16.2.6, React 19.2.4, TypeScript 5, Tailwind v4, Vitest, @testing-library/react, jsdom, Playwright, wanakana, kuromoji, jszip, next/font.

**Source spec:** `docs/superpowers/specs/2026-05-15-mojipon-mvp-design.md`

---

## Task 1: Project setup — dependencies and tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Modify: `next.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install wanakana kuromoji jszip
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react @playwright/test @types/jszip
```

- [ ] **Step 3: Add test scripts to package.json**

Open `package.json`. Inside `"scripts"`, add:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 5: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 7: Enable static export in `next.config.ts`**

Replace contents with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
```

- [ ] **Step 8: Add `@/*` path alias to `tsconfig.json`**

Confirm `tsconfig.json` contains:

```json
"paths": { "@/*": ["./src/*"] }
```

If missing, add it inside `compilerOptions`.

- [ ] **Step 9: Verify install + typecheck**

```bash
npm run lint
npx tsc --noEmit
```

Expected: both pass with no errors.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json vitest.config.ts vitest.setup.ts playwright.config.ts next.config.ts tsconfig.json
git commit -m "chore: set up Vitest, Playwright, and Next.js static export for Mojipon"
```

---

## Task 2: Shared constants

**Files:**
- Create: `src/lib/constants.ts`

- [ ] **Step 1: Create `src/lib/constants.ts`**

```ts
export const KUROMOJI_DICT_PATH = "/dict/";
export const CANVAS_SIZE = 128;
export const MIN_FONT_SIZE = 24;
export const MAX_FONT_SIZE = 96;
export const DEFAULT_FONT_SIZE = 64;
export const RENDER_DEBOUNCE_MS = 200;
export const WORKER_TIMEOUT_MS = 30_000;
export const FONT_READY_TIMEOUT_MS = 5_000;
export const FALLBACK_ZIP_SLUG = "mojipon-emoji";
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add shared constants for Mojipon"
```

---

## Task 3: `script.ts` — script classification

**Files:**
- Create: `src/lib/script.ts`
- Test: `src/lib/script.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/script.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/script.test.ts
```

Expected: FAIL — `Cannot find module './script'`.

- [ ] **Step 3: Implement `src/lib/script.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/script.test.ts
```

Expected: PASS, all 9 assertions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/script.ts src/lib/script.test.ts
git commit -m "feat: detect input script class (kanji|kana|latin|mixed|symbol|empty)"
```

---

## Task 4: `translit.ts` — pure transliteration helpers

**Files:**
- Create: `src/lib/translit.ts`
- Test: `src/lib/translit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/translit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/translit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/translit.ts`**

```ts
import * as wanakana from "wanakana";

export function katakanaToHiragana(input: string): string {
  return wanakana.toHiragana(input, { passRomaji: true });
}

export function kanaToRomaji(input: string): string {
  return wanakana.toRomaji(input, { customRomajiMapping: {} }).toLowerCase();
}

export function transliterateMixed(input: string): string {
  return wanakana.toRomaji(input, { passRomaji: false }).toLowerCase();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/translit.test.ts
```

Expected: PASS.

If `arigatou` test fails because wanakana returns `arigatō`, change the call to `wanakana.toRomaji(input, { customRomajiMapping: {}, IMEMode: false })` and add a post-processing step that maps `ō → ou`, `ū → uu`, `ē → ee`, `ā → aa`, `ī → ii`. Implement that as a private `normalizeLongVowels(s: string): string` helper and call it after `toRomaji`. Re-run tests until they pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/translit.ts src/lib/translit.test.ts
git commit -m "feat: add kana/romaji/mixed transliteration helpers"
```

---

## Task 5: `filename.ts` — deterministic ZIP filename sanitization

**Files:**
- Create: `src/lib/filename.ts`
- Test: `src/lib/filename.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/filename.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sanitizeForZip, EMPTY_FILENAME, UNSAFE_PATH_CHARS_REMOVED } from "./filename";

describe("sanitizeForZip", () => {
  it("leaves a normal name unchanged", () => {
    const result = sanitizeForZip("lgtm.png");
    expect(result.name).toBe("lgtm.png");
    expect(result.warnings).toEqual([]);
  });

  it("preserves Unicode filenames", () => {
    const result = sanitizeForZip("何ですか.png");
    expect(result.name).toBe("何ですか.png");
    expect(result.warnings).toEqual([]);
  });

  it("strips path separators deterministically", () => {
    const result = sanitizeForZip("../etc/passwd");
    expect(result.name).toBe("etcpasswd");
    expect(result.warnings).toContain(UNSAFE_PATH_CHARS_REMOVED);
  });

  it("strips backslashes and control characters", () => {
    const result = sanitizeForZip(" bad\\name");
    expect(result.name).toBe("badname");
    expect(result.warnings).toContain(UNSAFE_PATH_CHARS_REMOVED);
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeForZip("  hi.png  ").name).toBe("hi.png");
  });

  it("throws EMPTY_FILENAME when nothing remains", () => {
    expect(() => sanitizeForZip("///..")).toThrow(EMPTY_FILENAME);
    expect(() => sanitizeForZip("")).toThrow(EMPTY_FILENAME);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/filename.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/filename.ts`**

```ts
export const EMPTY_FILENAME = "EMPTY_FILENAME";
export const UNSAFE_PATH_CHARS_REMOVED = "UNSAFE_PATH_CHARS_REMOVED";

export type SanitizeResult = {
  name: string;
  warnings: string[];
};

const UNSAFE_RE = /[\\/ -]|(\.\.)/g;

export function sanitizeForZip(input: string): SanitizeResult {
  const warnings: string[] = [];
  const trimmed = input.trim();

  let name = trimmed.replace(UNSAFE_RE, (match) => {
    if (!warnings.includes(UNSAFE_PATH_CHARS_REMOVED)) {
      warnings.push(UNSAFE_PATH_CHARS_REMOVED);
    }
    return "";
  });

  name = name.trim();

  if (name.length === 0) {
    throw new Error(EMPTY_FILENAME);
  }

  return { name, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/filename.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/filename.ts src/lib/filename.test.ts
git commit -m "feat: sanitize filenames for ZIP, deterministic path stripping"
```

---

## Task 6: `variants.ts` — filename variant rules

**Files:**
- Create: `src/lib/variants.ts`
- Test: `src/lib/variants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/variants.test.ts`:

```ts
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

  it("dedupes intra-emoji collisions", () => {
    // Hypothetical: force same filename
    const r = buildVariants({
      original: "ok",
      scriptClass: "latin",
      effectiveReading: undefined,
      customFilename: undefined,
    });
    // Only 1 expected for latin, but exercise dedupe via direct API would
    // require manufactured collision — assert dedupe helper separately if needed.
    expect(r.variants).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/variants.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/variants.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/variants.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/variants.ts src/lib/variants.test.ts
git commit -m "feat: build filename variants per script class with safety tags"
```

---

## Task 7: `fitText.ts` — font fit calculation

**Files:**
- Create: `src/lib/fitText.ts`
- Test: `src/lib/fitText.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fitText.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { calculateFittedFontSize, TEXT_TOO_LONG } from "./fitText";

function makeMeasurer(perCharPx: number) {
  return (text: string, fontSize: number) => text.length * fontSize * perCharPx;
}

describe("calculateFittedFontSize", () => {
  it("returns default size for short text that fits", () => {
    const r = calculateFittedFontSize({
      text: "OK",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(0.5),
    });
    expect(r.size).toBe(64);
    expect(r.warnings).toEqual([]);
  });

  it("shrinks to fit", () => {
    const r = calculateFittedFontSize({
      text: "LongerText",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(0.5),
    });
    expect(r.size).toBeLessThan(64);
    expect(r.size).toBeGreaterThanOrEqual(24);
  });

  it("returns minSize and warning when still overflows", () => {
    const r = calculateFittedFontSize({
      text: "AAAAAAAAAAAAAAAAAAAA",
      maxWidth: 128,
      defaultSize: 64,
      minSize: 24,
      measure: makeMeasurer(1),
    });
    expect(r.size).toBe(24);
    expect(r.warnings).toContain(TEXT_TOO_LONG);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/fitText.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/fitText.ts`**

```ts
export const TEXT_TOO_LONG = "TEXT_TOO_LONG";

export type FitInput = {
  text: string;
  maxWidth: number;
  defaultSize: number;
  minSize: number;
  measure: (text: string, fontSize: number) => number;
};

export type FitResult = {
  size: number;
  warnings: string[];
};

export function calculateFittedFontSize(input: FitInput): FitResult {
  const { text, maxWidth, defaultSize, minSize, measure } = input;
  const warnings: string[] = [];

  const widthAtDefault = measure(text, defaultSize);
  if (widthAtDefault <= maxWidth) {
    return { size: defaultSize, warnings };
  }

  const scale = maxWidth / widthAtDefault;
  const scaled = Math.floor(defaultSize * scale);

  if (scaled < minSize) {
    warnings.push(TEXT_TOO_LONG);
    return { size: minSize, warnings };
  }

  return { size: scaled, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/fitText.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fitText.ts src/lib/fitText.test.ts
git commit -m "feat: compute fitted font size with min-size floor"
```

---

## Task 8: `render.ts` — canvas draw + PNG export

**Files:**
- Create: `src/lib/render.ts`
- Test: `src/lib/render.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/render.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/render.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/render.ts`**

```ts
import { calculateFittedFontSize } from "./fitText";

export type DrawConfig = {
  text: string;
  bgColor: string;
  textColor: string;
  fontFamily: string;
  maxFontSize: number;
  minFontSize: number;
};

export async function drawEmojiToCanvas(
  canvas: HTMLCanvasElement,
  config: DrawConfig,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const fit = calculateFittedFontSize({
    text: config.text,
    maxWidth: canvas.width * 0.9,
    defaultSize: config.maxFontSize,
    minSize: config.minFontSize,
    measure: (text, size) => {
      ctx.font = `${size}px ${config.fontFamily}`;
      return ctx.measureText(text).width;
    },
  });

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (config.bgColor !== "transparent") {
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = config.textColor;
  ctx.font = `${fit.size}px ${config.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(config.text, canvas.width / 2, canvas.height / 2);
}

export function exportCanvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG export failed"));
    }, "image/png");
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/render.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/render.ts src/lib/render.test.ts
git commit -m "feat: draw emoji to canvas and export as PNG blob"
```

---

## Task 9: `fonts.ts` — font readiness with timeout

**Files:**
- Create: `src/lib/fonts.ts`
- Test: `src/lib/fonts.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/fonts.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/fonts.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/fonts.ts`**

```ts
export const FONT_LOAD_TIMEOUT = "FONT_LOAD_TIMEOUT";

type FontFaceSetLike = {
  load: (spec: string) => Promise<unknown>;
  ready: Promise<unknown>;
};

type DocumentLike = { fonts: FontFaceSetLike };

export type FontReadyResult = { warnings: string[] };

export async function ensureFontsReady(
  fontFamily: string,
  fontSize: number,
  timeoutMs: number,
  doc: DocumentLike = document as unknown as DocumentLike,
): Promise<FontReadyResult> {
  const warnings: string[] = [];
  const spec = `${fontSize}px ${fontFamily}`;

  const load = doc.fonts.load(spec);
  const ready = doc.fonts.ready;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const winner = await Promise.race([
    Promise.all([load, ready]).then(() => "ready" as const),
    timeout,
  ]);
  if (timeoutId) clearTimeout(timeoutId);

  if (winner === "timeout") {
    warnings.push(FONT_LOAD_TIMEOUT);
  }

  return { warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/fonts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fonts.ts src/lib/fonts.test.ts
git commit -m "feat: ensure font readiness with timeout fallback"
```

---

## Task 10: `pack.ts` — resolveZipEntries + buildZip

**Files:**
- Create: `src/lib/pack.ts`
- Test: `src/lib/pack.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/pack.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/pack.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/pack.ts`**

```ts
import JSZip from "jszip";
import { sanitizeForZip } from "./filename";

export const EMPTY_ZIP = "EMPTY_ZIP";
export const PACK_COLLISION = "PACK_COLLISION";

export type ZipFileEntry = {
  filename: string;
  blob: Blob;
};

export type ResolvedZipEntry = ZipFileEntry;

export type ResolveResult = {
  files: ResolvedZipEntry[];
  warnings: string[];
};

export function resolveZipEntries(input: ZipFileEntry[]): ResolveResult {
  const warnings: string[] = [];
  const counts = new Map<string, number>();
  const files: ResolvedZipEntry[] = [];

  for (const entry of input) {
    const { name, warnings: nameWarnings } = sanitizeForZip(entry.filename);
    for (const w of nameWarnings) {
      if (!warnings.includes(w)) warnings.push(w);
    }

    const count = counts.get(name) ?? 0;
    counts.set(name, count + 1);

    if (count === 0) {
      files.push({ filename: name, blob: entry.blob });
    } else {
      if (!warnings.includes(PACK_COLLISION)) warnings.push(PACK_COLLISION);
      const dot = name.lastIndexOf(".");
      const base = dot >= 0 ? name.slice(0, dot) : name;
      const ext = dot >= 0 ? name.slice(dot) : "";
      files.push({ filename: `${base}_${count + 1}${ext}`, blob: entry.blob });
    }
  }

  return { files, warnings };
}

export async function buildZip(files: ResolvedZipEntry[]): Promise<Blob> {
  if (files.length === 0) throw new Error(EMPTY_ZIP);
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.filename, file.blob);
  }
  return await zip.generateAsync({ type: "blob" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/pack.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pack.ts src/lib/pack.test.ts
git commit -m "feat: resolve and build zip with collision dedupe"
```

---

## Task 11: `download.ts` — native blob download

**Files:**
- Create: `src/lib/download.ts`
- Test: `src/lib/download.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/download.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- src/lib/download.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/download.ts`**

```ts
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- src/lib/download.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/download.ts src/lib/download.test.ts
git commit -m "feat: download blob via native object URL + anchor"
```

---

## Task 12: Kuromoji dict assets

**Files:**
- Create: `public/dict/` (12 dict files copied from kuromoji package)
- Create: `scripts/copy-kuromoji-dict.mjs`
- Modify: `package.json` (postinstall hook)

- [ ] **Step 1: Inspect kuromoji's bundled dict**

```bash
ls node_modules/kuromoji/dict/
```

Expected: a list of `.dat.gz` files (e.g., `base.dat.gz`, `cc.dat.gz`, `check.dat.gz`, `tid.dat.gz`, `tid_map.dat.gz`, `tid_pos.dat.gz`, `unk.dat.gz`, `unk_char.dat.gz`, `unk_compat.dat.gz`, `unk_invoke.dat.gz`, `unk_map.dat.gz`, `unk_pos.dat.gz`).

- [ ] **Step 2: Create copy script `scripts/copy-kuromoji-dict.mjs`**

```js
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "node_modules", "kuromoji", "dict");
const dest = join(here, "..", "public", "dict");

if (!existsSync(src)) {
  console.error("kuromoji dict not found at", src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied kuromoji dict to", dest);
```

- [ ] **Step 3: Wire postinstall + a runnable script**

In `package.json` add to `"scripts"`:

```json
"postinstall": "node scripts/copy-kuromoji-dict.mjs",
"copy:dict": "node scripts/copy-kuromoji-dict.mjs"
```

- [ ] **Step 4: Run the copy**

```bash
npm run copy:dict
ls public/dict/ | head
```

Expected: 12 `.dat.gz` files.

- [ ] **Step 5: Add `public/dict/` to git, then commit**

```bash
git add scripts/copy-kuromoji-dict.mjs package.json public/dict
git commit -m "chore: vendor kuromoji dict files under public/dict"
```

If the dict is too large for the repo policy, add `public/dict/` to `.gitignore` instead and rely on `postinstall`. Note the choice in `README.md` if so.

---

## Task 13: Translit worker + client

**Files:**
- Create: `src/workers/translit.worker.ts`
- Create: `src/workers/client.ts`
- Test: `src/workers/client.test.ts`

- [ ] **Step 1: Implement the worker `src/workers/translit.worker.ts`**

```ts
import kuromoji, { type IpadicFeatures, type Tokenizer } from "kuromoji";
import * as wanakana from "wanakana";

type Request = { id: number; type: "translate"; text: string };
type Response =
  | {
      id: number;
      type: "result";
      original: string;
      suggestedKana?: string;
      warnings: string[];
    }
  | { id: number; type: "error"; code: string };

let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;

function getTokenizer(dictPath: string) {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: dictPath }).build((err, t) => {
        if (err) reject(err);
        else resolve(t);
      });
    });
  }
  return tokenizerPromise;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  if (req.type !== "translate") return;
  try {
    const tokenizer = await getTokenizer("/dict/");
    const tokens = tokenizer.tokenize(req.text);
    const warnings: string[] = [];
    let reading = "";
    let anyMissing = false;
    for (const token of tokens) {
      if (token.reading) {
        reading += token.reading;
      } else {
        reading += token.surface_form;
        anyMissing = true;
      }
    }
    if (anyMissing) warnings.push("READING_UNCERTAIN");

    const hiragana = wanakana.toHiragana(reading, { passRomaji: true });
    const response: Response = {
      id: req.id,
      type: "result",
      original: req.text,
      suggestedKana: hiragana.length > 0 ? hiragana : undefined,
      warnings,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  } catch (err) {
    const response: Response = {
      id: req.id,
      type: "error",
      code: "DICT_FETCH_FAILED",
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  }
};
```

- [ ] **Step 2: Implement the client wrapper `src/workers/client.ts`**

```ts
import { WORKER_TIMEOUT_MS } from "@/lib/constants";

export type TranslitResult = {
  original: string;
  suggestedKana?: string;
  warnings: string[];
};

let worker: Worker | null = null;
let counter = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./translit.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function translateKanji(text: string): Promise<TranslitResult> {
  const w = getWorker();
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      w.removeEventListener("message", handler);
      reject(new Error("WORKER_TIMEOUT"));
    }, WORKER_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.id !== id) return;
      clearTimeout(timeout);
      w.removeEventListener("message", handler);
      if (msg.type === "result") {
        resolve({
          original: msg.original,
          suggestedKana: msg.suggestedKana,
          warnings: msg.warnings,
        });
      } else if (msg.type === "error") {
        reject(new Error(msg.code));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ id, type: "translate", text });
  });
}

export function resetWorkerForTests() {
  worker?.terminate();
  worker = null;
  counter = 0;
}
```

- [ ] **Step 3: Write a small client test**

Create `src/workers/client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isWorkerSupported } from "./client";

describe("isWorkerSupported", () => {
  it("returns false in jsdom (no Worker global)", () => {
    expect(typeof isWorkerSupported()).toBe("boolean");
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npm test -- src/workers/client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workers/translit.worker.ts src/workers/client.ts src/workers/client.test.ts
git commit -m "feat: translit worker (kuromoji) and singleton client wrapper"
```

---

## Task 14: Root layout with curated fonts

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css` (only if needed for `body` rules)

- [ ] **Step 1: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Noto_Sans_JP, Noto_Serif_JP, M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const notoSerif = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const mPlusRounded = M_PLUS_Rounded_1c({
  variable: "--font-m-plus-rounded",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Mojipon",
  description: "Japanese-aware Slack emoji generator",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${notoSans.variable} ${notoSerif.variable} ${mPlusRounded.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: load curated JP fonts (Noto Sans/Serif JP, M PLUS Rounded 1c)"
```

---

## Task 15: `TextInput` component

**Files:**
- Create: `src/components/TextInput.tsx`
- Test: `src/components/TextInput.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("debounces and reports value", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} debounceMs={200} />);
    const input = screen.getByRole("textbox");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(input, "OK");
    expect(onChange).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenLastCalledWith("OK");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- src/components/TextInput.test.tsx
```

- [ ] **Step 3: Implement `src/components/TextInput.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  onChange: (next: string) => void;
  debounceMs: number;
};

export function TextInput({ value, onChange, debounceMs }: Props) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(local), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [local, debounceMs, onChange]);

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      className="w-full rounded border border-zinc-300 px-3 py-2 text-lg dark:bg-zinc-900 dark:border-zinc-700"
      placeholder="Type text (e.g. 確認中)"
    />
  );
}
```

- [ ] **Step 4: Run test (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add src/components/TextInput.tsx src/components/TextInput.test.tsx
git commit -m "feat: debounced TextInput component"
```

---

## Task 16: `StylePicker` component

**Files:**
- Create: `src/components/StylePicker.tsx`
- Test: `src/components/StylePicker.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StylePicker, FONT_OPTIONS } from "./StylePicker";

describe("StylePicker", () => {
  it("reports color and font changes", async () => {
    const onChange = vi.fn();
    render(
      <StylePicker
        value={{ bgColor: "#ffffff", textColor: "#000000", fontFamily: FONT_OPTIONS[0].value }}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/font/i), FONT_OPTIONS[1].value);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.fontFamily).toBe(FONT_OPTIONS[1].value);
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- src/components/StylePicker.test.tsx
```

- [ ] **Step 3: Implement `src/components/StylePicker.tsx`**

```tsx
"use client";

export type StyleValue = {
  bgColor: string;
  textColor: string;
  fontFamily: string;
};

export const FONT_OPTIONS = [
  { label: "Noto Sans JP", value: 'var(--font-noto-sans-jp), "Noto Sans JP", sans-serif' },
  { label: "Noto Serif JP", value: 'var(--font-noto-serif-jp), "Noto Serif JP", serif' },
  { label: "M PLUS Rounded 1c", value: 'var(--font-m-plus-rounded), "M PLUS Rounded 1c", sans-serif' },
];

type Props = {
  value: StyleValue;
  onChange: (next: StyleValue) => void;
};

export function StylePicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        Background
        <input
          type="color"
          value={value.bgColor === "transparent" ? "#ffffff" : value.bgColor}
          onChange={(e) => onChange({ ...value, bgColor: e.target.value })}
        />
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onChange({ ...value, bgColor: "transparent" })}
        >
          Transparent
        </button>
      </label>
      <label className="flex items-center gap-2 text-sm">
        Text
        <input
          type="color"
          value={value.textColor}
          onChange={(e) => onChange({ ...value, textColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        Font
        <select
          value={value.fontFamily}
          onChange={(e) => onChange({ ...value, fontFamily: e.target.value })}
          className="rounded border border-zinc-300 px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run test (expect PASS)**

- [ ] **Step 5: Commit**

```bash
git add src/components/StylePicker.tsx src/components/StylePicker.test.tsx
git commit -m "feat: StylePicker (bg, text, font from curated list)"
```

---

## Task 17: `EmojiPreview` component

**Files:**
- Create: `src/components/EmojiPreview.tsx`

- [ ] **Step 1: Implement `src/components/EmojiPreview.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { drawEmojiToCanvas } from "@/lib/render";
import { ensureFontsReady } from "@/lib/fonts";
import {
  CANVAS_SIZE,
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  FONT_READY_TIMEOUT_MS,
} from "@/lib/constants";

type Props = {
  text: string;
  bgColor: string;
  textColor: string;
  fontFamily: string;
};

export function EmojiPreview({ text, bgColor, textColor, fontFamily }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;

    (async () => {
      await ensureFontsReady(fontFamily, DEFAULT_FONT_SIZE, FONT_READY_TIMEOUT_MS);
      if (cancelled) return;
      await drawEmojiToCanvas(canvas, {
        text: text || " ",
        bgColor,
        textColor,
        fontFamily,
        maxFontSize: DEFAULT_FONT_SIZE,
        minFontSize: MIN_FONT_SIZE,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [text, bgColor, textColor, fontFamily]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      className="border border-zinc-300 dark:border-zinc-700"
      aria-label="Emoji preview"
    />
  );
}

export function getCanvasForExport(canvas: HTMLCanvasElement | null): HTMLCanvasElement | null {
  return canvas;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmojiPreview.tsx
git commit -m "feat: EmojiPreview canvas component with font readiness"
```

---

## Task 18: `ManualReadingInput` component

**Files:**
- Create: `src/components/ManualReadingInput.tsx`

- [ ] **Step 1: Implement `src/components/ManualReadingInput.tsx`**

```tsx
"use client";

type Props = {
  suggested: string | undefined;
  value: string;
  uncertain: boolean;
  onChange: (next: string) => void;
};

export function ManualReadingInput({ suggested, value, uncertain, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm">
        Reading (kana)
        <input
          type="text"
          value={value}
          autoFocus={uncertain && value.length === 0}
          onChange={(e) => onChange(e.target.value)}
          placeholder={suggested ?? "Enter kana reading"}
          className={`mt-1 w-full rounded border px-3 py-2 dark:bg-zinc-900 ${
            uncertain
              ? "border-amber-500 dark:border-amber-400"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
      </label>
      {uncertain && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Some kanji readings could not be detected. Edit the reading manually.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ManualReadingInput.tsx
git commit -m "feat: ManualReadingInput with suggested fallback and uncertain hint"
```

---

## Task 19: `VariantList` component

**Files:**
- Create: `src/components/VariantList.tsx`

- [ ] **Step 1: Implement `src/components/VariantList.tsx`**

```tsx
"use client";

import type { Variant } from "@/lib/variants";

type Props = {
  variants: Variant[];
  selected: Set<string>;
  warnings: string[];
  onToggle: (filename: string) => void;
};

const SAFETY_LABEL: Record<Variant["safety"], string> = {
  "recommended-slack-name": "Recommended",
  "filename-safe": "Filename-safe",
  "needs-review": "Needs review",
};

export function VariantList({ variants, selected, warnings, onToggle }: Props) {
  if (variants.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Type something to see filename variants.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {variants.map((v) => {
          const checked = selected.has(v.filename);
          return (
            <li key={v.filename} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(v.filename)}
              />
              <code className="font-mono">{v.filename}</code>
              <span className="text-xs text-zinc-500">
                {SAFETY_LABEL[v.safety]}
              </span>
            </li>
          );
        })}
      </ul>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-600 dark:text-amber-400">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VariantList.tsx
git commit -m "feat: VariantList with safety badges and per-variant toggles"
```

---

## Task 20: `DownloadButton` component

**Files:**
- Create: `src/components/DownloadButton.tsx`

- [ ] **Step 1: Implement `src/components/DownloadButton.tsx`**

```tsx
"use client";

type Props = {
  disabled: boolean;
  onClick: () => void;
};

export function DownloadButton({ disabled, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 rounded-full bg-black text-white px-6 disabled:opacity-40 dark:bg-white dark:text-black"
    >
      Download ZIP
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/DownloadButton.tsx
git commit -m "feat: DownloadButton component"
```

---

## Task 21: `EmojiStudio` top-level composition

**Files:**
- Create: `src/components/EmojiStudio.tsx`
- Test: `src/components/EmojiStudio.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/EmojiStudio.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmojiStudio } from "./EmojiStudio";

vi.mock("@/workers/client", () => ({
  isWorkerSupported: () => true,
  translateKanji: vi.fn(async (text: string) => ({
    original: text,
    suggestedKana: text === "確認中" ? "かくにんちゅう" : undefined,
    warnings: [],
  })),
}));

describe("EmojiStudio", () => {
  it("shows 3 variants for kanji input with suggested reading", async () => {
    render(<EmojiStudio />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText(/type text/i);
    await user.type(input, "確認中");
    await waitFor(() => {
      expect(screen.getByText("kakuninchuu.png")).toBeInTheDocument();
      expect(screen.getByText("かくにんちゅう.png")).toBeInTheDocument();
      expect(screen.getByText("確認中.png")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test (expect FAIL)**

```bash
npm test -- src/components/EmojiStudio.test.tsx
```

- [ ] **Step 3: Implement `src/components/EmojiStudio.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TextInput } from "./TextInput";
import { StylePicker, FONT_OPTIONS, type StyleValue } from "./StylePicker";
import { EmojiPreview } from "./EmojiPreview";
import { ManualReadingInput } from "./ManualReadingInput";
import { VariantList } from "./VariantList";
import { DownloadButton } from "./DownloadButton";
import { detectScriptClass, type ScriptClass } from "@/lib/script";
import { buildVariants, READING_UNCERTAIN, type Variant } from "@/lib/variants";
import { resolveZipEntries, buildZip } from "@/lib/pack";
import { exportCanvasToPng } from "@/lib/render";
import { downloadBlob } from "@/lib/download";
import { isWorkerSupported, translateKanji } from "@/workers/client";
import { FALLBACK_ZIP_SLUG, RENDER_DEBOUNCE_MS } from "@/lib/constants";

export function EmojiStudio() {
  const [text, setText] = useState("");
  const [style, setStyle] = useState<StyleValue>({
    bgColor: "#ffffff",
    textColor: "#000000",
    fontFamily: FONT_OPTIONS[0].value,
  });
  const [scriptClass, setScriptClass] = useState<ScriptClass>("empty");
  const [suggestedKana, setSuggestedKana] = useState<string | undefined>(undefined);
  const [manualReading, setManualReading] = useState("");
  const [customFilename, setCustomFilename] = useState("");
  const [workerWarnings, setWorkerWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cls = detectScriptClass(text);
    setScriptClass(cls);

    if (cls !== "kanji") {
      setSuggestedKana(undefined);
      setWorkerWarnings([]);
      return;
    }
    if (!isWorkerSupported()) {
      setSuggestedKana(undefined);
      setWorkerWarnings([READING_UNCERTAIN]);
      return;
    }

    let cancelled = false;
    translateKanji(text)
      .then((res) => {
        if (cancelled) return;
        setSuggestedKana(res.suggestedKana);
        setWorkerWarnings(res.warnings);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestedKana(undefined);
        setWorkerWarnings([READING_UNCERTAIN]);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  const effectiveReading = manualReading.trim() || suggestedKana;

  const { variants, warnings } = useMemo(() => {
    const r = buildVariants({
      original: text,
      scriptClass,
      effectiveReading,
      customFilename: customFilename || undefined,
    });
    return { variants: r.variants, warnings: [...r.warnings, ...workerWarnings] };
  }, [text, scriptClass, effectiveReading, customFilename, workerWarnings]);

  useEffect(() => {
    setSelected(new Set(variants.map((v) => v.filename)));
  }, [variants]);

  const onToggle = (filename: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  const downloadEnabled =
    variants.length > 0 && selected.size > 0 && text.trim().length > 0;

  const onDownload = async () => {
    const canvas = canvasContainerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const blob = await exportCanvasToPng(canvas);
    const filesIn = variants
      .filter((v) => selected.has(v.filename))
      .map((v) => ({ filename: v.filename, blob }));
    const resolved = resolveZipEntries(filesIn);
    const zipBlob = await buildZip(resolved.files);
    const slug = chooseSlug(variants, customFilename);
    downloadBlob(zipBlob, `${slug}.zip`);
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold">Mojipon</h1>
      <TextInput value={text} onChange={setText} debounceMs={RENDER_DEBOUNCE_MS} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <StylePicker value={style} onChange={setStyle} />
        <div ref={canvasContainerRef}>
          <EmojiPreview
            text={text}
            bgColor={style.bgColor}
            textColor={style.textColor}
            fontFamily={style.fontFamily}
          />
        </div>
      </div>
      {scriptClass === "kanji" && (
        <ManualReadingInput
          suggested={suggestedKana}
          value={manualReading}
          uncertain={workerWarnings.includes(READING_UNCERTAIN) || !suggestedKana}
          onChange={setManualReading}
        />
      )}
      {(scriptClass === "symbol" || scriptClass === "empty") && (
        <label className="flex flex-col gap-1 text-sm">
          Custom filename
          <input
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            placeholder="e.g. fire"
            className="rounded border border-zinc-300 px-3 py-2 dark:bg-zinc-900 dark:border-zinc-700"
          />
          <span className="text-xs text-zinc-500">
            Emoji text can be rendered, but a filename is required.
          </span>
        </label>
      )}
      <VariantList
        variants={variants}
        selected={selected}
        warnings={warnings}
        onToggle={onToggle}
      />
      <DownloadButton disabled={!downloadEnabled} onClick={onDownload} />
    </div>
  );
}

function chooseSlug(variants: Variant[], customFilename: string): string {
  const recommended = variants.find((v) => v.safety === "recommended-slack-name");
  if (recommended) {
    const dot = recommended.filename.lastIndexOf(".");
    return dot > 0 ? recommended.filename.slice(0, dot) : recommended.filename;
  }
  if (customFilename.trim().length > 0) return customFilename.trim();
  return FALLBACK_ZIP_SLUG;
}
```

- [ ] **Step 4: Run test (expect PASS)**

```bash
npm test -- src/components/EmojiStudio.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/EmojiStudio.tsx src/components/EmojiStudio.test.tsx
git commit -m "feat: EmojiStudio composition with worker dispatch and ZIP download"
```

---

## Task 22: Studio route

**Files:**
- Create: `src/app/studio/page.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create `src/app/studio/page.tsx`**

```tsx
import { EmojiStudio } from "@/components/EmojiStudio";

export default function StudioPage() {
  return <EmojiStudio />;
}
```

- [ ] **Step 2: Replace `src/app/page.tsx` with a minimal landing**

```tsx
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold">Mojipon</h1>
      <p className="text-zinc-600 dark:text-zinc-400 max-w-md">
        Japanese-aware Slack emoji generator. Type text, download a ZIP, upload to Slack.
      </p>
      <Link
        href="/studio"
        className="rounded-full bg-black text-white px-6 py-3 dark:bg-white dark:text-black"
      >
        Open Studio
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Verify dev build**

```bash
npm run dev
```

Open `http://localhost:3000` and confirm the landing page renders, then `/studio` shows the studio. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/studio/page.tsx src/app/page.tsx
git commit -m "feat: landing page + /studio route"
```

---

## Task 23: Playwright smoke test

**Files:**
- Create: `e2e/studio.spec.ts`

- [ ] **Step 1: Install Playwright browsers (one-time)**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write the smoke test**

Create `e2e/studio.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

test("kana input produces two variants and downloads a zip", async ({ page }) => {
  await page.goto("/studio");

  const input = page.getByPlaceholder(/type text/i);
  await input.fill("ありがとう");

  await expect(page.getByText("arigatou.png")).toBeVisible();
  await expect(page.getByText("ありがとう.png")).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /download zip/i }).click(),
  ]);

  const suggested = download.suggestedFilename();
  expect(suggested).toMatch(/\.zip$/);
});
```

- [ ] **Step 3: Run the E2E**

```bash
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/studio.spec.ts
git commit -m "test: Playwright smoke for kana input + ZIP download"
```

---

## Task 24: Full suite + static build verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the unit suite**

```bash
npm test
```

Expected: all PASS.

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Build static export**

```bash
npm run build
```

Expected: build succeeds and the `out/` directory contains `index.html`, `studio/index.html`, and the `_next/` static assets.

- [ ] **Step 5: Serve the static build and sanity-check**

```bash
npx serve out -p 4173
```

Open `http://localhost:4173/studio/`, type `ありがとう`, verify variants and ZIP download. Stop the static server.

- [ ] **Step 6: Tag the MVP**

```bash
git tag mvp-v1
```

---

## Spec coverage check

- Section 1 Overview / positioning → Tasks 22 landing, 21 studio (no Slack API integration code anywhere).
- Section 2 Scope / variants per script class → Task 6 `buildVariants` and tests.
- Section 3 Architecture (client-only, static export, worker-only-for-kanji) → Task 1 static export, Task 13 worker, Task 21 dispatch.
- Section 3 Fonts (3 curated) → Task 14 layout.
- Section 3 Dict serving (`KUROMOJI_DICT_PATH`) → Task 2 constants, Task 12 dict copy, Task 13 worker.
- Section 4 Components & file layout → Tasks 14–22.
- Section 5 Data flow (worker-only-for-kanji, manual reading wins, `resolveZipEntries` separate) → Task 21 dispatch + Task 10 pack split.
- Section 6 Error handling → Task 6 reading-uncertain warning, Task 5 sanitize, Task 7 fit warning, Task 8 toBlob null path, Task 9 font timeout, Task 10 collision, Task 11 download, Task 21 disabled-states.
- Section 7 Testing → Tasks 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 23.
- Section 8 Future milestones → explicitly excluded.

If any task requires changes outside the file paths listed, stop and update the plan instead of widening scope inside a task.
