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
