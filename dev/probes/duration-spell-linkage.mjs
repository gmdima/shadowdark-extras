// PROBE: Verify template.id round-trips through the duration-spell pipeline.
// Catches regressions of the placedTemplateId write/read mismatch (v6.10.16 fix).
// Uses dev/fixtures: _SDX TestPC + _SDX TestSpell.
// Run dev/fixtures/setup.mjs first if fixtures are missing.

const actor = game.actors.find(a => a.name === "_SDX TestPC");
const item  = actor?.items.find(i => i.name === "_SDX TestSpell" && i.type === "Spell");
const SDX   = game.modules.get("shadowdark-extras");
if (!actor || !item || !SDX?.api) return {
  pass: false, reason: "fixtures or module.api missing — run dev/fixtures/setup.mjs",
  actorFound: !!actor, itemFound: !!item, apiAvailable: !!SDX?.api,
};

const preKeys = Object.keys(actor.flags?.["shadowdark-extras"]?.activeDurationSpells ?? {});

// 1. Place a template directly (bypasses interactive UI)
const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
  t: "rect", x: 4000, y: 4000, distance: 15, direction: 0,
  user: game.user.id,
  flags: { "shadowdark-extras": { __linkageProbe: true } }
}]);
const template = created[0];
await new Promise(r => setTimeout(r, 100));

// 2. Build trackerConfig exactly like injectDamageCard does after the v6.10.16 fix
const trackerConfig = {
  perTurnTrigger: "start",
  perTurnDamage: "",
  reapplyEffects: false,
  damageType: "",
  effects: [],
  templateId: template.id,  // <-- routed local-scoped value
};

// 3. Call startDurationSpell
const instance = await SDX.api.startDurationSpell(actor, item, [], trackerConfig);
await new Promise(r => setTimeout(r, 100));

// 4. Read back actor flag — new entry must contain matching templateId
const after = actor.flags?.["shadowdark-extras"]?.activeDurationSpells ?? {};
const newKey = Object.keys(after).find(k => !preKeys.includes(k));
const entry = newKey ? after[newKey] : null;
const roundTrip = entry?.templateId === template.id;

// 5. Verify v14 ID equality contract holds for the auto-Region
const pairedRegion = SDX.api.templates?.getPairedRegion?.(template);
const pairingWorks = pairedRegion?.id === template.id;

// Cleanup
await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", [template.id]);
if (entry?.instanceId) await SDX.api.endDurationSpell(actor, entry.instanceId);

return {
  pass: roundTrip && pairingWorks,
  templateIdRoundTrip: roundTrip,
  regionPairingWorks: pairingWorks,
  placedTemplateId: template.id,
  storedTemplateId: entry?.templateId,
  pairedRegionId: pairedRegion?.id,
  instanceId: instance?.instanceId,
};
