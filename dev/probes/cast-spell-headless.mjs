// PROBE: Verify SDX.dev.castSpell runs an end-to-end spell cast without UI.
// Bypasses shadowdark.dice.rollDialog via { skipPrompt: true } and exercises
// the real rollFromConfig + chat-card render pipeline.
//
// Uses dev/fixtures: _SDX TestPC (wizard, level 3, INT 16, Spell Class AE)
// and _SDX TestSpell (tagged as a wizard spell). Run dev/fixtures/setup.mjs
// first if fixtures are missing.

const SDX = game.modules.get("shadowdark-extras");
if (!SDX?.api?.dev?.castSpell) {
  return { pass: false, reason: "SDX.api.dev.castSpell missing — reload Foundry to pick up the new module code" };
}

const pc = game.actors.find(a => a.name === "_SDX TestPC");
const spell = pc?.items.find(i => i.name === "_SDX TestSpell" && i.type === "Spell");
if (!pc || !spell) return {
  pass: false, reason: "fixtures missing — run dev/fixtures/setup.mjs",
  pcFound: !!pc, spellFound: !!spell,
};

if (!pc.system.isSpellCaster) return {
  pass: false, reason: "TestPC isSpellCaster === false — re-run setup.mjs to add the Spell Class AE",
};

const before = game.messages.size;
let result, err;
try {
  result = await SDX.api.dev.castSpell(pc, spell);
} catch (e) {
  err = e.message;
}
await new Promise(r => setTimeout(r, 300));

const newMessages = game.messages.contents.slice(before).map(m => ({
  id: m.id,
  flavor: m.flavor?.slice(0, 80),
  rollTotal: m.rolls?.[0]?.total,
  rollFormula: m.rolls?.[0]?.formula,
}));

return {
  pass: result === true && newMessages.length >= 1,
  result,
  newMessageCount: newMessages.length,
  newMessages,
  err,
};
