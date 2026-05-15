"use client";

export type StyleValue = {
  bgColor: string;
  textColor: string;
  fontFamily: string;
};

export const FONT_OPTIONS = [
  {
    label: "Noto Sans JP",
    value: 'var(--font-noto-sans-jp), "Noto Sans JP", sans-serif',
    loadName: '"Noto Sans JP"',
  },
  {
    label: "Noto Serif JP",
    value: 'var(--font-noto-serif-jp), "Noto Serif JP", serif',
    loadName: '"Noto Serif JP"',
  },
  {
    label: "M PLUS Rounded 1c",
    value: 'var(--font-m-plus-rounded), "M PLUS Rounded 1c", sans-serif',
    loadName: '"M PLUS Rounded 1c"',
  },
];

export function getFontLoadName(fontFamily: string): string {
  const opt = FONT_OPTIONS.find((o) => o.value === fontFamily);
  return opt?.loadName ?? "sans-serif";
}

type Props = {
  value: StyleValue;
  onChange: (next: StyleValue) => void;
};

export function StylePicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        Background
        <input
          type="color"
          value={value.bgColor === "transparent" ? "#ffffff" : value.bgColor}
          onChange={(e) => onChange({ ...value, bgColor: e.target.value })}
        />
        <button
          type="button"
          className="text-xs underline"
          onClick={() => onChange({ ...value, bgColor: "transparent" })}
        >
          Transparent
        </button>
      </label>
      <label className="flex items-center gap-2 text-sm">
        Text
        <input
          type="color"
          value={value.textColor}
          onChange={(e) => onChange({ ...value, textColor: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        Font
        <select
          value={value.fontFamily}
          onChange={(e) => onChange({ ...value, fontFamily: e.target.value })}
          className="rounded border border-zinc-300 px-2 py-1 dark:bg-zinc-900 dark:border-zinc-700"
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
