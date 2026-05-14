# Mojipon MVP — Design Spec

Date: 2026-05-15
Status: Approved (sections 1–5 locked)

## 1. Overview

Mojipon is a Japanese-aware Slack emoji generator. The MVP turns a single text input into a 128×128 PNG emoji and packages it inside a downloadable ZIP whose filenames vary based on the input's script (kanji, kana, latin, mixed). The product's core value is generating useful filename variants per input — not generating multiple emoji.

The MVP is fully stateless, fully client-side, and deploys as a static site.

## 2. Scope

### In MVP

- Single text input → single rendered PNG.
- Color + font picker (background color, text color, font from a curated list).
- Filename variants per script class:
  - kanji: `romaji.png` + `kana.png` + `original.png`
  - kana: `romaji.png` + `original.png`
  - latin: `romaji.png` only
  - mixed (any kanji present): treated as kanji-class
  - mixed (latin + kana, no kanji): two variants (romaji + original)
- Manual reading override for kanji input.
- ZIP download containing the same PNG written under each selected filename.

### Out of MVP (future)

- Image upload as input.
- Multi-emoji packs (batch input mode, persistent pack tray).
- Animation (GIF/APNG).
- Slack-direct upload via `emoji.admin.add`.
- Creator marketplace.
- Accounts, cloud history, persistence.

## 3. Architecture

- Next.js 16 App Router, fully client-side. Static export (`output: 'export'` in `next.config.ts`). No API routes, no Node runtime in production.
- Business logic lives in plain TypeScript modules under `src/lib/`. Only interactive UI components use the `'use client'` directive.
- Heavy work (kuromoji tokenization + dictionary load) runs in a Web Worker. Main thread stays responsive.
- React local state only (`useState`). No global store, no DB, no cookies, no localStorage.

### Libraries

| Library | Purpose | Size note |
|---|---|---|
| `wanakana` | Kana ↔ romaji, script detection (`isKanji`, `isKana`, `isRomaji`) | ~30 KB |
| `kuromoji` | Kanji → reading (Japanese morphological analyzer) | ~100 KB JS + ~17 MB dict, lazy-loaded |
| `jszip` | Build pack zip in browser | ~100 KB |
| `next/font/google` | Self-host Noto Sans JP | Static asset |

### Rendering

- HTML5 `<canvas>` at 128×128.
- `toBlob('image/png')` for export.
- Font readiness guaranteed via `document.fonts.load(...)` + `document.fonts.ready` before draw.
- Font family is injected from the component into render functions; never hard-coded inside `lib/render.ts`.

### Dictionary serving

- Kuromoji dict files live in `public/dict/` and are served from `/dict/` (root path).
- Fetched only when the input contains kanji, only on first kanji input per session.

## 4. Components & file layout

```
src/
  app/
    layout.tsx              # root layout, loads Noto Sans JP via next/font
    page.tsx                # landing / redirect or marketing shell
    studio/
      page.tsx              # server component shell, imports <EmojiStudio />
  components/
    EmojiStudio.tsx         # 'use client' — top-level studio
    TextInput.tsx           # 'use client' — debounced text field
    StylePicker.tsx         # 'use client' — bg color, text color, font
    EmojiPreview.tsx        # 'use client' — canvas + draw effect
    VariantList.tsx         # 'use client' — planned filenames + include/exclude
    ManualReadingInput.tsx  # 'use client' — kana override field
    DownloadButton.tsx      # 'use client' — triggers zip + save
  lib/
    script.ts               # detectScriptClass(text) → 'kanji'|'kana'|'latin'|'mixed'
    translit.ts             # pure functions: kanaToRomaji, katakanaToHiragana, etc.
    variants.ts             # buildVariants({original, scriptClass, kana, romaji}) → Variant[]
    filename.ts             # sanitizeForZip(name) → safe filename or throws
    render.ts               # drawEmojiToCanvas + exportCanvasToPng
    fitText.ts              # calculateFittedFontSize (pure)
    fonts.ts                # ensureFontsReady(fontFamily, size)
    pack.ts                 # buildZip(files: ZipFileEntry[]) → Promise<Blob>
  workers/
    translit.worker.ts      # kuromoji + wanakana glue, postMessage shim
    client.ts               # Promise wrapper around postMessage
public/
  dict/                     # kuromoji dict files
```

