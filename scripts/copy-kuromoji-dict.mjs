import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "node_modules", "kuromoji", "dict");
const dest = join(here, "..", "public", "dict");

if (!existsSync(src)) {
  console.error("kuromoji dict not found at", src);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log("Copied kuromoji dict to", dest);
