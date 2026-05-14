import { describe, expect, it } from "vitest";
import { isWorkerSupported } from "./client";

describe("isWorkerSupported", () => {
  it("returns a boolean", () => {
    expect(typeof isWorkerSupported()).toBe("boolean");
  });
});
