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

---

# Spell Macro Technical Guide

This section covers how to write spell macros that work correctly when players cast spells targeting other players' characters, NPCs, or items they don't own.

## The Permission Problem

In Foundry VTT, players can only modify documents (Actors, Items, etc.) they have explicit permission to edit. When a player casts a spell on another player's character, they typically lack permission to:

- Modify the target's items (weapons, armor, effects)
- Update the target's actor data
- Remove effects when the spell ends

**Solution:** Use socketlib to route modifications through the GM, who has permission to modify all documents.

## Architecture Overview

```
Player Casts Spell
       │
       ▼
┌──────────────────┐
│  Spell Macro     │
│  (Item Macro)    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     Player owns target?
│  Dialog Function │ ──────────────────────────┐
│  (showXxxDialog) │                           │
└────────┬─────────┘                           │
         │                                     │
         │ No                                  │ Yes
         ▼                                     ▼
┌──────────────────┐               ┌──────────────────┐
│ socket.executeAs │               │ Direct Update    │
│ GM("applyXxxAs   │               │ item.update()    │
│ GM", ...)        │               └──────────────────┘
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ GM Client runs   │
│ applyXxxAsGM()   │
│ handler          │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ GM updates item  │
│ (has permission) │
└──────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `SpellMacrosSD.mjs` | Spell dialog functions and apply logic |
| `CombatSettingsSD.mjs` | Socket handler registration |
| `FocusSpellTrackerSD.mjs` | Duration/Focus spell tracking and reversion |
| `shadowdark-extras.mjs` | Additional socket handlers for macro execution |

## Socket Registration

Sockets are registered during the `socketlib.ready` hook in `CombatSettingsSD.mjs`:

```javascript
export function setupCombatSocket() {
    socketlibSocket = globalThis.socketlib.registerModule(MODULE_ID);
    
    // Register handlers
    socketlibSocket.register("applyHolyWeaponAsGM", async (data) => {
        // Handler runs on GM client
    });
}
```

The socket instance is exposed via:
```javascript
export function getSocket() {
    return socketlibSocket;
}
```

And attached to the module object in `shadowdark-extras.mjs`:
```javascript
const module = game.modules.get(MODULE_ID);
if (module) module.socket = macroExecuteSocket;
```

## Pattern 1: Spell Apply Functions

When a spell modifies an item the player doesn't own:

### Dialog Function (runs on player's client)
```javascript
export async function showHolyWeaponDialog(casterActor, casterItem, targetActor, targetToken) {
    // ... dialog rendering ...
    
    // When user confirms selection:
    await applyHolyWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken);
}
```

### Apply Function (checks permission, routes to GM if needed)
```javascript
export async function applyHolyWeapon(weapon, casterActor, casterItem, targetActor, targetToken) {
    const sdxModule = game.modules.get(MODULE_ID);
    
    // CHECK OWNERSHIP - Route to GM if player can't update
    if (!weapon.isOwner && !game.user.isGM) {
        if (sdxModule.socket) {
            await sdxModule.socket.executeAsGM(
                "applyHolyWeaponAsGM",
                weapon.uuid,           // Use UUIDs for cross-client resolution
                casterActor.uuid,
                casterItem.uuid,
                targetActor.uuid,
                targetToken?.document?.uuid
            );
            return;
        } else {
            ui.notifications.warn("Cannot apply effect: No GM connected.");
            return;
        }
    }
    
    // Player owns the item - update directly
    await weapon.update({ /* changes */ });
}
```

### GM Socket Handler (registered in CombatSettingsSD.mjs)
```javascript
socketlibSocket.register("applyHolyWeaponAsGM", async (weaponUuid, casterUuid, itemUuid, targetActorUuid, targetTokenUuid) => {
    // Resolve UUIDs to documents (fromUuid works across scenes)
    const weapon = await fromUuid(weaponUuid);
    const casterActor = await fromUuid(casterUuid);
    const casterItem = await fromUuid(itemUuid);
    const targetActor = await fromUuid(targetActorUuid);
    const targetTokenDoc = targetTokenUuid ? await fromUuid(targetTokenUuid) : null;
    const targetToken = targetTokenDoc?.object || null;

    if (weapon && casterActor && casterItem && targetActor) {
        const module = game.modules.get(MODULE_ID);
        if (module?.api?.applyHolyWeapon) {
            // Call the apply function - GM has permission now
            await module.api.applyHolyWeapon(weapon, casterActor, casterItem, targetActor, targetToken);
        }
    }
});
```

## Pattern 2: Routing Dialogs Back to Player

If a spell macro runs on GM's client (via `runAsGm`), dialogs would appear on GM's screen. To route them back to the player:

### Track Originating User
In the macro execution context, add `originatingUserId`:

```javascript
const serializedContext = {
    actorId: actor.id,
    itemId: spellItem.id,
    // ... other context ...
    originatingUserId: game.user.id  // Track who initiated
};
```

### Dialog Function with Routing
```javascript
export async function showHolyWeaponDialog(casterActor, casterItem, targetActor, targetToken, originatingUserId = null) {
    // Check if we need to route this dialog to the originating user
    if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.socket) {
            await sdxModule.socket.executeAsUser("showHolyWeaponDialogForUser", originatingUserId, {
                casterActorId: casterActor.id,
                casterItemId: casterItem.id,
                targetActorId: targetActor.id,
                targetTokenId: targetToken?.id
            });
            return;
        }
    }
    
    // Normal dialog rendering (on correct client)
    // ...
}
```

### Player-side Handler
```javascript
socketlibSocket.register("showHolyWeaponDialogForUser", async ({ casterActorId, casterItemId, targetActorId, targetTokenId }) => {
    const casterActor = game.actors.get(casterActorId);
    const casterItem = casterActor?.items.get(casterItemId);
    const targetActor = game.actors.get(targetActorId);
    const targetToken = targetTokenId ? canvas.tokens?.get(targetTokenId) : null;

    if (casterActor && casterItem && targetActor) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.api?.showHolyWeaponDialog) {
            await sdxModule.api.showHolyWeaponDialog(casterActor, casterItem, targetActor, targetToken);
        }
    }
});
```

## Pattern 3: Spell End/Reversion

When a duration spell ends, modifications must be reverted. The player who cast the spell may not own the target item:

### Reversion Function with GM Routing
```javascript
async function revertSpellModifications(spellId, casterId) {
    // Find items with modifications from this spell
    for (const actor of game.actors.contents) {
        const items = actor.items.filter(item => {
            const mods = item.getFlag(MODULE_ID, "spellModifications");
            return mods?.some(m => m.spellId === spellId && m.casterId === casterId);
        });

        for (const item of items) {
            const updates = { /* original values */ };
            
            // CHECK OWNERSHIP
            if (item.isOwner || game.user.isGM) {
                await item.update(updates);
            } else {
                const socket = getSocket();
                if (socket) {
                    await socket.executeAsGM("revertItemModificationAsGM", {
                        itemUuid: item.uuid,
                        updates: updates
                    });
                }
            }
        }
    }
}
```

### GM Handler for Reversion
```javascript
socketlibSocket.register("revertItemModificationAsGM", async ({ itemUuid, updates }) => {
    const item = await fromUuid(itemUuid);
    if (item) {
        await item.update(updates);
    }
});
```

## Socketlib Methods Reference

| Method | Use Case |
|--------|----------|
| `socket.executeAsGM("handler", data)` | Run on GM client (for permission) |
| `socket.executeAsUser("handler", userId, data)` | Run on specific user's client (for dialogs) |
| `socket.executeForUsers("handler", [userIds], data)` | Run on multiple users' clients |
| `socket.executeForEveryone("handler", data)` | Run on all connected clients |

## UUID Resolution

Always use UUIDs when passing document references through sockets:

```javascript
// Sending
const data = {
    itemUuid: item.uuid,      // "Actor.abc123.Item.def456"
    tokenUuid: token?.document?.uuid  // "Scene.xyz.Token.abc"
};

