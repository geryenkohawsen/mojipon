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
  - mixed (latin + kana, no kanji): two variants (romaji + original)
  - symbol-only or empty-after-sanitize: render allowed, but a custom filename is required before download
- Script classification rule:
  - If any kanji exists → `kanji`
  - Else if Japanese kana + Latin exist → `mixed`
  - Else if kana only → `kana`
  - Else if Latin only → `latin`
  - Else (symbols, emoji codepoints, punctuation only) → `symbol`
  - Else (empty) → `empty`
- Manual reading override is always visible for kanji input. Auto-focused / highlighted when reading is uncertain.
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
| `next/font/google` | Self-host JP fonts | Static asset |

No `file-saver` dependency. ZIP download uses a native `URL.createObjectURL` + anchor click + `URL.revokeObjectURL` sequence.

### Fonts

MVP curated list, all imported explicitly in `app/layout.tsx` via `next/font/google`:

- Noto Sans JP
- Noto Serif JP
- M PLUS Rounded 1c

Each is loaded with its CSS variable. The selected font's actual computed CSS family name is passed from `StylePicker` → `EmojiStudio` → `EmojiPreview` → `drawEmojiToCanvas`. No font name is guessed or hard-coded in `lib/render.ts`.

### Rendering

- HTML5 `<canvas>` at 128×128, single-line text rendering.
- `toBlob('image/png')` for export.
- Font readiness guaranteed via `document.fonts.load(...)` + `document.fonts.ready` before draw.
- Fit by width first. Multiline layout is out of scope for MVP.

### Dictionary serving

- Kuromoji dict files live in `public/dict/` and are served from `/dict/` (root path).
- Path is exported as a single constant `KUROMOJI_DICT_PATH = "/dict/"` (one place to change for future subpath hosting).
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
    script.ts               # detectScriptClass(text) → 'kanji'|'kana'|'latin'|'mixed'|'symbol'|'empty'
    translit.ts             # pure functions: kanaToRomaji, katakanaToHiragana, etc.
    variants.ts             # buildVariants({original, scriptClass, kana, romaji}) → Variant[]
    filename.ts             # sanitizeForZip(name) → { name, warnings } | throws EMPTY_FILENAME
    render.ts               # drawEmojiToCanvas + exportCanvasToPng
    fitText.ts              # calculateFittedFontSize (pure)
    fonts.ts                # ensureFontsReady(fontFamily, size)
    pack.ts                 # resolveZipEntries(files) + buildZip(resolvedFiles)
    download.ts             # downloadBlob(blob, filename) — native ObjectURL approach
    constants.ts            # KUROMOJI_DICT_PATH and other shared constants
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
- **`VariantList`** displays the resolved final filenames (after `resolveZipEntries`) with safety badges and include/exclude checkboxes. Whatever the user sees here is exactly what ends up in the ZIP.
- **`ManualReadingInput`** is always rendered when kanji is present. Shows the worker's suggested reading and an editable override. Auto-focuses / highlights when reading is uncertain or absent.
- **`DownloadButton`** is enabled only when at least one variant is selected, input is non-empty, and a usable filename exists (custom filename required for `symbol` or `empty` script class).

### Worker boundary

- The worker is invoked **only when the input contains kanji**. Kana-only, mixed (kana + latin, no kanji), latin-only, and symbol/empty inputs all stay on the main thread and use `wanakana` directly.
- `translit.worker.ts` is a thin shim that:
  - Lazy-loads kuromoji dict from `KUROMOJI_DICT_PATH` on first call.
  - Tokenizes input.
  - Returns `{ original, suggestedKana, romaji, warnings }`.
- `client.ts` wraps `worker.postMessage` in a Promise with timeout and error handling.
- Worker instantiation: `new Worker(new URL("./translit.worker.ts", import.meta.url), { type: "module" })`.

## 5. Data flow

