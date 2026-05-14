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
