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
import { getHexPainterData, loadTileAssets, bindCanvasEvents, enablePainting, disablePainting, isPainting } from "./HexPainterSD.mjs";
import {
    getDungeonPainterData,
    loadDungeonAssets,
    bindDungeonCanvasEvents,
    enableDungeonPainting,
    disableDungeonPainting,
    isDungeonPainting,
    setDungeonMode,
    getDungeonMode,
    selectFloorTile,
    cleanupDungeonPainting
} from "./DungeonPainterSD.mjs";

const MODULE_ID = "shadowdark-extras";

// Tray instance
let _trayApp = null;

// Current view mode
let _viewMode = "player"; // "player" or "party"

// Hide NPCs from players toggle (GM only)
let _hideNpcsFromPlayers = true;

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

    // Load hex tile assets for the painter tab
    loadTileAssets().then(() => renderTray());

    // Load dungeon tile assets
    loadDungeonAssets().then(() => renderTray());

    // Bind canvas events now if canvas is already ready (page refresh)
    if (canvas?.stage) {
        bindCanvasEvents();
        bindDungeonCanvasEvents();
    }

    // Hook into token selection changes
    Hooks.on("controlToken", async () => {
        await renderTray();
    });

    // Hook into actor updates (HP, etc.) - debounced to handle rapid updates
    let _actorUpdateTimer = null;
    Hooks.on("updateActor", async (actor) => {
        if (_actorUpdateTimer) clearTimeout(_actorUpdateTimer);
        _actorUpdateTimer = setTimeout(async () => {
            _actorUpdateTimer = null;
            await renderTray();
        }, 100);
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

    // Hook into token creation/deletion for party view & notes
    Hooks.on("createToken", async () => await renderTray());
    Hooks.on("deleteToken", async () => await renderTray());

    // Debounced token update handler to prevent lag during token movement
    // Token movement triggers many updateToken events per second - we only need to update
    // the tray for HP changes, not position changes
    let _tokenUpdateTimer = null;
    Hooks.on("updateToken", async (tokenDoc, changes) => {
        // Skip position-only updates (token movement) - these don't affect tray content
        const isPositionOnly = ("x" in changes || "y" in changes || "rotation" in changes || "elevation" in changes)
            && !("actorData" in changes)
            && !("name" in changes)
            && !("texture" in changes);
        if (isPositionOnly) return;

        // Debounce other updates
        if (_tokenUpdateTimer) clearTimeout(_tokenUpdateTimer);
        _tokenUpdateTimer = setTimeout(async () => {
            _tokenUpdateTimer = null;
            await renderTray();
        }, 100);
    });

    // Hook into other placeables for notes — debounced to survive bulk operations
    let _placeableRenderTimer = null;
    function debouncedPlaceableRender() {
        if (_placeableRenderTimer) clearTimeout(_placeableRenderTimer);
        _placeableRenderTimer = setTimeout(async () => {
            _placeableRenderTimer = null;
            // If painting is active, we don't need to re-render the tray for every tile placement.
            // This prevents massive lag and scroll resetting issues.
            // The only downside is if you place a tile that SHOULD trigger a note update, it won't show until you stop painting.

            // Double check: if isPainting() is true OR if we are in hexes/dungeons view (which implies painting mode)
            // This makes the check more robust against state desyncs
            if (!isPainting() && !isDungeonPainting() && getViewMode() !== "hexes" && getViewMode() !== "dungeons") {
                await renderTray();
            }
        }, 300);
    }

    // Wall updates need special handling - door state changes (open/close) don't affect tray
    Hooks.on("createWall", debouncedPlaceableRender);
    Hooks.on("deleteWall", debouncedPlaceableRender);
    Hooks.on("updateWall", (wallDoc, changes) => {
        // Skip door state changes (ds = door state) - opening/closing doors doesn't affect tray content
        const isDoorStateOnly = ("ds" in changes)
            && !("c" in changes)  // wall coordinates
            && !("flags" in changes);  // flags might contain notes
        if (isDoorStateOnly) return;
        debouncedPlaceableRender();
    });

    // Other placeables
    const placeableHooks = ["AmbientLight", "AmbientSound", "Tile"];
    placeableHooks.forEach(type => {
        Hooks.on(`create${type}`, debouncedPlaceableRender);
        Hooks.on(`update${type}`, debouncedPlaceableRender);
        Hooks.on(`delete${type}`, debouncedPlaceableRender);
    });

    // Hook into canvas teardown (before scene change) to clean up
    Hooks.on("canvasTearDown", () => {
        cleanupDungeonPainting();
    });

    // Hook into scene changes
    Hooks.on("canvasReady", async () => {
        bindCanvasEvents();
        bindDungeonCanvasEvents();
        await renderTray();
    });

    // Hook into Map Notes
    Hooks.on("createNote", async () => await renderTray());
    Hooks.on("updateNote", async () => await renderTray());
    Hooks.on("deleteNote", async () => await renderTray());

    // Hook for POI placement to update undo/redo buttons
    Hooks.on("sdx.poiPlaced", async () => await renderTray());

    // Hook to update tray when pins change on scene
    Hooks.on("updateScene", (document, change, options, userId) => {
        // Check if the update involves the flags for this module (pins)
        if (change.flags?.[MODULE_ID]?.journalPins) {
            renderTray();
        }
    });

    // Hook to update tray when Tom scenes are modified
    Hooks.on("updateSetting", (setting, data, options, userId) => {
        // Check if the update involves Tom scenes
        if (setting.key === `${MODULE_ID}.tom-scenes`) {
            renderTray();
        }
    });

    // Keyboard shortcut: Ctrl to toggle Tiles/Doors mode in Dungeons tab
    document.addEventListener("keydown", (event) => {
        // Only respond to Ctrl key without other modifiers
        if (event.key !== "Control" || event.shiftKey || event.altKey) return;

        // Only when in dungeons view and tray is expanded
        if (_viewMode !== "dungeons" || !_trayApp?._isExpanded) return;

        // Toggle mode
        const currentMode = getDungeonMode();
        setDungeonMode(currentMode === "tiles" ? "doors" : "tiles");
        renderTray();
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

    // Hidden settings for hex painter (not shown in config)
    game.settings.register(MODULE_ID, "hexPainter.customTileWidth", {
        scope: "client",
        config: false,
        type: Number,
        default: 296
    });

    game.settings.register(MODULE_ID, "hexPainter.customTileHeight", {
        scope: "client",
        config: false,
        type: Number,
        default: 256
    });

    game.settings.register(MODULE_ID, "hexPainter.poiScale", {
        scope: "client",
        config: false,
        type: Number,
        default: 0.5
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
        } else if (!game.user.isGM && !_hideNpcsFromPlayers && !actor.hasPlayerOwner) {
            // NPCs visible to players when GM allows it
            npcTokens.push({
                token: token,
                actor: actor,
                id: token.id,
                name: token.name,
                img: actor.img,
                hp: getActorHP(actor),
                healthbarStatus: getHealthbarStatus(actor),
                isOwner: false,
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
    // Toggle hex painting based on active tab
    if (mode === "hexes") {
        enablePainting();
        disableDungeonPainting();
    } else if (mode === "dungeons") {
        disablePainting();
        enableDungeonPainting();
    } else {
        disablePainting();
        disableDungeonPainting();
    }
    renderTray();
}

/**
 * Get the current view mode/**
 * Get current view mode
 */
export function getViewMode() {
    return _viewMode;
}

/**
 * Toggle whether NPCs are hidden from players
 */
export function toggleHideNpcsFromPlayers() {
    _hideNpcsFromPlayers = !_hideNpcsFromPlayers;
    renderTray();
    return _hideNpcsFromPlayers;
}

/**
 * Get whether NPCs are hidden from players
 */
export function getHideNpcsFromPlayers() {
    return _hideNpcsFromPlayers;
}

/**
 * Cycle to the next view mode
 */
export function cycleViewMode() {
    const showParty = game.settings.get(MODULE_ID, "tray.showPartyTab");
    const isGM = game.user.isGM;

    const modes = [];

    // GM sees Scenes instead of Token/Player
    if (isGM) {
        modes.push("scenes");
    } else {
        modes.push("player");
    }

    if (showParty) modes.push("party");
    if (isGM) modes.push("pins");
    modes.push("notes"); // Notes mode for everyone (filtered for players)
    if (isGM) modes.push("hexes");
    if (isGM) modes.push("dungeons");

    const currentIndex = modes.indexOf(_viewMode);
    // If current mode isn't in list (e.g. switched from player to GM view), start at 0
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length;
    _viewMode = modes[nextIndex];

    // Toggle painting based on active tab
    if (_viewMode === "hexes") {
        enablePainting();
        disableDungeonPainting();
    } else if (_viewMode === "dungeons") {
        disablePainting();
        enableDungeonPainting();
    } else {
        disablePainting();
        disableDungeonPainting();
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
        hideNpcsFromPlayers: _hideNpcsFromPlayers,

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
        mapNotes: getMapNotesData(),

        // Notes Data
        notes: await getNotesData(),

        // Hex Painter Data
        ...getHexPainterData(),

        // Dungeon Painter Data
        ...getDungeonPainterData(),

        // Active Effects
        activeEffects: (() => {
            if (!actor) return [];
            // Use appliedEffects if available (V11+) to get currently active effects
            // This handles disabled state, suppression, etc.
            const effects = actor.appliedEffects || actor.effects;

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
        const shape = style.shape || "circle";

        let displayType = "icon";
        let displayContent = "";
        let displayStyle = "";
        let displayClass = "";

        // Handle Image Shape (Icon is the image itself)
        if (shape === "image" && style.imagePath) {
            displayType = "image";
            displayContent = style.imagePath;
        }
        // Handle Custom Icon Content
        else if (contentType === "customIcon" && style.customIconPath) {
            displayType = "image";
            displayContent = style.customIconPath;
        }
        // Handle FontAwesome Icon
        else if (contentType === "symbol" || contentType === "icon") {
            displayType = "icon";
            displayClass = style.symbolClass || style.iconClass || "fa-solid fa-map-pin";
            displayStyle = `color: ${style.symbolColor || style.fontColor || "#ffffff"};`;
        }
        // Handle Text/Number
        else {
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

        // Calculate Border Radius
        let borderRadius = "50%";
        if (shape !== "circle") {
            const r = style.borderRadius !== undefined ? style.borderRadius : 4;
            borderRadius = `${r}px`;
        }

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
            borderColor,
            borderRadius,
            gmOnly: pin.gmOnly,
            requiresVision: pin.requiresVision
        };
    });

    // Sort alphabetically
    enrichedPins.sort((a, b) => a.name.localeCompare(b.name));
    return enrichedPins;
}

/**
 * Get enriched notes data for the current scene
 * @returns {Promise<Array>}
 */
export async function getNotesData() {
    if (!canvas.scene) return [];

    const notesList = [];
    const isGM = game.user.isGM;

    // Helper to process placeables
    const processPlaceables = async (collection, type, icon) => {
        if (!collection) return;
        for (const placeable of collection) {
            const doc = placeable.document;
            const noteContent = doc.getFlag(MODULE_ID, "notes");

            // Visibility Check
            const isVisible = !!doc.getFlag(MODULE_ID, "noteVisible");
            if (!isGM && !isVisible) continue;

            if (noteContent) {
                // Enrich the HTML for display (convert secrets etc if needed, though we probably want raw for now or enriched safely)
                // We will enrich it so links work
                const enriched = await (foundry.applications?.ux?.TextEditor || TextEditor).enrichHTML(noteContent, { async: true });

                // Get Name
                let name = doc.getFlag(MODULE_ID, "customName") || doc.name || "Unnamed";

                // For walls/lights without names, give a descriptive name if no custom name
                if (!doc.getFlag(MODULE_ID, "customName")) {
                    if (type === "Wall" && (!doc.name || doc.name === "Wall")) name = `Wall (${Math.round(placeable.center.x)}, ${Math.round(placeable.center.y)})`;
                    if (type === "Light" && (!doc.name || doc.name === "Light")) name = `Light - ${doc.config?.dim || 0}/${doc.config?.bright || 0}`;
                    if (type === "Sound" && (!doc.name || doc.name === "Sound")) name = `Sound - ${doc.path?.split('/').pop() || "Unknown"}`;
                }

                notesList.push({
                    id: doc.id,
                    uuid: doc.uuid,
                    x: placeable.center.x, // Use center for panning
                    y: placeable.center.y,
                    name: name,
                    type: type,
                    icon: icon,
                    content: enriched,
                    shortContent: enriched.replace(/<[^>]*>/g, '').substring(0, 50) + (enriched.length > 50 ? "..." : ""),
                    isVisible: isVisible
                });
            }
        }
    };

    // Scan all layers
    // Lighting
    await processPlaceables(canvas.lighting?.placeables, "Light", "fa-solid fa-lightbulb");
    // Sounds
    await processPlaceables(canvas.sounds?.placeables, "Sound", "fa-solid fa-volume-high");
    // Tokens
    if (canvas.tokens?.placeables) {
        for (const token of canvas.tokens.placeables) {
            const doc = token.document;
            // Check both Token and Actor for notes
            let noteContent = doc.getFlag(MODULE_ID, "notes");
            if (!noteContent && token.actor) {
                noteContent = token.actor.getFlag(MODULE_ID, "notes");
            }

            // Visibility Check
            // For tokens we check the token document first, then actor? 
            // Logic: If token has specific visibility flag, use it. If not, default to hidden?
            // Or share visibility with the note source?
            // Let's assume visibility flag is on the object that has the note, or just the token document itself for simplicity?
            // Actually, keep it simple: visibility flag is on the Token Document.
            const isVisible = !!doc.getFlag(MODULE_ID, "noteVisible");

            if (!isGM && !isVisible) continue;

            if (noteContent) {
                const enriched = await (foundry.applications?.ux?.TextEditor || TextEditor).enrichHTML(noteContent, { async: true });
                const name = doc.getFlag(MODULE_ID, "customName") || doc.name || "Unnamed";

                notesList.push({
                    id: doc.id,
                    uuid: doc.uuid,
                    x: token.center.x,
                    y: token.center.y,
                    name: name,
                    type: "Token",
                    icon: "fa-solid fa-user",
                    content: enriched,
                    shortContent: enriched.replace(/<[^>]*>/g, '').substring(0, 50) + (enriched.length > 50 ? "..." : ""),
                    isVisible: isVisible
                });
            }
        }
    }
    // Tiles (TilesLayer is deprecated in V12? No, `canvas.tiles`)
    await processPlaceables(canvas.tiles?.placeables, "Tile", "fa-solid fa-image");
    // Walls (Walls don't technically support notes via standard config usually, but our code enabled it)
    // Wait, WallsLayer objects are `Wall` which is a Document.
    // However, wall selection is tricky. But our PlaceableNotesSD attached to WallConfig.
    // So yes, walls can have notes.
    // Note: placeable.center might be a getter or calculated differently for walls (midpoint).
    await processPlaceables(canvas.walls?.placeables, "Wall", "fa-solid fa-block-brick");

    // Sort by name
    notesList.sort((a, b) => a.name.localeCompare(b.name));

    return notesList;
}

/**
 * Get enriched Map Notes data for the current scene
 * @returns {Array}
 */
export function getMapNotesData() {
    if (!canvas.scene) return [];

    // Filter notes based on user permission
    const notes = canvas.scene.notes.filter(n => n.testUserPermission(game.user, "LIMITED"));

    const enrichedNotes = notes.map(note => {
        const journal = game.journal.get(note.journalId);
        const page = journal?.pages.get(note.pageId);

        let name = note.text || page?.name || journal?.name || "Unnamed Note";

        return {
            id: note.id,
            uuid: note.uuid,
            name: name,
            img: note.texture?.src || "icons/svg/book.svg",
            x: note.x,
            y: note.y,
            journalId: note.journalId,
            pageId: note.pageId,
            global: note.global,
            canDelete: note.canUserModify(game.user, "delete")
        };
    });

    // Sort alphabetically
    enrichedNotes.sort((a, b) => a.name.localeCompare(b.name));
    return enrichedNotes;
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
