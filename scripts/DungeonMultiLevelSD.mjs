/**
 * SDX Multi-Level Dungeon Generator (standalone)
 *
 * Builds a stack of procedurally generated dungeon levels on a single v14 scene
 * and connects adjacent levels with native `changeLevel` Region behaviors so a
 * token stepping on a stair changes level (z) while keeping the same x/y.
 *
 * Design: this is purely an orchestration layer. It REUSES the existing
 * single-level generator's pure helpers (layout + render) and the existing
 * `placeChangeLevelRegion` API. The only change to existing files is that those
 * helpers were given the `export` keyword (no logic change).
 *
 * Keystone: every level renders with ONE shared grid offset (computed from the
 * union of all levels' floor cells). Without a shared offset the same logical
 * cell would map to different pixels per level and stairs would not line up.
 * With it, grid cell (gx,gy) -> identical pixel on every level, so a single
 * changeLevel region at that pixel connects both floors.
 */

import {
    seedrandom,
    generateLayout,
    fitToContent,
    generateWalls,
    generateWallVisuals,
    generateDoors,
    renderFloorTilesWithElevation,
    clearSceneAtLevel,
    configureScene,
} from "./DungeonGeneratorSD.mjs";
import { applySceneLevelData, getSelectedFloorTile, getSelectedWallTile, getSelectedDoorTile } from "./DungeonPainterSD.mjs";
import { placeChangeLevelRegion } from "./DungeonRegionsSD.mjs";

const MODULE_ID = "shadowdark-extras";
const GRID_SIZE = 100;
const BASE_PAD = 300;          // matches single-level generator's fitToContent pad
const STAIR_REGION_MARGIN = 5; // changeLevel region reaches this far into the upper level above the boundary
const DIR_DELTA = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

// Connector catalog — the different ways two levels can be joined. Each entry gives the
// upper-level art, the lower-level art, the tile size (px, centered in a GRID_SIZE cell),
// whether the link is traversable both ways, and the level span (1 = adjacent, 2 = skips a
// level for a chute). Upper tiles are flagged dungeonStairsDown and lower tiles dungeonStairs
// (see placeConnectorTile) so the existing clearSceneAtLevel cleanup wipes them on regen with
// no edit to the lead-dev file. Art is shipped with the module already (Dysonstyle map symbols
// + the existing stair webps + a hex ladder).
const SYM = `modules/${MODULE_ID}/assets/symbols/Dysonstyle`;
const CONNECTOR = {
    stairs: { twoWay: true,  size: 50, upper: `modules/${MODULE_ID}/assets/Dungeon/stairsdown.webp`, lower: `modules/${MODULE_ID}/assets/Dungeon/stairs.webp` },
    spiral: { twoWay: true,  size: 96, upper: `${SYM}/stairspiral-1x1.png`, lower: `${SYM}/stairspiral-1x1.png` },
    ladder: { twoWay: true,  size: 84, upper: `modules/${MODULE_ID}/assets/Hexes/Specials/holeladder.png`, lower: `modules/${MODULE_ID}/assets/Hexes/Specials/holeladder.png` },
    shaft:  { twoWay: true,  size: 84, upper: `${SYM}/well_1.png`, lower: `${SYM}/well_1.png` },
    drop:   { twoWay: false, size: 84, upper: `${SYM}/Trapdoor.png`, lower: `${SYM}/Pitcircle1x1.png` },
    chute:  { twoWay: false, size: 84, upper: `${SYM}/Pit1x1.png`, lower: `${SYM}/Pitcircle1x1.png` },
};
const TWO_WAY_VARIANTS = ["spiral", "ladder", "shaft"]; // art variety on the two-way mechanic
const ONE_WAY_SHARE = 0.4;     // of varied EXTRA connectors (not the primary), share that are drops

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/* ───────────────────────────── level docs ───────────────────────────── */

/**
 * Ensure N stacked Level documents exist (entrance on top, descending).
 * Level ids are kept stable across runs (matched by an mlLevelIndex flag, with
 * defaultLevel0000 reused as index 0) so clearSceneAtLevel can clean prior runs.
 * @returns {Promise<Array<{id:string, bottom:number, top:number, index:number}>>}
 */
