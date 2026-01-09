# Shadowdark Extras - Release Notes

## [4.16] - 2026-01-09

### New Features
- **Coating Poison for Potions**: New potion sheet activity that coats weapons with poison damage
    - Enable coating poison on any potion via the Activity tab
    - Configure damage formula (Basic dice, custom Formula, or Tiered by level)
    - Uses the potion on a target to show weapon selection dialog
    - Filters out weapons that already have poison damage
    - Adds permanent poison damage bonus to the selected weapon
    - Includes Examples & Reference section with formula documentation
- **Potion Image Picker**: Fixed potion sheet image editing - clicking the potion image now opens FilePicker
- Added **Resistance/Immunity to Non-Magical Weapons** predefined effects
    - `resistanceNonMagic` - Halves physical damage (bludgeoning, slashing, piercing) from non-magical weapons
    - `immunityNonMagic` - Negates physical damage from non-magical weapons entirely
    - Magical weapons (items with `magicItem: true`) bypass this resistance/immunity
    - Works with the damage card system for automatic damage calculation
- Added **Light Toggle Active Styling**: Light sources now display with an orange glow effect when active in the player sheet inventory
- **Redesigned Potion Item Sheet (AppV2)**: Completely rebuilt potion sheets using Foundry's modern ApplicationV2 framework
    - Modern dark-themed design with clean tab navigation
    - **Consolidated Details Tab**: Cost, Slots, Source, and Identification settings all in one place (removed separate Source tab)
    - **Activity Tab**: Full support for damage/healing, effects, duration tracking, summoning, item give, and macros
    - **Drag-and-Drop Effects**: Drop Effect/Condition items directly onto the sheet to configure what happens when the potion is used
    - **Description Tab**: Rich text editor with separate unidentified description support
    - **Effects Tab**: View and manage active effects on the potion

### Bug Fixes
- Fixed **Potion Activity Tab Missing**: The Activity tab was not appearing on Potion item sheets due to a missing variable declaration (`itemMacroFlags`)

## [4.15] - 2026-01-08

### Bug Fixes
- Spell fix: Bogboil

### New Features
- **Token Toolbar HUD**: A new floating toolbar that displays when you control a token.
    - Shows character name, level badge, AC, Luck (with pulp mode support), and HP bar.
    - **Editable HP**: Click the HP value and type a new number, or use +X/-X to add/subtract.
    - **Active Effects Icons**: Displays both Foundry ActiveEffects and Shadowdark condition items as icons with tooltips.
    - **Equipped Items Icons**: Shows currently equipped weapons/armor as icons. Click weapons to roll attacks.
    - **Right-click to remove**: Right-click any effect icon to delete it from the actor.
    - **Draggable**: Drag the portrait to reposition. Double-click portrait to reset position. Position persists across sessions.
    - **Settings**: Enable/disable, visibility (GM/Players/Both), combat-only mode, show effects, show equipped items.
- **Visual Sheet Editor**: Replaced the previous dropdown settings with a new visual configuration tool for character sheets.
    - Real-time preview of all aesthetic changes.
    - Gallery search for border and panel styles.
    - **Sheet Frame Tweaking**: Customize the transparency border thickness, border image width, and slice.
    - **Box Border Customization**: Add and customize decorative frames for Ability and Details tab boxes.
- Removed legacy "Header Customization" font settings in favor of more robust framing options.

- **Dynamic DC for Spell Template Saving Throws**: Template saving throws now support dynamic formulas that reference caster properties.
    - Use `@caster.spellcastingCheck` to set DC equal to the spellcasting check result
    - Supports complex formulas like `@caster.spellcastingCheck + 2` or `10 + @caster.int`
    - **Available Caster Properties**:
        - `@caster.spellcastingCheck` - Total spellcasting check result
        - `@caster.level` - Caster's character level
        - `@caster.str`, `@caster.dex`, `@caster.con`, `@caster.int`, `@caster.wis`, `@caster.cha` - Ability modifiers
    - **Formula Examples**:
        - `@caster.spellcastingCheck` - Use exact spellcasting check total
        - `@caster.spellcastingCheck + 2` - Spellcasting check with +2 bonus
        - `10 + @caster.int` - Standard DC 10 + Intelligence modifier
        - `8 + @caster.level` - Level-scaled DC
        - `@caster.spellcastingCheck + floor(@caster.level / 2)` - Complex scaling
    - **Note**: The `@caster.` prefix is optional; you can use `@spellcastingCheck` instead
    - Works in both auto-apply and interactive (manual) damage modes
    - Spell templates can now have saving throws without damage (save-only effects)

### Bug Fixes
- Fixed gallery image cropping in the Sheet Editor for a cleaner visual experience.

## [4.14] - 2026-01-07

### New Features
- Added generic spell modification system with `registerSpellModification()` API - spells that modify items auto-revert when spell ends
- Added global settings for customizable player sheet aesthetics (borders, ability panels, AC panel, and stat panels) with dynamic updating
- Integrated "Cleansing Weapon" spell support with conditional damage scaling (1d4 regular, 1d6 vs Undead) and automatic duration cleanup
- Added Ctrl+click on actor portrait to open ImagePopout viewer with "Show to Players" functionality

### Bug Fixes
- Fixed damage card appearing on initiative rolls - now correctly excluded from damage application UI
- Fixed level-up animation duplicating when multiple players are connected - now only one client creates the animation
- Fixed focus spells with per-turn damage incorrectly damaging the caster in addition to the target
- Acid Arrow from compendium fixed
- Fixed Blind/Deafen, applying both conditions, now it goes back to prompting

