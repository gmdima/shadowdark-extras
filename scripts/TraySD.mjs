/**
 * Character Tray for Shadowdark Extras
 *
 * Displays a collapsible tray on the left side of the screen showing:
 * - Token view: Selected token information
 * - Party view: All party members with health bars
 *
 * Ported from coffee-pub-squire module with adaptations for Shadowdark RPG.
 */

import { TrayApp } from "./TrayApp.mjs";
import { JournalPinManager } from "./JournalPinsSD.mjs";

const MODULE_ID = "shadowdark-extras";

// Tray instance
let _trayApp = null;

// Current view mode
let _viewMode = "player"; // "player" or "party"

// Current actor/token being displayed
let _currentActor = null;
let _currentToken = null;

/**
 * Initialize the Character Tray
 * Called from shadowdark-extras.mjs ready hook
 */
export function initTray() {
    // Check if tray is enabled
    if (!game.settings.get(MODULE_ID, "tray.enabled")) {
        console.log("shadowdark-extras | Character Tray is disabled");
        return;
    }

    // Add class to body to enable tray-specific CSS
    document.body.classList.add("sdx-tray-enabled");

    console.log("shadowdark-extras | Initializing Character Tray");

    // Create the tray app
    _trayApp = new TrayApp();
    _trayApp.render(true);

    // Initial render
    renderTray();

    // Hook into token selection changes
    Hooks.on("controlToken", async () => {
        await renderTray();
    });

    // Hook into actor updates (HP, etc.)
    Hooks.on("updateActor", async (actor) => {
        // Re-render if this actor is visible in the tray
        await renderTray();
    });

    // Hook into effect changes
    Hooks.on("createActiveEffect", async () => await renderTray());
    Hooks.on("deleteActiveEffect", async () => await renderTray());
    Hooks.on("updateActiveEffect", async () => await renderTray());

    // Hook into item changes (Shadowdark stores conditions as Effect items)
    Hooks.on("createItem", async (item) => {
        if (item.type === "Effect") await renderTray();
    });
    Hooks.on("deleteItem", async (item) => {
        if (item.type === "Effect") await renderTray();
    });
    Hooks.on("updateItem", async (item) => {
        if (item.type === "Effect") await renderTray();
    });

    // Hook into token creation/deletion for party view
    Hooks.on("createToken", async () => await renderTray());
    Hooks.on("deleteToken", async () => await renderTray());
    Hooks.on("updateToken", async () => await renderTray());

    // Hook into scene changes
    Hooks.on("canvasReady", async () => await renderTray());

    // Hook to update tray when pins change on scene
    Hooks.on("updateScene", (document, change, options, userId) => {
        // Check if the update involves the flags for this module (pins)
        if (change.flags?.[MODULE_ID]?.journalPins) {
            renderTray();
        }
    });

    console.log("shadowdark-extras | Character Tray initialized");
}

/**
 * Register tray settings
 */
export function registerTraySettings() {
    game.settings.register(MODULE_ID, "tray.enabled", {
        name: "SHADOWDARK_EXTRAS.tray.settings.enabled.name",
        hint: "SHADOWDARK_EXTRAS.tray.settings.enabled.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: true
    });

    game.settings.register(MODULE_ID, "tray.showPartyTab", {
        name: "SHADOWDARK_EXTRAS.tray.settings.showPartyTab.name",
        hint: "SHADOWDARK_EXTRAS.tray.settings.showPartyTab.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, "tray.partyName", {
        name: "SHADOWDARK_EXTRAS.tray.settings.partyName.name",
        hint: "SHADOWDARK_EXTRAS.tray.settings.partyName.hint",
        scope: "world",
        config: true,
        type: String,
        default: "Party"
    });

    game.settings.register(MODULE_ID, "tray.showHealthBars", {
        name: "SHADOWDARK_EXTRAS.tray.settings.showHealthBars.name",
        hint: "SHADOWDARK_EXTRAS.tray.settings.showHealthBars.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(MODULE_ID, "tray.showNPCs", {
        name: "SHADOWDARK_EXTRAS.tray.settings.showNPCs.name",
        hint: "SHADOWDARK_EXTRAS.tray.settings.showNPCs.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: true
    });
}

