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
