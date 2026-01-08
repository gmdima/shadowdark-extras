# Shadowdark Extras - Release Notes

## [4.15] - 2026-01-08

### New Features
- **Visual Sheet Editor**: Replaced the previous dropdown settings with a new visual configuration tool for character sheets.
    - Real-time preview of all aesthetic changes.
    - Gallery search for border and panel styles.
    - **Sheet Frame Tweaking**: Customize the transparency border thickness, border image width, and slice.
    - **Box Border Customization**: Add and customize decorative frames for Ability and Details tab boxes.
- Removed legacy "Header Customization" font settings in favor of more robust framing options.

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