```
[TextInput] --debounced text--> [EmojiStudio state]
  |
  v
[detectScriptClass(text)]
  |
  | empty       → no variants, disable download
  | symbol      → require custom filename before download
  | latin       → use wanakana directly on main thread (lowercase)
  | kana        → use wanakana directly on main thread (kana → romaji)
  | mixed       → use wanakana directly on main thread
  |              (kana segments → romaji, latin segments preserved, lowercased)
  | kanji       → call translitClient.translate(text)
  v
[translit.worker.ts]      (only invoked for kanji)
  - lazy-load kuromoji dict from KUROMOJI_DICT_PATH
  - tokenize
  - build suggested reading from token.reading
  - fallback to token.surface_form when reading is missing
  - push warning READING_UNCERTAIN if any fallback used
  - return { original, suggestedKana, romaji, warnings }
  |
  v
[EmojiStudio state]
  - store suggestedKana (for kanji input)
  - ManualReadingInput is always rendered when scriptClass === 'kanji'
  - effectiveReading = manualReading || suggestedKana
  |
  v
[buildVariants({ original, scriptClass, kana: effectiveReading, romaji })]
  - kanji  → romaji + kana + original
  - kana   → romaji + original
  - latin  → lowercased latin only (Slack API requires lower-case)
  - mixed  → romaji (kana segments transliterated, latin segments lowercased) + original
  - symbol → no auto variants; user-provided filename forms the single variant
  - empty  → []
  - each variant tagged with VariantSafety:
      "slack-api-safe" | "filename-safe" | "needs-review"
  |
  v
[resolveZipEntries(selectedVariants)]
  - sanitize each filename via sanitizeForZip
  - dedupe pack-level collisions: append _2, _3
  - emit warnings array
  - returns { files: ZipFileEntry[], warnings: Warning[] }
  |
  v
[VariantList]
  - shows the resolved final filenames (post-sanitize, post-dedupe)
  - shows safety badges and warnings
  - what user sees here is exactly what ends up in the ZIP
  - allow include/exclude per variant (re-runs resolveZipEntries)
  |
  v
[EmojiPreview]
  - useEffect → ensureFontsReady(fontFamily, size) → drawEmojiToCanvas(canvas, config)
  |
  v
[DownloadButton click]
  - exportCanvasToPng(canvas) → pngBlob
  - resolved = resolveZipEntries(selectedVariants.map(v => ({ filename: v.filename, blob: pngBlob })))
  - buildZip(resolved.files) → zipBlob
  - downloadBlob(zipBlob, "<slug>.zip")
      via URL.createObjectURL + anchor click + URL.revokeObjectURL
```

### Invariants

- One canvas render per input/style change, debounced ~200 ms.
- One PNG blob is reused across all selected variant filenames within a single emoji.
- Worker is a singleton, lazy-initialized on first kanji input.
- Worker is invoked only for `scriptClass === 'kanji'`. All other classes stay on the main thread.
- Kuromoji dictionary loads once per session, only when the first kanji input appears.
- The preview canvas is the source of truth for the exported PNG.
- No API routes, no Node runtime, static-export compatible.
- Manual reading override always wins over the worker-suggested reading.
- The `VariantList` UI shows the **final, post-resolution** filenames — `buildZip` never silently renames an entry that wasn't already shown to the user.
- Japanese original/kana filenames are tagged `filename-safe`, not `slack-api-safe`. Users may need to rename on upload to Slack's strict API.

## 6. Error handling

Principle: never throw to the user. Catch at the component boundary; render inline error UI. Degrade gracefully.

