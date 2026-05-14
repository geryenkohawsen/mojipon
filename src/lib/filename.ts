export const EMPTY_FILENAME = "EMPTY_FILENAME";
export const UNSAFE_PATH_CHARS_REMOVED = "UNSAFE_PATH_CHARS_REMOVED";

export type SanitizeResult = {
  name: string;
  warnings: string[];
};

const UNSAFE_RE = /[\\/\x00-\x1F\x7F]|\.\./g;

export function sanitizeForZip(input: string): SanitizeResult {
  const warnings: string[] = [];
  const trimmed = input.trim();

  const name = trimmed.replace(UNSAFE_RE, () => {
    if (!warnings.includes(UNSAFE_PATH_CHARS_REMOVED)) {
      warnings.push(UNSAFE_PATH_CHARS_REMOVED);
    }
    return "";
  });

  const finalName = name.trim();
  if (finalName.length === 0) {
    throw new Error(EMPTY_FILENAME);
  }

  return { name: finalName, warnings };
}
