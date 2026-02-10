/**
 * Hex Map Procedural Generator
 * 
 * Generates a hex map by combining two Simplex Noise layers (elevation + vegetation)
 * and mapping each cell to one of the existing SDX hex tiles based on biome thresholds.
 * 
 * User controls: water level, vegetation density, mountain height, desert amount.
 * Uses the scene's current hex grid configuration (format via Hex Painter first).
 */

import { setGenerating, isWaterEffect, isBwEffect, getCustomTilesByBiome, getCustomTileDimensions, getColoredTilesByBiome, getColoredTileDimensions, isTintEnabled, getActiveTileTab } from "./HexPainterSD.mjs";

const MODULE_ID = "shadowdark-extras";
const TILE_FOLDER = `modules/${MODULE_ID}/assets/tiles`;
const HEX_TILE_W = 296;
const HEX_TILE_H = 256;

/* ═══════════════════════════════════════════════════════════════
   SIMPLEX NOISE (compact 2D implementation)
   ═══════════════════════════════════════════════════════════════ */

class SimplexNoise {
    constructor(seed = 42) {
        if (typeof seed === "string") {
            let s = 0;
            for (let i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
            seed = s;
        }
        this.p = new Uint8Array(256);
        this.perm = new Uint8Array(512);
        this.permMod12 = new Uint8Array(512);

        for (let i = 0; i < 256; i++) this.p[i] = i;

        for (let i = 0; i < 256; i++) {
            let r = Math.abs(Math.sin(seed + i)) * 10000;
            r = Math.floor((r - Math.floor(r)) * 256);
            const k = this.p[i];
            this.p[i] = this.p[r];
            this.p[r] = k;
        }

        for (let i = 0; i < 512; i++) {
            this.perm[i] = this.p[i & 255];
            this.permMod12[i] = this.perm[i] % 12;
        }

        this.grad3 = [
            [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
            [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
            [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
        ];
    }

    noise2D(xin, yin) {
        const { permMod12, perm, grad3 } = this;
        let n0 = 0, n1 = 0, n2 = 0;
        const F2 = 0.5 * (Math.sqrt(3) - 1);
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s);
        const j = Math.floor(yin + s);
        const G2 = (3 - Math.sqrt(3)) / 6;
        const t = (i + j) * G2;
        const x0 = xin - (i - t);
        const y0 = yin - (j - t);
        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;
        const ii = i & 255;
        const jj = j & 255;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) { t0 *= t0; const gi = permMod12[ii + perm[jj]]; n0 = t0 * t0 * (grad3[gi][0] * x0 + grad3[gi][1] * y0); }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) { t1 *= t1; const gi = permMod12[ii + i1 + perm[jj + j1]]; n1 = t1 * t1 * (grad3[gi][0] * x1 + grad3[gi][1] * y1); }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) { t2 *= t2; const gi = permMod12[ii + 1 + perm[jj + 1]]; n2 = t2 * t2 * (grad3[gi][0] * x2 + grad3[gi][1] * y2); }
        return 70 * (n0 + n1 + n2);
    }
}

/* ═══════════════════════════════════════════════════════════════
   NOISE UTILITIES — fractal octave noise, ridged noise,
   domain-warped noise, normalisation
   ═══════════════════════════════════════════════════════════════ */

/**
 * Standard fractal Brownian motion (fBm).
 * Sums multiple octaves of simplex noise with decreasing amplitude and increasing frequency.
 */
function fbm(simplex, x, y, freq, octaves) {
    let value = 0, amp = 1, f = freq, totalAmp = 0;
    for (let o = 0; o < octaves; o++) {
        value += amp * simplex.noise2D(x * f, y * f);
        totalAmp += amp;
        amp *= 0.5;
        f *= 2;
    }
    return value / totalAmp;          // result in [-1, 1]
}

/**
 * Ridged noise — produces sharp mountain-chain like features
 * by taking abs(simplex) and inverting.
 */
function ridgedFbm(simplex, x, y, freq, octaves) {
    let value = 0, amp = 1, f = freq, totalAmp = 0;
    for (let o = 0; o < octaves; o++) {
        let n = simplex.noise2D(x * f, y * f);
        n = 1.0 - Math.abs(n);        // sharp ridges at zero-crossings
        n = n * n;                     // sharpen further
        value += amp * n;
        totalAmp += amp;
        amp *= 0.5;
        f *= 2;
    }
    return value / totalAmp;           // result in [0, 1]
}

