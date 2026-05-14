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
    const result = sanitizeForZip(" bad\\name");
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
