/**
 * SDX Dungeon Regions - Helpers for v14 Regions and Behaviors
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Place a Region with the v14-native `changeLevel` behavior.
 * Creates a rectangular region centered on (x, y) with the given size.
 *
 * @param {Object} opts
 * @param {string} opts.sceneId - Target scene
 * @param {number} opts.x - Center x in pixels
 * @param {number} opts.y - Center y in pixels
 * @param {number} [opts.width=100] - Region width in pixels (default: one grid cell)
 * @param {number} [opts.height=100] - Region height in pixels
 * @param {string[]} opts.levels - Two level IDs the region bridges (e.g. ["levelA", "levelB"])
 * @param {string} [opts.name="Stairs"]
 * @param {string[]} [opts.movementActions=[]] - Empty = walk; ["climb"] for ladders
 * @param {Object} [opts.elevation] - Defaults to spanning both levels' ranges
 * @returns {Promise<{id: string, name: string}>}
 */
export async function placeChangeLevelRegion({
    sceneId, x, y, width = 100, height = 100,
    levels, name = "Stairs", movementActions = [],
    elevation
}) {
    const scene = game.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    if (!Array.isArray(levels) || levels.length < 2) {
        throw new Error("placeChangeLevelRegion: levels must be array of 2+ level IDs");
    }

    // Default elevation: span from the lowest level's bottom to the highest level's top
    let elev = elevation;
    if (!elev) {
        const ls = levels.map(id => scene.levels.get(id)).filter(Boolean);
        if (ls.length < 2) throw new Error("levels not found on scene");
        elev = {
            bottom: Math.min(...ls.map(l => l.elevation?.bottom ?? 0)),
            top:    Math.max(...ls.map(l => l.elevation?.top    ?? 0)),
            topInclusive: false
        };
    }

    const [region] = await scene.createEmbeddedDocuments("Region", [{
        name,
        color: "#28c9cc",
        shapes: [{
            type: "rectangle",
            x: x - width / 2,
            y: y - height / 2,
            width, height,
            hole: false,
        }],
        elevation: elev,
        levels,
        visibility: 1,  // "Only on Region Layer" — visible when editing, hidden in play
        locked: false,
        behaviors: [{
            name: "Change Level",
            type: "changeLevel",
            system: { movementActions }
        }]
    }]);

    return { id: region.id, name: region.name };
}

/**
 * Create a defineSurface Region covering every dungeon-generated tile on the
 * given level. Each tile becomes its own rectangle shape in the region's
 * shapes array (no polygon-union needed — Foundry handles multi-shape regions
 * natively).
 *
 * @param {Object} opts
 * @param {string} opts.sceneId
 * @param {string} opts.levelId
 * @param {string} [opts.name="Dungeon Surface"]
 * @returns {Promise<{id: string, name: string, tileCount: number}>}
 */
export async function placeDungeonSurface({ sceneId, levelId, name = "Dungeon Surface" }) {
    const scene = game.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    const level = scene.levels.get(levelId);
    if (!level) throw new Error(`Level ${levelId} not on scene ${sceneId}`);

    // Collect every dungeon-generated tile that belongs to this level.
    // generateDungeon flags tiles with flags["shadowdark-extras"].dungeonFloor = true.
    const tiles = [...scene.tiles].filter(t =>
        t.flags?.[MODULE_ID]?.dungeonFloor === true &&
        (t.levels?.includes?.(levelId) || t.levels?.has?.(levelId))
    );

    if (tiles.length === 0) {
        throw new Error(`No dungeon-generated tiles found on level ${levelId}`);
    }

    // Each tile -> a rectangle shape covering its footprint.
    const shapes = tiles.map(t => ({
        type: "rectangle",
        x: t.x, y: t.y,
        width: t.width, height: t.height,
        hole: false,
    }));

    const [region] = await scene.createEmbeddedDocuments("Region", [{
        name,
        color: "#5cba6e",  // green-ish, distinct from changeLevel cyan
        shapes,
        elevation: {
            bottom: level.elevation?.bottom ?? 0,
            top:    level.elevation?.top    ?? 20,
            topInclusive: false,
        },
        levels: [levelId],
        visibility: 1,
        locked: false,
        behaviors: [{
            name: "Define Surface",
            type: "defineSurface",
            system: {}
        }]
    }]);

    return { id: region.id, name: region.name, tileCount: tiles.length };
}

function isAllowedAssetPath(src) {
    if (typeof src !== "string") return false;
    return src.startsWith(`modules/${MODULE_ID}/`)
        || src.startsWith("worlds/")
        || src.startsWith("fa-nexus-assets/");
}

/**
 * Place a decorative tile (clutter, furniture, or trap) on a specific level.
 * Ensures correct SDX flags and elevation logic for v14/Levels.
 *
 * @param {Object} opts
 * @param {string} opts.sceneId
 * @param {string} opts.levelId
 * @param {string} opts.src - Image path
 * @param {number} opts.x - Pixel X
 * @param {number} opts.y - Pixel Y
 * @param {number} [opts.width] - Optional width override
 * @param {number} [opts.height] - Optional height override
 * @param {boolean} [opts.centered=true] - If true, (x, y) is treated as the center
 * @returns {Promise<Object>} The created tile data
 */
export async function placeDungeonDecor({
    sceneId, levelId, src, x, y, width, height, centered = true
}) {
    if (!isAllowedAssetPath(src)) {
        throw new Error(`SDX.placeDungeonDecor: src "${src}" not in allowlist`);
    }

    const scene = game.scenes.get(sceneId);
    if (!scene) throw new Error(`Scene ${sceneId} not found`);
    const level = scene.levels.get(levelId);
    if (!level) throw new Error(`Level ${levelId} not found`);

    // Determine dimensions
    let w = width;
    let h = height;
    if (!w || !h) {
        const tex = await loadTexture(src);
        w = w || tex.width;
        h = h || tex.height;
    }

    // Adjust for centering
    const finalX = centered ? x - w / 2 : x;
    const finalY = centered ? y - h / 2 : y;

    // Apply elevation logic (matches generateDungeon's createWithElevation)
    // Tiles sit at elevation 0 of their level; v14 native level handling is via levelId.
    const [tile] = await scene.createEmbeddedDocuments("Tile", [{
        texture: { src, anchorX: 0, anchorY: 0 },
        x: finalX,
        y: finalY,
        width: w,
        height: h,
        elevation: 0,
        levels: [levelId],
        sort: 2,
        flags: {
            [MODULE_ID]: { dungeonClutter: true },
            levels: { rangeTop: level.elevation?.top ?? 20 }
        }
    }]);

    return { id: tile.id, x: tile.x, y: tile.y, width: tile.width, height: tile.height };
}