async function ensureLevels(scene, count, levelHeight, entranceIndex = 0, names = null) {
    // Index 0 is the topmost level. Levels above the entrance index get positive elevation
    // (towers/spires), the entrance sits at 0, and levels below go negative (crypts) — so
    // a castle can stack both upward and downward from a central entrance.
    const nameFor = i => names?.[i] ?? `Level ${i + 1}${i === entranceIndex ? " (Entrance)" : ""}`;
    const ranges = [];
    for (let i = 0; i < count; i++) {
        const bottom = (entranceIndex - i) * levelHeight;
        ranges.push({ index: i, bottom, top: bottom + levelHeight });
    }

    const flagged = new Map();
    for (const lvl of scene.levels) {
        const idx = lvl.flags?.[MODULE_ID]?.mlLevelIndex;
        if (typeof idx === "number") flagged.set(idx, lvl);
    }

    const result = [];
    const updates = [];
    const creates = [];

    for (const r of ranges) {
        let lvl = flagged.get(r.index);
        if (!lvl && r.index === 0) lvl = scene.levels.get("defaultLevel0000");
        if (lvl) {
            updates.push({
                _id: lvl.id,
                name: nameFor(r.index),
                "elevation.bottom": r.bottom,
                "elevation.top": r.top,
                [`flags.${MODULE_ID}.mlLevelIndex`]: r.index,
            });
            result[r.index] = { id: lvl.id, bottom: r.bottom, top: r.top, index: r.index };
        } else {
            creates.push(r);
        }
    }

    if (updates.length) await scene.updateEmbeddedDocuments("Level", updates);
    for (const r of creates) {
        const [created] = await scene.createEmbeddedDocuments("Level", [{
            name: nameFor(r.index),
            elevation: { bottom: r.bottom, top: r.top },
            flags: { [MODULE_ID]: { mlLevelIndex: r.index } },
        }]);
        result[r.index] = { id: created.id, bottom: r.bottom, top: r.top, index: r.index };
    }

    // Remove stale Level docs from a prior run that had MORE levels than this one.
    // Clear each stale level's dungeon content first (clearSceneAtLevel matches by levelId),
    // then delete the Level doc itself. Never delete defaultLevel0000 (Foundry's base level).
    const stale = [...flagged.entries()]
        .filter(([idx, lvl]) => idx >= count && lvl.id !== "defaultLevel0000")
        .map(([, lvl]) => lvl);
    for (const lvl of stale) {
        await clearSceneAtLevel(
            scene,
            { levelId: lvl.id, elevation: lvl.elevation?.bottom ?? 0, rangeTop: lvl.elevation?.top ?? 0 },
            true,
        );
    }
    if (stale.length) await scene.deleteEmbeddedDocuments("Level", stale.map(l => l.id));

    return result;
}

/* ───────────────────────── connection cells ─────────────────────────── */

/** All room-interior cells (excluding the 1-cell wall border) as a "gx,gy" Set. */
function interiorCells(layout) {
    const set = new Set();
    for (const rd of layout.roomData) {
        const r = rd.room;
        for (let gx = r.left + 1; gx < r.right - 1; gx++) {
            for (let gy = r.top + 1; gy < r.bottom - 1; gy++) {
                set.add(`${gx},${gy}`);
            }
        }
    }
    return set;
}

function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/** Carve a straight L-shaped corridor in `floors` from the nearest floor to (tx,ty). */
function carveCorridorTo(floors, tx, ty) {
    let best = null, bestD = Infinity;
    for (const c of floors) {
        const [x, y] = c.split(",").map(Number);
        const d = Math.abs(x - tx) + Math.abs(y - ty);
        if (d < bestD) { bestD = d; best = [x, y]; }
    }
    if (!best) { floors.add(`${tx},${ty}`); return; }
    let [cx, cy] = best;
    while (cx !== tx) { floors.add(`${cx},${cy}`); cx += tx > cx ? 1 : -1; }
    while (cy !== ty) { floors.add(`${cx},${cy}`); cy += ty > cy ? 1 : -1; }
    floors.add(`${tx},${ty}`);
}

/** Shift every coordinate-bearing part of a layout by (dx,dy). */
function translateLayout(layout, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const nf = new Set();
    for (const k of layout.floors) { const [x, y] = k.split(",").map(Number); nf.add(`${x + dx},${y + dy}`); }
    layout.floors = nf;
    for (const rd of layout.roomData) { rd.room.x += dx; rd.room.y += dy; }
    for (const e of layout.entranceEdges) { e.x += dx; e.y += dy; }
    for (const dp of layout.doorPositions) { dp.x += dx; dp.y += dy; }
}

/** Move a layout's bounding-box center to the origin, so independent levels become
 *  concentric — their footprints overlap (shared stair anchors, compact scene, short
 *  connectors) while keeping distinct room arrangements. */
function centerLayout(layout) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const k of layout.floors) { const [x, y] = k.split(",").map(Number); a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    translateLayout(layout, -Math.round((a + c) / 2), -Math.round((b + d) / 2));
}

/**
 * Derive a single level's layout params from the base (UI) params so levels vary in
 * character: "grand halls vs tight crypts". Each level's "prominence" is 1 at the
 * entrance and falls to 0 at the level FARTHEST from it by index (so for a descending
 * dungeon the entrance is grandest and the deepest is tightest; for a castle with
 * spires above + crypts below the great hall is grandest and both extremes are tight).
 * The base params act as the midpoint, so the UI sliders still set overall character.
 *   grand (near entrance): bigger rooms, fewer of them, airier spacing, fewer loops.
 *   tight (far from entrance): smaller rooms, more of them, packed, mazier.
 * `variation` (0..1) scales the swing; 0 reproduces uniform base params on every level.
 * A small deterministic per-level jitter keeps equidistant levels (a spire vs a crypt)
 * from sharing identical params.
 * @returns {{roomCount:number, density:number, linearity:number, roomSizeBias:number, symmetry:boolean}}
 */
