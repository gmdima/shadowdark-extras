// FIXTURES: Create the SDX test fixtures used by dev/probes/.
// Idempotent — re-running is safe; existing fixtures are reused.
//
// Creates:
//   - Folder "_SDX Test Fixtures" (Actor type)
//   - "_SDX TestPC"     — Player actor, Wizard class, OWNER ownership default.
//                          Has a transferable "_SDX Spell Class" AE that pushes
//                          "wizard" onto spellcasting.classes so castSpell works.
//   - "_SDX TestNPC"    — NPC actor, NONE ownership (for "not owned" cross-client tests)
//   - "_SDX TestSpell"  — Spell on TestPC with template + trackDuration configured,
//                          tagged for the Wizard class so the caster can use it.
//
// Returns IDs / UUIDs of the fixtures so probes can look them up.

const FOLDER_NAME = "_SDX Test Fixtures";
const TEST_PC     = "_SDX TestPC";
const TEST_NPC    = "_SDX TestNPC";
const TEST_SPELL  = "_SDX TestSpell";
const WIZARD_UUID = "Compendium.shadowdark.classes.Item.035nuVkU9q2wtMPs";

let folder = game.folders.find(f => f.name === FOLDER_NAME && f.type === "Actor");
if (!folder) folder = await Folder.create({ name: FOLDER_NAME, type: "Actor", color: "#cc00cc" });

let pc = game.actors.find(a => a.name === TEST_PC);
if (!pc) pc = await Actor.create({ name: TEST_PC, type: "Player", folder: folder.id });

// Set wizard class + INT + level if not already
const needsClassUpdate = pc.system.class?.[0] !== WIZARD_UUID
  || pc.system.abilities?.int?.value < 16
  || (pc.system.level?.value ?? 0) < 3;
if (needsClassUpdate) {
  await pc.update({
    system: {
      class: [WIZARD_UUID],
      abilities: { int: { base: 16, value: 16 } },
      level: { value: 3, xp: 0 },
    }
  });
}

if (pc.ownership.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
  await pc.update({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
}

// Transferable AE that pushes "wizard" onto spellcasting.classes.
// Without this, system.isSpellCaster is false and castSpell rejects with
// "This character is not a spellcaster".
let spellClassAE = pc.effects.find(e => e.name === "_SDX Spell Class");
if (!spellClassAE) {
  const created = await pc.createEmbeddedDocuments("ActiveEffect", [{
    name: "_SDX Spell Class",
    img: "icons/magic/symbols/runes-star-pentagon-blue.webp",
    transfer: true,
    system: {
      changes: [{
        key: "system.spellcasting.classes",
        value: "wizard",
        priority: 0,
        type: "add",
        phase: "initial",
      }],
    },
  }]);
  spellClassAE = created[0];
  pc.reset();
  await new Promise(r => setTimeout(r, 100));
}

let npc = game.actors.find(a => a.name === TEST_NPC);
if (!npc) npc = await Actor.create({ name: TEST_NPC, type: "NPC", folder: folder.id });
if (npc.ownership.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE) {
  await npc.update({ ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
}

let spell = pc.items.find(i => i.name === TEST_SPELL && i.type === "Spell");
if (!spell) {
  const created = await pc.createEmbeddedDocuments("Item", [{
    name: TEST_SPELL,
    type: "Spell",
    img: "icons/magic/symbols/runes-star-blue.webp",
    system: {
      tier: 1,
      class: [WIZARD_UUID],  // tag as a Wizard spell so the caster can use it
      duration: { type: "rounds", rounds: 3 },
      description: { value: "<p>SDX test spell — template + duration tracking.</p>" }
    },
    flags: {
      "shadowdark-extras": {
        targeting: {
          mode: "template",
          template: {
            type: "rect", size: 15, fillColor: "#ff00ff",
            placement: "choose", deleteMode: "none",
            hideOutline: false, excludeCaster: false,
            tokenMagic: { texture: "", opacity: 0.5, preset: "NOFX" }
          }
        },
        spellDamage: {
          enabled: true, trackDuration: true,
          perTurnTrigger: "start", perTurnDamage: "",
          reapplyEffects: false, formulaType: "basic",
          numDice: 1, dieType: "d6", bonus: 0,
          formula: "", tieredFormula: "",
          scaling: "none", scalingDice: 0,
          damageType: "", effects: "[]",
          damageRequirement: "", damageRequirementFailAction: "zero",
          effectsRequirement: "", effectsApplyToTarget: true,
          criticalEffects: "[]", effectSelectionMode: "all"
        }
      }
    }
  }]);
  spell = created[0];
} else if (!spell.system.class?.includes(WIZARD_UUID)) {
  await spell.update({ system: { class: [WIZARD_UUID] } });
}

return {
  folder: { id: folder.id, name: folder.name },
  pc:     { id: pc.id,     name: pc.name,     uuid: pc.uuid,     isSpellCaster: pc.system.isSpellCaster, classes: pc.system.spellcasting?.classes },
  npc:    { id: npc.id,    name: npc.name,    uuid: npc.uuid },
  spell:  { id: spell.id,  name: spell.name,  uuid: spell.uuid },
  spellClassAE: { id: spellClassAE.id, name: spellClassAE.name },
};