/**
 * Domain-warped fBm — gives organic, non-circular blob shapes
 * perfect for forests and vegetation patches.
 */
function warpedFbm(simplex, warpSimplex, x, y, freq, octaves, warpScale = 2.5) {
    const wx = warpScale * fbm(warpSimplex, x, y, freq, octaves);
    const wy = warpScale * fbm(warpSimplex, x + 5.2, y + 1.3, freq, octaves);
    return fbm(simplex, x + wx, y + wy, freq, octaves);
}

/**
 * Build a 2D map array and normalise to [0, 1].
 */
function buildNormalised(cols, rows, fn) {
    const map = new Float32Array(cols * rows);
    let min = Infinity, max = -Infinity;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const v = fn(c, r);
            map[r * cols + c] = v;
            if (v < min) min = v;
            if (v > max) max = v;
        }
    }
    const range = max - min || 1;
    for (let i = 0; i < map.length; i++) map[i] = (map[i] - min) / range;
    return map;
}

/* ═══════════════════════════════════════════════════════════════
   TILE BIOME CLASSIFICATION
   Map our hex-tile-*.png filenames into biome categories.
   ═══════════════════════════════════════════════════════════════ */

export const BIOME_TILES = {
    water: ["ocean.png", "ocean2.png", "waves.png"],
    swamp: ["hex-tile-swamp1.png", "hex-tile-swamp2.png", "hex-tile-swamp3.png",
        "swamp.png", "swamp2.png", "swampmeadows.png"],
    grassland: ["hex-tile-grassland1.png", "hex-tile-grassland2.png",
        "hex-tile-grassland3.png", "hex-tile-grassland4.png",
        "meadow1.png"],
    forestLight: ["hex-tile-forestlight1.png", "hex-tile-forestmixed1.png",
        "hex-tile-forestmixed2.png", "hex-tile-forestmixed3.png",
        "hex-tile-forestmixed4.png"],
    forest: ["hex-tile-forest1.png", "hex-tile-forest2.png", "hex-tile-forest3.png",
        "hex-tile-forest4.png", "hex-tile-forest5.png",
        "hex-tile-evergreen1.png", "hex-tile-evergreen2.png", "hex-tile-evergreen3.png"],
    hills: ["hex-tile-hills1.png", "hex-tile-hills2.png", "hex-tile-hills3.png",
        "hills.png", "hills2.png"],
    hillsForest: ["hex-tile-hills-forest1.png", "hex-tile-hills-forest2.png",
        "hex-tile-hills-forest3.png",
        "hex-tile-hills-evergreen1.png", "hex-tile-hills-evergreen2.png",
        "hex-tile-hills-evergreen3.png"],
    mountains: ["hex-tile-mountains1.png", "hex-tile-mountains2.png",
        "hex-tile-mountains3.png", "hex-tile-mountains4.png",
        "mountains 5.png", "mountains6.png", "mountains7.png",
        "mountains8.png", "mountains9.png"],
    mountainsForest: ["hex-tile-mountains-forest1.png", "hex-tile-mountains-forest2.png",
        "hex-tile-mountains-forest3.png",
        "hex-tile-mountains-evergreen1.png", "hex-tile-mountains-evergreen2.png",
        "hex-tile-mountains-evergreen3.png"],
    desert: ["hex-tile-desert1.png", "hex-tile-desert2.png", "hex-tile-desert3.png",
        "desert.png", "desert3.png"],
    badlands: ["hex-tile-badlands1.png", "hex-tile-badlands2.png", "hex-tile-badlands3.png",
        "badlands.png"],
    snowyMountains: ["snowymountains.png", "wintertrees.png"],
    special: ["crater.png", "crystals.png", "monolith.png", "skulls.png",
        "statue.png", "stones.png", "hut.png", "grasslandtower.png",
        "mountaindungeon.png", "mountainlake.png", "mountainruins.png",
        "valley.png", "tree.png", "cayon.png", "plateu.png", "drysoil.png"]
};

