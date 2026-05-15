import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmojiStudio } from "./EmojiStudio";

vi.mock("@/workers/client", () => ({
  isWorkerSupported: () => true,
  translateKanji: vi.fn(async (text: string) => ({
    original: text,
    suggestedKana: text === "確認中" ? "かくにんちゅう" : undefined,
    warnings: [],
  })),
}));

describe("EmojiStudio", () => {
  it("shows 3 variants for kanji input with suggested reading", async () => {
    render(<EmojiStudio />);
    const input = screen.getByPlaceholderText(/type text/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "確認中" } });
    await waitFor(
      () => {
        expect(screen.getByText("kakuninchuu.png")).toBeInTheDocument();
        expect(screen.getByText("かくにんちゅう.png")).toBeInTheDocument();
        expect(screen.getByText("確認中.png")).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  });
});
