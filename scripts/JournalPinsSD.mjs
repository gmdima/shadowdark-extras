/**
 * Journal Pins System for Shadowdark Extras
 * Allows placing journal/page pins on the canvas via Ctrl+drag
 * Based on Coffee Pub Blacksmith's layer registration pattern
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
    contentType: "number", // "number", "icon", "text"
    iconClass: "fa-solid fa-book-open",
    customText: "",
    fontSize: 14,
    fontFamily: "Arial",
    fontColor: "#ffffff",
    fontWeight: "bold"
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
            version: PIN_SCHEMA_VERSION
        };

        if (!pin.journalId) {
            throw new Error("journalId is required");
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
        if (patch.style) updated.style = { ...updated.style, ...patch.style };
        if (patch.gmOnly !== undefined) updated.gmOnly = patch.gmOnly;
        if (patch.requiresVision !== undefined) updated.requiresVision = patch.requiresVision;

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

    static list(options = {}) {
        const scene = this._getScene(options.sceneId);
        return this._getScenePins(scene).map(p => foundry.utils.deepClone(p));
    }
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
        this._init();
    }

    async _init() {
        await this._build();
        this._setupEventListeners();
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

    async _build() {
        this.removeChildren();

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

        this._circle = new PIXI.Graphics();

        const shape = style.shape || "circle";
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
                this._circle.drawRoundedRect(-radius, -radius, size, size, 4);
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
        this.addChild(this._circle);

        // Draw custom stroke if not solid
        if (ringStyle !== "solid") {
            this._drawStyledStroke(this._circle, shape, radius, size, ringWidth, ringColorNum, ringOpacity, ringStyle);
        }

        // Add content: number, icon, or custom text
        const contentType = style.contentType || (style.showIcon ? "icon" : "number");
        const fontColor = style.fontColor || "#ffffff";
        const fontColorNum = typeof fontColor === "string" && fontColor.startsWith("#")
            ? parseInt(fontColor.slice(1), 16)
            : 0xFFFFFF;

        if (contentType === "icon") {
            // Show icon
            const iconClass = style.iconClass || "fa-solid fa-book-open";
            await this._addIcon(iconClass, radius, fontColorNum);
        } else {
            // Show text (page number or custom)
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

                this._label = new PIXI.Text(textValue, {
                    fontFamily: fontFamily,
                    fontSize: fontSize,
                    fontWeight: fontWeight,
                    fill: fontColorNum,
                    align: "center"
                });
                this._label.anchor.set(0.5, 0.5);
                this._label.position.set(0, 0);

                // For diamond shape, we need to rotate the text back
                if (shape === "diamond") {
                    this._label.rotation = -Math.PI / 4;
                }

                this.addChild(this._label);
            }
        }

        this.position.set(this.pinData.x, this.pinData.y);

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
            await this._addVisionIndicator(radius);
        }

        console.log(`SDX Journal Pins | Pin built - interactive:${this.interactive}, eventMode:${this.eventMode}, cursor:${this.cursor}`);
    }

    /**
     * Draw a dashed or dotted stroke manually since PIXI.Graphics doesn't support them natively
     */
    _drawStyledStroke(graphics, shape, radius, size, width, color, opacity, style) {
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
        } else {
            // Polygon shapes (square, diamond, hexagon)
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
                        graphics.moveTo(sx, sy);
                        graphics.lineTo(sx + nx * segLen, sy + ny * segLen);
                    }
                    dist += dashLen + gapLen;
                }
            }
        }
    }

    async _addIcon(iconClass, radius, color) {
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
        this.addChild(this._icon);
    }

    async _addVisionIndicator(radius) {
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

        this.addChild(indicator);
    }

    async update(newData) {
        this._removeEventListeners();
        this.pinData = foundry.utils.deepClone(newData);
        await this._build();
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
        JournalPinTooltip.show(this.pinData, event);
    }

    _onPointerLeave(event) {
        JournalPinTooltip.hide();
    }

    _onPointerDown(event) {
        const originalEvent = event.data?.originalEvent || event.nativeEvent || event;
        const button = originalEvent.button ?? 0;

        if (button === 0) {
            this._isDragging = true;
            this._hasDragged = false;
            const local = this.parent.toLocal(event.global);
            this._dragOffset.x = this.position.x - local.x;
            this._dragOffset.y = this.position.y - local.y;
            this._dragStartPos.x = this.position.x;
            this._dragStartPos.y = this.position.y;
            JournalPinTooltip.hide();
        } else if (button === 2) {
            this._showContextMenu(event);
        }
    }

    _onPointerMove(event) {
        if (!this._isDragging) return;

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
        }
    }

    async _onPointerUp(event) {
        if (!this._isDragging) return;

        this._isDragging = false;

        if (!this._hasDragged) {
            this._openJournal();
            return;
        }

        const newX = Math.round(this.position.x);
        const newY = Math.round(this.position.y);

        if (newX !== this.pinData.x || newY !== this.pinData.y) {
            try {
                await JournalPinManager.update(this.pinData.id, { x: newX, y: newY });
            } catch (err) {
                console.error("SDX Journal Pins | Error updating pin position:", err);
                this.position.set(this.pinData.x, this.pinData.y);
            }
        }
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
                name: "Edit Style",
                icon: '<i class="fa-solid fa-palette"></i>',
                callback: async () => {
                    const { PinStyleEditorApp } = await import("./PinStyleEditorSD.mjs");
                    new PinStyleEditorApp({ pinId: this.pinData.id }).render(true);
                }
            }
        ];

        if (game.user?.isGM) {
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
        if (!journal) return;

        // Get the page first
        let page = null;
        if (pinData.pageId) {
            page = journal.pages.get(pinData.pageId);
        } else {
            page = journal.pages.contents[0];
        }

        if (!page) return;

        // Check if user has at least LIMITED permission on the PAGE (not journal)
        // PERMISSION_LEVELS: NONE = 0, LIMITED = 1, OBSERVER = 2, OWNER = 3
        const hasAccess = game.user?.isGM || page.testUserPermission(game.user, "LIMITED");
        if (!hasAccess) {
            console.log("SDX Journal Pins | User has no permission to view tooltip for page", page.name);
            return;
        }

        let content = "";
        let title = page.name;

        // For content, we need at least OBSERVER permission on the PAGE to see text
        const canSeeContent = game.user?.isGM || page.testUserPermission(game.user, "OBSERVER");
        if (canSeeContent && page.text?.content) {
            const temp = document.createElement("div");
            temp.innerHTML = page.text.content;
            content = temp.textContent?.substring(0, 200) || "";
            if (content.length >= 200) content += "...";
        }

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
            console.log("SDX Journal Pins | Container added to canvas.controls");
        }
    }

    static getContainer() {
        return this._container;
    }

    static loadScenePins(sceneId, pins) {
        this.clear();

        if (!this._container) {
            console.warn("SDX Journal Pins | Container not initialized");
            return;
        }

        if (!pins || pins.length === 0) {
            console.log("SDX Journal Pins | No pins to load for scene", sceneId);
            return;
        }

        // Filter pins based on visibility
        const visiblePins = pins.filter(pin => checkPinVisibility(pin));
        console.log(`SDX Journal Pins | ${visiblePins.length}/${pins.length} pins visible to current user`);

        for (const pinData of visiblePins) {
            this._addPinGraphics(pinData);
        }

        console.log(`SDX Journal Pins | Loaded ${visiblePins.length} pins for scene ${sceneId}`);
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

        const graphics = new JournalPinGraphics(pinData);
        this._pins.set(pinData.id, graphics);
        this._container.addChild(graphics);

        console.log(`SDX Journal Pins | Added pin ${pinData.id} at (${pinData.x}, ${pinData.y})`);
    }

    static addPin(pinData) {
        this._addPinGraphics(pinData);
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
    Hooks.on("sightRefresh", () => {
        if (canvas?.scene) {
            const pins = JournalPinManager.list({ sceneId: canvas.scene.id });
            JournalPinRenderer.loadScenePins(canvas.scene.id, pins);
        }
    });

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

    console.log("SDX Journal Pins | initJournalPins called");
}

export { JournalPinTooltip, JournalPinManager, JournalPinRenderer, DEFAULT_PIN_STYLE, getPinStyle, initJournalPins };
