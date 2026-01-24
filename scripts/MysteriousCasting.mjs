export const MODULE_ID = "shadowdark-extras";

export function initMysteriousCasting() {
    // Register Settings
    game.settings.register(MODULE_ID, "mysteriousCastingModifier", {
        name: "Mysterious Casting Modifier",
        hint: "Hold this key when clicking a spell to cast it mysteriously (hides name and description).",
        scope: "client",
        config: true,
        type: String,
        choices: {
            "none": "None",
            "Control": "Ctrl",
            "Shift": "Shift",
            "Alt": "Alt"
        },
        default: "Control"
    });

    game.settings.register(MODULE_ID, "mysteriousCastingMessage", {
        name: "Mysterious Casting Message",
        hint: "The text to display when a spell is cast mysteriously.",
        scope: "world",
        config: true,
        type: String,
        default: "The creature casts a mysterious spell..."
    });

    // Hook into chat message creation
    Hooks.on("preCreateChatMessage", (messageDoc, data, options, userId) => {
        // Only relevant for GMs
        if (!game.user.isGM) return true;

        // Check if it's an item roll (usually type 'other' or via specific flags)
        // Shadowdark system usually puts item data in flags.shadowdark
        const itemData = messageDoc.flags?.shadowdark?.itemData ?? messageDoc.flags?.data?.itemData;

        // We really only care if it "looks" like a spell card or item usage
        if (!itemData && !data.content?.includes("item-card")) return true;

        // Check Modifier Key
        const modifier = game.settings.get(MODULE_ID, "mysteriousCastingModifier");
        if (modifier === "none") return true;

        // We need to check the *actual* keyboard state at the moment of the event
        // But preCreateChatMessage happens *after* the click, possibly async?
        // Actually, Foundry's `game.keyboard` tracks active modifiers nicely.
        const isModifierActive = game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS[modifier.toUpperCase()]);

        if (!isModifierActive) return true;

        // IT IS MYSTERIOUS!
        // We want to hide the original content but keep it in the DOM so that
        // scripts (like CombatSettingsSD.mjs) that search for keywords (like "Damage")
        // or parse the HTML can still function.
        const mysteriousText = game.settings.get(MODULE_ID, "mysteriousCastingMessage");
        const mysteriousIcon = "icons/magic/symbols/question-stone-yellow.webp";

        // Extract potential buttons from original content to show them visibly
        let buttonsHtml = "";
        const buttonsMatch = data.content.match(/<div class="[^"]*card-buttons[^"]*">[\s\S]*?<\/div>/i);
        if (buttonsMatch) {
            buttonsHtml = buttonsMatch[0];
        } else {
            const actionButtons = data.content.match(/<button\s+[^>]*data-action[^>]*>[\s\S]*?<\/button>/gi);
            if (actionButtons) {
                buttonsHtml = `<div class="card-buttons">${actionButtons.join("")}</div>`;
            }
        }

        // 1. EXTRACT ATTRIBUTES
        // We must preserve all attributes (data-actor-id, data-item-id, data-spell-tier, class, etc.)
        // so that logic relying on them (like injectDamageCard) works on the wrapper.
        let wrapperAttributes = "";
        const attributesMatch = data.content.match(/^<div\s+([^>]+)>/i);
        if (attributesMatch) {
            wrapperAttributes = attributesMatch[1];
        } else {
            // Fallback
            wrapperAttributes = `class="shadowdark chat-card item-card" data-actor-id="${messageDoc.speaker.actor}"`;
        }

        // 2. SAFE HIDDEN CONTENT
        // We must modify the original content's class so it is NOT found by 
        // injectDamageCard as a ".chat-card". Replacing 'chat-card' with 'hidden-content' works.
        // We use a regex global replace just in case.
        const safeHiddenContent = data.content.replace(/class="([^"]*)"/, (match, classes) => {
            return `class="${classes.replace(/chat-card/g, "hidden-content")}"`;
        });

        const newContent = `
            <div ${wrapperAttributes}>
                <!-- Visible Mysterious Header -->
                <header class="card-header flexrow">
                    <img src="${mysteriousIcon}" title="Mysterious Spell" width="36" height="36"/>
                    <h3 class="item-name">Unknown Spell</h3>
                </header>
                
                <!-- Visible Mysterious Description -->
                <div class="card-content">
                    <p><em>${mysteriousText}</em></p>
                </div>

                <!-- Visible Extracted Buttons (if any) -->
                ${buttonsHtml}

                <!-- HIDDEN ORIGINAL CONTENT -->
                <div style="display:none;">
                    ${safeHiddenContent}
                </div>
            </div>
        `;

        messageDoc.updateSource({
            content: newContent,
            "flags.shadowdark.isMysterious": true
        });

        // Return true to allow creation
        return true;
    });
}
