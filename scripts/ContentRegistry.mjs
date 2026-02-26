/**
 * ContentRegistry — tracks all procedurally generated content (dungeons, settlements, wilderness)
 * so that settlement quest generation can reference real, existing locations.
 *
 * Storage: Foundry world-level setting "shadowdark-extras.contentRegistry"
 */

const MODULE_ID = "shadowdark-extras";
const SETTING_KEY = "contentRegistry";

// ── Initialization ──────────────────────────────────────────────────────────

/**
 * Register the world setting. Call this from the module's init hook.
 */
export function registerContentRegistrySetting() {
    game.settings.register(MODULE_ID, SETTING_KEY, {
        name: "Content Registry",
        hint: "Internal. Tracks generated dungeons, settlements, and wilderness for quest cross-referencing.",
        scope: "world",
        config: false,
        type: Object,
        default: { entries: [] },
    });
}

// ── Read / Write helpers ────────────────────────────────────────────────────

function _load() {
    try {
        const raw = game.settings.get(MODULE_ID, SETTING_KEY);
        if (raw && Array.isArray(raw.entries)) return raw;
        return { entries: [] };
    } catch {
        return { entries: [] };
    }
}

async function _save(data) {
    await game.settings.set(MODULE_ID, SETTING_KEY, data);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Register a piece of generated content.
 * @param {object} entry
 * @param {string} entry.hexKey      - "i_j" format
 * @param {string} entry.sceneId     - Foundry scene ID
 * @param {string} entry.type        - "dungeon" | "settlement" | "wilderness"
 * @param {string} entry.subType     - e.g. "tomb", "village", "forest"
 * @param {string} entry.name        - Display name
 * @param {number} [entry.roomCount] - Number of rooms (dungeons only)
 * @param {string} entry.journalId   - Foundry journal ID
 * @param {string} entry.pageId      - Foundry journal page ID
 */
export async function registerContent(entry) {
    const data = _load();
    // Avoid duplicates (same hexKey + name + sceneId)
    const exists = data.entries.some(
        e => e.hexKey === entry.hexKey && e.name === entry.name && e.sceneId === entry.sceneId
    );
    if (!exists) {
        data.entries.push({
            hexKey: entry.hexKey,
            sceneId: entry.sceneId,
            type: entry.type,
            subType: entry.subType || "",
            name: entry.name,
            roomCount: entry.roomCount || 0,
            journalId: entry.journalId || "",
            pageId: entry.pageId || "",
        });
        await _save(data);
        console.log(`SDX Registry | Registered ${entry.type} "${entry.name}" at hex ${entry.hexKey}`);
    }
}

/**
 * Get all content within `maxDist` hexes of the given hexKey.
 * @param {string} hexKey    - "i_j" origin
 * @param {number} maxDist   - Maximum hex distance (default 7)
 * @param {string[]} [types] - Optional filter: ["dungeon","settlement","wilderness"]
 * @param {string} [sceneId] - Optional filter by scene
 * @returns {object[]} Matching entries sorted by distance (closest first)
 */
export function getNearbyContent(hexKey, maxDist = 7, types = null, sceneId = null) {
    const data = _load();
    const [oi, oj] = hexKey.split("_").map(Number);

    const results = [];
    for (const entry of data.entries) {
        // Scene filter
        if (sceneId && entry.sceneId !== sceneId) continue;
        // Type filter
        if (types && !types.includes(entry.type)) continue;
        // Don't return the same hex
        if (entry.hexKey === hexKey) continue;

        const [ei, ej] = entry.hexKey.split("_").map(Number);
        const dist = hexDistance(oi, oj, ei, ej);
        if (dist <= maxDist) {
            results.push({ ...entry, distance: dist });
        }
    }

    // Sort closest first
    results.sort((a, b) => a.distance - b.distance);
    return results;
}

/**
 * Get all registered content.
 * @param {string} [sceneId] - Optional filter by scene
 * @returns {object[]}
 */
export function getAllContent(sceneId = null) {
    const data = _load();
    if (sceneId) return data.entries.filter(e => e.sceneId === sceneId);
    return [...data.entries];
}

/**
 * Remove an entry from the registry.
 * @param {string} hexKey
 * @param {string} name
 */
export async function removeContent(hexKey, name) {
    const data = _load();
    data.entries = data.entries.filter(
        e => !(e.hexKey === hexKey && e.name === name)
    );
    await _save(data);
}

// ── Hex distance (offset coordinates) ───────────────────────────────────────

/**
 * Compute hex distance between two offset-coordinate hexes.
 * Converts to cube coordinates first for accurate distance.
 */
function hexDistance(i1, j1, i2, j2) {
    // Offset → cube (even-q vertical layout, which Foundry uses for hex grids)
    const toCube = (col, row) => {
        const q = col;
        const r = row - (col - (col & 1)) / 2;
        const s = -q - r;
        return { q, r, s };
    };
    const a = toCube(i1, j1);
    const b = toCube(i2, j2);
    return Math.max(
        Math.abs(a.q - b.q),
        Math.abs(a.r - b.r),
        Math.abs(a.s - b.s)
    );
}
