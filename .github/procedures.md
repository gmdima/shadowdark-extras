# Mysterious Casting Implementation Procedures

## Overview
The mysterious casting feature allows Game Masters (GMs) to mask NPC item rolls (attacks, special attacks, features, and spells) in chat messages, displaying them as "Unknown attack" or "Unknown Spell" instead of revealing the actual item names. This enhances gameplay by maintaining mystery during encounters. The system uses a toggle-based approach in the NPC sheet header to avoid conflicts with fast-roll shortcuts (Ctrl/Shift/Alt modifiers).

## Key Components
- **Primary File**: `MysteriousCasting.mjs` - Contains the core logic for toggle injection, state management, and chat message modification.
- **Styling**: `mysterious-casting.css` - Styles the toggle icon in the NPC sheet header.
- **Module Configuration**: `module.json` - Registers the CSS file for loading.
- **Hooks Used**:
  - `renderNpcSheetSD`: Injects the toggle HTML into the NPC sheet header and attaches click handlers.
  - `preCreateChatMessage`: Intercepts chat message creation to modify content when mysterious mode is active.

## State Management
Mysterious mode is tracked using an in-memory `Set` object (`mysteriousActors`) keyed by the base actor ID. This approach:
- Avoids persistence issues across sessions (state resets on reload).
- Handles token actors correctly by resolving to the base actor ID using `getBaseActorId(actor)`.
- Prevents mismatches between token and base actor flags.

```javascript
// In MysteriousCasting.mjs
let mysteriousActors = new Set();
```

## Toggle Implementation
### Injection Process
1. The `renderNpcSheetSD` hook fires when an NPC sheet is rendered.
2. If the current user is a GM, the hook injects a toggle icon into the `.SD-header` element.
3. The toggle is an `<i>` element with classes `fas fa-eye-slash` (FontAwesome icon) and `sdx-mysterious-toggle`.
4. Initial state is determined by checking if the base actor ID is in `mysteriousActors`.

### HTML Injection
```javascript
// In renderNpcSheetSD hook
const header = html.find('.SD-header');
if (header.length && game.user.isGM) {
    const baseId = getBaseActorId(sheet.actor);
    const isActive = mysteriousActors.has(baseId);
    const toggleHtml = `<i class="fas fa-eye-slash sdx-mysterious-toggle ${isActive ? 'active' : ''}" title="Toggle Mysterious Casting"></i>`;
    header.append(toggleHtml);
}
```

### Click Handler
- Attached to the injected toggle element.
- Toggles the actor's mysterious state by adding/removing the base actor ID from `mysteriousActors`.
- Updates the visual state by adding/removing the `active` class.
- No persistence; state is lost on reload.

```javascript
// In renderNpcSheetSD hook
html.on('click', '.sdx-mysterious-toggle', (event) => {
    event.preventDefault();
    const baseId = getBaseActorId(sheet.actor);
    if (mysteriousActors.has(baseId)) {
        mysteriousActors.delete(baseId);
        $(event.currentTarget).removeClass('active');
    } else {
        mysteriousActors.add(baseId);
        $(event.currentTarget).addClass('active');
    }
});
```

## Chat Message Masking
### Hook Implementation
The `preCreateChatMessage` hook intercepts chat message creation before rendering.

1. Checks if the message is from an NPC actor in mysterious mode.
2. Parses the message content for specific template classes.
3. Replaces item names with generic labels based on the template type.

### Content Modification Logic
- **Target Templates**: Messages with classes `item-card`, `card-attack-roll`, or `card-spell-roll`.
- **Exclusion**: Messages with class `card-ability-roll` (ability checks) are not masked to allow normal rolls.
- **Replacement Rules**:
  - Attack rolls: Replace flavor text with "Unknown attack"
  - Spell rolls: Replace flavor text with "Unknown Spell"
  - Item cards: Replace item name in content with "Unknown Item"

```javascript
// In preCreateChatMessage hook
if (actor && actor.type === 'npc' && mysteriousActors.has(getBaseActorId(actor))) {
    const content = messageDoc.content;
    if (content.includes('item-card')) {
        if (content.includes('card-ability-roll')) {
            // Skip ability checks
            return;
        }
        if (content.includes('card-attack-roll')) {
            messageDoc.flavor = 'Unknown attack';
        } else if (content.includes('card-spell-roll')) {
            messageDoc.flavor = 'Unknown Spell';
        }
        // Additional content replacements for item names
        messageDoc.content = content.replace(/<h3[^>]*>(.*?)<\/h3>/g, '<h3>Unknown Item</h3>');
    }
}
```

### Foundry V13 Compatibility
- Chat message content is accessed via `messageDoc.content` (direct property).
- Previous versions used `data.content`, but V13 changed the hook signature.

## Styling
### CSS Classes
- `.sdx-mysterious-toggle`: Base styling for the toggle icon.
  - Positioned absolutely in the top-right of `.SD-header`.
  - Opacity transitions for smooth state changes.
  - Purple glow when active (`active` class).

```css
/* In mysterious-casting.css */
.SD-header {
    position: relative; /* Required for absolute positioning */
}

.sdx-mysterious-toggle {
    position: absolute;
    top: 10px;
    right: 10px;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.3s ease;
}

.sdx-mysterious-toggle:hover {
    opacity: 1;
}

.sdx-mysterious-toggle.active {
    opacity: 1;
    color: #8a2be2; /* Purple */
    text-shadow: 0 0 5px #8a2be2;
}
```

### Module Registration
The CSS file is registered in `module.json` under the `styles` array:
```json
{
    "styles": [
        "styles/mysterious-casting.css"
    ]
}
```

