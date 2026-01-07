---
description: How to create spells that modify items and auto-revert on spell end
---

# Spell Modification System

Use `registerSpellModification()` to create spells that modify items (weapons, armor) and automatically revert changes when the spell ends.

## API

```javascript
const sdxModule = game.modules.get("shadowdark-extras");

// IMPORTANT: Call BEFORE applying changes (captures original state)
await sdxModule.api.registerSpellModification(caster, spell, targetItem, changes, {
    icon: "fas fa-hand-sparkles",  // FontAwesome icon for chat
    endMessage: "The blessing fades from {weapon} on {actor}."  // Placeholders
});

// THEN apply the changes
await targetItem.update(changes);

// THEN start duration tracking
await sdxModule.api.startDurationSpell(caster, spell, [targetTokenId], {});
```

## Example: Holy Weapon Pattern

```javascript
// 1. Define the changes you will make
const changes = {
    "system.magicItem": true,
    [`flags.shadowdark-extras.weaponBonus`]: { enabled: true, hitBonuses: [...], damageBonuses: [...] }
};

// 2. FIRST: Register for cleanup (captures current/original state)
await sdxModule.api.registerSpellModification(actor, item, weapon, changes, {
    icon: "fas fa-hand-sparkles",
    endMessage: "The holy blessing fades from <strong>{weapon}</strong> on <strong>{actor}</strong>."
});

// 3. THEN: Apply the changes to the weapon
await weapon.update(changes);

// 4. THEN: Start duration tracking
await sdxModule.api.startDurationSpell(actor, item, [target.id], {});
```

## What Happens On Spell End

1. `endDurationSpell()` is called (manual or expired)
2. `revertSpellModifications()` finds items with matching spell/caster
3. Each item reverts to its stored original state
4. Chat message posted with custom `endMessage`
