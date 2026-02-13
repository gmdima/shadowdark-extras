/**
 * SDX Dungeon Painter - Room/Dungeon mapping tool
 * Paints floor tiles, auto-generates walls and wall visuals, and supports doors
 */

const MODULE_ID = "shadowdark-extras";
const FLOOR_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/floor_tiles`;
const WALL_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/wall_tiles`;
const DOOR_TILE_FOLDER = `modules/${MODULE_ID}/assets/Dungeon/door_tiles`;

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
let _dungeonMode = "tiles"; // "tiles" or "doors"
let _paintEnabled = false;
let _isDragging = false;
let _dragStart = null;
let _isShiftHeld = false;
let _selectionRect = null;
let _rebuildTimeout = null;

/**
 * Load dungeon tile assets
 */
export async function loadDungeonAssets() {
    if (_floorTiles) return;

    // Ensure folder structure exists
    await ensureDungeonFolders();

    // Load floor tiles
    _floorTiles = await loadTilesFromFolder(FLOOR_TILE_FOLDER, "floor");

    // Load wall tiles
    _wallTiles = await loadTilesFromFolder(WALL_TILE_FOLDER, "wall");

    // Load door tiles
    _doorTiles = await loadTilesFromFolder(DOOR_TILE_FOLDER, "door");

    // Select first floor tile by default
    if (_floorTiles.length > 0 && !_selectedFloorTile) {
        _selectedFloorTile = _floorTiles[0].path;
    }

    // Select first wall tile by default
    if (_wallTiles.length > 0 && !_selectedWallTile) {
        _selectedWallTile = _wallTiles[0].path;
    }

    // Select first door tile by default (prefer horizontal if available)
    if (_doorTiles.length > 0 && !_selectedDoorTile) {
        const horizontalDoor = _doorTiles.find(t => t.key.toLowerCase().includes("horizontal"));
        _selectedDoorTile = horizontalDoor ? horizontalDoor.path : _doorTiles[0].path;
    }

    console.log(`${MODULE_ID} | Loaded ${_floorTiles.length} floor tiles, ${_wallTiles.length} wall tiles, ${_doorTiles.length} door tiles`);
}

/**
 * Ensure dungeon asset folders exist
 */