// Receiving
const item = await fromUuid(data.itemUuid);      // Returns Item document
const tokenDoc = await fromUuid(data.tokenUuid); // Returns TokenDocument
const token = tokenDoc?.object;                   // Get Placeable object
```

**Note:** For Items, `fromUuid` returns the Item document directly. For Tokens, it returns the TokenDocument - use `.object` to get the Placeable.

## Item Macro Scope Variables

When using Item Macro with `runAsGm`, the following variables are available in the scope:

| Variable | Type | Description |
|----------|------|-------------|
| `actor` | Actor | The caster actor |
| `token` | Token | The caster's token (if available) |
| `item` | Item | The spell/scroll/potion being used |
| `targets` | Array | Player's targeted tokens |
| `target` | Token | First target token |
| `targetActor` | Actor | First target's actor |
| `originatingUserId` | string | ID of the player who initiated (for routing) |
| `isSuccess` | boolean | Whether spell roll succeeded |
| `isCritical` | boolean | Critical success |
| `rollResult` | number | Roll total |

## Macro Template for Targeted Spells

```javascript
/* Spell Name Macro */
// Get target from scope (for runAsGm) or current user's targets
const targetToken = (typeof target !== "undefined" && target) 
    ? target 
    : Array.from(game.user.targets)[0];