// Prefix all entries with the tile folder
const BIOME_PATHS = {};
for (const [biome, files] of Object.entries(BIOME_TILES)) {
    BIOME_PATHS[biome] = files.map(f => `${TILE_FOLDER}/${f}`);
}

export const BIOME_TINTS = {
    water: "#5b8aa0",
    badlands: "#89828c",
    swamp: "#667257",
    grassland: "#769f76",
    forestLight: "#7ba163",
    forest: "#576b4d",
    hills: "#75946a",
    hillsForest: "#758664",
    mountains: "#878786",
    mountainsForest: "#636363",
    desert: "#ebdcb0",
    snowyMountains: "#b3b3b3",
    special: "#ffffff"
};

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Map biome categories to custom/colored tile biome folders
 */
const BIOME_TO_CUSTOM_FOLDER = {
    water: "water",
    swamp: "swamp",
    grassland: "vegetation",
    forestLight: "vegetation",
    forest: "vegetation",
    hills: "mountains",
    hillsForest: "mountains",
    mountains: "mountains",
    mountainsForest: "mountains",
    desert: "desert",
    badlands: "badlands",
    snowyMountains: "mountains",  // Falls back to mountains for custom, snow for colored
    special: null
};

/* ═══════════════════════════════════════════════════════════════
   BIOME RESOLVER
   Takes elevation [0-1] and vegetation [0-1] and resolves
   to a tile file path.  Slider params shift the thresholds.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Resolve a (elevation, vegetation) pair to a tile path.
 *
 * @param {number} elev       – normalised elevation  [0, 1]
 * @param {number} veg        – normalised vegetation [0, 1]
 * @param {object} params     – user slider values
 * @param {number} params.water   – shifts water threshold     [-0.5, +0.5]
 * @param {number} params.green   – shifts vegetation density  [-0.5, +0.5]
 * @param {number} params.mountain – shifts mountain threshold [-0.5, +0.5]
 * @param {number} params.desert  – shifts desert amount       [-0.5, +0.5]
 * @param {number} params.snow    – shifts snow threshold      [-0.5, +0.5]
 * @returns {string} tile path
 */
