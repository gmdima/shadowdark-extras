/**
 * SDX Drawing Toolbar
 * Frameless, draggable, vertical, semi-transparent floating toolbar for the SDX drawing tools.
 */

import { sdxDrawingTool, COLORS, STAMP_SIZES } from "./SDXDrawingTool.mjs";

const MODULE_ID = "shadowdark-extras";

// ── Button definitions ──────────────────────────────────────────
const DRAWING_MODES = [
    { id: "sketch", icon: "fa-pen-fancy", label: "Sketch" },
    { id: "line", icon: "fa-minus", label: "Line" },
    { id: "box", icon: "fa-vector-square", label: "Box" },
    { id: "ellipse", icon: "fa-circle", label: "Ellipse" },
    { id: "stamp", icon: "fa-stamp", label: "Stamp" },
];

const STAMP_STYLES = [
    { id: "plus", icon: "fa-plus", label: "Plus" },
    { id: "x", icon: "fa-xmark", label: "X Mark" },
    { id: "dot", icon: "fa-circle", label: "Dot" },
    { id: "arrow", icon: "fa-arrow-right", label: "Arrow Right" },
    { id: "arrow-up", icon: "fa-arrow-up", label: "Arrow Up" },
    { id: "arrow-down", icon: "fa-arrow-down", label: "Arrow Down" },
    { id: "arrow-left", icon: "fa-arrow-left", label: "Arrow Left" },
    { id: "square", icon: "fa-square", label: "Square" },
    { id: "hex-outline", icon: "fa-draw-polygon", label: "Hex Outline" },
];

const SYMBOL_SIZES = [
    { id: "small", icon: "fa-compress", label: "Small" },
    { id: "medium", icon: "fa-arrows-alt", label: "Medium" },
    { id: "large", icon: "fa-expand", label: "Large" },
];

const LINE_WEIGHTS = [
    { id: 3, icon: "fa-minus", label: "Thin", css: "sdx-lw-thin" },
    { id: 6, icon: "fa-minus", label: "Medium", css: "sdx-lw-medium" },
    { id: 12, icon: "fa-minus", label: "Thick", css: "sdx-lw-thick" },
];

const LINE_STYLES = [
    { id: "solid", icon: "fa-minus", label: "Solid" },
    { id: "dotted", icon: "fa-ellipsis", label: "Dotted" },
    { id: "dashed", icon: "fa-grip-lines-vertical", label: "Dashed" },
];

const COLOR_DEFS = [
    { id: "player", hex: null, label: "Player Color" },
    { id: "black", hex: "#262626", label: "Black" },
    { id: "white", hex: "#DCDCDC", label: "White" },
    { id: "gray", hex: "#808080", label: "Gray" },
    { id: "red", hex: "#BA3C31", label: "Red" },
    { id: "crimson", hex: "#A01E32", label: "Crimson" },
    { id: "orange", hex: "#E67E22", label: "Orange" },
    { id: "yellow", hex: "#DB820C", label: "Yellow" },
    { id: "lime", hex: "#78C32E", label: "Lime" },
    { id: "green", hex: "#036929", label: "Green" },
    { id: "cyan", hex: "#34ACBA", label: "Cyan" },
    { id: "blue", hex: "#4C93CC", label: "Blue" },
    { id: "navy", hex: "#2C3E6E", label: "Navy" },
    { id: "purple", hex: "#8E44AD", label: "Purple" },
    { id: "pink", hex: "#D2648C", label: "Pink" },
    { id: "brown", hex: "#8B5A2B", label: "Brown" },
];

// ── Toolbar Class ───────────────────────────────────────────────
export class SDXDrawingToolbar {
    constructor() {
        this._el = null;
        this._visible = false;
        this._dragOffset = null;
        this._isDragging = false;
    }

    get visible() { return this._visible; }

    // ── Toggle ──────────────────────────────────────────────────
    toggle() {
        if (this._visible) this.hide();
        else this.show();
    }

    show() {
        if (!this._el) this._build();
        this._el.classList.add("sdx-drawing-toolbar-visible");
        this._visible = true;
        this._syncAllButtons();
    }

    hide() {
        if (this._el) this._el.classList.remove("sdx-drawing-toolbar-visible");
        this._visible = false;
        this._closeStampOverlay();
        this._closeOpacityOverlay();
        this._closeColorOverlay();
        this._closeInspector();
    }

