import { cache } from "./SDXCache.mjs";
/**
 * SDX Dungeon Painter - Room/Dungeon mapping tool
 * Paints floor tiles, auto-generates walls and wall visuals, and supports doors
 * Supports player painting via socket when GM is online
 */

const MODULE_ID = "shadowdark-extras";
const FLOOR_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/floor_tiles`;
const WALL_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/wall_tiles`;
const DOOR_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/door_tiles`;
const BG_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/backgrounds`;

// Grid size for dungeon tiles (matches scene grid)
const GRID_SIZE = 100;
const WALL_THICKNESS = 20;

// State
let _floorTiles = null;
let _wallTiles = null;
let _doorTiles = null;
let _selectedFloorTile = null;
let _selectedWallTile = null;
let _selectedDoorTile = null;
let _dungeonMode = "tiles"; // "tiles", "intwalls", or "doors"
let _paintEnabled = false;
let _isDragging = false;
let _dragStart = null;
let _isShiftHeld = false;
let _selectionRect = null;
let _rebuildTimeout = null;
let _noFoundryWalls = false; // Toggle to skip creating Foundry wall documents (but keep visuals)
let _wallShadows = false; // Toggle to apply TokenMagic dropshadow2 to wall drawings
let _selectedIntWallTile = null; // Selected tile for interior wall placement
let _selectedIntDoorTile = null; // Selected door tile for interior wall door cutting
let _backgroundTiles = null;
let _selectedBackground = "none";

// Socket reference for player -> GM communication
let _dungeonSocket = null;

/**
 * Get current elevation from Levels module if available
 * Checks various Levels module APIs to find the currently selected elevation
 */
export function getCurrentElevation() {
    try {
        // Check if Levels is active
        if (game.modules.get("levels")?.active) {
            // Try CONFIG.Levels.currentElevation (some versions)
            if (typeof CONFIG.Levels?.currentElevation === "number") {
                return CONFIG.Levels.currentElevation;
            }

            // Try CONFIG.Levels.UI.currentRange (Levels 3D Layer Tool)
            if (Array.isArray(CONFIG.Levels?.UI?.currentRange) && CONFIG.Levels.UI.currentRange.length >= 1) {
                return CONFIG.Levels.UI.currentRange[0];
            }

            // Try ui.levels (Levels Layer Tool application)
            if (typeof ui.levels?.currentElevation === "number") {
                return ui.levels.currentElevation;
            }
            if (typeof ui.levels?._currentFloor === "number") {
                return ui.levels._currentFloor;
            }

            // Try getting from Levels' internal state
            if (typeof _levels?.currentElevation === "number") {
                return _levels.currentElevation;
            }

            // Try scene flags
            const sceneFlags = canvas.scene?.flags?.levels;
            if (typeof sceneFlags?.currentElevation === "number") {
                return sceneFlags.currentElevation;
            }

            // Try game settings for Levels
            try {
                const levelsFloor = game.settings.get("levels", "currentFloor");
                if (typeof levelsFloor === "number") {
                    return levelsFloor;
                }
            } catch (e) { /* Setting doesn't exist */ }

            // Try accessing Levels Layer Tool's UI element directly
            const levelsToolApp = Object.values(ui.windows).find(w =>
                w.constructor?.name?.includes("Levels") || w.title?.includes("Levels")
            );
            if (levelsToolApp) {
                // Try to find the current floor value from the app
                if (typeof levelsToolApp.currentElevation === "number") {
                    return levelsToolApp.currentElevation;
                }
                if (typeof levelsToolApp._currentFloor === "number") {
                    return levelsToolApp._currentFloor;
                }
                // Check for elevation in the app's data
                if (typeof levelsToolApp.object?.elevation === "number") {
                    return levelsToolApp.object.elevation;
                }
            }
        }

        // Check for Wall Height module compatibility
        if (game.modules.get("wall-height")?.active) {
            if (typeof CONFIG["wall-height"]?.currentElevation === "number") {
                return CONFIG["wall-height"].currentElevation;
            }
        }

        // Try getting elevation from currently controlled/hovered placeable
        const controlledTile = canvas.tiles?.controlled?.[0];
        if (controlledTile?.document?.elevation !== undefined) {
            return controlledTile.document.elevation;
        }

        // Last resort: check if there's a Levels-related flag in the scene's current state
        if (canvas.scene?.flags?.["levels-3d-preview"]?.currentFloor !== undefined) {
            return canvas.scene.flags["levels-3d-preview"].currentFloor;
        }

    } catch (e) {
        console.warn(`${MODULE_ID} | Could not get current elevation from Levels:`, e);
    }

    // Default to 0 if we can't determine the current elevation
    return 0;
}

/**
 * Initialize socket for player dungeon painting
 * Called from main module ready hook
 */
export function initDungeonSocket() {
    // Register socketlib socket if available
    if (game.modules.get("socketlib")?.active) {
        _dungeonSocket = socketlib.registerModule(MODULE_ID);

        // Register GM-side handlers
        _dungeonSocket.register("dungeonFillRectangle", _gmFillRectangle);
        _dungeonSocket.register("dungeonDeleteRectangle", _gmDeleteRectangle);
        _dungeonSocket.register("dungeonPlaceDoor", _gmPlaceDoor);
        _dungeonSocket.register("dungeonRemoveDoor", _gmRemoveDoor);
        _dungeonSocket.register("dungeonRebuildWalls", _gmRebuildWalls);
        _dungeonSocket.register("dungeonGetTileList", _gmGetTileList);

        console.log(`${MODULE_ID} | Dungeon Painter socket initialized`);
    } else {
        console.log(`${MODULE_ID} | socketlib not found, player dungeon painting disabled`);
    }
}

/**
 * GM handler: Return tile list to players
 */
function _gmGetTileList() {
    return {
        floorTiles: _floorTiles || [],
        wallTiles: _wallTiles || [],
        doorTiles: _doorTiles || [],
        backgroundTiles: _backgroundTiles || []
    };
}

/**
 * Check if a GM is online
 */
export function isGMOnline() {
    return game.users.some(u => u.isGM && u.active);
}

/**
 * Check if player can use dungeon painter (GM online + socket available)
 */
export function canPlayerPaint() {
    return !game.user.isGM && isGMOnline() && _dungeonSocket !== null;
}

/**
 * Load dungeon tile assets
 */
