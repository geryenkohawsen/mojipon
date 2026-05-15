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
