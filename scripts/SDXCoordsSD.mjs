/**
 * SDX Coords — Map coordinate overlay for Shadowdark Extras
 * Clean-room reimplementation inspired by map-coords functionality
 */

const MODULE_ID = "shadowdark-extras";

// Display states for coordinate overlay
const DISPLAY_STATES = {
    HIDDEN: 1,
    MARGIN: 2,
    CELL: 3,
};

/**
 * Get the correct PreciseText class for the current Foundry version
 */
function getPreciseText() {
    return Number(game.version) >= 13
        ? foundry.canvas.containers.PreciseText
        : PreciseText;
}

/**
 * Get the current coordinate settings, merged with defaults
 */
function getSettings() {
    const defaults = {
        fontFamily: "Signika-Bold",
        fillColor: "#ffffff",
        strokeColor: "#000000",
        strokeThickness: 3,
        xValue: "let",
        yValue: "num",
        offset: 0,
        cellFontScale: 14,
        cellAlpha: 0.9,
        leadingZeroes: false,
        keybindModifier: "Alt",
        clickTimeout: 1500,
    };
    try {
        const saved = game.settings.get(MODULE_ID, "sdxCoordsSettings");
        return foundry.utils.mergeObject(defaults, saved || {});
    } catch {
        return defaults;
    }
}

/**
 * Core coordinate overlay class
 */
class SDXCoord {
    #state;
    #overrideState;
    #marginContainer;
    #cellContainer;

