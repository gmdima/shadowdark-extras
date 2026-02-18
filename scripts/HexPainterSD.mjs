import { cache } from "./SDXCache.mjs";
import { BIOME_TILES, BIOME_TINTS } from "./HexGeneratorSD.mjs";
import { getDoorTiles } from "./DungeonPainterSD.mjs";

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
let _coloredFoldersCollapsed = {}; // Track collapsed state of colored tile folders
let _symbolFoldersCollapsed = {};  // Track collapsed state of symbol tile folders
let _brushActive = false;
let _lastCell = null;
let _paintEnabled = false;
let _isPainting = false;
let _isGenerating = false;

// Decor tab state
let _decorSearchFilter = "";
let _decorFoldersCollapsed = {};
let _decorMode = false; // Whether we're in decor painting mode
let _decorElevation = 0;
let _decorSort = 0;

let _mapColumns = 15;
let _mapRows = 15;

// Custom tile sizing
let _customTileWidth = 296;
let _customTileHeight = 256;

// Active tile tab ("default", "custom", or "colored")
let _activeTileTab = "default";

// POI (Symbol) tile state
let _poiScale = 0.5;             // Scale factor for POI tiles (0.1 - 2.0)
let _poiRotation = 0;            // Rotation in degrees (0, 90, 180, 270)
let _poiMirror = false;          // Horizontal mirror
let _poiUndoStack = [];          // Stack of placed POI tile IDs and data
let _poiRedoStack = [];          // Stack of tile data for redo
let _previewSprite = null;       // PIXI sprite for preview
let _previewContainer = null;    // Container for preview sprite
let _previewEnabled = false;     // Whether preview is active
let _currentPreviewIndex = 0;    // Index for cycling through selected tiles

// Use custom tiles for generation
let _useCustomForGeneration = false;

export async function loadTileAssets() {
    if (_tiles) return;

    // Load saved custom tile dimensions
    loadCustomTileDimensions();

    // Load saved POI scale
    loadPoiScale();

    // Metadata cache
    const metadataKey = `hex_tiles_metadata_default`;
    const cached = await cache.getMetadata(metadataKey);

    if (cached) {
        _tiles = cached;
        if (_tiles.length && _chosenTiles.size === 0) {
            _chosenTiles.add(_tiles[0].path);
        }
    } else {
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

            await cache.setMetadata(metadataKey, _tiles);
        } catch (err) {
            console.error(`${MODULE_ID} | Failed to discover hex tiles:`, err);
            _tiles = [];
        }
    }

    // Load other tiles
    await loadCustomTileAssets();
    await loadColoredTileAssets();
    await loadSymbolTileAssets();

    // Start background preloading
    preloadHexImages();
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

    const metadataKey = `hex_tiles_metadata_custom`;
    const cached = await cache.getMetadata(metadataKey);
    if (cached) {
        _customTiles = cached;
        return;
    }

    // First ensure the folder structure exists
    await ensureCustomFolderStructure();
    // ... (rest of loading logic) ...

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

    const metadataKey = `hex_tiles_metadata_colored`;
    const cached = await cache.getMetadata(metadataKey);
    if (cached) {
        _coloredTiles = cached;
        return;
    }

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

        // Dynamically discover and load tiles from all subdirectories
        const subdirs = mainListing.dirs || [];
        for (const dirPath of subdirs) {
            const biome = dirPath.split("/").pop();
            try {
                const biomeListing = await FilePicker.browse("data", dirPath);
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
                // Subdirectory might not be accessible, that's okay
            }
        }

        _coloredTiles.sort((a, b) => a.key.localeCompare(b.key));
        await cache.setMetadata(metadataKey, _coloredTiles);
        console.log(`${MODULE_ID} | Loaded ${_coloredTiles.length} colored tiles from ${subdirs.length} folders`);
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

    const metadataKey = `hex_tiles_metadata_symbol`;
    const cached = await cache.getMetadata(metadataKey);
    if (cached) {
        _symbolTiles = cached;
        return;
    }

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

        // Dynamically discover and load tiles from all subdirectories
        const subdirs = mainListing.dirs || [];
        for (const dirPath of subdirs) {
            const category = dirPath.split("/").pop();
            try {
                const categoryListing = await FilePicker.browse("data", dirPath);
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
                // Subdirectory might not be accessible, that's okay
            }
        }

        _symbolTiles.sort((a, b) => a.key.localeCompare(b.key));
        await cache.setMetadata(metadataKey, _symbolTiles);
        console.log(`${MODULE_ID} | Loaded ${_symbolTiles.length} symbol tiles from ${subdirs.length} folders`);
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
 * @param {string[]} excludeCategories - Categories to exclude
 */
