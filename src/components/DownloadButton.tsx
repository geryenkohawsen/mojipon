"use client";

type Props = {
  disabled: boolean;
  onClick: () => void;
};

export function DownloadButton({ disabled, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-12 rounded-full bg-black text-white px-6 disabled:opacity-40 dark:bg-white dark:text-black"
    >
      Download ZIP
    </button>
  );
}
