/**
 * Character Tray Application
 *
 * V2 Application for displaying the character tray.
 * Uses Handlebars templates for rendering.
 * Ported from coffee-pub-squire module.
 */

import {
    setViewMode,
    getViewMode,
    cycleViewMode,
    openTokenSheet,
    selectToken,
    selectPartyTokens,
    clearTokenSelection,
    switchToActor,
    getHealthOverlayHeight,
    renderTray,
    toggleHideNpcsFromPlayers
} from "./TraySD.mjs";
// Note: renderTray imported above is used by POI undo/redo handlers
import { showLeaderDialog, showMovementModeDialog } from "./MarchingModeSD.mjs";
import { FormationSpawnerSD } from "./FormationSpawnerSD.mjs";
import { PinPlacer, JournalPinManager, JournalPinRenderer } from "./JournalPinsSD.mjs";
import { PinStyleEditorApp } from "./PinStyleEditorSD.mjs";
import { PinListApp } from "./PinListApp.mjs";

import { PlaceableNotesSD } from "./PlaceableNotesSD.mjs";
import { setMapDimension, formatActiveScene, enablePainting, disablePainting, toggleTileSelection, setSearchFilter, toggleWaterEffect, toggleWindEffect, toggleFogAnimation, toggleTintEnabled, toggleBwEffect, isTintEnabled, setActiveTileTab, setCustomTileDimension, toggleColoredFolderCollapsed, toggleSymbolFolderCollapsed, undoLastPoi, redoLastPoi, canUndoPoi, canRedoPoi, getPoiScale, enablePreview, disablePreview, getActiveTileTab, adjustPoiScale, rotatePoiLeft, rotatePoiRight, togglePoiMirror, getPoiMirror, setDecorSearchFilter, toggleDecorFolderCollapsed, setDecorMode, setDecorElevation, setDecorSort } from "./HexPainterSD.mjs";
import { generateHexMap, clearGeneratedTiles } from "./HexGeneratorSD.mjs";
import { flattenTiles, unflattenTile, getDungeonFloorLevels, getFlattendDungeonLevels, flattenDungeonLevel } from "./TileFlattenSD.mjs";
import { setDungeonMode, selectFloorTile, selectWallTile, selectDoorTile, selectIntWallTile, selectIntDoorTile, enableDungeonPainting, disableDungeonPainting, setNoFoundryWalls, setWallShadows, setDungeonBackground } from "./DungeonPainterSD.mjs";
import { toggleGeneratorPanel, isGeneratorExpanded, generateDungeon, generateRandomSeed, getGeneratorSeed, setGeneratorSeed, getGeneratorSettings, setGeneratorSettings } from "./DungeonGeneratorSD.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "shadowdark-extras";

