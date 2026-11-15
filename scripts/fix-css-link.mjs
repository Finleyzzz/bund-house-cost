#!/usr/bin/env node
/**
 * After `vite build`, the server bundle sometimes links a stylesheet name
 * (`/assets/styles-XXXX.css`) that the browser build never wrote, so the first
 * paint comes up unstyled (logo top-left on a white page) until JS loads.
 * Point every such link at the stylesheet that really exists.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PUBLIC = ".output/public/assets";
const SERVER = ".output/server";

let assets;
try {
  assets = await readdir(PUBLIC);
} catch {
  console.log("[fix-css-link] no .output/public/assets — nothing to do.");
  process.exit(0);
}
const real = assets.filter((f) => /^styles-[\w-]+\.css$/.test(f));
if (real.length !== 1) {
  console.log(`[fix-css-link] expected one styles-*.css, found ${real.length} — leaving as is.`);
  process.exit(0);
}
const good = `/assets/${real[0]}`;

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (/\.(m?js|json|html)$/.test(entry.name)) yield path;
  }
}

let fixed = 0;
for await (const path of files(SERVER)) {
  const text = await readFile(path, "utf8");
  const next = text.replace(/\/assets\/styles-[\w-]+\.css/g, (m) =>
    assets.includes(m.slice(8)) ? m : good,
  );
  if (next !== text) {
    await writeFile(path, next);
    fixed++;
  }
}
console.log(`[fix-css-link] stylesheet ${good}; fixed ${fixed} server file(s).`);
