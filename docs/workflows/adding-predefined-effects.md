---
description: How to add new predefined effects (resistance, immunity, conditions, etc.)
---

# Adding Predefined Effects

This workflow describes how to add new predefined effects to the module. Predefined effects appear in the Shadowdark system's effect dropdown and can be applied to actors.

## Overview

Predefined effects are registered in `CONFIG.SHADOWDARK.PREDEFINED_EFFECTS` during the `setup` hook. Each effect sets a flag on the actor that can be checked during gameplay (e.g., damage processing, spell casting).

## Files to Modify

1. **`i18n/en.json`** - Add localization string for the effect name
2. **`scripts/shadowdark-extras.mjs`** - Register the predefined effect
3. **`scripts/CombatSettingsSD.mjs`** - (Optional) Add damage processing logic if the effect affects damage

## Step 1: Add Localization String

Add the effect name to `i18n/en.json`:

```json
"SHADOWDARK_EXTRAS.item.effect.predefined_effect.yourEffectName": "Your Effect Display Name",
```

**Naming conventions:**
- Resistance effects: `"Resistance: [Type]"`
- Immunity effects: `"Immunity: [Type]"`
- Vulnerability effects: `"Vulnerability: [Type]"`
- Other effects: Use descriptive names like `"Spell Advantage (All)"`, `"Glassbones"`

## Step 2: Register the Predefined Effect

In `shadowdark-extras.mjs`, find the section after the damage type loop (search for `// Merge ability advantage effects`). Add your effect to the `abilityAdvantageEffects` object:

```javascript
abilityAdvantageEffects.yourEffectName = {
    defaultValue: true,  // or a specific value like "spellcasting"
    effectKey: `flags.${MODULE_ID}.your.flag.path`,
    img: "icons/path/to/icon.webp",
    name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.yourEffectName`,
    mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
};
```

### Effect Configuration Options

| Property | Description |
|----------|-------------|
| `defaultValue` | The value set when the effect is applied. Use `true` for boolean flags, or a string for specific values |
| `effectKey` | The flag path. Use `flags.shadowdark-extras.your.path` for module flags, or `system.bonuses.xxx` for system properties |
| `img` | Icon path. Browse `icons/` in Foundry for built-in options |
| `name` | Localization key for the display name |
| `mode` | Usually `CONST.ACTIVE_EFFECT_MODES.OVERRIDE` for flags, `CONST.ACTIVE_EFFECT_MODES.ADD` for bonuses |

## Step 3: Add Damage Processing (If Applicable)

If your effect modifies damage (resistance, immunity, vulnerability), update `CombatSettingsSD.mjs`.

### For Effects That Modify Physical Damage

Add checks in the `applyTokenDamage` socket handler. There are **3 locations** to update:

1. **Component damage processing** (~line 314-345) - For bonus damage components
2. **Base damage processing** (~line 377-408) - For weapon base damage
3. **Legacy damage processing** (~line 445-456) - For single-value damage

Example pattern for checking a flag:

```javascript
// Check for your effect
if (damageValue > 0) {
    const hasYourEffect = token.actor.getFlag("shadowdark-extras", "your.flag.path");
    if (hasYourEffect) {
        // Immunity: set to 0
        damageValue = 0;
        // OR Resistance: halve
        damageValue = Math.floor(damageValue / 2);
        // OR Vulnerability: double
        damageValue = damageValue * 2;
    }
}
```

### For Effects That Need Additional Data

If your effect needs data from the attack (e.g., `isMagicalWeapon`):

1. Calculate the data where the damage card is created (~line 2440):
   ```javascript
   const yourData = /* calculate based on item/actor */;
   ```

2. Pass to `buildDamageCardHtml()` - add parameter to function signature

3. Add data attribute to HTML (~line 3161):
   ```javascript
   data-your-data="${yourData}"
   ```

4. Read from card and pass to socket call (~line 4095):
   ```javascript
   const yourData = $card.data('your-data');
   // Add to socket call object
   ```

5. Use in socket handler:
   ```javascript
   if (data.yourData) { /* process */ }
   ```

## Example: Complete Effect Addition

Here's the complete example for `resistanceNonMagic`:

### i18n/en.json
```json
"SHADOWDARK_EXTRAS.item.effect.predefined_effect.resistanceNonMagic": "Resistance: Non-Magical Weapons",
```

### shadowdark-extras.mjs
```javascript
abilityAdvantageEffects.resistanceNonMagic = {
    defaultValue: true,
    effectKey: `flags.${MODULE_ID}.resistance.nonmagic`,
    img: "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
    name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.resistanceNonMagic`,
    mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
};
```

### CombatSettingsSD.mjs (damage processing)
```javascript
// Check for non-magical weapon resistance/immunity (only if weapon is not magical)
if (componentDamage > 0 && !data.isMagicalWeapon) {
    const isNonMagicImmune = token.actor.getFlag("shadowdark-extras", "immunity.nonmagic");
    if (isNonMagicImmune) {
        componentDamage = 0;
    } else {
        const isNonMagicResistant = token.actor.getFlag("shadowdark-extras", "resistance.nonmagic");
        if (isNonMagicResistant) {
            componentDamage = Math.floor(componentDamage / 2);
        }
    }
}
```

## Existing Effect Patterns

Reference these existing effects for patterns:

| Effect Type | Flag Path | Example |
|------------|-----------|---------|
| Damage Type Resistance | `flags.shadowdark-extras.resistance.{type}` | `resistance.fire` |
| Damage Type Immunity | `flags.shadowdark-extras.immunity.{type}` | `immunity.cold` |
| Damage Type Vulnerability | `flags.shadowdark-extras.vulnerability.{type}` | `vulnerability.lightning` |
| Non-Magic Resistance | `flags.shadowdark-extras.resistance.nonmagic` | Physical from non-magical weapons |
| Spell Advantage | `system.bonuses.advantage` | Value: spell name |
| Glassbones | `flags.shadowdark-extras.glassbones` | Double damage taken |

## Testing

1. Create a test actor
2. Add the effect via the Effects tab on an item
3. Verify the flag is set on the actor (`actor.getFlag("shadowdark-extras", "your.path")`)
4. If damage-related, test with the damage card system
