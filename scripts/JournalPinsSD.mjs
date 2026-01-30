/**
 * Journal Pins System for Shadowdark Extras
 * Allows placing journal/page pins on the canvas via Ctrl+drag
 */

const MODULE_ID = "shadowdark-extras";
const FLAG_KEY = "journalPins";
const LAYER_NAME = "sdx-journal-pins-layer";

// ================================================================
// PIN SCHEMA & DEFAULTS
// ================================================================

const PIN_SCHEMA_VERSION = 1;

const DEFAULT_PIN_STYLE = {
    size: 32,
    shape: "circle",
    ringColor: "#ffffff",
    fillColor: "#000000",
    ringWidth: 3,
    ringStyle: "solid",
    opacity: 1.0,
    fillOpacity: 1.0,
    ringOpacity: 1.0,
    hoverAnimation: "none", // "none", "scale", "pulse", "rotate", "shake"
    pingAnimation: "ripple", // "ripple", "rotate", "shake", "none"
    bringAnimation: "ripple", // "ripple", "rotate", "shake", "none"
    imagePath: "", // Path to image for "image" shape
    contentType: "number", // "number", "icon", "text"
    iconClass: "fa-solid fa-book-open",
    customText: "",
    fontSize: 14,
    fontFamily: "Arial",
    fontColor: "#ffffff",
    fontWeight: "bold",
    fontItalic: false,
    fontStroke: "#000000",
    fontStrokeThickness: 0,
    // Label settings
    labelText: "",
    labelShowOnHover: true,
    labelFontFamily: "Arial",
    labelFontSize: 16,
    labelColor: "#ffffff",
    labelStroke: "#000000",
    labelStrokeThickness: 4,
    labelBackground: "none", // "none", "solid", "playerSheet"
    labelBackgroundColor: "#000000",
    labelBackgroundOpacity: 0.8,
    labelBorderColor: "#ffffff",
    labelBorderWidth: 2,
    labelBorderRadius: 4,
    labelBold: false,
    labelItalic: false,
    labelBorderImagePath: "", // Custom path for border image
    labelBorderSliceTop: 54,
    labelBorderSliceRight: 54,
    labelBorderSliceBottom: 54,
    labelBorderSliceLeft: 54,
    labelAnchor: "bottom", // "top", "bottom", "left", "right", "center"
    labelOffset: 5,
    hideTooltip: false
};

/**
 * Get the current pin style settings
 */
function getPinStyle() {
    try {
        const stored = game.settings.get(MODULE_ID, "pinStyleDefaults") || {};
        return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_PIN_STYLE), stored);
    } catch (e) {
        return foundry.utils.deepClone(DEFAULT_PIN_STYLE);
    }
}

// ================================================================
// CUSTOM CANVAS LAYER
// ================================================================

class JournalPinsLayer extends foundry.canvas.layers.CanvasLayer {
    constructor() {
        super();
        console.log("SDX Journal Pins | Layer constructor called");
    }

    async _draw() {
        console.log("SDX Journal Pins | Layer _draw() called");

        // Make layer interactive
        this.eventMode = "passive";
        this.interactiveChildren = true;

        JournalPinRenderer.initialize(this);
    }

    activate() {
        console.log("SDX Journal Pins | Layer activated");
        if (canvas?.scene && JournalPinRenderer.getContainer()) {
            const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
            JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
        }
    }

    deactivate() {
        console.log("SDX Journal Pins | Layer deactivated");
    }
}

// ================================================================
// LAYER REGISTRATION - Must be called during init hook
// ================================================================

const hookCanvas = () => {
    const origLayers = CONFIG.Canvas.layers;
    CONFIG.Canvas.layers = Object.keys(origLayers).reduce((layers, key) => {
        layers[key] = origLayers[key];

        // Inject after walls layer (like Blacksmith does)
        if (key === 'walls') {
            layers[LAYER_NAME] = {
                layerClass: JournalPinsLayer,
                group: "interface"
            };
        }

        return layers;
    }, {});
    console.log("SDX Journal Pins | Layer registered in CONFIG.Canvas.layers");
};

// ================================================================
// PIN MANAGER - CRUD operations stored in scene flags
// ================================================================

class JournalPinManager {
    static FLAG_KEY = FLAG_KEY;

    static _getScene(sceneId) {
        if (sceneId) {
            const scene = game.scenes?.get(sceneId);
            if (!scene) throw new Error(`Scene not found: ${sceneId}`);
            return scene;
        }
        if (!canvas?.scene) {
            throw new Error("No active scene");
        }
        return canvas.scene;
    }

    static _getScenePins(scene) {
        const raw = scene.getFlag(MODULE_ID, this.FLAG_KEY);
        if (!Array.isArray(raw)) return [];
        return raw.filter(p => p && typeof p === "object" && p.id);
    }

    static async create(pinData, options = {}) {
        const scene = this._getScene(options.sceneId);

        if (!game.user?.isGM) {
            throw new Error("Only GMs can create journal pins");
        }

        const id = pinData.id || foundry.utils.randomID();

        // Pin data should be minimal to allow global style overrides
        const pin = {
            id,
            x: pinData.x ?? 0,
            y: pinData.y ?? 0,
            journalId: pinData.journalId,
            pageId: pinData.pageId ?? null,
            label: pinData.label ?? "Journal Pin",
            gmOnly: pinData.gmOnly ?? false,
            requiresVision: pinData.requiresVision ?? false,
            flags: pinData.flags || {},
            version: PIN_SCHEMA_VERSION
        };

        if (!pin.journalId) {
            // Allow unlinked pins
            pin.journalId = null;
        }

        const pins = this._getScenePins(scene);

        if (pins.some(p => p.id === pin.id)) {
            throw new Error(`Pin with id ${pin.id} already exists`);
        }

        const next = [...pins, foundry.utils.deepClone(pin)];
        await scene.setFlag(MODULE_ID, this.FLAG_KEY, next);

        if (scene.id === canvas?.scene?.id) {
            JournalPinRenderer.addPin(pin);
        }

        console.log(`SDX Journal Pins | Created pin: ${pin.id} at (${pin.x}, ${pin.y})`);
        return foundry.utils.deepClone(pin);
    }

    static async update(pinId, patch, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const idx = pins.findIndex(p => p.id === pinId);

        if (idx === -1) throw new Error(`Pin not found: ${pinId}`);
        if (!game.user?.isGM) throw new Error("Only GMs can update journal pins");

        const existing = pins[idx];
        const updated = foundry.utils.deepClone(existing);

        if (patch.x !== undefined) updated.x = patch.x;
        if (patch.y !== undefined) updated.y = patch.y;
        if (patch.label !== undefined) updated.label = patch.label;
        if (patch.size !== undefined) updated.size = patch.size;
        if (patch.pageId !== undefined) updated.pageId = patch.pageId;
        if (patch.journalId !== undefined) updated.journalId = patch.journalId;
        if (patch.style) updated.style = { ...updated.style, ...patch.style };
        if (patch.gmOnly !== undefined) updated.gmOnly = patch.gmOnly;
        if (patch.requiresVision !== undefined) updated.requiresVision = patch.requiresVision;
        if (patch.tooltipTitle !== undefined) updated.tooltipTitle = patch.tooltipTitle;
        if (patch.tooltipContent !== undefined) updated.tooltipContent = patch.tooltipContent;
        if (patch.hideTooltip !== undefined) updated.hideTooltip = patch.hideTooltip;

        // Use expandObject to handle flattened keys like "flags.scope.key"
        const expandedPatch = foundry.utils.expandObject(patch);
        if (expandedPatch.flags) {
            updated.flags = foundry.utils.mergeObject(updated.flags || {}, expandedPatch.flags);
        }
        if (expandedPatch.style) {
            updated.style = foundry.utils.mergeObject(updated.style || {}, expandedPatch.style);
        }

        const next = [...pins];
        next[idx] = updated;
        await scene.setFlag(MODULE_ID, this.FLAG_KEY, next);

        if (scene.id === canvas?.scene?.id) {
            JournalPinRenderer.updatePin(updated);
        }

        console.log(`SDX Journal Pins | Updated pin: ${pinId}`);
        return foundry.utils.deepClone(updated);
    }

    static async delete(pinId, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const idx = pins.findIndex(p => p.id === pinId);

        if (idx === -1) throw new Error(`Pin not found: ${pinId}`);
        if (!game.user?.isGM) throw new Error("Only GMs can delete journal pins");

        const next = pins.filter(p => p.id !== pinId);
        await scene.setFlag(MODULE_ID, this.FLAG_KEY, next);

        if (scene.id === canvas?.scene?.id) {
            JournalPinRenderer.removePin(pinId);
        }

        console.log(`SDX Journal Pins | Deleted pin: ${pinId}`);
    }

    static get(pinId, options = {}) {
        const scene = this._getScene(options.sceneId);
        const pins = this._getScenePins(scene);
        const pin = pins.find(p => p.id === pinId);
        return pin ? foundry.utils.deepClone(pin) : null;
    }

    static _styleClipboard = null;

    static copyStyle(pinData) {
        if (!pinData || !pinData.style) return;
        const style = foundry.utils.deepClone(pinData.style);

        // Exclude content-specific fields
        delete style.labelText;
        delete style.customText;
        delete style.tooltipTitle;
        delete style.tooltipContent;
        // Keep hideTooltip as it's a preference, but maybe user wants to copy it? 
        // Plan said: "Delete labelText and customText". 
        // User said: "dont copy things like journal, page, custom tooltips, label text".

        this._styleClipboard = style;
        ui.notifications.info("Pin style copied to clipboard.");
    }

    static async pasteStyle(targetPinId) {
        if (!this._styleClipboard) {
            ui.notifications.warn("No style in clipboard.");
            return;
        }

        const style = foundry.utils.deepClone(this._styleClipboard);
        await this.update(targetPinId, { style });
        ui.notifications.info("Pin style pasted.");
    }

    static hasCopiedStyle() {
        return !!this._styleClipboard;
    }

    static list(options = {}) {
        const scene = this._getScene(options.sceneId);
        return this._getScenePins(scene).map(p => foundry.utils.deepClone(p));
    }
}

/**
 * Helper to place pins via click
 */
export class PinPlacer {
    static active = false;
    static _cursor = "crosshair";

    static activate() {
        if (this.active) return;
        this.active = true;

        // Change cursor
        document.body.style.cursor = this._cursor;

        // Add listeners
        canvas.stage.on("mousedown", this._onClick);
        canvas.stage.on("rightdown", this._onRightClick);

        ui.notifications.info("Click on the canvas to place a pin. Right-click to cancel.");
    }

