import { BIOME_TILES, BIOME_TINTS } from "./HexGeneratorSD.mjs";

const MODULE_ID = "shadowdark-extras";
const TILE_FOLDER = `modules/${MODULE_ID}/assets/tiles`;
const CUSTOM_TILE_FOLDER = "hexes";
const COLORED_TILE_FOLDER = `modules/${MODULE_ID}/assets/Hexes`;
const SYMBOLS_TILE_FOLDER = `modules/${MODULE_ID}/assets/symbols`;
const HEX_TILE_W = 296;
const HEX_TILE_H = 256;
const COLORED_HEX_TILE_W = 572;
const COLORED_HEX_TILE_H = 500;
const SCENE_BUFFER = 768;

// Biome subdirectories for custom tiles (matching the 6 sliders)
const BIOME_SUBDIRS = ["water", "vegetation", "mountains", "desert", "swamp", "badlands"];

// Biome subdirectories for colored tiles (from assets/Hexes)
const COLORED_BIOME_SUBDIRS = ["Water", "Vegetation", "Mountains", "Desert", "swamp", "Badlands", "snow", "Specials"];

// Subdirectories for symbol tiles (from assets/symbols)
const SYMBOLS_SUBDIRS = ["Banners", "Buildings", "Details", "Foliage", "Mountains", "Symbols"];

let _tiles = null;           // Default tiles from module
let _customTiles = null;     // Custom tiles from data/hexes
let _coloredTiles = null;    // Colored tiles from assets/Hexes
let _symbolTiles = null;     // Symbol tiles from assets/symbols
let _chosenTiles = new Set();
let _searchFilter = "";
let _waterEffect = false;
let _windEffect = false;
let _fogAnimation = false;
let _tintEnabled = false;
let _bwEffect = false;
let _brushActive = false;
let _lastCell = null;
let _paintEnabled = false;
let _isPainting = false;
let _isGenerating = false;

let _mapColumns = 15;
let _mapRows = 15;

// Custom tile sizing
let _customTileWidth = 296;
let _customTileHeight = 256;

// Active tile tab ("default", "custom", or "colored")
let _activeTileTab = "default";

// Use custom tiles for generation
let _useCustomForGeneration = false;

