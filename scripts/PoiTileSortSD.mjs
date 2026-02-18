/**
 * POI Tile Sort Panel
 * Floating window for managing z-order of POI tiles placed by SDX painting system.
 * Auto-shows/hides with POI drawing mode.
 */

const MODULE_ID = "shadowdark-extras";

export class PoiTileSortApp extends Application {
    static _instance = null;

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sdx-poi-tile-sort",
            title: "POI Tile Sort",
            template: `modules/${MODULE_ID}/templates/poi-tile-sort.hbs`,
            classes: ["shadowdark", "shadowdark-extras", "poi-tile-sort-app"],
            width: 280,
            height: 500,
            top: 80,
            left: window.innerWidth - 320,
            resizable: true,
            scrollY: [".poi-sort-list"]
        });
    }

    constructor(options = {}) {
        super(options);
        this._hiddenTileIds = new Set();
        this._highlightGraphics = null;
        this._searchTerm = "";
        this._hookIds = [];
        this._renderDebounceTimer = null;
        // Trackpoint state
        this._trackpoint = null;
    }

    /* ---------------------------------------- */
    /*  Static show/hide                        */
    /* ---------------------------------------- */

    static show() {
        if (this._instance?.rendered) return;
        if (!this._instance) {
            this._instance = new PoiTileSortApp();
        }
        this._instance.render(true);
    }

    static hide() {
        if (this._instance?.rendered) {
            this._instance.close();
        }
    }

    /* ---------------------------------------- */
    /*  Data Preparation                        */
    /* ---------------------------------------- */

    getData(options = {}) {
        if (!canvas.scene) return { tiles: [] };

        const tiles = canvas.tiles.placeables
            .filter(t => t.document.getFlag(MODULE_ID, "painted"))
            .sort((a, b) => b.document.sort - a.document.sort) // highest sort on top
            .map(t => {
                const doc = t.document;
                const src = doc.texture?.src || "";
                const filename = src.split("/").pop()?.replace(/\.[^.]+$/, "") || "Tile";
                return {
                    id: doc.id,
                    src,
                    name: filename,
                    sort: doc.sort,
                    elevation: doc.elevation ?? 0,
                    isHidden: this._hiddenTileIds.has(doc.id),
                    isControlled: t.controlled
                };
            });

        return { tiles, searchTerm: this._searchTerm };
    }

    /* ---------------------------------------- */
    /*  Rendering                               */
    /* ---------------------------------------- */

    activateListeners(html) {
        super.activateListeners(html);

        const list = html.find(".poi-sort-list")[0];
        if (!list) return;

        // Search
        html.find(".poi-sort-search").on("input", (e) => {
            this._searchTerm = e.target.value.toLowerCase();
            this._filterList(list);
        });

        // Item event handlers
        list.querySelectorAll(".poi-sort-item").forEach(li => {
            const tileId = li.dataset.tileId;

            // Click → select tile
            li.addEventListener("click", (e) => {
                if (e.target.closest(".poi-sort-btn")) return; // skip action button clicks
                const tile = canvas.tiles.get(tileId);
                if (!tile) return;

                if (e.ctrlKey || e.metaKey) {
                    // Ctrl+click → pan to tile
                    canvas.animatePan({ x: tile.center.x, y: tile.center.y, duration: 500 });
                } else {
                    // Normal click → control tile
                    tile.control({ releaseOthers: !e.shiftKey });
                }
            });

            // Double-click → open tile sheet
            li.addEventListener("dblclick", (e) => {
                if (e.target.closest(".poi-sort-btn")) return;
                const tile = canvas.tiles.get(tileId);
                tile?.document.sheet.render(true);
            });

            // Hover → highlight
            li.addEventListener("mouseenter", () => this._createHighlight(tileId));
            li.addEventListener("mouseleave", () => this._removeHighlight());

            // Rotate left
            li.querySelector(".poi-sort-rotate-left")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._rotateTile(tileId, -90);
            });

            // Rotate right
            li.querySelector(".poi-sort-rotate-right")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._rotateTile(tileId, 90);
            });

            // Scale down
            li.querySelector(".poi-sort-scale-down")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._scaleTile(tileId, 0.8);
            });

            // Scale up
            li.querySelector(".poi-sort-scale-up")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._scaleTile(tileId, 1.25);
            });

            // Eye toggle
            li.querySelector(".poi-sort-eye")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._toggleHidden(tileId, li);
            });

            // Delete tile
            li.querySelector(".poi-sort-delete")?.addEventListener("click", (e) => {
                e.stopPropagation();
                this._deleteTile(tileId);
            });

            // Trackpoint nudge
            const trackpoint = li.querySelector(".poi-sort-trackpoint");
            if (trackpoint) {
                trackpoint.addEventListener("mousedown", (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this._startTrackpoint(tileId, e, trackpoint);
                });
            }
        });

        // Setup drag-drop
        this._setupDragDrop(list);

        // Register hooks
        this._registerHooks();
    }

    /* ---------------------------------------- */
    /*  Drag & Drop Reordering                  */
    /* ---------------------------------------- */

    _setupDragDrop(list) {
        let draggedEl = null;

        list.querySelectorAll(".poi-sort-item").forEach(li => {
            li.addEventListener("dragstart", (e) => {
                draggedEl = li;
                li.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", li.dataset.tileId);
            });

            li.addEventListener("dragend", () => {
                li.classList.remove("dragging");
                list.querySelectorAll(".poi-sort-item").forEach(el => {
                    el.classList.remove("drag-over");
                    el.classList.remove("drag-over-below");
                });
                draggedEl = null;
            });

            li.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (li !== draggedEl) {
                    const rect = li.getBoundingClientRect();
                    const midY = rect.top + rect.height / 2;
                    list.querySelectorAll(".poi-sort-item").forEach(el => {
                        el.classList.remove("drag-over");
                        el.classList.remove("drag-over-below");
                    });
                    if (e.clientY < midY) {
                        li.classList.add("drag-over");
                    } else {
                        li.classList.add("drag-over-below");
                    }
                }
            });

            li.addEventListener("dragleave", () => {
                li.classList.remove("drag-over");
                li.classList.remove("drag-over-below");
            });

            li.addEventListener("drop", (e) => {
                e.preventDefault();
                if (!draggedEl || li === draggedEl) return;

                const rect = li.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    list.insertBefore(draggedEl, li);
                } else {
                    list.insertBefore(draggedEl, li.nextSibling);
                }

                li.classList.remove("drag-over");
                li.classList.remove("drag-over-below");

                this._applySort(list);
            });
        });
    }

    async _applySort(list) {
        const items = list.querySelectorAll(".poi-sort-item");
        const updates = [];
        const count = items.length;

        // Top of list = highest sort, step of 100
        items.forEach((li, idx) => {
            const sort = 100000 + (count - idx) * 100;
            updates.push({ _id: li.dataset.tileId, sort });
            // Update displayed sort value
            const meta = li.querySelector(".poi-sort-meta");
            if (meta) {
                const elev = meta.dataset.elevation || "0";
                meta.textContent = `z:${sort} · e:${elev}`;
            }
        });

        await canvas.scene.updateEmbeddedDocuments("Tile", updates);
    }

    /* ---------------------------------------- */
    /*  Canvas Highlight                        */
    /* ---------------------------------------- */

    _createHighlight(tileId) {
        this._removeHighlight();
        const tile = canvas.tiles.get(tileId);
        if (!tile) return;

        const { x, y, width, height } = tile.document;
        const gfx = new PIXI.Graphics();
        gfx.lineStyle(3, 0x00ff66, 0.9);
        gfx.drawRect(x, y, width, height);
        gfx.endFill();
        canvas.stage.addChild(gfx);
        this._highlightGraphics = gfx;
    }

    _removeHighlight() {
        if (this._highlightGraphics) {
            this._highlightGraphics.destroy();
            this._highlightGraphics = null;
        }
    }

    /* ---------------------------------------- */
    /*  Tile Hiding                             */
    /* ---------------------------------------- */

    _toggleHidden(tileId, li) {
        if (this._hiddenTileIds.has(tileId)) {
            this._hiddenTileIds.delete(tileId);
            li.classList.remove("hidden-tile");
            li.querySelector(".poi-sort-eye i").className = "fas fa-eye";
        } else {
            this._hiddenTileIds.add(tileId);
            li.classList.add("hidden-tile");
            li.querySelector(".poi-sort-eye i").className = "fas fa-eye-slash";
        }
        this._refreshTileVisibility(tileId);
    }

    _refreshTileVisibility(tileId) {
        const tile = canvas.tiles.get(tileId);
        if (!tile?.mesh) return;
        tile.mesh.alpha = this._hiddenTileIds.has(tileId) ? 0 : tile.document.alpha;
    }

    _restoreAllHidden() {
        for (const tileId of this._hiddenTileIds) {
            const tile = canvas.tiles.get(tileId);
            if (tile?.mesh) {
                tile.mesh.alpha = tile.document.alpha;
            }
        }
        this._hiddenTileIds.clear();
    }

    /* ---------------------------------------- */
    /*  Tile Transform & Deletion               */
    /* ---------------------------------------- */

    async _rotateTile(tileId, degrees) {
        const tile = canvas.tiles.get(tileId);
        if (!tile) return;
        const rotation = (tile.document.rotation + degrees + 360) % 360;
        await tile.document.update({ rotation });
    }

    async _scaleTile(tileId, factor) {
        const tile = canvas.tiles.get(tileId);
        if (!tile) return;
        const width = Math.round(tile.document.width * factor);
        const height = Math.round(tile.document.height * factor);
        if (width < 10 || height < 10) return;
        await tile.document.update({ width, height });
    }

    async _deleteTile(tileId) {
        this._hiddenTileIds.delete(tileId);
        this._removeHighlight();
        await canvas.scene.deleteEmbeddedDocuments("Tile", [tileId]);
    }

    /* ---------------------------------------- */
    /*  Selection Tracking (DOM-only)           */
    /* ---------------------------------------- */

    updateControlled() {
        const el = this.element;
        if (!el?.length) return;
        el[0].querySelectorAll(".poi-sort-item").forEach(li => {
            const tile = canvas.tiles.get(li.dataset.tileId);
            li.classList.toggle("selected", !!tile?.controlled);
        });
    }

    /* ---------------------------------------- */
    /*  Search Filter                           */
    /* ---------------------------------------- */

    _filterList(list) {
        list.querySelectorAll(".poi-sort-item").forEach(li => {
            const name = li.querySelector(".poi-sort-name")?.textContent.toLowerCase() || "";
            li.style.display = !this._searchTerm || name.includes(this._searchTerm) ? "" : "none";
        });
    }

    /* ---------------------------------------- */
    /*  Hooks                                   */
    /* ---------------------------------------- */

    _registerHooks() {
        // Unregister any prior hooks
        this._unregisterHooks();

        const on = (event, fn) => {
            const id = Hooks.on(event, fn);
            this._hookIds.push({ event, id });
        };

        on("createTile", () => this._debouncedRender());
        on("deleteTile", () => this._debouncedRender());
        on("controlTile", () => this.updateControlled());
        on("refreshTile", (tile) => {
            if (this._hiddenTileIds.has(tile.id)) {
                if (tile.mesh) tile.mesh.alpha = 0;
            }
        });
        on("canvasReady", () => this.render(true));
    }

    _unregisterHooks() {
        for (const { event, id } of this._hookIds) {
            Hooks.off(event, id);
        }
        this._hookIds = [];
    }

    _debouncedRender() {
        clearTimeout(this._renderDebounceTimer);
        this._renderDebounceTimer = setTimeout(() => {
            if (this.rendered) this.render(true);
        }, 200);
    }

    /* ---------------------------------------- */
    /*  Trackpoint Nudge                        */
    /* ---------------------------------------- */

    _startTrackpoint(tileId, e, el) {
        this._stopTrackpoint();

        const originX = e.clientX;
        const originY = e.clientY;
        const maxRadius = 60; // max pixel displacement for full speed
        const speed = 1;      // pixels per frame at max deflection

        el.classList.add("active");

        const state = {
            tileId,
            el,
            vx: 0,
            vy: 0,
            accX: 0,
            accY: 0,
            rafId: null,
            pending: false
        };

        const onMove = (ev) => {
            const dx = Math.max(-maxRadius, Math.min(maxRadius, ev.clientX - originX));
            const dy = Math.max(-maxRadius, Math.min(maxRadius, ev.clientY - originY));
            state.vx = (dx / maxRadius) * speed;
            state.vy = (dy / maxRadius) * speed;
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            this._stopTrackpoint();
        };

        const tick = () => {
            if (!this._trackpoint) return;
            state.accX += state.vx;
            state.accY += state.vy;

            // Only push an update when accumulated at least 1 whole pixel
            const intX = Math.trunc(state.accX);
            const intY = Math.trunc(state.accY);
            if ((intX !== 0 || intY !== 0) && !state.pending) {
                state.accX -= intX;
                state.accY -= intY;
                state.pending = true;
                const tile = canvas.tiles.get(tileId);
                if (tile) {
                    tile.document.update({
                        x: tile.document.x + intX,
                        y: tile.document.y + intY
                    }).then(() => { state.pending = false; });
                } else {
                    state.pending = false;
                }
            }

            state.rafId = requestAnimationFrame(tick);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);

        this._trackpoint = state;
        state.rafId = requestAnimationFrame(tick);
    }

    _stopTrackpoint() {
        if (!this._trackpoint) return;
        cancelAnimationFrame(this._trackpoint.rafId);
        this._trackpoint.el.classList.remove("active");
        this._trackpoint = null;
    }

    /* ---------------------------------------- */
    /*  Close                                   */
    /* ---------------------------------------- */

    async close(options) {
        this._stopTrackpoint();
        this._restoreAllHidden();
        this._removeHighlight();
        this._unregisterHooks();
        clearTimeout(this._renderDebounceTimer);
        PoiTileSortApp._instance = null;
        return super.close(options);
    }
}