function levelLayoutParams(base, index, levelCount, entranceIndex, variation, seed) {
    const maxDist = Math.max(1, entranceIndex, levelCount - 1 - entranceIndex);
    const prominence = 1 - Math.abs(index - entranceIndex) / maxDist; // 1 = grand, 0 = tight
    const bias = (prominence - 0.5) * 2 * variation;                   // +v grand … −v tight

    const j = seedrandom(`${seed}:V${index}`);
    const jit = amp => (j() - 0.5) * 2 * amp * variation;

    const branching = clamp(base.branching - bias * 0.30 + jit(0.05), 0, 1); // grand = fewer loops
    return {
        roomCount: clamp(Math.round(base.roomCount * (1 - bias * 0.40)), 3, 50), // grand = fewer
        density: clamp(base.density - bias * 0.15 + jit(0.04), 0.1, 1),          // grand = airier
        linearity: 1 - branching,
        roomSizeBias: clamp(base.roomSizeBias + bias * 0.35 + jit(0.04), 0, 1),  // grand = bigger
        symmetry: base.symmetry,
    };
}

/**
 * Pick shared "anchor" cells — vertical stairwell positions reused at the same xy on
 * every level. Spread across the footprint (greedy farthest-point) and biased toward
 * cells that already exist on many levels and are room interiors, to minimise stamping.
 * @returns {Array<{gx:number, gy:number, key:string}>}
 */
function pickAnchors(layouts, count, rng, maxCarve = 6) {
    const overlap = new Map();          // "gx,gy" -> how many levels have floor there
    for (const lay of layouts) for (const c of lay.floors) overlap.set(c, (overlap.get(c) ?? 0) + 1);
    const interiors = layouts.map(interiorCells);
    const doorKeys = new Set();         // never anchor on a door cell (a stair in a doorway is nonsense)
    for (const lay of layouts) for (const d of (lay.doorPositions ?? [])) doorKeys.add(`${d.x},${d.y}`);
    const floorArrs = layouts.map(l => [...l.floors].map(c => { const [x, y] = c.split(",").map(Number); return [x, y]; }));

    // A candidate's "carve cost" = the worst (max) distance from it to any level's nearest
    // floor. Capping it keeps the per-level stair connector short, so independent (distinct)
    // floors can still share aligned stair anchors without a long corridor sprawling out.
    const build = (cap) => {
        const out = [];
        for (const [key, ov] of overlap) {
            if (doorKeys.has(key)) continue;            // never put a connector on a door cell
            const [gx, gy] = key.split(",").map(Number);
            let carve = 0, ok = true;
            for (let li = 0; li < layouts.length; li++) {
                if (layouts[li].floors.has(key)) continue; // floor here → no carve on this level
                let dmin = Infinity;
                for (const [x, y] of floorArrs[li]) {
                    const d = Math.abs(x - gx) + Math.abs(y - gy);
                    if (d < dmin) { dmin = d; if (dmin <= 1) break; }
                }
                if (dmin > carve) carve = dmin;
                if (carve > cap) { ok = false; break; }
            }
            if (!ok) continue;
            // Strongly prefer cells that are ALREADY a room interior; penalize floor cells that
            // are NOT interior (corridor / room-edge). Void cells (room=corridor=0) are fine too —
            // ensureRoomAtAnchor stamps them into a chamber — they just cost a little carve.
            let room = 0, corridor = 0;
            for (let li = 0; li < layouts.length; li++) {
                if (interiors[li].has(key)) room++;
                else if (layouts[li].floors.has(key)) corridor++;
            }
            out.push({ key, gx, gy, base: room * 4 + ov - carve - corridor * 2 });
        }
        return out;
    };
    // Relax the cap only if too few candidates exist to place/spread the anchors.
    let candidates = build(maxCarve);
    for (let cap = maxCarve + 4; candidates.length < count * 4 && cap <= 40; cap += 6) candidates = build(cap);

    shuffleInPlace(candidates, rng);
    const anchors = [];
    while (anchors.length < count && candidates.length) {
        let bestIdx = 0, bestScore = -Infinity;
        for (let idx = 0; idx < candidates.length; idx++) {
            const c = candidates[idx];
            let dmin = Infinity;
            for (const a of anchors) dmin = Math.min(dmin, Math.abs(c.gx - a.gx) + Math.abs(c.gy - a.gy));
            const score = (anchors.length ? dmin * 3 : 0) + c.base; // spread dominates, then overlap/room
            if (score > bestScore) { bestScore = score; bestIdx = idx; }
        }
        const [pick] = candidates.splice(bestIdx, 1);
        anchors.push({ gx: pick.gx, gy: pick.gy, key: pick.key });
    }
    return anchors;
}

/**
 * Guarantee a ROOM INTERIOR at `anchor` on `layout` so a connector never sits in a 1-wide
 * corridor or doorway. Always stamps a 3x3 floor block centered on the anchor (the anchor then
 * has floor on all 8 neighbours → it's an interior cell, walled only on the chamber's outer
 * edge). For a cell that was void, a corridor is carved to the nearest floor first so the new
 * chamber is reachable; for an existing room interior the stamp is a no-op; for a corridor /
 * doorway / dead-end it widens the spot into a small chamber. Any door that ends up inside the
 * stamped chamber is dropped (it's open floor now, not a doorway). MUTATES layout — call before
 * the shared offset / rendering.
 */
