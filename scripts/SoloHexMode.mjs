/**
 * Solo Hex Mode
 *
 * When active, moving a token onto a hex automatically generates:
 * 1. A colored hex tile on the destination hex
 * 2. A wilderness journal page linked to that hex
 * 3. Tiles + journals for all adjacent empty hexes (terrain rolled procedurally)
 *
 * Terrain generation uses a 2d10 + adjacent terrain modifier system:
 *   - Each adjacent hex's biome contributes a modifier
 *   - Roll 2d10 + sum of modifiers → lookup biome on expanded table
 */

import { getColoredTilesByBiome, getColoredTileDimensions } from "./HexPainterSD.mjs";
import { generateHexHtml, getAvailableBiomes } from "./HexContentGenerator.mjs";
import { saveHexRecord, HEX_JOURNAL_NAME } from "./HexTooltipSD.mjs";
import { registerContent } from "./ContentRegistry.mjs";

const MODULE_ID = "shadowdark-extras";

/* ═══════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════ */

let _soloActive = false;
let _processing = false; // guard against re-entrant calls

export function isSoloMode() { return _soloActive; }

export function setSoloMode(enabled) {
    _soloActive = !!enabled;
}

export function toggleSoloMode() {
    setSoloMode(!_soloActive);
    return _soloActive;
}

/* ═══════════════════════════════════════════════════════════════
   TERRAIN GENERATION TABLES
   ═══════════════════════════════════════════════════════════════ */

/**
 * Modifier each adjacent biome contributes to the 2d10 roll.
 * Biome keys match hexroll-data.json: plains, forest, desert, swamps, mountains, tundra, jungle, ocean
 */
const TERRAIN_MODIFIERS = {
    ocean: -4,
    swamps: -2,
    plains: 0,
    forest: +1,
    desert: +4,
    jungle: +3,
    mountains: +5,
};

/**
 * 2d10 + modifier → biome key.
 * Sorted ascending by threshold. First entry whose threshold >= roll wins.
 */
const TERRAIN_TABLE = [
    { max: 5, biome: "ocean" },
    { max: 8, biome: "swamps" },
    { max: 11, biome: "plains" },
    { max: 14, biome: "forest" },
    { max: 16, biome: "desert" },
    { max: 20, biome: "jungle" },
    { max: Infinity, biome: "mountains" },
];

/**
 * Map biome keys → colored tile folder names (lowercase, matching the folders in assets/Hexes/).
 */
const BIOME_TO_TILE_FOLDER = {
    ocean: "water",
    swamps: "swamp",
    plains: "vegetation",
    forest: "vegetation",
    desert: "desert",
    jungle: "vegetation",
    mountains: "mountains",
};

/**
 * Map biome keys → user-friendly terrain labels for hex tooltip.
 */
const BIOME_TO_TERRAIN_LABEL = {
    ocean: "Ocean",
    swamps: "Swamps",
    plains: "Plains",
    forest: "Forest",
    desert: "Desert",
    jungle: "Jungle",
    mountains: "Mountains",
};

/**
 * Reverse map: terrain label → biome key (for reading existing hex data).
 */
const TERRAIN_LABEL_TO_BIOME = {};
for (const [key, label] of Object.entries(BIOME_TO_TERRAIN_LABEL)) {
    TERRAIN_LABEL_TO_BIOME[label] = key;
}
// Also map labels from the painter system
TERRAIN_LABEL_TO_BIOME["Water"] = "ocean";
TERRAIN_LABEL_TO_BIOME["Swamp"] = "swamps";
TERRAIN_LABEL_TO_BIOME["Vegetation"] = "plains"; // generic vegetation → treat as plains for modifier
TERRAIN_LABEL_TO_BIOME["Snow"] = "mountains"; // snow tiles treated as mountain-like
TERRAIN_LABEL_TO_BIOME["Badlands"] = "desert"; // treat badlands as desert-like

/* ═══════════════════════════════════════════════════════════════
   DICE HELPERS
   ═══════════════════════════════════════════════════════════════ */

function roll2d10() {
    return Math.floor(Math.random() * 10) + 1 + Math.floor(Math.random() * 10) + 1;
}

