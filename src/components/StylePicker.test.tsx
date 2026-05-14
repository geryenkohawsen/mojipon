import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StylePicker, FONT_OPTIONS } from "./StylePicker";

describe("StylePicker", () => {
  it("reports color and font changes", () => {
    const onChange = vi.fn();
    render(
      <StylePicker
        value={{ bgColor: "#ffffff", textColor: "#000000", fontFamily: FONT_OPTIONS[0].value }}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText(/font/i);
    fireEvent.change(select, { target: { value: FONT_OPTIONS[1].value } });
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.fontFamily).toBe(FONT_OPTIONS[1].value);
  });
});