    constructor() {
        const settings = getSettings();
        const rect = canvas.dimensions.sceneRect;
        const size = canvas.dimensions.size;

        // Build the text style
        this._style = CONFIG.canvasTextStyle.clone();
        this._style.fill = settings.fillColor;
        this._style.fontFamily = settings.fontFamily || "Signika-Bold";
        this._style.fontSize = size / 2;
        this._style.stroke = settings.strokeColor;
        this._style.strokeThickness = settings.strokeThickness;

        this._rect = rect;
        this._size = size;
        this._cellWidth = canvas.grid.sizeX;
        this._cellHeight = canvas.grid.sizeY;

        // Grid offset for the top-left corner of the scene
        const topLeft = canvas.grid.getOffset({ x: rect.left, y: rect.top });
        this._row0 = topLeft.i;
        this._col0 = topLeft.j;

        // Settings
        this._xValue = settings.xValue;
        this._yValue = settings.yValue;
        this._marginOffset = settings.offset;
        this._cellFontScale = settings.cellFontScale;
        this._cellAlpha = settings.cellAlpha;
        this._leadingZeroes = settings.leadingZeroes;
        this._keybindModifier = settings.keybindModifier;
        this._clickTimeout = settings.clickTimeout;

        // Padding for leading zeroes
        if (this._leadingZeroes) {
            this._zeroPad = String(
                Math.max(canvas.dimensions.columns, canvas.dimensions.rows)
            ).length;
        } else {
            this._zeroPad = 0;
        }

        // Create PIXI containers
        this.#marginContainer = canvas.controls.addChild(new PIXI.Container());
        this.#cellContainer = canvas.controls.addChild(new PIXI.Container());
        this.#marginContainer.visible = false;
        this.#cellContainer.visible = false;

        // Render labels
        this._renderMarginLabels();
        this._renderCellLabels();

        // Click listener for one-click coordinate display
        this._addClickListener();

        // Restore display state from scene flags
        this.#state = this._readSceneState();
        this._applyState(this.#state);
    }

    // ---- Label Generation ----

    _generateLabel(type, index) {
        if (type === "num") {
            return `${(index + 1).toString().padStart(this._zeroPad, "0")}`;
        }
        // Letters: A, B, ..., Z, AA, AB, ...
        if (index < 26) return String.fromCharCode(65 + index);
        return SDXCoord._numberToLetters(index + 1);
    }

    static _numberToLetters(num) {
        let s = "";
        let t;
        while (num > 0) {
            t = (num - 1) % 26;
            s = String.fromCharCode(65 + t) + s;
            num = ((num - t) / 26) | 0;
        }
        return s || "";
    }

    static _formatPair(row, col) {
        return `${col}${row}`;
    }

    // ---- Hex Adjustments ----

    /**
     * @param {number} row - relative row index
     * @param {number|null} absCol - absolute column j-index (needed for hex column grids)
     */
    _adjustRow(row, absCol = null) {
        if (!canvas.grid.isHexagonal) return row;
        if (canvas.grid.even && !canvas.grid.columns) return row - 1;
        // Hex column grids: non-shifted columns have a half hex at top — skip it
        if (canvas.grid.columns && absCol !== null) {
            // Odd variant: even j columns are non-shifted (half hex at top)
            // Even variant: odd j columns are non-shifted (half hex at top)
            const hasHalfHex = canvas.grid.even ? (absCol % 2 !== 0) : (absCol % 2 === 0);
            if (hasHalfHex) return row - 1;
        }
        return row;
    }

    _adjustCol(col) {
        return canvas.grid.isHexagonal && canvas.grid.even && canvas.grid.columns
            ? col - 1
            : col;
    }

    // ---- Rendering ----

    _renderMarginLabels() {
        const PT = getPreciseText();
        let pos, label, text;

        // Column headers (top)
        let c = 0;
        do {
            const adjCol = this._adjustCol(c);
            label = this._generateLabel(this._xValue, adjCol);
            text = new PT(label, this._style);
            text.resolution = 4;
            text.anchor.set(0.5);
            const tl = canvas.grid.getTopLeftPoint({ i: this._row0, j: c + this._col0 });
            pos = [tl.x + this._cellWidth / 2, this._rect.top - this._marginOffset - this._size / 4];
            text.position.set(pos[0], pos[1]);

            if (pos[0] >= this._rect.left && pos[0] <= this._rect.right && adjCol >= 0) {
                this.#marginContainer.addChild(text);
            }
            c += 1;
        } while (pos[0] + text.width < this._rect.right);

        // Row headers (left)
        let r = 0;
        do {
            const adjRow = this._adjustRow(r);
            label = this._generateLabel(this._yValue, adjRow);
            text = new PT(label, this._style);
            text.resolution = 4;
            text.anchor.set(0.5, 0.5);
            const tl = canvas.grid.getTopLeftPoint({ i: r + this._row0, j: this._col0 });
            pos = [this._rect.left - this._marginOffset - this._size / 4, tl.y + this._cellHeight / 2];
            text.position.set(pos[0], pos[1]);

            if (pos[1] >= this._rect.top && pos[1] <= this._rect.bottom && adjRow >= 0) {
                this.#marginContainer.addChild(text);
            }
            r += 1;
        } while (pos[1] + text.height < this._rect.bottom);
    }

    _renderCellLabels() {
        const PT = getPreciseText();
        const cellStyle = this._style.clone();
        const fontScale = Math.max(10, this._cellFontScale) / 100;
        cellStyle.fontSize = this._size * fontScale;

        let c = 0;
        let pos = [this._rect.x, this._rect.y];
        do {
            const absCol = c + this._col0;
            const colLabel = this._generateLabel(this._xValue, this._adjustCol(c));
            let r = 0;
            do {
                const tl = canvas.grid.getTopLeftPoint({ i: r + this._row0, j: c + this._col0 });
                pos = [tl.x, tl.y];

                const adjRow = this._adjustRow(r, absCol);
                if (adjRow < 0) { r += 1; continue; }

                const rowLabel = this._generateLabel(this._yValue, adjRow);
                const text = new PT(SDXCoord._formatPair(rowLabel, colLabel), cellStyle);
                text.resolution = 4;
                text.alpha = this._cellAlpha;

                if (canvas.grid.isHexagonal) {
                    pos[0] += this._cellWidth / 2 - text.width / 2;
                    if (!canvas.grid.columns) pos[1] += text.height / 3;
                }

                if (this._rect.contains(pos[0], pos[1])) {
                    text.position.set(pos[0], pos[1]);
                    this.#cellContainer.addChild(text);
                }

                r += 1;
            } while (pos[1] < this._rect.bottom);
            c += 1;
        } while (pos[0] < this._rect.right);
    }

    // ---- Click Coordinate ----

    _addClickListener() {
        canvas.stage.addListener(
            "click",
            (event) => {
                if (game.keyboard.isModifierActive(this._keybindModifier)) {
                    this._showClickCoordinate();
                }
            }
        );
    }

    _showClickCoordinate() {
        const PT = getPreciseText();
        const pos = canvas.mousePosition;
        const offset = canvas.grid.getOffset({ x: pos.x, y: pos.y });
        const row = this._adjustRow(offset.i - this._row0, offset.j);
        const col = this._adjustCol(offset.j - this._col0);
        const rowLabel = this._generateLabel(this._yValue, row);
        const colLabel = this._generateLabel(this._xValue, col);

        const text = new PT(SDXCoord._formatPair(rowLabel, colLabel), this._style);
        text.resolution = 4;
        text.anchor.set(0.2);
        text.position.set(pos.x, pos.y);

        const label = canvas.controls.addChild(text);
        setTimeout(() => label.destroy(), this._clickTimeout);
    }

    // ---- State Management ----

    _readSceneState() {
        if (this.#overrideState) return this.#overrideState;
        return canvas?.scene?.getFlag(MODULE_ID, "sdxcoords-state") || DISPLAY_STATES.HIDDEN;
    }

    _applyState(state) {
        switch (state) {
            case DISPLAY_STATES.MARGIN:
                this.#marginContainer.visible = true;
                this.#cellContainer.visible = false;
                break;
            case DISPLAY_STATES.CELL:
                this.#marginContainer.visible = false;
                this.#cellContainer.visible = true;
                break;
            default:
                this.#marginContainer.visible = false;
                this.#cellContainer.visible = false;
                break;
        }
    }

    toggle() {
        let next;
        const current = this._readSceneState();
        switch (current) {
            case DISPLAY_STATES.HIDDEN:
                next = DISPLAY_STATES.MARGIN;
                break;
            case DISPLAY_STATES.MARGIN:
                next = DISPLAY_STATES.CELL;
                break;
            default:
                next = DISPLAY_STATES.HIDDEN;
                break;
        }
        this._applyState(next);
        if (game.user.isGM) {
            canvas.scene.setFlag(MODULE_ID, "sdxcoords-state", next);
        } else {
            this.#overrideState = next;
        }
        this.#state = next;
    }

    finalize() {
        canvas.controls.removeChild(this.#marginContainer);
        canvas.controls.removeChild(this.#cellContainer);
        this.#marginContainer.visible = false;
        this.#cellContainer.visible = false;
    }

    static get isSupported() {
        return canvas.grid?.isSquare || canvas.grid?.isHexagonal;
    }
}

// ---- Hook Setup ----

/**
 * Initialize SDX Coords hooks. Call from shadowdark-extras.mjs.
 */
export function initSDXCoords() {
    // Canvas ready — create/destroy coordinate overlay
    Hooks.on("canvasReady", async () => {
        if (window.SDXCoordinates) {
            window.SDXCoordinates.finalize();
            window.SDXCoordinates = null;
        }
        if (SDXCoord.isSupported) {
            // Preload the chosen font so PIXI canvas 2D text can use it
            const settings = getSettings();
            const fontFamily = settings.fontFamily || "Signika-Bold";
            try {
                await document.fonts.load(`16px "${fontFamily}"`);
            } catch { /* font may not exist, PIXI will use fallback */ }
            window.SDXCoordinates = new SDXCoord();
        }
    });
}

/**
 * Register SDX Coords settings. Call from the init hook in shadowdark-extras.mjs.
 */
export function registerSDXCoordsSettings() {
    // Hidden data setting
    game.settings.register(MODULE_ID, "sdxCoordsSettings", {
        name: "Map Coordinates Settings",
        scope: "world",
        config: false,
        type: Object,
        default: {
            fontFamily: "Signika-Bold",
            fillColor: "#ffffff",
            strokeColor: "#000000",
            strokeThickness: 3,
            xValue: "let",
            yValue: "num",
            offset: 0,
            cellFontScale: 14,
            cellAlpha: 0.9,
            leadingZeroes: false,
            keybindModifier: "Alt",
            clickTimeout: 1500,
        },
    });

    // Keybinding
    game.keybindings.register(MODULE_ID, "sdx-toggle-coords", {
        name: "Toggle Map Coordinates",
        editable: [{ key: "KeyC", modifiers: ["ALT"] }],
        precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY,
        restricted: false,
        onDown: () => {
            if (window.SDXCoordinates) window.SDXCoordinates.toggle();
            else ui.notifications.warn("Coordinate display not supported on gridless maps");
            return true;
        },
    });
}

/**
 * Register the settings menu button. Must be called after dynamic import is ready.
 */
export function registerSDXCoordsMenu(AppClass) {
    game.settings.registerMenu(MODULE_ID, "sdxCoordsMenu", {
        name: "Map Coordinates Settings",
        label: "Configure Coordinates",
        hint: "Configure coordinate overlay appearance and behavior",
        icon: "far fa-globe",
        type: AppClass,
        restricted: true,
    });
}
