import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center flex-1 gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold">Mojipon</h1>
      <p className="text-zinc-600 dark:text-zinc-400 max-w-md">
        Japanese-aware Slack emoji generator. Type text, download a ZIP, upload to Slack.
      </p>
      <Link
        href="/studio"
        className="rounded-full bg-black text-white px-6 py-3 dark:bg-white dark:text-black"
      >
        Open Studio
      </Link>
    </main>
  );
}