function ensureRoomAtAnchor(layout, anchor) {
    if (!layout.floors.has(anchor.key)) {
        // Connect to the existing dungeon first (while still empty so the corridor reaches it).
        carveCorridorTo(layout.floors, anchor.gx, anchor.gy);
    }
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        layout.floors.add(`${anchor.gx + dx},${anchor.gy + dy}`);
    }
    // Remove any door now inside the chamber so a door tile doesn't render mid-room.
    if (layout.doorPositions?.length) {
        layout.doorPositions = layout.doorPositions.filter(
            d => Math.abs(d.x - anchor.gx) > 1 || Math.abs(d.y - anchor.gy) > 1,
        );
    }
}

/* ───────────────────────────── rendering ────────────────────────────── */

/** Build a level-aware createWithElevation matching the single-level generator. */
function makeCreateWithElevation(scene, levelContext) {
    const wallBottom = levelContext.elevation;
    return async function createWithElevation(type, docs, chunkSize = 100) {
        for (let i = 0; i < docs.length; i += chunkSize) {
            // Bake elevation/level data into the CREATE payload. applySceneLevelData already
            // sets doc.levels[] + wall-height (walls) / flags.levels.rangeTop (tiles/drawings);
            // we override the tile/drawing elevation to the level's absolute floor (where
            // changeLevel drops descending tokens — floors left at 0 render over them).
            // Doing this at create-time avoids a second updateEmbeddedDocuments pass, which
            // fired updateTile/Drawing hooks against placeables that don't exist on the canvas
            // (any non-viewed level) — making TokenMagic's hook throw
            // "Cannot set properties of undefined (setting 'loadingRequest')" once per doc.
            const batch = docs.slice(i, i + chunkSize).map(doc => {
                applySceneLevelData(doc, type, levelContext);
                if (type !== "Wall") doc.elevation = wallBottom;
                return doc;
            });
            await scene.createEmbeddedDocuments(type, batch);
        }
    };
}

/** Browse the shipped clutter folder once; returns [{src,w,h}] (dims parsed from filename). */
async function browseClutter() {
    const FP = foundry.applications.apps.FilePicker?.implementation ?? globalThis.FilePicker;
    try {
        const result = await FP.browse("data", `modules/${MODULE_ID}/assets/Dungeon/clutter`);
        return (result.files || [])
            .filter(f => /-(\d+)x(\d+)\.\w+$/i.test(f))
            .map(f => { const m = f.match(/-(\d+)x(\d+)\.\w+$/i); return { src: f, w: parseInt(m[1]), h: parseInt(m[2]) }; });
    } catch (e) {
        console.warn(`${MODULE_ID} | Could not browse clutter folder:`, e);
        return [];
    }
}

/** Scatter `clutter` decorative tiles per non-start room (non-overlapping). Mirrors the
 *  single-level generator's clutter pass; tiles are flagged dungeonClutter so regen clears them. */
async function renderClutter(scene, layout, rng, offset, clutter, clutterItems, createWithElevation) {
    if (clutter <= 0 || !clutterItems.length) return;
    const tiles = [];
    for (const rd of layout.roomData) {
        if (rd.isStart) continue;
        const room = rd.room;
        const occupied = new Set();
        for (let c = 0; c < clutter; c++) {
            const item = clutterItems[Math.floor(rng() * clutterItems.length)];
            const cellsW = Math.ceil(item.w / GRID_SIZE), cellsH = Math.ceil(item.h / GRID_SIZE);
            const fitW = room.w - (cellsW - 1), fitH = room.h - (cellsH - 1);
            if (fitW < 1 || fitH < 1) continue;
            let gx, gy, overlaps, tries = 0;
            do {
                gx = room.left + Math.floor(rng() * fitW);
                gy = room.top + Math.floor(rng() * fitH);
                overlaps = false;
                for (let ox = 0; ox < cellsW && !overlaps; ox++)
                    for (let oy = 0; oy < cellsH && !overlaps; oy++)
                        if (occupied.has(`${gx + ox},${gy + oy}`)) overlaps = true;
                tries++;
            } while (overlaps && tries < 20);
            if (overlaps) continue;
            for (let ox = 0; ox < cellsW; ox++) for (let oy = 0; oy < cellsH; oy++) occupied.add(`${gx + ox},${gy + oy}`);
            tiles.push({
                texture: { src: item.src, anchorX: 0, anchorY: 0 },
                x: (gx + offset.x) * GRID_SIZE + (cellsW * GRID_SIZE - item.w) / 2,
                y: (gy + offset.y) * GRID_SIZE + (cellsH * GRID_SIZE - item.h) / 2,
                width: item.w, height: item.h, sort: 2,
                flags: { [MODULE_ID]: { dungeonClutter: true } },
            });
        }
    }
    if (tiles.length) await createWithElevation("Tile", tiles);
}