## Debugging and Testing
### Common Issues
- **Token vs. Base Actor Mismatch**: Ensure `getBaseActorId()` resolves correctly. Debug by logging actor IDs.
- **Hook Timing**: Verify hooks fire in the correct order. Use `console.log` in hook functions.
- **Content Parsing**: Test with various chat templates. Use browser dev tools to inspect message HTML.
- **State Persistence**: Remember state is in-memory only; reloads reset toggles.

### Debug Logging Example
```javascript
// Temporary debug in renderNpcSheetSD
console.log('Injecting toggle for actor:', sheet.actor.name, 'Base ID:', getBaseActorId(sheet.actor));

// In preCreateChatMessage
console.log('Processing message for actor:', actor?.name, 'Mysterious:', mysteriousActors.has(getBaseActorId(actor)));
```

## Limitations and Future Enhancements
- **No Persistence**: State resets on reload. Could be enhanced with world settings if needed.
- **GM-Only**: Toggle only visible to GMs.
- **Template Dependency**: Relies on specific CSS classes in Shadowdark templates.
- **Potential Enhancements**: Per-item masking, session persistence, or integration with other roll types.

## Deployment
1. Ensure `MysteriousCasting.mjs` is loaded via module hooks.
2. Update `module.json` to include the CSS file.
3. Test in Foundry V13 with Shadowdark system and NPC sheets.
4. Verify toggle appears in NPC sheet headers for GMs.
5. Test masking by rolling NPC items with toggle active.

---

# Hide Damage Roll on Failed Attack Procedure

## Overview
The Shadowdark base system always renders a "Damage Roll" section (`.card-damage-rolls`) in weapon attack chat cards, even when the attack roll is a failure. The `hideDamageCardOnFailedAttack` combat setting in shadowdark-extras already suppressed the SDX-injected damage card on failure, but it did not hide the base system's damage roll section — leaving a visible damage result on failed attacks that should show no damage information.

## Problem
- **Setting**: `combatSettings.hideDamageCardOnFailedAttack` (default: `false`).
- **Behavior before fix**: When enabled, the SDX damage card (with multipliers, apply button, targets) was correctly hidden on failed weapon attacks. However, the base Shadowdark chat card still contained a `<div class="card-damage-rolls">` with a full dice roll display (formula, dice tooltip, total), which was visible to all users.
- **Root cause**: The `injectDamageCard()` function detected the failed attack via `message.flags.shadowdark.success === false` and returned early, skipping SDX injection — but did not modify the existing HTML to hide the base system's damage section.

## Technical Details

### File
`CombatSettingsSD.mjs` — `injectDamageCard(message, html, data)` function.

### Chat Card HTML Structure (base Shadowdark system)
```html
<div class="shadowdark chat-card item-card" data-actor-id="..." data-item-id="...">
  <header class="card-header flexrow">
    <img src="..." data-tooltip="Weapon Name">
    <h3 class="item-name">Weapon Name</h3>
  </header>
  <div class="d20-roll card-attack-rolls">
    <div class="card-attack-roll blindable">
      <!-- Attack roll with dice formula, tooltip, and result -->
      <h4 class="dice-total failure">Failure! (8)</h4>
    </div>
  </div>
  <!-- THIS IS THE SECTION THAT NEEDS HIDING ON FAILURE -->
  <div class="card-damage-rolls">
    <div class="card-damage-roll-single blindable">
      <h3>Damage Roll</h3>
      <div class="dice-roll">
        <!-- Dice formula, tooltip, and total -->
        <h4 class="dice-total">2</h4>
      </div>
    </div>
  </div>
  <footer class="card-footer">...</footer>
</div>
```

### Fix Applied
Before returning early on a failed attack, call `html.find('.card-damage-rolls').hide()` to hide the base system damage roll section from the rendered chat card.

```javascript
// In injectDamageCard(), within the hideDamageCardOnFailedAttack block:
if (settings.hideDamageCardOnFailedAttack && item && item.type === "Weapon") {
    const attackSuccess = message.flags?.shadowdark?.success;
    if (attackSuccess === false) {
        // Hide the base system damage roll section
        html.find('.card-damage-rolls').hide();
        // Skip SDX damage card injection
        return;
    }
}
```

### How It Works
1. `injectDamageCard(message, html, data)` is called via `Hooks.on("renderChatMessage")`.
2. The `html` parameter is a jQuery object wrapping the chat message DOM element.
3. The item is resolved from the chat card's `data-actor-id` and `data-item-id` attributes.
4. If the item is a `"Weapon"` and `hideDamageCardOnFailedAttack` is enabled:
   - Check `message.flags.shadowdark.success` — set by the Shadowdark system on attack rolls.
   - If `false` (attack failed), use jQuery `.hide()` on `.card-damage-rolls` to set `display: none`.
   - Return early to prevent SDX damage card injection.
5. On successful attacks, the flow continues normally — both the base damage roll and the SDX damage card render.

### Key Selectors
| Selector | Purpose |
|---|---|
| `.card-damage-rolls` | Base Shadowdark system damage roll wrapper |
| `.card-damage-roll-single` | Individual damage roll entry |
| `.dice-total.failure` | Attack result marked as failure |
| `.sdx-damage-card` | SDX-injected damage card (already hidden by early return) |

### Flag Reference
- `message.flags.shadowdark.success` — Boolean set by the Shadowdark system. `true` on successful attack, `false` on failure. Used as the authoritative check for attack outcome.

## Testing
1. Enable `hideDamageCardOnFailedAttack` in Combat Settings.
2. Roll a weapon attack that fails (e.g., with disadvantage against high AC).
3. Verify: No "Damage Roll" section visible in the chat card.
4. Roll a weapon attack that succeeds.
5. Verify: Damage roll and SDX damage card both render normally.
6. Disable the setting and roll a failed attack.
7. Verify: Base system damage roll is visible again (default behavior).