    static deactivate() {
        if (!this.active) return;
        this.active = false;

        // Restore cursor
        document.body.style.cursor = "";

        // Remove listeners
        canvas.stage.off("mousedown", this._onClick);
        canvas.stage.off("rightdown", this._onRightClick);
    }

    static _onClick = async (event) => {
        if (!PinPlacer.active) return;

        const pos = event.data.getLocalPosition(canvas.stage);

        // Create the pin
        await JournalPinManager.create({
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            journalId: null,
            label: "New Pin"
        });

        PinPlacer.deactivate();
    };

    static _onRightClick = (event) => {
        if (!PinPlacer.active) return;
        PinPlacer.deactivate();
        ui.notifications.info("Pin placement cancelled.");
    };
}

// ================================================================
// PIN VISIBILITY CHECKS
// ================================================================

/**
 * Check if a pin is visible to the current user
 * @param {Object} pin - The pin data
 * @returns {boolean} - True if the pin should be visible
 */
function checkPinVisibility(pin) {
    console.log(`SDX Journal Pins | Checking visibility for pin ${pin.id}:`, {
        gmOnly: pin.gmOnly,
        requiresVision: pin.requiresVision,
        isGM: game.user?.isGM,
        userName: game.user?.name
    });
    // GM can always see all pins
    if (game.user?.isGM) {
        console.log(`SDX Journal Pins | Pin ${pin.id} visible (user is GM)`);
        return true;
    }
    // Check gmOnly flag
    if (pin.gmOnly) {
        console.log(`SDX Journal Pins | Pin ${pin.id} hidden (gmOnly and user is not GM)`);
        return false;
    }
    // If vision is not required, pin is visible
    if (!pin.requiresVision) {
        console.log(`SDX Journal Pins | Pin ${pin.id} visible (requiresVision is false)`);
        return true;
    }
    // Check if any owned token can see the pin
    const pinPosition = { x: pin.x, y: pin.y };
    const ownedTokens = canvas.tokens.placeables.filter(t => t.isOwner);
    console.log(`SDX Journal Pins | Checking ${ownedTokens.length} owned tokens for vision to pin ${pin.id}`);
    for (const token of ownedTokens) {
        const canSee = checkTokenCanSeePinPosition(token, pinPosition);
        console.log(`SDX Journal Pins | Token ${token.name} can see pin ${pin.id}: ${canSee}`);
        if (canSee) {
            return true;
        }
    }
    console.log(`SDX Journal Pins | Pin ${pin.id} hidden (no owned tokens can see it)`);
    return false;
}

/**
 * Check if a token can see a pin position (adapted from checkAuraVisibility)
 * @param {Token} token - The token checking visibility
 * @param {Object} pinPosition - The pin's {x, y} position
 * @returns {boolean} - True if visible
 */
function checkTokenCanSeePinPosition(token, pinPosition) {
    if (!token?.center) {
        console.log(`SDX Journal Pins | No token center`);
        return false;
    }
    console.log(`SDX Journal Pins | ========== VISION CHECK START ==========`);
    console.log(`SDX Journal Pins | Token: "${token.name}" at (${Math.round(token.center.x)}, ${Math.round(token.center.y)})`);
    console.log(`SDX Journal Pins | Pin position: (${Math.round(pinPosition.x)}, ${Math.round(pinPosition.y)})`);
    const startPos = token.center;
    const endPos = pinPosition;
    const gridSize = canvas.grid.size || 100;
    // Step 1: Check wall collision (line of sight)
    let isBlocked = false;
    if (window.foundry?.canvas?.geometry?.Ray) {
        if (CONFIG.Canvas?.polygonBackends?.sight?.testCollision) {
            isBlocked = CONFIG.Canvas.polygonBackends.sight.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        } else if (canvas.edges?.testCollision) {
            isBlocked = canvas.edges.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        }
    } else if (canvas.walls?.checkCollision) {
        const ray = new Ray(startPos, endPos);
        isBlocked = canvas.walls.checkCollision(ray, { mode: "any", type: "sight" });
    }
    console.log(`SDX Journal Pins | Wall check: ${isBlocked ? 'BLOCKED' : 'CLEAR'}`);
    if (isBlocked) {
        console.log(`SDX Journal Pins | ========== VISION CHECK END (FAIL - wall blocking) ==========`);
        return false;
    }
    // Step 2: Determine the token's vision/light capabilities
    const distanceToPin = Math.hypot(endPos.x - startPos.x, endPos.y - startPos.y);
    const gridDistance = canvas.scene?.grid?.distance || 5;
    const tokenVisionRange = token.document.sight?.range || 0;
    const tokenLightRange = Math.max(token.document.light?.dim || 0, token.document.light?.bright || 0);

    // Convert ranges from units (feet) to pixels
    const visionRangePixels = (tokenVisionRange / gridDistance) * gridSize;
    const lightRangePixels = (tokenLightRange / gridDistance) * gridSize;

    console.log(`SDX Journal Pins | Distance to pin: ${Math.round(distanceToPin)}px`);
    console.log(`SDX Journal Pins | Grid distance: ${gridDistance} units/square`);
    console.log(`SDX Journal Pins | Token vision range: ${tokenVisionRange} units (${Math.round(visionRangePixels)}px)`);
    console.log(`SDX Journal Pins | Token light range: ${tokenLightRange} units (${Math.round(lightRangePixels)}px)`);

    // Step 3: Check visibility based on token's capabilities
    const isIlluminated = isPinPositionIlluminated(pinPosition);
    console.log(`SDX Journal Pins | General lighting check: ${isIlluminated ? 'ILLUMINATED' : 'DARK'}`);

    if (tokenLightRange > 0 && distanceToPin <= lightRangePixels) {
        // Token's own light reaches the pin
        console.log(`SDX Journal Pins | ========== VISION CHECK END (PASS - within token's light range) ==========`);
        return true;
    }

    if (isIlluminated) {
        // Pin is illuminated by SOME source
        // Check if it's within vision range or a default reasonable range.
        const effectiveRange = visionRangePixels > 0 ? visionRangePixels : (60 / gridDistance) * gridSize;
        console.log(`SDX Journal Pins | Pin is illuminated - checking if within effective vision range: ${Math.round(effectiveRange)}px`);

        if (distanceToPin <= effectiveRange) {
            console.log(`SDX Journal Pins | ========== VISION CHECK END (PASS - illuminated and within range) ==========`);
            return true;
        } else {
            console.log(`SDX Journal Pins | ========== VISION CHECK END (FAIL - illuminated but too far away) ==========`);
            return false;
        }
    }

    console.log(`SDX Journal Pins | ========== VISION CHECK END (FAIL - not illuminated or out of range) ==========`);
    return false;
}
/**
 * Check if a position is illuminated by any light source
 * @param {Object} position - {x, y} position to check
 * @param {Token} excludeToken - Optional token whose light should be excluded from the check
 */
// FIXED - Properly converts grid units to pixels for light radii
// Replace isPinPositionIlluminated function with this
function isPinPositionIlluminated(position) {
    if (!canvas.lighting) return false;

    const gridSize = canvas.grid.size || 100;
    const gridDistance = canvas.scene?.grid?.distance || 5;

    // Check ambient light sources
    for (const light of canvas.lighting.placeables || []) {
        if (!light.document.hidden && light.document.config?.dim > 0) {
            const lightPos = { x: light.document.x, y: light.document.y };
            const distance = Math.hypot(position.x - lightPos.x, position.y - lightPos.y);
            const radiusPixels = (light.document.config.dim / gridDistance) * gridSize;

            if (distance <= radiusPixels) {
                if (!checkWallCollision(lightPos, position)) return true;
            }
        }
    }

    // Check token light sources
    for (const tokenObj of canvas.tokens.placeables || []) {
        const lightConfig = tokenObj.document.light;
        if (lightConfig && (lightConfig.dim > 0 || lightConfig.bright > 0)) {
            const tokenPos = tokenObj.center;
            const distance = Math.hypot(position.x - tokenPos.x, position.y - tokenPos.y);
            const lightUnits = Math.max(lightConfig.dim || 0, lightConfig.bright || 0);
            const radiusPixels = (lightUnits / gridDistance) * gridSize;

            if (distance <= radiusPixels) {
                if (!checkWallCollision(tokenPos, position)) return true;
            }
        }
    }
    return false;
}
/**
 * Check if there's a wall between two positions
 */
function checkWallCollision(startPos, endPos) {
    let isBlocked = false;
    if (window.foundry?.canvas?.geometry?.Ray) {
        if (CONFIG.Canvas?.polygonBackends?.sight?.testCollision) {
            isBlocked = CONFIG.Canvas.polygonBackends.sight.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        } else if (canvas.edges?.testCollision) {
            isBlocked = canvas.edges.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        }
    } else if (canvas.walls?.checkCollision) {
        const ray = new Ray(startPos, endPos);
        isBlocked = canvas.walls.checkCollision(ray, { mode: "any", type: "sight" });
    }
    return isBlocked;
}

// ================================================================
// PIN GRAPHICS - PIXI rendering
// ================================================================

class JournalPinGraphics extends PIXI.Container {
    constructor(pinData) {
        super();
        this.pinData = foundry.utils.deepClone(pinData);
        this._circle = null;
        this._label = null;
        this._icon = null;
        this._isDragging = false;
        this._hasDragged = false;
        this._dragOffset = { x: 0, y: 0 };
        this._dragStartPos = { x: 0, y: 0 };

        // Set initial position synchronously to prevent race conditions
        this.position.set(this.pinData.x, this.pinData.y);

        this._labelOffset = { x: 0, y: 0 };
        this._labelContainer = null;

        // Do NOT call _init() here, we defer it until we are indexed in the renderer
    }

    async init() {
        await this._build();
        if (this.destroyed) return;
        this._setupEventListeners();
        return this;
    }

    /**
     * Get the page number (0-indexed position in the journal's pages)
     */
    _getPageNumber() {
        const journal = game.journal.get(this.pinData.journalId);
        if (!journal) {
            console.log("SDX Journal Pins | _getPageNumber: Journal not found", this.pinData.journalId);
            return null;
        }

        // Get sorted pages (same order as shown in the journal)
        const sortedPages = journal.pages.contents.sort((a, b) => a.sort - b.sort);

        if (this.pinData.pageId) {
            // Find the index of the specific page
            const pageIndex = sortedPages.findIndex(p => p.id === this.pinData.pageId);
            console.log("SDX Journal Pins | _getPageNumber: Page", this.pinData.pageId, "is at index", pageIndex);
            return pageIndex >= 0 ? pageIndex : 0;
        } else {
            // Default to first page (index 0)
            console.log("SDX Journal Pins | _getPageNumber: No pageId, using index 0");
            return 0;
        }
    }

