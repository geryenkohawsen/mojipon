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