if (!targetToken) { 
    ui.notifications.warn("You must target a creature!"); 
    return; 
}

const sdxModule = game.modules.get("shadowdark-extras");
if (sdxModule?.api?.showSpellDialog) {
    // Pass originatingUserId for dialog routing if running as GM
    const userId = (typeof originatingUserId !== "undefined") ? originatingUserId : undefined;
    await sdxModule.api.showSpellDialog(actor, item, targetToken.actor, targetToken, userId);
} else {
    ui.notifications.error("Shadowdark Extras API not ready.");
}
```

## Best Practices

1. **Always check ownership** before modifying documents:
   ```javascript
   if (item.isOwner || game.user.isGM) { /* direct update */ }
   else { /* route through GM */ }
   ```

2. **Use UUIDs** for cross-client document references, not IDs.

3. **Keep `runAsGm` OFF** for spell macros with dialogs unless necessary. The apply functions already handle permission routing.

4. **Register spell modifications** using `registerSpellModification()` so they can be properly reverted when the spell ends.

5. **Test with multiple users** - always test spell macros with GM and player on different clients to verify routing works correctly.

---

# Travel & Camping Feature Technical Guide

## Overview
The **Travel Tab** for the Shadowdark Party Sheet provides a structured way to assign party members to camping tasks, set difficulty classes (DC), and execute rolls (optionally using SDX Rolls animation).

## Data Structure (Storage)
All state is stored on the **Party Actor** as flags under the `shadowdark-extras` scope.

| Flag Name | Type | Description |
| :--- | :--- | :--- |
| `travelAssignments` | `Object` | Maps `taskKey` to an array of `memberId`s (e.g. `{ "cook": ["id1", "id2"] }`). |
| `travelDCs` | `Object` | Maps `taskKey` to a `Number` (default 12). |
| `travelSelections` | `Object` | Maps `taskKey` -> `memberId` to the index of the selected ability (0 or 1). |
| `travelUseSDXRolls` | `Boolean` | Toggles whether to use the SDX Rolls rolling interface. |

## Technical Workflow

### Assignment (Drag & Drop)
1. **Source**: Members can be dragged from the "Members" list OR from another camping task.
2. **Selector**: Targets `.member` or `.sdx-task-member` with `data-uuid`.
3. **Handler**: `_onDrop` in `PartySheetSD.mjs` identifies the `.sdx-camping-task` target.
4. **Move Logic**: `_assignMemberToTask` automatically searches all other tasks and removes the actor before adding them to the new one to ensure single-task assignment.

### Ability Selection
- Tasks like **Cook** (INT/WIS) support two abilities.
- **Right-Click**: Players can right-click their character in the task list to cycle between the available abilities. 
- **Storage**: This updates `travelSelections[taskKey][memberId]`.

### Execution (Rolling)
- **Initiation**: Clicking the **Header** of a task card triggers `_onRollTravelTask`.
- **Logic Path**:
  - **SDX Enabled**: 
    - Groups actors by their selected ability.
    - Calls `ui.SdxRollsSD.requestRoll` with custom `bannerImage`.
    - Passes `contestants: []` and `contest: false` to comply with the SDX API.
  - **SDX Disabled**:
    - Iterates through assigned actors and calls `actor.rollAbility(abilityId)`.
    - Handles lowercase conversion (e.g., "int" instead of "INT") for system compatibility.

## UI & Styling
- **Visibility**: DCs are hidden from players (`{{#if ../isGM}}` in `party.hbs`).
- **Resizing**: The grid uses `align-items: start` and `height: auto` behaviors to allow the main party sheet scrollbar to handle overflow, preventing clipped content.
- **Theme**: Uses standard Shadowdark "SD-box" styling for consistency.

## Assets & Banners
Custom banners are located in `modules/shadowdark-extras/assets/travel/`. They are requested by `SdxRollSD` via a patched `prepareData` method that allows overriding the default banner image per-roll.

**Available Banners:**
- `batten_down.png`
- `cook.png`
- `craft.png`
- `entertain.png`
- `firewood.png`
- `hunt.png`

*(Note: "Keep Watch" and "Predict" currently use system defaults).*

## Maintenance / Files
- **Logic**: `scripts/PartySheetSD.mjs`
- **Template**: `templates/party.hbs`
- **Styles**: `styles/travel-tab.css`
- **Patches**: `scripts/sdx-rolls/SdxRollSD.mjs` (for banner override).