### Component responsibilities

- **`studio/page.tsx`** is a server component shell. It renders `<EmojiStudio />` and nothing else.
- **`EmojiStudio`** owns the state: `text`, `style`, `suggestedKana`, `manualReading`, `variants`, `selectedVariants`. It composes the other components.
- **`TextInput`** debounces and reports the current text.
- **`StylePicker`** exposes bg color, text color, font family.
- **`EmojiPreview`** receives `text`, `style`, `fontFamily`, draws into canvas via `drawEmojiToCanvas` after `ensureFontsReady`.
- **`VariantList`** displays computed variants with safety badges and include/exclude checkboxes.
- **`ManualReadingInput`** appears when kanji is present and worker reading is uncertain or absent.
- **`DownloadButton`** is enabled only when at least one variant is selected and input is non-empty.

### Worker boundary

- `translit.worker.ts` is a thin shim that:
  - Lazy-loads kuromoji dict from `/dict/` on first kanji input.
  - Tokenizes input.
  - Returns `{ original, kana?, romaji?, scriptClass, warnings }`.
- `client.ts` wraps `worker.postMessage` in a Promise with timeout and error handling.
- Worker instantiation: `new Worker(new URL("./translit.worker.ts", import.meta.url), { type: "module" })`.

## 5. Data flow

```
[TextInput] --debounced text--> [EmojiStudio state]
  |
  v
[detectScriptClass(text)]
  |
  | latin only  → skip worker
  | kana / kanji / mixed → call worker
  v
[translitClient.translate(text)]
  |
  v
[translit.worker.ts]
  - detect script class
  - if kanji exists:
      lazy-load kuromoji dict from /dict/
      tokenize
      build suggested reading from token.reading
      fallback to token.surface_form when reading is missing
      push warning READING_UNCERTAIN if any fallback used
  - if kana-only:
      skip kuromoji
      normalize kana to hiragana
  - if latin-only:
      skip kuromoji
      return normalized latin
  - return { original, kana, romaji, scriptClass, warnings }
  |
  v
[EmojiStudio state]
  - store suggestedKana
  - expose manualReading field when useful
  - effectiveReading = manualReading || suggestedKana
  |
  v
[buildVariants({ original, scriptClass, kana: effectiveReading, romaji })]
  - kanji  → romaji + kana + original
  - kana   → romaji + original
  - latin  → lowercased latin only (Slack API requires lower-case)
  - mixed (latin + kana, no kanji) → romaji (kana segments transliterated, latin segments preserved then lowercased) + original
  - each variant tagged with VariantSafety:
      "slack-api-safe" | "filename-safe" | "needs-review"
  |
  v
[VariantList]
  - show planned files with safety badges and warnings
  - allow include/exclude per variant
  |
  v
[EmojiPreview]
  - useEffect → ensureFontsReady(fontFamily, size) → drawEmojiToCanvas(canvas, config)
  |
  v
[DownloadButton click]
  - exportCanvasToPng(canvas) → pngBlob
  - files = selectedVariants.map(v => ({ filename: v.filename, blob: pngBlob }))
  - buildZip(files) → zipBlob
  - saveAs(zipBlob, "<slug>.zip")
```

### Invariants

- One canvas render per input/style change, debounced ~200 ms.
- One PNG blob is reused across all selected variant filenames within a single emoji.
- Worker is a singleton, lazy-initialized on first use.
- Kuromoji dictionary loads once per session, only when the first kanji input appears.
- The preview canvas is the source of truth for the exported PNG.
- No API routes, no Node runtime, static-export compatible.
- Manual reading override always wins over the worker-suggested reading.
- Japanese original/kana filenames are tagged `filename-safe`, not `slack-api-safe`. Users may need to rename on upload to Slack's strict API.

## 6. Error handling

Principle: never throw to the user. Catch at the component boundary; render inline error UI. Degrade gracefully.

