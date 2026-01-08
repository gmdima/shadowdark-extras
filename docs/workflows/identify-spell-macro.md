---
description: How to use the Identify spell macro API for unidentified items
---

# Identify Spell Macro System

The module provides an API for implementing the Identify spell to reveal unidentified items.

## Key Functions (exposed via `game.modules.get("shadowdark-extras").api`)

1. **`isUnidentified(item)`** - Check if an item has the unidentified flag
2. **`getUnidentifiedName(item)`** - Get the masked display name
3. **`showIdentifyDialog(targetActor, items, spellItem)`** - Show selection dialog
4. **`identifyItem(item, spellItem)`** - Remove unidentified flags and show reveal

## Item Macro Code for Identify Spell

```javascript
// Get target or self
const targets = game.user.targets;
const targetActor = targets.size > 0 
    ? targets.first().actor 
    : item.actor;

// Get module API
const sdxModule = game.modules.get("shadowdark-extras");

// Find unidentified items
const unidentifiedItems = targetActor.items.filter(i => 
    sdxModule.api.isUnidentified(i)
);

if (unidentifiedItems.length === 0) {
    ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.identify.noItems"));
    return;
}

// Show selection dialog
await sdxModule.api.showIdentifyDialog(targetActor, unidentifiedItems, item);
```

## Marking Items as Unidentified

```javascript
// Set an item as unidentified with optional custom name
await item.setFlag("shadowdark-extras", "unidentified", true);
await item.setFlag("shadowdark-extras", "unidentifiedName", "A Strange Blade");
```

## Key Files
- `scripts/SpellMacrosSD.mjs` - Contains all Identify spell API functions
- `styles/shadowdark-extras.css` - CSS classes `.sdx-identify-*` for dialogs
