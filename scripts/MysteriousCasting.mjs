export const MODULE_ID = "shadowdark-extras";

// In-memory set of actor IDs with mysterious mode enabled.
// Using a Set instead of actor flags avoids the linked/unlinked token mismatch
// where setFlag on a synthetic token actor is invisible to game.actors.get().
const _mysteriousActors = new Set();

/**
 * Get the base (world) actor ID for any actor, whether it's a
 * world actor or a synthetic token actor.
 */
function getBaseActorId(actor) {
    if (!actor) return null;
    // Synthetic token actors: get the base actor ID from the token document
    if (actor.isToken) {
        return actor.token?.actorId ?? actor.id;
    }
    return actor.id;
}

export function initMysteriousCasting() {
    // Register Settings
    game.settings.register(MODULE_ID, "mysteriousCastingMessage", {
        name: "Mysterious Casting Message",
        hint: "The text to display when a spell or attack is used mysteriously.",
        scope: "world",
        config: true,
        type: String,
        default: "The creature casts a mysterious spell..."
    });

    // ── Inject toggle into NPC sheet header ──
    Hooks.on("renderNpcSheetSD", (app, html, data) => {
        if (!game.user.isGM) return;
        if (app.actor?.type !== "NPC") return;

        const actor = app.actor;
        const baseId = getBaseActorId(actor);
        const isActive = _mysteriousActors.has(baseId);
        const activeClass = isActive ? "active" : "";
        const tooltip = isActive
            ? "Mysterious Mode: ON — rolls will be hidden from players"
            : "Mysterious Mode: OFF — rolls shown normally";

        const $header = html.find('.SD-header');
        if (!$header.length) return;
        if ($header.find('.sdx-mysterious-toggle').length) return;

        const toggleHtml = `
            <a class="sdx-mysterious-toggle ${activeClass}"
               data-tooltip="${tooltip}"
               title="${tooltip}">
                <i class="fas fa-mask"></i>
            </a>`;

        $header.append(toggleHtml);

        // Click handler
        $header.find('.sdx-mysterious-toggle').on('click', async (event) => {
            event.preventDefault();
            event.stopPropagation();

            if (_mysteriousActors.has(baseId)) {
                _mysteriousActors.delete(baseId);
            } else {
                _mysteriousActors.add(baseId);
            }

            // Re-render the sheet to update the toggle visual
            app.render(false);
        });
    });

    // ── Hook into chat message creation ──
    Hooks.on("preCreateChatMessage", (messageDoc, data, options, userId) => {
        // Only relevant for GMs
        if (!game.user.isGM) return true;

        const content = messageDoc.content ?? "";

        // Check if it's an item card
        if (!content.includes("item-card")) return true;

        // Skip ability check rolls — those should always be visible
        if (content.includes("card-ability-roll")) return true;

        // Get the actor from the speaker
        const actorId = messageDoc.speaker?.actor;
        if (!actorId) return true;

        // Check if mysterious mode is enabled for this actor
        if (!_mysteriousActors.has(actorId)) return true;

        // IT IS MYSTERIOUS!
        const isAttack = content.includes("card-attack-roll") ||
            content.includes("card-damage-roll") ||
            messageDoc.flags?.shadowdark?.rolls?.damage;
        const mysteriousLabel = isAttack ? "Unknown Attack" : "Unknown Spell";

        const mysteriousText = game.settings.get(MODULE_ID, "mysteriousCastingMessage");
        const mysteriousIcon = "icons/magic/symbols/question-stone-yellow.webp";

        // Extract potential buttons from original content
        let buttonsHtml = "";
        const buttonsMatch = content.match(/<div class="[^"]*card-buttons[^"]*">[\s\S]*?<\/div>/i);
        if (buttonsMatch) {
            buttonsHtml = buttonsMatch[0];
        } else {
            const actionButtons = content.match(/<button\s+[^>]*data-action[^>]*>[\s\S]*?<\/button>/gi);
            if (actionButtons) {
                buttonsHtml = `<div class="card-buttons">${actionButtons.join("")}</div>`;
            }
        }

        // Preserve wrapper attributes (data-actor-id, data-item-id, etc.)
        let wrapperAttributes = "";
        const attributesMatch = content.match(/^<div\s+([^>]+)>/i);
        if (attributesMatch) {
            wrapperAttributes = attributesMatch[1];
        } else {
            wrapperAttributes = `class="shadowdark chat-card item-card" data-actor-id="${actorId}"`;
        }

        // Hide original content from ".chat-card" selectors
        const safeHiddenContent = content.replace(/class="([^"]*)"/, (match, classes) => {
            return `class="${classes.replace(/chat-card/g, "hidden-content")}"`;
        });

        const newContent = `
            <div ${wrapperAttributes}>
                <header class="card-header flexrow">
                    <img src="${mysteriousIcon}" title="${mysteriousLabel}" width="36" height="36"/>
                    <h3 class="item-name">${mysteriousLabel}</h3>
                </header>
                <div class="card-content">
                    <p><em>${mysteriousText}</em></p>
                </div>
                ${buttonsHtml}
                <div style="display:none;">
                    ${safeHiddenContent}
                </div>
            </div>
        `;

        const updateData = {
            content: newContent,
            "flags.shadowdark.isMysterious": true
        };

        if (messageDoc.flavor) {
            updateData.flavor = mysteriousLabel;
        }

        messageDoc.updateSource(updateData);
        return true;
    });
}
