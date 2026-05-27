// Compile every compendium from source-format YAML (src/packs/<name>/) into
// LevelDB (packs/<name>/). Run before release or after editing source files.
//
// Run with Foundry CLOSED — LevelDB will fail to write while the world is
// loaded.
//
// Usage:  npm run pack
//
// CI: .github/workflows/main.yml runs `npm install && npm run pack` before
// building module.zip.

import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));

if (!Array.isArray(manifest.packs) || !manifest.packs.length) {
  console.error("No packs declared in module.json");
  process.exit(1);
}

let failed = 0;
let skipped = 0;
for (const pack of manifest.packs) {
  const src  = resolve(root, "src", pack.path);            // src/packs/pack-sdxeffects
  const dest = resolve(root, pack.path);                   // packs/pack-sdxeffects

  // Skip packs that haven't been source-formatted yet
  try {
    await stat(src);
  } catch {
    console.log(`pack: ${pack.name} -- skipped (no source dir at src/${pack.path})`);
    skipped++;
    continue;
  }

  console.log(`pack: ${pack.name} (${pack.type}) -> ${pack.path}`);
  try {
    await compilePack(src, dest, { yaml: true, log: false });
  } catch (e) {
    console.error(`  FAIL: ${e.message}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} pack(s) failed. Common cause: Foundry has the world open.`);
  process.exit(1);
}
console.log(`\npack: OK${skipped ? ` (${skipped} skipped — no source)` : ""}`);
