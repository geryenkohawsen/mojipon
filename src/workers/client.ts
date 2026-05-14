import { WORKER_TIMEOUT_MS } from "@/lib/constants";

export type TranslitResult = {
  original: string;
  suggestedKana?: string;
  warnings: string[];
};

let worker: Worker | null = null;
let counter = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./translit.worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

export function isWorkerSupported(): boolean {
  return typeof Worker !== "undefined";
}

export function translateKanji(text: string): Promise<TranslitResult> {
  const w = getWorker();
  const id = ++counter;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      w.removeEventListener("message", handler);
      reject(new Error("WORKER_TIMEOUT"));
    }, WORKER_TIMEOUT_MS);

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.id !== id) return;
      clearTimeout(timeout);
      w.removeEventListener("message", handler);
      if (msg.type === "result") {
        resolve({
          original: msg.original,
          suggestedKana: msg.suggestedKana,
          warnings: msg.warnings,
        });
      } else if (msg.type === "error") {
        reject(new Error(msg.code));
      }
    };
    w.addEventListener("message", handler);
    w.postMessage({ id, type: "translate", text });
  });
}

export function resetWorkerForTests() {
  worker?.terminate();
  worker = null;
  counter = 0;
}