function pickRandom(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/* ═══════════════════════════════════════════════════════════════
   TERRAIN ROLLING
   ═══════════════════════════════════════════════════════════════ */

/**
 * Determine terrain for a new hex based on adjacent biomes.
 * Step 1: Sum modifiers from non-empty adjacent hexes
 * Step 2: Roll 2d10 + modifiers, look up result
 *
 * @param {string[]} adjacentBiomes — biome keys of non-empty neighbors
 * @returns {string} biome key
 */
function rollTerrain(adjacentBiomes) {
    // Sum adjacent modifiers
    let modSum = 0;
    for (const biome of adjacentBiomes) {
        const mod = TERRAIN_MODIFIERS[biome];
        if (mod !== undefined) modSum += mod;
    }

    const roll = roll2d10() + modSum;

    // Lookup result in table
    let result = "mountains";
    for (const entry of TERRAIN_TABLE) {
        if (roll <= entry.max) { result = entry.biome; break; }
    }

    // Rule: desert strongly prefers clustering. Without an adjacent desert,
    // only a 10% "seed" chance lets a new desert region start.
    if (result === "desert") {
        const hasDesertNeighbor = adjacentBiomes.includes("desert");
        const WET_BIOMES = new Set(["ocean", "swamps"]);
        const hasWetNeighbor = adjacentBiomes.some(b => WET_BIOMES.has(b));
        if (hasWetNeighbor) {
            result = "jungle"; // never desert next to water/swamp
        } else if (!hasDesertNeighbor && Math.random() > 0.10) {
            result = "jungle"; // 90% of the time, no isolated desert
        }
    }

    return result;
}

/* ═══════════════════════════════════════════════════════════════
   HEX DATA LOOKUP
   ═══════════════════════════════════════════════════════════════ */

/**
 * Get the biome key for an existing hex, reading from hex tooltip data.
 * Returns null if the hex has no data.
 */
function getBiomeForHex(sceneId, hexKey) {
    const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
    if (!journal) return null;
    const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
    const record = allData[sceneId]?.[hexKey];
    if (!record?.terrain) return null;
    return TERRAIN_LABEL_TO_BIOME[record.terrain] ?? null;
}

/**
 * Check if a hex already has ANY tile placed (any tile near the hex center).
 */
function hexHasTile(sceneId, offset) {
    const scene = game.scenes.get(sceneId);
    if (!scene) return false;
    const center = canvas.grid.getCenterPoint(offset);
    // Check for ANY tile near this hex center (not just painted ones)
    return scene.tiles.some(t => {
        const tCenterX = t.x + t.width / 2;
        const tCenterY = t.y + t.height / 2;
        const dist = Math.hypot(tCenterX - center.x, tCenterY - center.y);
        return dist < 50; // within 50px of hex center = same hex
    });
}

/**
 * Check if a hex has any data in the hex record (terrain, features, etc.).
 */
function hexHasRecord(sceneId, hexKey) {
    const journal = game.journal.find(j => j.name === HEX_JOURNAL_NAME);
    if (!journal) return false;
    const allData = journal.getFlag(MODULE_ID, "hexData") ?? {};
    const record = allData[sceneId]?.[hexKey];
    if (!record) return false;
    // Has terrain set, or has any features — considered populated
    return !!(record.terrain || record.features?.length);
}

/**
 * Check if a hex already has been processed (has a tile, terrain data, or journal features).
 */
function hexIsPopulated(sceneId, hexKey, offset) {
    return hexHasTile(sceneId, offset) || hexHasRecord(sceneId, hexKey);
}

/* ═══════════════════════════════════════════════════════════════
   TILE PLACEMENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Place a single colored hex tile at the given offset for the given biome.
 *
 * @param {object} offset — { i, j }
 * @param {string} biomeKey — e.g. "forest", "ocean"
 * @returns {object|null} created tile document
 */
async function placeTileForBiome(offset, biomeKey) {
    const scene = canvas.scene;
    if (!scene) return null;

    const tilesByBiome = getColoredTilesByBiome();
    const dims = getColoredTileDimensions();
    const tileW = dims.width;
    const tileH = dims.height;

    // Map biome key to colored tile folder
    const folder = BIOME_TO_TILE_FOLDER[biomeKey] ?? "vegetation";
    let tilePath = null;

    if (tilesByBiome[folder]?.length > 0) {
        tilePath = pickRandom(tilesByBiome[folder]);
    } else if (tilesByBiome.other?.length > 0) {
        tilePath = pickRandom(tilesByBiome.other);
    } else {
        // Try any available folder
        for (const f of ["vegetation", "water", "mountains", "desert", "swamp", "badlands", "snow"]) {
            if (tilesByBiome[f]?.length > 0) {
                tilePath = pickRandom(tilesByBiome[f]);
                break;
            }
        }
    }

    if (!tilePath) {
        console.warn(`${MODULE_ID} | Solo mode: no colored tiles available for biome "${biomeKey}"`);
        return null;
    }

    const center = canvas.grid.getCenterPoint(offset);
    const px = center.x - tileW / 2;
    const py = center.y - tileH / 2;

    const tileData = {
        texture: { src: tilePath },
        x: px,
        y: py,
        width: tileW,
        height: tileH,
        sort: Math.floor(center.y),
        flags: {
            [MODULE_ID]: {
                painted: true,
                biome: biomeKey === "ocean" ? "water" : undefined,
                soloBiome: biomeKey
            }
        }
    };

    const created = await scene.createEmbeddedDocuments("Tile", [tileData]);
    return created?.[0] ?? null;
}

/* ═══════════════════════════════════════════════════════════════
   JOURNAL CREATION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Generate wilderness content and save it as a journal page for a hex.
 * Reuses the same pattern as HexTooltipSD's #generateAndSave.
 *
 * @param {string} hexKey — "i_j"
 * @param {string} biomeKey — e.g. "forest"
 * @param {string} hexLabel — e.g. "3.5"
 */
async function generateJournalForHex(hexKey, biomeKey, hexLabel) {
    const sceneId = canvas.scene?.id;
    const sceneName = canvas.scene?.name ?? "Hex Map";

    // Generate content
    let htmlContent, regionName;
    try {
        const result = await generateHexHtml(biomeKey, hexLabel);
        htmlContent = result.html;
        regionName = result.regionName;
    } catch (err) {
        console.error(`${MODULE_ID} | Solo mode: hex generation failed for ${hexKey}:`, err);
        return;
    }
    const pageName = `The ${regionName}`;

    // Find or create the scene journal
    let journal = game.journal.find(
        j => j.getFlag(MODULE_ID, "hexGenJournal") === sceneId
    );
    if (!journal) {
        journal = await JournalEntry.create({
            name: `${sceneName} - Hexplorer`,
            flags: { [MODULE_ID]: { hexGenJournal: sceneId } },
        });
    }

    // Create journal page
    await JournalEntryPage.create(
        { name: pageName, type: "text", text: { content: htmlContent } },
        { parent: journal }
    );

    // Update hex record
    const allData = game.journal.find(j => j.name === HEX_JOURNAL_NAME)
        ?.getFlag(MODULE_ID, "hexData") ?? {};
    const record = foundry.utils.deepClone(
        allData[sceneId]?.[hexKey] ?? {
            name: "", zone: "", terrain: "", travel: "",
            exploration: "unexplored", cleared: false, claimed: false,
            revealRadius: -1, revealCells: "",
            rollTable: "", rollTableChance: 100, rollTableFirstOnly: false,
            showToPlayers: false, features: [], notes: [],
        }
    );
    if (!record.features) record.features = [];
    if (!record.notes) record.notes = [];

    // Set terrain
    const terrainLabel = BIOME_TO_TERRAIN_LABEL[biomeKey] ?? biomeKey;
    if (!record.terrain) record.terrain = terrainLabel;

    // Find created page
    const updatedJournal = game.journal.get(journal.id);
    const page = updatedJournal.pages.find(p => p.name === pageName);

    if (page) {
        record.features.push({
            id: foundry.utils.randomID(),
            type: "journal",
            journalId: journal.id,
            pageId: page.id,
            name: `The ${regionName}`,
            discovered: false,
        });
    }

    await saveHexRecord(sceneId, hexKey, record);

    // Register in content registry
    await registerContent({
        hexKey, sceneId, type: "wilderness", subType: biomeKey,
        name: `The ${regionName}`,
        journalId: journal.id, pageId: page?.id || "",
    });

    // Notify tooltip system
    window.SDXHexTooltip?.notifyDataChanged(sceneId, hexKey, record);
}

/* ═══════════════════════════════════════════════════════════════
   HEX KEY / LABEL HELPERS
   ═══════════════════════════════════════════════════════════════ */

function offsetToHexKey(offset) {
    return `${offset.i}_${offset.j}`;
}

function hexKeyToLabel(hexKey) {
    return hexKey.replace("_", ".");
}

/* ═══════════════════════════════════════════════════════════════
   MAIN TOKEN MOVE HANDLER
   ═══════════════════════════════════════════════════════════════ */

/**
 * Called on updateToken. If solo mode is active and the token moved,
 * generate hex tiles + journals for the destination and all empty neighbors.
 */
async function onTokenMove(tokenDoc, changes) {
    if (!_soloActive) return;
    if (!game.user.isGM) return;
    if (_processing) return;
    if (!canvas?.grid?.isHexagonal) return;

    const hasMove = ("x" in changes) || ("y" in changes);
    if (!hasMove) return;

    const sceneId = canvas.scene?.id;
    if (!sceneId) return;

    _processing = true;
    try {
        // Get destination hex — use changes for the NEW position
        // (tokenDoc may still reflect the old position at hook time)
        const newX = changes.x ?? tokenDoc.x;
        const newY = changes.y ?? tokenDoc.y;
        const tw = tokenDoc.width * canvas.grid.sizeX;
        const th = tokenDoc.height * canvas.grid.sizeY;
        const centerX = newX + tw / 2;
        const centerY = newY + th / 2;
        const destOffset = canvas.grid.getOffset({ x: centerX, y: centerY });
        const destKey = offsetToHexKey(destOffset);

        // Collect all hexes to process: destination + 6 neighbors
        const hexesToProcess = [{ offset: destOffset, key: destKey }];

        try {
            const neighbors = canvas.grid.getAdjacentOffsets(destOffset);
            for (const n of neighbors) {
                hexesToProcess.push({ offset: n, key: offsetToHexKey(n) });
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Solo mode: could not get adjacent hexes:`, err);
        }

        // Filter to only empty hexes
        const emptyHexes = hexesToProcess.filter(
            h => !hexIsPopulated(sceneId, h.key, h.offset)
        );

        if (emptyHexes.length === 0) {
            return; // All hexes already populated
        }

        // For each empty hex, determine biome and generate
        for (const hex of emptyHexes) {
            // Get adjacent biomes for terrain rolling
            let adjacentBiomes = [];
            try {
                const adjOffsets = canvas.grid.getAdjacentOffsets(hex.offset);
                for (const adj of adjOffsets) {
                    const adjKey = offsetToHexKey(adj);
                    const biome = getBiomeForHex(sceneId, adjKey);
                    if (biome) adjacentBiomes.push(biome);
                }
            } catch { /* ignore */ }

            // Roll terrain
            const biomeKey = rollTerrain(adjacentBiomes);
            const hexLabel = hexKeyToLabel(hex.key);

            // Place tile
            await placeTileForBiome(hex.offset, biomeKey);

            // Generate journal + hex record
            await generateJournalForHex(hex.key, biomeKey, hexLabel);
        }

    } catch (err) {
        console.error(`${MODULE_ID} | Solo mode error:`, err);
        ui.notifications.error("SDX | Solo mode encountered an error.");
    } finally {
        _processing = false;
    }
}

/* ═══════════════════════════════════════════════════════════════
   INITIALIZATION
   ═══════════════════════════════════════════════════════════════ */

/**
 * Register the updateToken hook for solo hex mode.
 * Called once from TraySD.initTray().
 */
export function initSoloHexMode() {
    Hooks.on("updateToken", onTokenMove);
    console.log(`${MODULE_ID} | Solo Hex Mode hook registered.`);
}