/**
 * Get the current actor to display
 * @returns {Actor|null}
 */
export function getCurrentActor() {
    const isGM = game.user.isGM;

    // For GM: use controlled token
    if (isGM && canvas.tokens) {
        const tokens = canvas.tokens.controlled;
        if (tokens.length === 1) {
            const token = tokens[0];
            _currentToken = token;
            if (token.document.actorLink) {
                _currentActor = game.actors.get(token.document.actorId);
            } else {
                _currentActor = token.actor;
            }
            return _currentActor;
        }
    }

    // For players: use assigned character or first owned actor
    let character = game.user.character;
    if (!character) {
        for (let actor of Array.from(game.actors.values())) {
            if (actor.isOwner && actor.type === "Player") {
                character = actor;
                break;
            }
        }
    }

    _currentActor = character;
    _currentToken = null;
    return character;
}

/**
 * Get all party tokens on the current scene
 * @returns {Array}
 */
export function getPartyTokens() {
    if (!canvas.tokens) return [];

    const tokens = canvas.tokens.placeables;
    const partyTokens = [];
    const npcTokens = [];

    for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        // Check if this is a player character
        if (actor.type === "Player") {
            partyTokens.push({
                token: token,
                actor: actor,
                id: token.id,
                name: token.name,
                img: actor.img,
                hp: getActorHP(actor),
                healthbarStatus: getHealthbarStatus(actor),
                isOwner: actor.isOwner,
                isSelected: canvas.tokens.controlled.some(t => t.id === token.id)
            });
        } else if (game.user.isGM && game.settings.get(MODULE_ID, "tray.showNPCs")) {
            // NPCs/monsters for GM
            npcTokens.push({
                token: token,
                actor: actor,
                id: token.id,
                name: token.name,
                img: actor.img,
                hp: getActorHP(actor),
                healthbarStatus: getHealthbarStatus(actor),
                isOwner: true,
                isNPC: true,
                isSelected: canvas.tokens.controlled.some(t => t.id === token.id)
            });
        }
    }

    return { partyTokens, npcTokens };
}

/**
 * Get HP data for an actor
 * @param {Actor} actor
 * @returns {Object}
 */
export function getActorHP(actor) {
    const hp = actor.system?.attributes?.hp;
    if (!hp) return { value: 0, max: 0, percent: 0 };

    const value = hp.value ?? 0;
    const max = hp.max ?? 1;
    const percent = Math.max(0, Math.min(100, (value / max) * 100));

    return { value, max, percent };
}

/**
 * Get health bar status class
 * @param {Actor} actor
 * @returns {string}
 */
export function getHealthbarStatus(actor) {
    const hp = getActorHP(actor);
    const percent = hp.percent;

    if (percent <= 0) return "dead";
    if (percent <= 25) return "critical";
    if (percent <= 50) return "bloodied";
    if (percent <= 75) return "injured";
    return "healthy";
}

/**
 * Get health overlay height for character portrait
 * @param {Object} hp - HP object with value and max
 * @returns {string}
 */
export function getHealthOverlayHeight(hp) {
    if (!hp || !hp.max) return "0%";
    const missing = hp.max - hp.value;
    const percent = (missing / hp.max) * 100;
    return `${Math.min(100, Math.max(0, percent))}%`;
}

/**
 * Set the current view mode
 * @param {string} mode - "player" or "party"
 */
export function setViewMode(mode) {
    _viewMode = mode;
    renderTray();
}

/**
 * Get the current view mode
 * @returns {string}
 */
export function getViewMode() {
    return _viewMode;
}

/**
 * Cycle to the next view mode
 */
export function cycleViewMode() {
    const showParty = game.settings.get(MODULE_ID, "tray.showPartyTab");

    if (_viewMode === "player" && showParty) {
        _viewMode = "party";
    } else {
        _viewMode = "player";
    }

    renderTray();
}

/**
 * Toggle tray expansion
 */