    // ===========================================
    // FOUNDRY / TOKENMAGIC INTERFACE MOCK
    // ===========================================

    // We MUST use a getter for document that returns a proxy/wrapper
    // to avoid property collisions with PIXI (especially 'parent' and 'name')
    get document() {
        return {
            id: this.pinData.id,
            documentName: "JournalPin",
            name: this.pinData.label || "Journal Pin",
            parent: canvas.scene,
            getFlag: (s, k) => this.getFlag(s, k),
            setFlag: (s, k, v) => this.setFlag(s, k, v),
            unsetFlag: (s, k) => this.unsetFlag(s, k),
            _TMFXsetFlag: (f) => this._TMFXsetFlag(f),
            _TMFXunsetFlag: () => this._TMFXunsetFlag(),
            _TMFXsetAnimeFlag: (f) => this._TMFXsetAnimeFlag(f),
            _TMFXunsetAnimeFlag: () => this._TMFXunsetAnimeFlag(),
            _TMFXgetPlaceableType: () => this._TMFXgetPlaceableType(),
            _TMFXgetMaxFilterRank: () => this._TMFXgetMaxFilterRank(),
            get object() { return this; }
        };
    }

    get id() {
        return this.pinData.id;
    }

    // Mock getFlag for TokenMagic
    getFlag(scope, key) {
        const flags = this.pinData.flags || {};
        if (scope && key) return foundry.utils.getProperty(flags, `${scope}.${key}`);
        if (scope) return flags[scope];
        return flags;
    }

    async setFlag(scope, key, value) {
        const updateData = {};
        updateData[`flags.${scope}.${key}`] = value;
        return await JournalPinManager.update(this.pinData.id, updateData);
    }

    async unsetFlag(scope, key) {
        const updateData = {};
        updateData[`flags.${scope}.-=${key}`] = null;
        return await JournalPinManager.update(this.pinData.id, updateData);
    }

    // Mock CanvasDocument / PlaceableObject methods for TMFX
    async _TMFXsetFlag(flag) {
        return await this.setFlag("tokenmagic", "filters", flag);
    }

    async _TMFXunsetFlag() {
        return await this.unsetFlag("tokenmagic", "filters");
    }

    async _TMFXsetAnimeFlag(flag) {
        return await this.setFlag("tokenmagic", "animeInfo", flag);
    }

    async _TMFXunsetAnimeFlag() {
        return await this.unsetFlag("tokenmagic", "animeInfo");
    }

    _TMFXgetPlaceableType() {
        return "JournalPin";
    }

    _TMFXgetSprite() {
        return this;
    }

    _TMFXcheckSprite() {
        return true;
    }

    _TMFXgetMaxFilterRank() {
        const filters = this.filters || [];
        if (filters.length === 0) return 10000;
        return Math.max(...filters.map(f => f.rank || 0)) + 1;
    }

    async TMFXaddFilters(paramsArray, replace = false) {
        if (window.TokenMagic) await window.TokenMagic.addFilters(this, paramsArray, replace);
    }

    async TMFXupdateFilters(paramsArray) {
        if (window.TokenMagic) await window.TokenMagic.updateFiltersByPlaceable(this, paramsArray);
    }

    async TMFXdeleteFilters(filterId = null) {
        if (window.TokenMagic) await window.TokenMagic.deleteFilters(this, filterId);
    }

    // Mimic PlaceableObjectProto._TMFXsetRawFilters
    _TMFXsetRawFilters(filters) {
        if (!this.filters) this.filters = [];
        // Simple append for now as TMFX usually manages the array
        if (filters === null) {
            this.filters = null;
        } else {
            if (Array.isArray(filters)) this.filters = filters;
            else this.filters.push(filters);
        }
    }

    async update(pinData) {
        this.pinData = foundry.utils.deepClone(pinData);

        // Update Transform
        this.position.set(this.pinData.x, this.pinData.y);

        // Rebuild graphics if needed (style change)
        // Ideally we check if style changed, but rebuilding is safer
        await this._build();

        // Refresh TMFX filters from flags
        if (window.TokenMagic) {
            const filters = this.getFlag("tokenmagic", "filters");
            window.TokenMagic._clearImgFiltersByPlaceable(this);
            if (filters) {
                window.TokenMagic._assignFilters(this, filters);
            }
        }
    }


    animatePing(type = "ping") {
        if (!window.gsap) {
            if (canvas.ping) canvas.ping({ x: this.pinData.x, y: this.pinData.y });
            return;
        }

        const style = { ...getPinStyle(), ...(this.pinData.style || {}) };
        const pingAnim = (type === "bring")
            ? (style.bringAnimation || "ripple")
            : (style.pingAnimation || "ripple");

        if (pingAnim === "none") return;

        // Logic to reset scale after animation
        const hoverAnim = style.hoverAnimation;
        const isHoverScale = this.isHovered && (hoverAnim === true || hoverAnim === "scale");
        const restingScale = isHoverScale ? 1.2 : 1.0;

        gsap.killTweensOf(this);
        gsap.killTweensOf(this.scale);

        if (pingAnim === "ripple") {
            const color = style.ringColor || "#ffffff";
            let colorNum = 0xFFFFFF;
            try {
                if (typeof color === "string" && color.startsWith("#")) colorNum = parseInt(color.slice(1), 16);
                else if (typeof color === "number") colorNum = color;
            } catch (e) { }

            const ripple = new PIXI.Graphics();
            ripple.lineStyle(6, colorNum, 0.8);
            ripple.drawCircle(0, 0, 40);
            ripple.endFill();
            ripple.alpha = 0;
            ripple.scale.set(0.5);

            this.addChild(ripple);

            const tl = gsap.timeline({ onComplete: () => ripple.destroy() });
            tl.to(ripple, { alpha: 0.8, duration: 0.1 })
                .to(ripple, { alpha: 0, duration: 1.2 }, "<")
                .to(ripple.scale, { x: 4, y: 4, duration: 1.3, ease: "power2.out" }, "<");

            gsap.fromTo(this.scale,
                { x: 1.6, y: 1.6 },
                { x: restingScale, y: restingScale, duration: 1.0, ease: "elastic.out(1, 0.5)" }
            );

        } else if (pingAnim === "flash") {
            gsap.fromTo(this, { pixi: { brightness: 3 } }, { pixi: { brightness: 1 }, duration: 1.0, ease: "power2.out" });
            gsap.fromTo(this.scale,
                { x: 1.5, y: 1.5 },
                { x: restingScale, y: restingScale, duration: 1.0, ease: "elastic.out(1, 0.5)" }
            );

        } else if (pingAnim === "shake") {
            const originalX = this.pinData.x;
            gsap.to(this, {
                x: "+=5", yoyo: true, repeat: 9, duration: 0.05, onComplete: () => {
                    this.x = originalX;
                }
            });
            gsap.to(this.scale, {
                x: 1.3, y: 1.3, duration: 0.1, yoyo: true, repeat: 3, onComplete: () => {
                    gsap.to(this.scale, { x: restingScale, y: restingScale, duration: 0.2 });
                }
            });
        }
    }

