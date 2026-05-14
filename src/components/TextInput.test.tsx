import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("debounces and reports value", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TextInput value="" onChange={onChange} debounceMs={200} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    act(() => {
      fireEvent.change(input, { target: { value: "OK" } });
    });
    expect(onChange).not.toHaveBeenCalledWith("OK");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).toHaveBeenLastCalledWith("OK");
    vi.useRealTimers();
  });
});
