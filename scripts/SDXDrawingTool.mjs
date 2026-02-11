/**
 * SDX Drawing Tool
 * Whiteboard drawing system for Shadowdark Extras.
 * Allows players and GMs to draw temporary markings on the canvas.
 */

const MODULE_ID = "shadowdark-extras";
const SOCKET_NAME = "module.shadowdark-extras";

// ─── Color Palette ───────────────────────────────────────────────
const COLORS = {
    black: "rgba(38, 38, 38, 0.7)",
    red: "rgba(186, 60, 49, 0.7)",
    blue: "rgba(76, 147, 204, 0.7)",
    green: "rgba(3, 105, 41, 0.7)",
    yellow: "rgba(219, 130, 12, 0.7)",
    white: "rgba(220, 220, 220, 0.7)",
    gray: "rgba(128, 128, 128, 0.7)",
    brown: "rgba(139, 90, 43, 0.7)",
    orange: "rgba(230, 126, 34, 0.7)",
    pink: "rgba(210, 100, 140, 0.7)",
    purple: "rgba(142, 68, 173, 0.7)",
    cyan: "rgba(52, 172, 186, 0.7)",
    lime: "rgba(120, 195, 46, 0.7)",
    navy: "rgba(44, 62, 110, 0.7)",
    crimson: "rgba(160, 30, 50, 0.7)",
};

// ─── Stamp sizes (px square) ────────────────────────────────────
const STAMP_SIZES = { small: 40, medium: 80, large: 140 };

// ─── Drawing Tool Class ─────────────────────────────────────────
class SDXDrawingTool {
    constructor() {
        this.active = false;
        this._keyDown = false;
        this._pixiContainer = null; // PIXI container for all drawings
        this._pixiDrawings = [];
        this._previewGraphics = null;
        this._previewSymbol = null;
        this._lastDrawing = null;
        this._permanentDrawings = [];
        this._lastPermanentDrawing = null;
        this._cleanupInterval = null;
        this._initialized = false;
        this._highlightGraphics = null;
        this._highlightPulse = null;

        // Drawing state
        this.state = {
            drawingMode: "sketch", // sketch | line | box | ellipse | stamp
            stampStyle: "plus",    // plus | x | dot | arrow | arrow-up | arrow-down | arrow-left | square
            symbolSize: "medium",  // small | medium | large
            lineStyle: "solid",    // solid | dotted | dashed
            brushSettings: { size: 6, color: COLORS.black },
            opacity: 1.0,
            permanentMode: false,
            timedEraseEnabled: false,
            isDrawing: false,
            drawingPoints: [],
            drawingStartPoint: null,
            boxStartPoint: null,
            ellipseStartPoint: null,
            lineStartPoint: null,
            lastMousePosition: null,
        };
    }

    // ── Initialise ──────────────────────────────────────────────
    async initialize() {
        if (this._initialized) return;

        // Load persisted toolbar state
        this._loadSavedState();

        // Create a PIXI container on the interface layer (highest canvas layer)
        this._createCanvasLayer();

        // Load permanent drawings for the current scene (canvasReady may have already fired)
        this._loadPermanentDrawings();

        // Socket listener for cross-client sync
        this._registerSocketHandlers();

        // Scene change cleanup
        Hooks.on("canvasReady", () => {
            this._createCanvasLayer();
            this._pixiDrawings = [];
            this._lastDrawing = null;
            this._loadPermanentDrawings();
        });

        Hooks.on("canvasTearDown", () => this.cleanup());

        this._initialized = true;
        console.log("shadowdark-extras | SDX Drawing Tool initialized");
    }

    // ── Load saved toolbar state from settings ──────────────────
    _loadSavedState() {
        try {
            const s = (key, fallback) => {
                try { return game.settings.get(MODULE_ID, key); }
                catch { return fallback; }
            };
            const dm = s("drawing.toolbar.drawingMode", "sketch");
            if (["sketch", "line", "box", "ellipse", "stamp"].includes(dm)) this.state.drawingMode = dm;
            const ss = s("drawing.toolbar.stampStyle", "plus");
            if (["plus", "x", "dot", "arrow", "arrow-up", "arrow-down", "arrow-left", "square", "hex-outline"].includes(ss)) this.state.stampStyle = ss;
            const sz = s("drawing.toolbar.symbolSize", "medium");
            if (["small", "medium", "large"].includes(sz)) this.state.symbolSize = sz;
            const lw = s("drawing.toolbar.lineWidth", 6);
            if (typeof lw === "number" && lw > 0) this.state.brushSettings.size = lw;
            const ls = s("drawing.toolbar.lineStyle", "solid");
            if (["solid", "dotted", "dashed"].includes(ls)) this.state.lineStyle = ls;
            const cl = s("drawing.toolbar.color", "");
            if (cl) this.state.brushSettings.color = cl;
            else this.state.brushSettings.color = this._getPlayerColor();
            const te = s("drawing.toolbar.timedEraseEnabled", false);
            if (typeof te === "boolean") this.state.timedEraseEnabled = te;
            const op = s("drawing.toolbar.opacity", 1.0);
            if (typeof op === "number" && op >= 0.1 && op <= 1.0) this.state.opacity = op;
        } catch (e) {
            console.warn("SDX Drawing | Failed to load saved state:", e);
        }
    }