export async function loadDungeonAssets() {
    if (_floorTiles) return;

    // Try to load from cache first
    const metadataKey = `dungeon_tiles_metadata`;
    const cachedMetadata = await cache.getMetadata(metadataKey);

    if (cachedMetadata) {
        _floorTiles = cachedMetadata.floorTiles || [];
        _wallTiles = cachedMetadata.wallTiles || [];
        _doorTiles = cachedMetadata.doorTiles || [];
        _backgroundTiles = cachedMetadata.backgroundTiles || [];

        // Always re-scan backgrounds from folder for GM (small folder, may have new images)
        if (game.user.isGM) {
            const freshBg = await loadTilesFromFolder(BG_TILE_FOLDER, "background");
            if (freshBg.length !== _backgroundTiles.length ||
                freshBg.some((t, i) => t.path !== _backgroundTiles[i]?.path)) {
                _backgroundTiles = freshBg;
                await cache.setMetadata(metadataKey, {
                    floorTiles: _floorTiles,
                    wallTiles: _wallTiles,
                    doorTiles: _doorTiles,
                    backgroundTiles: _backgroundTiles
                });
            }
        }
    } else if (game.user.isGM) {
        // Ensure folder structure exists
        await ensureDungeonFolders();

        // Load floor tiles
        _floorTiles = await loadTilesFromFolder(FLOOR_TILE_FOLDER, "floor");

        // Load wall tiles
        _wallTiles = await loadTilesFromFolder(WALL_TILE_FOLDER, "wall");

        // Load door tiles
        _doorTiles = await loadTilesFromFolder(DOOR_TILE_FOLDER, "door");

        // Load background tiles
        _backgroundTiles = await loadTilesFromFolder(BG_TILE_FOLDER, "background");

        // Save to cache
        await cache.setMetadata(metadataKey, {
            floorTiles: _floorTiles,
            wallTiles: _wallTiles,
            doorTiles: _doorTiles,
            backgroundTiles: _backgroundTiles
        });
    }

    // If player couldn't load tiles (no browse permission), request from GM
    if (!game.user.isGM && (!_floorTiles || _floorTiles.length === 0) && _dungeonSocket && isGMOnline()) {
        console.log(`${MODULE_ID} | Player requesting tile list from GM...`);
        try {
            const tileData = await _dungeonSocket.executeAsGM("dungeonGetTileList");
            if (tileData) {
                _floorTiles = tileData.floorTiles || [];
                _wallTiles = tileData.wallTiles || [];
                _doorTiles = tileData.doorTiles || [];
                _backgroundTiles = tileData.backgroundTiles || [];
                console.log(`${MODULE_ID} | Received tile list from GM: ${_floorTiles.length} floor, ${_wallTiles.length} wall, ${_doorTiles.length} door tiles`);
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Failed to get tile list from GM:`, err);
        }
    }

    // Select first floor tile by default
    if (_floorTiles.length > 0 && !_selectedFloorTile) {
        _selectedFloorTile = _floorTiles[0].path;
    }

    // Select wall tile by default (prefer dyson)
    if (_wallTiles.length > 0 && !_selectedWallTile) {
        const dysonTile = _wallTiles.find(t => t.key.toLowerCase().includes("dyson"));
        _selectedWallTile = dysonTile ? dysonTile.path : _wallTiles[0].path;
    }

    // Select door tile by default (prefer B&W-Portal-01)
    if (_doorTiles.length > 0 && !_selectedDoorTile) {
        const portalTile = _doorTiles.find(t => t.key.toLowerCase().includes("portal-01"));
        _selectedDoorTile = portalTile ? portalTile.path : _doorTiles[0].path;
    }

    console.log(`${MODULE_ID} | Loaded ${_floorTiles.length} floor tiles, ${_wallTiles.length} wall tiles, ${_doorTiles.length} door tiles, ${(_backgroundTiles || []).length} background tiles`);

    // Start background preloading of images into binary cache
    preloadDungeonImages();
}

/**
 * Background preloading of images into IndexedDB
 */
async function preloadDungeonImages() {
    const allTiles = [
        ...(_floorTiles || []),
        ...(_wallTiles || []),
        ...(_doorTiles || []),
        ...(_backgroundTiles || [])
    ];

    // Preload process: fetch image and store as blob in cache if not already there
    for (const tile of allTiles) {
        try {
            const cached = await cache.getBinary(tile.path);
            if (!cached) {
                const response = await fetch(tile.path);
                if (response.ok) {
                    const blob = await response.blob();
                    await cache.setBinary(tile.path, blob);
                }
            }
        } catch (err) {
            // Silently fail preloads
        }
    }
}

/**
 * Reload tile assets (for players when GM comes online)
 */
export async function reloadDungeonAssets() {
    _floorTiles = null;
    _wallTiles = null;
    _doorTiles = null;
    _backgroundTiles = null;
    _selectedFloorTile = null;
    _selectedWallTile = null;
    _selectedDoorTile = null;
    // Clear cached metadata so loadDungeonAssets re-scans folders
    await cache.setMetadata("dungeon_tiles_metadata", null);
    await loadDungeonAssets();
}

/**
 * Ensure dungeon asset folders exist
 */
async function ensureDungeonFolders() {
    const basePath = `modules/${MODULE_ID}/assets/Dungeon`;
    const folders = ["floor_tiles", "wall_tiles", "door_tiles", "backgrounds"];

    for (const folder of folders) {
        try {
            await FilePicker.browse("data", `${basePath}/${folder}`);
        } catch (e) {
            // Folder doesn't exist - that's ok, assets may not be installed yet
        }
    }
}

/**
 * Load tiles from a folder
 */
async function loadTilesFromFolder(folderPath, type) {
    const tiles = [];

    try {
        const listing = await FilePicker.browse("data", folderPath);
        const imageFiles = (listing.files || []).filter(f =>
            f.endsWith(".png") || f.endsWith(".webp") || f.endsWith(".jpg")
        );

        for (const path of imageFiles) {
            const filename = path.split("/").pop().replace(/\.(png|webp|jpg)$/, "");
            tiles.push({
                key: filename,
                label: formatLabel(filename),
                path,
                type
            });
        }

        tiles.sort((a, b) => a.key.localeCompare(b.key));
    } catch (err) {
        console.warn(`${MODULE_ID} | Could not load ${type} tiles from ${folderPath}:`, err);
    }

    return tiles;
}

/**
 * Format a filename into a display label
 */
function formatLabel(key) {
    return key
        .replace(/_/g, " ")
        .replace(/-/g, " ")
        .split(" ")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/**
 * Get dungeon painter data for template
 */
/**
 * Get dungeon painter data for template
 */
export async function getDungeonPainterData() {
    // Helper to process tiles with caching
    const processTiles = async (tiles, selectedPath) => {
        if (!tiles) return [];
        return Promise.all(tiles.map(async t => ({
            ...t,
            src: await cache.getCachedSrc(t.path),
            active: t.path === selectedPath
        })));
    };

    // Filter and process wall tiles
    // The code will automatically use vertical variants for vertical walls
    const wallTilesList = (_wallTiles || [])
        .filter(t => !t.key.toLowerCase().includes("vertical"));

    const displayWallTiles = await Promise.all(wallTilesList.map(async t => ({
        ...t,
        // Clean up the label to remove "horizontal" suffix
        label: t.label.replace(/\s*horizontal\s*/i, "").trim(),
        src: await cache.getCachedSrc(t.path),
        active: t.path === _selectedWallTile ||
            t.path === _selectedWallTile?.replace("vertical", "horizontal")
    })));

    // Build background options
    const backgroundOptions = [
        { value: "none", label: "None", active: _selectedBackground === "none" },
        { value: "color-black", label: "Black", active: _selectedBackground === "color-black" },
        { value: "color-white", label: "White", active: _selectedBackground === "color-white" },
        { value: "color-gray", label: "Gray", active: _selectedBackground === "color-gray" }
    ];
    for (const bg of (_backgroundTiles || [])) {
        backgroundOptions.push({
            value: bg.path,
            label: bg.label,
            active: _selectedBackground === bg.path
        });
    }

    const floorTiles = await processTiles(_floorTiles, _selectedFloorTile);
    const doorTiles = await processTiles(_doorTiles, _selectedDoorTile);
    const horizontalWallTiles = (_wallTiles || []).filter(t => !t.key.toLowerCase().includes("vertical"));
    const intWallTiles = await processTiles(horizontalWallTiles, _selectedIntWallTile);
    const intDoorTiles = await processTiles(_doorTiles, _selectedIntDoorTile);

    return {
        dungeonMode: _dungeonMode,
        floorTiles,
        wallTiles: displayWallTiles,
        intWallTiles,
        intDoorTiles,
        hasIntDoorTiles: (intDoorTiles.length > 0),
        doorTiles,
        selectedFloorTile: _selectedFloorTile,
        selectedWallTile: _selectedWallTile,
        selectedDoorTile: _selectedDoorTile,
        selectedIntWallTile: _selectedIntWallTile,
        hasFloorTiles: (floorTiles.length > 0),
        hasWallTiles: (displayWallTiles.length > 0),
        hasDoorTiles: (doorTiles.length > 0),
        noFoundryWalls: _noFoundryWalls,
        wallShadows: _wallShadows,
        backgroundOptions,
        selectedBackground: _selectedBackground,
        canPlayerPaint: canPlayerPaint(),
        isGMOnline: isGMOnline()
    };
}

/**
 * Set dungeon mode
 */
export function setDungeonMode(mode) {
    if (mode === "tiles" || mode === "doors" || mode === "intwalls") {
        _dungeonMode = mode;
    }
}

/**
 * Get current dungeon mode
 */
export function getDungeonMode() {
    return _dungeonMode;
}

/**
 * Select a floor tile
 */
export function selectFloorTile(tilePath) {
    _selectedFloorTile = tilePath;
}

/**
 * Select a wall tile
 */
export function selectWallTile(tilePath) {
    _selectedWallTile = tilePath;
}

/**
 * Select a door tile
 */
export function selectDoorTile(tilePath) {
    _selectedDoorTile = tilePath;
}

/**
 * Get selected floor tile path
 */
export function getSelectedFloorTile() {
    return _selectedFloorTile;
}

/**
 * Get selected wall tile path
 */
export function getSelectedWallTile() {
    return _selectedWallTile;
}

/**
 * Get selected door tile path
 */
export function getSelectedDoorTile() {
    return _selectedDoorTile;
}

/**
 * Get loaded door tiles array
 */
export function getDoorTiles() {
    return _doorTiles || [];
}

/**
 * Set whether to skip creating Foundry walls (visuals only)
 */
export function setNoFoundryWalls(value) {
    _noFoundryWalls = !!value;
}

/**
 * Get whether Foundry walls are disabled
 */
export function getNoFoundryWalls() {
    return _noFoundryWalls;
}

/**
 * Set whether to apply wall shadows (TokenMagic dropshadow2) to wall drawings
 */
export function setWallShadows(value) {
    _wallShadows = !!value;
}

/**
 * Get whether wall shadows are enabled
 */
export function getWallShadows() {
    return _wallShadows;
}

/**
 * Select an interior wall tile
 */
export function selectIntWallTile(path) {
    _selectedIntWallTile = path || null;
}

/**
 * Get the selected interior wall tile path
 */
export function getSelectedIntWallTile() {
    return _selectedIntWallTile;
}

/**
 * Select a door tile for interior wall door cutting
 */
export function selectIntDoorTile(path) {
    _selectedIntDoorTile = path || null;
}

/**
 * Get the selected interior door tile path
 */
export function getSelectedIntDoorTile() {
    return _selectedIntDoorTile;
}

/**
 * Set dungeon background selection
 */
export function setDungeonBackground(value) {
    _selectedBackground = value;
}

/**
 * Get dungeon background selection
 */
export function getDungeonBackground() {
    return _selectedBackground;
}

/**
 * Enable dungeon painting
 */
export function enableDungeonPainting() {
    _paintEnabled = true;
}

/**
 * Disable dungeon painting
 */
export function disableDungeonPainting() {
    _paintEnabled = false;
    _isDragging = false;
    _dragStart = null;
    destroySelectionRect();
}

/**
 * Check if dungeon painting is enabled
 */
export function isDungeonPainting() {
    return _paintEnabled;
}

/**
 * Clean up dungeon painting state (called on scene change)
 */
export function cleanupDungeonPainting() {
    _isDragging = false;
    _dragStart = null;
    destroySelectionRect();
}

/**
 * Bind canvas events for dungeon painting
 */
export function bindDungeonCanvasEvents() {
    if (!canvas.stage) return;

    // Clean up any existing state first
    cleanupDungeonPainting();

    // Remove existing handlers
    canvas.stage.off("pointerdown", onPointerDown);
    canvas.stage.off("pointermove", onPointerMove);
    canvas.stage.off("pointerup", onPointerUp);
    canvas.stage.off("pointerupoutside", onPointerUpOutside);

    // Add handlers
    canvas.stage.on("pointerdown", onPointerDown);
    canvas.stage.on("pointermove", onPointerMove);
    canvas.stage.on("pointerup", onPointerUp);
    canvas.stage.on("pointerupoutside", onPointerUpOutside);
}

/**
 * Handle pointer down
 */
function onPointerDown(event) {
    if (!_paintEnabled) return;

    // Only handle left mouse button
    if (event.data?.originalEvent?.button !== 0) return;

    _isDragging = true;
    _isShiftHeld = event.data?.originalEvent?.shiftKey || false;

    const pos = event.data?.getLocalPosition(canvas.stage);
    _dragStart = { x: pos.x, y: pos.y };

    // Create selection rectangle for visual feedback
    if (_dungeonMode === "tiles" || (_dungeonMode === "doors" && _isShiftHeld) || _dungeonMode === "intwalls") {
        createSelectionRect();
    }
}

/**
 * Handle pointer move
 */
function onPointerMove(event) {
    if (!_paintEnabled || !_isDragging || !_dragStart) return;

    // Safety check - make sure canvas is still valid
    if (!canvas?.stage || !canvas?.interface) return;

    // Only show rectangle in tiles mode or doors+shift (delete)
    if (_dungeonMode === "tiles" || (_dungeonMode === "doors" && _isShiftHeld)) {
        const pos = event.data?.getLocalPosition(canvas.stage);
        if (pos) {
            updateSelectionRect(_dragStart, pos, _isShiftHeld);
        }
    } else if (_dungeonMode === "intwalls") {
        const pos = event.data?.getLocalPosition(canvas.stage);
        if (pos) {
            updateIntWallLine(_dragStart, pos);
        }
    }
}

/**
 * Handle pointer up
 */
function onPointerUp(event) {
    clearSelectionRect();

    if (!_paintEnabled || !_isDragging) return;

    _isDragging = false;

    // Safety check - make sure canvas is still valid
    if (!canvas?.stage) {
        _dragStart = null;
        return;
    }

    const pos = event.data?.getLocalPosition(canvas.stage);
    if (!pos) {
        _dragStart = null;
        return;
    }
    const endPos = { x: pos.x, y: pos.y };

    const deleteMode = _isShiftHeld || event.data?.originalEvent?.shiftKey;

    // Detect click vs drag
    const dx = Math.abs(endPos.x - _dragStart.x);
    const dy = Math.abs(endPos.y - _dragStart.y);
    const isClick = dx < 10 && dy < 10;

    if (_dungeonMode === "doors") {
        if (isClick) {
            handleDoorClick(event, deleteMode);
        } else if (deleteMode) {
            handleRectangleDelete(_dragStart, endPos, true);
        }
    } else if (_dungeonMode === "intwalls") {
        if (isClick) {
            if (deleteMode) {
                handleIntWallDoorRemove(endPos);
            } else if (_selectedIntDoorTile) {
                handleIntWallClick(endPos);
            }
        } else {
            handleIntWallDrag(_dragStart, endPos);
        }
    } else {
        handleRectangleFill(_dragStart, endPos, deleteMode);
    }

    _dragStart = null;
}

/**
 * Handle pointer up outside canvas
 */
function onPointerUpOutside(event) {
    destroySelectionRect();
    _isDragging = false;
    _dragStart = null;
}

/**
 * Create selection rectangle overlay
 */
function createSelectionRect() {
    if (_selectionRect) return;

    // Safety check - canvas must be ready
    if (!canvas?.interface) return;

    _selectionRect = new PIXI.Graphics();
    canvas.interface.addChild(_selectionRect);

    // Dimensions label
    const style = new PIXI.TextStyle({
        fontFamily: "Arial",
        fontSize: 18,
        fontWeight: "bold",
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    });
    const label = new PIXI.Text("", style);
    label.name = "dimensionsLabel";
    label.visible = false;
    _selectionRect.addChild(label);
}

/**
 * Update selection rectangle
 */
function updateSelectionRect(start, end, isDelete) {
    if (!_selectionRect) createSelectionRect();

    // Safety check - if selection rect couldn't be created or was destroyed
    if (!_selectionRect || _selectionRect.destroyed) return;

    const gridSize = canvas?.grid?.size || GRID_SIZE;

    // Calculate grid range
    const minX = Math.min(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxX = Math.max(start.x, end.x);
    const maxY = Math.max(start.y, end.y);

    const minGx = Math.floor(minX / gridSize);
    const minGy = Math.floor(minY / gridSize);
    const maxGx = Math.floor(maxX / gridSize);
    const maxGy = Math.floor(maxY / gridSize);

    const fillColor = isDelete ? 0xFF4444 : 0x44FF44;
    const strokeColor = isDelete ? 0xCC0000 : 0x00CC00;

    _selectionRect.clear();
    _selectionRect.lineStyle(2, strokeColor, 0.8);
    _selectionRect.beginFill(fillColor, 0.25);

    for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
            _selectionRect.drawRect(gx * gridSize, gy * gridSize, gridSize, gridSize);
        }
    }

    _selectionRect.endFill();

    // Update label
    const label = _selectionRect.getChildByName("dimensionsLabel");
    if (label) {
        const w = maxGx - minGx + 1;
        const h = maxGy - minGy + 1;
        label.text = `${w} x ${h}`;
        label.style.fill = isDelete ? "#ffcccc" : "#ccffcc";

        const zoom = canvas.stage.scale.x;
        const inverseScale = 1 / zoom;
        label.scale.set(inverseScale);

        const offsetX = 20 * inverseScale;
        const offsetY = 20 * inverseScale;
        label.position.set(end.x + offsetX, end.y + offsetY);
        label.visible = true;
    }
}

/**
 * Clear selection rectangle
 */
function clearSelectionRect() {
    if (_selectionRect && !_selectionRect.destroyed) {
        _selectionRect.clear();
        const label = _selectionRect.getChildByName("dimensionsLabel");
        if (label) label.visible = false;
    }
}

/**
 * Draw a line preview for interior wall drag
 */
function updateIntWallLine(start, end) {
    if (!_selectionRect) createSelectionRect();
    if (!_selectionRect || _selectionRect.destroyed) return;

    _selectionRect.clear();
    _selectionRect.lineStyle(3, 0xFFA500, 0.9);
    _selectionRect.moveTo(start.x, start.y);
    _selectionRect.lineTo(end.x, end.y);
    _selectionRect.beginFill(0xFFA500, 1);
    _selectionRect.drawCircle(start.x, start.y, 5);
    _selectionRect.drawCircle(end.x, end.y, 5);
    _selectionRect.endFill();
}

/**
 * Handle interior wall drag — creates a rotated Drawing + optional Foundry wall
 */
async function handleIntWallDrag(startPos, endPos) {
    if (!game.user.isGM) return; // GM only for now

    if (!_selectedIntWallTile) {
        ui.notifications.warn("Select an interior wall tile first.");
        return;
    }

    const scene = canvas.scene;
    if (!scene) return;

    const x1 = startPos.x;
    const y1 = startPos.y;
    const x2 = endPos.x;
    const y2 = endPos.y;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 5) return;

    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;

    const elevation = getCurrentElevation();
    const levelsActive = game.modules.get("levels")?.active;
    const wallHeightTop = elevation + 9; // LEVEL_HEIGHT - 1

    // Rectangle x,y is top-left before rotation (rotation around center)
    const drawX = cx - length / 2;
    const drawY = cy - WALL_THICKNESS / 2;

    const drawingData = {
        author: game.user.id,
        x: drawX,
        y: drawY,
        rotation: angle,
        shape: { type: "r", width: length, height: WALL_THICKNESS },
        strokeWidth: 0,
        strokeAlpha: 0,
        fillType: 2,
        fillColor: "#ffffff",
        fillAlpha: 1.0,
        texture: _selectedIntWallTile,
        elevation,
        flags: {
            [MODULE_ID]: { dungeonWall: true, dungeonIntWall: true },
            levels: { rangeTop: wallHeightTop }
        }
    };

    const created = await scene.createEmbeddedDocuments("Drawing", [drawingData]);

    if (created?.length > 0) {
        // Update elevation post-creation to bypass Levels hooks
        await scene.updateEmbeddedDocuments("Drawing", [{
            _id: created[0].id,
            elevation,
            "flags.levels.rangeTop": wallHeightTop
        }]);

        // Apply wall shadows if enabled
        if (_wallShadows && window.TokenMagic) {
            const shadowParams = [{
                filterType: "shadow", filterId: "dropshadow2",
                rotation: 0, distance: 0, color: 0x000000, alpha: 1,
                shadowOnly: false, blur: 5, quality: 5, padding: 20
            }];
            try { await TokenMagic.addUpdateFilters(created[0], shadowParams); } catch (_) {}
        }
    }

    // Create a single Foundry wall along the drag line if enabled
    if (!_noFoundryWalls) {
        const wallData = {
            c: [x1, y1, x2, y2],
            flags: {
                [MODULE_ID]: { dungeonGenWall: true, dungeonIntWall: true },
                ...(levelsActive ? { "wall-height": { bottom: elevation, top: wallHeightTop } } : {})
            }
        };
        await scene.createEmbeddedDocuments("Wall", [wallData]);
    }
}

/**
 * Handle click on an interior wall drawing to cut it and insert a door
 */
async function handleIntWallClick(clickPos) {
    if (!game.user.isGM) return;
    if (!_selectedIntDoorTile) return;

    const scene = canvas.scene;
    if (!scene) return;

    const gridSize = canvas.grid.size || GRID_SIZE;
    const clickX = clickPos.x;
    const clickY = clickPos.y;

    // Find the int wall drawing that was clicked (not doors, not already-door drawings)
    let hitDrawing = null;
    let hitT = 0; // projection from drawing center along wall axis (local x)
    const clickTolerance = 25;

    for (const d of scene.drawings) {
        if (!d.flags?.[MODULE_ID]?.dungeonIntWall) continue;
        if (d.flags?.[MODULE_ID]?.dungeonIntDoor) continue; // skip existing door drawings
        if (d.shape?.type !== "r") continue;

        const theta = (d.rotation || 0) * Math.PI / 180;
        const hw = d.shape.width / 2;
        const hh = (d.shape.height ?? WALL_THICKNESS) / 2;
        const cx = d.x + hw;
        const cy = d.y + hh;

        // Transform click into local (unrotated) space around drawing center
        const dx = clickX - cx;
        const dy = clickY - cy;
        const cosT = Math.cos(-theta);
        const sinT = Math.sin(-theta);
        const lx = dx * cosT - dy * sinT;
        const ly = dx * sinT + dy * cosT;

        if (Math.abs(lx) <= hw + clickTolerance && Math.abs(ly) <= hh + clickTolerance) {
            hitDrawing = d;
            hitT = lx; // local x = projection along axis from center
            break;
        }
    }

    if (!hitDrawing) {
        ui.notifications.warn("Click on an interior wall to insert a door.");
        return;
    }

    const theta = (hitDrawing.rotation || 0) * Math.PI / 180;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);
    const hw = hitDrawing.shape.width / 2;
    const cx = hitDrawing.x + hw;
    const cy = hitDrawing.y + (hitDrawing.shape.height ?? WALL_THICKNESS) / 2;

    const doorHalfWidth = gridSize / 2; // 50px for a 100px grid

    if (hw < doorHalfWidth) {
        ui.notifications.warn("Interior wall is too short to insert a door.");
        return;
    }

    // Clamp projection so door stays fully inside the wall
    const tClamped = Math.max(-hw + doorHalfWidth, Math.min(hw - doorHalfWidth, hitT));

    const leftLen = tClamped - doorHalfWidth + hw;   // wall start → door start
    const rightLen = hw - (tClamped + doorHalfWidth); // door end → wall end

    // Wall axis endpoints
    const p1x = cx - hw * ux;
    const p1y = cy - hw * uy;
    const p2x = cx + hw * ux;
    const p2y = cy + hw * uy;

    // Door gap endpoints
    const dsx = cx + (tClamped - doorHalfWidth) * ux;
    const dsy = cy + (tClamped - doorHalfWidth) * uy;
    const dex = cx + (tClamped + doorHalfWidth) * ux;
    const dey = cy + (tClamped + doorHalfWidth) * uy;

    const elevation = hitDrawing.elevation ?? 0;
    const levelsActive = game.modules.get("levels")?.active;
    const wallHeightTop = elevation + 9;

    // Choose door texture variant based on wall orientation
    const normalizedAngle = ((hitDrawing.rotation || 0) % 180 + 180) % 180;
    const isHorizontalWall = normalizedAngle < 45 || normalizedAngle > 135;
    let doorTexture = _selectedIntDoorTile;
    if (doorTexture) {
        if (isHorizontalWall && !doorTexture.toLowerCase().includes("horizontal")) {
            const hVariant = doorTexture.replace(/vertical/i, "horizontal");
            if (_doorTiles?.find(t => t.path === hVariant)) doorTexture = hVariant;
        } else if (!isHorizontalWall && !doorTexture.toLowerCase().includes("vertical")) {
            const vVariant = doorTexture.replace(/horizontal/i, "vertical");
            if (_doorTiles?.find(t => t.path === vVariant)) doorTexture = vVariant;
        }
    }

    // Delete original int wall drawing
    await scene.deleteEmbeddedDocuments("Drawing", [hitDrawing.id]);

    // Find and delete the matching int wall Foundry wall
    const wTol = 30;
    const matchingWall = scene.walls.find(w => {
        if (!w.flags?.[MODULE_ID]?.dungeonIntWall) return false;
        if (w.door && w.door > 0) return false;
        const [wx1, wy1, wx2, wy2] = w.c;
        return (
            (Math.abs(wx1 - p1x) < wTol && Math.abs(wy1 - p1y) < wTol &&
             Math.abs(wx2 - p2x) < wTol && Math.abs(wy2 - p2y) < wTol) ||
            (Math.abs(wx1 - p2x) < wTol && Math.abs(wy1 - p2y) < wTol &&
             Math.abs(wx2 - p1x) < wTol && Math.abs(wy2 - p1y) < wTol)
        );
    });
    if (matchingWall) {
        await scene.deleteEmbeddedDocuments("Wall", [matchingWall.id]);
    }

    const wallTexture = hitDrawing.texture || _selectedIntWallTile;
    const baseDrawingData = {
        author: game.user.id,
        rotation: hitDrawing.rotation || 0,
        strokeWidth: 0,
        strokeAlpha: 0,
        fillType: 2,
        fillColor: "#ffffff",
        fillAlpha: 1.0,
        elevation,
        flags: {
            [MODULE_ID]: { dungeonWall: true, dungeonIntWall: true },
            ...(levelsActive ? { levels: { rangeTop: wallHeightTop } } : {})
        }
    };

    const drawingsToCreate = [];
    const wallsToCreate = [];

    // Left wall segment
    if (leftLen > 5) {
        const midT_left = (-hw + tClamped - doorHalfWidth) / 2;
        drawingsToCreate.push({
            ...baseDrawingData,
            x: cx + midT_left * ux - leftLen / 2,
            y: cy + midT_left * uy - WALL_THICKNESS / 2,
            shape: { type: "r", width: leftLen, height: WALL_THICKNESS },
            texture: wallTexture
        });
        if (!_noFoundryWalls) {
            wallsToCreate.push({
                c: [p1x, p1y, dsx, dsy],
                flags: {
                    [MODULE_ID]: { dungeonGenWall: true, dungeonIntWall: true },
                    ...(levelsActive ? { "wall-height": { bottom: elevation, top: wallHeightTop } } : {})
                }
            });
        }
    }

    // Right wall segment
    if (rightLen > 5) {
        const midT_right = (tClamped + doorHalfWidth + hw) / 2;
        drawingsToCreate.push({
            ...baseDrawingData,
            x: cx + midT_right * ux - rightLen / 2,
            y: cy + midT_right * uy - WALL_THICKNESS / 2,
            shape: { type: "r", width: rightLen, height: WALL_THICKNESS },
            texture: wallTexture
        });
        if (!_noFoundryWalls) {
            wallsToCreate.push({
                c: [dex, dey, p2x, p2y],
                flags: {
                    [MODULE_ID]: { dungeonGenWall: true, dungeonIntWall: true },
                    ...(levelsActive ? { "wall-height": { bottom: elevation, top: wallHeightTop } } : {})
                }
            });
        }
    }

    // Create all new drawings
    if (drawingsToCreate.length > 0) {
        const created = await scene.createEmbeddedDocuments("Drawing", drawingsToCreate);
        // Post-creation elevation update (Levels may override during creation)
        const updates = created.map(d => ({
            _id: d.id,
            elevation,
            ...(levelsActive ? { "flags.levels.rangeTop": wallHeightTop } : {})
        }));
        if (updates.length > 0) {
            await scene.updateEmbeddedDocuments("Drawing", updates);
        }
        // Apply wall shadows if enabled
        if (_wallShadows && window.TokenMagic) {
            const shadowParams = [{ filterType: "shadow", filterId: "dropshadow2", rotation: 0, distance: 0, color: 0x000000, alpha: 1, shadowOnly: false, blur: 5, quality: 5, padding: 20 }];
            for (const doc of created) {
                try { await TokenMagic.addUpdateFilters(doc, shadowParams); } catch (_) {}
            }
        }
    }

    // Create wall segment Foundry walls
    if (wallsToCreate.length > 0) {
        await scene.createEmbeddedDocuments("Wall", wallsToCreate);
    }

    // Create Foundry door wall (always, regardless of _noFoundryWalls — doors need to be functional)
    const doorWallData = {
        c: [dsx, dsy, dex, dey],
        door: 1,
        ds: 0,
        light: 20,
        move: 20,
        sound: 20,
        doorSound: "woodBasic",
        flags: {
            [MODULE_ID]: { dungeonIntWall: true, dungeonIntDoor: true },
            ...(levelsActive ? { "wall-height": { bottom: elevation, top: wallHeightTop } } : {})
        }
    };
    if (doorTexture) {
        doorWallData.animation = { type: "swing", texture: doorTexture };
    }
    await scene.createEmbeddedDocuments("Wall", [doorWallData]);
}

/**
 * Handle shift+click on an interior door to remove it and restore the original int wall
 */
async function handleIntWallDoorRemove(clickPos) {
    if (!game.user.isGM) return;

    const scene = canvas.scene;
    if (!scene) return;

    const clickX = clickPos.x;
    const clickY = clickPos.y;

    // Distance from point to line segment
    const distToSegment = (px, py, x1, y1, x2, y2) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
    };

    // Find the closest dungeonIntDoor Foundry door wall to the click
    let hitDoor = null;
    let minDist = 40;
    for (const w of scene.walls) {
        if (!w.flags?.[MODULE_ID]?.dungeonIntDoor) continue;
        if (!w.door || w.door === 0) continue;
        const dist = distToSegment(clickX, clickY, w.c[0], w.c[1], w.c[2], w.c[3]);
        if (dist < minDist) {
            minDist = dist;
            hitDoor = w;
        }
    }

    if (!hitDoor) {
        ui.notifications.warn("Shift+Click on an interior door to remove it.");
        return;
    }

    const [dsx, dsy, dex, dey] = hitDoor.c;
    const endTol = 35;

    // Helper: get both world-space endpoints of a rotated rect drawing
    const getDrawingEndpoints = (d) => {
        const theta = (d.rotation || 0) * Math.PI / 180;
        const hw = d.shape.width / 2;
        const cx = d.x + hw;
        const cy = d.y + (d.shape.height ?? WALL_THICKNESS) / 2;
        const ux = Math.cos(theta);
        const uy = Math.sin(theta);
        return [
            { x: cx - hw * ux, y: cy - hw * uy },
            { x: cx + hw * ux, y: cy + hw * uy }
        ];
    };

    const near = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) < endTol;

    // Find adjacent int wall drawings (not doors) whose endpoint touches the door gap
    let leftDrawing = null,  leftFarEnd  = null; // segment ending near (dsx, dsy)
    let rightDrawing = null, rightFarEnd = null; // segment starting near (dex, dey)

    for (const d of scene.drawings) {
        if (!d.flags?.[MODULE_ID]?.dungeonIntWall) continue;
        if (d.flags?.[MODULE_ID]?.dungeonIntDoor) continue;
        if (d.shape?.type !== "r") continue;
        const [ep1, ep2] = getDrawingEndpoints(d);
        if (near(ep1.x, ep1.y, dsx, dsy)) { leftDrawing = d; leftFarEnd = ep2; }
        else if (near(ep2.x, ep2.y, dsx, dsy)) { leftDrawing = d; leftFarEnd = ep1; }
        if (near(ep1.x, ep1.y, dex, dey)) { rightDrawing = d; rightFarEnd = ep2; }
        else if (near(ep2.x, ep2.y, dex, dey)) { rightDrawing = d; rightFarEnd = ep1; }
    }

    // Find adjacent int wall Foundry walls (non-door) touching the door gap
    let leftWall = null,  leftWallFar  = null;
    let rightWall = null, rightWallFar = null;

    for (const w of scene.walls) {
        if (!w.flags?.[MODULE_ID]?.dungeonIntWall) continue;
        if (w.door && w.door > 0) continue;
        const [wx1, wy1, wx2, wy2] = w.c;
        if (near(wx1, wy1, dsx, dsy)) { leftWall = w; leftWallFar = { x: wx2, y: wy2 }; }
        else if (near(wx2, wy2, dsx, dsy)) { leftWall = w; leftWallFar = { x: wx1, y: wy1 }; }
        if (near(wx1, wy1, dex, dey)) { rightWall = w; rightWallFar = { x: wx2, y: wy2 }; }
        else if (near(wx2, wy2, dex, dey)) { rightWall = w; rightWallFar = { x: wx1, y: wy1 }; }
    }

    // Merged wall endpoints (fall back to door endpoints if a segment was missing)
    const mergedStart = leftFarEnd  ?? { x: dsx, y: dsy };
    const mergedEnd   = rightFarEnd ?? { x: dex, y: dey };

    const mdx = mergedEnd.x - mergedStart.x;
    const mdy = mergedEnd.y - mergedStart.y;
    const mergedLength = Math.sqrt(mdx * mdx + mdy * mdy);
    const mergedAngle  = Math.atan2(mdy, mdx) * (180 / Math.PI);
    const mergedCx = (mergedStart.x + mergedEnd.x) / 2;
    const mergedCy = (mergedStart.y + mergedEnd.y) / 2;

    const wallTexture = (leftDrawing || rightDrawing)?.texture || _selectedIntWallTile;
    const elevation = hitDoor.flags?.["wall-height"]?.bottom ?? 0;
    const levelsActive = game.modules.get("levels")?.active;
    const wallHeightTop = elevation + 9;

    // Delete: door wall + adjacent drawings + adjacent wall segments
    const drawingsToDelete = [];
    const wallsToDelete = [hitDoor.id];
    if (leftDrawing)  drawingsToDelete.push(leftDrawing.id);
    if (rightDrawing) drawingsToDelete.push(rightDrawing.id);
    if (leftWall)     wallsToDelete.push(leftWall.id);
    if (rightWall)    wallsToDelete.push(rightWall.id);

    if (drawingsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Drawing", drawingsToDelete);
    }
    await scene.deleteEmbeddedDocuments("Wall", wallsToDelete);

    if (mergedLength < 5) return;

    // Recreate merged int wall drawing
    const drawingData = {
        author: game.user.id,
        x: mergedCx - mergedLength / 2,
        y: mergedCy - WALL_THICKNESS / 2,
        rotation: mergedAngle,
        shape: { type: "r", width: mergedLength, height: WALL_THICKNESS },
        strokeWidth: 0,
        strokeAlpha: 0,
        fillType: 2,
        fillColor: "#ffffff",
        fillAlpha: 1.0,
        texture: wallTexture,
        elevation,
        flags: {
            [MODULE_ID]: { dungeonWall: true, dungeonIntWall: true },
            ...(levelsActive ? { levels: { rangeTop: wallHeightTop } } : {})
        }
    };

    const created = await scene.createEmbeddedDocuments("Drawing", [drawingData]);
    if (created?.length > 0) {
        await scene.updateEmbeddedDocuments("Drawing", [{
            _id: created[0].id,
            elevation,
            ...(levelsActive ? { "flags.levels.rangeTop": wallHeightTop } : {})
        }]);
        if (_wallShadows && window.TokenMagic) {
            const shadowParams = [{ filterType: "shadow", filterId: "dropshadow2", rotation: 0, distance: 0, color: 0x000000, alpha: 1, shadowOnly: false, blur: 5, quality: 5, padding: 20 }];
            try { await TokenMagic.addUpdateFilters(created[0], shadowParams); } catch (_) {}
        }
    }

    // Recreate merged int wall Foundry wall
    if (!_noFoundryWalls) {
        await scene.createEmbeddedDocuments("Wall", [{
            c: [mergedStart.x, mergedStart.y, mergedEnd.x, mergedEnd.y],
            flags: {
                [MODULE_ID]: { dungeonGenWall: true, dungeonIntWall: true },
                ...(levelsActive ? { "wall-height": { bottom: elevation, top: wallHeightTop } } : {})
            }
        }]);
    }
}

/**
 * Destroy selection rectangle completely
 */
function destroySelectionRect() {
    if (_selectionRect) {
        if (!_selectionRect.destroyed) {
            if (_selectionRect.parent) {
                _selectionRect.parent.removeChild(_selectionRect);
            }
            _selectionRect.destroy({ children: true });
        }
        _selectionRect = null;
    }
}

/**
 * Ensure a full-scene background Drawing exists at the given elevation
 */
export async function ensureBackgroundDrawing(scene, elevation, backgroundSetting) {
    if (!backgroundSetting || backgroundSetting === "none") return;

    const bgElevation = elevation - 1;
    const rangeTop = elevation;

    // Check if a background drawing already exists at this elevation
    const existing = scene.drawings.find(d =>
        d.flags?.[MODULE_ID]?.dungeonBackground &&
        d.elevation === bgElevation
    );

    // Parse background setting
    let fillType, fillColor, fillAlpha, texturePath;

    if (backgroundSetting === "color-black") {
        fillType = 1;
        fillColor = "#000000";
        fillAlpha = 0.8;
        texturePath = null;
    } else if (backgroundSetting === "color-white") {
        fillType = 1;
        fillColor = "#ffffff";
        fillAlpha = 0.8;
        texturePath = null;
    } else if (backgroundSetting === "color-gray") {
        fillType = 1;
        fillColor = "#808080";
        fillAlpha = 0.8;
        texturePath = null;
    } else {
        // Image path
        fillType = 2;
        fillColor = "#ffffff";
        fillAlpha = 1.0;
        texturePath = backgroundSetting;
    }

    // Compute scene interior bounds from scene data directly.
    // canvas.dimensions may be stale if the scene was just resized by the generator.
    // Foundry snaps the padding offset to the nearest grid cell (ceiling), so we do the same.
    const scenePadFraction = scene.padding ?? 0;
    const gridSize = scene.grid?.size || GRID_SIZE;
    const sceneX = Math.ceil(scene.width * scenePadFraction / gridSize) * gridSize;
    const sceneY = Math.ceil(scene.height * scenePadFraction / gridSize) * gridSize;
    const sceneWidth = scene.width;
    const sceneHeight = scene.height;

    // If a background already exists at this elevation, update fill AND shape/position
    if (existing) {
        const updateData = {
            _id: existing.id,
            x: sceneX,
            y: sceneY,
            shape: { type: "r", width: sceneWidth, height: sceneHeight },
            fillType: fillType,
            fillColor: fillColor,
            fillAlpha: fillAlpha,
            texture: texturePath || ""
        };
        await scene.updateEmbeddedDocuments("Drawing", [updateData]);
        console.log(`${MODULE_ID} | Updated background drawing at elevation ${bgElevation}`);
        return;
    }

    const drawingData = {
        author: game.user.id,
        x: sceneX,
        y: sceneY,
        locked: true,
        shape: {
            type: "r",
            width: sceneWidth,
            height: sceneHeight
        },
        strokeWidth: 0,
        strokeAlpha: 0,
        fillType: fillType,
        fillColor: fillColor,
        fillAlpha: fillAlpha,
        flags: {
            [MODULE_ID]: { dungeonBackground: true },
            levels: { rangeTop: rangeTop }
        }
    };

    if (texturePath) {
        drawingData.texture = texturePath;
    }

    // Create the drawing, then update elevation (Levels may override during creation)
    const created = await scene.createEmbeddedDocuments("Drawing", [drawingData]);
    if (created && created.length > 0 && created[0].elevation !== bgElevation) {
        await scene.updateEmbeddedDocuments("Drawing", [{
            _id: created[0].id,
            elevation: bgElevation
        }]);
    }

    console.log(`${MODULE_ID} | Created background drawing at elevation ${bgElevation}`);
}

/**
 * Handle rectangle fill (add or delete tiles)
 */
async function handleRectangleFill(startPos, endPos, isDeleting) {
    const scene = canvas.scene;
    if (!scene || !startPos || !endPos) return;

    const gridSize = canvas.grid.size || GRID_SIZE;

    // Calculate grid bounds
    const minPx = Math.min(startPos.x, endPos.x);
    const maxPx = Math.max(startPos.x, endPos.x);
    const minPy = Math.min(startPos.y, endPos.y);
    const maxPy = Math.max(startPos.y, endPos.y);

    const minGx = Math.floor(minPx / gridSize);
    const maxGx = Math.floor(maxPx / gridSize);
    const minGy = Math.floor(minPy / gridSize);
    const maxGy = Math.floor(maxPy / gridSize);

    // Player: route through socket to GM
    if (!game.user.isGM && _dungeonSocket) {
        if (isDeleting) {
            await _dungeonSocket.executeAsGM("dungeonDeleteRectangle", {
                sceneId: scene.id,
                minGx, maxGx, minGy, maxGy,
                minPx, maxPx, minPy, maxPy,
                wallTilePath: _selectedWallTile,
                noWalls: _noFoundryWalls,
                doorsOnly: false
            });
        } else {
            if (!_selectedFloorTile) {
                ui.notifications.warn("SDX | Select a floor tile first.");
                return;
            }
            await _dungeonSocket.executeAsGM("dungeonFillRectangle", {
                sceneId: scene.id,
                minGx, maxGx, minGy, maxGy,
                floorTilePath: _selectedFloorTile,
                wallTilePath: _selectedWallTile,
                noWalls: _noFoundryWalls,
                backgroundSetting: _selectedBackground
            });
        }
        return;
    }

    // GM: execute directly
    if (isDeleting) {
        // Detect current elevation by creating a temporary probe tile
        let currentElevation = getCurrentElevation();

        // Create and immediately delete a probe tile to detect Levels' current elevation
        const probeTile = await scene.createEmbeddedDocuments("Tile", [{
            texture: { src: _selectedFloorTile || `modules/${MODULE_ID}/assets/Dungeon/floor_tiles/stone_floor_00.png` },
            x: minGx * gridSize,
            y: minGy * gridSize,
            width: gridSize,
            height: gridSize,
            hidden: true, // Hide it briefly
            flags: { [MODULE_ID]: { probe: true } }
        }]);

        if (probeTile && probeTile.length > 0) {
            currentElevation = probeTile[0].elevation ?? 0;
            // Delete the probe tile
            await scene.deleteEmbeddedDocuments("Tile", [probeTile[0].id]);
        }

        console.log(`${MODULE_ID} | Deleting at detected elevation: ${currentElevation}`);

        const ELEVATION_TOLERANCE = 5;

        // Delete floor tiles in range at current elevation only
        const tilesToDelete = [];
        const doorsToDelete = [];

        for (const tile of scene.tiles) {
            if (!tile.texture?.src?.includes("Dungeon/floor_tiles")) continue;

            const tileGx = Math.floor(tile.x / gridSize);
            const tileGy = Math.floor(tile.y / gridSize);
            const tileElev = tile.elevation ?? 0;

            // Only delete tiles at the current elevation
            if (tileGx >= minGx && tileGx <= maxGx && tileGy >= minGy && tileGy <= maxGy &&
                Math.abs(tileElev - currentElevation) < ELEVATION_TOLERANCE) {
                tilesToDelete.push(tile.id);
            }
        }

        // Also delete doors in range at current elevation
        for (const wall of scene.walls) {
            if (!wall.door || wall.door === 0) continue;

            const mx = (wall.c[0] + wall.c[2]) / 2;
            const my = (wall.c[1] + wall.c[3]) / 2;
            const wallBottom = wall.flags?.["wall-height"]?.bottom ?? 0;

            // Only delete doors at the current elevation
            if (mx >= minPx && mx <= maxPx && my >= minPy && my <= maxPy &&
                Math.abs(wallBottom - currentElevation) < ELEVATION_TOLERANCE) {
                doorsToDelete.push(wall.id);
            }
        }

        console.log(`${MODULE_ID} | Deleting ${tilesToDelete.length} tiles and ${doorsToDelete.length} doors at elevation ${currentElevation}`);

        if (tilesToDelete.length > 0) {
            await scene.deleteEmbeddedDocuments("Tile", tilesToDelete);
        }
        if (doorsToDelete.length > 0) {
            await scene.deleteEmbeddedDocuments("Wall", doorsToDelete);
        }
    } else {
        // Add tiles to fill rectangle
        if (!_selectedFloorTile) {
            ui.notifications.warn("SDX | Select a floor tile first.");
            return;
        }

        // Detect current elevation by creating a probe tile and reading what Levels sets
        // This is the most reliable way to get the current Levels selection
        let currentElevation = getCurrentElevation();

        // Create a probe tile to detect what elevation Levels will assign
        const probeTile = await scene.createEmbeddedDocuments("Tile", [{
            texture: { src: _selectedFloorTile },
            x: minGx * gridSize,
            y: minGy * gridSize,
            width: gridSize,
            height: gridSize,
            flags: { [MODULE_ID]: { dungeonFloor: true } }
        }]);

        if (probeTile && probeTile.length > 0) {
            // Read the elevation that Levels assigned
            currentElevation = probeTile[0].elevation ?? 0;
            console.log(`${MODULE_ID} | Detected elevation from Levels: ${currentElevation}`);
        }

        const tilesToCreate = [];
        const tilesToUpdate = [];

        // Define elevation tolerance - tiles within this range are considered "same level"
        const ELEVATION_TOLERANCE = 5;

        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                // Skip the probe tile position (already created)
                if (gx === minGx && gy === minGy) continue;

                // Only find existing tile if it's at the SAME elevation (allow stacking at different levels)
                const existing = scene.tiles.find(t =>
                    Math.floor(t.x / gridSize) === gx &&
                    Math.floor(t.y / gridSize) === gy &&
                    t.texture?.src?.includes("Dungeon/floor_tiles") &&
                    Math.abs((t.elevation ?? 0) - currentElevation) < ELEVATION_TOLERANCE
                );

                if (existing) {
                    // Update existing tile texture at same elevation
                    tilesToUpdate.push({ _id: existing.id, texture: { src: _selectedFloorTile } });
                } else {
                    // Create new tile (allows stacking floors at different elevations)
                    tilesToCreate.push({
                        texture: { src: _selectedFloorTile },
                        x: gx * gridSize,
                        y: gy * gridSize,
                        width: gridSize,
                        height: gridSize,
                        sort: 0,
                        flags: {
                            [MODULE_ID]: { dungeonFloor: true }
                        }
                    });
                }
            }
        }

        if (tilesToCreate.length > 0) {
            await scene.createEmbeddedDocuments("Tile", tilesToCreate);
        }
        if (tilesToUpdate.length > 0) {
            await scene.updateEmbeddedDocuments("Tile", tilesToUpdate);
        }

        // Create background drawing if configured
        await ensureBackgroundDrawing(scene, currentElevation, _selectedBackground);
    }

    // Rebuild walls
    scheduleWallRebuild(scene);
}

/**
 * Handle rectangle delete for doors
 */
async function handleRectangleDelete(startPos, endPos, doorsOnly) {
    const scene = canvas.scene;
    if (!scene) return;

    const gridSize = canvas.grid.size || GRID_SIZE;
    const minPx = Math.min(startPos.x, endPos.x);
    const maxPx = Math.max(startPos.x, endPos.x);
    const minPy = Math.min(startPos.y, endPos.y);
    const maxPy = Math.max(startPos.y, endPos.y);

    const minGx = Math.floor(minPx / gridSize);
    const maxGx = Math.floor(maxPx / gridSize);
    const minGy = Math.floor(minPy / gridSize);
    const maxGy = Math.floor(maxPy / gridSize);

    // Player: route through socket to GM
    if (!game.user.isGM && _dungeonSocket) {
        await _dungeonSocket.executeAsGM("dungeonDeleteRectangle", {
            sceneId: scene.id,
            minGx, maxGx, minGy, maxGy,
            minPx, maxPx, minPy, maxPy,
            wallTilePath: _selectedWallTile,
            noWalls: _noFoundryWalls,
            doorsOnly: true
        });
        return;
    }

    // GM: execute directly
    const doorsToDelete = [];
    for (const wall of scene.walls) {
        if (!wall.door || wall.door === 0) continue;

        const mx = (wall.c[0] + wall.c[2]) / 2;
        const my = (wall.c[1] + wall.c[3]) / 2;

        if (mx >= minPx && mx <= maxPx && my >= minPy && my <= maxPy) {
            doorsToDelete.push(wall.id);
        }
    }

    if (doorsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Wall", doorsToDelete);
        scheduleWallRebuild(scene);
    }
}

/**
 * Handle door click (add or remove door)
 */
async function handleDoorClick(event, isDeleting) {
    const scene = canvas.scene;
    if (!scene) return;

    const gridSize = canvas.grid.size || GRID_SIZE;
    const pos = event.data?.getLocalPosition(canvas.stage) || event;

    const gx = Math.floor(pos.x / gridSize);
    const gy = Math.floor(pos.y / gridSize);

    // Check if there's a floor tile here
    const hasTile = scene.tiles.some(t =>
        Math.floor(t.x / gridSize) === gx &&
        Math.floor(t.y / gridSize) === gy &&
        t.texture?.src?.includes("Dungeon/floor_tiles")
    );

    if (!hasTile && !isDeleting) return;

    // Check neighbors
    const hasN = scene.tiles.some(t => Math.floor(t.x / gridSize) === gx && Math.floor(t.y / gridSize) === gy - 1 && t.texture?.src?.includes("Dungeon/floor_tiles"));
    const hasS = scene.tiles.some(t => Math.floor(t.x / gridSize) === gx && Math.floor(t.y / gridSize) === gy + 1 && t.texture?.src?.includes("Dungeon/floor_tiles"));
    const hasE = scene.tiles.some(t => Math.floor(t.x / gridSize) === gx + 1 && Math.floor(t.y / gridSize) === gy && t.texture?.src?.includes("Dungeon/floor_tiles"));
    const hasW = scene.tiles.some(t => Math.floor(t.x / gridSize) === gx - 1 && Math.floor(t.y / gridSize) === gy && t.texture?.src?.includes("Dungeon/floor_tiles"));

    // Determine door placement
    const isVerticalCorridor = hasN && hasS && !hasE && !hasW;
    const isHorizontalCorridor = hasE && hasW && !hasN && !hasS;

    let x1, y1, x2, y2;

    if (isVerticalCorridor) {
        x1 = gx * gridSize; y1 = (gy + 0.5) * gridSize;
        x2 = (gx + 1) * gridSize; y2 = (gy + 0.5) * gridSize;
    } else if (isHorizontalCorridor) {
        x1 = (gx + 0.5) * gridSize; y1 = gy * gridSize;
        x2 = (gx + 0.5) * gridSize; y2 = (gy + 1) * gridSize;
    } else {
        // Find best edge based on click position
        const rx = pos.x % gridSize;
        const ry = pos.y % gridSize;

        const distN = ry;
        const distS = gridSize - ry;
        const distW = rx;
        const distE = gridSize - rx;

        const edges = [
            { dir: 'N', dist: distN, open: hasN, coords: [gx * gridSize, gy * gridSize, (gx + 1) * gridSize, gy * gridSize] },
            { dir: 'S', dist: distS, open: hasS, coords: [gx * gridSize, (gy + 1) * gridSize, (gx + 1) * gridSize, (gy + 1) * gridSize] },
            { dir: 'W', dist: distW, open: hasW, coords: [gx * gridSize, gy * gridSize, gx * gridSize, (gy + 1) * gridSize] },
            { dir: 'E', dist: distE, open: hasE, coords: [(gx + 1) * gridSize, gy * gridSize, (gx + 1) * gridSize, (gy + 1) * gridSize] }
        ];

        const anyOpen = edges.some(e => e.open);

        if (anyOpen) {
            const openEdges = edges.filter(e => e.open).sort((a, b) => a.dist - b.dist);
            [x1, y1, x2, y2] = openEdges[0].coords;
        } else {
            const sorted = edges.sort((a, b) => a.dist - b.dist);
            [x1, y1, x2, y2] = sorted[0].coords;
        }
    }

    const tolerance = 2;

    // Determine if door is horizontal or vertical
    const isHorizontalDoor = Math.abs(y1 - y2) < tolerance;

    // Get appropriate door texture
    let doorTexture = _selectedDoorTile;
    if (doorTexture) {
        // Try to match horizontal/vertical variant
        if (isHorizontalDoor && !doorTexture.toLowerCase().includes("horizontal")) {
            const hVariant = doorTexture.replace(/vertical/i, "horizontal");
            const hTile = _doorTiles?.find(t => t.path === hVariant);
            if (hTile) doorTexture = hVariant;
        } else if (!isHorizontalDoor && !doorTexture.toLowerCase().includes("vertical")) {
            const vVariant = doorTexture.replace(/horizontal/i, "vertical");
            const vTile = _doorTiles?.find(t => t.path === vVariant);
            if (vTile) doorTexture = vVariant;
        }
    }

    // Player: route through socket to GM
    if (!game.user.isGM && _dungeonSocket) {
        if (isDeleting) {
            await _dungeonSocket.executeAsGM("dungeonRemoveDoor", {
                sceneId: scene.id,
                x1, y1, x2, y2,
                wallTilePath: _selectedWallTile,
                noWalls: _noFoundryWalls
            });
        } else {
            await _dungeonSocket.executeAsGM("dungeonPlaceDoor", {
                sceneId: scene.id,
                x1, y1, x2, y2,
                doorTexture,
                wallTilePath: _selectedWallTile,
                noWalls: _noFoundryWalls
            });
        }
        return;
    }

    // GM: execute directly
    // Check for existing wall/door at coords
    const existingWall = scene.walls.find(w => {
        const c = w.c;
        const match1 = (Math.abs(c[0] - x1) < tolerance && Math.abs(c[1] - y1) < tolerance &&
            Math.abs(c[2] - x2) < tolerance && Math.abs(c[3] - y2) < tolerance);
        const match2 = (Math.abs(c[0] - x2) < tolerance && Math.abs(c[1] - y2) < tolerance &&
            Math.abs(c[2] - x1) < tolerance && Math.abs(c[3] - y1) < tolerance);
        return match1 || match2;
    });

    if (isDeleting) {
        if (existingWall && existingWall.door > 0) {
            await scene.deleteEmbeddedDocuments("Wall", [existingWall.id]);
            scheduleWallRebuild(scene);
        }
    } else {
        if (existingWall) {
            if (existingWall.door === 0) {
                const updateData = { door: 1, ds: 0 };
                if (doorTexture) {
                    updateData.animation = {
                        type: "swing",
                        texture: doorTexture
                    };
                }
                await existingWall.update(updateData);
                scheduleWallRebuild(scene);
            }
        } else {
            const wallData = {
                c: [x1, y1, x2, y2],
                door: 1,
                ds: 0,
                light: 20,
                move: 20,
                sound: 20,
                doorSound: "woodBasic"
            };
            if (doorTexture) {
                wallData.animation = {
                    type: "swing",
                    texture: doorTexture
                };
            }
            await scene.createEmbeddedDocuments("Wall", [wallData]);
            scheduleWallRebuild(scene);
        }
    }
}

/**
 * Schedule wall rebuild with debounce
 */
function scheduleWallRebuild(scene) {
    if (_rebuildTimeout) {
        clearTimeout(_rebuildTimeout);
    }

    _rebuildTimeout = setTimeout(() => {
        rebuildWalls(scene);
    }, 300);
}

/**
 * Rebuild walls around floor tiles (elevation-aware for Levels module compatibility)
 */
async function rebuildWalls(scene) {
    if (!scene) return;

    const gridSize = canvas.grid.size || GRID_SIZE;
    const LEVEL_HEIGHT = 10; // Each level is 10 units tall

    // 1. Scan all floor tiles and group by elevation
    const floorsByElevation = new Map(); // elevation -> Set of "gx,gy"

    for (const tile of scene.tiles) {
        if (tile.texture?.src?.includes("Dungeon/floor_tiles")) {
            const gx = Math.floor(tile.x / gridSize);
            const gy = Math.floor(tile.y / gridSize);
            const elevation = tile.elevation ?? 0;
            const key = `${gx},${gy}`;

            console.log(`${MODULE_ID} | Tile at ${key} has elevation: ${tile.elevation} (using: ${elevation})`);

            if (!floorsByElevation.has(elevation)) {
                floorsByElevation.set(elevation, new Set());
            }
            floorsByElevation.get(elevation).add(key);
        }
    }

    // Get all unique elevations from floor tiles
    const floorElevations = new Set(floorsByElevation.keys());

    // Also collect elevations from existing dungeon walls and wall drawings
    // so orphaned ones (where all floor tiles were deleted) get cleaned up
    const allDungeonElevations = new Set(floorElevations);

    for (const w of scene.walls) {
        if (w.door && w.door > 0) continue;
        const bottom = w.flags?.["wall-height"]?.bottom;
        if (bottom !== undefined) allDungeonElevations.add(bottom);
    }
    for (const d of scene.drawings) {
        if (d.flags?.[MODULE_ID]?.dungeonWall) {
            allDungeonElevations.add(d.elevation ?? 0);
        }
    }

    const elevations = Array.from(allDungeonElevations).sort((a, b) => a - b);

    console.log(`${MODULE_ID} | Found ${floorElevations.size} floor elevation levels, ${elevations.length} total dungeon elevations: [${elevations.join(', ')}]`);
    for (const [elev, floors] of floorsByElevation) {
        console.log(`${MODULE_ID} |   Elevation ${elev}: ${floors.size} floor tiles`);
    }

    // 2. Delete existing dungeon walls (non-doors) - only those created by us
    // We identify our walls by checking if they have wall-height flags matching our level pattern
    if (!_noFoundryWalls) {
        const wallsToDelete = scene.walls
            .filter(w => {
                if (w.door && w.door > 0) return false; // Keep doors
                if (w.flags?.[MODULE_ID]?.dungeonIntWall) return false; // Keep interior walls
                // Check if this wall was created by dungeon painter (has wall-height flags with our pattern)
                const bottom = w.flags?.["wall-height"]?.bottom;
                if (bottom === undefined) return false; // Not a levels-aware wall, might be manual
                // Check if bottom matches any of our elevation levels
                return elevations.some(elev => bottom === elev);
            })
            .map(w => w.id);

        console.log(`${MODULE_ID} | Deleting ${wallsToDelete.length} walls with elevations matching [${elevations.join(', ')}]`);
        if (wallsToDelete.length > 0) {
            await scene.deleteEmbeddedDocuments("Wall", wallsToDelete);
        }
    }

    // 3. Delete existing wall drawings at matching elevations (skip interior walls)
    const drawingsToDelete = scene.drawings
        .filter(d => {
            if (!d.flags?.[MODULE_ID]?.dungeonWall) return false;
            if (d.flags?.[MODULE_ID]?.dungeonIntWall) return false; // preserve interior walls
            const drawingElev = d.elevation ?? 0;
            return elevations.some(elev => drawingElev === elev);
        })
        .map(d => d.id);

    console.log(`${MODULE_ID} | Deleting ${drawingsToDelete.length} drawings with elevations matching [${elevations.join(', ')}]`);
    if (drawingsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Drawing", drawingsToDelete);
    }

    // 4. If no floors, done
    if (floorsByElevation.size === 0) return;

    // 5. Process each elevation level separately
    let totalWalls = 0;
    let totalDrawings = 0;

    for (const [elevation, floors] of floorsByElevation) {
        const wallHeightBottom = elevation;
        const wallHeightTop = elevation + LEVEL_HEIGHT - 1; // e.g., 0-9, 10-19, etc.

        console.log(`${MODULE_ID} | Processing elevation ${elevation}: ${floors.size} floors, wall-height ${wallHeightBottom}/${wallHeightTop}`);

        // Find doors at this elevation
        const entranceEdges = [];
        const existingDoors = scene.walls.filter(w => {
            if (!w.door || w.door === 0) return false;
            const doorBottom = w.flags?.["wall-height"]?.bottom ?? 0;
            // Door is at this level if its bottom matches our elevation (with some tolerance)
            return Math.abs(doorBottom - elevation) < LEVEL_HEIGHT;
        });

        const tolerance = 2;
        for (const door of existingDoors) {
            const [x1, y1, x2, y2] = door.c;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const isHorizontal = Math.abs(y1 - y2) < tolerance;
            const isVertical = Math.abs(x1 - x2) < tolerance;

            if (isHorizontal) {
                const gy = Math.round(midY / gridSize);
                const gx = Math.floor(midX / gridSize);
                entranceEdges.push({ x: gx, y: gy - 1, dir: 'S' });
                entranceEdges.push({ x: gx, y: gy, dir: 'N' });
            } else if (isVertical) {
                const gx = Math.round(midX / gridSize);
                const gy = Math.floor(midY / gridSize);
                entranceEdges.push({ x: gx - 1, y: gy, dir: 'E' });
                entranceEdges.push({ x: gx, y: gy, dir: 'W' });
            }
        }

        const entranceSet = new Set(entranceEdges.map(e => `${e.x},${e.y},${e.dir}`));

        // 6. Generate and create walls for this elevation
        if (!_noFoundryWalls) {
            const wallsData = generateWallsWithElevation(floors, entranceSet, gridSize, WALL_THICKNESS, wallHeightBottom, wallHeightTop);

            // Generate filler walls for doors at this elevation
            if (existingDoors.length > 0 && WALL_THICKNESS > 0) {
                for (const door of existingDoors) {
                    const [px1, py1, px2, py2] = door.c;

                    if (Math.abs(py1 - py2) < tolerance) {
                        // Horizontal door
                        const minX = Math.min(px1, px2);
                        const maxX = Math.max(px1, px2);
                        const y = py1;
                        wallsData.push({
                            c: [minX - WALL_THICKNESS, y, minX, y],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                        wallsData.push({
                            c: [maxX, y, maxX + WALL_THICKNESS, y],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                    } else if (Math.abs(px1 - px2) < tolerance) {
                        // Vertical door
                        const minY = Math.min(py1, py2);
                        const maxY = Math.max(py1, py2);
                        const x = px1;
                        wallsData.push({
                            c: [x, minY - WALL_THICKNESS, x, minY],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                        wallsData.push({
                            c: [x, maxY, x, maxY + WALL_THICKNESS],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                    }
                }
            }

            // Create walls in batches
            if (wallsData.length > 0) {
                console.log(`${MODULE_ID} |   Creating ${wallsData.length} walls at elevation ${wallHeightBottom}/${wallHeightTop}`);
                const chunkSize = 100;
                for (let i = 0; i < wallsData.length; i += chunkSize) {
                    // Create walls first
                    const created = await scene.createEmbeddedDocuments("Wall", wallsData.slice(i, i + chunkSize));

                    // Then update wall-height flags to bypass Levels hooks that might override during creation
                    const updates = created.map(w => ({
                        _id: w.id,
                        "flags.wall-height.bottom": wallHeightBottom,
                        "flags.wall-height.top": wallHeightTop
                    }));
                    if (updates.length > 0) {
                        await scene.updateEmbeddedDocuments("Wall", updates);
                    }
                }
                totalWalls += wallsData.length;
            }
        }

        // 7. Generate wall visuals for this elevation
        const drawingsData = generateWallVisualsWithElevation(floors, entranceSet, gridSize, WALL_THICKNESS, elevation, wallHeightTop);

        if (drawingsData.length > 0) {
            console.log(`${MODULE_ID} |   Creating ${drawingsData.length} drawings at elevation ${elevation}, rangeTop ${wallHeightTop}`);
            const chunkSize = 100;
            for (let i = 0; i < drawingsData.length; i += chunkSize) {
                // Create drawings first
                const created = await scene.createEmbeddedDocuments("Drawing", drawingsData.slice(i, i + chunkSize));

                // Then update elevation to bypass Levels hooks that might override it during creation
                const updates = created.map(d => ({
                    _id: d.id,
                    elevation: elevation,
                    "flags.levels.rangeTop": wallHeightTop
                }));
                if (updates.length > 0) {
                    await scene.updateEmbeddedDocuments("Drawing", updates);
                }

                // Apply wall shadows if enabled
                if (_wallShadows && window.TokenMagic) {
                    const shadowParams = [{
                        filterType: "shadow",
                        filterId: "dropshadow2",
                        rotation: 0, distance: 0,
                        color: 0x000000, alpha: 1,
                        shadowOnly: false,
                        blur: 5, quality: 5, padding: 20
                    }];
                    for (const doc of created) {
                        try { await TokenMagic.addUpdateFilters(doc, shadowParams); }
                        catch (err) { console.warn(`${MODULE_ID} | Wall shadow failed:`, err); }
                    }
                }
            }
            totalDrawings += drawingsData.length;
        }
    }

    console.log(`${MODULE_ID} | Rebuilt ${_noFoundryWalls ? "0 (disabled)" : totalWalls} walls and ${totalDrawings} wall visuals across ${elevations.length} elevation level(s)`);
}

/**
 * Generate wall documents with elevation (wall-height) support
 */
function generateWallsWithElevation(floors, entranceSet, gridSize, thickness, wallHeightBottom, wallHeightTop) {
    const wallsData = [];

    const dirs = [
        { dx: 0, dy: -1, ax: 0, ay: 0, bx: 1, by: 0, name: 'N', ox: 0, oy: -1 },
        { dx: 0, dy: 1, ax: 0, ay: 1, bx: 1, by: 1, name: 'S', ox: 0, oy: 1 },
        { dx: 1, dy: 0, ax: 1, ay: 0, bx: 1, by: 1, name: 'E', ox: 1, oy: 0 },
        { dx: -1, dy: 0, ax: 0, ay: 0, bx: 0, by: 1, name: 'W', ox: -1, oy: 0 }
    ];

    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        const px = gx * gridSize;
        const py = gy * gridSize;

        for (const d of dirs) {
            const neighborKey = `${gx + d.dx},${gy + d.dy}`;

            // Skip entrance edges
            if (entranceSet.has(`${gx},${gy},${d.name}`)) continue;

            // Draw wall if neighbor is void (not in this elevation's floor set)
            if (!floors.has(neighborKey)) {
                let x1 = px + (d.ax * gridSize);
                let y1 = py + (d.ay * gridSize);
                let x2 = px + (d.bx * gridSize);
                let y2 = py + (d.by * gridSize);

                // Apply outward offset
                x1 += d.ox * thickness;
                x2 += d.ox * thickness;
                y1 += d.oy * thickness;
                y2 += d.oy * thickness;

                // Flanking logic for corners
                const getKeys = (dx, dy) => ({
                    sourceFlank: `${gx + dx},${gy + dy}`,
                    voidFlank: `${gx + d.dx + dx},${gy + d.dy + dy}`
                });

                let startVec, endVec;
                if (d.name === 'N' || d.name === 'S') {
                    startVec = { dx: -1, dy: 0 };
                    endVec = { dx: 1, dy: 0 };
                } else {
                    startVec = { dx: 0, dy: -1 };
                    endVec = { dx: 0, dy: 1 };
                }

                const startKeys = getKeys(startVec.dx, startVec.dy);
                let modStart = 0;
                if (!floors.has(startKeys.sourceFlank)) modStart = 1;
                else if (floors.has(startKeys.voidFlank)) modStart = -1;

                const endKeys = getKeys(endVec.dx, endVec.dy);
                let modEnd = 0;
                if (!floors.has(endKeys.sourceFlank)) modEnd = 1;
                else if (floors.has(endKeys.voidFlank)) modEnd = -1;

                if (modStart !== 0) {
                    const amount = thickness * modStart;
                    if (d.name === 'N' || d.name === 'S') x1 -= amount;
                    else y1 -= amount;
                }

                if (modEnd !== 0) {
                    const amount = thickness * modEnd;
                    if (d.name === 'N' || d.name === 'S') x2 += amount;
                    else y2 += amount;
                }

                wallsData.push({
                    c: [x1, y1, x2, y2],
                    light: 20,
                    move: 20,
                    sound: 20,
                    flags: {
                        "wall-height": {
                            bottom: wallHeightBottom,
                            top: wallHeightTop
                        }
                    }
                });
            }
        }
    }

    return wallsData;
}

/**
 * Generate wall visual drawings with elevation support
 */
function generateWallVisualsWithElevation(floors, entranceSet, gridSize, thickness, elevation, rangeTop) {
    const drawingsData = [];

    // Get wall texture paths
    const hTexture = _selectedWallTile || `modules/${MODULE_ID}/assets/Dungeon/wall_tiles/stone_brick_horizontal.png`;
    const vTexture = _selectedWallTile?.replace("horizontal", "vertical") || `modules/${MODULE_ID}/assets/Dungeon/wall_tiles/stone_brick_vertical.png`;

    // Identify wall segments
    const segments = { N: {}, S: {}, E: {}, W: {} };

    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);

        if (!floors.has(`${gx},${gy - 1}`) && !entranceSet.has(`${gx},${gy},N`)) {
            segments.N[`${gx},${gy}`] = { gx, gy, len: 1 };
        }
        if (!floors.has(`${gx},${gy + 1}`) && !entranceSet.has(`${gx},${gy},S`)) {
            segments.S[`${gx},${gy}`] = { gx, gy, len: 1 };
        }
        if (!floors.has(`${gx + 1},${gy}`) && !entranceSet.has(`${gx},${gy},E`)) {
            segments.E[`${gx},${gy}`] = { gx, gy, len: 1 };
        }
        if (!floors.has(`${gx - 1},${gy}`) && !entranceSet.has(`${gx},${gy},W`)) {
            segments.W[`${gx},${gy}`] = { gx, gy, len: 1 };
        }
    }

    // Merge horizontal segments
    for (const dir of ['N', 'S']) {
        const pool = segments[dir];
        const keys = Object.keys(pool).sort((a, b) => {
            const [ax, ay] = a.split(',').map(Number);
            const [bx, by] = b.split(',').map(Number);
            if (ay !== by) return ay - by;
            return ax - bx;
        });

        for (const key of keys) {
            const seg = pool[key];
            if (!seg) continue;

            let nextGx = seg.gx + seg.len;
            while (pool[`${nextGx},${seg.gy}`]) {
                seg.len += pool[`${nextGx},${seg.gy}`].len;
                delete pool[`${nextGx},${seg.gy}`];
                nextGx++;
            }
        }
    }

    // Merge vertical segments
    for (const dir of ['E', 'W']) {
        const pool = segments[dir];
        const keys = Object.keys(pool).sort((a, b) => {
            const [ax, ay] = a.split(',').map(Number);
            const [bx, by] = b.split(',').map(Number);
            if (ax !== bx) return ax - bx;
            return ay - by;
        });

        for (const key of keys) {
            const seg = pool[key];
            if (!seg) continue;

            let nextGy = seg.gy + seg.len;
            while (pool[`${seg.gx},${nextGy}`]) {
                seg.len += pool[`${seg.gx},${nextGy}`].len;
                delete pool[`${seg.gx},${nextGy}`];
                nextGy++;
            }
        }
    }

    // Create polygon drawing helper with elevation
    const createPoly = (px, py, w, h, isHorizontal) => {
        const drawing = {
            author: game.user.id,
            x: px,
            y: py,
            elevation: elevation, // Set elevation for Levels compatibility
            shape: {
                type: "p",
                width: w,
                height: h,
                points: [0, 0, w, 0, w, h, 0, h, 0, 0]
            },
            strokeWidth: 0,
            strokeAlpha: 0,
            fillType: 2, // Pattern
            fillColor: "#ffffff",
            fillAlpha: 1.0,
            texture: isHorizontal ? hTexture : vTexture,
            flags: {
                [MODULE_ID]: { dungeonWall: true },
                levels: { rangeTop: rangeTop } // Set rangeTop for Levels compatibility
            }
        };
        drawingsData.push(drawing);
    };

    // Draw North walls
    for (const seg of Object.values(segments.N)) {
        const px = seg.gx * gridSize;
        const py = seg.gy * gridSize - thickness;
        createPoly(px, py, seg.len * gridSize, thickness, true);
    }

    // Draw South walls
    for (const seg of Object.values(segments.S)) {
        const px = seg.gx * gridSize;
        const py = seg.gy * gridSize + gridSize;
        createPoly(px, py, seg.len * gridSize, thickness, true);
    }

    // Draw East walls
    for (const seg of Object.values(segments.E)) {
        const px = seg.gx * gridSize + gridSize;
        const py = seg.gy * gridSize;
        createPoly(px, py, thickness, seg.len * gridSize, false);
    }

    // Draw West walls
    for (const seg of Object.values(segments.W)) {
        const px = seg.gx * gridSize - thickness;
        const py = seg.gy * gridSize;
        createPoly(px, py, thickness, seg.len * gridSize, false);
    }

    // Draw corners
    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        const px = gx * gridSize;
        const py = gy * gridSize;

        const hasN = !floors.has(`${gx},${gy - 1}`);
        const hasS = !floors.has(`${gx},${gy + 1}`);
        const hasE = !floors.has(`${gx + 1},${gy}`);
        const hasW = !floors.has(`${gx - 1},${gy}`);

        if (hasN && hasW) createPoly(px - thickness, py - thickness, thickness, thickness, true);
        if (hasN && hasE) createPoly(px + gridSize, py - thickness, thickness, thickness, true);
        if (hasS && hasW) createPoly(px - thickness, py + gridSize, thickness, thickness, true);
        if (hasS && hasE) createPoly(px + gridSize, py + gridSize, thickness, thickness, true);
    }

    return drawingsData;
}


/* ═══════════════════════════════════════════════════════
   SOCKET HANDLERS (GM-side execution)
   ═══════════════════════════════════════════════════════ */

/**
 * GM handler: Fill rectangle with floor tiles
 */
async function _gmFillRectangle(data) {
    const { sceneId, minGx, maxGx, minGy, maxGy, floorTilePath, wallTilePath, noWalls, backgroundSetting } = data;
    const scene = game.scenes.get(sceneId);
    if (!scene) return { success: false, error: "Scene not found" };

    const gridSize = scene.grid.size || GRID_SIZE;

    // Detect elevation via probe tile (same pattern as handleRectangleFill)
    let elevation = 0;
    const probeTile = await scene.createEmbeddedDocuments("Tile", [{
        texture: { src: floorTilePath },
        x: minGx * gridSize,
        y: minGy * gridSize,
        width: gridSize,
        height: gridSize,
        hidden: true,
        flags: { [MODULE_ID]: { dungeonFloor: true } }
    }]);
    if (probeTile && probeTile.length > 0) {
        elevation = probeTile[0].elevation ?? 0;
        await scene.deleteEmbeddedDocuments("Tile", [probeTile[0].id]);
    }

    const tilesToCreate = [];
    const tilesToUpdate = [];

    for (let gx = minGx; gx <= maxGx; gx++) {
        for (let gy = minGy; gy <= maxGy; gy++) {
            const existing = scene.tiles.find(t =>
                Math.floor(t.x / gridSize) === gx &&
                Math.floor(t.y / gridSize) === gy &&
                t.texture?.src?.includes("Dungeon/floor_tiles")
            );

            if (existing) {
                tilesToUpdate.push({ _id: existing.id, texture: { src: floorTilePath } });
            } else {
                tilesToCreate.push({
                    texture: { src: floorTilePath },
                    x: gx * gridSize,
                    y: gy * gridSize,
                    width: gridSize,
                    height: gridSize,
                    sort: 0,
                    flags: {
                        [MODULE_ID]: { dungeonFloor: true }
                    }
                });
            }
        }
    }

    if (tilesToCreate.length > 0) {
        await scene.createEmbeddedDocuments("Tile", tilesToCreate);
    }
    if (tilesToUpdate.length > 0) {
        await scene.updateEmbeddedDocuments("Tile", tilesToUpdate);
    }

    // Create background drawing if configured
    if (backgroundSetting) {
        await ensureBackgroundDrawing(scene, elevation, backgroundSetting);
    }

    // Rebuild walls with the provided settings
    await _gmRebuildWallsInternal(scene, wallTilePath, noWalls);

    return { success: true };
}

/**
 * GM handler: Delete tiles in rectangle
 */
async function _gmDeleteRectangle(data) {
    const { sceneId, minGx, maxGx, minGy, maxGy, minPx, maxPx, minPy, maxPy, wallTilePath, noWalls, doorsOnly } = data;
    const scene = game.scenes.get(sceneId);
    if (!scene) return { success: false, error: "Scene not found" };

    const gridSize = scene.grid.size || GRID_SIZE;

    if (!doorsOnly) {
        // Delete floor tiles in range
        const tilesToDelete = [];
        for (const tile of scene.tiles) {
            if (!tile.texture?.src?.includes("Dungeon/floor_tiles")) continue;

            const tileGx = Math.floor(tile.x / gridSize);
            const tileGy = Math.floor(tile.y / gridSize);

            if (tileGx >= minGx && tileGx <= maxGx && tileGy >= minGy && tileGy <= maxGy) {
                tilesToDelete.push(tile.id);
            }
        }

        if (tilesToDelete.length > 0) {
            await scene.deleteEmbeddedDocuments("Tile", tilesToDelete);
        }
    }

    // Delete doors in range
    const doorsToDelete = [];
    for (const wall of scene.walls) {
        if (!wall.door || wall.door === 0) continue;

        const mx = (wall.c[0] + wall.c[2]) / 2;
        const my = (wall.c[1] + wall.c[3]) / 2;

        if (mx >= minPx && mx <= maxPx && my >= minPy && my <= maxPy) {
            doorsToDelete.push(wall.id);
        }
    }

    if (doorsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Wall", doorsToDelete);
    }

    // Rebuild walls
    await _gmRebuildWallsInternal(scene, wallTilePath, noWalls);

    return { success: true };
}

/**
 * GM handler: Place a door
 */
async function _gmPlaceDoor(data) {
    const { sceneId, x1, y1, x2, y2, doorTexture, wallTilePath, noWalls } = data;
    const scene = game.scenes.get(sceneId);
    if (!scene) return { success: false, error: "Scene not found" };

    const tolerance = 2;

    // Check for existing wall at coords
    const existingWall = scene.walls.find(w => {
        const c = w.c;
        const match1 = (Math.abs(c[0] - x1) < tolerance && Math.abs(c[1] - y1) < tolerance &&
            Math.abs(c[2] - x2) < tolerance && Math.abs(c[3] - y2) < tolerance);
        const match2 = (Math.abs(c[0] - x2) < tolerance && Math.abs(c[1] - y2) < tolerance &&
            Math.abs(c[2] - x1) < tolerance && Math.abs(c[3] - y1) < tolerance);
        return match1 || match2;
    });

    if (existingWall) {
        if (existingWall.door === 0) {
            const updateData = { door: 1, ds: 0 };
            if (doorTexture) {
                updateData.animation = {
                    type: "swing",
                    texture: doorTexture
                };
            }
            await existingWall.update(updateData);
        }
    } else {
        const wallData = {
            c: [x1, y1, x2, y2],
            door: 1,
            ds: 0,
            light: 20,
            move: 20,
            sound: 20,
            doorSound: "woodBasic"
        };
        if (doorTexture) {
            wallData.animation = {
                type: "swing",
                texture: doorTexture
            };
        }
        await scene.createEmbeddedDocuments("Wall", [wallData]);
    }

    // Rebuild walls
    await _gmRebuildWallsInternal(scene, wallTilePath, noWalls);

    return { success: true };
}

/**
 * GM handler: Remove a door
 */
async function _gmRemoveDoor(data) {
    const { sceneId, x1, y1, x2, y2, wallTilePath, noWalls } = data;
    const scene = game.scenes.get(sceneId);
    if (!scene) return { success: false, error: "Scene not found" };

    const tolerance = 2;

    const existingWall = scene.walls.find(w => {
        if (!w.door || w.door === 0) return false;
        const c = w.c;
        const match1 = (Math.abs(c[0] - x1) < tolerance && Math.abs(c[1] - y1) < tolerance &&
            Math.abs(c[2] - x2) < tolerance && Math.abs(c[3] - y2) < tolerance);
        const match2 = (Math.abs(c[0] - x2) < tolerance && Math.abs(c[1] - y2) < tolerance &&
            Math.abs(c[2] - x1) < tolerance && Math.abs(c[3] - y1) < tolerance);
        return match1 || match2;
    });

    if (existingWall) {
        await scene.deleteEmbeddedDocuments("Wall", [existingWall.id]);
    }

    // Rebuild walls
    await _gmRebuildWallsInternal(scene, wallTilePath, noWalls);

    return { success: true };
}

/**
 * GM handler: Rebuild walls (called directly via socket)
 */
async function _gmRebuildWalls(data) {
    const { sceneId, wallTilePath, noWalls } = data;
    const scene = game.scenes.get(sceneId);
    if (!scene) return { success: false, error: "Scene not found" };

    await _gmRebuildWallsInternal(scene, wallTilePath, noWalls);

    return { success: true };
}

/**
 * Internal wall rebuild function used by GM handlers (elevation-aware for Levels compatibility)
 */
async function _gmRebuildWallsInternal(scene, wallTilePath, noWalls) {
    const gridSize = scene.grid.size || GRID_SIZE;
    const LEVEL_HEIGHT = 10; // Each level is 10 units tall

    // Store the wall tile path for use by generate functions
    const originalWallTile = _selectedWallTile;
    if (wallTilePath) {
        _selectedWallTile = wallTilePath;
    }

    // 1. Scan all floor tiles and group by elevation
    const floorsByElevation = new Map(); // elevation -> Set of "gx,gy"

    for (const tile of scene.tiles) {
        if (tile.texture?.src?.includes("Dungeon/floor_tiles")) {
            const gx = Math.floor(tile.x / gridSize);
            const gy = Math.floor(tile.y / gridSize);
            const elevation = tile.elevation ?? 0;
            const key = `${gx},${gy}`;

            console.log(`${MODULE_ID} | [Socket] Tile at ${key} has elevation: ${tile.elevation} (using: ${elevation})`);

            if (!floorsByElevation.has(elevation)) {
                floorsByElevation.set(elevation, new Set());
            }
            floorsByElevation.get(elevation).add(key);
        }
    }

    // Get all unique elevations from floor tiles
    const floorElevations = new Set(floorsByElevation.keys());

    // Also collect elevations from existing dungeon walls and wall drawings
    // so orphaned ones (where all floor tiles were deleted) get cleaned up
    const allDungeonElevations = new Set(floorElevations);

    for (const w of scene.walls) {
        if (w.door && w.door > 0) continue;
        const bottom = w.flags?.["wall-height"]?.bottom;
        if (bottom !== undefined) allDungeonElevations.add(bottom);
    }
    for (const d of scene.drawings) {
        if (d.flags?.[MODULE_ID]?.dungeonWall) {
            allDungeonElevations.add(d.elevation ?? 0);
        }
    }

    const elevations = Array.from(allDungeonElevations).sort((a, b) => a - b);

    console.log(`${MODULE_ID} | [Socket] Found ${floorElevations.size} floor elevation levels, ${elevations.length} total dungeon elevations: [${elevations.join(', ')}]`);

    // 2. Delete existing dungeon walls (non-doors) at matching elevations
    if (!noWalls) {
        const wallsToDelete = scene.walls
            .filter(w => {
                if (w.door && w.door > 0) return false; // Keep doors
                if (w.flags?.[MODULE_ID]?.dungeonIntWall) return false; // Keep interior walls
                const bottom = w.flags?.["wall-height"]?.bottom;
                if (bottom === undefined) return false; // Not a levels-aware wall
                return elevations.some(elev => bottom === elev);
            })
            .map(w => w.id);

        console.log(`${MODULE_ID} | [Socket] Deleting ${wallsToDelete.length} walls`);
        if (wallsToDelete.length > 0) {
            await scene.deleteEmbeddedDocuments("Wall", wallsToDelete);
        }
    }

    // 3. Delete existing wall drawings at matching elevations (skip interior walls)
    const drawingsToDelete = scene.drawings
        .filter(d => {
            if (!d.flags?.[MODULE_ID]?.dungeonWall) return false;
            if (d.flags?.[MODULE_ID]?.dungeonIntWall) return false; // preserve interior walls
            const drawingElev = d.elevation ?? 0;
            return elevations.some(elev => drawingElev === elev);
        })
        .map(d => d.id);

    console.log(`${MODULE_ID} | [Socket] Deleting ${drawingsToDelete.length} drawings`);
    if (drawingsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Drawing", drawingsToDelete);
    }

    // 4. If no floors, restore original wall tile and done
    if (floorsByElevation.size === 0) {
        _selectedWallTile = originalWallTile;
        return;
    }

    // 5. Process each elevation level separately
    const tolerance = 2;

    for (const [elevation, floors] of floorsByElevation) {
        const wallHeightBottom = elevation;
        const wallHeightTop = elevation + LEVEL_HEIGHT - 1;

        console.log(`${MODULE_ID} | [Socket] Processing elevation ${elevation}: ${floors.size} floors, wall-height ${wallHeightBottom}/${wallHeightTop}`);

        // Find doors at this elevation
        const entranceEdges = [];
        const existingDoors = scene.walls.filter(w => {
            if (!w.door || w.door === 0) return false;
            const doorBottom = w.flags?.["wall-height"]?.bottom ?? 0;
            return Math.abs(doorBottom - elevation) < LEVEL_HEIGHT;
        });

        for (const door of existingDoors) {
            const [x1, y1, x2, y2] = door.c;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            const isHorizontal = Math.abs(y1 - y2) < tolerance;
            const isVertical = Math.abs(x1 - x2) < tolerance;

            if (isHorizontal) {
                const gy = Math.round(midY / gridSize);
                const gx = Math.floor(midX / gridSize);
                entranceEdges.push({ x: gx, y: gy - 1, dir: 'S' });
                entranceEdges.push({ x: gx, y: gy, dir: 'N' });
            } else if (isVertical) {
                const gx = Math.round(midX / gridSize);
                const gy = Math.floor(midY / gridSize);
                entranceEdges.push({ x: gx - 1, y: gy, dir: 'E' });
                entranceEdges.push({ x: gx, y: gy, dir: 'W' });
            }
        }

        const entranceSet = new Set(entranceEdges.map(e => `${e.x},${e.y},${e.dir}`));

        // 6. Generate and create walls for this elevation
        if (!noWalls) {
            const wallsData = generateWallsWithElevation(floors, entranceSet, gridSize, WALL_THICKNESS, wallHeightBottom, wallHeightTop);

            // Generate filler walls for doors at this elevation
            if (existingDoors.length > 0 && WALL_THICKNESS > 0) {
                for (const door of existingDoors) {
                    const [px1, py1, px2, py2] = door.c;

                    if (Math.abs(py1 - py2) < tolerance) {
                        const minX = Math.min(px1, px2);
                        const maxX = Math.max(px1, px2);
                        const y = py1;
                        wallsData.push({
                            c: [minX - WALL_THICKNESS, y, minX, y],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                        wallsData.push({
                            c: [maxX, y, maxX + WALL_THICKNESS, y],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                    } else if (Math.abs(px1 - px2) < tolerance) {
                        const minY = Math.min(py1, py2);
                        const maxY = Math.max(py1, py2);
                        const x = px1;
                        wallsData.push({
                            c: [x, minY - WALL_THICKNESS, x, minY],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                        wallsData.push({
                            c: [x, maxY, x, maxY + WALL_THICKNESS],
                            light: 20, move: 20, sound: 20,
                            flags: { "wall-height": { bottom: wallHeightBottom, top: wallHeightTop } }
                        });
                    }
                }
            }

            // Create walls in batches, then update elevation to bypass Levels hooks
            if (wallsData.length > 0) {
                const chunkSize = 100;
                for (let i = 0; i < wallsData.length; i += chunkSize) {
                    const created = await scene.createEmbeddedDocuments("Wall", wallsData.slice(i, i + chunkSize));
                    const updates = created.map(w => ({
                        _id: w.id,
                        "flags.wall-height.bottom": wallHeightBottom,
                        "flags.wall-height.top": wallHeightTop
                    }));
                    if (updates.length > 0) {
                        await scene.updateEmbeddedDocuments("Wall", updates);
                    }
                }
            }
        }

        // 7. Generate wall visuals for this elevation
        const drawingsData = generateWallVisualsWithElevation(floors, entranceSet, gridSize, WALL_THICKNESS, elevation, wallHeightTop);

        if (drawingsData.length > 0) {
            const chunkSize = 100;
            for (let i = 0; i < drawingsData.length; i += chunkSize) {
                const created = await scene.createEmbeddedDocuments("Drawing", drawingsData.slice(i, i + chunkSize));
                const updates = created.map(d => ({
                    _id: d.id,
                    elevation: elevation,
                    "flags.levels.rangeTop": wallHeightTop
                }));
                if (updates.length > 0) {
                    await scene.updateEmbeddedDocuments("Drawing", updates);
                }
            }
        }
    }

    // Restore original wall tile selection
    _selectedWallTile = originalWallTile;
}

