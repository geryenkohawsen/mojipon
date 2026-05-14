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