| Failure | Detection | Response |
|---|---|---|
| Worker module fails to instantiate | try/catch around `new Worker(...)` | Fallback: wanakana-only on main thread. Toast: "Background worker unavailable — performance may be reduced." Kanji input still works via manual reading override. |
| Kuromoji dict fetch fails | catch in worker, post `{type: 'error', code: 'DICT_FETCH_FAILED'}` | Banner: "Japanese dictionary could not be loaded. You can still enter the reading manually." Preserve original variant. Surface manual reading field. |
| Kuromoji returns token with no `reading` | inside worker tokenize loop | Use `token.surface_form` as fallback. Push `READING_UNCERTAIN` warning. UI shows: "Some kanji readings could not be detected. Edit the reading manually." Manual override field auto-focuses. |
| `document.fonts.load` rejects or times out (5 s) | `Promise.race` with timeout in `ensureFontsReady` | Draw with fallback font. Inline warning under preview. Re-render automatically when `document.fonts.ready` later resolves. |
| Canvas text overflow | `calculateFittedFontSize` measures before draw | Compute scale factor, draw once at fitted size. Minimum font size 24 px; if still overflowing, warn "Text too long for 128px emoji." |
| `canvas.toBlob` returns null | check in `exportCanvasToPng` | Reject with `Error('PNG export failed')`. Toast on click. Preview preserved. |
| `zip.generateAsync` rejects | catch in click handler | Toast: "Could not build zip. Try again." State preserved. |
| Browser lacks Worker / module worker support | feature-detect on mount | Same fallback as worker instantiate failure. |
| Empty input | guard in `EmojiStudio` | Disable Download button. No worker call. Placeholder preview. |
| All variants deselected | guard in download handler | Disable Download button. Hint: "Select at least one filename to download." |
| Intra-emoji filename collision | dedupe in `buildVariants` | Append `_2`, `_3`. Final names shown in `VariantList` before download. |
| Pack-level filename collision (future batch) | dedupe in `buildZip(files)` | Append `_2`, `_3` with warning. Surface final names before download. |
| `buildZip([])` | guard in `pack.ts` | Throw `EMPTY_ZIP`. UI guard should already prevent this. |
| Unsafe filename (`/`, `\`, `..`, control char, empty) | `sanitizeForZip(name)` | Strip dangerous chars. If result is empty, throw `EMPTY_FILENAME` and block export for that entry with clear warning. |
| Slack-strict-unsafe filename (`何ですか.png`) | classified `VariantSafety` in `buildVariants` | Tag `filename-safe`. Badge in UI: "Filename-safe (not Slack API-safe — rename on upload)." No hard block. |

### Kanji fallback rule

When kuromoji or the worker fails, do not block kanji input:

- Preserve the original Japanese filename variant.
- Show the manual reading override field.
- Generate romaji/kana variants only after the user enters a reading.
- Show a warning that automatic reading is unavailable.

## 7. Testing

### Stack

- **Vitest** + **@testing-library/react** + **jsdom** for unit + component tests.
- **Playwright** for one E2E happy-path smoke test.
- Worker file itself is not unit-tested. Pure logic is extracted into `lib/translit.ts` and tested there. The worker file is a thin postMessage shim.

### Pure module tests

**`lib/script.ts` — `detectScriptClass`**

- `"LGTM"` → `'latin'`
- `"ありがとう"` → `'kana'`
- `"カタカナ"` → `'kana'`
- `"確認中"` → `'kanji'`
- `"LGTM了解"` → `'kanji'` (any kanji → kanji class)
- `"LGTMです"` → `'mixed'` (latin + kana, no kanji)
- `""` → null/empty
- Whitespace, punctuation, emoji codepoints

**`lib/translit.ts`**

- `katakanaReadingToHiragana("ナンデスカ")` → `"なんですか"`
- `kanaToRomaji("なんですか")` → `"nandesuka"`
- Long-vowel locking: `"ありがとう"` → `"arigatou"` (not `"arigatoo"`)
- Edge cases: `"っ"` (sokuon), `"ー"` (chōonpu), small kana.

**`lib/variants.ts` — `buildVariants`**

- Kanji `"確認中"` + reading `"かくにんちゅう"` → 3 entries `[kakuninchuu, かくにんちゅう, 確認中]`.
- Kana `"ありがとう"` → 2 entries.
- Latin `"LGTM"` → 1 entry `lgtm.png` (lowercased for Slack API safety).
- Mixed `"LGTMです"` → 2 entries: `lgtmdesu.png` (kana segments transliterated via wanakana, latin segments preserved then lowercased) and `LGTMです.png` (original).
- Kanji input with missing reading → only `[original]` + `READING_UNCERTAIN` warning.
- Intra-emoji collision: hypothetical collision yields `_2` suffix.
- `VariantSafety`: latin slug → `slack-api-safe`; JP filename → `filename-safe`.

**`lib/filename.ts` — `sanitizeForZip`**

- Strip `/`, `\`, `..`, control characters, leading/trailing whitespace.
- `"何ですか.png"` survives intact (Unicode allowed).
- `"../etc/passwd"` → `"etcpasswd"` or empty (with warning).
- Empty result → throws `EMPTY_FILENAME`.

**`lib/fitText.ts` — `calculateFittedFontSize`**

- Short text → unchanged.
- Long text → reduced size that fits within canvas width.
- Below minimum (24 px) → returns minimum + `TEXT_TOO_LONG` warning.

**`lib/render.ts`**

- `drawEmojiToCanvas` in jsdom with mocked canvas context:
  - Asserts `ctx.font` set correctly.
  - Asserts `ctx.fillText` called with expected args.
- `exportCanvasToPng`:
  - Resolves to a Blob with `type === 'image/png'` when `toBlob` returns a Blob.
  - Rejects when `toBlob` returns null.
- No pixel-level assertions.

**`lib/pack.ts` — `buildZip(files)`**

- Returns a Blob with JSZip-readable content.
- Round-trip: load zip with JSZip and assert all expected filenames present.
- Pack-level collision: `[{filename: "ok.png"}, {filename: "ok.png"}]` → `ok.png` + `ok_2.png` with warning.
- Each entry's filename passes through `sanitizeForZip` before adding.
- `buildZip([])` throws `EMPTY_ZIP`.

### Component tests (jsdom)

- `EmojiStudio` types `"確認中"`, worker mocked at `@/workers/client`, variants list shows 3 expected filenames.
- `DownloadButton` disabled when input is empty or all variants are deselected.
- Manual reading override:
  - Kanji input with missing reading shows only original + warning.
  - After user enters manual reading, romaji + kana variants appear.
  - Manual reading wins over worker-suggested reading.
- Worker fallback:
  - Worker instantiate failure falls back to wanakana-only mode.
  - Kanji input preserves original variant.
  - Manual reading remains available.

### E2E (Playwright, one test)

- Load `/studio`, type `ありがとう`, wait for variants list, assert two filenames visible (`arigatou.png`, `ありがとう.png`), click Download, assert ZIP file is downloaded with `<slug>.zip` naming.
- Kana input chosen specifically to avoid kuromoji dependency in CI. A kanji E2E is deferred.

### Excluded from MVP testing

- Visual regression on rendered PNG (canvas font-metric variance across browsers).
- Worker module loading tested in isolation (covered indirectly by component-level mocked worker and the Playwright smoke test).
- Real kuromoji dict in unit tests (slow, 17 MB) — mocked at worker boundary.

### Core protected rule

The single most important behavior guarded by tests:

> Mojipon generates smart variants based on input and never forces unnecessary Japanese filenames.

Concretely: latin-only input must produce exactly one variant; kana-only input must not produce a separate kanji variant; kanji input without a reading must not silently produce romaji.

## 8. Out of scope / future milestones

1. **v2 — animation**: GIF/APNG output. Preset shake / bounce / rainbow / fade. New renderer module; preview becomes a frame loop.
2. **v3 — image upload**: cropper for arbitrary image → 128×128 PNG. Reuses variant filename logic when user supplies a Japanese label.
3. **v4 — multi-emoji packs**: batch input mode, persistent pack tray. Pack-level collision handler already designed for this.
4. **v5 — Slack direct upload**: OAuth + `emoji.admin.add` integration.
5. **v6 — creator marketplace**: accounts, cloud storage, listings.