async function renderLevel(scene, layout, offset, level, cfg, rng, clutterItems) {
    const levelContext = { levelId: level.id, elevation: level.bottom, rangeTop: level.top };
    const cwe = makeCreateWithElevation(scene, levelContext);

    await clearSceneAtLevel(scene, levelContext, true);
    await renderFloorTilesWithElevation(scene, layout.floors, rng, offset, cfg.floorTexture, cwe);

    // Drop "dangling" entrance edges: openings the layout marked on a floor cell whose far
    // side is void (a corridor that never got carved). generateWalls omits a wall at every
    // entrance edge, so a dangling one leaves an open gap to the void. Keep only openings
    // with floor on BOTH sides (real door/corridor connections).
    const connectedEdges = layout.entranceEdges.filter(e => {
        const [dx, dy] = DIR_DELTA[e.dir] ?? [0, 0];
        return layout.floors.has(`${e.x},${e.y}`) && layout.floors.has(`${e.x + dx},${e.y + dy}`);
    });

    const walls = generateWalls(layout.floors, offset, connectedEdges, cfg.wallThickness);
    const doors = generateDoors(layout.doorPositions, offset, cfg.wallThickness, cfg.doorTilePath);
    await cwe("Wall", [...walls, ...doors]);

    const visuals = generateWallVisuals(layout.floors, offset, {
        useTexture: cfg.useTexture,
        wallColor: cfg.wallColor,
        wallThickness: cfg.wallThickness,
        wallTilePath: cfg.wallTilePath,
    }, connectedEdges);
    await cwe("Drawing", visuals);

    await renderClutter(scene, layout, rng, offset, cfg.clutter, clutterItems, cwe);
}

/**
 * Choose a connector type for a single link.
 * @param {function} rng
 * @param {number} variety 0..1 — chance this link is something other than a plain staircase.
 * @param {boolean} allowOneWay — only the EXTRA links of a pair (k>0) and chutes may be one-way;
 *   a pair's first link is always two-way so every level keeps a guaranteed return path.
 * @returns {string} a key of CONNECTOR (never "chute" — chutes are placed separately).
 */
function pickConnectorType(rng, variety, allowOneWay) {
    if (rng() >= variety) return "stairs";
    if (allowOneWay && rng() < ONE_WAY_SHARE) return "drop";
    return TWO_WAY_VARIANTS[Math.floor(rng() * TWO_WAY_VARIANTS.length)];
}

/** Place one connector tile on one level, baked at the level's floor elevation. flagKey is
 *  dungeonStairs / dungeonStairsDown so clearSceneAtLevel wipes it on regen (no lead-dev edit). */
async function placeConnectorTile(scene, level, px, py, src, size, flagKey, type) {
    const levelContext = { levelId: level.id, elevation: level.bottom, rangeTop: level.top };
    const doc = applySceneLevelData({
        texture: { src, anchorX: 0, anchorY: 0 },
        x: px + (GRID_SIZE - size) / 2,
        y: py + (GRID_SIZE - size) / 2,
        width: size,
        height: size,
        sort: 2,
        flags: { [MODULE_ID]: { [flagKey]: true, mlConnectorType: type } },
    }, "Tile", levelContext);
    doc.elevation = level.bottom; // bake floor elevation at create (no post-update → no TokenMagic update-hook crash)
    const [tile] = await scene.createEmbeddedDocuments("Tile", [doc]);
    return tile;
}

/**
 * Place a full connector between an upper and a lower level (same xy): the upper tile, the
 * lower tile, and a changeLevel region. TWO-WAY links use a band spanning both levels' floors
 * (walk down OR up). ONE-WAY links (drop/chute) use a band covering ONLY the upper floor — a
 * token falls in from above (deposited on the lower level, below the band) but can never
 * re-trigger from below, so it can't climb back. `upper` is always the higher-elevation level.
 */
async function placeConnectorPair(scene, upper, lower, px, py, type, label) {
    const def = CONNECTOR[type];
    await placeConnectorTile(scene, upper, px, py, def.upper, def.size, "dungeonStairsDown", type);
    await placeConnectorTile(scene, lower, px, py, def.lower, def.size, "dungeonStairs", type);
    const elevation = def.twoWay
        ? { bottom: lower.bottom, top: upper.bottom + STAIR_REGION_MARGIN, topInclusive: false }
        : { bottom: upper.bottom, top: upper.bottom + STAIR_REGION_MARGIN, topInclusive: false };
    const { id } = await placeChangeLevelRegion({
        sceneId: scene.id,
        x: px + GRID_SIZE / 2,
        y: py + GRID_SIZE / 2,
        width: GRID_SIZE,
        height: GRID_SIZE,
        levels: [upper.id, lower.id],
        elevation,
        name: `${def.twoWay ? "Stairs" : "Drop"} ${label}`,
        movementActions: [],
    });
    await scene.updateEmbeddedDocuments("Region", [{
        _id: id,
        [`flags.${MODULE_ID}.mlStairRegion`]: true,
        [`flags.${MODULE_ID}.mlConnectorType`]: type,
        [`flags.${MODULE_ID}.mlOneWay`]: !def.twoWay,
    }]);
}

