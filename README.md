# Shadowdark Extras

If you enjoy what I do, consider supporting me on Ko-fi! Every little bit means the world! https://ko-fi.com/kaleth

[![Ask for feature / report bug](https://img.shields.io/badge/Ask_for_feature_/_report_bug-Join_Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/ZBtQ9ub7Mn)

<img width="3584" height="1184" alt="Gemini_Generated_Image_tiknyftiknyftikn" src="https://github.com/user-attachments/assets/173d6548-314e-42a6-9e8c-cbd2ca2a4150" />



Join my new discord server to have discussions about the module, ask for fixes, new features, and hopefully create a small community driven server where we can share material like Items, macros and automations for Sdx.

A comprehensive enhancement module for [Shadowdark RPG](https://www.thearcanelibrary.com/pages/shadowdark) in [Foundry VTT](https://foundryvtt.com/). This module adds quality-of-life features, automation, visual enhancements, and expanded gameplay options to elevate your Shadowdark experience. Most of the features can be turned on/off, while others are embedded. **This module was made the improve my own games based on my own taste**. If you would like the request a feature, open a issue enhancement/feature ticket. 

![Foundry VTT](https://img.shields.io/badge/Foundry-v13+-informational)
![Shadowdark](https://img.shields.io/badge/System-Shadowdark-purple)

---

## 📦 Installation

1. In Foundry VTT, go to **Add-on Modules** → **Install Module**
2. Paste the manifest URL: `https://github.com/gmdima/shadowdark-extras/releases/latest/download/module.json`
3. Click **Install**
4. Enable the module in your world's module settings

### Dependencies
- **Shadowdark System** (required)
- **socketlib** (required) - For multiplayer functionality
- **Sequencer** (optional) - For torch and level-up animations
- **JB2A** (optional) - Animation assets for visual effects
- **Automated Animations** (optional) - For attack/spell animations
- **TokenMagic FX** (optional) - For template effects
- **Item Macro** (required)

---

## ✨ Features

### ⚔️ Combat & Damage System

#### Enhanced Damage Cards
Adds a powerful damage application interface to chat messages with:
- **Target Selection** - Apply damage to targeted or selected tokens
- **Damage Multipliers** - Quick buttons for ×0, ½, 1, 2× damage (resistance/vulnerability)
- **Auto-Apply Damage** - Optionally apply damage automatically on successful attacks
- **Scrolling Combat Text** - Floating damage/healing numbers on tokens
- **Weapon Range Checking** - Warn or prevent attacks on out-of-range targets

#### Weapon Bonuses System
A **Bonuses** tab on weapon items provides granular control over weapon behavior:

##### To Hit Bonuses
- Add flat bonuses or formulas (`2`, `@abilities.dex.mod`)
- Conditional requirements (target name, ancestry, creature type, HP %, conditions)
- Operators: equals, contains, starts with, does not equal, etc.
- **Exclusive** option - if requirements met, only this bonus applies
- **Prompt** option - show in attack roll dialog for optional activation

##### Damage Bonuses
- Add bonus damage with optional damage types
- Same requirement system as to-hit bonuses
- Per-bonus damage type (fire, cold, radiant, etc.) for resistance processing

##### Critical Hit Bonuses
- Extra critical hit dice
- Extra critical damage formulas

##### Effects on Hit
- Drag & drop effects/conditions to apply when the weapon hits
- Applied automatically on successful attacks

##### Item Macro Integration
Execute Item Macro scripts with triggers:
- Before attack, on hit, on critical, on miss, on critical miss
- On equip/unequip events
- Run as GM option for elevated permissions


#### Focus Spell Tracker
Track concentration-style spells with:
- Visual tracker on character sheets
- Automatic effect cleanup when focus is lost
- Duration spell support with per-turn damage/healing

#### Ammunition per user
- Actors can choose ammunition custom made that are present on their sheet. 

#### Spell Activity System
A comprehensive spell configuration system accessed via the **Activity** tab on spell items. Configure every aspect of how spells behave:

##### Targeting
Choose between:
- **Targeted Tokens** - Use the standard targeting system
- **Template Targeting** - Place measured templates on cast with:
  - Multiple shapes (circle, cone, ray, rectangle)
  - Configurable size and placement mode
  - Auto-delete options (end of turn, after X rounds, after X seconds)
  - TokenMagic FX integration (textures, opacity, special effects)
  - Template Effects that trigger damage/conditions when tokens enter or start/end turns

##### Aura Effects
Create persistent auras around the caster or target:
- Configurable radius and disposition (allies/enemies/all)
- Flexible triggers: on enter, on leave, turn start/end (source or target)
- Per-trigger damage with saving throws
- Apply conditions/effects to tokens in range
- Sequencer animations with customizable tint, scale, and opacity
- TokenMagic token filters for affected tokens
- Line of sight checking option

##### Damage/Healing
Three formula modes:
- **Basic** - Simple dice + bonus with optional level scaling
- **Formula** - Custom formulas with variables (`@level`, `@int`, `@target.hp`, etc.)
- **Tiered** - Level-based tiers (e.g., `1-3:1d6, 4-6:2d8, 7+:3d10`)

Additional options:
- Damage type selection (fire, cold, lightning, healing, etc.)
- Requirement formulas for conditional damage
- Critical multipliers

##### Effects/Conditions
- Drag & drop effects from compendiums
- Separate normal and critical effect slots
- Apply to target or self
- Selection modes: All, Random, or Prompt
- Effect requirement formulas

##### Duration Tracking
For spells with ongoing effects:
- Track in the Duration Tracker UI
- Per-turn damage formulas
- Trigger on turn start or end
- Reapply effects each turn

##### Summoning
Spawn creatures when the spell is cast:
- Multiple summon profiles per spell
- Actor UUID from compendium
- Quantity and placement options
- Auto-delete at spell expiry

##### Item Giving
Grant items to the caster on successful cast (e.g., conjured weapons).

##### Alignment for Spells

##### Item Macro Integration
Execute Item Macro scripts with configurable triggers:
- On cast, on success, on critical, on failure, on critical failure
- Run as GM option for elevated permissions
- Full access to spell data, targets, and roll results

---


### 🎭 Character Sheet Enhancements

#### Enhanced Header
Replace the default header with an interactive display showing:
- HP bar with current/max values
- Armor Class display
- Ability score modifiers
- Luck tracker
- XP progress and level
- Custom background image/video support


#### HP Wave Animation
Animated wave overlay on character portraits that responds to HP levels - watch the "blood" rise and fall as characters take damage or heal.


#### Quick Conditions
Toggle conditions directly from the character sheet with themed buttons:
- Multiple visual themes (Shadowdark, Parchment, Stone, Leather, Iron, Blood, etc.)
- Works for both PCs and NPCs


#### Renown Tracking
Track faction reputation or fame with a configurable Renown stat on character sheets.

#### Journal Notes
Replace the simple Notes tab with a multi-page journal system:
- **Multiple Pages** - Create separate pages for backstory, session notes, goals, etc.
- **Page Sidebar** - Quick navigation between journal pages
- **Rich Text Editor** - Full formatting with quick-insert buttons (Info, Warning, Quest, Loot, NPC)
- **Add Page Button** - Easily create new journal entries

#### Add Coins Button
Quick button to add or remove coins without opening dialogs.

---

### 📦 Inventory System

#### Container System
Use items as containers with:
- Nested storage (bags within bags)
- Per-container coin storage
- Automatic slot calculation
- Visual nesting in inventory


#### Trading System
Player-to-player trading with:
- Item and coin transfers
- Trade request prompts via socketlib
- Works across different player clients

#### Unidentified Items
Mark items as unidentified to hide their true name and description from players until identified.

#### Multi-Select & Bulk Delete
Shift+Click and Ctrl+Click to select multiple items for quick bulk deletion.

#### Inventory Styling
Customize item appearance in inventory lists based on:
- Item type
- Magical status
- Rarity
- Custom CSS rules

---

### 🍺 Carousing System

Full carousing downtime implementation with two modes:

#### Original Mode
Simple d8-based carousing with customizable outcome tables.

#### Expanded Mode
Advanced carousing with:
- Tier-based spending (copper to platinum)
- d8 outcome roll + d100 benefit/mishap tables
- Fully customizable tables via built-in editor
- GM-only mishap descriptions option


---

### 🐉 NPC Features

#### NPC Inventory Tab
Full inventory management for NPCs including items and coins.

#### Creature Types
Assign creature types to NPCs (Beast, Undead, Dragon, Humanoid, etc.) for:
- Weapon bonus targeting (e.g., "+2 damage vs Dragons")
- Quick reference during combat
- Customizable type list


---

### ✨ Visual & Animation

#### Torch Animations
Animated flame effects on tokens when light sources are active. Requires Sequencer and JB2A.


#### Level Up Indicator
Glowing arrow animation on tokens when a character has enough XP to level up.

#### Automated Animations Integration
Custom integration with the Automated Animations module to:
- Play animations only on successful attacks/spells
- Animate utility spells without targets

#### Weapon Animation on Token
Display weapon and shield images directly on tokens when equipped:
- **Bundled Image Library** - 780+ weapon and shield images organized by category (swords, axes, bows, shields, etc.)
- **Visual Image Picker** - Collapsible categories with thumbnail grid, search, and preview
- **Positioning Controls** - Offset X/Y, scale, rotation, and anchor point
- **PIXI Filters** - Apply visual effects like glow, outline, drop shadow, bevel, and more
- **Auto-show on Attack** - Optionally display weapon only during attacks

---




---

### 📚 Easy Reference

A dropdown menu integrated into Foundry's ProseMirror text editor for quickly inserting enriched content:

#### NPC Cards
- **Stat Card** - Insert `@DisplayNpcCard[uuid]{name}` to show compact NPC stat blocks
- **Detailed Card** - Insert `@DisplayNpcCardDetailed[uuid]{name}` for full NPC information

#### Item Cards
- Insert `@DisplayItemCard[uuid]{name}` to embed interactive item cards

#### Rollable Tables
- Insert `@DisplayTable[uuid]{name}` to embed rollable tables directly in journals

#### Ability Checks
- **Custom Check Dialog** - Configure DC, ability, and type (check vs request)
- **Quick Inserts** - Per-ability shortcuts for STR, DEX, CON, INT, WIS, CHA
- Outputs `[[check DC stat]]` or `[[request DC stat]]` enriched links

#### Dice Rolls
- **Custom Dice Dialog** - Enter any dice formula (e.g., `2d6+3`)
- **Quick Dice** - One-click inserts for d4, d6, d8, d10, d12, d20
- Outputs `[[/r formula]]` enriched roll links

Each category can be individually enabled/disabled in module settings.


---

### 🛡️ Effects & Conditions

#### Damage Type System
Full resistance/immunity/vulnerability support for damage types:
- Physical (bludgeoning, slashing, piercing)
- Elemental (fire, cold, lightning, acid, poison, etc.)
- Per-damage-component processing

#### Predefined Effects
Built-in effect library including:
- Advantage/disadvantage on specific abilities
- Spell advantage
- Glassbones (double damage taken)
- Custom condition creation

---

## ⚙️ Configuration

All features can be individually enabled/disabled in module settings. Settings are organized into logical groups:

- **Configuration Menus** - Combat, Effects, HP Waves, Inventory Styles, Carousing, Creature Types

- **Combat & Spells** - Focus tracker, spell enhancement, wand tracking
- **Character Sheet** - Enhanced header, renown, journal, conditions
- **Inventory** - Containers, trading, unidentified items
- **Carousing** - Mode selection, visibility options
- **NPC Features** - Inventory, creature types
- **Visual & Animation** - Torch effects, level-up indicator, Easy Reference options

---

## 🤝 Compatibility

- **Foundry VTT**: v12+
- **Shadowdark System**: Latest version
- Tested with popular modules including Dice So Nice, Token Action HUD, SD crawler helper

---

## 📝 License

This module is provided under the MIT License.

---

## 🙏 Credits

- [Shadowdark RPG](https://www.thearcanelibrary.com/pages/shadowdark) by The Arcane Library
- [Foundry VTT Shadowdark System](https://github.com/Muttley/foundryvtt-shadowdark)
- Icons from [Font Awesome](https://fontawesome.com/)
- Tom inspired by Exalted Scenes by wands and widgets
- Overlays by Pixelbay
- All fonts licences included in the fonts folders
- Dungeon Mapper and Hexmapper inspired by Hexlands and Instant Dungeons (agnostic procedural dungeon and hex crawling map generators for foundry) by [The Augur](https://www.patreon.com/cw/TheAugur)

---

## 📬 Support & Feedback

- **Issues**: [GitHub Issues](https://github.com/gmdima/shadowdark-extras/issues)
- **Discord**: Find me on the Shadowdark or Foundry VTT Discord servers



some Hexes tiles and POI are from https://2minutetabletop.com/product/world-map-hex-tiles/ licensed under CC by-nc 4.0
some b&w poi assets from https://cartographyassets.com/assets/6626/gogotsmaps-black-and-white-assets/ under cal_by_nc licence.
Dyson style dungeon assets from Thomas Seliger
https://github.com/neovatar/dungeondraft-dysonesque

