"use client";

import type { Variant } from "@/lib/variants";

type Props = {
  variants: Variant[];
  selected: Set<string>;
  warnings: string[];
  onToggle: (filename: string) => void;
};

const SAFETY_LABEL: Record<Variant["safety"], string> = {
  "recommended-slack-name": "Recommended",
  "filename-safe": "Filename-safe",
  "needs-review": "Needs review",
};

export function VariantList({ variants, selected, warnings, onToggle }: Props) {
  if (variants.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Type something to see filename variants.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1">
        {variants.map((v) => {
          const checked = selected.has(v.filename);
          return (
            <li key={v.filename} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(v.filename)}
              />
              <code className="font-mono">{v.filename}</code>
              <span className="text-xs text-zinc-500">
                {SAFETY_LABEL[v.safety]}
              </span>
            </li>
          );
        })}
      </ul>
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-600 dark:text-amber-400">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