async function ensureDungeonFolders() {
    const basePath = `modules/${MODULE_ID}/assets/Dungeon`;
    const folders = ["floor_tiles", "wall_tiles", "door_tiles"];

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
export function getDungeonPainterData() {
    return {
        dungeonMode: _dungeonMode,
        floorTiles: (_floorTiles || []).map(t => ({
            ...t,
            active: t.path === _selectedFloorTile
        })),
        wallTiles: (_wallTiles || []).map(t => ({
            ...t,
            active: t.path === _selectedWallTile
        })),
        doorTiles: (_doorTiles || []).map(t => ({
            ...t,
            active: t.path === _selectedDoorTile
        })),
        selectedFloorTile: _selectedFloorTile,
        selectedWallTile: _selectedWallTile,
        selectedDoorTile: _selectedDoorTile,
        hasFloorTiles: (_floorTiles && _floorTiles.length > 0),
        hasWallTiles: (_wallTiles && _wallTiles.length > 0),
        hasDoorTiles: (_doorTiles && _doorTiles.length > 0)
    };
}

/**
 * Set dungeon mode
 */
export function setDungeonMode(mode) {
    if (mode === "tiles" || mode === "doors") {
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
 * Get selected door tile path
 */
export function getSelectedDoorTile() {
    return _selectedDoorTile;
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
    if (_dungeonMode === "tiles" || (_dungeonMode === "doors" && _isShiftHeld)) {
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

    if (isDeleting) {
        // Delete floor tiles in range
        const tilesToDelete = [];
        const doorsToDelete = [];

        for (const tile of scene.tiles) {
            if (!tile.texture?.src?.includes("Dungeon/floor_tiles")) continue;

            const tileGx = Math.floor(tile.x / gridSize);
            const tileGy = Math.floor(tile.y / gridSize);

            if (tileGx >= minGx && tileGx <= maxGx && tileGy >= minGy && tileGy <= maxGy) {
                tilesToDelete.push(tile.id);
            }
        }

        // Also delete doors in range
        for (const wall of scene.walls) {
            if (!wall.door || wall.door === 0) continue;

            const mx = (wall.c[0] + wall.c[2]) / 2;
            const my = (wall.c[1] + wall.c[3]) / 2;

            if (mx >= minPx && mx <= maxPx && my >= minPy && my <= maxPy) {
                doorsToDelete.push(wall.id);
            }
        }

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
                    // Update existing tile texture
                    tilesToUpdate.push({ _id: existing.id, texture: { src: _selectedFloorTile } });
                } else {
                    tilesToCreate.push({
                        texture: { src: _selectedFloorTile },
                        x: gx * gridSize,
                        y: gy * gridSize,
                        width: gridSize,
                        height: gridSize,
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

    const minPx = Math.min(startPos.x, endPos.x);
    const maxPx = Math.max(startPos.x, endPos.x);
    const minPy = Math.min(startPos.y, endPos.y);
    const maxPy = Math.max(startPos.y, endPos.y);

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

    // Check for existing wall/door at coords
    const tolerance = 2;
    const existingWall = scene.walls.find(w => {
        const c = w.c;
        const match1 = (Math.abs(c[0] - x1) < tolerance && Math.abs(c[1] - y1) < tolerance &&
            Math.abs(c[2] - x2) < tolerance && Math.abs(c[3] - y2) < tolerance);
        const match2 = (Math.abs(c[0] - x2) < tolerance && Math.abs(c[1] - y2) < tolerance &&
            Math.abs(c[2] - x1) < tolerance && Math.abs(c[3] - y1) < tolerance);
        return match1 || match2;
    });

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
 * Rebuild walls around floor tiles
 */
async function rebuildWalls(scene) {
    if (!scene) return;

    const gridSize = canvas.grid.size || GRID_SIZE;

    // 1. Scan all floor tiles
    const floors = new Set();
    for (const tile of scene.tiles) {
        if (tile.texture?.src?.includes("Dungeon/floor_tiles")) {
            const gx = Math.floor(tile.x / gridSize);
            const gy = Math.floor(tile.y / gridSize);
            floors.add(`${gx},${gy}`);
        }
    }

    // 2. Delete existing walls EXCEPT doors
    const wallsToDelete = scene.walls
        .filter(w => !w.door || w.door === 0)
        .map(w => w.id);

    if (wallsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Wall", wallsToDelete);
    }

    // 3. Delete existing wall drawings
    const drawingsToDelete = scene.drawings
        .filter(d => d.flags?.[MODULE_ID]?.dungeonWall)
        .map(d => d.id);

    if (drawingsToDelete.length > 0) {
        await scene.deleteEmbeddedDocuments("Drawing", drawingsToDelete);
    }

    // 4. If no floors, done
    if (floors.size === 0) return;

    // 5. Identify door edges to skip
    const entranceEdges = [];
    const existingDoors = scene.walls.filter(w => w.door > 0);
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

    // 6. Generate walls
    const wallsData = generateWalls(floors, entranceSet, gridSize, WALL_THICKNESS);

    // 7. Generate filler walls for doors
    if (existingDoors.length > 0 && WALL_THICKNESS > 0) {
        for (const door of existingDoors) {
            const [px1, py1, px2, py2] = door.c;

            if (Math.abs(py1 - py2) < tolerance) {
                // Horizontal door
                const minX = Math.min(px1, px2);
                const maxX = Math.max(px1, px2);
                const y = py1;
                wallsData.push({ c: [minX - WALL_THICKNESS, y, minX, y], light: 20, move: 20, sound: 20 });
                wallsData.push({ c: [maxX, y, maxX + WALL_THICKNESS, y], light: 20, move: 20, sound: 20 });
            } else if (Math.abs(px1 - px2) < tolerance) {
                // Vertical door
                const minY = Math.min(py1, py2);
                const maxY = Math.max(py1, py2);
                const x = px1;
                wallsData.push({ c: [x, minY - WALL_THICKNESS, x, minY], light: 20, move: 20, sound: 20 });
                wallsData.push({ c: [x, maxY, x, maxY + WALL_THICKNESS], light: 20, move: 20, sound: 20 });
            }
        }
    }

    // 8. Create walls in batches
    if (wallsData.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < wallsData.length; i += chunkSize) {
            await scene.createEmbeddedDocuments("Wall", wallsData.slice(i, i + chunkSize));
        }
    }

    // 9. Generate wall visuals
    const drawingsData = generateWallVisuals(floors, entranceSet, gridSize, WALL_THICKNESS);

    if (drawingsData.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < drawingsData.length; i += chunkSize) {
            await scene.createEmbeddedDocuments("Drawing", drawingsData.slice(i, i + chunkSize));
        }
    }

    console.log(`${MODULE_ID} | Rebuilt ${wallsData.length} walls and ${drawingsData.length} wall visuals`);
}

/**
 * Generate wall documents
 */
function generateWalls(floors, entranceSet, gridSize, thickness) {
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

            // Draw wall if neighbor is void
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
                    sound: 20
                });
            }
        }
    }

    return wallsData;
}

/**
 * Generate wall visual drawings
 */
function generateWallVisuals(floors, entranceSet, gridSize, thickness) {
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

    // Create polygon drawing helper
    const createPoly = (px, py, w, h, isHorizontal) => {
        const drawing = {
            author: game.user.id,
            x: px,
            y: py,
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
                [MODULE_ID]: { dungeonWall: true }
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