/* ───────────────────────────── orchestrator ─────────────────────────── */

/**
 * Generate a multi-level dungeon on a scene.
 * @param {object} config
 * @returns {Promise<{levels:number, connections:number, seed:string}>}
 */
export async function generateMultiLevelDungeon(config = {}) {
    if (!game.user.isGM) {
        ui.notifications?.warn("SDX | Only a GM can generate dungeons.");
        return;
    }

    const scene = config.scene ?? canvas.scene;
    if (!scene) {
        ui.notifications?.error("SDX | No active scene.");
        return;
    }

    const cfg = {
        seed: config.seed ?? foundry.utils.randomID(6),
        levelCount: clamp(Math.round(config.levelCount ?? 3), 2, 8),
        levelHeight: config.levelHeight ?? 20,
        connectionsPerPair: clamp(Math.round(config.connectionsPerPair ?? 1), 1, 4),
        anchorCount: config.anchorCount != null ? clamp(Math.round(config.anchorCount), 2, 8) : null,
        sharedFootprint: config.sharedFootprint ?? false,
        entranceIndex: config.entranceIndex ?? 0,
        levelNames: Array.isArray(config.levelNames) ? config.levelNames : null,
        roomCount: clamp(Math.round(config.roomCount ?? 10), 1, 50),
        clutter: clamp(Math.round(config.clutter ?? 0), 0, 20),
        density: config.density ?? 0.6,
        branching: config.branching ?? 0.5,
        roomSizeBias: config.roomSizeBias ?? 0.5,
        symmetry: config.symmetry ?? false,
        // Per-level "grand halls vs tight crypts" variation strength (0 = uniform levels).
        // Only applies to independent layouts (sharedFootprint:false); shared footprints
        // are identical by design. See levelLayoutParams.
        variation: clamp(config.variation ?? 1, 0, 1),
        // Connector variety: 0 = every link is a plain two-way staircase (original behavior);
        // higher = more spiral/ladder/shaft art, occasional one-way drops on extra links, and
        // occasional non-adjacent one-way chutes (i→i+2). See pickConnectorType / step 2.
        connectorVariety: clamp(config.connectorVariety ?? 0.4, 0, 1),
        useTexture: config.useTexture ?? false,
        wallColor: config.wallColor ?? "#5C3D3D",
        wallThickness: config.useTexture ? 20 : (config.wallThickness ?? 20),
        floorTexture: config.floorTexture ?? getSelectedFloorTile()
            ?? `modules/${MODULE_ID}/assets/Dungeon/floor_tiles/stone_floor_00.png`,
        wallTilePath: config.wallTilePath ?? getSelectedWallTile() ?? null,
        doorTilePath: config.doorTilePath ?? getSelectedDoorTile() ?? null,
    };

    ui.notifications?.info(`SDX | Generating ${cfg.levelCount}-level dungeon (seed ${cfg.seed})...`);

    try {
        await configureScene(scene);

        // 1. Generate layouts. DEFAULT (sharedFootprint:false): an INDEPENDENT layout per
        //    level, each centered so footprints overlap (shared stair anchors, compact scene)
        //    while staying distinct, and each given per-level params so levels vary in
        //    character — grand halls near the entrance, tight crypts farthest from it
        //    (see levelLayoutParams). sharedFootprint:true instead builds every level from
        //    ONE base layout (identical floors) — the keep/tower option where shared-cell
        //    stairs sit in rooms on every level with no carving; per-level variation does
        //    not apply there.
        const entranceIdx = clamp(Math.round(cfg.entranceIndex), 0, cfg.levelCount - 1);
        const layouts = [];
        if (cfg.sharedFootprint) {
            const base = generateLayout({
                roomCount: cfg.roomCount, density: cfg.density, linearity: 1 - cfg.branching,
                roomSizeBias: cfg.roomSizeBias, symmetry: cfg.symmetry,
            }, seedrandom(`${cfg.seed}:base`));
            for (let i = 0; i < cfg.levelCount; i++) {
                layouts.push({
                    floors: new Set(base.floors),       // own copy (anchor stamping is per-level)
                    roomData: base.roomData,            // read-only downstream
                    entranceEdges: base.entranceEdges,
                    doorPositions: base.doorPositions,
                });
            }
        } else {
            for (let i = 0; i < cfg.levelCount; i++) {
                const lp = levelLayoutParams(cfg, i, cfg.levelCount, entranceIdx, cfg.variation, cfg.seed);
                const lay = generateLayout(lp, seedrandom(`${cfg.seed}:L${i}`));
                centerLayout(lay); // concentric footprints → overlap (shared stairs) without sprawl
                layouts.push(lay);
            }
        }

        // 2. Pick shared anchor positions (vertical stairwells) spread across the footprint,
        //    then connect adjacent pairs at them. Anchors are reused at the same xy on every
        //    level (vertical coherence), and consecutive pairs draw from DIFFERENT anchors so
        //    a middle level's up- and down-stairs never land on the same spot.
        //    Runs BEFORE the shared offset because ensureRoomAtAnchor may stamp floor.
        const cpp = cfg.connectionsPerPair;
        // Base anchors cover the adjacent links; with variety on, add headroom so non-adjacent
        // chutes can find cells not already taken by adjacent connectors (capped to avoid sprawl).
        const anchorCount = cfg.anchorCount
            ?? Math.min(12, Math.max(3, 2 * cpp) + (cfg.connectorVariety > 0 ? cfg.levelCount - 1 : 0));
        const anchors = pickAnchors(layouts, anchorCount, seedrandom(`${cfg.seed}:A`));
        const vRng = seedrandom(`${cfg.seed}:CV`); // connector-variety rng (types + chutes)

        // Adjacent-pair connections, each tagged with a connector type. The FIRST link of every
        // pair is forced two-way (allowOneWay=false) so each level always keeps a return path;
        // only extra links (k>0) may roll a one-way drop. usedByLevel tracks which anchor cells
        // already carry a connector tile on each level, so chutes below don't stack on them.
        const usedByLevel = Array.from({ length: cfg.levelCount }, () => new Set());
        const connections = [];
        for (let i = 0; i < cfg.levelCount - 1; i++) {
            const picks = [];
            for (let k = 0; k < cpp; k++) {
                const cell = anchors[(i * cpp + k) % anchors.length];
                const type = pickConnectorType(vRng, cfg.connectorVariety, k > 0);
                ensureRoomAtAnchor(layouts[i], cell);
                ensureRoomAtAnchor(layouts[i + 1], cell);
                usedByLevel[i].add(cell.key);
                usedByLevel[i + 1].add(cell.key);
                picks.push({ cell, type });
            }
            connections.push(picks);
        }

        // Occasional non-adjacent one-way "chutes" (level i → i+2) — Jaquaysing shortcuts that
        // skip a level. Always one-way so the through-level (i+1) and the return trip stay
        // unambiguous. Count scales with variety and depth; cells must be free on both ends.
        const chutes = [];
        if (cfg.levelCount >= 3 && cfg.connectorVariety > 0) {
            const want = Math.min(cfg.levelCount - 2, Math.round(cfg.connectorVariety * (cfg.levelCount - 1)));
            const usedChute = new Set();
            for (let guard = 0; chutes.length < want && guard < want * 12; guard++) {
                const i = Math.floor(vRng() * (cfg.levelCount - 2)); // 0 .. levelCount-3
                const cell = anchors[Math.floor(vRng() * anchors.length)];
                const tag = `${i}:${cell.key}`;
                if (usedChute.has(tag)) continue;
                if (usedByLevel[i].has(cell.key) || usedByLevel[i + 2].has(cell.key)) continue;
                usedChute.add(tag);
                ensureRoomAtAnchor(layouts[i], cell);
                ensureRoomAtAnchor(layouts[i + 2], cell);
                usedByLevel[i].add(cell.key);
                usedByLevel[i + 2].add(cell.key);
                chutes.push({ i, cell });
            }
        }

        // 3. Shared offset from the union of every level's (post-carve) floor cells.
        const union = new Set();
        for (const lay of layouts) for (const c of lay.floors) union.add(c);
        let { offset, width, height } = fitToContent(union, GRID_SIZE, BASE_PAD);
        // Multi-level owns the whole scene (it regenerates every level), so size tightly to
        // the content instead of max() — avoids an oversized canvas growing on each re-run.
        await scene.update({ width, height });
        // Keep content inside the scene padding + room for outward wall thickness.
        {
            const scenePadX = Math.ceil(scene.width * scene.padding / GRID_SIZE) * GRID_SIZE;
            const scenePadY = Math.ceil(scene.height * scene.padding / GRID_SIZE) * GRID_SIZE;
            const extraX = Math.max(0, Math.ceil((scenePadX + GRID_SIZE + cfg.wallThickness - BASE_PAD) / GRID_SIZE));
            const extraY = Math.max(0, Math.ceil((scenePadY + GRID_SIZE + cfg.wallThickness - BASE_PAD) / GRID_SIZE));
            offset = { x: offset.x + extraX, y: offset.y + extraY };
        }

        // 4. Ensure the stacked Level docs (stable ids).
        const levels = await ensureLevels(scene, cfg.levelCount, cfg.levelHeight,
            clamp(Math.round(cfg.entranceIndex), 0, cfg.levelCount - 1), cfg.levelNames);

        // 5. Clean up changeLevel regions from a prior run (clearSceneAtLevel skips Regions).
        const oldRegions = scene.regions
            .filter(r => r.flags?.[MODULE_ID]?.mlStairRegion).map(r => r.id);
        if (oldRegions.length) await scene.deleteEmbeddedDocuments("Region", oldRegions);

        // 6. Render each level with the shared offset.
        const clutterItems = cfg.clutter > 0 ? await browseClutter() : [];
        for (let i = 0; i < cfg.levelCount; i++) {
            await renderLevel(scene, layouts[i], offset, levels[i], cfg, seedrandom(`${cfg.seed}:F${i}`), clutterItems);
        }

        // 7. Connect levels: connector tiles (same xy) + a changeLevel region per link.
        //    placeConnectorPair handles art + the two-way vs one-way elevation band. A
        //    full-height region would stop changeLevel firing, so the band stays tight
        //    around the floor(s) — see placeConnectorPair.
        let connectionCount = 0;
        for (let i = 0; i < cfg.levelCount - 1; i++) {
            const upper = levels[i];      // shallower (higher z) — go DOWN from here
            const lower = levels[i + 1];  // deeper (lower z)
            for (const { cell, type } of connections[i]) {
                const px = (cell.gx + offset.x) * GRID_SIZE;
                const py = (cell.gy + offset.y) * GRID_SIZE;
                await placeConnectorPair(scene, upper, lower, px, py, type, `L${i + 1}↔L${i + 2}`);
                connectionCount++;
            }
        }
        // Non-adjacent one-way chutes (level i → i+2).
        for (const { i, cell } of chutes) {
            const px = (cell.gx + offset.x) * GRID_SIZE;
            const py = (cell.gy + offset.y) * GRID_SIZE;
            await placeConnectorPair(scene, levels[i], levels[i + 2], px, py, "chute", `L${i + 1}→L${i + 3}`);
            connectionCount++;
        }

        ui.notifications?.info(
            `SDX | Multi-level dungeon ready: ${cfg.levelCount} levels, ${connectionCount} stair connections.`,
        );
        return { levels: cfg.levelCount, connections: connectionCount, seed: cfg.seed };
    } catch (err) {
        console.error(`${MODULE_ID} | Multi-level dungeon generation failed:`, err);
        ui.notifications?.error("SDX | Multi-level dungeon generation failed. See console.");
        throw err;
    }
}