export function toggleTray() {
    if (_trayApp) {
        _trayApp.toggleExpanded();
    }
}


/**
 * Render the tray with current data
 */
export async function renderTray() {
    if (!_trayApp) return;

    const actor = getCurrentActor();
    const { partyTokens, npcTokens } = getPartyTokens();
    const showPartyTab = game.settings.get(MODULE_ID, "tray.showPartyTab");
    const partyName = game.settings.get(MODULE_ID, "tray.partyName");
    const showHealthBars = game.settings.get(MODULE_ID, "tray.showHealthBars");

    // Calculate party totals
    let partyTotalHP = 0;
    let partyRemainingHP = 0;
    for (const member of partyTokens) {
        partyTotalHP += member.hp.max;
        partyRemainingHP += member.hp.value;
    }

    // Get other party members (for handle display)
    const otherPartyMembers = partyTokens.filter(m => !actor || m.actor.id !== actor.id);

    const data = {
        actor: actor,
        actorDisplayName: actor?.name || "Select a Character",
        viewMode: _viewMode,
        showTabParty: showPartyTab,
        isGM: game.user.isGM,
        partyName: partyName,
        showHealthBars: showHealthBars,

        // Party data
        partyTokens: partyTokens,
        npcTokens: npcTokens,
        otherPartyMembers: otherPartyMembers,
        partyTotalHP: partyTotalHP,
        partyRemainingHP: partyRemainingHP,
        partyHealthbarStatus: getPartyHealthbarStatus(partyRemainingHP, partyTotalHP),

        // Actor HP if present
        actorHP: actor ? getActorHP(actor) : null,
        actorHealthbarStatus: actor ? getHealthbarStatus(actor) : null,

        // Selection info
        controlledTokenIds: canvas.tokens?.controlled.map(t => t.id) || [],
        selectionCount: canvas.tokens?.controlled.length || 0,
        showSelectionBox: canvas.tokens?.controlled.length > 1,

        // Pins Data
        pins: game.user.isGM ? getPinsData() : [],

        // Active Effects
        activeEffects: (() => {
            if (!actor) return [];
            // Use appliedEffects if available (V11+) to get currently active effects
            // This handles disabled state, suppression, etc.
            const effects = actor.appliedEffects || actor.effects;

            // Debug log to troubleshoot missing effects
            console.log("Shadowdark Extras Tray | Fetching effects for", actor.name, effects);

            return effects.map(e => ({
                id: e.id,
                name: e.name,
                img: e.icon || e.img,
                disabled: e.disabled
            }));
        })()
    };

    _trayApp.updateData(data);
}

/**
 * Get enriched pin data for the current scene
 * Logic adapted from PinListApp
 * @returns {Array}
 */