    _getPlayerColor() {
        let hex = "#000000";
        if (game.user?.color) {
            if (game.user.color.constructor?.name === "Color") {
                const v = Number(game.user.color);
                if (!isNaN(v)) hex = "#" + v.toString(16).padStart(6, "0");
            } else if (typeof game.user.color === "string") {
                hex = game.user.color;
            } else if (typeof game.user.color === "number") {
                hex = "#" + game.user.color.toString(16).padStart(6, "0");
            }
        }
        if (!hex.startsWith("#")) hex = "#000000";
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 1.0)`;
    }

    // ── Canvas Layer ────────────────────────────────────────────
    _createCanvasLayer() {
        if (!canvas?.stage) return;
        // Remove old container if present
        if (this._pixiContainer && this._pixiContainer.parent) {
            this._pixiContainer.parent.removeChild(this._pixiContainer);
            this._pixiContainer.destroy({ children: true });
        }
        this._pixiContainer = new PIXI.Container();
        this._pixiContainer.name = "sdx-drawing-layer";
        this._pixiContainer.sortableChildren = true;
        this._pixiContainer.zIndex = 99999;
        this._pixiContainer.interactive = false;
        this._pixiContainer.interactiveChildren = false;

        // Add to interface group (topmost canvas group) to be above TOM's canvas elements
        const target = canvas.interface ?? canvas.stage;
        target.addChild(this._pixiContainer);
        // Push to end of stacking
        if (target.sortableChildren !== true) {
            target.sortableChildren = true;
        }
    }

    get canvasLayer() {
        return this._pixiContainer;
    }

    // ── Socket ──────────────────────────────────────────────────
    _registerSocketHandlers() {
        game.socket.on(SOCKET_NAME, (payload) => {
            if (payload.type === "sdx-drawing-created") {
                this._handleRemoteDrawing(payload.data);
            } else if (payload.type === "sdx-drawing-deleted") {
                this._handleRemoteDeletion(payload.data);
            } else if (payload.type === "sdx-permanent-cleared") {
                this._handleRemotePermanentClear();
            }
        });
    }

    _broadcast(type, data) {
        game.socket.emit(SOCKET_NAME, { type, data });
    }

    // ── Keybinding hold mode ────────────────────────────────────
    onHoldKeyDown() {
        if (this._keyDown) return;
        this._keyDown = true;
        this.activate(true);
    }

    onHoldKeyUp() {
        if (!this._keyDown) return;
        this._keyDown = false;
        if (this.state.isDrawing) {
            this._finishCurrentDrawing();
        }
        this.deactivate(true);
        this._removePreviewSymbol();
    }

    // ── Activate / Deactivate ───────────────────────────────────
    activate(keyBased = false) {
        if (!this._canDraw()) return false;
        if (this.active) return true;
        this.active = true;
        this._attachCanvasHandlers();
        this._updateCursor();
        return true;
    }

    deactivate(keyBased = false) {
        if (!this.active) return;
        this.active = false;
        this._detachCanvasHandlers();
        this._removePreviewSymbol();
        this._updateCursor();
        if (this.state.isDrawing) this._cancelDrawing();
    }

    cleanup() {
        if (this.active) this.deactivate(true);
        this._detachCanvasHandlers();
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
    }

    _canDraw() {
        if (game.user.isGM) return true;
        try {
            return game.settings.get(MODULE_ID, "drawing.enablePlayerDrawing");
        } catch { return true; }
    }

    // ── Cursor ──────────────────────────────────────────────────
    _updateCursor() {
        if (!canvas?.app?.view) return;
        canvas.app.view.style.cursor = this.active ? "crosshair" : "";
    }

    // ── Canvas event handlers ───────────────────────────────────
    _attachCanvasHandlers() {
        if (!canvas?.app?.view) return;
        const self = this;

        this._handlePointerDown = (e) => {
            if (!self.active || !self._keyDown) return;
            if (self.state.drawingMode === "box" || self.state.drawingMode === "ellipse") {
                e.preventDefault(); e.stopPropagation(); return;
            }
            if (self.state.drawingMode === "stamp" && self._canDraw() && !e.ctrlKey && !e.altKey) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                self._stampSymbol(self.state.stampStyle, e);
                return;
            }
            if (["sketch", "line", "box", "ellipse"].includes(self.state.drawingMode)) {
                e.preventDefault(); e.stopPropagation();
            }
        };

        this._handlePointerMove = (e) => {
            if (!self.active) return;
            if (self._keyDown) {
                const mode = self.state.drawingMode;
                if (mode === "sketch") {
                    if (!self.state.isDrawing) self._startSketch(e); else self._updateSketch(e);
                } else if (mode === "line") {
                    if (!self.state.isDrawing) self._startLine(e); else self._updateLinePreview(e);
                } else if (mode === "box") {
                    if (!self.state.isDrawing) self._startBox(e); else self._updateBoxPreview(e);
                } else if (mode === "ellipse") {
                    if (!self.state.isDrawing) self._startEllipse(e); else self._updateEllipsePreview(e);
                } else if (mode === "stamp") {
                    self._updatePreviewSymbol(e);
                }
            } else {
                self._removePreviewSymbol();
            }
        };

        this._handlePointerUp = (e) => {
            if (!self.active) return;
            if (self.state.drawingMode === "line" || self.state.drawingMode === "box" || self.state.drawingMode === "ellipse") {
                e.preventDefault(); e.stopPropagation(); return;
            }
            if (self.state.isDrawing && !self._keyDown) {
                self._finishSketch(e);
            }
        };

        canvas.app.view.addEventListener("pointerdown", this._handlePointerDown, true);
        canvas.app.view.addEventListener("pointermove", this._handlePointerMove, true);
        canvas.app.view.addEventListener("pointerup", this._handlePointerUp, true);
    }

    _detachCanvasHandlers() {
        const v = canvas?.app?.view;
        if (!v) return;
        if (this._handlePointerDown) { v.removeEventListener("pointerdown", this._handlePointerDown, true); this._handlePointerDown = null; }
        if (this._handlePointerMove) { v.removeEventListener("pointermove", this._handlePointerMove, true); this._handlePointerMove = null; }
        if (this._handlePointerUp) { v.removeEventListener("pointerup", this._handlePointerUp, true); this._handlePointerUp = null; }
    }

    // ── Finish current drawing (called on key-up) ───────────────
    _finishCurrentDrawing() {
        if (!this.state.isDrawing) return;
        const mode = this.state.drawingMode;
        if (mode === "box") this._finishBox(null);
        else if (mode === "ellipse") this._finishEllipse(null);
        else if (mode === "line") this._finishLine(null);
        else this._finishSketch(null);
    }

    // ── Coordinate helpers ──────────────────────────────────────
    _getWorldCoords(event) {
        if (!canvas?.app) return null;
        const rect = canvas.app.view.getBoundingClientRect();
        const sx = event.clientX - rect.left;
        const sy = event.clientY - rect.top;
        const wp = canvas.app.stage.toLocal(new PIXI.Point(sx, sy));
        if (!isFinite(wp.x) || !isFinite(wp.y)) return null;
        return { x: wp.x, y: wp.y };
    }

    // ── Color conversion helpers ────────────────────────────────
    _cssToPixi(css) {
        if (typeof css === "number") return css;
        if (typeof css === "string") {
            if (css.startsWith("#")) return parseInt(css.slice(1), 16);
            const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (m) return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
        }
        return 0x000000;
    }

    // ══════════════════════════════════════════════════════════════
    //  SKETCH (freehand)
    // ══════════════════════════════════════════════════════════════
    _startSketch(e) {
        const wc = this._getWorldCoords(e);
        if (!wc || !this.canvasLayer) return;
        this.state.isDrawing = true;
        this.state.drawingStartPoint = wc;
        this.state.drawingPoints = [[0, 0]];
        this._previewGraphics = new PIXI.Graphics();
        this._previewGraphics.alpha = this.state.opacity;
        this.canvasLayer.addChild(this._previewGraphics);
    }

    _updateSketch(e) {
        if (!this.state.isDrawing || !this._previewGraphics || !this.canvasLayer) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        const sp = this.state.drawingStartPoint;
        this.state.drawingPoints.push([wc.x - sp.x, wc.y - sp.y]);
        // Redraw
        this._previewGraphics.clear();
        const color = this._cssToPixi(this.state.brushSettings.color);
        const pts = this.state.drawingPoints;
        // Shadow
        this._previewGraphics.lineStyle(this.state.brushSettings.size, 0x000000, 0.3);
        if (pts.length > 0) {
            this._previewGraphics.moveTo(sp.x + pts[0][0] + 2, sp.y + pts[0][1] + 2);
            for (let i = 1; i < pts.length; i++) this._previewGraphics.lineTo(sp.x + pts[i][0] + 2, sp.y + pts[i][1] + 2);
        }
        // Main
        this._drawLineWithStyle(this._previewGraphics, pts, sp.x, sp.y, this.state.brushSettings.size, color, 1.0, this.state.lineStyle);
    }

    _finishSketch(e) {
        if (!this.state.isDrawing) return;
        if (this.state.drawingPoints.length < 2) { this._cancelDrawing(); return; }
        this._removePreview();
        const sp = this.state.drawingStartPoint;
        const pts = [...this.state.drawingPoints];
        this._createPixiDrawing(sp.x, sp.y, pts, this.state.brushSettings.size, this.state.brushSettings.color, this.state.lineStyle, "sketch");
        this._resetDrawingState();
    }

    // ══════════════════════════════════════════════════════════════
    //  LINE (straight segment)
    // ══════════════════════════════════════════════════════════════
    _startLine(e) {
        const wc = this._getWorldCoords(e);
        if (!wc || !this.canvasLayer) return;
        this.state.isDrawing = true;
        this.state.lineStartPoint = wc;
        this._previewGraphics = new PIXI.Graphics();
        this._previewGraphics.alpha = this.state.opacity;
        this.canvasLayer.addChild(this._previewGraphics);
    }

    _updateLinePreview(e) {
        if (!this.state.isDrawing || !this._previewGraphics || !this.state.lineStartPoint) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        this.state.lastMousePosition = wc;
        const s = this.state.lineStartPoint;
        const pts = [[0, 0], [wc.x - s.x, wc.y - s.y]];
        const color = this._cssToPixi(this.state.brushSettings.color);
        const sw = this.state.brushSettings.size;
        this._previewGraphics.clear();
        this._previewGraphics.lineStyle(sw, 0x000000, 0.3);
        this._drawLineWithStyle(this._previewGraphics, pts, s.x + 2, s.y + 2, sw, 0x000000, 0.3, "solid");
        this._drawLineWithStyle(this._previewGraphics, pts, s.x, s.y, sw, color, 1.0, this.state.lineStyle);
    }

    _finishLine(e) {
        if (!this.state.isDrawing || !this.state.lineStartPoint) return;
        let wc = this.state.lastMousePosition;
        if (!wc && e) wc = this._getWorldCoords(e);
        if (!wc) { this._cancelDrawing(); return; }
        this._removePreview();
        const s = this.state.lineStartPoint;
        const pts = [[0, 0], [wc.x - s.x, wc.y - s.y]];
        this._createPixiDrawing(s.x, s.y, pts, this.state.brushSettings.size, this.state.brushSettings.color, this.state.lineStyle, "line");
        this._resetDrawingState();
    }

    // ══════════════════════════════════════════════════════════════
    //  BOX
    // ══════════════════════════════════════════════════════════════
    _startBox(e) {
        const wc = this._getWorldCoords(e);
        if (!wc || !this.canvasLayer) return;
        this.state.isDrawing = true;
        this.state.boxStartPoint = wc;
        this._previewGraphics = new PIXI.Graphics();
        this._previewGraphics.alpha = this.state.opacity;
        this.canvasLayer.addChild(this._previewGraphics);
    }

    _updateBoxPreview(e) {
        if (!this.state.isDrawing || !this._previewGraphics || !this.state.boxStartPoint) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        this.state.lastMousePosition = wc;
        const s = this.state.boxStartPoint;
        const w = wc.x - s.x, h = wc.y - s.y;
        const color = this._cssToPixi(this.state.brushSettings.color);
        const sw = this.state.brushSettings.size;
        this._previewGraphics.clear();
        this._previewGraphics.lineStyle(sw, 0x000000, 0.3);
        this._drawBoxWithStyle(this._previewGraphics, s.x + 2, s.y + 2, w, h, "solid");
        this._previewGraphics.lineStyle(sw, color, 1.0);
        this._drawBoxWithStyle(this._previewGraphics, s.x, s.y, w, h, this.state.lineStyle);
    }

    _finishBox(e) {
        if (!this.state.isDrawing || !this.state.boxStartPoint) return;
        let wc = this.state.lastMousePosition;
        if (!wc && e) wc = this._getWorldCoords(e);
        if (!wc) { this._cancelDrawing(); return; }
        this._removePreview();
        const s = this.state.boxStartPoint;
        const w = wc.x - s.x, h = wc.y - s.y;
        this._createBoxDrawing(s.x, s.y, w, h);
        this._resetDrawingState();
    }

    // ══════════════════════════════════════════════════════════════
    //  ELLIPSE
    // ══════════════════════════════════════════════════════════════
    _startEllipse(e) {
        const wc = this._getWorldCoords(e);
        if (!wc || !this.canvasLayer) return;
        this.state.isDrawing = true;
        this.state.ellipseStartPoint = wc;
        this._previewGraphics = new PIXI.Graphics();
        this._previewGraphics.alpha = this.state.opacity;
        this.canvasLayer.addChild(this._previewGraphics);
    }

    _updateEllipsePreview(e) {
        if (!this.state.isDrawing || !this._previewGraphics || !this.state.ellipseStartPoint) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        this.state.lastMousePosition = wc;
        const s = this.state.ellipseStartPoint;
        const w = wc.x - s.x, h = wc.y - s.y;
        const color = this._cssToPixi(this.state.brushSettings.color);
        const sw = this.state.brushSettings.size;
        this._previewGraphics.clear();
        this._previewGraphics.lineStyle(sw, 0x000000, 0.3);
        this._drawEllipseWithStyle(this._previewGraphics, s.x + 2, s.y + 2, w, h, "solid");
        this._previewGraphics.lineStyle(sw, color, 1.0);
        this._drawEllipseWithStyle(this._previewGraphics, s.x, s.y, w, h, this.state.lineStyle);
    }

    _finishEllipse(e) {
        if (!this.state.isDrawing || !this.state.ellipseStartPoint) return;
        let wc = this.state.lastMousePosition;
        if (!wc && e) wc = this._getWorldCoords(e);
        if (!wc) { this._cancelDrawing(); return; }
        this._removePreview();
        const s = this.state.ellipseStartPoint;
        const w = wc.x - s.x, h = wc.y - s.y;
        this._createEllipseDrawing(s.x, s.y, w, h);
        this._resetDrawingState();
    }

    // ══════════════════════════════════════════════════════════════
    //  STAMP (symbol)
    // ══════════════════════════════════════════════════════════════
    _stampSymbol(symbolType, e) {
        if (!this.canvasLayer) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        this._removePreviewSymbol();
        this._createSymbolAt(symbolType, wc.x, wc.y);
    }

    _updatePreviewSymbol(e) {
        if (this.state.drawingMode !== "stamp" || !this.canvasLayer) return;
        const wc = this._getWorldCoords(e);
        if (!wc) return;
        this._removePreviewSymbol();
        const g = new PIXI.Graphics();
        const sqSize = STAMP_SIZES[this.state.symbolSize] || STAMP_SIZES.medium;
        const sw = (this.state.stampStyle === "hex-outline") ? this.state.brushSettings.size : sqSize * 0.30;
        const color = this._cssToPixi(this.state.brushSettings.color);
        const half = sqSize / 2;
        const pad = sqSize * 0.1;
        this._drawSymbolShape(g, this.state.stampStyle, wc.x, wc.y, half, pad, sw, color, 0.5, 0x000000, 0.15, 2);
        g.alpha = this.state.opacity;
        this.canvasLayer.addChild(g);
        this._previewSymbol = g;
    }

    _removePreviewSymbol() {
        if (this._previewSymbol?.parent) {
            this._previewSymbol.parent.removeChild(this._previewSymbol);
            this._previewSymbol.destroy();
            this._previewSymbol = null;
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  CREATION HELPERS
    // ══════════════════════════════════════════════════════════════
    _createPixiDrawing(startX, startY, points, strokeWidth, strokeColor, lineStyle, type) {
        if (!this.canvasLayer) return;
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(strokeColor);
        // Shadow
        g.lineStyle(strokeWidth, 0x000000, 0.3);
        if (points.length > 0) {
            g.moveTo(startX + points[0][0] + 2, startY + points[0][1] + 2);
            for (let i = 1; i < points.length; i++) g.lineTo(startX + points[i][0] + 2, startY + points[i][1] + 2);
        }
        // Main
        this._drawLineWithStyle(g, points, startX, startY, strokeWidth, color, 1.0, lineStyle);
        g.alpha = this.state.opacity;
        this.canvasLayer.addChild(g);
        const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const data = { id, graphics: g, createdAt: Date.now(), expiresAt: this._getExpiration(), userId: game.user.id, userName: game.user.name, startX, startY, points, strokeWidth, strokeColor, lineStyle, type, opacity: this.state.opacity };
        this._finalizeDrawing(data, { drawingId: id, userId: game.user.id, userName: game.user.name, startX, startY, points, strokeWidth, strokeColor, lineStyle, type, opacity: this.state.opacity, createdAt: data.createdAt, expiresAt: data.expiresAt });
    }

    _createBoxDrawing(startX, startY, w, h) {
        if (!this.canvasLayer) return;
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(this.state.brushSettings.color);
        const sw = this.state.brushSettings.size;
        const ls = this.state.lineStyle;
        g.lineStyle(sw, 0x000000, 0.3);
        this._drawBoxWithStyle(g, startX + 2, startY + 2, w, h, "solid");
        g.lineStyle(sw, color, 1.0);
        this._drawBoxWithStyle(g, startX, startY, w, h, ls);
        g.alpha = this.state.opacity;
        this.canvasLayer.addChild(g);
        const id = `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const data = { id, graphics: g, createdAt: Date.now(), expiresAt: this._getExpiration(), userId: game.user.id, userName: game.user.name, startX, startY, width: w, height: h, strokeWidth: sw, strokeColor: this.state.brushSettings.color, lineStyle: ls, type: "box", opacity: this.state.opacity };
        this._finalizeDrawing(data, { drawingId: id, userId: game.user.id, userName: game.user.name, startX, startY, width: w, height: h, strokeWidth: sw, strokeColor: this.state.brushSettings.color, lineStyle: ls, type: "box", opacity: this.state.opacity, createdAt: data.createdAt, expiresAt: data.expiresAt });
    }

    _createEllipseDrawing(startX, startY, w, h) {
        if (!this.canvasLayer) return;
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(this.state.brushSettings.color);
        const sw = this.state.brushSettings.size;
        const ls = this.state.lineStyle;
        g.lineStyle(sw, 0x000000, 0.3);
        this._drawEllipseWithStyle(g, startX + 2, startY + 2, w, h, "solid");
        g.lineStyle(sw, color, 1.0);
        this._drawEllipseWithStyle(g, startX, startY, w, h, ls);
        g.alpha = this.state.opacity;
        this.canvasLayer.addChild(g);
        const id = `ellipse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const data = { id, graphics: g, createdAt: Date.now(), expiresAt: this._getExpiration(), userId: game.user.id, userName: game.user.name, startX, startY, width: w, height: h, strokeWidth: sw, strokeColor: this.state.brushSettings.color, lineStyle: ls, type: "ellipse", opacity: this.state.opacity };
        this._finalizeDrawing(data, { drawingId: id, userId: game.user.id, userName: game.user.name, startX, startY, width: w, height: h, strokeWidth: sw, strokeColor: this.state.brushSettings.color, lineStyle: ls, type: "ellipse", opacity: this.state.opacity, createdAt: data.createdAt, expiresAt: data.expiresAt });
    }

    _createSymbolAt(symbolType, x, y) {
        if (!this.canvasLayer) return;
        const g = new PIXI.Graphics();
        const sqSize = STAMP_SIZES[this.state.symbolSize] || STAMP_SIZES.medium;
        const sw = (symbolType === "hex-outline") ? this.state.brushSettings.size : sqSize * 0.30;
        const color = this._cssToPixi(this.state.brushSettings.color);
        const half = sqSize / 2;
        const pad = sqSize * 0.1;
        this._drawSymbolShape(g, symbolType, x, y, half, pad, sw, color, 1.0, 0x000000, 0.3, 2);
        g.alpha = this.state.opacity;
        this.canvasLayer.addChild(g);
        const id = `symbol-${symbolType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const data = { id, graphics: g, createdAt: Date.now(), expiresAt: this._getExpiration(), userId: game.user.id, userName: game.user.name, symbolType, x, y, strokeWidth: sw, strokeColor: this.state.brushSettings.color, symbolSize: this.state.symbolSize, opacity: this.state.opacity };
        this._finalizeDrawing(data, { drawingId: id, userId: game.user.id, userName: game.user.name, symbolType, x, y, strokeWidth: sw, strokeColor: this.state.brushSettings.color, symbolSize: this.state.symbolSize, opacity: this.state.opacity, createdAt: data.createdAt, expiresAt: data.expiresAt });
    }

    // ══════════════════════════════════════════════════════════════
    //  DRAWING PRIMITIVES
    // ══════════════════════════════════════════════════════════════
    _drawLineWithStyle(g, pts, sx, sy, sw, color, alpha, style) {
        if (!pts || pts.length === 0) return;
        g.lineStyle(sw, color, alpha);
        if (style === "solid") {
            g.moveTo(sx + pts[0][0], sy + pts[0][1]);
            for (let i = 1; i < pts.length; i++) g.lineTo(sx + pts[i][0], sy + pts[i][1]);
        } else if (style === "dotted") {
            const dotR = sw * 0.4, dotSp = sw * 4;
            let total = 0; const segs = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 0) { segs.push({ x1: sx + pts[i][0], y1: sy + pts[i][1], dx, dy, dist: d }); total += d; }
            }
            let cur = 0;
            while (cur < total) {
                let sl = 0;
                for (const seg of segs) {
                    if (cur >= sl && cur < sl + seg.dist) {
                        const t = (cur - sl) / seg.dist;
                        g.beginFill(color, alpha);
                        g.drawCircle(seg.x1 + seg.dx * t, seg.y1 + seg.dy * t, dotR);
                        g.endFill();
                        break;
                    }
                    sl += seg.dist;
                }
                cur += dotSp;
            }
        } else if (style === "dashed") {
            const dashL = sw * 6, gapL = sw * 2;
            let total = 0; const segs = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1];
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > 0) { segs.push({ x1: sx + pts[i][0], y1: sy + pts[i][1], x2: sx + pts[i + 1][0], y2: sy + pts[i + 1][1], dx, dy, dist: d }); total += d; }
            }
            let cur = 0, drawing = true;
            while (cur < total) {
                const segL = drawing ? dashL : gapL;
                const next = Math.min(cur + segL, total);
                if (drawing) {
                    let sl = 0, startPt = null, endPt = null;
                    for (const seg of segs) {
                        if (!startPt && cur >= sl && cur < sl + seg.dist) { const t = (cur - sl) / seg.dist; startPt = { x: seg.x1 + seg.dx * t, y: seg.y1 + seg.dy * t }; }
                        if (!endPt && next >= sl && next <= sl + seg.dist) { const t = (next - sl) / seg.dist; endPt = { x: seg.x1 + seg.dx * t, y: seg.y1 + seg.dy * t }; }
                        if (startPt && endPt) break;
                        sl += seg.dist;
                    }
                    if (startPt && endPt) { g.moveTo(startPt.x, startPt.y); g.lineTo(endPt.x, endPt.y); }
                }
                cur = next;
                drawing = !drawing;
            }
        }
    }

    _drawBoxWithStyle(g, x, y, w, h, style) {
        if (style === "solid") {
            g.drawRect(x, y, w, h);
        } else {
            const sw = this.state.brushSettings.size;
            const color = this._cssToPixi(this.state.brushSettings.color);
            this._drawLineWithStyle(g, [[0, 0], [w, 0]], x, y, sw, color, 1.0, style);
            this._drawLineWithStyle(g, [[0, 0], [0, h]], x + w, y, sw, color, 1.0, style);
            this._drawLineWithStyle(g, [[0, 0], [-w, 0]], x + w, y + h, sw, color, 1.0, style);
            this._drawLineWithStyle(g, [[0, 0], [0, -h]], x, y + h, sw, color, 1.0, style);
        }
    }

    _drawEllipseWithStyle(g, x, y, w, h, style) {
        const cx = x + w / 2, cy = y + h / 2;
        const hw = Math.abs(w) / 2, hh = Math.abs(h) / 2;
        if (style === "solid") {
            g.drawEllipse(cx, cy, hw, hh);
        } else {
            const segs = 48;
            const color = this._cssToPixi(this.state.brushSettings.color);
            const sw = this.state.brushSettings.size;
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const t = (Math.PI * 2 * i) / segs;
                pts.push([cx + hw * Math.cos(t), cy + hh * Math.sin(t)]);
            }
            for (let i = 0; i < segs; i++) {
                const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
                this._drawLineWithStyle(g, [[0, 0], [x1 - x0, y1 - y0]], x0, y0, sw, color, 1.0, style);
            }
        }
    }

    // ── Symbol shape drawing ────────────────────────────────────
    _drawSymbolShape(g, type, cx, cy, half, pad, sw, color, alpha, shadowColor, shadowAlpha, shadowOff) {
        switch (type) {
            case "plus": {
                const arm = half - pad;
                g.lineStyle(sw, shadowColor, shadowAlpha);
                g.moveTo(cx - arm + shadowOff, cy + shadowOff); g.lineTo(cx + arm + shadowOff, cy + shadowOff);
                g.moveTo(cx + shadowOff, cy - arm + shadowOff); g.lineTo(cx + shadowOff, cy + arm + shadowOff);
                g.lineStyle(sw, color, alpha);
                g.moveTo(cx - arm, cy); g.lineTo(cx + arm, cy);
                g.moveTo(cx, cy - arm); g.lineTo(cx, cy + arm);
                break;
            }
            case "x": {
                const arm = (half - pad) * 0.707;
                g.lineStyle(sw, shadowColor, shadowAlpha);
                g.moveTo(cx - arm + shadowOff, cy - arm + shadowOff); g.lineTo(cx + arm + shadowOff, cy + arm + shadowOff);
                g.moveTo(cx + arm + shadowOff, cy - arm + shadowOff); g.lineTo(cx - arm + shadowOff, cy + arm + shadowOff);
                g.lineStyle(sw, color, alpha);
                g.moveTo(cx - arm, cy - arm); g.lineTo(cx + arm, cy + arm);
                g.moveTo(cx + arm, cy - arm); g.lineTo(cx - arm, cy + arm);
                break;
            }
            case "dot": {
                const r = half - pad;
                g.lineStyle(0);
                g.beginFill(shadowColor, shadowAlpha); g.drawCircle(cx + shadowOff, cy + shadowOff, r); g.endFill();
                g.beginFill(color, alpha); g.drawCircle(cx, cy, r); g.endFill();
                break;
            }
            case "arrow": case "arrow-up": case "arrow-down": case "arrow-left": {
                const sf = 0.70, sh = (half - pad) * sf;
                let base = [cx - sh, cy - sh, cx - sh + (2 * sh * 0.25), cy, cx - sh, cy + sh, cx + sh, cy];
                let angle = type === "arrow-up" ? -Math.PI / 2 : type === "arrow-down" ? Math.PI / 2 : type === "arrow-left" ? Math.PI : 0;
                let rot = [];
                for (let i = 0; i < base.length; i += 2) {
                    const tx = base[i] - cx, ty = base[i + 1] - cy;
                    rot.push(tx * Math.cos(angle) - ty * Math.sin(angle) + cx, tx * Math.sin(angle) + ty * Math.cos(angle) + cy);
                }
                let shadow = rot.map((v, i) => v + shadowOff);
                // Fix: shadow needs alternating offsets
                shadow = [];
                for (let i = 0; i < rot.length; i++) shadow.push(rot[i] + shadowOff);
                g.lineStyle(0);
                g.beginFill(shadowColor, shadowAlpha); g.drawPolygon(shadow); g.endFill();
                g.beginFill(color, alpha); g.drawPolygon(rot); g.endFill();
                break;
            }
            case "square": {
                const sf = 0.85, sh = (half - pad) * sf, sz = sh * 2, cr = sz * 0.08;
                g.lineStyle(0);
                g.beginFill(shadowColor, shadowAlpha); g.drawRoundedRect(cx - sh + shadowOff, cy - sh + shadowOff, sz, sz, cr); g.endFill();
                g.beginFill(color, alpha); g.drawRoundedRect(cx - sh, cy - sh, sz, sz, cr); g.endFill();
                break;
            }
            case "hex-outline": {
                // Determine size tier from half (derived from STAMP_SIZES: small=40, medium=80, large=140)
                // half values: 20, 40, 70
                let tier = "small";
                if (half >= 35 && half < 60) tier = "medium";
                else if (half >= 60) tier = "large";

                const points = this._getHexClusterOutline(tier, cx, cy);
                if (points && points.length > 6) {
                    // Draw the outline path
                    g.lineStyle(sw, shadowColor, shadowAlpha);
                    g.moveTo(points[0] + shadowOff, points[1] + shadowOff);
                    for (let i = 2; i < points.length; i += 2) {
                        g.lineTo(points[i] + shadowOff, points[i + 1] + shadowOff);
                    }
                    g.closePath();
                    g.lineStyle(sw, color, alpha);
                    g.moveTo(points[0], points[1]);
                    for (let i = 2; i < points.length; i += 2) {
                        g.lineTo(points[i], points[i + 1]);
                    }
                    g.closePath();
                } else {
                    // Fallback: Draw single hex using grid size
                    const gridSize = canvas?.grid?.size || 100;
                    // Detect orientation
                    const grid = canvas?.grid;
                    let pointyTop = false;
                    if (grid?.columns !== undefined) pointyTop = grid.columns;
                    else if (grid?.type !== undefined) pointyTop = (grid.type === 2 || grid.type === 3);
                    // Detection inverted: pointyTop=true → flat hex, pointyTop=false → pointy hex
                    const r = (gridSize / 2) * 1.155; // Scale to match grid
                    const angleOffset = pointyTop ? 0 : Math.PI / 6;
                    const verts = [];
                    for (let i = 0; i < 6; i++) {
                        const angle = angleOffset + (Math.PI / 3) * i;
                        verts.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
                    }
                    g.lineStyle(sw, shadowColor, shadowAlpha);
                    g.drawPolygon(verts.map((v, i) => v + shadowOff));
                    g.lineStyle(sw, color, alpha);
                    g.drawPolygon(verts);
                }
                break;
            }
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  REMOTE DRAWING HANDLING
    // ══════════════════════════════════════════════════════════════
    _handleRemoteDrawing(data) {
        if (data.userId === game.user.id) return;
        if (!data?.drawingId) return;
        if (!this.canvasLayer) return;
        // Route permanent drawings to the permanent renderer
        if (data.permanent) {
            if (this._permanentDrawings.some(d => d.id === data.drawingId)) return;
            this._renderPermanentEntry(data);
            return;
        }
        if (this._pixiDrawings.some(d => d.id === data.drawingId)) return;
        try {
            if (data.symbolType) this._createRemoteSymbol(data);
            else if (data.type === "box") this._createRemoteBox(data);
            else if (data.type === "ellipse") this._createRemoteEllipse(data);
            else if (data.startX !== undefined && data.points) this._createRemoteLine(data);
        } catch (e) { console.error("SDX Drawing | Remote drawing error:", e); }
    }

    _createRemoteLine(data) {
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(data.strokeColor);
        const sw = data.strokeWidth || 6;
        g.lineStyle(sw, 0x000000, 0.3);
        if (data.points.length > 0) { g.moveTo(data.startX + data.points[0][0] + 2, data.startY + data.points[0][1] + 2); for (let i = 1; i < data.points.length; i++) g.lineTo(data.startX + data.points[i][0] + 2, data.startY + data.points[i][1] + 2); }
        this._drawLineWithStyle(g, data.points, data.startX, data.startY, sw, color, 1.0, data.lineStyle || "solid");
        if (data.opacity !== undefined) g.alpha = data.opacity;
        this.canvasLayer.addChild(g);
        this._pixiDrawings.push({ id: data.drawingId, graphics: g, createdAt: data.createdAt || Date.now(), expiresAt: data.expiresAt, userId: data.userId, userName: data.userName });
        this._scheduleCleanup();
    }

    _createRemoteBox(data) {
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(data.strokeColor);
        const sw = data.strokeWidth || 6;
        const ls = data.lineStyle || "solid";
        g.lineStyle(sw, 0x000000, 0.3);
        this._drawBoxWithStyle(g, data.startX + 2, data.startY + 2, data.width, data.height, "solid");
        g.lineStyle(sw, color, 1.0);
        this._drawBoxWithStyle(g, data.startX, data.startY, data.width, data.height, ls);
        if (data.opacity !== undefined) g.alpha = data.opacity;
        this.canvasLayer.addChild(g);
        this._pixiDrawings.push({ id: data.drawingId, graphics: g, createdAt: data.createdAt || Date.now(), expiresAt: data.expiresAt, userId: data.userId, userName: data.userName, type: "box" });
        this._scheduleCleanup();
    }

    _createRemoteEllipse(data) {
        const g = new PIXI.Graphics();
        const color = this._cssToPixi(data.strokeColor);
        const sw = data.strokeWidth || 6;
        const ls = data.lineStyle || "solid";
        g.lineStyle(sw, 0x000000, 0.3);
        this._drawEllipseWithStyle(g, data.startX + 2, data.startY + 2, data.width, data.height, "solid");
        g.lineStyle(sw, color, 1.0);
        this._drawEllipseWithStyle(g, data.startX, data.startY, data.width, data.height, ls);
        if (data.opacity !== undefined) g.alpha = data.opacity;
        this.canvasLayer.addChild(g);
        this._pixiDrawings.push({ id: data.drawingId, graphics: g, createdAt: data.createdAt || Date.now(), expiresAt: data.expiresAt, userId: data.userId, userName: data.userName, type: "ellipse" });
        this._scheduleCleanup();
    }

    _createRemoteSymbol(data) {
        const g = new PIXI.Graphics();
        const sqSize = STAMP_SIZES[data.symbolSize] || STAMP_SIZES.medium;
        const sw = data.strokeWidth || sqSize * 0.30;
        const color = this._cssToPixi(data.strokeColor);
        const half = sqSize / 2, pad = sqSize * 0.1;
        this._drawSymbolShape(g, data.symbolType, data.x, data.y, half, pad, sw, color, 1.0, 0x000000, 0.3, 2);
        if (data.opacity !== undefined) g.alpha = data.opacity;
        this.canvasLayer.addChild(g);
        this._pixiDrawings.push({ id: data.drawingId, graphics: g, createdAt: data.createdAt || Date.now(), expiresAt: data.expiresAt, userId: data.userId, userName: data.userName, symbolType: data.symbolType });
        this._scheduleCleanup();
    }

    _handleRemoteDeletion(data) {
        if (data.userId === game.user.id) return;
        // Handle permanent drawing deletion
        if (data.permanent && data.drawingId) {
            const idx = this._permanentDrawings.findIndex(d => d.id === data.drawingId);
            if (idx !== -1) {
                const d = this._permanentDrawings[idx];
                if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
                this._permanentDrawings.splice(idx, 1);
                if (this._lastPermanentDrawing?.id === data.drawingId) {
                    this._lastPermanentDrawing = this._permanentDrawings.length ? this._permanentDrawings[this._permanentDrawings.length - 1] : null;
                }
            }
            return;
        }
        if (data.clearAll) {
            if (game.users.get(data.userId)?.isGM) this.clearAllDrawings(false);
        } else if (data.drawingId) {
            this._deleteById(data.drawingId, false);
        } else {
            this.clearUserDrawings(data.userId, false);
        }
    }

    // ══════════════════════════════════════════════════════════════
    //  CLEAR / UNDO / CLEANUP
    // ══════════════════════════════════════════════════════════════
    _fadeOutAndRemove(g, duration = 300) {
        if (!g?.parent) return;
        const startAlpha = g.alpha;
        const start = Date.now();
        const animate = () => {
            const elapsed = Date.now() - start;
            const p = Math.min(elapsed / duration, 1);
            g.alpha = startAlpha * (1 - (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(animate);
            else { if (g.parent) g.parent.removeChild(g); g.destroy(); }
        };
        requestAnimationFrame(animate);
    }

    clearAllDrawings(broadcast = true) {
        if (!this._pixiDrawings.length) return;
        this._pixiDrawings.forEach(d => { if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics); });
        this._pixiDrawings = [];
        this._lastDrawing = null;
        if (broadcast) this._broadcast("sdx-drawing-deleted", { userId: game.user.id, clearAll: true });
    }

    async clearPermanentDrawings(broadcast = true) {
        this._permanentDrawings.forEach(d => {
            if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
        });
        this._permanentDrawings = [];
        this._lastPermanentDrawing = null;
        if (game.user.isGM && canvas.scene) {
            try { await canvas.scene.setFlag(MODULE_ID, "permanentDrawings", []); } catch { }
        }
        if (broadcast) this._broadcast("sdx-permanent-cleared", { userId: game.user.id });
    }

    async _undoLastPermanent() {
        if (!this._lastPermanentDrawing) { ui.notifications.warn("No permanent drawing to undo"); return; }
        const d = this._lastPermanentDrawing;
        if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
        this._permanentDrawings = this._permanentDrawings.filter(dd => dd.id !== d.id);
        this._lastPermanentDrawing = this._permanentDrawings.length ? this._permanentDrawings[this._permanentDrawings.length - 1] : null;
        // Update scene flag
        if (game.user.isGM && canvas.scene) {
            try {
                const saved = canvas.scene.getFlag(MODULE_ID, "permanentDrawings") || [];
                const updated = saved.filter(s => s.drawingId !== d.id);
                await canvas.scene.setFlag(MODULE_ID, "permanentDrawings", updated);
            } catch { }
        }
        this._broadcast("sdx-drawing-deleted", { userId: game.user.id, drawingId: d.id, permanent: true });
    }

    clearUserDrawings(userId = game.user.id, broadcast = true) {
        let removed = 0;
        this._pixiDrawings = this._pixiDrawings.filter(d => {
            if (d.userId === userId) { if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics); removed++; return false; }
            return true;
        });
        if (this._lastDrawing?.userId === userId) this._lastDrawing = null;
        if (removed > 0 && broadcast) this._broadcast("sdx-drawing-deleted", { userId, clearAll: false });
        return removed;
    }

    undoLastDrawing() {
        // If in permanent mode and GM, undo last permanent drawing
        if (this.state.permanentMode && game.user.isGM) { this._undoLastPermanent(); return; }
        if (!this._lastDrawing) { ui.notifications.warn("No drawing to undo"); return; }
        if (!game.user.isGM && this._lastDrawing.userId !== game.user.id) { ui.notifications.warn("Can only undo your own drawings"); return; }
        const d = this._lastDrawing;
        if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
        this._pixiDrawings = this._pixiDrawings.filter(dd => dd.id !== d.id);
        this._lastDrawing = null;
        const userDrawings = this._pixiDrawings.filter(dd => dd.userId === game.user.id);
        if (userDrawings.length) { userDrawings.sort((a, b) => b.createdAt - a.createdAt); this._lastDrawing = userDrawings[0]; }
        this._broadcast("sdx-drawing-deleted", { userId: game.user.id, drawingId: d.id, clearAll: false });
    }

    _deleteById(drawingId, broadcast = true) {
        const idx = this._pixiDrawings.findIndex(d => d.id === drawingId);
        if (idx === -1) return;
        const d = this._pixiDrawings[idx];
        if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
        this._pixiDrawings.splice(idx, 1);
        if (this._lastDrawing?.id === drawingId) { this._lastDrawing = null; const ud = this._pixiDrawings.filter(dd => dd.userId === game.user.id); if (ud.length) { ud.sort((a, b) => b.createdAt - a.createdAt); this._lastDrawing = ud[0]; } }
        if (broadcast) this._broadcast("sdx-drawing-deleted", { userId: game.user.id, drawingId, clearAll: false });
    }

    // ── Expiration / Cleanup ────────────────────────────────────
    _getExpiration() {
        if (!this.state.timedEraseEnabled) return null;
        let timeout = 30;
        try { timeout = game.settings.get(MODULE_ID, "drawing.timedEraseTimeout"); } catch { }
        return timeout > 0 ? Date.now() + timeout * 1000 : null;
    }

    _scheduleCleanup() {
        if (this._cleanupInterval) return;
        const interval = this.state.timedEraseEnabled ? 2000 : 10000;
        this._cleanupInterval = setInterval(() => this._cleanupExpired(), interval);
        if (this.state.timedEraseEnabled) this._cleanupExpired();
    }

    _cleanupExpired() {
        if (!this._pixiDrawings.length) return;
        const now = Date.now();
        const isGM = game.user.isGM;
        this._pixiDrawings = this._pixiDrawings.filter(d => {
            if (d.expiresAt && now > d.expiresAt) {
                if (this.state.timedEraseEnabled && !isGM && d.userId !== game.user.id) return true;
                if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
                return false;
            }
            return true;
        });
    }

    // ── Helpers ──────────────────────────────────────────────────
    _removePreview() {
        if (this._previewGraphics?.parent) {
            this._previewGraphics.parent.removeChild(this._previewGraphics);
            this._previewGraphics.destroy();
            this._previewGraphics = null;
        }
    }

    _cancelDrawing() {
        this._removePreview();
        this.state.isDrawing = false;
        this.state.drawingPoints = [];
        this.state.drawingStartPoint = null;
        this.state.boxStartPoint = null;
        this.state.ellipseStartPoint = null;
        this.state.lineStartPoint = null;
        this.state.lastMousePosition = null;
    }

    _resetDrawingState() {
        this.state.isDrawing = false;
        this.state.drawingPoints = [];
        this.state.drawingStartPoint = null;
        this.state.boxStartPoint = null;
        this.state.ellipseStartPoint = null;
        this.state.lineStartPoint = null;
        this.state.lastMousePosition = null;
    }

    // ══════════════════════════════════════════════════════════════
    //  PERMANENT DRAWINGS
    // ══════════════════════════════════════════════════════════════
    _finalizeDrawing(localData, broadcastPayload) {
        const isPerm = this.state.permanentMode && game.user.isGM;
        if (isPerm) {
            localData.permanent = true;
            this._permanentDrawings.push(localData);
            this._lastPermanentDrawing = localData;
            broadcastPayload.permanent = true;
            this._broadcast("sdx-drawing-created", broadcastPayload);
            this._savePermanentToScene(broadcastPayload);
        } else {
            this._pixiDrawings.push(localData);
            this._lastDrawing = localData;
            this._scheduleCleanup();
            this._broadcast("sdx-drawing-created", broadcastPayload);
        }
    }

    async _savePermanentToScene(data) {
        const scene = canvas.scene;
        if (!scene || !game.user.isGM) return;
        try {
            const existing = scene.getFlag(MODULE_ID, "permanentDrawings") || [];
            existing.push(data);
            await scene.setFlag(MODULE_ID, "permanentDrawings", existing);
        } catch (e) {
            console.error("SDX Drawing | Failed to save permanent drawing:", e);
        }
    }

    _loadPermanentDrawings() {
        // Destroy old permanent PIXI objects
        this._permanentDrawings.forEach(d => {
            if (d.graphics?.parent) { d.graphics.parent.removeChild(d.graphics); d.graphics.destroy(); }
        });
        this._permanentDrawings = [];
        this._lastPermanentDrawing = null;
        const scene = canvas.scene;
        if (!scene) return;
        const saved = scene.getFlag(MODULE_ID, "permanentDrawings") || [];
        for (const entry of saved) {
            this._renderPermanentEntry(entry);
        }
    }

    _renderPermanentEntry(data) {
        if (!this.canvasLayer || !data?.drawingId) return;
        // Avoid duplicates
        if (this._permanentDrawings.some(d => d.id === data.drawingId)) return;
        try {
            let g;
            if (data.symbolType) {
                g = new PIXI.Graphics();
                const sqSize = STAMP_SIZES[data.symbolSize] || STAMP_SIZES.medium;
                const sw = sqSize * 0.30;
                const color = this._cssToPixi(data.strokeColor);
                const half = sqSize / 2, pad = sqSize * 0.1;
                this._drawSymbolShape(g, data.symbolType, data.x, data.y, half, pad, sw, color, 1.0, 0x000000, 0.3, 2);
            } else if (data.type === "box") {
                g = new PIXI.Graphics();
                const color = this._cssToPixi(data.strokeColor);
                const sw = data.strokeWidth || 6;
                const ls = data.lineStyle || "solid";
                g.lineStyle(sw, 0x000000, 0.3);
                this._drawBoxWithStyle(g, data.startX + 2, data.startY + 2, data.width, data.height, "solid");
                g.lineStyle(sw, color, 1.0);
                this._drawBoxWithStyle(g, data.startX, data.startY, data.width, data.height, ls);
            } else if (data.type === "ellipse") {
                g = new PIXI.Graphics();
                const color = this._cssToPixi(data.strokeColor);
                const sw = data.strokeWidth || 6;
                const ls = data.lineStyle || "solid";
                g.lineStyle(sw, 0x000000, 0.3);
                this._drawEllipseWithStyle(g, data.startX + 2, data.startY + 2, data.width, data.height, "solid");
                g.lineStyle(sw, color, 1.0);
                this._drawEllipseWithStyle(g, data.startX, data.startY, data.width, data.height, ls);
            } else if (data.startX !== undefined && data.points) {
                g = new PIXI.Graphics();
                const color = this._cssToPixi(data.strokeColor);
                const sw = data.strokeWidth || 6;
                g.lineStyle(sw, 0x000000, 0.3);
                if (data.points.length > 0) {
                    g.moveTo(data.startX + data.points[0][0] + 2, data.startY + data.points[0][1] + 2);
                    for (let i = 1; i < data.points.length; i++) g.lineTo(data.startX + data.points[i][0] + 2, data.startY + data.points[i][1] + 2);
                }
                this._drawLineWithStyle(g, data.points, data.startX, data.startY, sw, color, 1.0, data.lineStyle || "solid");
            }
            if (g) {
                if (data.opacity !== undefined) g.alpha = data.opacity;
                this.canvasLayer.addChild(g);
                this._permanentDrawings.push({
                    id: data.drawingId,
                    graphics: g,
                    permanent: true,
                    createdAt: data.createdAt || Date.now(),
                    userId: data.userId,
                    userName: data.userName
                });
                this._lastPermanentDrawing = this._permanentDrawings[this._permanentDrawings.length - 1];
            }
        } catch (e) {
            console.error("SDX Drawing | Failed to render permanent drawing:", e);
        }
    }

    _handleRemotePermanentClear() {
        this._permanentDrawings.forEach(d => {
            if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
        });
        this._permanentDrawings = [];
        this._lastPermanentDrawing = null;
    }

    // ── Inspector helpers ────────────────────────────────────────
    getAllDrawingEntries() {
        const entries = [];
        for (const d of this._pixiDrawings) {
            entries.push({
                id: d.id,
                type: this._inferType(d),
                userName: d.userName || 'Unknown',
                userId: d.userId,
                createdAt: d.createdAt || Date.now(),
                expiresAt: d.expiresAt || null,
                permanent: false,
                opacity: d.graphics?.alpha ?? 1,
            });
        }
        for (const d of this._permanentDrawings) {
            entries.push({
                id: d.id,
                type: this._inferType(d),
                userName: d.userName || 'Unknown',
                userId: d.userId,
                createdAt: d.createdAt || Date.now(),
                expiresAt: null,
                permanent: true,
                opacity: d.graphics?.alpha ?? 1,
            });
        }
        entries.sort((a, b) => b.createdAt - a.createdAt);
        return entries;
    }

    _inferType(entry) {
        if (entry.type && entry.type !== 'drawing') return entry.type;
        if (entry.symbolType) return 'stamp';
        const id = entry.id || '';
        if (id.startsWith('symbol-')) return 'stamp';
        if (id.startsWith('box-')) return 'box';
        if (id.startsWith('ellipse-')) return 'ellipse';
        if (id.startsWith('sketch-')) return 'sketch';
        if (id.startsWith('line-')) return 'line';
        return 'drawing';
    }

    highlightDrawing(id) {
        this.unhighlightDrawing();
        const entry = this._pixiDrawings.find(d => d.id === id) || this._permanentDrawings.find(d => d.id === id);
        if (!entry?.graphics?.parent) return;
        const bounds = entry.graphics.getLocalBounds();
        if (bounds.width < 1 && bounds.height < 1) return;
        const pad = 10;
        const h = new PIXI.Graphics();
        h.lineStyle(3, 0xf0d090, 0.8);
        h.drawRoundedRect(bounds.x - pad, bounds.y - pad, bounds.width + pad * 2, bounds.height + pad * 2, 4);
        h.lineStyle(1, 0xffffff, 0.4);
        h.drawRoundedRect(bounds.x - pad + 2, bounds.y - pad + 2, bounds.width + pad * 2 - 4, bounds.height + pad * 2 - 4, 3);
        this.canvasLayer.addChild(h);
        this._highlightGraphics = h;
        this._highlightPulse = Date.now();
        const animate = () => {
            if (this._highlightGraphics !== h) return;
            const t = (Date.now() - this._highlightPulse) / 600;
            h.alpha = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI));
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    unhighlightDrawing() {
        if (this._highlightGraphics?.parent) {
            this._highlightGraphics.parent.removeChild(this._highlightGraphics);
            this._highlightGraphics.destroy();
        }
        this._highlightGraphics = null;
        this._highlightPulse = null;
    }

    async deleteAnyDrawing(id) {
        if (!game.user.isGM) return;
        this.unhighlightDrawing();
        // Try temporary first
        const tempIdx = this._pixiDrawings.findIndex(d => d.id === id);
        if (tempIdx !== -1) {
            const d = this._pixiDrawings[tempIdx];
            if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
            this._pixiDrawings.splice(tempIdx, 1);
            if (this._lastDrawing?.id === id) {
                this._lastDrawing = null;
                const ud = this._pixiDrawings.filter(dd => dd.userId === game.user.id);
                if (ud.length) { ud.sort((a, b) => b.createdAt - a.createdAt); this._lastDrawing = ud[0]; }
            }
            this._broadcast("sdx-drawing-deleted", { userId: game.user.id, drawingId: id, clearAll: false });
            return;
        }
        // Try permanent
        const permIdx = this._permanentDrawings.findIndex(d => d.id === id);
        if (permIdx !== -1) {
            const d = this._permanentDrawings[permIdx];
            if (d.graphics?.parent) this._fadeOutAndRemove(d.graphics);
            this._permanentDrawings.splice(permIdx, 1);
            if (this._lastPermanentDrawing?.id === id) {
                this._lastPermanentDrawing = this._permanentDrawings.length ? this._permanentDrawings[this._permanentDrawings.length - 1] : null;
            }
            if (canvas.scene) {
                try {
                    const saved = canvas.scene.getFlag(MODULE_ID, "permanentDrawings") || [];
                    const updated = saved.filter(s => s.drawingId !== id);
                    await canvas.scene.setFlag(MODULE_ID, "permanentDrawings", updated);
                } catch { }
            }
            this._broadcast("sdx-drawing-deleted", { userId: game.user.id, drawingId: id, permanent: true });
        }
    }

    // ── Public setters (called by toolbar) ──────────────────────
    setDrawingMode(mode) { if (["sketch", "line", "box", "ellipse", "stamp"].includes(mode)) { this.state.drawingMode = mode; try { game.settings.set(MODULE_ID, "drawing.toolbar.drawingMode", mode); } catch { } } }
    setStampStyle(style) { const v = ["plus", "x", "dot", "arrow", "arrow-up", "arrow-down", "arrow-left", "square", "hex-outline"]; if (v.includes(style)) { this.state.stampStyle = style; try { game.settings.set(MODULE_ID, "drawing.toolbar.stampStyle", style); } catch { } } }
    setSymbolSize(size) { if (["small", "medium", "large"].includes(size)) { this.state.symbolSize = size; try { game.settings.set(MODULE_ID, "drawing.toolbar.symbolSize", size); } catch { } } }
    setLineStyle(style) { if (["solid", "dotted", "dashed"].includes(style)) { this.state.lineStyle = style; try { game.settings.set(MODULE_ID, "drawing.toolbar.lineStyle", style); } catch { } } }
    setBrushSize(size) { this.state.brushSettings.size = Math.max(1, Math.min(20, size)); try { game.settings.set(MODULE_ID, "drawing.toolbar.lineWidth", this.state.brushSettings.size); } catch { } }
    setBrushColor(color) { this.state.brushSettings.color = color; try { game.settings.set(MODULE_ID, "drawing.toolbar.color", color); } catch { } }
    setTimedErase(enabled) {
        this.state.timedEraseEnabled = enabled;
        try { game.settings.set(MODULE_ID, "drawing.toolbar.timedEraseEnabled", enabled); } catch { }
        if (this._cleanupInterval) { clearInterval(this._cleanupInterval); this._cleanupInterval = null; }
        if (this._pixiDrawings.length) this._scheduleCleanup();
    }
    setPermanentMode(enabled) { this.state.permanentMode = !!enabled; }
    setOpacity(val) { this.state.opacity = Math.max(0.1, Math.min(1.0, Number(val) || 1.0)); try { game.settings.set(MODULE_ID, "drawing.toolbar.opacity", this.state.opacity); } catch { } }

    // ── Hex Outline Helper ──────────────────────────────────────
    _getHexClusterOutline(tier, centerX, centerY) {
        // Get grid size - this determines hex dimensions
        const gridSize = canvas?.grid?.size || canvas?.dimensions?.size || 100;

        // Check if it's a hex grid and determine orientation
        const grid = canvas?.grid;
        let isPointyTop = false; // Default to flat-top
        if (grid) {
            // V12+: grid.columns means pointy-top (columnar)
            // V11: grid.type 2,3 = columns (pointy), 4,5 = rows (flat)
            if (grid.columns !== undefined) {
                isPointyTop = grid.columns;
            } else if (grid.type !== undefined) {
                isPointyTop = (grid.type === 2 || grid.type === 3);
            }
        }

        // Calculate hex radius (distance from center to vertex)
        // Scale factor to match actual grid hex size (2/sqrt(3) ≈ 1.155)
        const sqrt3 = Math.sqrt(3);
        const scaleFactor = 1.155;
        const r = (gridSize / 2) * scaleFactor;

        // Generate vertices for a single hex centered at origin, then offset to (hx, hy)
        const getHexVertices = (hx, hy) => {
            const verts = [];
            for (let i = 0; i < 6; i++) {
                // For flat-top hex (rows): start at 30° so flat edges are at top/bottom
                // For pointy-top hex (columns): start at 0° so vertices are at top/bottom
                // Note: grid.columns detection seems inverted, so we flip the logic
                const angleOffset = isPointyTop ? 0 : Math.PI / 6;
                const angle = angleOffset + (Math.PI / 3) * i;
                verts.push({
                    x: hx + r * Math.cos(angle),
                    y: hy + r * Math.sin(angle)
                });
            }
            return verts;
        };

        // Calculate hex center positions using axial coordinates (q, r)
        // Apply same scale factor to spacing so vertices align properly
        const axialToPixel = (q, ar) => {
            if (isPointyTop) {
                // Actually flat-top: horizontal = 1.5*r, vertical = sqrt(3)*r
                return {
                    x: gridSize * 0.75 * scaleFactor * q,
                    y: gridSize * (sqrt3 / 2) * scaleFactor * (ar + q / 2)
                };
            } else {
                // Actually pointy-top: horizontal = sqrt(3)*r, vertical = 1.5*r
                return {
                    x: gridSize * (sqrt3 / 2) * scaleFactor * (q + ar / 2),
                    y: gridSize * 0.75 * scaleFactor * ar
                };
            }
        };

        // Define which hexes to include based on tier
        // Using axial coordinates (q, r)
        let hexAxialCoords = [{ q: 0, r: 0 }]; // Center hex

        if (tier === "medium" || tier === "large") {
            // Ring 1: 6 neighbors (flower pattern)
            const ring1 = [
                { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
            ];
            hexAxialCoords.push(...ring1);
        }

        if (tier === "large") {
            // Ring 2: 12 more hexes
            const ring2 = [
                { q: 2, r: 0 }, { q: 2, r: -1 }, { q: 2, r: -2 },
                { q: 1, r: -2 }, { q: 0, r: -2 }, { q: -1, r: -1 },
                { q: -2, r: 0 }, { q: -2, r: 1 }, { q: -2, r: 2 },
                { q: -1, r: 2 }, { q: 0, r: 2 }, { q: 1, r: 1 }
            ];
            hexAxialCoords.push(...ring2);
        }

        // Collect all edges from all hexes
        // Use a map to track edges - shared edges (internal) will be added twice and removed
        const allEdges = [];

        // Round coordinates to avoid floating point issues (snap to 0.5 precision)
        const snap = (v) => Math.round(v * 2) / 2;
        const pointKey = (p) => `${snap(p.x)},${snap(p.y)}`;

        for (const axial of hexAxialCoords) {
            const pixelPos = axialToPixel(axial.q, axial.r);
            const verts = getHexVertices(centerX + pixelPos.x, centerY + pixelPos.y);

            for (let i = 0; i < 6; i++) {
                const p1 = { x: snap(verts[i].x), y: snap(verts[i].y) };
                const p2 = { x: snap(verts[(i + 1) % 6].x), y: snap(verts[(i + 1) % 6].y) };
                allEdges.push({ p1, p2, key: `${pointKey(p1)}|${pointKey(p2)}` });
            }
        }

        // Remove shared edges (edges that appear in both directions)
        const edgeCounts = new Map();
        for (const edge of allEdges) {
            const revKey = `${pointKey(edge.p2)}|${pointKey(edge.p1)}`;
            if (edgeCounts.has(revKey)) {
                edgeCounts.set(revKey, edgeCounts.get(revKey) + 1);
            } else if (edgeCounts.has(edge.key)) {
                edgeCounts.set(edge.key, edgeCounts.get(edge.key) + 1);
            } else {
                edgeCounts.set(edge.key, 1);
            }
        }

        // Keep only edges that appear once (outer edges)
        const outerEdges = allEdges.filter(edge => {
            const revKey = `${pointKey(edge.p2)}|${pointKey(edge.p1)}`;
            const count = edgeCounts.get(edge.key) || edgeCounts.get(revKey) || 0;
            return count === 1;
        });

        if (outerEdges.length === 0) return null;

        // Stitch edges into a continuous path
        const path = [];
        const used = new Set();

        // Start with first edge
        let current = outerEdges[0];
        used.add(current.key);
        path.push(current.p1.x, current.p1.y);

        let cursor = current.p2;
        const startPoint = current.p1;

        let iterations = 0;
        const maxIterations = outerEdges.length + 10;

        while (iterations < maxIterations) {
            path.push(cursor.x, cursor.y);

            // Check if we've closed the loop
            const distToStart = Math.abs(cursor.x - startPoint.x) + Math.abs(cursor.y - startPoint.y);
            if (distToStart < 2) {
                break;
            }

            // Find next edge that starts at cursor
            let found = false;
            const cursorKey = pointKey(cursor);

            for (const edge of outerEdges) {
                if (used.has(edge.key)) continue;

                // Check if this edge starts at cursor
                if (pointKey(edge.p1) === cursorKey) {
                    used.add(edge.key);
                    cursor = edge.p2;
                    found = true;
                    break;
                }
            }

            if (!found) break;
            iterations++;
        }

        return path.length > 6 ? path : null;
    }
}

// ── Singleton ───────────────────────────────────────────────────
export const sdxDrawingTool = new SDXDrawingTool();
export { COLORS, STAMP_SIZES };
