"use client";

type Props = {
  suggested: string | undefined;
  value: string;
  uncertain: boolean;
  onChange: (next: string) => void;
};

export function ManualReadingInput({ suggested, value, uncertain, onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm">
        Reading (kana)
        <input
          type="text"
          value={value}
          autoFocus={uncertain && value.length === 0}
          onChange={(e) => onChange(e.target.value)}
          placeholder={suggested ?? "Enter kana reading"}
          className={`mt-1 w-full rounded border px-3 py-2 dark:bg-zinc-900 ${
            uncertain
              ? "border-amber-500 dark:border-amber-400"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
      </label>
      {uncertain && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Some kanji readings could not be detected. Edit the reading manually.
        </p>
      )}
    </div>
  );
}