export class TrayApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-tray",
        tag: "div",
        position: {
            width: "auto",
            height: "auto",
        },
        window: {
            frame: false,
            positioned: false,
        },
    };

    static PARTS = {
        main: {
            template: "modules/shadowdark-extras/templates/sdx-tray/tray.hbs"
        }
    };

    // Static instance reference for easy access
    static _instance = null;

    constructor(data = {}, options = {}) {
        super(options);
        this.trayData = data;
        this._isExpanded = false;
        this._pinSearchTerm = "";
        this._scrollPositions = {}; // Store scroll positions for tile grids
        this._generatorExpanded = false; // Store procedural generator panel state

        // Store static reference
        TrayApp._instance = this;
    }

    /**
     * Update the tray data and re-render
     * @param {Object} data - Tray data
     */
    updateData(data) {
        this._saveScrollPositions();
        this.trayData = data;
        this.render();
    }

    /**
     * Save scroll positions of tile grids and other UI state
     */
    _saveScrollPositions() {
        // Can't query inside this.element because it might not be rendered/attached yet in the way we expect if we use standard AppV2 accessors,
        // but for now we look at the DOM since we are doing a re-render
        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;

        // Save scroll position of the main hex tile scroll container
        const hexTileScroll = elem.querySelector(".hex-tile-scroll");
        if (hexTileScroll) {
            this._scrollPositions["hex-tile-scroll"] = hexTileScroll.scrollTop;
        }

        // Save scroll position of the dungeon tile scroll container
        const dungeonTileScroll = elem.querySelector(".dungeon-tile-scroll");
        if (dungeonTileScroll) {
            this._scrollPositions["dungeon-tile-scroll"] = dungeonTileScroll.scrollTop;
        }

        // Save scroll position of the decor tile scroll container
        const decorTileScroll = elem.querySelector(".decor-tile-scroll");
        if (decorTileScroll) {
            this._scrollPositions["decor-tile-scroll"] = decorTileScroll.scrollTop;
        }

        // Also save individual grid scroll positions if needed
        elem.querySelectorAll(".hex-tile-grid").forEach(grid => {
            const key = grid.dataset.tilePanel;
            if (key) {
                this._scrollPositions[key] = grid.scrollTop;
            }
        });

        // Save procedural generator panel expanded state
        const generatorControls = elem.querySelector(".hex-generator-controls");
        if (generatorControls) {
            this._generatorExpanded = !generatorControls.classList.contains("hidden");
        }
    }

    /**
     * Restore scroll positions of tile grids and other UI state
     */
    _restoreScrollPositions() {
        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;

        // Restore main hex tile scroll container position
        const hexTileScroll = elem.querySelector(".hex-tile-scroll");
        if (hexTileScroll && this._scrollPositions["hex-tile-scroll"] !== undefined) {
            hexTileScroll.scrollTop = this._scrollPositions["hex-tile-scroll"];
        }

        // Restore dungeon tile scroll container position
        const dungeonTileScroll = elem.querySelector(".dungeon-tile-scroll");
        if (dungeonTileScroll && this._scrollPositions["dungeon-tile-scroll"] !== undefined) {
            dungeonTileScroll.scrollTop = this._scrollPositions["dungeon-tile-scroll"];
        }

        // Restore decor tile scroll container position
        const decorTileScroll = elem.querySelector(".decor-tile-scroll");
        if (decorTileScroll && this._scrollPositions["decor-tile-scroll"] !== undefined) {
            decorTileScroll.scrollTop = this._scrollPositions["decor-tile-scroll"];
        }

        // Restore individual grid scroll positions
        elem.querySelectorAll(".hex-tile-grid").forEach(grid => {
            const key = grid.dataset.tilePanel;
            if (key && this._scrollPositions[key] !== undefined) {
                grid.scrollTop = this._scrollPositions[key];
            }
        });

        // Restore procedural generator panel expanded state
        const generatorControls = elem.querySelector(".hex-generator-controls");
        if (generatorControls && this._generatorExpanded) {
            generatorControls.classList.remove("hidden");
        }
    }

    /**
     * Toggle expanded state
     */
    toggleExpanded() {
        this._isExpanded = !this._isExpanded;
        this._applyExpandedState();

        // Close Tom panels if open (they're positioned relative to handle)
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();
    }

    /**
     * Set expanded state
     */
    setExpanded(expanded) {
        this._isExpanded = expanded;
        this._applyExpandedState();

        // Close Tom panels if open
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();
    }

    /**
     * Apply the expanded state to the DOM
     */
    _applyExpandedState() {
        const elem = document.querySelector(".sdx-tray");
        if (elem) {
            elem.classList.toggle("expanded", this._isExpanded);
        }

        const viewMode = getViewMode();

        if (this._isExpanded && viewMode === "hexes") {
            enablePainting();
            disableDungeonPainting();
            // Enable POI preview if on symbols tab
            if (getActiveTileTab() === "symbols") {
                enablePreview();
            }
        } else if (this._isExpanded && viewMode === "decor") {
            setDecorMode(true);
            enablePainting();
            disableDungeonPainting();
            enablePreview();
        } else if (this._isExpanded && viewMode === "dungeons") {
            disablePainting();
            disablePreview();
            enableDungeonPainting();
        } else {
            disablePainting();
            disablePreview();
            disableDungeonPainting();
        }

        this._syncPoiSortPanel();
    }

    /**
     * Sync the POI Tile Sort panel visibility based on current mode
     */
    async _syncPoiSortPanel() {
        const viewMode = getViewMode();
        const isPoiMode = this._isExpanded && (
            (viewMode === "hexes" && getActiveTileTab() === "symbols") ||
            viewMode === "decor"
        );
        const { PoiTileSortApp } = await import("./PoiTileSortSD.mjs");
        isPoiMode ? PoiTileSortApp.show() : PoiTileSortApp.hide();
    }

    /**
     * Check if tray is expanded
     * @returns {boolean}
     */
    isExpanded() {
        return this._isExpanded;
    }

    /**
     * Prepare context data for the template
     */
    async _prepareContext(options) {
        // Tom Broadcast State
        let activeSceneId = null;
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            activeSceneId = TomStore.activeSceneId || null;
        } catch (err) {
            // Ignore
        }
        this._tomActiveSceneId = activeSceneId;

        // Calculate POI scale percentage for display
        const poiScale = getPoiScale();
        const poiScalePercent = Math.round(poiScale * 100);

        return {
            ...this.trayData,
            isExpanded: this._isExpanded,
            viewMode: getViewMode(),
            pinSearchTerm: this._pinSearchTerm,
            tomActiveSceneId: activeSceneId,
            showTomOverlays: !!activeSceneId,
            tomScenes: await this._getTomScenes(),
            tomFolders: await this._getTomFolders(),
            tintEnabled: isTintEnabled(),
            poiScale: poiScale,
            poiScalePercent: poiScalePercent,
            generatorExpanded: isGeneratorExpanded(),
            generatorSeed: getGeneratorSeed(),
            generatorSettings: getGeneratorSettings()
        };
    }

    /**
     * Get list of sections from TomStore
     */
    async _getTomScenes() {
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            const scenes = Array.from(TomStore.scenes.values());
            // Add isVideo property to each scene for thumbnail rendering
            return scenes.map(scene => {
                const sceneData = scene.toJSON ? scene.toJSON() : scene;
                const bg = sceneData.background || "";
                const isVideo = /\.(webm|mp4)$/i.test(bg);
                return { ...sceneData, isVideo };
            });
        } catch (err) {
            console.error("Failed to load TomScenes:", err);
            return [];
        }
    }

    /**
     * Get folder data from TomStore, with scenes grouped inside each folder
     * @returns {Array} Array of { id, name, collapsed, scenes: [] }
     */
    async _getTomFolders() {
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            const folders = TomStore.folders || [];
            return folders.map(folder => {
                const folderScenes = TomStore.getScenesInFolder(folder.id);
                const scenes = folderScenes.map(scene => {
                    const sceneData = scene.toJSON ? scene.toJSON() : scene;
                    const bg = sceneData.background || "";
                    const isVideo = /\.(webm|mp4)$/i.test(bg);
                    return { ...sceneData, isVideo };
                });
                return { ...folder, scenes };
            });
        } catch (err) {
            console.error("Failed to load TomFolders:", err);
            return [];
        }
    }



    /**
     * Attach event listeners after render
     */
    _onRender(context, options) {
        super._onRender(context, options);
        // Use requestAnimationFrame to ensure DOM is fully rendered before restoring scroll
        requestAnimationFrame(() => this._restoreScrollPositions());

        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;



        // Toggle button - click to expand/collapse
        elem.querySelector(".tray-handle-button-toggle")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleExpanded();
        });

        // View cycle button
        elem.querySelector(".tray-handle-button-viewcycle")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cycleViewMode();
        });

        // GM Tools Buttons
        elem.querySelector(".tray-handle-button-tool[data-action='tom-scene-switcher']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomScenePanel();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='tom-overlay-manager']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomOverlayPanel();
        });

        // GM Tools Buttons
        elem.querySelector(".tray-handle-button-tool[data-action='leader']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showLeaderDialog();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='marching']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMovementModeDialog();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='formation']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            FormationSpawnerSD.show();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='add-pin']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            PinPlacer.activate();
        });



        elem.querySelector(".tray-handle-button-tool[data-action='pin-list']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await setViewMode("pins");
            this.setExpanded(true);
        });



        // Light Tracker Button
        elem.querySelector(".tray-handle-button-tool[data-action='light-tracker']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Use SDX AppV2 Light Tracker if available, fallback to system tracker
            if (game.shadowdarkExtras?.lightTracker?.toggle) {
                game.shadowdarkExtras.lightTracker.toggle();
            } else if (game.shadowdark?.lightSourceTracker?.toggleInterface) {
                game.shadowdark.lightSourceTracker.toggleInterface();
            } else {
                ui.notifications.warn("Light Source Tracker not found.");
            }
        });

        // Carousing Button
        elem.querySelector(".tray-handle-button-tool[data-action='carousing']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sdxOpenCarousingOverlay) {
                window.sdxOpenCarousingOverlay();
            } else {
                ui.notifications.warn("Carousing system not ready.");
            }
        });

        // Drawing Tools Button
        elem.querySelector(".tray-handle-button-tool[data-action='sdx-drawing']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (game.shadowdarkExtras?.drawingToolbar?.toggle) {
                game.shadowdarkExtras.drawingToolbar.toggle();
            } else {
                ui.notifications.warn("Drawing tools not ready.");
            }
        });

        // SDX Coords Toggle Button
        elem.querySelector(".tray-handle-button-tool[data-action='sdx-coords']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.SDXCoordinates) {
                window.SDXCoordinates.toggle();
            } else {
                ui.notifications.warn("Coordinate display not supported on this map.");
            }
        });

        // SDX Roller Button
        elem.querySelector(".tray-handle-button-tool[data-action='sdx-roller']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { SDXRollerApp } = await import("./SDXRollerApp.mjs");
            new SDXRollerApp().render(true);
        });

        // POI Undo Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-undo']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await undoLastPoi();
            elem.querySelector(".poi-undo-btn")?.classList.toggle("disabled", !canUndoPoi());
            elem.querySelector(".poi-redo-btn")?.classList.toggle("disabled", !canRedoPoi());
        });

        // POI Redo Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-redo']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await redoLastPoi();
            elem.querySelector(".poi-undo-btn")?.classList.toggle("disabled", !canUndoPoi());
            elem.querySelector(".poi-redo-btn")?.classList.toggle("disabled", !canRedoPoi());
        });

        // POI Scale Down Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-scale-down']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustPoiScale(-0.1);
            this._updatePoiScaleDisplay();
        });

        // POI Scale Up Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-scale-up']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            adjustPoiScale(0.1);
            this._updatePoiScaleDisplay();
        });

        // POI Rotate Left Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-rotate-left']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            rotatePoiLeft();
        });

        // POI Rotate Right Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-rotate-right']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            rotatePoiRight();
        });

        // POI Mirror Button
        elem.querySelector(".tray-handle-button-tool[data-action='poi-mirror']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePoiMirror();
            e.currentTarget.classList.toggle("active", getPoiMirror());
        });

        // Tab buttons
        elem.querySelectorAll(".tray-tab-button").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = btn.dataset.view;
                if (view) {
                    await setViewMode(view);
                    // Enable/disable painting based on view
                    if (view === "hexes" && this._isExpanded) {
                        enablePainting();
                        disableDungeonPainting();
                        if (getActiveTileTab() === "symbols") {
                            enablePreview();
                        }
                    } else if (view === "decor" && this._isExpanded) {
                        setDecorMode(true);
                        enablePainting();
                        disableDungeonPainting();
                        enablePreview();
                    } else if (view === "dungeons" && this._isExpanded) {
                        disablePainting();
                        disablePreview();
                        enableDungeonPainting();
                    } else {
                        disablePainting();
                        disablePreview();
                        disableDungeonPainting();
                    }
                    this._syncPoiSortPanel();
                }
            });
        });

        /* ------------------------------------------- */
        /*  DUNGEON PAINTER TAB ACTIONS               */
        /* ------------------------------------------- */

        // Dungeon mode tabs (Tiles / Doors)
        elem.querySelectorAll(".dungeon-mode-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const mode = tab.dataset.dungeonMode;
                if (mode) {
                    setDungeonMode(mode);
                    renderTray();
                }
            });
        });

        // Dungeon floor tile selection
        elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-tile]").forEach(tile => {
            tile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tilePath = tile.dataset.dungeonTile;
                if (tilePath) {
                    selectFloorTile(tilePath);
                    elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-tile]").forEach(t => t.classList.remove("active"));
                    tile.classList.add("active");
                }
            });
        });

        // Dungeon door tile selection
        elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-door]").forEach(tile => {
            tile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tilePath = tile.dataset.dungeonDoor;
                if (tilePath) {
                    selectDoorTile(tilePath);
                    elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-door]").forEach(t => t.classList.remove("active"));
                    tile.classList.add("active");
                }
            });
        });

        // Dungeon wall tile selection
        elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-wall]").forEach(tile => {
            tile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tilePath = tile.dataset.dungeonWall;
                if (tilePath) {
                    selectWallTile(tilePath);
                    elem.querySelectorAll(".dungeon-tile-thumb[data-dungeon-wall]").forEach(t => t.classList.remove("active"));
                    tile.classList.add("active");
                }
            });
        });

        // Interior door tile selection
        elem.querySelectorAll(".dungeon-intdoor-thumb[data-dungeon-intdoor]").forEach(tile => {
            tile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tilePath = tile.dataset.dungeonIntdoor;
                if (tilePath) {
                    selectIntDoorTile(tilePath);
                    elem.querySelectorAll(".dungeon-intdoor-thumb[data-dungeon-intdoor]").forEach(t => t.classList.remove("active"));
                    tile.classList.add("active");
                }
            });
        });

        // Interior wall tile selection
        elem.querySelectorAll(".dungeon-intwall-thumb[data-dungeon-intwall]").forEach(tile => {
            tile.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const tilePath = tile.dataset.dungeonIntwall;
                if (tilePath) {
                    selectIntWallTile(tilePath);
                    elem.querySelectorAll(".dungeon-intwall-thumb[data-dungeon-intwall]").forEach(t => t.classList.remove("active"));
                    tile.classList.add("active");
                }
            });
        });

        // Dungeon "No Foundry Walls" toggle
        const noWallsCheckbox = elem.querySelector(".dungeon-no-walls-checkbox");
        if (noWallsCheckbox) {
            noWallsCheckbox.addEventListener("change", (e) => {
                setNoFoundryWalls(e.target.checked);
                renderTray();
            });
        }

        // Dungeon "Wall Shadows" toggle
        const wallShadowsCheckbox = elem.querySelector(".dungeon-wall-shadows-checkbox");
        if (wallShadowsCheckbox) {
            wallShadowsCheckbox.addEventListener("change", (e) => {
                setWallShadows(e.target.checked);
            });
        }

        // Dungeon "Flatten Level" button
        elem.querySelector(".dungeon-flatten-level-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const byElevation = getDungeonFloorLevels();
            const elevations = Object.keys(byElevation).map(Number).sort((a, b) => a - b);
            if (!elevations.length) {
                ui.notifications.warn("No dungeon floor tiles found on this scene.");
                return;
            }
            let elevation;
            if (elevations.length === 1) {
                elevation = elevations[0];
            } else {
                const options = elevations.map(el =>
                    `<option value="${el}">Elevation ${el} — ${byElevation[el].length} tiles</option>`
                ).join('');
                elevation = await new Promise(resolve => {
                    new Dialog({
                        title: "Flatten Dungeon Level",
                        content: `<div style="padding:8px 0"><label style="display:block;margin-bottom:6px">Select level to flatten:</label><select id="sdx-fl-sel" style="width:100%">${options}</select></div>`,
                        buttons: {
                            ok: {
                                icon: '<i class="fas fa-layer-group"></i>',
                                label: "Flatten",
                                callback: (html) => {
                                    const el = (html instanceof HTMLElement ? html : html[0]).querySelector("#sdx-fl-sel");
                                    resolve(el ? Number(el.value) : null);
                                }
                            },
                            cancel: { label: "Cancel", callback: () => resolve(null) }
                        },
                        default: "ok",
                        close: () => resolve(null)
                    }).render(true);
                });
            }
            if (elevation !== null && elevation !== undefined) {
                await flattenDungeonLevel(elevation);
            }
        });

        // Dungeon "Unflatten Level" button
        elem.querySelector(".dungeon-unflatten-level-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const flattenedTiles = getFlattendDungeonLevels();
            if (!flattenedTiles.length) {
                ui.notifications.warn("No flattened dungeon levels found on this scene.");
                return;
            }
            let tileDoc;
            if (flattenedTiles.length === 1) {
                tileDoc = flattenedTiles[0];
            } else {
                const options = flattenedTiles.map(t => {
                    const el = t.flags?.["shadowdark-extras"]?.dungeonFlattenedLevel ?? "?";
                    const cnt = t.flags?.["shadowdark-extras"]?.originalTileCount ?? "?";
                    return `<option value="${t.id}">Elevation ${el} (${cnt} tiles)</option>`;
                }).join('');
                tileDoc = await new Promise(resolve => {
                    new Dialog({
                        title: "Unflatten Dungeon Level",
                        content: `<div style="padding:8px 0"><label style="display:block;margin-bottom:6px">Select level to unflatten:</label><select id="sdx-ufl-sel" style="width:100%">${options}</select></div>`,
                        buttons: {
                            ok: {
                                icon: '<i class="fas fa-layer-group"></i>',
                                label: "Unflatten",
                                callback: (html) => {
                                    const el = (html instanceof HTMLElement ? html : html[0]).querySelector("#sdx-ufl-sel");
                                    const id = el?.value;
                                    resolve(flattenedTiles.find(t => t.id === id) ?? null);
                                }
                            },
                            cancel: { label: "Cancel", callback: () => resolve(null) }
                        },
                        default: "ok",
                        close: () => resolve(null)
                    }).render(true);
                });
            }
            if (tileDoc) {
                await unflattenTile(tileDoc);
            }
        });

        // Dungeon background select
        const bgSelect = elem.querySelector(".dungeon-background-select");
        if (bgSelect) {
            bgSelect.addEventListener("change", (e) => {
                setDungeonBackground(e.target.value);
            });
        }

        // Dungeon Generator toggle
        elem.querySelector(".dungeon-generator-toggle")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleGeneratorPanel();
            renderTray();
        });

        // Dungeon Generator close button
        elem.querySelector(".dungeon-generator-close")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleGeneratorPanel();
            renderTray();
        });

        // Generator slider value displays
        elem.querySelectorAll(".dgen-row input[type='range']").forEach(slider => {
            slider.addEventListener("input", (e) => {
                const valueSpan = e.target.closest(".dgen-row").querySelector(".dgen-value");
                if (valueSpan) valueSpan.textContent = e.target.value;
            });
        });

        // Generator textured toggle - hide/show color row and thickness
        const texturedCheckbox = elem.querySelector(".dgen-textured");
        const colorRow = elem.querySelector(".dgen-color-row");
        const thicknessRow = elem.querySelector(".dgen-thickness")?.closest(".dgen-row");
        if (texturedCheckbox) {
            const updateTexturedVisibility = (checked) => {
                if (colorRow) colorRow.style.display = checked ? "none" : "";
                if (thicknessRow) thicknessRow.style.display = checked ? "none" : "";
            };
            updateTexturedVisibility(texturedCheckbox.checked);
            texturedCheckbox.addEventListener("change", (e) => {
                updateTexturedVisibility(e.target.checked);
            });
        }

        // Generator seed refresh
        elem.querySelector(".dgen-seed-refresh")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const newSeed = generateRandomSeed();
            setGeneratorSeed(newSeed);
            const seedInput = elem.querySelector(".dgen-seed");
            if (seedInput) seedInput.value = newSeed;
        });

        // Generator apply button
        elem.querySelector(".dgen-apply")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const seedInput = elem.querySelector(".dgen-seed");
            const seed = seedInput?.value || getGeneratorSeed();
            setGeneratorSeed(seed);

            const isTextured = elem.querySelector(".dgen-textured")?.checked ?? false;
            const isWallShadows = elem.querySelector(".dgen-wall-shadows")?.checked ?? false;
            const rooms = parseInt(elem.querySelector(".dgen-rooms")?.value || "10");
            const dens = parseFloat(elem.querySelector(".dgen-density")?.value || "0.8");
            const branch = parseFloat(elem.querySelector(".dgen-branching")?.value || "0.5");
            const roomSz = parseFloat(elem.querySelector(".dgen-roomsize")?.value || "0.5");
            const sym = elem.querySelector(".dgen-symmetry")?.checked ?? true;
            const stairsVal = parseInt(elem.querySelector(".dgen-stairs")?.value || "0");
            const stairsDownVal = parseInt(elem.querySelector(".dgen-stairsdown")?.value || "0");
            const clutterVal = parseInt(elem.querySelector(".dgen-clutter")?.value || "0");
            const wColor = elem.querySelector(".dgen-wall-color")?.value || "#5C3D3D";
            const thick = isTextured ? 20 : parseInt(elem.querySelector(".dgen-thickness")?.value || "20");

            // Persist settings
            setGeneratorSettings({
                rooms, density: dens, branching: branch, roomSize: roomSz,
                symmetry: sym, stairs: stairsVal, stairsDown: stairsDownVal, clutter: clutterVal,
                textured: isTextured, wallShadows: isWallShadows, wallColor: wColor, thickness: thick
            });

            const config = {
                seed,
                roomCount: rooms,
                density: dens,
                branching: branch,
                roomSizeBias: roomSz,
                symmetry: sym,
                stairs: stairsVal,
                stairsDown: stairsDownVal,
                clutter: clutterVal,
                useTexture: isTextured,
                wallShadows: isWallShadows,
                wallColor: wColor,
                wallThickness: thick
            };

            await generateDungeon(config);
        });



        /* ------------------------------------------- */
        /*  SCENES TAB ACTIONS                        */
        /* ------------------------------------------- */

        // Create Scene
        elem.querySelector("[data-action='create-scene']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
            new TomSceneEditor().render(true);
        });

        // Create Folder
        elem.querySelector("[data-action='create-folder']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const name = await this._promptFolderName("Create Folder", "New Folder");
            if (!name) return;
            const { TomStore } = await import("./data/TomStore.mjs");
            TomStore.createFolder(name);
            this.render();
        });

        // Stop Broadcast (Header Button)
        elem.querySelector("[data-action='stop-broadcast']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
            const { TomStore } = await import("./data/TomStore.mjs");
            const activeSceneId = TomStore.activeSceneId;
            const activeScene = activeSceneId ? TomStore.scenes.get(activeSceneId) : null;
            const outAnimation = activeScene?.outAnimation || 'fade';
            TomSocketHandler.emitStopBroadcast(outAnimation);
        });

        // Folder Actions
        elem.querySelectorAll("[data-action='toggle-folder']").forEach(header => {
            header.addEventListener("click", async (e) => {
                // Don't toggle if clicking an action button inside the header
                if (e.target.closest("[data-action='rename-folder']") || e.target.closest("[data-action='delete-folder']")) return;
                e.preventDefault();
                const folderId = header.dataset.folderId;
                const { TomStore } = await import("./data/TomStore.mjs");
                TomStore.toggleFolderCollapsed(folderId);
                this.render();
            });
        });

        elem.querySelectorAll("[data-action='rename-folder']").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const folderId = btn.dataset.folderId;
                const currentName = btn.dataset.folderName;
                const newName = await this._promptFolderName("Rename Folder", currentName);
                if (!newName) return;
                const { TomStore } = await import("./data/TomStore.mjs");
                TomStore.renameFolder(folderId, newName);
                this.render();
            });
        });

        elem.querySelectorAll("[data-action='delete-folder']").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const folderId = btn.dataset.folderId;
                const folderName = btn.dataset.folderName;
                const confirmed = await Dialog.confirm({
                    title: "Delete Folder",
                    content: `<p>Delete folder <strong>${folderName}</strong>?</p><p>Scenes inside will become uncategorized.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                const { TomStore } = await import("./data/TomStore.mjs");
                TomStore.deleteFolder(folderId);
            });
        });

        // Drag-drop onto folders and uncategorized container
        elem.querySelectorAll(".scene-folder, .scene-uncat-container").forEach(dropZone => {
            const folderId = dropZone.dataset.folderId || null;

            dropZone.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dropZone.classList.add("drag-over");
            });
            dropZone.addEventListener("dragleave", (e) => {
                if (!dropZone.contains(e.relatedTarget)) {
                    dropZone.classList.remove("drag-over");
                }
            });
            dropZone.addEventListener("drop", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove("drag-over");

                const draggedSceneId = e.dataTransfer.getData("text/plain");
                if (!draggedSceneId) return;

                // Check if this is a reorder within the same container or a folder move
                const targetCard = e.target.closest(".scene-card");
                const targetFolderId = folderId || null;

                const { TomStore } = await import("./data/TomStore.mjs");
                const draggedScene = TomStore.scenes.get(draggedSceneId);
                if (!draggedScene) return;

                const currentFolderId = draggedScene.folderId || null;

                if (currentFolderId !== targetFolderId) {
                    // Moving to a different folder
                    TomStore.moveSceneToFolder(draggedSceneId, targetFolderId);
                } else if (targetCard) {
                    // Same folder — reorder
                    const targetId = targetCard.dataset.sceneId;
                    if (draggedSceneId === targetId) return;

                    const currentScenes = Array.from(TomStore.scenes.values());
                    const sceneIds = currentScenes.map(s => s.id);
                    const draggedIndex = sceneIds.indexOf(draggedSceneId);
                    const targetIndex = sceneIds.indexOf(targetId);
                    if (draggedIndex === -1 || targetIndex === -1) return;

                    sceneIds.splice(draggedIndex, 1);
                    sceneIds.splice(targetIndex, 0, draggedSceneId);
                    TomStore.reorderScenes(sceneIds);
                }
            });
        });

        // Scene Card Actions
        elem.querySelectorAll(".scene-card").forEach(card => {
            const sceneId = card.dataset.sceneId;

            // Activate Scene (Broadcast) - Clicking the thumbnail/name
            card.querySelector(".scene-card-activate")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const { TomStore } = await import("./data/TomStore.mjs");
                const scene = TomStore.scenes.get(sceneId);
                const inAnimation = scene?.inAnimation || 'fade';
                TomSocketHandler.emitBroadcastScene(sceneId, inAnimation);
            });

            // Edit Scene
            card.querySelector("[data-action='edit-scene']")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
                new TomSceneEditor(sceneId).render(true);
            });

            // Delete Scene
            card.querySelector("[data-action='delete-scene']")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sceneName = card.querySelector(".scene-name").textContent;

                const confirmed = await Dialog.confirm({
                    title: "Delete Scene",
                    content: `<p>Are you sure you want to delete <strong>${sceneName}</strong>?</p><p>This action cannot be undone.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });

                if (confirmed) {
                    const { TomStore } = await import("./data/TomStore.mjs");
                    TomStore.deleteItem(sceneId, "scene");
                    ui.notifications.info(`Scene "${sceneName}" deleted.`);
                }
            });

            // Drag and Drop — set data for folder-level drop handler
            card.addEventListener("dragstart", (e) => {
                e.stopPropagation();
                card.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sceneId);
            });

            card.addEventListener("dragend", (e) => {
                e.stopPropagation();
                card.classList.remove("dragging");
                elem.querySelectorAll(".scene-card").forEach(c => c.classList.remove("drag-over"));
                elem.querySelectorAll(".scene-folder, .scene-uncat-container").forEach(z => z.classList.remove("drag-over"));
            });

            card.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                const draggingCard = elem.querySelector(".scene-card.dragging");
                if (draggingCard && draggingCard !== card) {
                    card.classList.add("drag-over");
                }
            });

            card.addEventListener("dragleave", (e) => {
                e.stopPropagation();
                if (!card.contains(e.relatedTarget)) {
                    card.classList.remove("drag-over");
                }
            });
        });

        // Select party button
        elem.querySelector('[data-action="select-party"]')?.addEventListener("click", (e) => {
            e.preventDefault();
            selectPartyTokens();
        });

        // Toggle NPC visibility for players (GM only)
        elem.querySelector('[data-action="toggle-npc-visibility"]')?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleHideNpcsFromPlayers();
        });

        // Clear selection button
        elem.querySelector(".button-clear")?.addEventListener("click", (e) => {
            e.preventDefault();
            clearTokenSelection();
        });





        // Pin/Note List Pan Action
        elem.querySelectorAll(".pin-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = btn.dataset.action;
                const entry = btn.closest(".pin-entry");
                const id = entry.dataset.id;

                if (!id) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    if (!isNaN(x) && !isNaN(y)) {
                        canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                    }
                } else if (action === "ping-pin") {
                    if (!JournalPinRenderer.getContainer()) return;
                    const pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === id);

                    if (game.user.isGM) {
                        if (pin && pin.animatePing) pin.animatePing("ping");
                        game.socket.emit("module.shadowdark-extras", {
                            type: "pingPin",
                            sceneId: canvas.scene?.id,
                            pinId: id
                        });
                    } else {
                        ui.notifications.warn("Only GM can ping pins.");
                    }
                } else if (action === "bring-players") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);

                    if (game.user.isGM) {
                        if (!isNaN(x) && !isNaN(y)) {
                            canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                            if (JournalPinRenderer.getContainer()) {
                                const pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === id);
                                if (pin && pin.animatePing) pin.animatePing("bring");
                            }
                            game.socket.emit("module.shadowdark-extras", {
                                type: "panToPin",
                                x: x,
                                y: y,
                                sceneId: canvas.scene?.id,
                                pinId: id
                            });
                        }
                    } else {
                        ui.notifications.warn("Only GM can bring players.");
                    }
                } else if (action === "edit-pin") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        new PinStyleEditorApp({ pinId: id }).render(true);
                    }
                } else if (action === "toggle-gm-only") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        if (game.user.isGM) {
                            const current = pinData.gmOnly || false;
                            await JournalPinManager.update(id, { gmOnly: !current });
                        } else {
                            ui.notifications.warn("Only GM can toggle visibility.");
                        }
                    }
                } else if (action === "toggle-vision") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        if (game.user.isGM) {
                            const current = pinData.requiresVision || false;
                            await JournalPinManager.update(id, { requiresVision: !current });
                        } else {
                            ui.notifications.warn("Only GM can toggle vision requirement.");
                        }
                    }
                } else if (action === "delete-pin") {
                    Dialog.confirm({
                        title: "Delete Pin",
                        content: "<p>Are you sure you want to delete this pin?</p>",
                        yes: async () => {
                            await JournalPinManager.delete(id);
                        },
                        defaultYes: false
                    });
                } else if (action === "copy-style") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        JournalPinManager.copyStyle(pinData);
                    }
                } else if (action === "paste-style") {
                    await JournalPinManager.pasteStyle(id);
                } else if (action === "duplicate-pin") {
                    await JournalPinManager.duplicate(id);
                }
            });
        });

        // Note Actions
        elem.querySelectorAll(".note-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = btn.dataset.action;
                const entry = btn.closest(".note-entry");
                const id = entry.dataset.id;
                const type = entry.querySelector(".note-icon i").className.includes("fa-user") ? "Token" :
                    entry.querySelector(".note-icon i").className.includes("fa-lightbulb") ? "AmbientLight" :
                        entry.querySelector(".note-icon i").className.includes("fa-volume-high") ? "AmbientSound" :
                            entry.querySelector(".note-icon i").className.includes("fa-image") ? "Tile" :
                                entry.querySelector(".note-icon i").className.includes("fa-block-brick") ? "Wall" : null;

                if (!type) return;

                // Find the document
                let doc;
                if (type === "Token") {
                    const token = canvas.tokens.get(id);
                    if (token) {
                        const tokenDoc = token.document;
                        // Check if token has its own note
                        const tokenNote = tokenDoc.getFlag("shadowdark-extras", "notes");
                        // If token has no note, but actor does, edit the actor's note (matching display logic)
                        if (!tokenNote && token.actor && token.actor.getFlag("shadowdark-extras", "notes")) {
                            doc = token.actor;
                        } else {
                            doc = tokenDoc;
                        }
                    }
                }
                else if (type === "AmbientLight") doc = canvas.lighting.get(id)?.document;
                else if (type === "AmbientSound") doc = canvas.sounds.get(id)?.document;
                else if (type === "Tile") doc = canvas.tiles.get(id)?.document;
                else if (type === "Wall") doc = canvas.walls.get(id)?.document;

                if (!doc) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                } else if (action === "rename") {
                    const currentName = doc.getFlag("shadowdark-extras", "customName") || doc.name || "";
                    new Dialog({
                        title: "Rename Placeable Note",
                        content: `
                            <form>
                                <div class="form-group">
                                    <label>Name:</label>
                                    <input type="text" name="name" value="${currentName}" autofocus>
                                </div>
                            </form>
                        `,
                        buttons: {
                            save: {
                                label: "Save",
                                icon: '<i class="fas fa-check"></i>',
                                callback: async (html) => {
                                    const newName = html.find("input[name='name']").val();
                                    await doc.setFlag("shadowdark-extras", "customName", newName);
                                    // Tray will auto-update via hooks
                                }
                            },
                            reset: {
                                label: "Reset",
                                icon: '<i class="fas fa-undo"></i>',
                                callback: async () => {
                                    await doc.unsetFlag("shadowdark-extras", "customName");
                                }
                            }
                        },
                        default: "save"
                    }).render(true);
                } else if (action === "toggle-visibility") {
                    const isVisible = !!doc.getFlag("shadowdark-extras", "noteVisible");
                    await doc.setFlag("shadowdark-extras", "noteVisible", !isVisible);
                } else if (action === "delete") {
                    Dialog.confirm({
                        title: "Delete Note",
                        content: `<p>Are you sure you want to delete the note for <strong>${doc.name}</strong>?</p>`,
                        yes: async () => {
                            // If we are deleting a note on a token, and it was displaying fallback actor notes...
                            // Actually, 'doc' is already resolved to the correct document (Token or Actor)
                            // So we just delete the flag from 'doc'.
                            await doc.unsetFlag("shadowdark-extras", "notes");
                            // Also clear visibility flag? Yes.
                            await doc.unsetFlag("shadowdark-extras", "noteVisible");
                        },
                        defaultYes: false
                    });
                }
            });
        });

        // Note Toggle Action
        elem.querySelectorAll(".note-header").forEach(header => {
            header.addEventListener("click", (e) => {
                // Don't toggle if clicking a control button
                if (e.target.closest(".note-controls")) return;

                e.preventDefault();
                e.stopPropagation();
                const entry = header.closest(".note-entry");
                const content = entry.querySelector(".note-content");
                if (content) {
                    content.classList.toggle("hidden");
                    const icon = header.querySelector(".toggle-icon i");
                    if (icon) {
                        icon.classList.toggle("fa-chevron-right");
                        icon.classList.toggle("fa-chevron-down");
                    }
                }
            });
        });

        // Note Entry Context Menu (Edit)
        elem.querySelectorAll(".note-entry").forEach(entry => {
            entry.addEventListener("contextmenu", (e) => {
                if (!game.user.isGM) return;
                e.preventDefault();
                e.stopPropagation();

                const id = entry.dataset.id;
                const type = entry.querySelector(".note-icon i").className.includes("fa-user") ? "Token" :
                    entry.querySelector(".note-icon i").className.includes("fa-lightbulb") ? "AmbientLight" :
                        entry.querySelector(".note-icon i").className.includes("fa-volume-high") ? "AmbientSound" :
                            entry.querySelector(".note-icon i").className.includes("fa-image") ? "Tile" :
                                entry.querySelector(".note-icon i").className.includes("fa-block-brick") ? "Wall" : null;

                if (!type) return;

                // Find the document
                let doc;
                if (type === "Token") {
                    const token = canvas.tokens.get(id);
                    if (token) {
                        const tokenDoc = token.document;
                        // Check if token has its own note
                        const tokenNote = tokenDoc.getFlag("shadowdark-extras", "notes");
                        // If token has no note, but actor does, edit the actor's note (matching display logic)
                        if (!tokenNote && token.actor && token.actor.getFlag("shadowdark-extras", "notes")) {
                            doc = token.actor;
                        } else {
                            doc = tokenDoc;
                        }
                    }
                }
                else if (type === "AmbientLight") doc = canvas.lighting.get(id)?.document;
                else if (type === "AmbientSound") doc = canvas.sounds.get(id)?.document;
                else if (type === "Tile") doc = canvas.tiles.get(id)?.document;
                else if (type === "Wall") doc = canvas.walls.get(id)?.document;

                if (!doc) return;

                new PlaceableNotesSD(doc).render(true);
            });
        });

        // Map Note Actions
        elem.querySelectorAll(".map-note-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = btn.dataset.action;
                const entry = btn.closest(".map-note-entry");
                const id = entry.dataset.id;
                const uuid = entry.dataset.uuid;

                if (!id) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    if (!isNaN(x) && !isNaN(y)) {
                        canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                    }
                } else if (action === "delete") {
                    const note = fromUuidSync(uuid);
                    if (!note) return;

                    Dialog.confirm({
                        title: "Delete Map Note",
                        content: `<p>Are you sure you want to delete the map note <strong>${note.text || note.name}</strong>?</p>`,
                        yes: () => note.delete(),
                        defaultYes: false
                    });
                } else if (action === "open") {
                    const note = fromUuidSync(uuid);
                    if (note) note.sheet.render(true);
                }
            });
        });

        // Pin Search Input
        const searchInput = elem.querySelector(".pin-search-input");
        if (searchInput) {
            // Restore focus if we re-rendered and input was focused (simple heuristic)
            // But actually ApplicationV2 re-renders the whole thing, so focus is lost.
            // We can rely on value={pinSearchTerm} to restore value, 
            // but for smooth typing we might want to avoid full re-render on every keystroke if possible,
            // or just use client-side filtering without re-render.

            // We will use client-side filtering for better performance (no re-render)
            searchInput.addEventListener("input", (e) => {
                e.preventDefault();
                const term = e.target.value;
                this._pinSearchTerm = term;
                this._filterPins(term);
            });

            // Initial filter application (in case of re-render with existing term)
            if (this._pinSearchTerm) {
                this._filterPins(this._pinSearchTerm);
            }
        }

        // Hex Painter tab bindings
        this._bindHexPainterEvents(elem);
    }

    /**
     * Filter the pin list based on search term
     * @param {string} term
     */
    _filterPins(term) {
        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;

        const entries = elem.querySelectorAll(".pin-entry");
        const lowerTerm = term.toLowerCase();

        entries.forEach(entry => {
            const name = entry.querySelector(".pin-name")?.textContent.toLowerCase() || "";
            const page = entry.querySelector(".pin-page-name")?.textContent.toLowerCase() || "";

            if (name.includes(lowerTerm) || page.includes(lowerTerm)) {
                entry.style.display = "flex";
            } else {
                entry.style.display = "none";
            }
        });
    }

    /**
     * Update POI scale percentage display in the DOM without re-rendering
     */
    _updatePoiScaleDisplay() {
        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;
        const pct = Math.round(getPoiScale() * 100);
        elem.querySelectorAll(".poi-info-section .hex-custom-folder-hint").forEach(hint => {
            const icon = hint.querySelector("i");
            if (icon) {
                hint.textContent = "";
                hint.appendChild(icon);
                hint.append(` ${hint.closest(".decor-view") ? "Decor" : "POI"} paint on top · Scale: ${pct}%`);
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       HEX PAINTER TAB
       ═══════════════════════════════════════════════════════════════ */

    _bindHexPainterEvents(elem) {
        // Format Map toggle
        const formatBtn = elem.querySelector(".hex-format-btn");
        const formatControls = elem.querySelector(".hex-format-controls");
        if (formatBtn && formatControls) {
            formatBtn.addEventListener("click", (e) => {
                e.preventDefault();
                formatControls.classList.toggle("hidden");
            });
        }

        // Dimension sliders
        elem.querySelectorAll(".hex-slider-row input[type='range']").forEach(slider => {
            slider.addEventListener("input", (e) => {
                const val = parseInt(e.target.value);
                const display = e.target.parentElement.querySelector(".hex-slider-value");
                if (display) display.textContent = val;
                const axis = e.target.name === "hex-columns" ? "columns" : "rows";
                setMapDimension(axis, val);
            });
        });

        // Apply format button
        elem.querySelector(".hex-apply-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await formatActiveScene();
        });

        // Flatten all tiles button
        elem.querySelector(".hex-flatten-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Get all tiles on the scene
            const allTiles = canvas?.tiles?.placeables || [];
            if (allTiles.length < 2) {
                ui.notifications.warn("Need at least 2 tiles on the scene to flatten.");
                return;
            }

            // Get all tile documents
            const tileDocs = allTiles.map(p => p.document).filter(d => d);

            // Ask for confirmation
            const confirmed = await Dialog.confirm({
                title: "Flatten All Tiles",
                content: `<p>This will flatten all <strong>${tileDocs.length}</strong> tiles on the scene into a single image.</p><p>You can unflatten later from the Tile HUD.</p>`,
                yes: () => true,
                no: () => false,
                defaultYes: false
            });

            if (!confirmed) return;

            // Call the flatten function
            await flattenTiles(tileDocs);
        });

        // Search filter (client-side filtering without re-render)
        elem.querySelector(".hex-search-input")?.addEventListener("input", (e) => {
            const searchTerm = e.target.value.toLowerCase();
            setSearchFilter(searchTerm);

            // Filter flat tile thumbs (default/custom/symbols)
            const tiles = elem.querySelectorAll(".hex-tile-grid .hex-tile-thumb");
            tiles.forEach(tile => {
                const label = tile.getAttribute("title").toLowerCase();
                tile.style.display = label.includes(searchTerm) ? "" : "none";
            });

            // Filter colored tile folders: hide folders that have no visible tiles
            elem.querySelectorAll(".hex-colored-folder").forEach(folder => {
                const thumbs = folder.querySelectorAll(".hex-tile-thumb");
                let visibleCount = 0;
                thumbs.forEach(tile => {
                    const label = tile.getAttribute("title").toLowerCase();
                    const show = label.includes(searchTerm);
                    tile.style.display = show ? "" : "none";
                    if (show) visibleCount++;
                });
                folder.style.display = visibleCount > 0 ? "" : "none";
                // Update count display
                const countEl = folder.querySelector(".hex-folder-count");
                if (countEl) countEl.textContent = `(${visibleCount})`;
            });

            // Filter symbol tile folders: hide folders that have no visible tiles
            elem.querySelectorAll(".hex-symbol-folder").forEach(folder => {
                const thumbs = folder.querySelectorAll(".hex-tile-thumb");
                let visibleCount = 0;
                thumbs.forEach(tile => {
                    const label = tile.getAttribute("title").toLowerCase();
                    const show = label.includes(searchTerm);
                    tile.style.display = show ? "" : "none";
                    if (show) visibleCount++;
                });
                folder.style.display = visibleCount > 0 ? "" : "none";
                // Update count display
                const countEl = folder.querySelector(".hex-folder-count");
                if (countEl) countEl.textContent = `(${visibleCount})`;
            });
        });

        // Water effect toggle
        elem.querySelector(".hex-water-checkbox")?.addEventListener("change", (e) => {
            toggleWaterEffect();
        });

        // Wind effect toggle
        elem.querySelector(".hex-wind-checkbox")?.addEventListener("change", (e) => {
            toggleWindEffect();
        });

        // Fog animation toggle
        elem.querySelector(".hex-fog-checkbox")?.addEventListener("change", (e) => {
            toggleFogAnimation();
        });

        // Manual tint toggle
        elem.querySelector(".hex-tint-checkbox")?.addEventListener("change", (e) => {
            toggleTintEnabled();
        });

        // Black & White effect toggle
        elem.querySelector(".hex-bw-checkbox")?.addEventListener("change", (e) => {
            toggleBwEffect();
        });

        // Tile selection (multi-select) - exclude decor tiles (handled separately)
        elem.querySelectorAll(".hex-tile-thumb:not(.decor-tile-thumb)").forEach(thumb => {
            thumb.addEventListener("click", (e) => {
                e.preventDefault();
                const tilePath = thumb.dataset.tile;
                if (!tilePath) return;
                toggleTileSelection(tilePath);

                thumb.classList.toggle("active");
            });
        });

        // ── Procedural Generator ──

        // Toggle generator panel
        elem.querySelector(".hex-generator-toggle-btn")?.addEventListener("click", (e) => {
            e.preventDefault();
            const controls = elem.querySelector(".hex-generator-controls");
            if (controls) {
                controls.classList.toggle("hidden");
                // Store the expanded state so it persists across tab switches
                this._generatorExpanded = !controls.classList.contains("hidden");
            }
        });

        // Generator sliders - update display value
        elem.querySelectorAll(".hex-gen-slider-row input[type='range']").forEach(slider => {
            slider.addEventListener("input", (e) => {
                const display = e.target.parentElement.querySelector(".hex-gen-slider-value");
                if (display) display.textContent = e.target.value;
            });
        });

        // Generate button
        elem.querySelector(".hex-gen-generate-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const water = parseInt(elem.querySelector("input[name='hex-gen-water']")?.value || 0) / 100;
            const green = parseInt(elem.querySelector("input[name='hex-gen-green']")?.value || 0) / 100;
            const mountain = parseInt(elem.querySelector("input[name='hex-gen-mountain']")?.value || 0) / 100;
            const desert = parseInt(elem.querySelector("input[name='hex-gen-desert']")?.value || 0) / 100;
            const swamp = parseInt(elem.querySelector("input[name='hex-gen-swamp']")?.value || 0) / 100;
            const badlands = parseInt(elem.querySelector("input[name='hex-gen-badlands']")?.value || 0) / 100;
            const snow = parseInt(elem.querySelector("input[name='hex-gen-snow']")?.value || 0) / 100;
            const seed = elem.querySelector("input[name='hex-gen-seed']")?.value || "";

            await generateHexMap({ seed, water, green, mountain, desert, swamp, badlands, snow });
        });

        // Clear button
        elem.querySelector(".hex-gen-clear-btn")?.addEventListener("click", async (e) => {
            e.preventDefault();
            await clearGeneratedTiles();
        });

        // Tile tabs (Default / Colored / Custom)
        elem.querySelectorAll(".hex-tile-tab").forEach(tab => {
            tab.addEventListener("click", (e) => {
                e.preventDefault();
                const tabName = tab.dataset.tileTab;
                if (!tabName) return;

                setActiveTileTab(tabName);

                // Update tab active states
                elem.querySelectorAll(".hex-tile-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");

                // Show/hide tile panels
                elem.querySelectorAll("[data-tile-panel]").forEach(panel => {
                    if (panel.dataset.tilePanel === tabName) {
                        panel.classList.remove("hidden");
                    } else {
                        panel.classList.add("hidden");
                    }
                });

                // Show/hide custom size section
                const customSizeSection = elem.querySelector(".hex-custom-size-section");
                if (customSizeSection) {
                    customSizeSection.style.display = tabName === "custom" ? "" : "none";
                }

                // Enable/disable POI preview based on tab
                if (tabName === "symbols" && this._isExpanded) {
                    enablePreview();
                } else {
                    disablePreview();
                }

                // Re-render to update state properly
                renderTray();
                this._syncPoiSortPanel();
            });
        });

        // Custom tile size inputs
        elem.querySelectorAll(".hex-custom-size-input").forEach(input => {
            input.addEventListener("change", (e) => {
                const val = parseInt(e.target.value);
                const axis = e.target.name === "custom-tile-width" ? "width" : "height";
                setCustomTileDimension(axis, val);
            });
        });

        // Colored tile folder toggle (expand/collapse)
        elem.querySelectorAll(".hex-colored-folder-header").forEach(header => {
            header.addEventListener("click", (e) => {
                e.preventDefault();
                const folderKey = header.dataset.folder;
                if (!folderKey) return;

                toggleColoredFolderCollapsed(folderKey);

                // Toggle content visibility
                const folderEl = header.closest(".hex-colored-folder");
                const content = folderEl?.querySelector(".hex-colored-folder-content");
                if (content) content.classList.toggle("hidden");

                // Toggle chevron icon
                const chevron = header.querySelector(".hex-folder-chevron");
                if (chevron) {
                    chevron.classList.toggle("fa-caret-right");
                    chevron.classList.toggle("fa-caret-down");
                }

                // Toggle folder icon
                const folderIcon = header.querySelector(".hex-folder-icon");
                if (folderIcon) {
                    folderIcon.classList.toggle("fa-folder");
                    folderIcon.classList.toggle("fa-folder-open");
                }

                // Toggle header collapsed class
                header.classList.toggle("collapsed");
            });
        });

        // Symbol tile folder toggle (expand/collapse)
        elem.querySelectorAll(".hex-symbol-folder-header:not(.decor-folder-header)").forEach(header => {
            header.addEventListener("click", (e) => {
                e.preventDefault();
                const folderKey = header.dataset.folder;
                if (!folderKey) return;

                toggleSymbolFolderCollapsed(folderKey);

                // Toggle content visibility
                const folderEl = header.closest(".hex-symbol-folder");
                const content = folderEl?.querySelector(".hex-symbol-folder-content");
                if (content) content.classList.toggle("hidden");

                // Toggle chevron icon
                const chevron = header.querySelector(".hex-folder-chevron");
                if (chevron) {
                    chevron.classList.toggle("fa-caret-right");
                    chevron.classList.toggle("fa-caret-down");
                }

                // Toggle folder icon
                const folderIcon = header.querySelector(".hex-folder-icon");
                if (folderIcon) {
                    folderIcon.classList.toggle("fa-folder");
                    folderIcon.classList.toggle("fa-folder-open");
                }

                // Toggle header collapsed class
                header.classList.toggle("collapsed");
            });
        });

        /* ─── DECOR TAB ─── */

        // Decor tile selection (multi-select, same as hex-tile-thumb but for decor)
        elem.querySelectorAll(".decor-tile-thumb").forEach(thumb => {
            thumb.addEventListener("click", (e) => {
                e.preventDefault();
                const tilePath = thumb.dataset.tile;
                if (!tilePath) return;
                toggleTileSelection(tilePath);
                thumb.classList.toggle("active");
            });
        });

        // Decor search filter (client-side filtering without re-render)
        elem.querySelector(".decor-search-input")?.addEventListener("input", (e) => {
            const searchTerm = e.target.value.toLowerCase();
            setDecorSearchFilter(searchTerm);

            // Filter tiles within decor view
            const decorView = elem.querySelector(".decor-view");
            if (!decorView) return;

            decorView.querySelectorAll(".hex-symbol-folder").forEach(folder => {
                const thumbs = folder.querySelectorAll(".hex-tile-thumb");
                let visibleCount = 0;
                thumbs.forEach(tile => {
                    const label = tile.getAttribute("title").toLowerCase();
                    const show = label.includes(searchTerm);
                    tile.style.display = show ? "" : "none";
                    if (show) visibleCount++;
                });
                folder.style.display = visibleCount > 0 ? "" : "none";
                const countEl = folder.querySelector(".hex-folder-count");
                if (countEl) countEl.textContent = `(${visibleCount})`;
            });
        });

        // Decor folder toggle (expand/collapse)
        elem.querySelectorAll(".decor-folder-header").forEach(header => {
            header.addEventListener("click", (e) => {
                e.preventDefault();
                const folderKey = header.dataset.folder;
                if (!folderKey) return;

                toggleDecorFolderCollapsed(folderKey);

                // Toggle content visibility
                const folderEl = header.closest(".hex-symbol-folder");
                const content = folderEl?.querySelector(".hex-symbol-folder-content");
                if (content) content.classList.toggle("hidden");

                // Toggle chevron icon
                const chevron = header.querySelector(".hex-folder-chevron");
                if (chevron) {
                    chevron.classList.toggle("fa-caret-right");
                    chevron.classList.toggle("fa-caret-down");
                }

                // Toggle folder icon
                const folderIcon = header.querySelector(".hex-folder-icon");
                if (folderIcon) {
                    folderIcon.classList.toggle("fa-folder");
                    folderIcon.classList.toggle("fa-folder-open");
                }

                // Toggle header collapsed class
                header.classList.toggle("collapsed");
            });
        });

        // Decor elevation input
        elem.querySelector(".decor-elevation-input")?.addEventListener("change", (e) => {
            setDecorElevation(parseFloat(e.target.value) || 0);
        });

        // Decor sort input
        elem.querySelector(".decor-sort-input")?.addEventListener("change", (e) => {
            const intVal = parseInt(e.target.value, 10) || 0;
            e.target.value = intVal;
            setDecorSort(intVal);
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       TOM SCENE SWITCHER (Quick scene switching during broadcast)
       ═══════════════════════════════════════════════════════════════ */


    /**
     * Handle broadcast stop — refresh UI to hide overlay manager
     */
    onBroadcastStopped() {
        this._tomActiveSceneId = null;
        this.render();
    }

    // Cast manager button has been removed


    /**
     * Hide the Tom cast manager button
     */
    hideTomCastManager() {
        const btn = document.querySelector(".tom-cast-manager-btn");
        if (btn) btn.remove();

        const panel = document.querySelector(".tom-cast-manager-panel");
        if (panel) panel.remove();
    }




    /**
     * Toggle the overlay manager panel
     */
    async _toggleTomOverlayPanel() {
        // Close other panels first
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-overlay-manager-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Available overlays (hardcoded for now, could be made dynamic)
        const overlays = [
            { name: "Fire", file: "fire.webm" },
            { name: "Snow", file: "snow.webm" },
            { name: "Wind", file: "wind.webm" },
            { name: "Rain", file: "rain.webm" },
            { name: "Dust", file: "dust.webm" },
            { name: "Campfire", file: "campfire.webm" },
            { name: "Burning", file: "burning.webm" },
            { name: "Gold", file: "gold.webm" },
            { name: "Purple", file: "purple.webm" },
            { name: "Light", file: "light.webm" },
            { name: "Storm", file: "storm.webm" },
            { name: "Fog", file: "fog.webm" },
            { name: "Gente Snow", file: "gentlesnow.mp4" },
            { name: "Light Rain", file: "lightrain.mp4" },
            { name: "Slow Snow", file: "slowsnow.mp4" },
            { name: "Light Snow", file: "lightsnow.mp4" },
            { name: "Blue Rays", file: "bluerays.mp4" },
            { name: "Embers", file: "embers.mp4" },
            { name: "Sparks", file: "sparks.mp4" },
            { name: "Glow", file: "aurora.mp4" }

        ];

        const basePath = "modules/shadowdark-extras/assets/Tom/overlays/";

        // Get current overlay from TomStore
        const { TomStore } = await import("./data/TomStore.mjs");
        const currentOverlay = TomStore.currentOverlay;

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-overlay-manager-panel";

        // Header
        const header = document.createElement("div");
        header.className = "tom-overlay-header";
        header.innerHTML = `<span><i class="fas fa-film"></i> Video Overlays</span>`;
        panel.appendChild(header);

        // Clear overlay button
        const clearBtn = document.createElement("button");
        clearBtn.className = `tom-overlay-clear-btn ${!currentOverlay ? "disabled" : ""}`;
        clearBtn.innerHTML = '<i class="fas fa-times"></i> Clear Overlay';
        clearBtn.disabled = !currentOverlay;
        clearBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
            TomSocketHandler.emitOverlayClear();
            panel.remove();
            this._toggleTomOverlayPanel(); // Refresh panel
        });
        panel.appendChild(clearBtn);

        // Build overlay list
        const list = document.createElement("div");
        list.className = "tom-overlay-list";

        for (const overlay of overlays) {
            const overlayPath = basePath + overlay.file;
            const isActive = currentOverlay === overlayPath;

            const item = document.createElement("div");
            item.className = `tom-overlay-item ${isActive ? "active" : ""}`;
            item.dataset.path = overlayPath;

            // Preview thumbnail (use video poster or just colored box)
            const preview = document.createElement("div");
            preview.className = "tom-overlay-preview";
            preview.innerHTML = `<i class="fas fa-play"></i>`;

            // Name
            const name = document.createElement("div");
            name.className = "tom-overlay-name";
            name.textContent = overlay.name;

            // Active indicator
            if (isActive) {
                const indicator = document.createElement("div");
                indicator.className = "tom-overlay-active-indicator";
                indicator.innerHTML = '<i class="fas fa-check"></i>';
                item.appendChild(indicator);
            }

            item.appendChild(preview);
            item.appendChild(name);
            list.appendChild(item);

            // Click handler
            item.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");

                if (isActive) {
                    // Clicking active overlay clears it
                    TomSocketHandler.emitOverlayClear();
                } else {
                    // Set new overlay
                    TomSocketHandler.emitOverlaySet(overlayPath);
                }

                panel.remove();
                this._toggleTomOverlayPanel(); // Refresh panel
            });
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tray-handle-button-tool[data-action='tom-overlay-manager']");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tray-handle-button-tool[data-action='tom-overlay-manager']")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }

    /**
     * Toggle the cast manager panel
     */
    async _toggleTomCastPanel() {
        // Close other panels first
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-cast-manager-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Get Tom data from store
        const { TomStore } = await import("./data/TomStore.mjs");
        const scene = this._tomActiveSceneId ? TomStore.scenes.get(this._tomActiveSceneId) : null;
        const broadcasting = !!scene;

        // Characters are no longer managed through Tom


        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-cast-manager-panel";

        // Header — shows scene name only while broadcasting
        const header = document.createElement("div");
        header.className = "tom-cast-header";
        if (broadcasting) {
            header.innerHTML = `<span><i class="fas fa-users"></i> Manage Cast</span><span class="tom-cast-scene-name">${scene.name}</span>`;
        } else {
            header.innerHTML = `<span><i class="fas fa-users"></i> Characters</span>`;
        }
        panel.appendChild(header);

        // Character creation has been removed


        // Character list has been removed


        // Position panel next to button
        const btn = document.querySelector(".tom-cast-manager-btn");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tom-cast-manager-btn")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }

    /**
     * Refresh the cast manager panel if it is open
     */
    refreshTomCastPanel() {
        if (document.querySelector(".tom-cast-manager-panel")) {
            this._toggleTomCastPanel(); // This will close it
            this._toggleTomCastPanel(); // This will open it again (refreshing data)
        }
    }

    /**
     * Update the active scene highlight in the panel
     * @param {string} sceneId - New active scene ID
     */
    updateTomSceneSwitcher(sceneId) {
        this._tomActiveSceneId = sceneId;

        // Update highlight if panel is open
        const panel = document.querySelector(".tom-scene-switcher-panel");
        if (panel) {
            panel.querySelectorAll(".tom-switcher-scene").forEach(item => {
                item.classList.toggle("active", item.dataset.sceneId === sceneId);
            });
        }
    }

    /**
     * Toggle the scene switcher panel
     */
    async _toggleTomScenePanel() {
        // Close other panels first
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-scene-switcher-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Get Tom scenes and folders from store
        const { TomStore } = await import("./data/TomStore.mjs");
        const scenes = Array.from(TomStore.scenes.values());
        const folders = TomStore.folders || [];

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-scene-switcher-panel";

        // Create new scene button (always at top)
        const createSceneBtn = document.createElement("button");
        createSceneBtn.className = "tom-switcher-create-btn";
        createSceneBtn.innerHTML = '<i class="fas fa-plus"></i> Create new scene';
        createSceneBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            panel.remove();
            const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
            new TomSceneEditor().render(true);
        });
        panel.appendChild(createSceneBtn);

        // Create new folder button
        const createFolderBtn = document.createElement("button");
        createFolderBtn.className = "tom-switcher-create-folder-btn";
        createFolderBtn.innerHTML = '<i class="fas fa-folder-plus"></i> Create new folder';
        createFolderBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = await this._promptFolderName("Create Folder", "New Folder");
            if (!name) return;
            TomStore.createFolder(name);
            // Re-open panel to refresh
            panel.remove();
            this._toggleTomScenePanel();
        });
        panel.appendChild(createFolderBtn);

        // Stop Broadcasting button — only shown while actively broadcasting
        if (this._tomActiveSceneId) {
            const stopBtn = document.createElement("button");
            stopBtn.className = "tom-switcher-stop-btn";
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Broadcasting';
            stopBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                panel.remove();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const activeScene = TomStore.scenes.get(this._tomActiveSceneId);
                const outAnimation = activeScene?.outAnimation || 'fade';
                TomSocketHandler.emitStopBroadcast(outAnimation);
            });
            panel.appendChild(stopBtn);
        }

        // Build scene list container
        const list = document.createElement("div");
        list.className = "tom-switcher-list";

        // Helper to create a scene item element
        const createSceneItem = (scene) => {
            const item = document.createElement("div");
            item.className = `tom-switcher-scene ${scene.id === this._tomActiveSceneId ? "active" : ""}`;
            item.dataset.sceneId = scene.id;
            item.draggable = true;

            // Drag start — store scene ID
            item.addEventListener("dragstart", (e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({ type: "tom-scene", sceneId: scene.id }));
                e.dataTransfer.effectAllowed = "move";
                item.classList.add("dragging");
            });
            item.addEventListener("dragend", () => {
                item.classList.remove("dragging");
            });

            // Thumbnail
            const thumb = document.createElement("div");
            thumb.className = "tom-switcher-thumb";
            if (scene.background) {
                thumb.style.backgroundImage = `url('${scene.background}')`;
            }

            // Name
            const name = document.createElement("div");
            name.className = "tom-switcher-name";
            name.textContent = scene.name;

            // Arena tag
            if (scene.isArena) {
                const tag = document.createElement("span");
                tag.className = "tom-switcher-tag";
                tag.textContent = "Arena";
                name.appendChild(document.createElement("br"));
                name.appendChild(tag);
            }

            // Playing indicator
            if (scene.id === this._tomActiveSceneId) {
                const indicator = document.createElement("i");
                indicator.className = "fas fa-play tom-switcher-playing";
                thumb.appendChild(indicator);
            }

            // Edit / Delete action buttons
            const actions = document.createElement("div");
            actions.className = "tom-switcher-actions";

            const editBtn = document.createElement("button");
            editBtn.className = "tom-switcher-action-btn tom-switcher-action-edit";
            editBtn.title = "Edit Scene";
            editBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
            editBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                panel.remove();
                const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
                new TomSceneEditor(scene.id).render(true);
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "tom-switcher-action-btn tom-switcher-action-delete";
            deleteBtn.title = "Delete Scene";
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const confirmed = await Dialog.confirm({
                    title: "Delete Scene",
                    content: `<p>Are you sure you want to delete <strong>${scene.name}</strong>?</p><p>This action cannot be undone.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                panel.remove();
                TomStore.deleteItem(scene.id, "scene");
                ui.notifications.info(`Scene "${scene.name}" deleted.`);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(thumb);
            item.appendChild(name);
            item.appendChild(actions);

            // Click handler — broadcast scene
            item.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (scene.id === this._tomActiveSceneId) return; // Already playing

                panel.remove();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const inAnimation = scene?.inAnimation || 'fade';

                if (this._tomActiveSceneId) {
                    TomSocketHandler.emitSceneFadeTransition(scene.id);
                } else {
                    TomSocketHandler.emitBroadcastScene(scene.id, inAnimation);
                }

                this._tomActiveSceneId = scene.id;
            });

            return item;
        };

        // Helper to set up drag-drop on a folder container (accepts scenes)
        const setupFolderDrop = (dropTarget, folderId) => {
            dropTarget.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                dropTarget.classList.add("drag-over");
            });
            dropTarget.addEventListener("dragleave", (e) => {
                // Only remove if leaving the actual target, not entering a child
                if (!dropTarget.contains(e.relatedTarget)) {
                    dropTarget.classList.remove("drag-over");
                }
            });
            dropTarget.addEventListener("drop", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropTarget.classList.remove("drag-over");
                try {
                    const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                    if (data.type === "tom-scene" && data.sceneId) {
                        TomStore.moveSceneToFolder(data.sceneId, folderId);
                        // Refresh panel
                        panel.remove();
                        this._toggleTomScenePanel();
                    }
                } catch (err) { /* ignore non-scene drops */ }
            });
        };

        // Render folders with their scenes
        for (const folder of folders) {
            const folderContainer = document.createElement("div");
            folderContainer.className = "tom-switcher-folder";
            folderContainer.dataset.folderId = folder.id;

            // Folder header
            const folderHeader = document.createElement("div");
            folderHeader.className = `tom-switcher-folder-header ${folder.collapsed ? "collapsed" : ""}`;

            const folderChevron = document.createElement("i");
            folderChevron.className = `fas ${folder.collapsed ? "fa-caret-right" : "fa-caret-down"} tom-folder-chevron`;

            const folderIcon = document.createElement("i");
            folderIcon.className = `fas ${folder.collapsed ? "fa-folder" : "fa-folder-open"} tom-folder-icon`;

            const folderName = document.createElement("span");
            folderName.className = "tom-switcher-folder-name";
            folderName.textContent = folder.name;

            const folderCount = document.createElement("span");
            folderCount.className = "tom-switcher-folder-count";
            const sceneCount = TomStore.getScenesInFolder(folder.id).length;
            folderCount.textContent = `(${sceneCount})`;

            // Folder actions
            const folderActions = document.createElement("div");
            folderActions.className = "tom-switcher-folder-actions";

            const renameBtn = document.createElement("button");
            renameBtn.className = "tom-switcher-action-btn";
            renameBtn.title = "Rename Folder";
            renameBtn.innerHTML = '<i class="fas fa-pen"></i>';
            renameBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const newName = await this._promptFolderName("Rename Folder", folder.name);
                if (!newName) return;
                TomStore.renameFolder(folder.id, newName);
                panel.remove();
                this._toggleTomScenePanel();
            });

            const deleteFolderBtn = document.createElement("button");
            deleteFolderBtn.className = "tom-switcher-action-btn tom-switcher-action-delete";
            deleteFolderBtn.title = "Delete Folder";
            deleteFolderBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteFolderBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const confirmed = await Dialog.confirm({
                    title: "Delete Folder",
                    content: `<p>Delete folder <strong>${folder.name}</strong>?</p><p>Scenes inside will become uncategorized.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                TomStore.deleteFolder(folder.id);
                panel.remove();
                this._toggleTomScenePanel();
            });

            folderActions.appendChild(renameBtn);
            folderActions.appendChild(deleteFolderBtn);

            folderHeader.appendChild(folderChevron);
            folderHeader.appendChild(folderIcon);
            folderHeader.appendChild(folderName);
            folderHeader.appendChild(folderCount);
            folderHeader.appendChild(folderActions);

            // Toggle collapse on header click
            folderHeader.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                TomStore.toggleFolderCollapsed(folder.id);
                panel.remove();
                this._toggleTomScenePanel();
            });

            folderContainer.appendChild(folderHeader);

            // Folder content (scenes)
            const folderContent = document.createElement("div");
            folderContent.className = "tom-switcher-folder-content";
            if (folder.collapsed) {
                folderContent.style.display = "none";
            }

            const folderScenes = TomStore.getScenesInFolder(folder.id);
            for (const scene of folderScenes) {
                folderContent.appendChild(createSceneItem(scene));
            }

            if (folderScenes.length === 0) {
                const emptyHint = document.createElement("div");
                emptyHint.className = "tom-switcher-folder-empty";
                emptyHint.textContent = "Drag scenes here";
                folderContent.appendChild(emptyHint);
            }

            folderContainer.appendChild(folderContent);

            // Make the entire folder a drop target
            setupFolderDrop(folderContainer, folder.id);

            list.appendChild(folderContainer);
        }

        // Uncategorized scenes (no folderId)
        const uncategorized = scenes.filter(s => !s.folderId);
        if (uncategorized.length > 0 || folders.length > 0) {
            // Only show "Uncategorized" header if folders exist
            if (folders.length > 0) {
                const uncatHeader = document.createElement("div");
                uncatHeader.className = "tom-switcher-uncat-header";
                uncatHeader.textContent = "Uncategorized";
                list.appendChild(uncatHeader);
            }

            const uncatContainer = document.createElement("div");
            uncatContainer.className = "tom-switcher-uncat-container";

            for (const scene of uncategorized) {
                uncatContainer.appendChild(createSceneItem(scene));
            }

            // Uncategorized is also a drop target (to remove from folder)
            setupFolderDrop(uncatContainer, null);

            list.appendChild(uncatContainer);
        }

        // If no scenes at all
        if (scenes.length === 0 && folders.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tom-switcher-empty";
            empty.textContent = "Click above to create a new Scene";
            list.appendChild(empty);
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tray-handle-button-tool[data-action='tom-scene-switcher']");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tray-handle-button-tool[data-action='tom-scene-switcher']")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }

    /**
     * Prompt user for a folder name via a simple dialog
     * @param {string} title - Dialog title
     * @param {string} defaultName - Default name
     * @returns {Promise<string|null>} The entered name, or null if cancelled
     */
    async _promptFolderName(title, defaultName = "") {
        return new Promise((resolve) => {
            new Dialog({
                title,
                content: `<div class="form-group"><label>Folder Name</label><input type="text" name="folderName" value="${defaultName}" autofocus></div>`,
                buttons: {
                    ok: {
                        icon: '<i class="fas fa-check"></i>',
                        label: "OK",
                        callback: (html) => {
                            const name = html.find('[name="folderName"]').val()?.trim();
                            resolve(name || null);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Cancel",
                        callback: () => resolve(null)
                    }
                },
                default: "ok",
                render: (html) => {
                    // Auto-select text in input
                    html.find('[name="folderName"]').select();
                }
            }).render(true);
        });
    }
}

