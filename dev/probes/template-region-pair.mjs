// PROBE: Verify Foundry v14's MeasuredTemplate ↔ Region auto-pairing contract:
//   1. Creating a MeasuredTemplate auto-creates one companion Region.
//   2. The auto-Region's document ID equals the template's document ID.
//   3. Template flags clone onto the Region at creation.
//   4. Deleting the template cascade-deletes the Region.
// Catches regressions of the existingRegionIds heuristic snapshot.

const scene = canvas.scene;
if (!scene) return { pass: false, reason: "no active scene" };

const probeFlag = "__sdxPairProbe_" + Date.now();
const before = new Set(scene.regions.contents.map(r => r.id));

const created = await scene.createEmbeddedDocuments("MeasuredTemplate", [{
  t: "circle", x: 2000, y: 2000, distance: 20,
  user: game.user.id,
  flags: { "shadowdark-extras": { __probe: probeFlag } }
}]);
const template = created[0];
await new Promise(r => setTimeout(r, 250));

const newRegions = scene.regions.contents.filter(r => !before.has(r.id));
const byId = scene.regions.get(template.id);
const flagCloned = byId?.flags?.["shadowdark-extras"]?.__probe === probeFlag;
const SDX = game.modules.get("shadowdark-extras");
const viaHelper = SDX?.api?.templates?.getPairedRegion?.(template);

await scene.deleteEmbeddedDocuments("MeasuredTemplate", [template.id]);
await new Promise(r => setTimeout(r, 250));
const cascade = newRegions.every(r => !scene.regions.get(r.id));

// Cleanup any orphans
const orphans = newRegions.filter(r => scene.regions.get(r.id));
if (orphans.length) await scene.deleteEmbeddedDocuments("Region", orphans.map(r => r.id));

return {
  pass: newRegions.length === 1 && byId?.id === template.id && flagCloned && cascade,
  autoCreatesOne: newRegions.length === 1,
  idsMatch: byId?.id === template.id,
  flagsCloned: flagCloned,
  helperReturnsCorrectRegion: viaHelper?.id === template.id,
  cascadeDelete: cascade,
  cleanedOrphans: orphans.length,
};