export function getPinsData() {
    if (!canvas.scene) return [];

    // Get all pins for the current scene
    const pins = JournalPinManager.list({ sceneId: canvas.scene.id });

    // Enrich pin data
    const enrichedPins = pins.map(pin => {
        let pinName = pin.label || "Unnamed Pin";
        let pageName = "";

        // If the pin is linked to a journal/page, try to get its name
        if (pin.journalId) {
            const journal = game.journal.get(pin.journalId);
            if (journal) {
                if (pin.pageId) {
                    const page = journal.pages.get(pin.pageId);
                    if (page) {
                        // If label is default "New Pin" or "Journal Pin", use page name
                        if (pinName === "New Pin" || pinName === "Journal Pin") {
                            pinName = page.name;
                        }
                        // Or maybe show Journal Name > Page Name
                        pageName = `${journal.name} • ${page.name}`;
                    } else {
                        pageName = journal.name;
                    }
                } else {
                    if (pinName === "New Pin" || pinName === "Journal Pin") {
                        pinName = journal.name;
                    }
                }
            }
        }

        // Fallback: If still default name "New Pin", try to use Tooltip Title
        if ((pinName === "New Pin" || pinName === "Journal Pin") && pin.tooltipTitle) {
            pinName = pin.tooltipTitle;
        }

        // Determine Display Type & Content
        const style = pin.style || {};
        const contentType = style.contentType || (style.showIcon ? "symbol" : "number");

        let displayType = "icon";
        let displayContent = "";
        let displayStyle = "";
        let displayClass = "";

        if (contentType === "symbol" || contentType === "icon") {
            displayType = "icon";
            displayClass = style.symbolClass || style.iconClass || "fa-solid fa-map-pin";
            displayStyle = `color: ${style.symbolColor || style.fontColor || "#ffffff"};`;
        }
        else if (contentType === "customIcon" && style.customIconPath) {
            displayType = "image";
            displayContent = style.customIconPath;
        }
        else {
            // Text or Number
            displayType = "text";
            displayStyle = `
                color: ${style.fontColor || "#ffffff"}; 
                font-family: ${style.fontFamily || "Arial"};
                font-weight: ${style.fontWeight || "bold"};
                font-size: 16px;
            `;

            if (contentType === "text") {
                displayContent = style.customText || "";
            } else {
                // Number logic
                if (pin.journalId && pin.pageId) {
                    // Find page index
                    const journal = game.journal.get(pin.journalId);
                    if (journal) {
                        const sortedPages = journal.pages.contents.sort((a, b) => a.sort - b.sort);
                        const idx = sortedPages.findIndex(p => p.id === pin.pageId);
                        displayContent = idx >= 0 ? idx : 0;
                    } else {
                        displayContent = "0";
                    }
                } else {
                    displayContent = "0";
                }
            }
        }

        let backgroundColor = style.fillColor || "#000000";
        let borderColor = style.ringColor || "#ffffff";

        return {
            id: pin.id,
            x: pin.x,
            y: pin.y,
            name: pinName,
            pageName: pageName,
            displayType,
            displayContent,
            displayStyle,
            displayClass,
            backgroundColor,
            borderColor
        };
    });

    // Sort alphabetically
    enrichedPins.sort((a, b) => a.name.localeCompare(b.name));
    return enrichedPins;
}

/**
 * Get party health bar status
 * @param {number} remaining
 * @param {number} total
 * @returns {string}
 */
function getPartyHealthbarStatus(remaining, total) {
    if (total === 0) return "healthy";
    const percent = (remaining / total) * 100;

    if (percent <= 0) return "dead";
    if (percent <= 25) return "critical";
    if (percent <= 50) return "bloodied";
    if (percent <= 75) return "injured";
    return "healthy";
}

/**
 * Open actor sheet for a token
 * @param {string} tokenId
 */
export function openTokenSheet(tokenId) {
    const token = canvas.tokens.get(tokenId);
    if (token?.actor) {
        token.actor.sheet.render(true);
    }
}

/**
 * Select a token on the canvas
 * @param {string} tokenId
 */
export function selectToken(tokenId) {
    const token = canvas.tokens.get(tokenId);
    if (token) {
        token.control({ releaseOthers: true });
    }
}

/**
 * Select all party tokens
 */
export function selectPartyTokens() {
    if (!canvas.tokens) return;

    const tokens = canvas.tokens.placeables;
    const partyTokens = [];

    for (const token of tokens) {
        const actor = token.actor;
        if (!actor) continue;

        // For GM: select all players, for players: select owned
        if (game.user.isGM) {
            if (actor.type === "Player") {
                partyTokens.push(token);
            }
        } else if (actor.isOwner) {
            partyTokens.push(token);
        }
    }

    // Release all tokens first
    canvas.tokens.releaseAll();

    // Control all party tokens
    for (const token of partyTokens) {
        token.control({ releaseOthers: false });
    }
}

/**
 * Clear all token selections
 */
export function clearTokenSelection() {
    canvas.tokens?.releaseAll();
}

/**
 * Switch to a specific actor (for players with multiple characters)
 * @param {string} actorId
 */
export function switchToActor(actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) return;

    // Find a token for this actor on the current scene
    const token = canvas.tokens?.placeables.find(t => t.actor?.id === actorId);
    if (token) {
        token.control({ releaseOthers: true });
    }

    renderTray();
}