// Register Handlebars helpers for the tray
Hooks.once("init", () => {
    // Helper to check equality
    Handlebars.registerHelper("eq", function (a, b) {
        return a === b;
    });

    // Helper for health overlay height
    Handlebars.registerHelper("healthOverlayHeight", function (hp) {
        return getHealthOverlayHeight(hp);
    });

    // Helper for multiplication
    Handlebars.registerHelper("multiply", function (a, b) {
        return (a || 0) * (b || 0);
    });

    // Helper for division
    Handlebars.registerHelper("divide", function (a, b) {
        if (!b || b === 0) return 0;
        return (a || 0) / b;
    });

    // Helper to check if value is in array
    Handlebars.registerHelper("includes", function (arr, value) {
        if (!Array.isArray(arr)) return false;
        return arr.includes(value);
    });

    // Helper for default values
    Handlebars.registerHelper("default", function (value, defaultValue) {
        return value ?? defaultValue;
    });

    // Helper for logical NOT
    Handlebars.registerHelper("not", function (value) {
        return !value;
    });

    // Helper for logical OR
    Handlebars.registerHelper("or", function (...args) {
        // Remove the Handlebars options object from the end
        args.pop();
        return args.some(Boolean);
    });

    // Helper for logical AND
    Handlebars.registerHelper("and", function (...args) {
        // Remove the Handlebars options object from the end
        args.pop();
        return args.every(Boolean);
    });
});
