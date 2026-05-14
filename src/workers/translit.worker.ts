// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- kuromoji ships no types
import kuromoji from "kuromoji";
import * as wanakana from "wanakana";

type KuromojiToken = {
  surface_form: string;
  reading?: string;
};

type Tokenizer = {
  tokenize: (text: string) => KuromojiToken[];
};

type KuromojiBuilder = {
  build: (cb: (err: Error | null, tokenizer: Tokenizer) => void) => void;
};

type KuromojiModule = {
  builder: (options: { dicPath: string }) => KuromojiBuilder;
};

const km = kuromoji as unknown as KuromojiModule;

type Request = { id: number; type: "translate"; text: string };
type Response =
  | {
      id: number;
      type: "result";
      original: string;
      suggestedKana?: string;
      warnings: string[];
    }
  | { id: number; type: "error"; code: string };

let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(dictPath: string): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      km.builder({ dicPath: dictPath }).build((err, t) => {
        if (err) reject(err);
        else resolve(t);
      });
    });
  }
  return tokenizerPromise;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const req = event.data;
  if (req.type !== "translate") return;
  try {
    const tokenizer = await getTokenizer("/dict/");
    const tokens = tokenizer.tokenize(req.text);
    const warnings: string[] = [];
    let reading = "";
    let anyMissing = false;
    for (const token of tokens) {
      if (token.reading && token.reading !== "*") {
        reading += token.reading;
      } else {
        reading += token.surface_form;
        anyMissing = true;
      }
    }
    if (anyMissing) warnings.push("READING_UNCERTAIN");

    const hiragana = wanakana.toHiragana(reading, { passRomaji: true });
    const response: Response = {
      id: req.id,
      type: "result",
      original: req.text,
      suggestedKana: hiragana.length > 0 ? hiragana : undefined,
      warnings,
    };
    (self as unknown as { postMessage: (m: Response) => void }).postMessage(response);
  } catch {
    const response: Response = {
      id: req.id,
      type: "error",
      code: "DICT_FETCH_FAILED",
    };
    (self as unknown as { postMessage: (m: Response) => void }).postMessage(response);
  }
};
