// Unpack every compendium in module.json from LevelDB (packs/<name>/) to
// source-format YAML (src/packs/<name>/). One YAML file per document.
//
// Run with Foundry CLOSED — LevelDB acquires an exclusive lock while the
// world is loaded and unpack will fail with "Resource temporarily unavailable".
//
// Usage:  npm run unpack
//
// Source layout after running:
//   src/packs/pack-sdxeffects/<docName>_<docId>.yml
//   src/packs/pack-sdxitems/<docName>_<docId>.yml
//   src/packs/pack-sdxactors/<docName>_<docId>.yml
//   src/packs/pack-sdxrollables/<docName>_<docId>.yml

import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(await readFile(resolve(root, "module.json"), "utf8"));

if (!Array.isArray(manifest.packs) || !manifest.packs.length) {
  console.error("No packs declared in module.json");
  process.exit(1);
}

let failed = 0;
for (const pack of manifest.packs) {
  const src  = resolve(root, pack.path);                  // packs/pack-sdxeffects
  const dest = resolve(root, "src", pack.path);           // src/packs/pack-sdxeffects
  console.log(`unpack: ${pack.name} (${pack.type}) -> src/${pack.path}`);
  try {
    await extractPack(src, dest, { yaml: true, log: false });
  } catch (e) {
    console.error(`  FAIL: ${e.message}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} pack(s) failed. Common cause: Foundry has the world open.`);
  process.exit(1);
}
console.log("\nunpack: OK");
