# Valid Requirement Examples

## Level Requirements

- `level > 3` - Character level greater than 3
- `level >= 5` - Character level 5 or higher
- `level === 1` - Exactly level 1

## Hit Points Requirements

- `actor.system.attributes.hp.value > 10` - Current HP greater than 10
- `actor.system.attributes.hp.value >= actor.system.attributes.hp.max / 2` - At least half HP
- `actor.system.attributes.hp.value < 5` - Bloodied (less than 5 HP)
- `actor.system.attributes.hp.max >= 20` - Maximum HP 20 or higher

## Attribute Requirements

- `attributes.str.value >= 14` - Strength 14 or higher
- `attributes.dex.value > 12` - Dexterity greater than 12
- `attributes.con.value >= 16` - Constitution 16 or higher

## Ability Modifier Requirements

- `abilities.str.mod >= 2` - Strength modifier +2 or higher
- `abilities.dex.mod > 0` - Positive Dexterity modifier
- `abilities.int.mod >= 3` - Intelligence modifier +3 or higher

## Ancestry Requirements

- `ancestry === "elf"` - Is an elf
- `ancestry === "dwarf"` - Is a dwarf
- `ancestry === "halfling"` - Is a halfling
- `ancestry === "human"` - Is a human
- `ancestry.includes("goblin")` - Name includes "goblin" (for variations)

## Class Requirements

- `charClass === "fighter"` - Is a fighter
- `charClass === "wizard"` - Is a wizard
- `charClass === "cleric"` - Is a cleric
- `charClass === "thief"` - Is a thief
- `charClass.includes("ranger")` - Class name includes "ranger" (for variations)

## Background Requirements

- `background === "urchin"` - Urchin background
- `background === "merchant"` - Merchant background
- `background.includes("soldier")` - Background includes "soldier"

## Alignment Requirements

- `alignment === "lawful"` - Lawful alignment
- `alignment === "neutral"` - Neutral alignment
- `alignment === "chaotic"` - Chaotic alignment

## Item Ownership Requirements

- `actor.items.some(i => i.name === "Sword of Light")` - Has "Sword of Light"
- `actor.items.some(i => i.name.includes("Sword"))` - Has any item with "Sword" in name
- `actor.items.some(i => i.type === "Weapon" && i.name.includes("Magic"))` - Has magic weapon
- `actor.items.some(i => i.type === "Armor" && i.system.equipped)` - Has equipped armor
- `actor.items.filter(i => i.type === "Spell").length >= 3` - Has 3 or more spells

## Combined Requirements (AND/OR)

- `level >= 5 && abilities.str.mod >= 2` - Level 5+ AND Str +2+
- `attributes.str.value >= 16 || attributes.dex.value >= 16` - Str 16+ OR Dex 16+
- `level > 3 && charClass === "wizard"` - Level 3+ wizard
- `actor.items.some(i => i.name === "Holy Symbol") && charClass === "cleric"` - Cleric with holy symbol
- `ancestry === "elf" && abilities.int.mod > 0` - Elf with positive Int modifier
- `alignment === "lawful" && charClass === "cleric"` - Lawful cleric

## Token Requirements (if token exists)

- `token?.elevation > 0` - Token is elevated
- `token?.disposition === 1` - Friendly token

---

## Available Variables

`actor`, `token`, `level`, `attributes`, `abilities`, `ancestry`, `charClass`, `background`, `alignment`

**Note:** `ancestry`, `charClass`, `background`, and `alignment` are automatically resolved from Compendium UUIDs to lowercase names (e.g., "wizard", "elf", "chaotic").