| Failure | Detection | Response |
|---|---|---|
| Worker module fails to instantiate | try/catch around `new Worker(...)` | Fallback: wanakana-only on main thread. Toast: "Background worker unavailable — performance may be reduced." Kanji input still works via manual reading override. |
| Kuromoji dict fetch fails | catch in worker, post `{type: 'error', code: 'DICT_FETCH_FAILED'}` | Banner: "Japanese dictionary could not be loaded. You can still enter the reading manually." Preserve original variant. Surface manual reading field. |
| Kuromoji returns token with no `reading` | inside worker tokenize loop | Use `token.surface_form` as fallback. Push `READING_UNCERTAIN` warning. UI shows: "Some kanji readings could not be detected. Edit the reading manually." Manual override field auto-focuses. |
| `document.fonts.load` rejects or times out (5 s) | `Promise.race` with timeout in `ensureFontsReady` | Draw with fallback font. Inline warning under preview. Re-render automatically when `document.fonts.ready` later resolves. |
| Canvas text overflow | `calculateFittedFontSize` measures before draw | MVP is single-line. Fit by width first. Compute scale factor, draw once at fitted size. Minimum font size 24 px; if still overflowing, warn "Text too long for 128px emoji." Multiline layout is out of scope. |
| `canvas.toBlob` returns null | check in `exportCanvasToPng` | Reject with `Error('PNG export failed')`. Toast on click. Preview preserved. |
| `zip.generateAsync` rejects | catch in click handler | Toast: "Could not build zip. Try again." State preserved. |
| Browser lacks Worker / module worker support | feature-detect on mount | Same fallback as worker instantiate failure. |
| Empty input | guard in `EmojiStudio` | Disable Download button. No worker call. Placeholder preview. |
| All variants deselected | guard in download handler | Disable Download button. Hint: "Select at least one filename to download." |
| Intra-emoji filename collision | dedupe in `buildVariants` | Append `_2`, `_3`. Final names shown in `VariantList` before download. |
| Pack-level filename collision | dedupe in `resolveZipEntries(files)` (separate step from `buildZip`) | Append `_2`, `_3` with warning. Resolved names are surfaced in the UI before the user can click Download. `buildZip` itself never silently renames. |
| `buildZip([])` | guard in `pack.ts` | Throw `EMPTY_ZIP`. UI guard should already prevent this. |
| Unsafe filename (`/`, `\`, `..`, control char) | `sanitizeForZip(name)` | Strip dangerous chars deterministically. `"../etc/passwd"` → `"etcpasswd"` plus warning `UNSAFE_PATH_CHARS_REMOVED`. Throws `EMPTY_FILENAME` only when nothing usable remains after sanitization. |
| Symbol-only or empty input (e.g. `🔥`, `(笑)`, `!?!`) | `detectScriptClass` returns `symbol` or `empty` | Render allowed. Require user to type a custom filename before Download enables. Hint: "Emoji text can be rendered, but a filename is required." |
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
- `"🔥"` → `'symbol'`
- `"(笑)"` → `'symbol'` (punctuation + kanji-like? if `笑` is kanji → `'kanji'`. Test fixture pins behavior explicitly.)
- `"!?!"` → `'symbol'`
- `""` → `'empty'`
- Whitespace-only → `'empty'`

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
- `"../etc/passwd"` → `"etcpasswd"` with warning `UNSAFE_PATH_CHARS_REMOVED` (deterministic; not "or empty").
- Result that becomes empty after stripping → throws `EMPTY_FILENAME`.
- Returns `{ name, warnings }` shape so callers can surface warnings to UI.

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

**`lib/pack.ts` — `resolveZipEntries` + `buildZip`**

- `resolveZipEntries(files)`:
  - Each filename passes through `sanitizeForZip`.
  - Pack-level collision: `[{filename: "ok.png"}, {filename: "ok.png"}]` → `ok.png` + `ok_2.png` with warning.
  - Returns `{ files: ResolvedZipEntry[], warnings: Warning[] }`.
- `buildZip(resolvedFiles)`:
  - Returns a Blob with JSZip-readable content.
  - Round-trip: load zip with JSZip and assert all expected filenames present.
  - Trusts that resolution already happened — no renaming, no extra sanitization.
  - `buildZip([])` throws `EMPTY_ZIP`.

### Component tests (jsdom)

- `EmojiStudio` types `"確認中"`, worker mocked at `@/workers/client`, variants list shows 3 expected filenames.
- `DownloadButton` disabled when input is empty, all variants are deselected, or scriptClass is `symbol` / `empty` without a custom filename.
- Manual reading override:
  - `ManualReadingInput` is always rendered for kanji input (not only on failure).
  - Kanji input with missing reading shows only original + warning + auto-focused field.
  - After user enters manual reading, romaji + kana variants appear.
  - Manual reading wins over worker-suggested reading.
- Worker fallback:
  - Worker instantiate failure falls back to wanakana-only mode.
  - Kanji input preserves original variant.
  - Manual reading remains available.
- Symbol-only input:
  - `"🔥"` shows render but disables Download until user types a custom filename.
- `VariantList` truth check:
  - When pack-level dedupe renames `ok.png` → `ok_2.png`, the UI displays `ok_2.png` *before* the user clicks Download.

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