// Expose on the module API once loaded (this file is registered in module.json esmodules,
// so it loads at startup; also a no-op-safe path for MCP dynamic-import testing).
Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
        mod.api ??= {};
        mod.api.generateMultiLevelDungeon = generateMultiLevelDungeon;
    }
});

/* ─────────────── tray Multi-Level slider persistence (standalone) ─────────────── */
// Persists the tray's Multi-Level sliders (Levels / Links / Variation / Variety) WITHOUT
// touching the lead dev's `generatorSettings` schema — a separate client setting + a render
// hook that restores values into the panel and saves them on change. The apply handler reads
// the live DOM values, so this layer only handles remember-across-renders + show/hide.
const ML_SLIDERS_KEY = "mlSliders";
const ML_SLIDERS_DEFAULT = { levels: 1, links: 1, variation: 1, variety: 0.4 };

function readMlSliders() {
    try {
        const v = game.settings.get(MODULE_ID, ML_SLIDERS_KEY);
        return { ...ML_SLIDERS_DEFAULT, ...(v && typeof v === "object" ? v : {}) };
    } catch { return { ...ML_SLIDERS_DEFAULT }; }
}
function saveMlSlider(key, value) {
    try { game.settings.set(MODULE_ID, ML_SLIDERS_KEY, { ...readMlSliders(), [key]: value }); } catch { /* noop */ }
}