function resolveBiome(elev, veg, params) {
    // Apply user modifiers
    const waterLine = 0.12 + params.water * 0.30;       // default ~0.12
    const swampLine = waterLine + 0.06 + params.swamp * 0.30; // swamp slider expands/contracts the swamp band
    const hillLine = 0.60 - params.mountain * 0.50;    // mountains slider lowers threshold
    const mtLine = 0.75 - params.mountain * 0.50;
    const snowLine = 0.92 - params.snow * 0.30;         // snow slider lowers the snow threshold
    const desertVeg = 0.20 + params.desert * 0.50;      // desert slider raises the "dry" ceiling
    const vegBoost = veg + params.green * 0.80;         // green slider boosts vegetation

    // ── Water ──
    if (elev < waterLine) {
        return { biome: "water", path: pickRandom(BIOME_PATHS.water) };
    }

    // ── Swamp (low elevation + medium-high vegetation) ──
    if (elev < swampLine && vegBoost > 0.35) {
        return { biome: "swamp", path: pickRandom(BIOME_PATHS.swamp) };
    }

    // ── Mountains ──
    if (elev >= mtLine) {
        // Snowy mountains at high elevation (controlled by snow slider)
        if (elev > snowLine && vegBoost < 0.50) {
            return { biome: "snowyMountains", path: pickRandom(BIOME_PATHS.snowyMountains.length ? BIOME_PATHS.snowyMountains : BIOME_PATHS.mountains) };
        }
        if (vegBoost > 0.50) return { biome: "mountainsForest", path: pickRandom(BIOME_PATHS.mountainsForest) };
        return { biome: "mountains", path: pickRandom(BIOME_PATHS.mountains) };
    }

    // ── Hills ──
    if (elev >= hillLine) {
        if (vegBoost > 0.50) return { biome: "hillsForest", path: pickRandom(BIOME_PATHS.hillsForest) };
        return { biome: "hills", path: pickRandom(BIOME_PATHS.hills) };
    }

    // ── Flat terrain — decided by vegetation + desert slider ──

    // Desert / Badlands (very low vegetation)
    if (vegBoost < desertVeg) {
        // Badlands slider controls how much of the desert band is "badlands"
        // Default (0) -> 0.5 * desertVeg (half badlands, half desert)
        // Max (+0.5) -> 1.0 * desertVeg (all badlands)
        // Min (-0.5) -> 0.0 * desertVeg (no badlands)
        const badlandsCut = desertVeg * (0.5 + params.badlands);

        if (vegBoost < badlandsCut) {
            return { biome: "badlands", path: pickRandom(BIOME_PATHS.badlands) };
        }
        return { biome: "desert", path: pickRandom(BIOME_PATHS.desert) };
    }

    // Light forest / mixed
    if (vegBoost < 0.45) {
        return { biome: "grassland", path: pickRandom(BIOME_PATHS.grassland) };
    }
    if (vegBoost < 0.65) {
        return { biome: "forestLight", path: pickRandom(BIOME_PATHS.forestLight) };
    }

    // Dense forest
    return { biome: "forest", path: pickRandom(BIOME_PATHS.forest) };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN GENERATOR
   ═══════════════════════════════════════════════════════════════ */

/**
 * Default generation parameters.
 */
export const GEN_DEFAULTS = {
    seed: "",
    water: 0,
    green: 0,
    mountain: 0,
    desert: 0,
    swamp: 0,
    badlands: 0,
    snow: 0
};

/**
 * Generate a procedural hex map on the current scene.
 *
 * The scene should already be formatted as a hex grid (via Format Map).
 * This function fills every hex cell with a tile chosen by noise-based biome rules.
 *
 * @param {object} params – slider values matching GEN_DEFAULTS
 */
export async function generateHexMap(params = {}) {
    const scene = canvas.scene;
    if (!scene) {
        ui.notifications.error("SDX | No active scene.");
        return;
    }

    const gridType = scene.grid?.type ?? scene.data?.grid?.type ?? 0;
    if (![2, 3, 4, 5].includes(gridType)) {
        ui.notifications.error("SDX | Scene must use a hex grid. Format it first via Hex Painter.");
        return;
    }

    // Merge user params with defaults
    const p = foundry.utils.mergeObject({ ...GEN_DEFAULTS }, params);

    // Determine seed
    let seedValue = p.seed || String(Math.floor(Math.random() * 999999));
    let numericSeed = 0;
    for (let i = 0; i < seedValue.length; i++) numericSeed += seedValue.charCodeAt(i) * (i + 1);

    // Check which tile set to use based on active tab
    const activeTab = getActiveTileTab();
    const useColored = activeTab === "colored";
    const useCustom = activeTab === "custom";

    // Get tile data based on active tab
    let tilesByBiome = null;
    let tileW = HEX_TILE_W;
    let tileH = HEX_TILE_H;
    let tileModeName = "";

    if (useColored) {
        tilesByBiome = getColoredTilesByBiome();
        const coloredDims = getColoredTileDimensions();
        tileW = coloredDims.width;
        tileH = coloredDims.height;
        tileModeName = " using colored tiles";
    } else if (useCustom) {
        tilesByBiome = getCustomTilesByBiome();
        const customDims = getCustomTileDimensions();
        tileW = customDims.width;
        tileH = customDims.height;
        tileModeName = " using custom tiles";
    }

    ui.notifications.info(`SDX | Generating hex map (seed: ${seedValue})${tileModeName}…`);

    // Create noise sources
    const elevSimplex = new SimplexNoise(numericSeed);
    const maskSimplex = new SimplexNoise(numericSeed + 99);
    const vegSimplex = new SimplexNoise(numericSeed + 1);
    const warpSimplex = new SimplexNoise(numericSeed + 2);

    // Determine grid dimensions from scene
    const sceneW = scene.width;
    const sceneH = scene.height;

    // Always use the default hex tile dimensions for grid calculation
    // because the scene was formatted with those dimensions
    const gridTileW = HEX_TILE_W;
    const gridTileH = HEX_TILE_H;

    // Calculate how many hex columns/rows fit based on the SCENE grid
    // Add extra buffer when custom/colored tiles are larger to ensure full coverage
    const useLargerTiles = useCustom || useColored;
    const extraCols = useLargerTiles ? Math.ceil((tileW - gridTileW) / (gridTileW * 0.75)) + 1 : 0;
    const extraRows = useLargerTiles ? Math.ceil((tileH - gridTileH) / gridTileH) + 1 : 0;
    const cols = Math.ceil(sceneW / (gridTileW * 0.75)) + 1 + extraCols;
    const rows = Math.ceil(sceneH / gridTileH) + 1 + extraRows;

    // Build elevation map: ridged noise masked by plain simplex
    const elevMap = buildNormalised(cols, rows, (c, r) => {
        const ridged = ridgedFbm(elevSimplex, c, r, 0.05, 3);
        const mask = (fbm(maskSimplex, c, r, 0.03, 2) + 1) * 0.5;   // [0, 1]
        return ridged * mask;
    });

    // Build vegetation map: domain-warped simplex
    const vegMap = buildNormalised(cols, rows, (c, r) => {
        return warpedFbm(vegSimplex, warpSimplex, c, r, 0.04, 4, 2.5);
    });

    // Suppress tray re-renders while we batch-create tiles
    setGenerating(true);

    try {

        // Delete existing painted tiles (SDX flag)
        const existingIds = scene.tiles
            .filter(t => t.flags?.[MODULE_ID]?.painted)
            .map(t => t.id);
        if (existingIds.length) {
            ui.notifications.info(`SDX | Removing ${existingIds.length} old painted tiles…`);
            await scene.deleteEmbeddedDocuments("Tile", existingIds);
        }

        // Build tile placement data
        const tileData = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const elev = elevMap[r * cols + c];
                const veg = vegMap[r * cols + c];
                const { biome, path: defaultPath } = resolveBiome(elev, veg, p);

                // Determine tile path - use custom/colored if enabled and available
                let tilePath = null;
                if ((useCustom || useColored) && tilesByBiome) {
                    // For colored tiles, check snow folder first for snowy mountains
                    if (useColored && biome === "snowyMountains" && tilesByBiome.snow?.length > 0) {
                        tilePath = pickRandom(tilesByBiome.snow);
                    }
                    // 1. Try the specific biome folder
                    else {
                        const biomeFolder = BIOME_TO_CUSTOM_FOLDER[biome];
                        if (biomeFolder && tilesByBiome[biomeFolder]?.length > 0) {
                            tilePath = pickRandom(tilesByBiome[biomeFolder]);
                        }
                        // 2. Try root folder tiles
                        else if (tilesByBiome.other?.length > 0) {
                            tilePath = pickRandom(tilesByBiome.other);
                        }
                        // 3. Fall back to ANY available folder
                        else {
                            const availableFolders = ['vegetation', 'water', 'mountains', 'desert', 'swamp', 'badlands', 'snow'];
                            for (const folder of availableFolders) {
                                if (tilesByBiome[folder]?.length > 0) {
                                    tilePath = pickRandom(tilesByBiome[folder]);
                                    break;
                                }
                            }
                        }
                    }
                } else {
                    // Not using custom/colored tiles - use default path
                    tilePath = defaultPath;
                }

                // Skip this cell only if absolutely no tile available
                if (!tilePath) continue;

                // Use the Foundry grid API to get the correct center for each cell,
                // matching the hex painter's placement logic exactly (odd-q offset).
                const center = canvas.grid.getCenterPoint({ i: r, j: c });
                const px = center.x - tileW / 2;
                const py = center.y - tileH / 2;

                // Skip tiles that have NO overlap with the scene
                // (tile is entirely to the left, right, above, or below the scene)
                if (px + tileW <= 0) continue;  // Tile is entirely to the left
                if (py + tileH <= 0) continue;  // Tile is entirely above
                if (px >= sceneW + tileW) continue;  // Tile is entirely to the right (with buffer)
                if (py >= sceneH + tileH) continue;  // Tile is entirely below (with buffer)

                const isWater = biome === "water";
                let tintData = undefined;

                // Only apply tint if tinting is enabled
                if (isTintEnabled() && BIOME_TINTS[biome]) {
                    // Base tint
                    const baseColor = Color.from(BIOME_TINTS[biome]);

                    // Brightness variation based on elevation (0.8 to 1.2)
                    // Higher elevation = brighter
                    const brightness = 0.8 + (elev * 0.4);

                    // Apply brightness
                    tintData = baseColor.multiply(brightness).css;
                }

                tileData.push({
                    texture: {
                        src: tilePath,
                        tint: tintData
                    },
                    x: px,
                    y: py,
                    width: tileW,
                    height: tileH,
                    sort: Math.floor(center.y),
                    flags: { [MODULE_ID]: { painted: true, biome: isWater ? "water" : undefined } }
                });
            }
        }

        // Create all tiles in a single batch call (much faster than chunking)
        let allCreatedTiles = [];
        if (tileData.length > 0) {
            allCreatedTiles = await scene.createEmbeddedDocuments("Tile", tileData);
        }
        const created = allCreatedTiles.length;

        // Apply TMFX water effect if the Water checkbox is on
        if (isWaterEffect() && window.TokenMagic) {
            // Distortion only for colored tiles, distortion + adjustment for default/custom
            const waterDistortion = {
                "filterType": "distortion",
                "filterId": "Sea",
                "maskPath": "modules/tokenmagic/fx/assets/distortion-1.png",
                "maskSpriteScaleX": 5,
                "maskSpriteScaleY": 5,
                "padding": 20,
                "animated": {
                    "maskSpriteX": { "active": true, "speed": 0.05, "animType": "move" },
                    "maskSpriteY": { "active": true, "speed": 0.07, "animType": "move" }
                },
                "rank": 10003,
                "enabled": true
            };
            const waterAdjustment = {
                "filterType": "adjustment",
                "filterId": "Sea",
                "saturation": 0.99,
                "brightness": 0.26,
                "contrast": 1.68,
                "gamma": 0.1,
                "red": 0.92,
                "green": 0.92,
                "blue": 1.06,
                "alpha": 0.74,
                "animated": {},
                "rank": 10005,
                "enabled": true
            };

            // For colored tiles, only use distortion (they already have nice colors)
            const waterParamsColored = [waterDistortion];
            const waterParamsFull = [waterDistortion, waterAdjustment];

            const waterTiles = allCreatedTiles.filter(t => t.flags?.[MODULE_ID]?.biome === "water");
            if (waterTiles.length) {
                ui.notifications.info(`SDX | Applying water effects to ${waterTiles.length} tiles…`);
                for (const tileDoc of waterTiles) {
                    const tileObj = canvas.tiles.placeables.find(t => t.document.id === tileDoc.id);
                    if (tileObj) {
                        try {
                            // Use distortion-only for colored tiles
                            const params = useColored ? waterParamsColored : waterParamsFull;
                            await TokenMagic.addUpdateFilters(tileObj.document, params);
                        } catch (err) {
                            console.warn(`${MODULE_ID} | TMFX water effect failed:`, err);
                        }
                    }
                }
            }
        }

        // Apply TMFX B&W effect if the B&W checkbox is on
        if (isBwEffect() && window.TokenMagic) {
            const bwParams = [
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
            ];

            ui.notifications.info(`SDX | Applying B&W effect to ${allCreatedTiles.length} tiles…`);
            for (const tileDoc of allCreatedTiles) {
                const tileObj = canvas.tiles.placeables.find(t => t.document.id === tileDoc.id);
                if (tileObj) {
                    try {
                        await TokenMagic.addUpdateFilters(tileObj.document, bwParams);
                    } catch (err) {
                        console.warn(`${MODULE_ID} | TMFX B&W effect failed:`, err);
                    }
                }
            }
        }

        ui.notifications.info(`SDX | Generated ${created} hex tiles.`);

    } finally {
        setGenerating(false);
    }
}

/**
 * Remove all SDX-painted tiles from the current scene.
 */
export async function clearGeneratedTiles() {
    const scene = canvas.scene;
    if (!scene) return;

    const ids = scene.tiles
        .filter(t => t.flags?.[MODULE_ID]?.painted)
        .map(t => t.id);

    if (!ids.length) {
        ui.notifications.info("SDX | No generated tiles to clear.");
        return;
    }

    setGenerating(true);
    try {
        await scene.deleteEmbeddedDocuments("Tile", ids);
        ui.notifications.info(`SDX | Cleared ${ids.length} tiles.`);
    } finally {
        setGenerating(false);
    }
}