export async function loadTileAssets() {
    if (_tiles) return;

    // Load saved custom tile dimensions
    loadCustomTileDimensions();

    try {
        const listing = await FilePicker.browse("data", TILE_FOLDER);
        const pngFiles = (listing.files || []).filter(f => f.endsWith(".png"));

        _tiles = pngFiles
            .map(path => {
                const filename = path.split("/").pop().replace(".png", "");
                const raw = filename.replace(/^hex-tile-/, "");
                return {
                    key: raw,
                    label: _formatLabel(raw),
                    path,
                    isCustom: false
                };
            })
            .sort((a, b) => a.key.localeCompare(b.key));

        if (_tiles.length && _chosenTiles.size === 0) {
            _chosenTiles.add(_tiles[0].path);
        }
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to discover hex tiles:`, err);
        _tiles = [];
    }

    // Load custom tiles
    await loadCustomTileAssets();

    // Load colored tiles
    await loadColoredTileAssets();

    // Load symbol tiles
    await loadSymbolTileAssets();
}

/**
 * Ensure the custom hexes folder structure exists
 */
async function ensureCustomFolderStructure() {
    try {
        // Check if data/hexes folder exists
        let hexesExists = false;
        try {
            await FilePicker.browse("data", CUSTOM_TILE_FOLDER);
            hexesExists = true;
        } catch (e) {
            hexesExists = false;
        }

        // Create main hexes folder if it doesn't exist
        if (!hexesExists) {
            await FilePicker.createDirectory("data", CUSTOM_TILE_FOLDER);
            console.log(`${MODULE_ID} | Created ${CUSTOM_TILE_FOLDER} folder`);
        }

        // Create biome subdirectories
        for (const biome of BIOME_SUBDIRS) {
            const biomePath = `${CUSTOM_TILE_FOLDER}/${biome}`;
            try {
                await FilePicker.browse("data", biomePath);
            } catch (e) {
                // Folder doesn't exist, create it
                await FilePicker.createDirectory("data", biomePath);
                console.log(`${MODULE_ID} | Created ${biomePath} folder`);
            }
        }
    } catch (err) {
        console.warn(`${MODULE_ID} | Could not create custom tile folder structure:`, err);
    }
}

/**
 * Load custom tiles from data/hexes folder
 */
async function loadCustomTileAssets() {
    _customTiles = [];

    // First ensure the folder structure exists
    await ensureCustomFolderStructure();

    try {
        // Load tiles from main hexes folder
        const mainListing = await FilePicker.browse("data", CUSTOM_TILE_FOLDER);
        const mainPngFiles = (mainListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

        for (const path of mainPngFiles) {
            const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
            _customTiles.push({
                key: filename,
                label: _formatLabel(filename),
                path,
                isCustom: true,
                biome: null  // No biome for root folder tiles
            });
        }

        // Load tiles from each biome subdirectory
        for (const biome of BIOME_SUBDIRS) {
            const biomePath = `${CUSTOM_TILE_FOLDER}/${biome}`;
            try {
                const biomeListing = await FilePicker.browse("data", biomePath);
                const biomePngFiles = (biomeListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

                for (const path of biomePngFiles) {
                    const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
                    _customTiles.push({
                        key: filename,
                        label: _formatLabel(filename),
                        path,
                        isCustom: true,
                        biome: biome
                    });
                }
            } catch (err) {
                // Subdirectory might not exist yet, that's okay
            }
        }

        _customTiles.sort((a, b) => a.key.localeCompare(b.key));
        console.log(`${MODULE_ID} | Loaded ${_customTiles.length} custom tiles`);
    } catch (err) {
        console.warn(`${MODULE_ID} | Could not load custom tiles:`, err);
        _customTiles = [];
    }
}

/**
 * Load colored tiles from assets/Hexes folder (inside the module)
 */
async function loadColoredTileAssets() {
    _coloredTiles = [];

    try {
        // Load tiles from main Hexes folder
        const mainListing = await FilePicker.browse("data", COLORED_TILE_FOLDER);
        const mainPngFiles = (mainListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

        for (const path of mainPngFiles) {
            const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
            _coloredTiles.push({
                key: filename,
                label: _formatLabel(filename),
                path,
                isColored: true,
                biome: null  // No biome for root folder tiles
            });
        }

        // Load tiles from each biome subdirectory
        for (const biome of COLORED_BIOME_SUBDIRS) {
            const biomePath = `${COLORED_TILE_FOLDER}/${biome}`;
            try {
                const biomeListing = await FilePicker.browse("data", biomePath);
                const biomePngFiles = (biomeListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

                for (const path of biomePngFiles) {
                    const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
                    _coloredTiles.push({
                        key: filename,
                        label: _formatLabel(filename),
                        path,
                        isColored: true,
                        biome: biome.toLowerCase()  // Normalize to lowercase
                    });
                }
            } catch (err) {
                // Subdirectory might not exist, that's okay
            }
        }

        _coloredTiles.sort((a, b) => a.key.localeCompare(b.key));
        console.log(`${MODULE_ID} | Loaded ${_coloredTiles.length} colored tiles`);
    } catch (err) {
        console.warn(`${MODULE_ID} | Could not load colored tiles:`, err);
        _coloredTiles = [];
    }
}

/**
 * Load symbol tiles from assets/symbols folder (inside the module)
 */
async function loadSymbolTileAssets() {
    _symbolTiles = [];

    try {
        // Load tiles from main symbols folder
        const mainListing = await FilePicker.browse("data", SYMBOLS_TILE_FOLDER);
        const mainPngFiles = (mainListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

        for (const path of mainPngFiles) {
            const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
            _symbolTiles.push({
                key: filename,
                label: _formatLabel(filename),
                path,
                isSymbol: true,
                category: null
            });
        }

        // Load tiles from each subdirectory
        for (const category of SYMBOLS_SUBDIRS) {
            const categoryPath = `${SYMBOLS_TILE_FOLDER}/${category}`;
            try {
                const categoryListing = await FilePicker.browse("data", categoryPath);
                const categoryPngFiles = (categoryListing.files || []).filter(f => f.endsWith(".png") || f.endsWith(".webp"));

                for (const path of categoryPngFiles) {
                    const filename = path.split("/").pop().replace(/\.(png|webp)$/, "");
                    _symbolTiles.push({
                        key: filename,
                        label: _formatLabel(filename),
                        path,
                        isSymbol: true,
                        category: category.toLowerCase()
                    });
                }
            } catch (err) {
                // Subdirectory might not exist, that's okay
            }
        }

        _symbolTiles.sort((a, b) => a.key.localeCompare(b.key));
        console.log(`${MODULE_ID} | Loaded ${_symbolTiles.length} symbol tiles`);
    } catch (err) {
        console.warn(`${MODULE_ID} | Could not load symbol tiles:`, err);
        _symbolTiles = [];
    }
}

/**
 * Get symbol tiles array
 */
export function getSymbolTiles() {
    return _symbolTiles || [];
}

/**
 * Get filtered symbol tiles (by search filter)
 */
export function getFilteredSymbolTiles() {
    if (!_symbolTiles) return [];
    if (!_searchFilter) return _symbolTiles;
    return _symbolTiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
}

/**
 * Get custom tiles organized by biome for the generator
 */
export function getCustomTilesByBiome() {
    if (!_customTiles) return {};

    const byBiome = {
        water: [],
        vegetation: [],  // Maps to forest/grassland
        mountains: [],
        desert: [],
        swamp: [],
        badlands: [],
        other: []  // Tiles in root folder
    };

    for (const tile of _customTiles) {
        if (tile.biome && byBiome[tile.biome]) {
            byBiome[tile.biome].push(tile.path);
        } else {
            byBiome.other.push(tile.path);
        }
    }

    return byBiome;
}

/**
 * Get colored tiles organized by biome for the generator
 */
export function getColoredTilesByBiome() {
    if (!_coloredTiles) return {};

    const byBiome = {
        water: [],
        vegetation: [],  // Maps to forest/grassland
        mountains: [],
        desert: [],
        swamp: [],
        badlands: [],
        snow: [],
        other: []  // Tiles in root folder
    };

    for (const tile of _coloredTiles) {
        if (tile.biome && tile.biome === "specials") {
            // Exclude specials from generator
            continue;
        }
        if (tile.biome && byBiome[tile.biome]) {
            byBiome[tile.biome].push(tile.path);
        } else {
            byBiome.other.push(tile.path);
        }
    }

    return byBiome;
}

/**
 * Get colored tile dimensions (fixed size)
 */
export function getColoredTileDimensions() {
    return { width: COLORED_HEX_TILE_W, height: COLORED_HEX_TILE_H };
}

/**
 * Check if custom tiles should be used for generation
 */
export function isUseCustomForGeneration() {
    return _useCustomForGeneration;
}

/**
 * Toggle use of custom tiles for generation
 */
export function toggleUseCustomForGeneration() {
    _useCustomForGeneration = !_useCustomForGeneration;
}

/**
 * Set use of custom tiles for generation
 */
export function setUseCustomForGeneration(value) {
    _useCustomForGeneration = !!value;
}

/**
 * Get current custom tile dimensions
 */
export function getCustomTileDimensions() {
    return { width: _customTileWidth, height: _customTileHeight };
}

/**
 * Set custom tile dimensions and persist to settings
 */
export function setCustomTileDimension(axis, value) {
    const clamped = Math.max(50, Math.min(1000, parseInt(value) || 296));
    if (axis === "width") {
        _customTileWidth = clamped;
        game.settings.set(MODULE_ID, "hexPainter.customTileWidth", clamped);
    }
    if (axis === "height") {
        _customTileHeight = clamped;
        game.settings.set(MODULE_ID, "hexPainter.customTileHeight", clamped);
    }
}

/**
 * Load custom tile dimensions from settings
 */
export function loadCustomTileDimensions() {
    try {
        _customTileWidth = game.settings.get(MODULE_ID, "hexPainter.customTileWidth") || 296;
        _customTileHeight = game.settings.get(MODULE_ID, "hexPainter.customTileHeight") || 256;
    } catch (e) {
        // Settings not registered yet, use defaults
        _customTileWidth = 296;
        _customTileHeight = 256;
    }
}

/**
 * Get active tile tab
 */
export function getActiveTileTab() {
    return _activeTileTab;
}

/**
 * Set active tile tab
 */
export function setActiveTileTab(tab) {
    if (tab === "custom" || tab === "colored" || tab === "symbols") {
        _activeTileTab = tab;
    } else {
        _activeTileTab = "default";
    }
}

/**
 * Get colored tiles array
 */
export function getColoredTiles() {
    return _coloredTiles || [];
}

/**
 * Get filtered colored tiles (by search filter)
 */
export function getFilteredColoredTiles() {
    if (!_coloredTiles) return [];
    if (!_searchFilter) return _coloredTiles;
    return _coloredTiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
}

/**
 * Get custom tiles array
 */
export function getCustomTiles() {
    return _customTiles || [];
}

export function getHexPainterData() {
    if (!_tiles) return {
        hexTiles: [],
        hexCustomTiles: [],
        hexColoredTiles: [],
        hexSymbolTiles: [],
        hexColumns: _mapColumns,
        hexRows: _mapRows,
        hexSearchFilter: "",
        activeTileTab: _activeTileTab,
        useCustomForGeneration: _useCustomForGeneration,
        customTileWidth: _customTileWidth,
        customTileHeight: _customTileHeight,
        coloredTileWidth: COLORED_HEX_TILE_W,
        coloredTileHeight: COLORED_HEX_TILE_H,
        hasCustomTiles: false,
        hasColoredTiles: false,
        hasSymbolTiles: false,
        waterEffect: _waterEffect,
        windEffect: _windEffect,
        fogAnimation: _fogAnimation,
        tintEnabled: _tintEnabled,
        bwEffect: _bwEffect
    };

    const filteredTiles = getFilteredTiles();
    const hexTiles = filteredTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path)
    }));

    // Filter custom tiles
    const filteredCustomTiles = getFilteredCustomTiles();
    const hexCustomTiles = filteredCustomTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        biome: t.biome
    }));

    // Filter colored tiles
    const filteredColoredTiles = getFilteredColoredTiles();
    const hexColoredTiles = filteredColoredTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        biome: t.biome
    }));

    // Filter symbol tiles
    const filteredSymbolTiles = getFilteredSymbolTiles();
    const hexSymbolTiles = filteredSymbolTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        category: t.category
    }));

    return {
        hexTiles,
        hexCustomTiles,
        hexColoredTiles,
        hexSymbolTiles,
        hexColumns: _mapColumns,
        hexRows: _mapRows,
        hexSearchFilter: _searchFilter,
        activeTileTab: _activeTileTab,
        useCustomForGeneration: _useCustomForGeneration,
        customTileWidth: _customTileWidth,
        customTileHeight: _customTileHeight,
        coloredTileWidth: COLORED_HEX_TILE_W,
        coloredTileHeight: COLORED_HEX_TILE_H,
        hasCustomTiles: (_customTiles && _customTiles.length > 0),
        hasColoredTiles: (_coloredTiles && _coloredTiles.length > 0),
        hasSymbolTiles: (_symbolTiles && _symbolTiles.length > 0),
        waterEffect: _waterEffect,
        windEffect: _windEffect,
        fogAnimation: _fogAnimation,
        tintEnabled: _tintEnabled,
        bwEffect: _bwEffect
    };
}

export function getFilteredCustomTiles() {
    if (!_customTiles) return [];
    if (!_searchFilter) return _customTiles;
    return _customTiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
}

export function toggleTileSelection(tilePath) {
    if (_chosenTiles.has(tilePath)) {
        _chosenTiles.delete(tilePath);
    } else {
        _chosenTiles.add(tilePath);
    }
}

export function setSearchFilter(term) {
    _searchFilter = term.toLowerCase();
}

export function getSearchFilter() {
    return _searchFilter;
}

export function getFilteredTiles() {
    if (!_tiles) return [];
    if (!_searchFilter) return _tiles;
    return _tiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
}

export function isPainting() {
    return _isPainting || _isGenerating;
}

export function setGenerating(v) {
    _isGenerating = !!v;
}

export function toggleWaterEffect() {
    _waterEffect = !_waterEffect;
}

export function isWaterEffect() {
    return _waterEffect;
}

export function toggleWindEffect() {
    _windEffect = !_windEffect;
}

export function isWindEffect() {
    return _windEffect;
}

export function toggleFogAnimation() {
    _fogAnimation = !_fogAnimation;
}

export function isFogAnimation() {
    return _fogAnimation;
}

export function toggleTintEnabled() {
    _tintEnabled = !_tintEnabled;
}

export function isTintEnabled() {
    return _tintEnabled;
}

export function toggleBwEffect() {
    _bwEffect = !_bwEffect;
}

export function isBwEffect() {
    return _bwEffect;
}

export function setMapDimension(axis, value) {
    const clamped = Math.max(5, Math.min(50, parseInt(value) || 15));
    if (axis === "columns") _mapColumns = clamped;
    if (axis === "rows") _mapRows = clamped;
}

export function getMapDimensions() {
    return { columns: _mapColumns, rows: _mapRows };
}

export async function formatActiveScene() {
    const scene = canvas.scene;
    if (!scene) {
        ui.notifications.error("SDX | No active scene to format.");
        return;
    }

    const pxW = Math.ceil(HEX_TILE_W * 0.75 * _mapColumns + HEX_TILE_W * 0.25) + SCENE_BUFFER;
    const pxH = (_mapRows * HEX_TILE_H) + Math.ceil(HEX_TILE_H / 2) + SCENE_BUFFER;

    const sceneData = {
        width: pxW,
        height: pxH,
        padding: 0,
        backgroundColor: "#3C3836",
        "grid.type": CONST.GRID_TYPES.HEXODDQ,
        "grid.size": HEX_TILE_H,
        "grid.distance": 6,
        "grid.units": "mi",
        "background.src": null
    };

    try {
        ui.notifications.info(`SDX | Formatting scene to ${_mapColumns}×${_mapRows} hexes…`);
        await scene.update(sceneData);

        let tries = 0;
        while (tries < 40) {
            const rect = canvas.dimensions.sceneRect || canvas.dimensions;
            if (Math.abs((rect.width || 0) - pxW) < 2) break;
            await new Promise(r => setTimeout(r, 120));
            tries++;
        }

        await scene.setFlag(MODULE_ID, "hexScene", true);
        ui.notifications.info("SDX | Scene formatted for hex painting.");
    } catch (err) {
        console.error(`${MODULE_ID} | Scene format failed:`, err);
        ui.notifications.error("SDX | Could not format the scene.");
    }
}

export function enablePainting() {
    _paintEnabled = true;
}

export function disablePainting() {
    _paintEnabled = false;
    _brushActive = false;
    _lastCell = null;
    _chosenTiles.clear();
}

export function bindCanvasEvents() {
    if (!canvas.stage) return;

    canvas.stage.off("mousedown", _onPointerDown);
    canvas.stage.off("mousemove", _onPointerMove);
    canvas.stage.off("mouseup", _onPointerUp);
    canvas.stage.off("mouseupoutside", _onPointerUp);

    canvas.stage.on("mousedown", _onPointerDown);
    canvas.stage.on("mousemove", _onPointerMove);
    canvas.stage.on("mouseup", _onPointerUp);
    canvas.stage.on("mouseupoutside", _onPointerUp);
}

function _isToolActive() {
    return _paintEnabled;
}

function _onPointerDown(ev) {
    if (!_isToolActive()) return;
    // Only respond to left mouse button (button 0)
    const button = ev.data?.button ?? ev.data?.originalEvent?.button ?? 0;
    if (button !== 0) return;

    _brushActive = true;
    _isPainting = true;
    _lastCell = null;  // Reset to allow painting on any cell
    _stampAtPointer(ev, true);  // Force stamp on click
}

function _onPointerMove(ev) {
    if (_brushActive) _stampAtPointer(ev, false);
}

function _onPointerUp() {
    _brushActive = false;
    _isPainting = false;
    _lastCell = null;
}

async function _stampAtPointer(ev, forceStamp = false) {
    if (!_isToolActive()) return;

    const pos = ev.data?.getLocalPosition?.(canvas.stage);
    if (!pos) return;  // Safety check

    const cell = canvas.grid.getOffset(pos);
    if (!cell) return;  // Safety check

    const cellKey = `${cell.i}:${cell.j}`;

    // Skip if same cell (unless forced on initial click)
    if (!forceStamp && cellKey === _lastCell) return;
    _lastCell = cellKey;

    const center = canvas.grid.getCenterPoint(cell);
    if (!center) return;  // Safety check

    const verticalNudge = 0;

    // Use a more generous tolerance for finding existing tiles at this position
    // This helps when tiles have slightly different sizes/positions
    const tolerance = Math.max(20, canvas.grid.size * 0.15);
    const occupants = canvas.tiles.placeables.filter(t => {
        const cx = t.document.x + t.document.width / 2;
        const cy = t.document.y + t.document.height / 2;
        return Math.abs(cx - center.x) < tolerance &&
            Math.abs(cy - (center.y - verticalNudge)) < tolerance;
    });

    const erasing = ev.data?.originalEvent?.shiftKey ?? false;
    if (erasing) {
        if (occupants.length) {
            await canvas.scene.deleteEmbeddedDocuments("Tile", occupants.map(t => t.id));
        }
        return;
    }

    if (_chosenTiles.size === 0) {
        ui.notifications.warn("SDX | Pick at least one tile first.");
        _brushActive = false;
        return;
    }

    // Filter chosen tiles based on active tab
    let availableTiles = Array.from(_chosenTiles);

    if (_activeTileTab === "symbols") {
        availableTiles = availableTiles.filter(path => _symbolTiles && _symbolTiles.some(t => t.path === path));
    } else if (_activeTileTab === "custom") {
        availableTiles = availableTiles.filter(path => _customTiles && _customTiles.some(t => t.path === path));
    } else if (_activeTileTab === "colored") {
        availableTiles = availableTiles.filter(path => _coloredTiles && _coloredTiles.some(t => t.path === path));
    } else {
        // Default tab - include basic tiles (not custom/colored/symbols)
        availableTiles = availableTiles.filter(path => {
            const isSymbol = _symbolTiles && _symbolTiles.some(t => t.path === path);
            const isCustom = _customTiles && _customTiles.some(t => t.path === path);
            const isColored = _coloredTiles && _coloredTiles.some(t => t.path === path);
            return !isSymbol && !isCustom && !isColored;
        });
    }

    if (availableTiles.length === 0) {
        ui.notifications.warn(`SDX | No tiles selected in the "${_activeTileTab}" tab.`);
        _brushActive = false;
        return;
    }

    const chosenTile = availableTiles[Math.floor(Math.random() * availableTiles.length)];

    // Check if the chosen tile is a symbol, custom, or colored tile
    const isSymbolTile = _symbolTiles && _symbolTiles.some(t => t.path === chosenTile);
    const isCustomTile = _customTiles && _customTiles.some(t => t.path === chosenTile);
    const isColoredTile = _coloredTiles && _coloredTiles.some(t => t.path === chosenTile);

    // Only delete existing tiles if NOT painting symbols (symbols stack on top)
    if (!isSymbolTile && occupants.length) {
        await canvas.scene.deleteEmbeddedDocuments("Tile", occupants.map(t => t.id));
    }

    // Determine tile dimensions based on type
    let tw, th;
    if (isSymbolTile) {
        // For symbols, get original image size and scale by 0.5
        try {
            const img = await loadTexture(chosenTile);
            tw = Math.floor(img.width * 0.5);
            th = Math.floor(img.height * 0.5);
        } catch (e) {
            // Fallback to default size if image can't be loaded
            tw = 128;
            th = 128;
        }
    } else if (isColoredTile) {
        tw = COLORED_HEX_TILE_W;
        th = COLORED_HEX_TILE_H;
    } else if (isCustomTile) {
        tw = _customTileWidth;
        th = _customTileHeight;
    } else {
        tw = HEX_TILE_W;
        th = HEX_TILE_H;
    }

    let tintData = undefined;
    if (_tintEnabled) {
        let foundBiome = null;

        // Map biome folder names to BIOME_TINTS keys
        const biomeToTint = {
            water: "water",
            vegetation: "forest",
            mountains: "mountains",
            desert: "desert",
            swamp: "swamp",
            badlands: "badlands",
            snow: "snowyMountains"
        };

        // Check if this is a colored tile first
        if (isColoredTile) {
            const coloredTile = _coloredTiles.find(t => t.path === chosenTile);
            if (coloredTile && coloredTile.biome) {
                foundBiome = biomeToTint[coloredTile.biome] || null;
            }
        } else if (isCustomTile) {
            // Check if this is a custom tile
            const customTile = _customTiles.find(t => t.path === chosenTile);
            if (customTile && customTile.biome) {
                foundBiome = biomeToTint[customTile.biome] || null;
            }
        } else {
            // Default tile - extract filename and find biome
            const filename = chosenTile.split("/").pop();
            for (const [biome, files] of Object.entries(BIOME_TILES)) {
                if (files.includes(filename)) {
                    foundBiome = biome;
                    break;
                }
            }
        }

        if (foundBiome && BIOME_TINTS[foundBiome]) {
            tintData = Color.from(BIOME_TINTS[foundBiome]).css;
        }
    }

    const tileData = {
        texture: {
            src: chosenTile,
            tint: tintData
        },
        x: (isSymbolTile ? pos.x : center.x) - tw / 2,
        y: (isSymbolTile ? pos.y : center.y) - th / 2 - verticalNudge,
        width: tw,
        height: th,
        // Symbols get a much higher sort value to appear on top of hex tiles
        sort: isSymbolTile ? Math.floor(center.y) + 100000 : Math.floor(center.y),
        flags: {
            [MODULE_ID]: {
                painted: true,
                isSymbol: isSymbolTile || undefined
            }
        }
    };

    let createdTiles;
    try {
        createdTiles = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to create tile:`, err);
        return;
    }

    if (window.TokenMagic && createdTiles && createdTiles.length > 0) {
        const tileId = createdTiles[0].id;
        const tileObj = canvas.tiles.placeables.find(t => t.document.id === tileId);
        if (tileObj) {
            const allParams = [];

            if (_waterEffect) {
                // Always add distortion effect
                allParams.push(
                    {
                        "filterType": "distortion",
                        "filterId": "Sea",
                        "maskPath": "modules/tokenmagic/fx/assets/distortion-1.png",
                        "maskSpriteScaleX": 5,
                        "maskSpriteScaleY": 5,
                        "padding": 20,
                        "animated": {
                            "maskSpriteX": {
                                "active": true,
                                "speed": 0.05,
                                "animType": "move"
                            },
                            "maskSpriteY": {
                                "active": true,
                                "speed": 0.07,
                                "animType": "move"
                            }
                        },
                        "rank": 10003,
                        "enabled": true
                    }
                );
                // Only add adjustment filter for non-colored tiles (colored tiles already have nice colors)
                if (!isColoredTile) {
                    allParams.push(
                        {
                            "filterType": "adjustment",
                            "filterId": "Sea",
                            "saturation": 0.99,
                            "brightness": 0.29,
                            "contrast": 1.68,
                            "gamma": 0.1,
                            "red": 0.67,
                            "green": 0.9,
                            "blue": 1.24,
                            "alpha": 0.74,
                            "animated": {},
                            "rank": 10005,
                            "enabled": true
                        }
                    );
                }
            }

            if (_windEffect) {
                allParams.push(
                    {
                        "filterType": "distortion",
                        "filterId": "Wind",
                        "maskPath": "modules/tokenmagic/fx/assets/distortion-1.png",
                        "maskSpriteScaleX": 0.3,
                        "maskSpriteScaleY": 0,
                        "padding": 177,
                        "animated": {
                            "maskSpriteX": {
                                "active": true,
                                "speed": 0.05,
                                "animType": "move"
                            },
                            "maskSpriteY": {
                                "active": true,
                                "speed": 0.07,
                                "animType": "move"
                            },
                            "maskSpriteScaleX": {
                                "active": true,
                                "animType": "sinOscillation",
                                "speed": 0.0000025,
                                "val1": 2.6,
                                "val2": 0.9,
                                "loopDuration": 3000,
                                "syncShift": 0,
                                "loops": null,
                                "chaosFactor": 0.23,
                                "clockWise": true,
                                "wantInteger": false
                            }
                        },
                        "rank": 10000,
                        "enabled": true
                    }
                );
            }

            if (_fogAnimation) {
                allParams.push(
                    {
                        "filterType": "smoke",
                        "filterId": "Fog",
                        "color": 16777215,
                        "time": 0,
                        "blend": 2,
                        "dimX": 0.01,
                        "dimY": 1,
                        "animated": {
                            "time": {
                                "active": true,
                                "speed": 0.001,
                                "animType": "move",
                                "val1": 24136.1,
                                "val2": 10186.3,
                                "loopDuration": 32740,
                                "syncShift": 0.76,
                                "loops": null
                            },
                            "dimX": {
                                "active": true,
                                "animType": "cosOscillation",
                                "speed": 0.0000025,
                                "val1": -0.03,
                                "val2": 0.03,
                                "loopDuration": 5000,
                                "syncShift": 0,
                                "loops": null
                            }
                        },
                        "rank": 10002,
                        "enabled": true
                    }
                );
            }

            if (_bwEffect) {
                allParams.push(
                    {
                        "filterType": "adjustment",
                        "filterId": "blackandwhite",
                        "saturation": 0,
                        "brightness": 1.1,
                        "contrast": 2,
                        "gamma": 2,
                        "red": 1,
                        "green": 1,
                        "blue": 1,
                        "alpha": 1,
                        "animated": {},
                        "rank": 10004,
                        "enabled": true
                    }
                );
            }

            if (allParams.length > 0) {
                try {
                    await TokenMagic.addUpdateFilters(tileObj.document, allParams);
                } catch (err) {
                    console.warn(`${MODULE_ID} | Could not apply effects:`, err);
                }
            }
        }
    }
}

function _formatLabel(key) {
    return key
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