export function getFilteredSymbolTiles(excludeCategories = []) {
    if (!_symbolTiles) return [];
    let tiles = _symbolTiles;
    if (excludeCategories.length) {
        tiles = tiles.filter(t => !excludeCategories.includes(t.category));
    }
    if (!_searchFilter) return tiles;
    return tiles.filter(t => t.label.toLowerCase().includes(_searchFilter));
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
 * Get current POI scale
 */
export function getPoiScale() {
    return _poiScale;
}

/**
 * Set POI scale and persist to settings
 */
export function setPoiScale(scale) {
    _poiScale = Math.max(0.1, Math.min(2.0, scale));
    try {
        game.settings.set(MODULE_ID, "hexPainter.poiScale", _poiScale);
    } catch (e) {
        // Settings might not be registered yet
    }
    // Update preview if active
    if (_previewSprite && _previewEnabled) {
        _updatePreviewTransform();
    }
}

/**
 * Load POI scale from settings
 */
export function loadPoiScale() {
    try {
        const saved = game.settings.get(MODULE_ID, "hexPainter.poiScale");
        if (saved !== undefined) {
            _poiScale = saved;
        }
    } catch (e) {
        // Settings not registered yet, use default
        _poiScale = 0.5;
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
 * Get colored tiles grouped by folder for the tray UI.
 * Returns an array of { folder, label, collapsed, tiles[] } objects.
 */
export async function getColoredTileFolders() {
    const filtered = getFilteredColoredTiles();
    if (!filtered.length) return [];

    // Group tiles by biome (folder)
    const folderMap = new Map();

    for (const tile of filtered) {
        const folderKey = tile.biome || "__root__";
        if (!folderMap.has(folderKey)) {
            folderMap.set(folderKey, []);
        }
        folderMap.get(folderKey).push({
            key: tile.key,
            label: tile.label,
            path: tile.path,
            active: _chosenTiles.has(tile.path),
            biome: tile.biome
        });
    }

    // Build folder array, sorted alphabetically (root first if it exists)
    const folders = [];
    for (const [key, tiles] of folderMap) {
        const label = key === "__root__" ? "Root" : key.charAt(0).toUpperCase() + key.slice(1);

        const processedTiles = await Promise.all(tiles.map(async t => ({
            ...t,
            src: await cache.getCachedSrc(t.path)
        })));

        folders.push({
            folder: key,
            label,
            collapsed: !!_coloredFoldersCollapsed[key],
            tiles: processedTiles
        });
    }

    // Sort: root first, then alphabetically
    folders.sort((a, b) => {
        if (a.folder === "__root__") return -1;
        if (b.folder === "__root__") return 1;
        return a.label.localeCompare(b.label);
    });

    return folders;
}

/**
 * Toggle collapsed state of a colored tile folder
 */
export function toggleColoredFolderCollapsed(folderKey) {
    _coloredFoldersCollapsed[folderKey] = !_coloredFoldersCollapsed[folderKey];
}

/**
 * Get symbol tiles grouped by folder for the tray UI.
 * Returns an array of { folder, label, collapsed, tiles[] } objects.
 */
export async function getSymbolTileFolders() {
    const filtered = getFilteredSymbolTiles(["dysonstyle"]);
    if (!filtered.length) return [];

    // Group tiles by category (folder)
    const folderMap = new Map();

    for (const tile of filtered) {
        const folderKey = tile.category || "__root__";
        if (!folderMap.has(folderKey)) {
            folderMap.set(folderKey, []);
        }
        folderMap.get(folderKey).push({
            key: tile.key,
            label: tile.label,
            path: tile.path,
            active: _chosenTiles.has(tile.path),
            category: tile.category
        });
    }

    // Build folder array, sorted alphabetically (root first if it exists)
    const folders = [];
    for (const [key, tiles] of folderMap) {
        const label = key === "__root__" ? "Root" : key.charAt(0).toUpperCase() + key.slice(1);

        const processedTiles = await Promise.all(tiles.map(async t => ({
            ...t,
            src: await cache.getCachedSrc(t.path)
        })));

        folders.push({
            folder: key,
            label,
            collapsed: !!_symbolFoldersCollapsed[key],
            tiles: processedTiles
        });
    }

    // Sort: root first, then alphabetically
    folders.sort((a, b) => {
        if (a.folder === "__root__") return -1;
        if (b.folder === "__root__") return 1;
        return a.label.localeCompare(b.label);
    });

    return folders;
}

/**
 * Toggle collapsed state of a symbol tile folder
 */
export function toggleSymbolFolderCollapsed(folderKey) {
    _symbolFoldersCollapsed[folderKey] = !_symbolFoldersCollapsed[folderKey];
}

/* ═══════════════════════════════════════════════════════════════
   DECOR TAB
   ═══════════════════════════════════════════════════════════════ */

/**
 * Set decor search filter
 */
export function setDecorSearchFilter(term) {
    _decorSearchFilter = term.toLowerCase();
}

/**
 * Get decor search filter
 */
export function getDecorSearchFilter() {
    return _decorSearchFilter;
}

/**
 * Toggle collapsed state of a decor tile folder
 */
export function toggleDecorFolderCollapsed(folderKey) {
    _decorFoldersCollapsed[folderKey] = !_decorFoldersCollapsed[folderKey];
}

/**
 * Set decor painting mode
 */
export function setDecorMode(enabled) {
    _decorMode = !!enabled;
    if (enabled) {
        _activeTileTab = "symbols"; // Decor uses symbol tile placement logic
    }
}

/**
 * Check if decor mode is active
 */
export function isDecorMode() {
    return _decorMode;
}

export function getDecorElevation() { return _decorElevation; }
export function setDecorElevation(v) { _decorElevation = parseFloat(v) || 0; }
export function getDecorSort() { return _decorSort; }
export function setDecorSort(v) { _decorSort = parseInt(v, 10) || 0; }

/**
 * Get decor tiles grouped by folder for the tray UI.
 * Only includes Dysonstyle category tiles.
 */
export async function getDecorTileFolders() {
    let tiles = (_symbolTiles || []).filter(t => t.category === "dysonstyle");
    if (_decorSearchFilter) {
        tiles = tiles.filter(t => t.label.toLowerCase().includes(_decorSearchFilter));
    }

    const folderMap = new Map();
    for (const tile of tiles) {
        const folderKey = tile.category || "__root__";
        if (!folderMap.has(folderKey)) folderMap.set(folderKey, []);
        folderMap.get(folderKey).push({
            key: tile.key, label: tile.label, path: tile.path,
            active: _chosenTiles.has(tile.path), category: tile.category
        });
    }

    // Add door tiles from dungeon painter as a "Doors" folder
    const doorTiles = getDoorTiles();
    if (doorTiles.length) {
        let filteredDoors = doorTiles;
        if (_decorSearchFilter) {
            filteredDoors = doorTiles.filter(t => t.label.toLowerCase().includes(_decorSearchFilter));
        }
        if (filteredDoors.length) {
            folderMap.set("doors", filteredDoors.map(t => ({
                key: t.key, label: t.label, path: t.path,
                active: _chosenTiles.has(t.path), category: "doors"
            })));
        }
    }

    if (!folderMap.size) return [];

    const folders = [];
    for (const [key, folderTiles] of folderMap) {
        const label = key === "__root__" ? "Root" : key.charAt(0).toUpperCase() + key.slice(1);

        const processedTiles = await Promise.all(folderTiles.map(async t => ({
            ...t,
            src: await cache.getCachedSrc(t.path)
        })));

        folders.push({ folder: key, label, collapsed: !!_decorFoldersCollapsed[key], tiles: processedTiles });
    }
    return folders;
}

/**
 * Get custom tiles array
 */
export function getCustomTiles() {
    return _customTiles || [];
}

export async function getHexPainterData() {
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
        hexColoredFolders: [],
        hexSymbolFolders: [],
        waterEffect: _waterEffect,
        windEffect: _windEffect,
        fogAnimation: _fogAnimation,
        tintEnabled: _tintEnabled,
        bwEffect: _bwEffect,
        poiScale: _poiScale,
        poiRotation: _poiRotation,
        poiMirror: _poiMirror,
        canUndoPoi: _poiUndoStack.length > 0,
        canRedoPoi: _poiRedoStack.length > 0,
        decorFolders: [],
        decorSearchFilter: _decorSearchFilter,
        decorElevation: _decorElevation,
        decorSort: _decorSort
    };

    const processTiles = async (tiles) => {
        return Promise.all(tiles.map(async t => ({
            ...t,
            src: await cache.getCachedSrc(t.path)
        })));
    };

    const filteredTiles = getFilteredTiles();
    const hexTiles = await processTiles(filteredTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path)
    })));

    // Filter custom tiles
    const filteredCustomTiles = getFilteredCustomTiles();
    const hexCustomTiles = await processTiles(filteredCustomTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        biome: t.biome
    })));

    // Filter colored tiles
    const filteredColoredTiles = getFilteredColoredTiles();
    const hexColoredTiles = await processTiles(filteredColoredTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        biome: t.biome
    })));

    // Filter symbol tiles (exclude dysonstyle - those are in the Decor tab)
    const filteredSymbolTiles = getFilteredSymbolTiles(["dysonstyle"]);
    const hexSymbolTiles = await processTiles(filteredSymbolTiles.map(t => ({
        key: t.key,
        label: t.label,
        path: t.path,
        active: _chosenTiles.has(t.path),
        category: t.category
    })));

    // Build colored tile folders
    const hexColoredFolders = await getColoredTileFolders();

    // Build symbol tile folders
    const hexSymbolFolders = await getSymbolTileFolders();

    // Build decor tile folders
    const decorFolders = await getDecorTileFolders();

    return {
        hexTiles,
        hexCustomTiles,
        hexColoredTiles,
        hexSymbolTiles,
        hexColoredFolders,
        hexSymbolFolders,
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
        bwEffect: _bwEffect,
        poiScale: _poiScale,
        poiRotation: _poiRotation,
        poiMirror: _poiMirror,
        canUndoPoi: _poiUndoStack.length > 0,
        canRedoPoi: _poiRedoStack.length > 0,
        decorFolders,
        decorSearchFilter: _decorSearchFilter,
        decorElevation: _decorElevation,
        decorSort: _decorSort
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

    // Update preview when selecting/deselecting POI tiles
    if (_activeTileTab === "symbols" || _decorMode) {
        const availableTiles = _getAvailablePoiTiles();
        if (availableTiles.length > 0) {
            // Reset index if out of bounds
            if (_currentPreviewIndex >= availableTiles.length) {
                _currentPreviewIndex = 0;
            }
            // Create or update preview (if painting is enabled)
            if (_paintEnabled) {
                if (!_previewEnabled) {
                    createPreview();
                } else if (_previewSprite) {
                    // Update texture to current tile
                    const currentPath = availableTiles[_currentPreviewIndex % availableTiles.length];
                    loadTexture(currentPath).then(texture => {
                        if (texture && _previewSprite) {
                            _previewSprite.texture = texture;
                            _previewSprite._sdxTexturePath = currentPath;
                        }
                    });
                }
            }
        } else {
            // No tiles selected, destroy preview
            destroyPreview();
        }
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
    _decorMode = false;
    // Clean up POI-related state
    destroyPreview();
    clearPoiHistory();
}

export function bindCanvasEvents() {
    if (!canvas.stage) return;

    canvas.stage.off("mousedown", _onPointerDown);
    canvas.stage.off("mousemove", _onPointerMove);
    canvas.stage.off("mouseup", _onPointerUp);
    canvas.stage.off("mouseupoutside", _onPointerUp);
    canvas.stage.off("rightclick", _onRightClick);

    canvas.stage.on("mousedown", _onPointerDown);
    canvas.stage.on("mousemove", _onPointerMove);
    canvas.stage.on("mouseup", _onPointerUp);
    canvas.stage.on("mouseupoutside", _onPointerUp);
    canvas.stage.on("rightclick", _onRightClick);
}

/**
 * Adjust POI scale by a delta amount
 */
export function adjustPoiScale(delta) {
    const newScale = Math.max(0.1, Math.min(2.0, _poiScale + delta));
    if (newScale !== _poiScale) {
        setPoiScale(newScale);
    }
}

/**
 * Get current POI rotation
 */
export function getPoiRotation() {
    return _poiRotation;
}

/**
 * Rotate POI left (counter-clockwise 90 degrees)
 */
export function rotatePoiLeft() {
    _poiRotation = (_poiRotation - 90 + 360) % 360;
    _updatePreviewTransform();
}

/**
 * Rotate POI right (clockwise 90 degrees)
 */
export function rotatePoiRight() {
    _poiRotation = (_poiRotation + 90) % 360;
    _updatePreviewTransform();
}

/**
 * Get current POI mirror state
 */
export function getPoiMirror() {
    return _poiMirror;
}

/**
 * Toggle POI horizontal mirror
 */
export function togglePoiMirror() {
    _poiMirror = !_poiMirror;
    _updatePreviewTransform();
}

/**
 * Reset POI transform (rotation and mirror)
 */
export function resetPoiTransform() {
    _poiRotation = 0;
    _poiMirror = false;
    _updatePreviewTransform();
}

/**
 * Update preview sprite transform (rotation, mirror, scale)
 */
function _updatePreviewTransform() {
    if (_previewSprite) {
        _previewSprite.rotation = (_poiRotation * Math.PI) / 180;
        _previewSprite.scale.set(
            _poiMirror ? -_poiScale : _poiScale,
            _poiScale
        );
    }
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

    // Update preview position if enabled
    if (_previewEnabled && _previewContainer) {
        const pos = ev.data?.getLocalPosition?.(canvas.stage);
        if (pos) {
            updatePreviewPosition(pos);
        }
    }
}

function _onPointerUp() {
    _brushActive = false;
    _isPainting = false;
    _lastCell = null;
}

function _onRightClick(ev) {
    if (!_isToolActive()) return;
    if (_activeTileTab !== "symbols" && !_decorMode) return;

    const availableTiles = _getAvailablePoiTiles();
    if (availableTiles.length <= 1) return; // No point cycling with 0 or 1 tile

    // Prevent context menu
    ev.data?.originalEvent?.preventDefault?.();

    // Advance to next tile
    advancePreviewIndex();

    // Update preview texture
    if (_previewEnabled && _previewSprite) {
        const nextPath = availableTiles[_currentPreviewIndex % availableTiles.length];
        loadTexture(nextPath).then(texture => {
            if (texture && _previewSprite) {
                _previewSprite.texture = texture;
                _previewSprite._sdxTexturePath = nextPath;
            }
        });
    }
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

    if (_activeTileTab === "symbols" || _decorMode) {
        const doorTiles = getDoorTiles();
        availableTiles = availableTiles.filter(path =>
            (_symbolTiles && _symbolTiles.some(t => t.path === path)) ||
            (_decorMode && doorTiles.some(t => t.path === path))
        );
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

    // For symbols (POI), use deterministic cycling; for other tiles, use random selection
    let chosenTile;
    if (_activeTileTab === "symbols" || _decorMode) {
        chosenTile = availableTiles[_currentPreviewIndex % availableTiles.length];
    } else {
        chosenTile = availableTiles[Math.floor(Math.random() * availableTiles.length)];
    }

    // Check if the chosen tile is a symbol, custom, or colored tile
    const isDoorTile = _decorMode && getDoorTiles().some(t => t.path === chosenTile);
    const isSymbolTile = isDoorTile || (_symbolTiles && _symbolTiles.some(t => t.path === chosenTile));
    const isCustomTile = _customTiles && _customTiles.some(t => t.path === chosenTile);
    const isColoredTile = _coloredTiles && _coloredTiles.some(t => t.path === chosenTile);

    // Only delete existing tiles if NOT painting symbols (symbols stack on top)
    if (!isSymbolTile && occupants.length) {
        await canvas.scene.deleteEmbeddedDocuments("Tile", occupants.map(t => t.id));
    }

    // Determine tile dimensions based on type
    let tw, th;
    if (isSymbolTile) {
        // For symbols, get original image size and scale by _poiScale
        try {
            const img = await loadTexture(chosenTile);
            tw = Math.floor(img.width * _poiScale);
            th = Math.floor(img.height * _poiScale);
        } catch (e) {
            // Fallback to default size if image can't be loaded
            tw = Math.floor(256 * _poiScale);
            th = Math.floor(256 * _poiScale);
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
            tint: tintData,
            scaleX: isSymbolTile && _poiMirror ? -1 : 1,
            scaleY: 1
        },
        x: (isSymbolTile ? pos.x : center.x) - tw / 2,
        y: (isSymbolTile ? pos.y : center.y) - th / 2 - verticalNudge,
        width: tw,
        height: th,
        elevation: isSymbolTile ? (_decorMode ? _decorElevation : 0.1) : 0,
        rotation: isSymbolTile ? _poiRotation : 0,
        // Symbols get a much higher sort value to appear on top of hex tiles
        sort: isSymbolTile ? (_decorMode ? _decorSort : Math.floor(center.y) + 100000) : Math.floor(center.y),
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

    // In decor mode, re-apply elevation/sort after creation to override Levels module hooks
    if (_decorMode && isSymbolTile && createdTiles && createdTiles.length > 0) {
        const tile = createdTiles[0];
        const updates = {};
        if (tile.elevation !== _decorElevation) updates.elevation = _decorElevation;
        if (tile.sort !== _decorSort) updates.sort = _decorSort;
        if (Object.keys(updates).length) {
            await tile.update(updates);
        }
    }

    // Track POI tiles for undo/redo
    if (isSymbolTile && createdTiles && createdTiles.length > 0) {
        _poiUndoStack.push({ id: createdTiles[0].id });
        _poiRedoStack = []; // Clear redo stack on new placement
        // Advance to next tile in cycle
        advancePreviewIndex();
        // Update preview texture
        if (_previewEnabled && _previewSprite) {
            const availablePoiTiles = _getAvailablePoiTiles();
            if (availablePoiTiles.length > 0) {
                const nextPath = availablePoiTiles[_currentPreviewIndex % availablePoiTiles.length];
                loadTexture(nextPath).then(texture => {
                    if (texture && _previewSprite) {
                        _previewSprite.texture = texture;
                        _previewSprite._sdxTexturePath = nextPath;
                    }
                });
            }
        }
        // Trigger tray re-render to update undo/redo button states
        Hooks.callAll("sdx.poiPlaced");
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

/* ═══════════════════════════════════════════════════════════════
   POI UNDO/REDO
   ═══════════════════════════════════════════════════════════════ */

/**
 * Check if undo is available
 */
export function canUndoPoi() {
    return _poiUndoStack.length > 0;
}

/**
 * Check if redo is available
 */
export function canRedoPoi() {
    return _poiRedoStack.length > 0;
}

/**
 * Clear POI history (both stacks)
 */
export function clearPoiHistory() {
    _poiUndoStack = [];
    _poiRedoStack = [];
}

/**
 * Undo the last POI tile placement
 */
export async function undoLastPoi() {
    if (_poiUndoStack.length === 0) return false;

    const lastEntry = _poiUndoStack.pop();
    if (!lastEntry) return false;

    // Find and delete the tile
    const tile = canvas.tiles.get(lastEntry.id);
    if (tile) {
        // Store the full tile data for redo
        const tileData = tile.document.toObject();
        _poiRedoStack.push(tileData);

        // Delete the tile
        await canvas.scene.deleteEmbeddedDocuments("Tile", [lastEntry.id]);
        return true;
    }

    return false;
}

/**
 * Redo the last undone POI tile
 */
export async function redoLastPoi() {
    if (_poiRedoStack.length === 0) return false;

    const tileData = _poiRedoStack.pop();
    if (!tileData) return false;

    // Recreate the tile
    try {
        const created = await canvas.scene.createEmbeddedDocuments("Tile", [tileData]);
        if (created && created.length > 0) {
            // Add to undo stack
            _poiUndoStack.push({ id: created[0].id });
            return true;
        }
    } catch (err) {
        console.error(`${MODULE_ID} | Failed to redo POI tile:`, err);
    }

    return false;
}

/* ═══════════════════════════════════════════════════════════════
   POI PREVIEW
   ═══════════════════════════════════════════════════════════════ */

/**
 * Create preview sprite for POI painting
 */
export async function createPreview() {
    // Destroy existing preview first
    destroyPreview();

    if (!canvas.stage) return;

    // Get available symbol tiles
    const availableTiles = _getAvailablePoiTiles();
    if (availableTiles.length === 0) return;

    // Create container for preview
    _previewContainer = new PIXI.Container();
    _previewContainer.name = "sdx-poi-preview";
    _previewContainer.eventMode = "none";
    _previewContainer.interactiveChildren = false;

    // Load texture for the first tile
    const tilePath = availableTiles[_currentPreviewIndex % availableTiles.length];
    try {
        const texture = await loadTexture(tilePath);
        if (texture) {
            _previewSprite = new PIXI.Sprite(texture);
            _previewSprite.anchor.set(0.5, 0.5);
            _previewSprite.alpha = 0.6;
            _previewSprite.rotation = (_poiRotation * Math.PI) / 180;
            _previewSprite.scale.set(
                _poiMirror ? -_poiScale : _poiScale,
                _poiScale
            );
            _previewSprite._sdxTexturePath = tilePath;
            _previewContainer.addChild(_previewSprite);
            // Add to interface layer so it renders above tiles but below UI
            const targetLayer = canvas.interface || canvas.stage;
            targetLayer.addChild(_previewContainer);
            _previewEnabled = true;
        }
    } catch (e) {
        console.warn(`${MODULE_ID} | Failed to create POI preview:`, e);
    }
}

/**
 * Update preview position and texture
 */
export async function updatePreviewPosition(pos) {
    if (!_previewEnabled || !_previewContainer || !_previewSprite) return;

    // Update position
    _previewContainer.position.set(pos.x, pos.y);

    // Check if we need to update texture (if tiles changed)
    const availableTiles = _getAvailablePoiTiles();
    if (availableTiles.length === 0) {
        destroyPreview();
        return;
    }

    // Update texture if needed
    const currentPath = availableTiles[_currentPreviewIndex % availableTiles.length];
    if (_previewSprite._sdxTexturePath !== currentPath) {
        try {
            const texture = await loadTexture(currentPath);
            if (texture) {
                _previewSprite.texture = texture;
                _previewSprite._sdxTexturePath = currentPath;
            }
        } catch (e) {
            // Ignore texture load errors
        }
    }
}

/**
 * Destroy preview sprite
 */
export function destroyPreview() {
    if (_previewContainer) {
        if (_previewContainer.parent) {
            _previewContainer.parent.removeChild(_previewContainer);
        }
        _previewContainer.destroy({ children: true });
        _previewContainer = null;
    }
    _previewSprite = null;
    _previewEnabled = false;
}

/**
 * Enable preview
 */
export function enablePreview() {
    if (!_previewEnabled) {
        createPreview();
    }
}

/**
 * Disable preview
 */
export function disablePreview() {
    destroyPreview();
}

/**
 * Check if preview is enabled
 */
export function isPreviewEnabled() {
    return _previewEnabled;
}

/**
 * Advance to the next tile in the cycle
 */
export function advancePreviewIndex() {
    const availableTiles = _getAvailablePoiTiles();
    if (availableTiles.length > 0) {
        _currentPreviewIndex = (_currentPreviewIndex + 1) % availableTiles.length;
    }
}

/**
 * Get current preview index
 */
export function getCurrentPreviewIndex() {
    return _currentPreviewIndex;
}

/**
 * Get array of available POI tiles from chosen tiles
 */
function _getAvailablePoiTiles() {
    if (_activeTileTab !== "symbols" && !_decorMode) return [];

    const doorTiles = getDoorTiles();
    return Array.from(_chosenTiles).filter(path =>
        (_symbolTiles && _symbolTiles.some(t => t.path === path)) ||
        (_decorMode && doorTiles.some(t => t.path === path))
    );
}
/**
 * Background preloading of images into IndexedDB
 */
async function preloadHexImages() {
    const allTiles = [
        ...(_tiles || []),
        ...(_customTiles || []),
        ...(_coloredTiles || []),
        ...(_symbolTiles || [])
    ];

    // Preload process: fetch image and store as blob in cache if not already there
    // Limit concurrency or use a small delay to avoid freezing the UI
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
        } catch (err) { }
    }
}