Hooks.once("init", () => {
    try {
        game.settings.register(MODULE_ID, ML_SLIDERS_KEY, {
            scope: "client", config: false, type: Object, default: { ...ML_SLIDERS_DEFAULT },
        });
    } catch (e) { console.warn(`${MODULE_ID} | failed to register ${ML_SLIDERS_KEY} setting`, e); }
});

Hooks.on("renderTrayApp", (app, html) => {
    const root = html instanceof HTMLElement ? html : (html?.[0] ?? null);
    if (!root || !root.querySelector?.(".dgen-levels")) return; // generator panel not in DOM
    const saved = readMlSliders();
    const bind = (sel, key, toNum) => {
        const slider = root.querySelector(sel);
        if (!slider) return;
        slider.value = String(saved[key]);
        const span = slider.closest(".dgen-row")?.querySelector(".dgen-value");
        if (span) span.textContent = slider.value;
        slider.addEventListener("change", () => saveMlSlider(key, toNum(slider.value)));
    };
    bind(".dgen-levels", "levels", v => parseInt(v));
    bind(".dgen-links", "links", v => parseInt(v));
    bind(".dgen-variation", "variation", v => parseFloat(v));
    bind(".dgen-variety", "variety", v => parseFloat(v));

    // Variation/Variety only apply to multi-level — mirror the existing "Levels>=2" gating that
    // hides the single-level Stairs rows, but in reverse (show these only when Levels>=2).
    const levels = root.querySelector(".dgen-levels");
    const extraRows = [".dgen-variation", ".dgen-variety"]
        .map(s => root.querySelector(s)?.closest(".dgen-row")).filter(Boolean);
    const syncExtras = n => { const multi = parseInt(n) >= 2; for (const r of extraRows) r.style.display = multi ? "" : "none"; };
    if (levels) {
        syncExtras(levels.value);
        levels.addEventListener("input", e => syncExtras(e.target.value));
        // Re-trigger the lead dev's own Levels>=2 listener so the restored value hides/shows the
        // single-level Stairs rows correctly on first render.
        levels.dispatchEvent(new Event("input", { bubbles: true }));
    }
});