    async _build() {
        if (this.destroyed) return;

        // Cleanup old label container BEFORE building new content
        // This prevents orphaned labels when pin is moved or rebuilt
        if (this._labelContainer) {
            if (this._labelContainer.parent) {
                this._labelContainer.parent.removeChild(this._labelContainer);
            }
            this._labelContainer.destroy({ children: true });
            this._labelContainer = null;
        }

        // Don't remove children yet, wait until new content is ready


        // Get global style settings
        const globalStyle = getPinStyle();

        // Merge: global defaults < pin-specific style overrides
        const style = { ...globalStyle, ...(this.pinData.style || {}) };

        const size = style.size || 32;
        const radius = size / 2;

        const fillColor = style.fillColor || "#000000";
        const ringWidth = style.ringWidth || 3;
        const baseOpacity = style.opacity ?? 1.0;
        const fillOpacity = (style.fillOpacity ?? 1.0) * baseOpacity;
        const ringOpacity = (style.ringOpacity ?? 1.0) * baseOpacity;



        // Use red dashed stroke if pin is GM-only (visible indicator for GM)
        let ringColor;
        let ringStyle = style.ringStyle || "solid";
        if (this.pinData.gmOnly && game.user?.isGM) {
            ringColor = "#FF4444"; // Red for GM-only pins
            ringStyle = "dashed";  // Forced dashed for GM-only
        } else {
            ringColor = style.ringColor || "#ffffff";
        }

        const fillColorNum = parseInt(fillColor.slice(1), 16);
        const ringColorNum = parseInt(ringColor.slice(1), 16);

        const container = new PIXI.Container();

        const shape = style.shape || "circle";

        // Special handling for Image Shape
        if (shape === "image") {
            try {
                // If shape is image, we skip the standard graphics builder
                // We create a sprite directly container

                const imagePath = style.imagePath;
                if (imagePath) {
                    const texture = await loadTexture(imagePath);
                    if (texture) {
                        const sprite = new PIXI.Sprite(texture);
                        // Center anchor
                        sprite.anchor.set(0.5);

                        // Scale to fit size, maintaining aspect ratio usually, 
                        // but here we might force square fit or contain? 
                        // Let's use "contain" logic within the size box

                        const maxDim = Math.max(texture.width, texture.height);
                        const scale = size / maxDim;

                        sprite.width = texture.width * scale;
                        sprite.height = texture.height * scale;

                        // Apply opacity
                        sprite.alpha = baseOpacity;

                        container.addChild(sprite);
                    }
                } else {
                    // Fallback if no image path: broken image placeholder
                    const placeholder = new PIXI.Graphics();
                    placeholder.lineStyle(2, 0xFF0000, baseOpacity);
                    placeholder.moveTo(-radius, -radius);
                    placeholder.lineTo(radius, radius);
                    placeholder.moveTo(radius, -radius);
                    placeholder.lineTo(-radius, radius);
                    placeholder.drawRect(-radius, -radius, size, size);
                    container.addChild(placeholder);
                }

                // Add content (text/number/icon) on top?
                // Plan assumption: yes, standard content renders on top
                // So we fall through to the content rendering block...

                // We need a dummy _circle reference because content rendering logic might use it?
                // Checking code... no, content is added to 'container'.
                // BUT _drawStyledStroke uses _circle. We skip that for image.

                // We successfully added the visual to 'container'.
                // The code below expects 'this._circle' to exist for shape drawing logic.
                // We should bail out of the shape drawing part but continue to content.

                // Let's restructure a bit.
                // We'll define a flag to skip standard shape drawing.

            } catch (err) {
                console.error("SDX Journal Pins | Error loading pin image:", err);
            }
        }
        else {
            // Standard Shape Drawing
            const circle = new PIXI.Graphics();
            this._circle = circle; // Keep reference if needed

            this._circle.beginFill(fillColorNum, fillOpacity);

            // Use standard lineStyle for solid, or helper for dashed/dotted
            if (ringStyle === "solid") {
                this._circle.lineStyle(ringWidth, ringColorNum, ringOpacity);
            } else {
                this._circle.lineStyle(0); // Standard stroke off for segment drawing
            }

            switch (shape) {
                case "circle":
                    this._circle.drawCircle(0, 0, radius);
                    break;
                case "square":
                    const cornerRadius = style.borderRadius ?? 4;
                    this._circle.drawRoundedRect(-radius, -radius, size, size, cornerRadius);
                    break;
                case "diamond":
                    const half = radius;
                    this._circle.moveTo(0, -half);
                    this._circle.lineTo(half, 0);
                    this._circle.lineTo(0, half);
                    this._circle.lineTo(-half, 0);
                    this._circle.closePath();
                    break;
                case "hexagon":
                    const hexRadius = radius;
                    for (let i = 0; i < 6; i++) {
                        const angle = (Math.PI / 3) * i - Math.PI / 2;
                        const hx = Math.cos(angle) * hexRadius;
                        const hy = Math.sin(angle) * hexRadius;
                        if (i === 0) this._circle.moveTo(hx, hy);
                        else this._circle.lineTo(hx, hy);
                    }
                    this._circle.closePath();
                    break;
                default:
                    this._circle.drawCircle(0, 0, radius);
            }

            this._circle.endFill();
            container.addChild(this._circle);

            // Draw custom stroke if not solid AND not image
            if (ringStyle !== "solid") {
                const cornerRadius = style.borderRadius ?? 4;
                this._drawStyledStroke(this._circle, shape, radius, size, ringWidth, ringColorNum, ringOpacity, ringStyle, cornerRadius);
            }
        }

        // Add content: number, symbol, custom icon, or custom text
        const contentType = style.contentType || (style.showIcon ? "symbol" : "number");

        if (contentType === "symbol" || contentType === "icon") {
            // FontAwesome icon (renamed to symbol)
            const iconClass = style.symbolClass || style.iconClass || "fa-solid fa-book-open";
            const symbolColor = style.symbolColor || style.fontColor || "#ffffff";
            const symbolColorNum = typeof symbolColor === "string" && symbolColor.startsWith("#")
                ? parseInt(symbolColor.slice(1), 16)
                : 0xFFFFFF;

            await this._addIcon(container, iconClass, radius, symbolColorNum);
            // Check if destroyed during await
            if (this.destroyed) return;
        }
        else if (contentType === "customIcon") {
            // Custom SVG icon from assets
            const iconPath = style.customIconPath;
            if (iconPath) {
                const iconColor = style.iconColor || "#ffffff";
                const iconColorNum = typeof iconColor === "string" && iconColor.startsWith("#")
                    ? parseInt(iconColor.slice(1), 16)
                    : 0xFFFFFF;
                await this._addSvgIcon(container, iconPath, radius, iconColorNum);
                if (this.destroyed) return;
            }
        } else {
            // Show text (page number or custom)
            const fontColor = style.fontColor || "#ffffff";
            const fontColorNum = typeof fontColor === "string" && fontColor.startsWith("#")
                ? parseInt(fontColor.slice(1), 16)
                : 0xFFFFFF;

            let textValue = "";
            if (contentType === "text") {
                textValue = style.customText || "";
            } else {
                const pageNumber = this._getPageNumber();
                textValue = pageNumber !== null ? String(pageNumber) : "";
            }

            if (textValue !== "") {
                const fontSize = style.fontSize || Math.max(10, radius * 0.9);
                const fontFamily = style.fontFamily || "Arial";
                const fontWeight = style.fontWeight || "bold";

                // Await font loading if it's a custom font
                if (fontFamily && fontFamily !== "Arial") {
                    try {
                        await document.fonts.load(`16px ${fontFamily}`);
                    } catch (e) {
                        console.warn(`SDX Journal Pins | Failed to load font: ${fontFamily}`);
                    }
                }

                const label = new PIXI.Text(textValue, {
                    fontFamily: fontFamily,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    fill: fontColorNum,
                    stroke: style.fontStroke || "#000000",
                    strokeThickness: style.fontStrokeThickness ?? 0,
                    fontStyle: style.fontItalic ? "italic" : "normal",
                    align: "center"
                });
                label.anchor.set(0.5, 0.5);
                label.position.set(0, 0);

                // For diamond shape, we need to rotate the text back
                if (shape === "diamond") {
                    label.rotation = -Math.PI / 4;
                }

                container.addChild(label);
            }
        }

        // Everything is ready, SWAP children to avoid flicker
        this.removeChildren();
        this.addChild(container);

        // ===================================
        // ADD OPTIONAL HOVER LABEL
        // ===================================
        if (style.labelText) {
            this._labelContainer = new PIXI.Container();

            const labelFontFamily = style.labelFontFamily || "Arial";

            // Await font loading if it's a custom font
            if (labelFontFamily && labelFontFamily !== "Arial") {
                try {
                    await document.fonts.load(`16px ${labelFontFamily}`);
                } catch (e) {
                    console.warn(`SDX Journal Pins | Failed to load label font: ${labelFontFamily}`);
                }
            }

            // Create text with extra padding for script/italic fonts that bleed outside bounds
            const fontSize = style.labelFontSize || 16;
            const labelText = new PIXI.Text(style.labelText, {
                fontFamily: labelFontFamily,
                fontSize: fontSize,
                fill: style.labelColor || "#ffffff",
                stroke: style.labelStroke || "#000000",
                strokeThickness: style.labelStrokeThickness ?? 4,
                fontWeight: style.labelBold ? "bold" : "normal",
                fontStyle: style.labelItalic ? "italic" : "normal",
                align: "center",
                padding: Math.ceil(fontSize * 0.4) // Extra padding for script/decorative fonts
            });

            // Background
            const padX = 8;
            const padY = 4;
            let bg;
            let bgColorGraphic;

            if (style.labelBackground === "image") {
                try {
                    let path;

                    // Check for custom image path first
                    if (style.labelBorderImagePath && typeof style.labelBorderImagePath === "string" && style.labelBorderImagePath.trim() !== "") {
                        path = style.labelBorderImagePath.trim();
                    }

                    if (!path) return;

                    const tex = await loadTexture(path);
                    if (tex) {
                        const sT = parseInt(style.labelBorderSliceTop) || 15;
                        const sR = parseInt(style.labelBorderSliceRight) || 15;
                        const sB = parseInt(style.labelBorderSliceBottom) || 15;
                        const sL = parseInt(style.labelBorderSliceLeft) || 15;

                        // PIXI.NineSlicePlane(texture, leftWidth, topHeight, rightWidth, bottomHeight)
                        bg = new PIXI.NineSlicePlane(tex, sL, sT, sR, sB);

                        // The background size should cover the text plus padding
                        bg.width = labelText.width + (padX * 4);
                        bg.height = labelText.height + (padY * 4);

                        // Create optional background color behind the image
                        const colorVal = style.labelBackgroundColor;
                        // Check if opacity is > 0
                        if (style.labelBackgroundOpacity > 0) {
                            bgColorGraphic = new PIXI.Graphics();
                            const bgColor = typeof Color !== "undefined" ? Color.from(colorVal || "#000000") : (colorVal || "#000000");
                            bgColorGraphic.beginFill(bgColor, style.labelBackgroundOpacity);

                            // Fill slightly smaller than the full border to fit inside
                            // For a complex border, a simple rect is often best "behind" it.
                            bgColorGraphic.drawRect(0, 0, bg.width, bg.height);
                            bgColorGraphic.endFill();
                        }
                    }
                } catch (e) {
                    console.error("SDX Journal Pins | Failed to load label background", e);
                }
            } else if (style.labelBackground === "solid") {
                bg = new PIXI.Graphics();
                const bgColor = typeof Color !== "undefined" ? Color.from(style.labelBackgroundColor || "#000000") : (style.labelBackgroundColor || "#000000");
                const borderColor = typeof Color !== "undefined" ? Color.from(style.labelBorderColor || "#ffffff") : (style.labelBorderColor || "#ffffff");

                bg.beginFill(bgColor, style.labelBackgroundOpacity ?? 0.8);
                if ((style.labelBorderWidth ?? 0) > 0) {
                    bg.lineStyle(style.labelBorderWidth, borderColor, 1);
                }
                bg.drawRoundedRect(0, 0, labelText.width + (padX * 2), labelText.height + (padY * 2), style.labelBorderRadius || 4);
                bg.endFill();
            }

            // Assemble container
            if (bg) {
                const w = bg.width;
                const h = bg.height;
                const pivotX = w / 2;
                const pivotY = h / 2;

                // Add color layer first (behind)
                if (bgColorGraphic) {
                    bgColorGraphic.pivot.set(pivotX, pivotY);
                    bgColorGraphic.position.set(0, 0);
                    this._labelContainer.addChild(bgColorGraphic);
                }

                // Add border/frame
                if (bg instanceof PIXI.Graphics) bg.pivot.set(pivotX, pivotY);
                else bg.pivot.set(pivotX, pivotY);
                bg.position.set(0, 0);
                this._labelContainer.addChild(bg);
            }

            // Center text
            labelText.anchor.set(0.5, 0.5);
            labelText.position.set(0, 0);
            this._labelContainer.addChild(labelText);

            // Position container relative to pin
            const bgW = bg ? bg.width : labelText.width;
            const bgH = bg ? bg.height : labelText.height;
            const pinRadius = style.size / 2;
            const padding = style.labelOffset ?? 5;

            let posX = 0;
            let posY = 0;

            switch (style.labelAnchor) {
                case "top":
                    posY = -pinRadius - (bgH / 2) - padding;
                    break;
                case "left":
                    posX = -pinRadius - (bgW / 2) - padding;
                    break;
                case "right":
                    posX = pinRadius + (bgW / 2) + padding;
                    break;
                case "center":
                    posX = 0;
                    posY = 0;
                    break;
                case "bottom":
                default:
                    posY = pinRadius + (bgH / 2) + padding;
                    break;
            }

            this._labelContainer.position.set(posX, posY);

            // Store offset for movement syncing
            this._labelOffset = { x: posX, y: posY };

            // Initial Visibility
            this._labelContainer.visible = !style.labelShowOnHover;

            // Add to the SEPARATE label container if available, otherwise fallback to self
            const rendererLabelContainer = JournalPinRenderer.getLabelContainer();
            if (rendererLabelContainer) {
                // Determine absolute position
                this._labelContainer.position.set(this.position.x + posX, this.position.y + posY);
                rendererLabelContainer.addChild(this._labelContainer);
            } else {
                this.addChild(this._labelContainer);
            }
        }

        // Hit area based on shape
        if (shape === "circle") {
            this.hitArea = new PIXI.Circle(0, 0, radius);
        } else {
            this.hitArea = new PIXI.Rectangle(-radius, -radius, size, size);
        }

        // CRITICAL: Interactivity settings
        this.interactive = true;
        this.eventMode = "static";
        this.cursor = "pointer";
        this.interactiveChildren = false;

        // Add status indicators for GM
        if (game.user?.isGM && this.pinData.requiresVision) {
            await this._addVisionIndicator(container, radius);
        }

        // Apply TMFX filters if present
        if (window.TokenMagic) {
            const filters = this.getFlag("tokenmagic", "filters");
            if (filters) {
                window.TokenMagic._assignFilters(this, filters);
            }
        }

        console.log(`SDX Journal Pins | Pin built - interactive:${this.interactive}, eventMode:${this.eventMode}, cursor:${this.cursor}`);
    }
    /**
     * Draw a dashed or dotted stroke manually since PIXI.Graphics doesn't support them natively
     * @param {number} cornerRadius - Border radius for square shapes
     */
    _drawStyledStroke(graphics, shape, radius, size, width, color, opacity, style, cornerRadius = 4) {
        graphics.lineStyle(width, color, opacity);

        const isDotted = style === "dotted";
        const dashLen = isDotted ? width : width * 3;
        const gapLen = isDotted ? width * 2 : width * 2;

        if (shape === "circle") {
            const circumference = 2 * Math.PI * radius;
            const numSegments = Math.floor(circumference / (dashLen + gapLen));
            const actualSegmentLen = circumference / numSegments;
            const dashAngle = (dashLen / circumference) * 2 * Math.PI;
            const gapAngle = (gapLen / circumference) * 2 * Math.PI;
            const stepAngle = (actualSegmentLen / circumference) * 2 * Math.PI;

            for (let i = 0; i < numSegments; i++) {
                const startAngle = i * stepAngle;
                if (isDotted) {
                    // Draw a small dot
                    const x = Math.cos(startAngle) * radius;
                    const y = Math.sin(startAngle) * radius;
                    graphics.lineStyle(0);
                    graphics.beginFill(color, opacity);
                    graphics.drawCircle(x, y, width / 2);
                    graphics.endFill();
                } else {
                    // Draw a dash arc
                    graphics.arc(0, 0, radius, startAngle, startAngle + dashAngle);
                    graphics.moveTo(Math.cos(startAngle + stepAngle) * radius, Math.sin(startAngle + stepAngle) * radius);
                }
            }
        } else if (shape === "square" && cornerRadius > 0) {
            // Rounded square - draw edges with corner arcs
            const cr = Math.min(cornerRadius, radius); // Clamp corner radius
            const innerRadius = radius - cr;

            // Build path segments: straight edges + corner arcs
            // Corners are at: top-right, bottom-right, bottom-left, top-left
            const segments = [];

            // Top edge (left to right)
            segments.push({ type: "line", x1: -innerRadius, y1: -radius, x2: innerRadius, y2: -radius });
            // Top-right corner arc
            segments.push({ type: "arc", cx: innerRadius, cy: -innerRadius, r: cr, startAngle: -Math.PI / 2, endAngle: 0 });
            // Right edge (top to bottom)
            segments.push({ type: "line", x1: radius, y1: -innerRadius, x2: radius, y2: innerRadius });
            // Bottom-right corner arc
            segments.push({ type: "arc", cx: innerRadius, cy: innerRadius, r: cr, startAngle: 0, endAngle: Math.PI / 2 });
            // Bottom edge (right to left)
            segments.push({ type: "line", x1: innerRadius, y1: radius, x2: -innerRadius, y2: radius });
            // Bottom-left corner arc
            segments.push({ type: "arc", cx: -innerRadius, cy: innerRadius, r: cr, startAngle: Math.PI / 2, endAngle: Math.PI });
            // Left edge (bottom to top)
            segments.push({ type: "line", x1: -radius, y1: innerRadius, x2: -radius, y2: -innerRadius });
            // Top-left corner arc
            segments.push({ type: "arc", cx: -innerRadius, cy: -innerRadius, r: cr, startAngle: Math.PI, endAngle: 3 * Math.PI / 2 });

            // Draw dashed/dotted pattern along the path
            for (const seg of segments) {
                if (seg.type === "line") {
                    const dx = seg.x2 - seg.x1;
                    const dy = seg.y2 - seg.y1;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = dx / len;
                    const ny = dy / len;

                    let dist = 0;
                    while (dist < len) {
                        const segLen = Math.min(dashLen, len - dist);
                        const sx = seg.x1 + nx * dist;
                        const sy = seg.y1 + ny * dist;

                        if (isDotted) {
                            graphics.lineStyle(0);
                            graphics.beginFill(color, opacity);
                            graphics.drawCircle(sx, sy, width / 2);
                            graphics.endFill();
                        } else {
                            graphics.lineStyle(width, color, opacity);
                            graphics.moveTo(sx, sy);
                            graphics.lineTo(sx + nx * segLen, sy + ny * segLen);
                        }
                        dist += dashLen + gapLen;
                    }
                } else if (seg.type === "arc") {
                    const arcLen = seg.r * Math.abs(seg.endAngle - seg.startAngle);
                    const numDashes = Math.max(1, Math.floor(arcLen / (dashLen + gapLen)));
                    const angleStep = (seg.endAngle - seg.startAngle) / numDashes;
                    const dashAngle = (dashLen / arcLen) * (seg.endAngle - seg.startAngle);

                    for (let i = 0; i < numDashes; i++) {
                        const startAngle = seg.startAngle + i * angleStep;
                        if (isDotted) {
                            const x = seg.cx + Math.cos(startAngle) * seg.r;
                            const y = seg.cy + Math.sin(startAngle) * seg.r;
                            graphics.lineStyle(0);
                            graphics.beginFill(color, opacity);
                            graphics.drawCircle(x, y, width / 2);
                            graphics.endFill();
                        } else {
                            graphics.lineStyle(width, color, opacity);
                            graphics.arc(seg.cx, seg.cy, seg.r, startAngle, Math.min(startAngle + dashAngle, seg.endAngle));
                            if (i < numDashes - 1) {
                                const nextAngle = seg.startAngle + (i + 1) * angleStep;
                                graphics.moveTo(seg.cx + Math.cos(nextAngle) * seg.r, seg.cy + Math.sin(nextAngle) * seg.r);
                            }
                        }
                    }
                }
            }
        } else {
            // Polygon shapes (non-rounded square, diamond, hexagon)
            // For simplicity, we'll draw straight lines with patterns
            const points = [];
            if (shape === "square") {
                points.push({ x: -radius, y: -radius }, { x: radius, y: -radius }, { x: radius, y: radius }, { x: -radius, y: radius }, { x: -radius, y: -radius });
            } else if (shape === "diamond") {
                points.push({ x: 0, y: -radius }, { x: radius, y: 0 }, { x: 0, y: radius }, { x: -radius, y: 0 }, { x: 0, y: -radius });
            } else if (shape === "hexagon") {
                for (let i = 0; i <= 6; i++) {
                    const angle = (Math.PI / 3) * i - Math.PI / 2;
                    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
                }
            }

            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const nx = dx / len;
                const ny = dy / len;

                let dist = 0;
                while (dist < len) {
                    const segLen = Math.min(dashLen, len - dist);
                    const sx = p1.x + nx * dist;
                    const sy = p1.y + ny * dist;

                    if (isDotted) {
                        graphics.lineStyle(0);
                        graphics.beginFill(color, opacity);
                        graphics.drawCircle(sx, sy, width / 2);
                        graphics.endFill();
                    } else {
                        graphics.lineStyle(width, color, opacity);
                        graphics.moveTo(sx, sy);
                        graphics.lineTo(sx + nx * segLen, sy + ny * segLen);
                    }
                    dist += dashLen + gapLen;
                }
            }
        }
    }

    async _addIcon(container, iconClass, radius, color) {
        // Create icon using a canvas
        const iconSize = radius * 1.2;
        const canvas = document.createElement("canvas");
        const padding = 4;
        canvas.width = iconSize + padding * 2;
        canvas.height = iconSize + padding * 2;
        const ctx = canvas.getContext("2d");

        const tempDiv = document.createElement("div");
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.fontSize = `${iconSize}px`;
        tempDiv.innerHTML = `<i class="${iconClass}"></i>`;
        document.body.appendChild(tempDiv);

        await new Promise(r => setTimeout(r, 50));
        if (this.destroyed) {
            if (tempDiv.parentNode) document.body.removeChild(tempDiv);
            return;
        }

        const iconElement = tempDiv.querySelector("i");
        if (iconElement) {
            try {
                const beforeStyle = window.getComputedStyle(iconElement, "::before");
                const content = beforeStyle.content;
                const fontFamily = beforeStyle.fontFamily;

                if (content && content !== "none" && content !== '""') {
                    const iconChar = content.replace(/['"]/g, "");
                    const colorHex = "#" + color.toString(16).padStart(6, "0");
                    ctx.fillStyle = colorHex;
                    ctx.font = `${iconSize}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(iconChar, canvas.width / 2, canvas.height / 2);
                }
            } catch (e) {
                // Fallback
            }
        }

        document.body.removeChild(tempDiv);

        const texture = PIXI.Texture.from(canvas);
        this._icon = new PIXI.Sprite(texture);
        this._icon.anchor.set(0.5);
        this._icon.position.set(0, 0);
        container.addChild(this._icon);
    }

    async _addSvgIcon(container, iconPath, radius, color) {
        // Custom SVGs usually need to be a bit bigger to fill the pin
        const size = radius * 1.3;
        try {
            // Fetch SVG text
            const response = await fetch(iconPath);
            let svgText = await response.text();
            if (this.destroyed) return;

            // Replace colors in SVG text - simple heuristic to colorize monochrome SVGs
            const colorHex = "#" + color.toString(16).padStart(6, "0");

            // Replace existing fill/stroke attributes or add to root if missing
            if (svgText.includes('fill=')) {
                svgText = svgText.replace(/fill="[^"]*"/g, `fill="${colorHex}"`);
            } else {
                svgText = svgText.replace('<svg ', `<svg fill="${colorHex}" `);
            }

            if (svgText.includes('stroke=')) {
                svgText = svgText.replace(/stroke="[^"]*"/g, `stroke="${colorHex}"`);
            }

            // Convert to base64 data URI
            const svgBase64 = "data:image/svg+xml;base64," + btoa(svgText);

            // Load as texture using Foundry's standard helper
            const texture = await loadTexture(svgBase64);
            if (this.destroyed) return;

            this._icon = new PIXI.Sprite(texture);
            this._icon.width = size;
            this._icon.height = size;
            this._icon.anchor.set(0.5);
            this._icon.position.set(0, 0);

            // Handle rotation for diamond shape
            const globalStyle = getPinStyle();
            const style = { ...globalStyle, ...(this.pinData.style || {}) };
            if (style.shape === "diamond") {
                this._icon.rotation = -Math.PI / 4;
            }

            container.addChild(this._icon);
        } catch (err) {
            console.error(`SDX Journal Pins | Failed to load custom SVG: ${iconPath}`, err);
        }
    }

    async _addVisionIndicator(container, radius) {
        const iconClass = "fa-solid fa-eye";
        const iconSize = radius * 0.8;
        const color = 0xFFFFFF;

        const canvas = document.createElement("canvas");
        const padding = 4;
        canvas.width = iconSize + padding * 2;
        canvas.height = iconSize + padding * 2;
        const ctx = canvas.getContext("2d");

        const tempDiv = document.createElement("div");
        tempDiv.style.position = "absolute";
        tempDiv.style.left = "-9999px";
        tempDiv.style.fontSize = `${iconSize}px`;
        tempDiv.innerHTML = `<i class="${iconClass}"></i>`;
        document.body.appendChild(tempDiv);

        await new Promise(r => setTimeout(r, 50));
        if (this.destroyed) {
            if (tempDiv.parentNode) document.body.removeChild(tempDiv);
            return;
        }

        const iconElement = tempDiv.querySelector("i");
        if (iconElement) {
            try {
                const beforeStyle = window.getComputedStyle(iconElement, "::before");
                const content = beforeStyle.content;
                const fontFamily = beforeStyle.fontFamily;

                if (content && content !== "none" && content !== '""') {
                    const iconChar = content.replace(/['"]/g, "");

                    // Shadow for visibility
                    ctx.shadowBlur = 4;
                    ctx.shadowColor = "black";

                    ctx.fillStyle = "#ffffff";
                    ctx.font = `${iconSize}px ${fontFamily}`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(iconChar, canvas.width / 2, canvas.height / 2);
                }
            } catch (e) { }
        }

        document.body.removeChild(tempDiv);

        const texture = PIXI.Texture.from(canvas);
        const indicator = new PIXI.Sprite(texture);
        indicator.anchor.set(0.5);

        // Position at top-right
        const angle = -Math.PI / 4;
        const dist = radius * 1.1;
        indicator.position.set(
            Math.cos(angle) * dist,
            Math.sin(angle) * dist
        );

        container.addChild(indicator);
    }

    async update(newData) {
        // Optimization: If data hasn't changed, don't rebuild
        // BUT: Always check TMFX flags if we have them, as shaders might need refresh
        const hasTMFX = !!(this.pinData.flags?.tokenmagic || newData.flags?.tokenmagic);

        if (!hasTMFX && foundry.utils.objectsEqual(this.pinData, newData)) {
            return;
        }

        console.log(`SDX Journal Pins | Updating pin ${this.id}. hasTMFX: ${hasTMFX}`);

        this._removeEventListeners();
        this.pinData = foundry.utils.deepClone(newData);

        // Rebuild the graphics
        await this._build();

        // Refresh TMFX filters from flags
        if (window.TokenMagic && !this.destroyed) {
            const filters = this.getFlag("tokenmagic", "filters");
            console.log(`SDX Journal Pins | Syncing TMFX filters for ${this.id}:`, filters);

            window.TokenMagic._clearImgFiltersByPlaceable(this);
            if (filters && Array.isArray(filters) && filters.length > 0) {
                window.TokenMagic._assignFilters(this, filters);
            } else {
                console.log(`SDX Journal Pins | No filters found, clearing manually.`);
                this.filters = null;
            }
        }

        this._setupEventListeners();
    }

    _setupEventListeners() {
        this.on("pointerenter", this._onPointerEnter, this);
        this.on("pointerleave", this._onPointerLeave, this);
        this.on("pointerdown", this._onPointerDown, this);
        this.on("globalpointermove", this._onPointerMove, this);
        this.on("pointerup", this._onPointerUp, this);
        this.on("pointerupoutside", this._onPointerUp, this);
    }

    _removeEventListeners() {
        this.off("pointerenter", this._onPointerEnter, this);
        this.off("pointerleave", this._onPointerLeave, this);
        this.off("pointerdown", this._onPointerDown, this);
        this.off("globalpointermove", this._onPointerMove, this);
        this.off("pointerup", this._onPointerUp, this);
        this.off("pointerupoutside", this._onPointerUp, this);
    }

    _onPointerEnter(event) {
        // Normalize hideTooltip from multiple sources
        const style = this.pinData.style || {};
        const hideTooltip = this.pinData.hideTooltip || style.hideTooltip || false;

        if (!hideTooltip) {
            JournalPinTooltip.show(this.pinData, event);
        }
        if (this._labelContainer && style.labelShowOnHover) {
            this._labelContainer.visible = true;
        }

        // Hover Animation
        let animType = style.hoverAnimation;
        if (animType === true) animType = "scale";
        if (!animType) animType = "none";

        if (animType !== "none" && window.gsap) {
            gsap.killTweensOf(this);
            gsap.killTweensOf(this.scale);

            if (animType === "scale") {
                gsap.to(this.scale, { x: 1.2, y: 1.2, duration: 0.3, ease: "back.out(1.7)" });
            } else if (animType === "pulse") {
                gsap.to(this.scale, { x: 1.15, y: 1.15, duration: 0.5, yoyo: true, repeat: -1, ease: "sine.inOut" });
            } else if (animType === "shake") {
                gsap.to(this, {
                    rotation: 0.2, duration: 0.05, yoyo: true, repeat: 5, ease: "power1.inOut", onComplete: () => {
                        gsap.to(this, { rotation: 0, duration: 0.1 });
                    }
                });
                gsap.to(this.scale, { x: 1.1, y: 1.1, duration: 0.2 });
            } else if (animType === "brightness") {
                gsap.to(this, { pixi: { brightness: 1.5 }, duration: 0.4, yoyo: true, repeat: -1, ease: "sine.inOut" });
            } else if (animType === "hue") {
                gsap.to(this, { pixi: { hue: 180 }, duration: 2, repeat: -1, yoyo: true, ease: "linear" });
            }
        }
    }

    _onPointerLeave(event) {

        JournalPinTooltip.hide();
        if (this._labelContainer && this.pinData.style?.labelShowOnHover) {
            this._labelContainer.visible = false;
        }

        // Hover Animation Reset
        const style = this.pinData.style || {};
        if (window.gsap) {
            gsap.killTweensOf(this);
            gsap.killTweensOf(this.scale);

            // Smooth reset
            gsap.to(this.scale, { x: 1.0, y: 1.0, duration: 0.3, ease: "power2.out" });
            gsap.to(this, { rotation: 0, pixi: { brightness: 1, hue: 0 }, duration: 0.3, ease: "power2.out" });
        } else {
            this.scale.set(1.0);
            this.rotation = 0;
        }
    }

    _onPointerDown(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || event;
        const button = originalEvent.button ?? 0;

        if (button === 0) {
            // Prevent Foundry from starting a selection marquee
            event.stopPropagation();

            this._isDragging = true;
            this._hasDragged = false;
            const local = this.parent.toLocal(event.global);
            this._dragOffset.x = this.position.x - local.x;
            this._dragOffset.y = this.position.y - local.y;
            this._dragStartPos.x = this.position.x;
            this._dragStartPos.y = this.position.y;
            JournalPinTooltip.hide();
        } else if (button === 2) {
            event.stopPropagation();
            this._showContextMenu(event);
        }
    }

    _onPointerMove(event) {
        if (!this._isDragging) return;

        event.stopPropagation();
        const local = this.parent.toLocal(event.global);
        const newX = local.x + this._dragOffset.x;
        const newY = local.y + this._dragOffset.y;

        const dx = Math.abs(newX - this._dragStartPos.x);
        const dy = Math.abs(newY - this._dragStartPos.y);
        if (dx > 5 || dy > 5) {
            this._hasDragged = true;
        }

        if (this._hasDragged) {
            this.position.x = newX;
            this.position.y = newY;

            // Update label position if it exists and is separated
            if (this._labelContainer && this._labelContainer.parent !== this) {
                this._labelContainer.position.set(newX + this._labelOffset.x, newY + this._labelOffset.y);
            }
        }
    }

    async _onPointerUp(event) {
        if (this._isDragging) {
            event.stopPropagation();

            if (this._hasDragged) {
                // Save position
                try {
                    await JournalPinManager.update(this.pinData.id, {
                        x: Math.round(this.position.x),
                        y: Math.round(this.position.y)
                    });
                } catch (err) {
                    console.error("SDX Journal Pins | Error updating pin position:", err);
                    this.position.set(this.pinData.x, this.pinData.y);
                }
            } else {
                this._openJournal();
            }
        }

        this._isDragging = false;
        this._hasDragged = false;
    }

    _openJournal() {
        const journal = game.journal.get(this.pinData.journalId);
        if (journal) {
            if (this.pinData.pageId) {
                journal.sheet.render(true, { pageId: this.pinData.pageId });
            } else {
                journal.sheet.render(true);
            }
        } else {
            ui.notifications.warn("Journal not found");
        }
    }

    _showContextMenu(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || event;
        if (originalEvent.preventDefault) originalEvent.preventDefault();

        const globalPoint = event.global;
        const canvasRect = canvas.app.view.getBoundingClientRect();
        const menuX = canvasRect.left + (globalPoint?.x || 0);
        const menuY = canvasRect.top + (globalPoint?.y || 0);

        const menuItems = [
            {
                name: "Open Journal",
                icon: '<i class="fa-solid fa-book-open"></i>',
                callback: () => this._openJournal()
            },
            {
                name: "Bring Players Here",
                icon: '<i class="fa-solid fa-location-crosshairs"></i>',
                callback: async () => {
                    if (game.user.isGM) {
                        // Broadcast to others
                        game.socket.emit("module.shadowdark-extras", {
                            type: "panToPin",
                            x: this.pinData.x,
                            y: this.pinData.y,
                            sceneId: canvas.scene?.id,
                            pinId: this.pinData.id
                        });
                        // Pan self
                        canvas.animatePan({ x: this.pinData.x, y: this.pinData.y });

                        if (this.animatePing) {
                            this.animatePing("bring");
                        } else if (canvas.ping) {
                            canvas.ping({ x: this.pinData.x, y: this.pinData.y });
                        }
                    } else {
                        ui.notifications.warn("Only the GM can bring players here.");
                    }
                }
            },
            {
                name: "Ping Pin",
                icon: '<i class="fa-solid fa-bullseye"></i>',
                callback: async () => {
                    // Broadcast ping only, no pan
                    if (game.user.isGM) {
                        game.socket.emit("module.shadowdark-extras", {
                            type: "pingPin",
                            sceneId: canvas.scene?.id,
                            pinId: this.pinData.id
                        });
                        if (this.animatePing) this.animatePing();
                    } else {
                        ui.notifications.warn("Only the GM can ping pins.");
                    }
                }
            },
            {
                name: "Edit Style",
                icon: '<i class="fa-solid fa-palette"></i>',
                callback: async () => {
                    const { PinStyleEditorApp } = await import("./PinStyleEditorSD.mjs");
                    new PinStyleEditorApp({ pinId: this.pinData.id }).render(true);
                }
            }
        ];

        if (game.user?.isGM) {
            menuItems.push({
                name: "Copy Style",
                icon: '<i class="fa-solid fa-copy"></i>',
                callback: () => JournalPinManager.copyStyle(this.pinData)
            });

            if (JournalPinManager.hasCopiedStyle()) {
                menuItems.push({
                    name: "Paste Style",
                    icon: '<i class="fa-solid fa-paste"></i>',
                    callback: async () => await JournalPinManager.pasteStyle(this.pinData.id)
                });
            }

            // Toggle visibility option
            const isGmOnly = this.pinData.gmOnly ?? false;
            menuItems.push({
                name: isGmOnly ? "Make Visible to All" : "Make GM-Only",
                icon: isGmOnly ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>',
                callback: async () => {
                    await JournalPinManager.update(this.pinData.id, { gmOnly: !isGmOnly });
                }
            });

            menuItems.push({
                name: "Delete Pin",
                icon: '<i class="fa-solid fa-trash"></i>',
                callback: async () => await JournalPinManager.delete(this.pinData.id)
            });
        }

        this._renderContextMenu(menuItems, menuX, menuY);
    }

    _renderContextMenu(menuItems, x, y) {
        const existing = document.getElementById("sdx-journal-pin-context-menu");
        if (existing) existing.remove();

        const menu = document.createElement("div");
        menu.id = "sdx-journal-pin-context-menu";
        menu.className = "sdx-journal-pin-context-menu";
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:10000;`;

        menuItems.forEach(item => {
            const menuItem = document.createElement("div");
            menuItem.className = "sdx-journal-pin-menu-item";
            menuItem.innerHTML = `${item.icon} ${item.name}`;
            menuItem.addEventListener("click", () => {
                item.callback();
                menu.remove();
            });
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener("click", closeMenu);
                document.removeEventListener("keydown", closeOnEscape);
            }
        };
        const closeOnEscape = (e) => {
            if (e.key === "Escape") {
                menu.remove();
                document.removeEventListener("click", closeMenu);
                document.removeEventListener("keydown", closeOnEscape);
            }
        };

        setTimeout(() => {
            document.addEventListener("click", closeMenu);
            document.addEventListener("keydown", closeOnEscape);
        }, 10);
    }

    destroy(options) {
        this._removeEventListeners();
        if (this._labelContainer) {
            this._labelContainer.destroy({ children: true });
            this._labelContainer = null;
        }
        super.destroy(options);
    }
}

// ================================================================
// TOOLTIP
// ================================================================

class JournalPinTooltip {
    static _element = null;

    static show(pinData, event) {
        this.hide();

        const journal = game.journal.get(pinData.journalId);
        let page = null;
        let hasAccess = true;

        if (journal) {
            // Get the page first
            if (pinData.pageId) {
                page = journal.pages.get(pinData.pageId);
            } else {
                page = journal.pages.contents[0];
            }

            if (page) {
                // Check if user has at least LIMITED permission on the PAGE
                hasAccess = game.user?.isGM || page.testUserPermission(game.user, "LIMITED");
            }
        }

        if (!hasAccess) {
            console.log("SDX Journal Pins | User has no permission to view tooltip");
            return;
        }

        // If no journal/page and no custom text, nothing to show
        if (!page && !pinData.tooltipTitle && !pinData.tooltipContent) return;

        let content = "";
        let title = page?.name || "Unlinked Pin";

        // Use custom tooltip title if provided
        if (pinData.tooltipTitle) {
            title = pinData.tooltipTitle;
        }

        // For content, we need at least OBSERVER permission on the PAGE to see text
        // If no page, we rely on custom content (always visible if pin is visible)
        const canSeeContent = !page || game.user?.isGM || page.testUserPermission(game.user, "OBSERVER");

        // Use custom tooltip content if provided, otherwise use page content
        if (pinData.tooltipContent) {
            content = pinData.tooltipContent;
        } else if (canSeeContent && page?.text?.content) {
            const temp = document.createElement("div");
            temp.innerHTML = page.text.content;
            content = temp.textContent?.substring(0, 200) || "";
            if (content.length >= 200) content += "...";
        }

        // If no content and title is generic "Unlinked Pin" (and no custom title), maybe don't show?
        // But we might want to just show the title.


        this._element = document.createElement("div");
        this._element.id = "sdx-journal-pin-tooltip";
        this._element.className = "sdx-journal-pin-tooltip";
        this._element.innerHTML = `
            <div class="sdx-journal-pin-tooltip-title">${title}</div>
            ${content ? `<div class="sdx-journal-pin-tooltip-content">${content}</div>` : ""}
        `;

        // Calculate position BEFORE appending to prevent flash at top-left
        const globalPoint = event.global;
        const canvasRect = canvas.app.view.getBoundingClientRect();
        let tooltipX = canvasRect.left + (globalPoint?.x || 0) + 15;
        let tooltipY = canvasRect.top + (globalPoint?.y || 0) + 15;

        // Set initial position (will be adjusted after we know the size)
        this._element.style.left = `${tooltipX}px`;
        this._element.style.top = `${tooltipY}px`;
        this._element.style.visibility = "hidden"; // Hide until positioned

        document.body.appendChild(this._element);

        // Adjust if overflowing viewport
        const rect = this._element.getBoundingClientRect();
        if (tooltipX + rect.width > window.innerWidth) {
            tooltipX = window.innerWidth - rect.width - 10;
        }
        if (tooltipY + rect.height > window.innerHeight) {
            tooltipY = window.innerHeight - rect.height - 10;
        }

        this._element.style.left = `${tooltipX}px`;
        this._element.style.top = `${tooltipY}px`;
        this._element.style.visibility = "visible"; // Show after positioned
    }

    static hide() {
        if (this._element) {
            this._element.remove();
            this._element = null;
        }
    }
}

// ================================================================
// PIN RENDERER
// ================================================================

class JournalPinRenderer {
    static _container = null;
    static _labelContainer = null;
    static _pins = new Map();

    static initialize(layer) {
        if (this._container) {
            console.log("SDX Journal Pins | Container already initialized");
            return;
        }

        this._container = new PIXI.Container();
        this._container.sortableChildren = true;
        this._container.eventMode = "static";
        this._container.name = "sdx-pins-container";

        layer.addChild(this._container);
        console.log("SDX Journal Pins | Container added to layer");
    }

    /**
     * Initialize on canvas.controls (supports PIXI events)
     */
    static initializeOnInterface() {
        if (this._container) {
            if (this._container.parent) {
                this._container.parent.removeChild(this._container);
            }
            this._container.destroy();
            this._container = null;
        }

        this._container = new PIXI.Container();
        this._container.sortableChildren = true;
        this._container.eventMode = "static";
        this._container.name = "sdx-pins-container";

        // Use canvas.controls which supports PIXI pointer events
        if (canvas?.controls) {
            canvas.controls.addChild(this._container);

            this._labelContainer = new PIXI.Container();
            this._labelContainer.name = "sdx-pins-label-container";
            this._labelContainer.eventMode = "none";
            this._labelContainer.interactiveChildren = false;
            canvas.controls.addChild(this._labelContainer);

            console.log("SDX Journal Pins | Containers added to canvas.controls");
        }
    }

    static getLabelContainer() {
        return this._labelContainer;
    }

    static getContainer() {
        return this._container;
    }

    static loadScenePins(sceneId, pins) {
        if (!this._container) {
            console.warn("SDX Journal Pins | Container not initialized");
            return;
        }

        // If no pins, clear all
        if (!pins || pins.length === 0) {
            this.clear();
            console.log("SDX Journal Pins | Cleared all pins for scene", sceneId);
            return;
        }

        // Filter valid/visible pins
        const incomingPins = pins.filter(pin => checkPinVisibility(pin));
        const incomingIds = new Set(incomingPins.map(p => p.id));

        // 1. Remove pins that are no longer present or visible
        for (const [id, graphics] of this._pins.entries()) {
            if (!incomingIds.has(id)) {
                this.removePin(id);
            }
        }

        // 2. Add or Update pins
        for (const pinData of incomingPins) {
            this.updatePin(pinData); // updatePin handles adding if missing
        }

        console.log(`SDX Journal Pins | Loaded ${incomingPins.length} pins for scene ${sceneId}`);
    }

    static _addPinGraphics(pinData) {
        if (this._pins.has(pinData.id)) {
            this.updatePin(pinData);
            return;
        }

        if (!this._container) {
            console.warn("SDX Journal Pins | Cannot add pin - container not initialized");
            return;
        }

        // We create the graphics object but defer the build-intensive parts
        // or ensure it's indexed BEFORE any TMFX logic triggers lookups
        const graphics = new JournalPinGraphics(pinData);

        // Critical: Register in map BEFORE adding to container or any logic that might trigger TMFX calculatePadding
        this._pins.set(pinData.id, graphics);

        // Now add to container
        this._container.addChild(graphics);

        // 4. Trigger initialization (async)
        graphics.init().catch(err => {
            console.error(`SDX Journal Pins | Error initializing pin ${pinData.id}:`, err);
        });

        console.log(`SDX Journal Pins | Added pin ${pinData.id} at (${pinData.x}, ${pinData.y})`);
    }

    static addPin(pinData) {
        this._addPinGraphics(pinData);
    }

    static getPin(pinId) {
        return this._pins.get(pinId);
    }

    static updatePin(pinData) {
        const existing = this._pins.get(pinData.id);

        // Handle visibility changes for non-GM users
        if (!game.user?.isGM) {
            if (pinData.gmOnly) {
                // Pin became GM-only, remove it for non-GM
                if (existing) {
                    this.removePin(pinData.id);
                }
                return;
            } else if (!existing) {
                // Pin became visible, add it for non-GM
                this._addPinGraphics(pinData);
                return;
            }
        }

        if (existing) {
            existing.update(pinData);
        } else {
            this._addPinGraphics(pinData);
        }
    }

    static removePin(pinId) {
        const pin = this._pins.get(pinId);
        if (pin) {
            if (this._container) {
                this._container.removeChild(pin);
            }
            pin.destroy();
            this._pins.delete(pinId);
        }
    }

    static clear() {
        for (const pin of this._pins.values()) {
            if (this._container) {
                this._container.removeChild(pin);
            }
            pin.destroy();
        }
        this._pins.clear();
    }

    static cleanup() {
        this.clear();
        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
        if (this._labelContainer) {
            this._labelContainer.destroy();
            this._labelContainer = null;
        }
    }
}

// ================================================================
// DROP HANDLER
// ================================================================

class JournalPinDropHandler {
    static _initialized = false;
    static _skipNoteCreation = false; // Flag to prevent default note creation

    static initialize() {
        if (this._initialized) return;

        // Hook into drop to create our pins
        Hooks.on("dropCanvasData", this._onDropCanvasData.bind(this));

        // Hook into preCreateNote to prevent default note when Ctrl is held
        Hooks.on("preCreateNote", this._onPreCreateNote.bind(this));

        this._initialized = true;
        console.log("SDX Journal Pins | Drop handler initialized");
    }

    /**
     * Prevent default note creation when we're creating an SDX pin
     */
    static _onPreCreateNote(noteDoc, data, options, userId) {
        if (this._skipNoteCreation) {
            console.log("SDX Journal Pins | Preventing default note creation");
            this._skipNoteCreation = false;
            return false; // Prevent creating the default note
        }
        return true;
    }

    /**
     * Handle drop - MUST be synchronous to return false before Foundry shows dialog
     */
    static _onDropCanvasData(canvas, data) {
        if (data.type !== "JournalEntry" && data.type !== "JournalEntryPage") {
            return; // Let Foundry handle non-journal drops
        }

        if (!game.keyboard.isModifierActive(KeyboardManager.MODIFIER_KEYS.CONTROL)) {
            return; // No Ctrl held, let Foundry handle it normally
        }

        if (!game.user?.isGM) {
            ui.notifications.warn("Only GMs can create journal pins");
            return false; // Prevent drop but don't create pin
        }

        // Parse data synchronously
        const { x, y } = data;
        let journalId, pageId, label;

        if (data.type === "JournalEntry") {
            journalId = data.uuid?.split(".")?.pop() || data.id;
            pageId = null;
            const journal = game.journal.get(journalId);
            label = journal?.name || "Journal Pin";
        } else if (data.type === "JournalEntryPage") {
            const parts = data.uuid?.split(".") || [];
            journalId = parts[1];
            pageId = parts[3] || data.id;
            const journal = game.journal.get(journalId);
            const page = journal?.pages.get(pageId);
            label = page?.name || journal?.name || "Journal Pin";
        }

        if (!journalId) {
            console.error("SDX Journal Pins | Could not determine journal ID from drop data", data);
            return false;
        }

        // Create pin asynchronously (don't await - we need to return false NOW)
        JournalPinManager.create({
            x: Math.round(x),
            y: Math.round(y),
            journalId,
            pageId,
            label
        }).then(() => {
            ui.notifications.info(`Created journal pin: ${label}`);
        }).catch(err => {
            console.error("SDX Journal Pins | Error creating pin:", err);
            ui.notifications.error("Failed to create journal pin");
        });

        // Return false IMMEDIATELY to prevent Foundry from showing the dialog
        console.log("SDX Journal Pins | Returning false to prevent default note dialog");
        return false;
    }
}

// ================================================================
// INITIALIZATION
// ================================================================

// Register layer IMMEDIATELY at module load time
// Check if CONFIG.Canvas.layers exists (it should during init phase)
if (typeof CONFIG !== 'undefined' && CONFIG.Canvas?.layers) {
    hookCanvas();
    console.log("SDX Journal Pins | hookCanvas called at module load");
} else {
    // Fallback: try during init hook
    Hooks.once("init", () => {
        hookCanvas();
        console.log("SDX Journal Pins | hookCanvas called during init hook");
    });
    console.log("SDX Journal Pins | hookCanvas scheduled for init hook");
}

function initJournalPins() {
    // Initialize drop handler
    JournalPinDropHandler.initialize();

    // Register Socket Listener for "Bring Players Here"
    Hooks.once("ready", () => {
        game.socket.on("module.shadowdark-extras", (data) => {
            if (data.type === "panToPin") {
                // Check scene match
                if (canvas.scene?.id !== data.sceneId) return;

                canvas.animatePan({ x: data.x, y: data.y });

                // Try to find the pin for custom animation
                let pin;
                if (data.pinId && JournalPinRenderer.getContainer()) {
                    pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === data.pinId);
                }

                if (pin && pin.animatePing) {
                    pin.animatePing("bring");
                } else if (canvas.ping) {
                    canvas.ping({ x: data.x, y: data.y });
                }
            } else if (data.type === "pingPin") {
                if (canvas.scene?.id !== data.sceneId) return;

                let pin;
                if (data.pinId && JournalPinRenderer.getContainer()) {
                    pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === data.pinId);
                }
                if (pin && pin.animatePing) {
                    pin.animatePing();
                }
            }
        });
    });

    // Load pins when canvas is ready
    Hooks.on("canvasReady", () => {
        console.log("SDX Journal Pins | Canvas ready");

        // Always use canvas.interface for now (most reliable for interactivity)
        JournalPinRenderer.initializeOnInterface();

        if (canvas.scene) {
            const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
            JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
        }
    });

    // Cleanup on teardown
    Hooks.on("canvasTearDown", () => {
        JournalPinRenderer.cleanup();
    });

    // Reload on scene flag changes
    Hooks.on("updateScene", (scene, changes) => {
        if (scene.id === canvas?.scene?.id && changes.flags?.[MODULE_ID]?.[FLAG_KEY]) {
            const pins = JournalPinManager.list({ sceneId: scene.id });
            JournalPinRenderer.loadScenePins(scene.id, pins);
        }
    });

    // Refresh pins when tokens move (for vision-based visibility)
    Hooks.on("updateToken", (tokenDoc, changes) => {
        if (changes.x !== undefined || changes.y !== undefined) {
            // Token moved, refresh pins for all users
            if (canvas?.scene) {
                const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
                JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
            }
        }
    });

    // Refresh pins when sight/vision changes
    // Debounce to prevent flickering during animation
    Hooks.on("sightRefresh", foundry.utils.debounce(() => {
        if (canvas?.scene) {
            const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
            JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
        }
    }, 100));

    // Ensure style is correct after all settings are loaded (Foundry refresh/init)
    Hooks.once("ready", () => {
        if (canvas.ready && canvas.scene) {
            console.log("SDX Journal Pins | Game ready, refreshing pin styles");
            // Ensure renderer is initialized if canvasReady fired too early or not at all
            if (!JournalPinRenderer.getContainer()) {
                JournalPinRenderer.initializeOnInterface();
            }
            const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
            JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
        }
    });

    // Patch TokenMagic if active
    Hooks.once("ready", () => {
        if (game.modules.get("tokenmagic")?.active && window.TokenMagic && !window.TokenMagic._sdxPatched) {
            // Patch getPlaceableById on window.TokenMagic for general use
            const originalGetPlaceableById = window.TokenMagic.getPlaceableById;
            window.TokenMagic.getPlaceableById = (id, type) => {
                if (type === "JournalPin") {
                    return JournalPinRenderer.getPin(id);
                }
                return originalGetPlaceableById(id, type);
            };

            // Patch PIXI.Filter.prototype.getPlaceable because the internal logic 
            // of filters uses an imported version of getPlaceableById which we can't easily patch
            if (PIXI.Filter.prototype.getPlaceable) {
                const originalGetPlaceable = PIXI.Filter.prototype.getPlaceable;
                PIXI.Filter.prototype.getPlaceable = function () {
                    // this.placeableType is set by TokenMagic when assigning the filter
                    if (this.placeableType === "JournalPin") {
                        return JournalPinRenderer.getPin(this.placeableId);
                    }
                    return originalGetPlaceable.call(this);
                };
            }

            // Patch calculatePadding to fail gracefully if the placeable image is missing
            // This prevents crashes during scene transitions or world load race conditions
            if (PIXI.Filter.prototype.calculatePadding) {
                const originalCalculatePadding = PIXI.Filter.prototype.calculatePadding;
                PIXI.Filter.prototype.calculatePadding = function () {
                    if (!this.placeableImg && this.placeableType === "JournalPin") return;
                    try {
                        return originalCalculatePadding.call(this);
                    } catch (err) {
                        // Ignore rotation errors for pins that are being destroyed/removed
                        if (this.placeableType === "JournalPin") return;
                        throw err;
                    }
                };
            }

            window.TokenMagic._sdxPatched = true;
            console.log("SDX Journal Pins | Patched TokenMagic for JournalPin support");

            // Re-apply filters for all pins on the current scene to ensure they show up
            // This fixes the 'persistence' issue where filters are in flags but not rendering
            if (canvas.ready) {
                const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
                for (const pinData of pins) {
                    const graphics = JournalPinRenderer.getPin(pinData.id);
                    if (graphics) {
                        const filters = graphics.getFlag("tokenmagic", "filters");
                        if (filters) {
                            window.TokenMagic._clearImgFiltersByPlaceable(graphics);
                            window.TokenMagic._assignFilters(graphics, filters);
                            // Force a build refresh to ensure textures and filters sync up
                            graphics.update(graphics.pinData);
                        }
                    }
                }
            }
        }
    });

    console.log("SDX Journal Pins | initJournalPins called");
}

export { JournalPinTooltip, JournalPinManager, JournalPinRenderer, DEFAULT_PIN_STYLE, getPinStyle, initJournalPins };