    destroy() {
        this._closeStampOverlay();
        this._closeOpacityOverlay();
        this._closeColorOverlay();
        this._closeInspector();
        if (this._el?.parentElement) this._el.parentElement.removeChild(this._el);
        this._el = null;
        this._visible = false;
    }

    // ── Build DOM ───────────────────────────────────────────────
    _build() {
        if (this._el) return;
        const el = document.createElement("div");
        el.classList.add("sdx-drawing-toolbar");
        el.innerHTML = this._html();
        document.body.appendChild(el);
        this._el = el;

        // Restore position
        this._restorePosition();

        // Drag handle
        const handle = el.querySelector(".sdx-dt-handle");
        handle.addEventListener("pointerdown", (e) => this._onDragStart(e));

        // Button clicks
        el.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            e.preventDefault();
            this._onButton(btn.dataset.action, btn.dataset.value);
        });

        // Close stamp overlay when clicking outside
        document.addEventListener("pointerdown", (e) => {
            if (this._stampOverlay && !this._stampOverlay.contains(e.target)) {
                const stampBtn = this._el?.querySelector('[data-action="mode"][data-value="stamp"]');
                if (!stampBtn || !stampBtn.contains(e.target)) this._closeStampOverlay();
            }
            if (this._opacityOverlay && !this._opacityOverlay.contains(e.target)) {
                const opBtn = this._el?.querySelector('[data-action="opacity"]');
                if (!opBtn || !opBtn.contains(e.target)) this._closeOpacityOverlay();
            }
            if (this._colorOverlay && !this._colorOverlay.contains(e.target)) {
                const colBtn = this._el?.querySelector('[data-action="colorPicker"]');
                if (!colBtn || !colBtn.contains(e.target)) this._closeColorOverlay();
            }
        }, true);
    }

    _html() {
        const tool = sdxDrawingTool;
        const st = tool.state;

        let h = `<div class="sdx-dt-handle" title="Drag to move"><i class="fa-solid fa-grip-lines"></i></div>`;

        // Drawing modes
        h += this._groupHtml("Mode", DRAWING_MODES, "mode", st.drawingMode);

        // Line weight
        h += `<div class="sdx-dt-group">`;
        h += `<div class="sdx-dt-group-label">Weight</div>`;
        LINE_WEIGHTS.forEach(w => {
            const active = w.id === st.brushSettings.size ? " sdx-dt-active" : "";
            h += `<button class="sdx-dt-btn sdx-dt-lw ${w.css}${active}" data-action="lineWeight" data-value="${w.id}" title="${w.label}"><i class="fa-solid ${w.icon}"></i></button>`;
        });
        h += `</div>`;

        // Line style
        h += this._groupHtml("Style", LINE_STYLES, "lineStyle", st.lineStyle);

        // Colors – single swatch button that opens overlay
        const curColorHex = this._getCurrentColorHex();
        h += `<div class="sdx-dt-group"><div class="sdx-dt-group-label">Color</div>`;
        h += `<button class="sdx-dt-btn sdx-dt-color" data-action="colorPicker" title="Color"><span class="sdx-dt-swatch" style="background:${curColorHex}"></span></button>`;
        h += `</div>`;

        // Opacity
        const opPct = Math.round(st.opacity * 100);
        h += `<div class="sdx-dt-group">`;
        h += `<div class="sdx-dt-group-label">Alpha</div>`;
        h += `<button class="sdx-dt-btn" data-action="opacity" title="Opacity: ${opPct}%"><i class="fa-solid fa-droplet"></i><span class="sdx-dt-opacity-badge">${opPct}</span></button>`;
        h += `</div>`;

        // Utilities
        h += `<div class="sdx-dt-group">`;
        h += `<div class="sdx-dt-group-label">Utils</div>`;
        h += `<button class="sdx-dt-btn" data-action="undo" title="Undo Last"><i class="fa-solid fa-rotate-left"></i></button>`;
        h += `<button class="sdx-dt-btn" data-action="clearMine" title="Clear My Drawings"><i class="fa-solid fa-eraser"></i></button>`;

        if (game.user.isGM) {
            h += `<button class="sdx-dt-btn" data-action="clearAll" title="Clear All Drawings"><i class="fa-solid fa-trash-can"></i></button>`;
            const permActive = st.permanentMode ? " sdx-dt-active" : "";
            h += `<button class="sdx-dt-btn${permActive}" data-action="permanentMode" title="Permanent Drawing (GM)"><i class="fa-solid fa-thumbtack"></i></button>`;
            h += `<button class="sdx-dt-btn" data-action="clearPermanent" title="Clear Permanent Drawings"><i class="fa-solid fa-ban"></i></button>`;
            h += `<button class="sdx-dt-btn" data-action="inspector" title="Drawing Inspector"><i class="fa-solid fa-list-ul"></i></button>`;
        }

        const teActive = st.timedEraseEnabled ? " sdx-dt-active" : "";
        h += `<button class="sdx-dt-btn${teActive}" data-action="timedErase" title="Timed Erase"><i class="fa-solid fa-clock"></i></button>`;
        h += `</div>`;

        return h;
    }

    _groupHtml(label, items, action, current) {
        let h = `<div class="sdx-dt-group"><div class="sdx-dt-group-label">${label}</div>`;
        items.forEach(it => {
            const active = (String(it.id) === String(current)) ? " sdx-dt-active" : "";
            h += `<button class="sdx-dt-btn${active}" data-action="${action}" data-value="${it.id}" title="${it.label}"><i class="fa-solid ${it.icon}"></i></button>`;
        });
        h += `</div>`;
        return h;
    }

    // ── Button handling ─────────────────────────────────────────
    _onButton(action, value) {
        const tool = sdxDrawingTool;
        switch (action) {
            case "mode":
                tool.setDrawingMode(value);
                this._setRadio("mode", value);
                if (value === "stamp") this._openStampOverlay();
                else this._closeStampOverlay();
                break;
            case "stampStyle":
                tool.setStampStyle(value);
                this._syncStampOverlay();
                break;
            case "symbolSize":
                tool.setSymbolSize(value);
                this._syncStampOverlay();
                break;
            case "lineWeight":
                tool.setBrushSize(Number(value));
                this._setRadio("lineWeight", value);
                break;
            case "lineStyle":
                tool.setLineStyle(value);
                this._setRadio("lineStyle", value);
                break;
            case "color":
                this._applyColor(value);
                this._syncColorOverlay();
                this._updateColorSwatch();
                break;
            case "undo":
                tool.undoLastDrawing();
                break;
            case "clearMine":
                tool.clearUserDrawings();
                break;
            case "clearAll":
                if (game.user.isGM) tool.clearAllDrawings();
                break;
            case "timedErase": {
                const next = !tool.state.timedEraseEnabled;
                tool.setTimedErase(next);
                this._el?.querySelector(`[data-action="timedErase"]`)?.classList.toggle("sdx-dt-active", next);
                break;
            }
            case "permanentMode": {
                const nextP = !tool.state.permanentMode;
                tool.setPermanentMode(nextP);
                this._el?.querySelector(`[data-action="permanentMode"]`)?.classList.toggle("sdx-dt-active", nextP);
                break;
            }
            case "clearPermanent":
                if (game.user.isGM) tool.clearPermanentDrawings();
                break;
            case "inspector":
                if (game.user.isGM) this._toggleInspector();
                break;
            case "opacity":
                this._toggleOpacityOverlay();
                break;
            case "colorPicker":
                this._toggleColorOverlay();
                break;
        }
    }

    _applyColor(colorId) {
        if (colorId === "player") {
            sdxDrawingTool.setBrushColor(sdxDrawingTool._getPlayerColor());
        } else if (COLORS[colorId]) {
            sdxDrawingTool.setBrushColor(COLORS[colorId]);
        }
    }

    _getCurrentColorHex() {
        const cur = sdxDrawingTool.state.brushSettings.color;
        for (const c of COLOR_DEFS) {
            if (c.id === "player") {
                try { if (cur === sdxDrawingTool._getPlayerColor()) return this._getPlayerHex(); } catch { }
            } else if (COLORS[c.id] && cur === COLORS[c.id]) {
                return c.hex;
            }
        }
        return this._getPlayerHex();
    }

    _updateColorSwatch() {
        if (!this._el) return;
        const btn = this._el.querySelector('[data-action="colorPicker"] .sdx-dt-swatch');
        if (btn) btn.style.background = this._getCurrentColorHex();
    }

    _setRadio(action, value) {
        if (!this._el) return;
        this._el.querySelectorAll(`[data-action="${action}"]`).forEach(b => {
            b.classList.toggle("sdx-dt-active", b.dataset.value === String(value));
        });
    }

    _isColorActive(colorId) {
        const cur = sdxDrawingTool.state.brushSettings.color;
        if (colorId === "player") {
            const pc = sdxDrawingTool._getPlayerColor();
            return cur === pc;
        }
        return cur === COLORS[colorId];
    }

    _getPlayerHex() {
        let hex = "#4b4b4b";
        try {
            if (game.user?.color) {
                if (game.user.color.constructor?.name === "Color") {
                    const v = Number(game.user.color);
                    if (!isNaN(v)) hex = "#" + v.toString(16).padStart(6, "0");
                } else if (typeof game.user.color === "string") hex = game.user.color;
                else if (typeof game.user.color === "number") hex = "#" + game.user.color.toString(16).padStart(6, "0");
            }
        } catch { }
        return hex;
    }

    // ── Stamp dropdown overlay ───────────────────────────────
    _stampOverlay = null;
    _opacityOverlay = null;

    _openStampOverlay() {
        if (this._stampOverlay) { this._closeStampOverlay(); return; }
        if (!this._el) return;
        const overlay = document.createElement("div");
        overlay.classList.add("sdx-dt-stamp-overlay");
        const st = sdxDrawingTool.state;

        let h = `<div class="sdx-dt-overlay-section">`;
        h += `<div class="sdx-dt-overlay-label">Shape</div>`;
        h += `<div class="sdx-dt-overlay-grid">`;
        STAMP_STYLES.forEach(s => {
            const active = s.id === st.stampStyle ? " sdx-dt-active" : "";
            h += `<button class="sdx-dt-btn${active}" data-action="stampStyle" data-value="${s.id}" title="${s.label}"><i class="fa-solid ${s.icon}"></i></button>`;
        });
        h += `</div></div>`;

        h += `<div class="sdx-dt-overlay-section">`;
        h += `<div class="sdx-dt-overlay-label">Size</div>`;
        h += `<div class="sdx-dt-overlay-grid">`;
        SYMBOL_SIZES.forEach(s => {
            const active = s.id === st.symbolSize ? " sdx-dt-active" : "";
            h += `<button class="sdx-dt-btn${active}" data-action="symbolSize" data-value="${s.id}" title="${s.label}"><i class="fa-solid ${s.icon}"></i></button>`;
        });
        h += `</div></div>`;

        overlay.innerHTML = h;
        overlay.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            e.preventDefault(); e.stopPropagation();
            this._onButton(btn.dataset.action, btn.dataset.value);
        });
        document.body.appendChild(overlay);
        this._stampOverlay = overlay;

        // Position: to the left of the toolbar
        this._positionStampOverlay();
    }

    _positionStampOverlay() {
        if (!this._stampOverlay || !this._el) return;
        const stampBtn = this._el.querySelector('[data-action="mode"][data-value="stamp"]');
        if (!stampBtn) return;
        const btnRect = stampBtn.getBoundingClientRect();
        const tbRect = this._el.getBoundingClientRect();
        // Position to the left of the toolbar, aligned with the stamp button
        this._stampOverlay.style.top = `${btnRect.top}px`;
        this._stampOverlay.style.left = `${tbRect.left - this._stampOverlay.offsetWidth - 6}px`;
    }

    _closeStampOverlay() {
        if (this._stampOverlay) {
            this._stampOverlay.remove();
            this._stampOverlay = null;
        }
    }

    // ── Opacity slider overlay ───────────────────────────────
    _toggleOpacityOverlay() {
        if (this._opacityOverlay) { this._closeOpacityOverlay(); return; }
        if (!this._el) return;
        const overlay = document.createElement("div");
        overlay.classList.add("sdx-dt-stamp-overlay", "sdx-dt-opacity-overlay");
        const st = sdxDrawingTool.state;
        const pct = Math.round(st.opacity * 100);
        overlay.innerHTML = `
            <div class="sdx-dt-overlay-section">
                <div class="sdx-dt-overlay-label">Opacity</div>
                <div class="sdx-dt-opacity-slider-row">
                    <input type="range" class="sdx-dt-opacity-range" min="10" max="100" step="5" value="${pct}">
                    <span class="sdx-dt-opacity-value">${pct}%</span>
                </div>
            </div>`;
        const range = overlay.querySelector(".sdx-dt-opacity-range");
        const valLabel = overlay.querySelector(".sdx-dt-opacity-value");
        range.addEventListener("input", (e) => {
            const v = Number(e.target.value);
            valLabel.textContent = `${v}%`;
            sdxDrawingTool.setOpacity(v / 100);
            this._updateOpacityBadge();
        });
        // Prevent pointer events from closing the overlay
        overlay.addEventListener("pointerdown", (e) => e.stopPropagation());
        document.body.appendChild(overlay);
        this._opacityOverlay = overlay;
        this._positionOpacityOverlay();
    }

    _positionOpacityOverlay() {
        if (!this._opacityOverlay || !this._el) return;
        const opBtn = this._el.querySelector('[data-action="opacity"]');
        if (!opBtn) return;
        const btnRect = opBtn.getBoundingClientRect();
        const tbRect = this._el.getBoundingClientRect();
        this._opacityOverlay.style.top = `${btnRect.top}px`;
        this._opacityOverlay.style.left = `${tbRect.left - this._opacityOverlay.offsetWidth - 6}px`;
    }

    _closeOpacityOverlay() {
        if (this._opacityOverlay) {
            this._opacityOverlay.remove();
            this._opacityOverlay = null;
        }
    }

    // ── Color picker overlay ─────────────────────────────────
    _colorOverlay = null;

    _toggleColorOverlay() {
        if (this._colorOverlay) { this._closeColorOverlay(); return; }
        if (!this._el) return;
        const overlay = document.createElement("div");
        overlay.classList.add("sdx-dt-stamp-overlay", "sdx-dt-color-overlay");
        let h = `<div class="sdx-dt-overlay-section">`;
        h += `<div class="sdx-dt-overlay-label">Color</div>`;
        h += `<div class="sdx-dt-color-grid">`;
        COLOR_DEFS.forEach(c => {
            const bg = c.hex ?? this._getPlayerHex();
            const active = this._isColorActive(c.id) ? " sdx-dt-active" : "";
            const isPlayer = c.id === "player" ? " sdx-dt-color-player" : "";
            h += `<button class="sdx-dt-color-cell${active}${isPlayer}" data-action="color" data-value="${c.id}" title="${c.label}" style="background:${bg}"></button>`;
        });
        h += `</div></div>`;
        overlay.innerHTML = h;
        overlay.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-action]");
            if (!btn) return;
            e.preventDefault(); e.stopPropagation();
            this._onButton(btn.dataset.action, btn.dataset.value);
        });
        document.body.appendChild(overlay);
        this._colorOverlay = overlay;
        requestAnimationFrame(() => this._positionColorOverlay());
    }

    _positionColorOverlay() {
        if (!this._colorOverlay || !this._el) return;
        const colBtn = this._el.querySelector('[data-action="colorPicker"]');
        if (!colBtn) return;
        const btnRect = colBtn.getBoundingClientRect();
        const tbRect = this._el.getBoundingClientRect();
        const w = this._colorOverlay.offsetWidth || 140;
        let left = tbRect.left - w - 6;
        if (left < 4) left = tbRect.right + 6;
        this._colorOverlay.style.top = `${btnRect.top}px`;
        this._colorOverlay.style.left = `${left}px`;
    }

    _closeColorOverlay() {
        if (this._colorOverlay) {
            this._colorOverlay.remove();
            this._colorOverlay = null;
        }
    }

    _syncColorOverlay() {
        if (!this._colorOverlay) return;
        this._colorOverlay.querySelectorAll('[data-action="color"]').forEach(b => {
            b.classList.toggle("sdx-dt-active", this._isColorActive(b.dataset.value));
        });
    }

    _updateOpacityBadge() {
        if (!this._el) return;
        const badge = this._el.querySelector(".sdx-dt-opacity-badge");
        if (badge) badge.textContent = Math.round(sdxDrawingTool.state.opacity * 100);
        const btn = this._el.querySelector('[data-action="opacity"]');
        if (btn) btn.title = `Opacity: ${Math.round(sdxDrawingTool.state.opacity * 100)}%`;
    }

    _syncStampOverlay() {
        if (!this._stampOverlay) return;
        const st = sdxDrawingTool.state;
        this._stampOverlay.querySelectorAll('[data-action="stampStyle"]').forEach(b => {
            b.classList.toggle("sdx-dt-active", b.dataset.value === st.stampStyle);
        });
        this._stampOverlay.querySelectorAll('[data-action="symbolSize"]').forEach(b => {
            b.classList.toggle("sdx-dt-active", b.dataset.value === st.symbolSize);
        });
    }

    _syncAllButtons() {
        const st = sdxDrawingTool.state;
        this._setRadio("mode", st.drawingMode);
        this._setRadio("stampStyle", st.stampStyle);
        this._setRadio("symbolSize", st.symbolSize);
        this._setRadio("lineWeight", String(st.brushSettings.size));
        this._setRadio("lineStyle", st.lineStyle);
        if (st.drawingMode !== "stamp") this._closeStampOverlay();
        // Sync color
        this._el?.querySelectorAll('[data-action="color"]').forEach(b => {
            b.classList.toggle("sdx-dt-active", this._isColorActive(b.dataset.value));
        });
        // Sync timed erase
        this._el?.querySelector('[data-action="timedErase"]')?.classList.toggle("sdx-dt-active", st.timedEraseEnabled);
        // Sync permanent mode
        this._el?.querySelector('[data-action="permanentMode"]')?.classList.toggle("sdx-dt-active", st.permanentMode);
    }

    // ── Drawing Inspector panel ──────────────────────────────────
    _inspectorEl = null;
    _inspectorInterval = null;

    _toggleInspector() {
        if (this._inspectorEl) this._closeInspector();
        else this._openInspector();
    }

    _openInspector() {
        if (this._inspectorEl) return;
        const el = document.createElement("div");
        el.classList.add("sdx-dt-inspector");
        el.innerHTML = this._inspectorHtml();
        document.body.appendChild(el);
        this._inspectorEl = el;

        // Drag handle on header
        const header = el.querySelector(".sdx-dt-inspector-header");
        header.style.cursor = "grab";
        header.addEventListener("pointerdown", (e) => {
            if (e.target.closest(".sdx-dt-inspector-close")) return;
            this._onInspectorDragStart(e);
        });

        // Position after layout so offsetWidth is available
        requestAnimationFrame(() => this._positionInspector());

        // Hover → highlight drawing on canvas
        el.addEventListener("pointerenter", (e) => {
            const item = e.target.closest(".sdx-dt-inspector-item");
            if (item) sdxDrawingTool.highlightDrawing(item.dataset.drawingId);
        }, true);
        el.addEventListener("pointerleave", (e) => {
            const item = e.target.closest(".sdx-dt-inspector-item");
            if (item) sdxDrawingTool.unhighlightDrawing();
        }, true);

        // Click delegation
        el.addEventListener("click", (e) => {
            const closeBtn = e.target.closest(".sdx-dt-inspector-close");
            if (closeBtn) { this._closeInspector(); return; }
            const nameEl = e.target.closest(".sdx-dt-inspector-name");
            if (nameEl && !nameEl.classList.contains("sdx-dt-inspector-name-editing")) {
                const item = nameEl.closest(".sdx-dt-inspector-item");
                if (item) this._startRenameInline(item, nameEl);
                return;
            }
            const visBtn = e.target.closest(".sdx-dt-inspector-visibility");
            if (visBtn) {
                const item = visBtn.closest(".sdx-dt-inspector-item");
                if (item) {
                    sdxDrawingTool.toggleDrawingVisibility(item.dataset.drawingId);
                    this._refreshInspector();
                }
                return;
            }
            const delBtn = e.target.closest(".sdx-dt-inspector-delete");
            if (delBtn) {
                const item = delBtn.closest(".sdx-dt-inspector-item");
                if (item) sdxDrawingTool.deleteAnyDrawing(item.dataset.drawingId);
            }
        });

        // Right-click to delete
        el.addEventListener("contextmenu", (e) => {
            const item = e.target.closest(".sdx-dt-inspector-item");
            if (item) {
                e.preventDefault();
                sdxDrawingTool.deleteAnyDrawing(item.dataset.drawingId);
            }
        });

        // Polling refresh while open
        this._inspectorInterval = setInterval(() => this._refreshInspector(), 500);

        // Mark button active
        this._el?.querySelector('[data-action="inspector"]')?.classList.add("sdx-dt-active");
    }

    _closeInspector() {
        if (this._inspectorInterval) { clearInterval(this._inspectorInterval); this._inspectorInterval = null; }
        if (this._inspectorEl) { this._inspectorEl.remove(); this._inspectorEl = null; }
        this._inspectorSnapshot = '';
        sdxDrawingTool.unhighlightDrawing();
        this._el?.querySelector('[data-action="inspector"]')?.classList.remove("sdx-dt-active");
    }

    _inspectorSnapshot = '';

    _refreshInspector() {
        if (!this._inspectorEl) return;
        const list = this._inspectorEl.querySelector(".sdx-dt-inspector-list");
        const count = this._inspectorEl.querySelector(".sdx-dt-inspector-count");
        if (!list) return;
        const entries = sdxDrawingTool.getAllDrawingEntries();
        // Build a signature to avoid unnecessary DOM thrashing (which kills hover)
        // Include hidden state and name so changes trigger refresh
        const sig = entries.map(e => `${e.id}:${e.hidden}:${e.name || ''}`).join(',') + '|' + entries.length;
        if (sig === this._inspectorSnapshot) {
            // Only update timed countdowns in-place
            for (const e of entries) {
                if (!e.expiresAt) continue;
                const el = list.querySelector(`[data-drawing-id="${e.id}"] .sdx-dt-inspector-time`);
                if (el) el.textContent = this._timerStr(e.expiresAt);
            }
            return;
        }
        this._inspectorSnapshot = sig;
        if (count) count.textContent = entries.length;
        if (entries.length === 0) {
            list.innerHTML = `<div class="sdx-dt-inspector-empty">No drawings on this scene</div>`;
        } else {
            list.innerHTML = entries.map(e => this._inspectorItemHtml(e)).join('');
        }
    }

    _positionInspector() {
        if (!this._inspectorEl || !this._el) return;
        const tbRect = this._el.getBoundingClientRect();
        const w = this._inspectorEl.offsetWidth || 220;
        let left = tbRect.left - w - 8;
        if (left < 4) left = tbRect.right + 8;
        this._inspectorEl.style.top = `${tbRect.top}px`;
        this._inspectorEl.style.left = `${left}px`;
        this._inspectorEl.style.maxHeight = `${Math.min(400, window.innerHeight - tbRect.top - 20)}px`;
    }

    _onInspectorDragStart(e) {
        if (!this._inspectorEl) return;
        e.preventDefault();
        const rect = this._inspectorEl.getBoundingClientRect();
        const ox = e.clientX - rect.left;
        const oy = e.clientY - rect.top;
        const header = this._inspectorEl.querySelector(".sdx-dt-inspector-header");
        if (header) header.style.cursor = "grabbing";
        const onMove = (ev) => {
            this._inspectorEl.style.left = `${Math.max(0, ev.clientX - ox)}px`;
            this._inspectorEl.style.top = `${Math.max(0, ev.clientY - oy)}px`;
        };
        const onUp = () => {
            if (header) header.style.cursor = "grab";
            document.removeEventListener("pointermove", onMove, true);
            document.removeEventListener("pointerup", onUp, true);
        };
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
    }

    _inspectorHtml() {
        const entries = sdxDrawingTool.getAllDrawingEntries();
        let h = `<div class="sdx-dt-inspector-header">`;
        h += `<span class="sdx-dt-inspector-title"><i class="fa-solid fa-list-ul"></i> Drawings</span>`;
        h += `<span class="sdx-dt-inspector-count">${entries.length}</span>`;
        h += `<button class="sdx-dt-inspector-close"><i class="fa-solid fa-xmark"></i></button>`;
        h += `</div>`;
        h += `<div class="sdx-dt-inspector-list">`;
        if (entries.length === 0) {
            h += `<div class="sdx-dt-inspector-empty">No drawings on this scene</div>`;
        } else {
            h += entries.map(e => this._inspectorItemHtml(e)).join('');
        }
        h += `</div>`;
        return h;
    }

    _inspectorItemHtml(e) {
        const icons = { sketch: 'fa-pen-fancy', line: 'fa-minus', box: 'fa-vector-square', ellipse: 'fa-circle', stamp: 'fa-stamp', drawing: 'fa-pencil' };
        const icon = icons[e.type] || icons.drawing;
        const permBadge = e.permanent ? `<span class="sdx-dt-inspector-perm" title="Permanent"><i class="fa-solid fa-thumbtack"></i></span>` : '';
        const opStr = Math.round(e.opacity * 100);
        const hiddenClass = e.hidden ? ' sdx-dt-inspector-hidden' : '';
        const eyeIcon = e.hidden ? 'fa-eye-slash' : 'fa-eye';
        const eyeTitle = e.hidden ? 'Reveal to Players' : 'Hide from Players';
        const displayName = e.name || this._capitalizeFirst(e.type);
        let h = `<div class="sdx-dt-inspector-item${hiddenClass}" data-drawing-id="${e.id}">`;
        h += `<i class="fa-solid ${icon} sdx-dt-inspector-type-icon"></i>`;
        h += `<div class="sdx-dt-inspector-info">`;
        h += `<span class="sdx-dt-inspector-name" title="Click to rename">${this._escapeHtml(displayName)}</span>`;
        h += `<span class="sdx-dt-inspector-user">${e.userName}</span>`;
        h += `</div>`;
        h += `<div class="sdx-dt-inspector-meta">`;
        if (e.expiresAt) h += `<span class="sdx-dt-inspector-time" title="Time remaining">${this._timerStr(e.expiresAt)}</span>`;
        if (opStr < 100) h += `<span class="sdx-dt-inspector-opacity" title="Opacity: ${opStr}%">${opStr}%</span>`;
        h += permBadge;
        h += `</div>`;
        if (e.permanent) {
            h += `<button class="sdx-dt-inspector-visibility" title="${eyeTitle}"><i class="fa-solid ${eyeIcon}"></i></button>`;
        }
        h += `<button class="sdx-dt-inspector-delete" title="Delete (or right-click row)"><i class="fa-solid fa-trash-can"></i></button>`;
        h += `</div>`;
        return h;
    }

    _timerStr(expiresAt) {
        const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        if (remaining <= 0) return '0s';
        if (remaining < 60) return `${remaining}s`;
        return `${Math.floor(remaining / 60)}m${remaining % 60}s`;
    }

    _timeAgo(ts) {
        const diff = Date.now() - ts;
        const s = Math.floor(diff / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        return `${h}h`;
    }

    _capitalizeFirst(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    _escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    _startRenameInline(itemEl, nameEl) {
        if (!game.user.isGM) return;
        const drawingId = itemEl.dataset.drawingId;
        const currentName = nameEl.textContent;

        // Create input
        const input = document.createElement("input");
        input.type = "text";
        input.className = "sdx-dt-inspector-name-input";
        input.value = currentName;
        input.maxLength = 32;

        // Replace name element with input
        nameEl.classList.add("sdx-dt-inspector-name-editing");
        nameEl.innerHTML = '';
        nameEl.appendChild(input);
        input.focus();
        input.select();

        const finishRename = async (save) => {
            const newName = input.value.trim();
            if (save && newName && newName !== currentName) {
                await sdxDrawingTool.renameDrawing(drawingId, newName);
            }
            // Force refresh to restore normal display
            this._inspectorSnapshot = '';
            this._refreshInspector();
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                finishRename(true);
            } else if (e.key === "Escape") {
                e.preventDefault();
                finishRename(false);
            }
        });

        input.addEventListener("blur", () => {
            finishRename(true);
        });
    }

    // ── Dragging ────────────────────────────────────────────────
    _onDragStart(e) {
        if (!this._el) return;
        e.preventDefault();
        const rect = this._el.getBoundingClientRect();
        this._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this._isDragging = true;
        const onMove = (ev) => {
            if (!this._isDragging) return;
            const nx = ev.clientX - this._dragOffset.x;
            const ny = ev.clientY - this._dragOffset.y;
            this._el.style.left = `${Math.max(0, nx)}px`;
            this._el.style.top = `${Math.max(0, ny)}px`;
            this._el.style.right = "auto";
        };
        const onUp = () => {
            this._isDragging = false;
            document.removeEventListener("pointermove", onMove, true);
            document.removeEventListener("pointerup", onUp, true);
            this._savePosition();
        };
        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onUp, true);
    }

    _savePosition() {
        if (!this._el) return;
        const pos = { left: this._el.style.left, top: this._el.style.top };
        try { game.settings.set(MODULE_ID, "drawing.toolbar.position", JSON.stringify(pos)); } catch { }
    }

    _restorePosition() {
        if (!this._el) return;
        try {
            const raw = game.settings.get(MODULE_ID, "drawing.toolbar.position");
            if (raw) {
                const pos = JSON.parse(raw);
                if (pos.left) this._el.style.left = pos.left;
                if (pos.top) this._el.style.top = pos.top;
                this._el.style.right = "auto";
            }
        } catch { }
    }
}

export const sdxDrawingToolbar = new SDXDrawingToolbar();
