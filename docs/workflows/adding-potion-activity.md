---
description: How to add a new potion activity feature (like Coating Poison)
---

# Adding a New Potion Activity Feature

This workflow documents how to add a new activity feature to the potion sheet, similar to Coating Poison, Summoning, or Item Give.

## 1. Add Template Section in activity.hbs

Location: `templates/potion-sheet/activity.hbs`

Add a new `<details class="potion-details-group">` section with:
- Summary with icon and title
- Fieldset with legend containing enable checkbox
- Section content with formula/configuration inputs
- Optional Examples section at bottom

```handlebars
{{!-- New Feature Group --}}
<details class="potion-details-group" open>
    <summary><i class="fas fa-icon"></i> Feature Name</summary>
    <fieldset class="potion-fieldset collapsible-section">
        <legend>
            <label class="toggle-label">
                <input type="checkbox" name="flags.shadowdark-extras.featureName.enabled" 
                    class="section-toggle" {{#if sdxFlags.featureName.enabled}}checked{{/if}} />
                <i class="fas fa-plus-circle"></i> Enable Feature
            </label>
        </legend>
        <div class="section-content" {{#unless sdxFlags.featureName.enabled}}style="display: none"{{/unless}}>
            <!-- Feature configuration inputs here -->
        </div>
    </fieldset>
</details>
```

## 2. Add Flags in PotionSheetSD.mjs

Location: `scripts/PotionSheetSD.mjs`

### Add to `_getSDXFlags()` method:
```javascript
// Feature Name
featureName: {
    enabled: flags.featureName?.enabled ?? false,
    // ... other config properties with defaults
}
```

### Add event handlers in `_onRender()` if needed:
```javascript
// Setup feature-specific handlers
this._setupFeatureHandlers(html);
```

## 3. Store Config in preCreateChatMessage Hook

Location: `scripts/shadowdark-extras.mjs` (around line 12990)

Add after other config storage:
```javascript
// Store featureName config if it exists
if (item.flags?.[MODULE_ID]?.featureName) {
    itemConfig.featureName = foundry.utils.duplicate(item.flags[MODULE_ID].featureName);
}
```

## 4. Add Processing Logic in CombatSettingsSD.mjs

### Add message tracking set (around line 1070):
```javascript
const _featureNameMessages = new Set();
```

### Add to storedConfig restoration (around line 1430):
```javascript
featureName: storedConfig.featureName
```

### Add processing block in injectDamageCard (after itemGive processing):
```javascript
const featureConfig = item?.flags?.[MODULE_ID]?.featureName;
if (featureConfig?.enabled && itemType === "Potion") {
    if (message.author.id !== game.user.id) {
        // Don't process for other users
    } else if (_featureNameMessages.has(message.id)) {
        // Already processed
    } else {
        _featureNameMessages.add(message.id);
        await processFeature(casterActor, targetActor, featureConfig, item.name);
    }
}
```

### Add the processing function (after giveItemsToCaster):
```javascript
async function processFeature(casterActor, targetActor, config, potionName) {
    // Implementation...
}
```

## 5. Test the Feature

1. Open a potion item sheet
2. Go to Activity tab
3. Enable the new feature and configure it
4. Use the potion in game
5. Verify the feature triggers correctly

## Key Files Modified

| File | Changes |
|------|---------|
| `templates/potion-sheet/activity.hbs` | Add UI section |
| `scripts/PotionSheetSD.mjs` | Add flags and handlers |
| `scripts/shadowdark-extras.mjs` | Store config in chat message |
| `scripts/CombatSettingsSD.mjs` | Process feature on potion use |

## Reference: Coating Poison Implementation

The Coating Poison feature adds permanent weapon damage bonuses:
- Uses `weaponBonus.damageBonuses` array structure
- Shows weapon selection dialog (filters weapons with existing poison)
- Evaluates formula based on caster level (basic/formula/tiered)
- Creates chat message confirming the coating
