/**
 * SDX Dungeon Generator - Procedural dungeon layout generation
 * Spine-walker algorithm for room placement with corridors, doors, and wall visuals
 */

import { getSelectedFloorTile, getSelectedWallTile, getSelectedDoorTile, getCurrentElevation, getDungeonBackground, ensureBackgroundDrawing } from "./DungeonPainterSD.mjs";

const MODULE_ID = "shadowdark-extras";
const GRID_SIZE = 100;
const LEVEL_HEIGHT = 10;
const ELEVATION_TOLERANCE = 5;

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════

let _generatorExpanded = false;
let _generatorSeed = generateRandomSeed();
let _generatorSettings = {
    rooms: 10,
    density: 0.8,
    branching: 0.5,
    roomSize: 0.5,
    symmetry: true,
    stairs: 1,
    stairsDown: 1,
    clutter: 0,
    textured: true,
    wallShadows: false,
    wallColor: "#5C3D3D",
    thickness: 20
};

// ═══════════════════════════════════════════════════════
//  DIRECTION ENUM
// ═══════════════════════════════════════════════════════

const Direction = {
    NORTH: 0,
    SOUTH: 1,
    EAST: 2,
    WEST: 3
};

const DIRECTION_OFFSETS = {
    [Direction.NORTH]: { dx: 0, dy: -1 },
    [Direction.SOUTH]: { dx: 0, dy: 1 },
    [Direction.EAST]:  { dx: 1, dy: 0 },
    [Direction.WEST]:  { dx: -1, dy: 0 }
};

const OPPOSITE = {
    [Direction.NORTH]: Direction.SOUTH,
    [Direction.SOUTH]: Direction.NORTH,
    [Direction.EAST]: Direction.WEST,
    [Direction.WEST]: Direction.EAST
};

const PERPENDICULAR = {
    [Direction.NORTH]: [Direction.EAST, Direction.WEST],
    [Direction.SOUTH]: [Direction.EAST, Direction.WEST],
    [Direction.EAST]:  [Direction.NORTH, Direction.SOUTH],
    [Direction.WEST]:  [Direction.NORTH, Direction.SOUTH]
};

// ═══════════════════════════════════════════════════════
//  SEEDED RNG
// ═══════════════════════════════════════════════════════

function seedrandom(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) {
        s = ((s << 5) - s + seed.charCodeAt(i)) | 0;
    }
    let m_w = (123456789 + s) & 0xffffffff;
    let m_z = (987654321 - s) & 0xffffffff;

    return function() {
        m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & 0xffffffff;
        m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & 0xffffffff;
        let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
        return result / 4294967296;
    };
}

// ═══════════════════════════════════════════════════════
//  PROCGEN ROOM
// ═══════════════════════════════════════════════════════

class ProcgenRoom {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    get left() { return this.x; }
    get right() { return this.x + this.w; }
    get top() { return this.y; }
    get bottom() { return this.y + this.h; }
    get cx() { return this.x + Math.floor(this.w / 2); }
    get cy() { return this.y + Math.floor(this.h / 2); }

    intersects(other, margin = 0) {
        return !(this.right + margin <= other.left ||
                 other.right + margin <= this.left ||
                 this.bottom + margin <= other.top ||
                 other.bottom + margin <= this.top);
    }
}

// ═══════════════════════════════════════════════════════
//  SPINE WALKER
// ═══════════════════════════════════════════════════════

class SpineWalker {
    constructor(room, direction, length, depth, rng) {
        this.currentRoom = room;
        this.direction = direction;
        this.remainingLength = length;
        this.depth = depth;
        this.rng = rng;
        this.isDead = false;
    }
}

// ═══════════════════════════════════════════════════════
//  LAYOUT GENERATOR
// ═══════════════════════════════════════════════════════

function generateLayout(params, rng) {
    const {
        roomCount = 10,
        density = 0.8,
        linearity = 0.5,
        roomSizeBias = 0.5,
        symmetry = true
    } = params;

    const floors = new Set();
    const corridors = new Set();
    const placedRooms = [];
    const doorPositions = [];
    const entranceEdges = [];
    const roomData = [];

    // Room-to-room adjacency for loop detection
    const adjacency = new Map(); // roomIndex -> Set of roomIndex

    const minRoomSize = 3;
    const maxRoomSize = 5 + Math.round(roomSizeBias * 3);
    const spacing = Math.max(0, Math.round(4 * (1 - density)));

    function randRoomSize() {
        return minRoomSize + Math.floor(rng() * (maxRoomSize - minRoomSize + 1));
    }

    function addRoomFloors(room) {
        for (let rx = room.x; rx < room.x + room.w; rx++) {
            for (let ry = room.y; ry < room.y + room.h; ry++) {
                floors.add(`${rx},${ry}`);
            }
        }
    }

    function canPlace(room, margin) {
        for (const existing of placedRooms) {
            if (room.intersects(existing, margin)) return false;
        }
        return true;
    }

    function addEdge(idxA, idxB) {
        if (!adjacency.has(idxA)) adjacency.set(idxA, new Set());
        if (!adjacency.has(idxB)) adjacency.set(idxB, new Set());
        adjacency.get(idxA).add(idxB);
        adjacency.get(idxB).add(idxA);
    }

    // Lay a straight corridor between two grid points, return tiles added
    function layCorridor(x1, y1, x2, y2) {
        const tiles = [];
        const ddx = Math.sign(x2 - x1);
        const ddy = Math.sign(y2 - y1);
        let cx = x1, cy = y1;
        while (cx !== x2 || cy !== y2) {
            corridors.add(`${cx},${cy}`);
            floors.add(`${cx},${cy}`);
            tiles.push(`${cx},${cy}`);
            if (cx !== x2) cx += ddx;
            else if (cy !== y2) cy += ddy;
        }
        corridors.add(`${x2},${y2}`);
        floors.add(`${x2},${y2}`);
        tiles.push(`${x2},${y2}`);
        return tiles;
    }

    // Mark corridor entrance edges (suppress walls at room-corridor junctions)
    function markCorridorEdges(roomA, roomB, direction) {
        switch (direction) {
            case Direction.NORTH:
                entranceEdges.push({ x: roomA.cx, y: roomA.top - 1, dir: 'S' });
                entranceEdges.push({ x: roomA.cx, y: roomA.top, dir: 'N' });
                entranceEdges.push({ x: roomA.cx, y: roomB.bottom, dir: 'N' });
                entranceEdges.push({ x: roomA.cx, y: roomB.bottom - 1, dir: 'S' });
                break;
            case Direction.SOUTH:
                entranceEdges.push({ x: roomA.cx, y: roomA.bottom, dir: 'N' });
                entranceEdges.push({ x: roomA.cx, y: roomA.bottom - 1, dir: 'S' });
                entranceEdges.push({ x: roomA.cx, y: roomB.top - 1, dir: 'S' });
                entranceEdges.push({ x: roomA.cx, y: roomB.top, dir: 'N' });
                break;
            case Direction.EAST:
                entranceEdges.push({ x: roomA.right, y: roomA.cy, dir: 'W' });
                entranceEdges.push({ x: roomA.right - 1, y: roomA.cy, dir: 'E' });
                entranceEdges.push({ x: roomB.left - 1, y: roomA.cy, dir: 'E' });
                entranceEdges.push({ x: roomB.left, y: roomA.cy, dir: 'W' });
                break;
            case Direction.WEST:
                entranceEdges.push({ x: roomA.left - 1, y: roomA.cy, dir: 'E' });
                entranceEdges.push({ x: roomA.left, y: roomA.cy, dir: 'W' });
                entranceEdges.push({ x: roomB.right, y: roomA.cy, dir: 'W' });
                entranceEdges.push({ x: roomB.right - 1, y: roomA.cy, dir: 'E' });
                break;
        }
    }

    // ── Starting room ──
    const startW = randRoomSize();
    const startH = randRoomSize();
    const startRoom = new ProcgenRoom(-Math.floor(startW / 2), -Math.floor(startH / 2), startW, startH);
    placedRooms.push(startRoom);
    addRoomFloors(startRoom);
    roomData.push({ room: startRoom, isStart: true });

    // ── Entrance ──
    const allDirs = [Direction.NORTH, Direction.SOUTH, Direction.EAST, Direction.WEST];
    const spineDir = allDirs[Math.floor(rng() * allDirs.length)];
    const entranceDir = OPPOSITE[spineDir];

    // Calculate the entrance starting point at the room EDGE (not center)
    let entStartX, entStartY;
    switch (entranceDir) {
        case Direction.NORTH:
            entStartX = startRoom.cx; entStartY = startRoom.top - 1;
            break;
        case Direction.SOUTH:
            entStartX = startRoom.cx; entStartY = startRoom.bottom;
            break;
        case Direction.EAST:
            entStartX = startRoom.right; entStartY = startRoom.cy;
            break;
        case Direction.WEST:
            entStartX = startRoom.left - 1; entStartY = startRoom.cy;
            break;
    }

    const entranceOff = DIRECTION_OFFSETS[entranceDir];
    // Lay 3 corridor tiles starting from the room edge outward
    for (let i = 0; i < 3; i++) {
        const ex = entStartX + entranceOff.dx * i;
        const ey = entStartY + entranceOff.dy * i;
        floors.add(`${ex},${ey}`);
        corridors.add(`${ex},${ey}`);
    }

    // Suppress walls where entrance meets room
    switch (entranceDir) {
        case Direction.NORTH:
            entranceEdges.push({ x: startRoom.cx, y: startRoom.top, dir: 'N' });
            entranceEdges.push({ x: startRoom.cx, y: startRoom.top - 1, dir: 'S' });
            break;
        case Direction.SOUTH:
            entranceEdges.push({ x: startRoom.cx, y: startRoom.bottom - 1, dir: 'S' });
            entranceEdges.push({ x: startRoom.cx, y: startRoom.bottom, dir: 'N' });
            break;
        case Direction.EAST:
            entranceEdges.push({ x: startRoom.right - 1, y: startRoom.cy, dir: 'E' });
            entranceEdges.push({ x: startRoom.right, y: startRoom.cy, dir: 'W' });
            break;
        case Direction.WEST:
            entranceEdges.push({ x: startRoom.left, y: startRoom.cy, dir: 'W' });
            entranceEdges.push({ x: startRoom.left - 1, y: startRoom.cy, dir: 'E' });
            break;
    }
    // Door at the first corridor tile (right at the room edge)
    doorPositions.push({ x: entStartX, y: entStartY, dir: entranceDir });

    // ── Walker-based room placement ──
    // Short spine so branches get the budget
    const spineLength = Math.max(2, Math.ceil(roomCount / 4));
    const walkers = [new SpineWalker(startRoom, spineDir, spineLength, 0, rng)];
    // Track which room index each walker's current room is
    const walkerParentIdx = [0];

    let roundRobin = 0;
    let attempts = 0;
    const maxAttempts = roomCount * 40;

    while (placedRooms.length < roomCount && attempts < maxAttempts) {
        attempts++;

        // Round-robin: cycle through walkers fairly
        let walker = null;
        let walkerIdx = -1;
        for (let i = 0; i < walkers.length; i++) {
            const idx = (roundRobin + i) % walkers.length;
            if (!walkers[idx].isDead) {
                walker = walkers[idx];
                walkerIdx = idx;
                roundRobin = (idx + 1) % walkers.length;
                break;
            }
        }
        if (!walker) break;

        if (walker.remainingLength <= 0) {
            walker.isDead = true;
            continue;
        }

        // Try to place a room
        const result = _stepWalker(walker, placedRooms, floors, corridors, doorPositions, entranceEdges, roomData, {
            spacing, minRoomSize, maxRoomSize
        }, rng, markCorridorEdges, layCorridor);

        if (result.placed) {
            const newRoomIdx = placedRooms.length - 1;
            addEdge(walkerParentIdx[walkerIdx], newRoomIdx);
            walker.currentRoom = result.newRoom;
            walkerParentIdx[walkerIdx] = newRoomIdx;
            walker.remainingLength--;

            // ── Branching ──
            // Chance scales with branching param, softly reduced by depth (never zero)
            const branchChance = (1 - linearity) * Math.max(0.25, 1.0 - walker.depth * 0.1);

            if (placedRooms.length < roomCount && rng() < branchChance) {
                const perps = PERPENDICULAR[walker.direction];
                const branchDir = perps[Math.floor(rng() * perps.length)];
                // Branches get a generous length so they can grow deep
                const branchLen = 1 + Math.floor(rng() * Math.max(2, Math.ceil(roomCount / 5)));
                walkers.push(new SpineWalker(result.newRoom, branchDir, branchLen, walker.depth + 1, rng));
                walkerParentIdx.push(newRoomIdx);

                if (symmetry && placedRooms.length + 2 < roomCount) {
                    walkers.push(new SpineWalker(result.newRoom, OPPOSITE[branchDir], branchLen, walker.depth + 1, rng));
                    walkerParentIdx.push(newRoomIdx);
                }
            }

            // Sometimes a branch turns a corner (changes its own direction)
            if (walker.depth > 0 && walker.remainingLength > 0 && rng() < (1 - linearity) * 0.4) {
                const perps = PERPENDICULAR[walker.direction];
                walker.direction = perps[Math.floor(rng() * perps.length)];
            }
        } else {
            // Placement failed - try redirecting before giving up
            walker._failCount = (walker._failCount || 0) + 1;
            if (walker._failCount < 3) {
                const perps = PERPENDICULAR[walker.direction];
                walker.direction = perps[Math.floor(rng() * perps.length)];
            } else {
                walker.isDead = true;
            }
        }
    }

    // ── Loop creation pass ──
    // Connect nearby rooms that aren't already adjacent to form loops
    if (linearity < 0.9 && placedRooms.length >= 4) {
        const loopBudget = Math.max(1, Math.floor(placedRooms.length * (1 - linearity) * 0.3));
        let loopsCreated = 0;

        // Build candidate pairs sorted by distance
        const candidates = [];
        for (let i = 0; i < placedRooms.length; i++) {
            for (let j = i + 1; j < placedRooms.length; j++) {
                // Skip if already connected
                if (adjacency.get(i)?.has(j)) continue;

                const a = placedRooms[i];
                const b = placedRooms[j];
                const dist = Math.abs(a.cx - b.cx) + Math.abs(b.cy - a.cy);
                const minDim = Math.max(a.w, a.h, b.w, b.h);

                // Only consider rooms that are close-ish but not overlapping
                if (dist > minDim && dist < minDim * 5 + spacing * 4) {
                    candidates.push({ i, j, dist });
                }
            }
        }
        candidates.sort((a, b) => a.dist - b.dist);

        for (const cand of candidates) {
            if (loopsCreated >= loopBudget) break;

            const roomA = placedRooms[cand.i];
            const roomB = placedRooms[cand.j];

            const dx = roomB.cx - roomA.cx;
            const dy = roomB.cy - roomA.cy;
            const horizontal = Math.abs(dx) >= Math.abs(dy);

            let corridorOk = true;
            let exitX, exitY, entryX, entryY;

            if (horizontal) {
                if (dx > 0) {
                    exitX = roomA.right;
                    entryX = roomB.left - 1;
                } else {
                    exitX = roomA.left - 1;
                    entryX = roomB.right;
                }
                exitY = roomA.cy;
                entryY = roomA.cy;
            } else {
                if (dy > 0) {
                    exitY = roomA.bottom;
                    entryY = roomB.top - 1;
                } else {
                    exitY = roomA.top - 1;
                    entryY = roomB.bottom;
                }
                exitX = roomA.cx;
                entryX = roomA.cx;
            }

            // Corridor must have at least 1 tile between rooms
            const corridorLength = Math.abs(exitX - entryX) + Math.abs(exitY - entryY);
            if (corridorLength < 1) continue;

            // Check corridor doesn't pass through other rooms
            if (horizontal) {
                const step = exitX <= entryX ? 1 : -1;
                for (let cx = exitX; cx !== entryX + step; cx += step) {
                    for (let r = 0; r < placedRooms.length; r++) {
                        if (r === cand.i || r === cand.j) continue;
                        const rm = placedRooms[r];
                        if (cx >= rm.left && cx < rm.right && exitY >= rm.top && exitY < rm.bottom) {
                            corridorOk = false;
                            break;
                        }
                    }
                    if (!corridorOk) break;
                }
            } else {
                const step = exitY <= entryY ? 1 : -1;
                for (let cy = exitY; cy !== entryY + step; cy += step) {
                    for (let r = 0; r < placedRooms.length; r++) {
                        if (r === cand.i || r === cand.j) continue;
                        const rm = placedRooms[r];
                        if (exitX >= rm.left && exitX < rm.right && cy >= rm.top && cy < rm.bottom) {
                            corridorOk = false;
                            break;
                        }
                    }
                    if (!corridorOk) break;
                }
            }

            if (!corridorOk) continue;

            // Lay the corridor
            layCorridor(exitX, exitY, entryX, entryY);

            // Mark entrance edges using the same logic as markCorridorEdges
            // RoomA exit side
            if (horizontal) {
                if (dx > 0) {
                    // East: corridor exits roomA's right edge
                    entranceEdges.push({ x: roomA.right - 1, y: roomA.cy, dir: 'E' });
                    entranceEdges.push({ x: roomA.right, y: roomA.cy, dir: 'W' });
                    // West: corridor enters roomB's left edge
                    entranceEdges.push({ x: roomB.left - 1, y: roomA.cy, dir: 'E' });
                    entranceEdges.push({ x: roomB.left, y: roomA.cy, dir: 'W' });
                } else {
                    // West: corridor exits roomA's left edge
                    entranceEdges.push({ x: roomA.left, y: roomA.cy, dir: 'W' });
                    entranceEdges.push({ x: roomA.left - 1, y: roomA.cy, dir: 'E' });
                    // East: corridor enters roomB's right edge
                    entranceEdges.push({ x: roomB.right, y: roomA.cy, dir: 'W' });
                    entranceEdges.push({ x: roomB.right - 1, y: roomA.cy, dir: 'E' });
                }
            } else {
                if (dy > 0) {
                    // South: corridor exits roomA's bottom edge
                    entranceEdges.push({ x: roomA.cx, y: roomA.bottom - 1, dir: 'S' });
                    entranceEdges.push({ x: roomA.cx, y: roomA.bottom, dir: 'N' });
                    // North: corridor enters roomB's top edge
                    entranceEdges.push({ x: roomA.cx, y: roomB.top - 1, dir: 'S' });
                    entranceEdges.push({ x: roomA.cx, y: roomB.top, dir: 'N' });
                } else {
                    // North: corridor exits roomA's top edge
                    entranceEdges.push({ x: roomA.cx, y: roomA.top, dir: 'N' });
                    entranceEdges.push({ x: roomA.cx, y: roomA.top - 1, dir: 'S' });
                    // South: corridor enters roomB's bottom edge
                    entranceEdges.push({ x: roomA.cx, y: roomB.bottom, dir: 'N' });
                    entranceEdges.push({ x: roomA.cx, y: roomB.bottom - 1, dir: 'S' });
                }
            }

            // Door on first corridor tile (guaranteed to be outside both rooms)
            doorPositions.push({ x: exitX, y: exitY, dir: horizontal ? (dx > 0 ? Direction.EAST : Direction.WEST) : (dy > 0 ? Direction.SOUTH : Direction.NORTH) });

            addEdge(cand.i, cand.j);
            loopsCreated++;
        }
    }

    return { floors, corridors, placedRooms, doorPositions, entranceEdges, roomData };
}

// Place a single room from a walker's current position
function _stepWalker(walker, placedRooms, floors, corridors, doorPositions, entranceEdges, roomData, params, rng, markCorridorEdges, layCorridor) {
    const { spacing, minRoomSize, maxRoomSize } = params;

    const rw = minRoomSize + Math.floor(rng() * (maxRoomSize - minRoomSize + 1));
    const rh = minRoomSize + Math.floor(rng() * (maxRoomSize - minRoomSize + 1));
    const corridorLen = 2 + spacing;

    let nx, ny;
    const curRoom = walker.currentRoom;

    switch (walker.direction) {
        case Direction.NORTH:
            nx = curRoom.cx - Math.floor(rw / 2);
            ny = curRoom.top - corridorLen - rh;
            break;
        case Direction.SOUTH:
            nx = curRoom.cx - Math.floor(rw / 2);
            ny = curRoom.bottom + corridorLen;
            break;
        case Direction.EAST:
            nx = curRoom.right + corridorLen;
            ny = curRoom.cy - Math.floor(rh / 2);
            break;
        case Direction.WEST:
            nx = curRoom.left - corridorLen - rw;
            ny = curRoom.cy - Math.floor(rh / 2);
            break;
    }

    const newRoom = new ProcgenRoom(nx, ny, rw, rh);

    if (!canPlaceRoom(newRoom, placedRooms, spacing)) {
        return { placed: false };
    }

    placedRooms.push(newRoom);
    addRoomFloorsTo(newRoom, floors);
    roomData.push({ room: newRoom, isStart: false });

    // Build corridor
    let cx1, cy1, cx2, cy2;
    switch (walker.direction) {
        case Direction.NORTH:
            cx1 = curRoom.cx; cy1 = curRoom.top - 1;
            cx2 = curRoom.cx; cy2 = newRoom.bottom;
            break;
        case Direction.SOUTH:
            cx1 = curRoom.cx; cy1 = curRoom.bottom;
            cx2 = curRoom.cx; cy2 = newRoom.top - 1;
            break;
        case Direction.EAST:
            cx1 = curRoom.right; cy1 = curRoom.cy;
            cx2 = newRoom.left - 1; cy2 = curRoom.cy;
            break;
        case Direction.WEST:
            cx1 = curRoom.left - 1; cy1 = curRoom.cy;
            cx2 = newRoom.right; cy2 = curRoom.cy;
            break;
    }

    layCorridor(cx1, cy1, cx2, cy2);
    doorPositions.push({ x: cx2, y: cy2, dir: walker.direction });
    markCorridorEdges(curRoom, newRoom, walker.direction);

    return { placed: true, newRoom };
}

function canPlaceRoom(room, placedRooms, margin) {
    for (const existing of placedRooms) {
        if (room.intersects(existing, margin)) return false;
    }
    return true;
}

function addRoomFloorsTo(room, floors) {
    for (let rx = room.x; rx < room.x + room.w; rx++) {
        for (let ry = room.y; ry < room.y + room.h; ry++) {
            floors.add(`${rx},${ry}`);
        }
    }
}

// ═══════════════════════════════════════════════════════
//  WALL BUILDER (logical walls for Foundry)
// ═══════════════════════════════════════════════════════

function generateWalls(floors, offset, entranceEdges, wallThickness) {
    const wallsData = [];
    const entranceSet = new Set(entranceEdges.map(e => `${e.x},${e.y},${e.dir}`));
    const gridSize = GRID_SIZE;

    const dirs = [
        { dx: 0, dy: -1, ax: 0, ay: 0, bx: 1, by: 0, name: 'N', ox: 0, oy: -1 },
        { dx: 0, dy: 1,  ax: 0, ay: 1, bx: 1, by: 1, name: 'S', ox: 0, oy: 1 },
        { dx: 1, dy: 0,  ax: 1, ay: 0, bx: 1, by: 1, name: 'E', ox: 1, oy: 0 },
        { dx: -1, dy: 0, ax: 0, ay: 0, bx: 0, by: 1, name: 'W', ox: -1, oy: 0 }
    ];

    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        const px = (gx + offset.x) * gridSize;
        const py = (gy + offset.y) * gridSize;

        for (const d of dirs) {
            const neighborKey = `${gx + d.dx},${gy + d.dy}`;

            if (entranceSet.has(`${gx},${gy},${d.name}`)) continue;

            if (!floors.has(neighborKey)) {
                let x1 = px + (d.ax * gridSize);
                let y1 = py + (d.ay * gridSize);
                let x2 = px + (d.bx * gridSize);
                let y2 = py + (d.by * gridSize);

                // Outward offset
                x1 += d.ox * wallThickness;
                x2 += d.ox * wallThickness;
                y1 += d.oy * wallThickness;
                y2 += d.oy * wallThickness;

                // Corner adjustments
                const getKeys = (ddx, ddy) => ({
                    sourceFlank: `${gx + ddx},${gy + ddy}`,
                    voidFlank: `${gx + d.dx + ddx},${gy + d.dy + ddy}`
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
                    const amount = wallThickness * modStart;
                    if (d.name === 'N' || d.name === 'S') x1 -= amount;
                    else y1 -= amount;
                }
                if (modEnd !== 0) {
                    const amount = wallThickness * modEnd;
                    if (d.name === 'N' || d.name === 'S') x2 += amount;
                    else y2 += amount;
                }

                wallsData.push({
                    c: [x1, y1, x2, y2],
                    light: 20,
                    move: 20,
                    sound: 20,
                    flags: { [MODULE_ID]: { dungeonGenWall: true } }
                });
            }
        }
    }

    return wallsData;
}

// ═══════════════════════════════════════════════════════
//  WALL VISUAL BUILDER (Drawing documents)
// ═══════════════════════════════════════════════════════

function generateWallVisuals(floors, offset, options, entranceEdges) {
    const { useTexture, wallColor, wallThickness, wallTilePath } = options;
    const gridSize = GRID_SIZE;
    const drawingsData = [];
    const entranceSet = new Set(entranceEdges.map(e => `${e.x},${e.y},${e.dir}`));

    // Determine textures
    const hTexture = wallTilePath || `modules/${MODULE_ID}/assets/Dungeon/wall_tiles/stone_brick_horizontal.png`;
    const vTexture = wallTilePath?.replace("horizontal", "vertical") || `modules/${MODULE_ID}/assets/Dungeon/wall_tiles/stone_brick_vertical.png`;

    // Identify wall segments per direction
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

    // Merge horizontal segments (N, S)
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

    // Merge vertical segments (E, W)
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

    // Create polygon drawing
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
            fillAlpha: 1.0,
            flags: {
                [MODULE_ID]: { dungeonWall: true }
            }
        };

        if (useTexture) {
            drawing.fillType = 2; // Pattern
            drawing.fillColor = "#ffffff";
            drawing.texture = isHorizontal ? hTexture : vTexture;
        } else {
            drawing.fillType = 1; // Solid
            drawing.fillColor = wallColor || "#5C3D3D";
        }

        drawingsData.push(drawing);
    };

    const thickness = wallThickness;

    // North walls
    for (const seg of Object.values(segments.N)) {
        const px = (seg.gx + offset.x) * gridSize;
        const py = (seg.gy + offset.y) * gridSize - thickness;
        createPoly(px, py, seg.len * gridSize, thickness, true);
    }

    // South walls
    for (const seg of Object.values(segments.S)) {
        const px = (seg.gx + offset.x) * gridSize;
        const py = (seg.gy + offset.y) * gridSize + gridSize;
        createPoly(px, py, seg.len * gridSize, thickness, true);
    }

    // East walls
    for (const seg of Object.values(segments.E)) {
        const px = (seg.gx + offset.x) * gridSize + gridSize;
        const py = (seg.gy + offset.y) * gridSize;
        createPoly(px, py, thickness, seg.len * gridSize, false);
    }

    // West walls
    for (const seg of Object.values(segments.W)) {
        const px = (seg.gx + offset.x) * gridSize - thickness;
        const py = (seg.gy + offset.y) * gridSize;
        createPoly(px, py, thickness, seg.len * gridSize, false);
    }

    // Corners
    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        const px = (gx + offset.x) * gridSize;
        const py = (gy + offset.y) * gridSize;

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

// ═══════════════════════════════════════════════════════
//  DOOR BUILDER
// ═══════════════════════════════════════════════════════

function generateDoors(doorPositions, offset, wallThickness, doorTilePath) {
    const gridSize = GRID_SIZE;
    const wallsData = [];

    for (const door of doorPositions) {
        const px = (door.x + offset.x) * gridSize;
        const py = (door.y + offset.y) * gridSize;

        let x1, y1, x2, y2;

        // Place door at the edge of the corridor tile
        switch (door.dir) {
            case Direction.NORTH:
            case Direction.SOUTH:
                // Horizontal door across vertical corridor
                x1 = px;
                y1 = py + gridSize / 2;
                x2 = px + gridSize;
                y2 = py + gridSize / 2;
                break;
            case Direction.EAST:
            case Direction.WEST:
                // Vertical door across horizontal corridor
                x1 = px + gridSize / 2;
                y1 = py;
                x2 = px + gridSize / 2;
                y2 = py + gridSize;
                break;
        }

        // Resolve door texture variant (horizontal/vertical) matching the door orientation
        const isHorizontalDoor = (y1 === y2);
        let doorTexture = doorTilePath;
        if (doorTexture) {
            if (isHorizontalDoor && !doorTexture.toLowerCase().includes("horizontal")) {
                const hVariant = doorTexture.replace(/vertical/i, "horizontal");
                doorTexture = hVariant;
            } else if (!isHorizontalDoor && !doorTexture.toLowerCase().includes("vertical")) {
                const vVariant = doorTexture.replace(/horizontal/i, "vertical");
                doorTexture = vVariant;
            }
        }

        // Door wall with swing animation
        const doorWall = {
            c: [x1, y1, x2, y2],
            door: 1,
            ds: 0,
            light: 20,
            move: 20,
            sound: 20,
            doorSound: "woodBasic",
            flags: { [MODULE_ID]: { dungeonGenWall: true } }
        };
        if (doorTexture) {
            doorWall.animation = {
                type: "swing",
                texture: doorTexture
            };
        }
        wallsData.push(doorWall);

        // Filler walls for thickness gaps
        const fillerFlags = { [MODULE_ID]: { dungeonGenWall: true } };
        if (isHorizontalDoor) {
            wallsData.push({
                c: [x1 - wallThickness, y1, x1, y1],
                light: 20, move: 20, sound: 20, flags: fillerFlags
            });
            wallsData.push({
                c: [x2, y2, x2 + wallThickness, y2],
                light: 20, move: 20, sound: 20, flags: fillerFlags
            });
        } else {
            wallsData.push({
                c: [x1, y1 - wallThickness, x1, y1],
                light: 20, move: 20, sound: 20, flags: fillerFlags
            });
            wallsData.push({
                c: [x2, y2, x2, y2 + wallThickness],
                light: 20, move: 20, sound: 20, flags: fillerFlags
            });
        }
    }

    return wallsData;
}

// ═══════════════════════════════════════════════════════
//  SCENE UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Clear only dungeon-generated documents at the given elevation.
 * If elevation is 0 and Levels is not active, clears all dungeon documents.
 */
async function clearSceneAtLevel(scene, elevation, levelsActive) {
    const isDungeonTile = (t) => {
        const f = t.flags?.[MODULE_ID];
        return f?.dungeonFloor || f?.dungeonStairs || f?.dungeonStairsDown || f?.dungeonClutter;
    };
    const isDungeonWall = (w) => {
        return w.flags?.[MODULE_ID]?.dungeonGenWall;
    };
    const isDungeonDrawing = (d) => {
        return d.flags?.[MODULE_ID]?.dungeonWall;
    };

    const matchesLevel = (doc, type) => {
        if (!levelsActive) return true;
        if (type === "Wall") {
            const bottom = doc.flags?.["wall-height"]?.bottom ?? 0;
            return Math.abs(bottom - elevation) < ELEVATION_TOLERANCE;
        } else {
            const elev = doc.elevation ?? 0;
            return Math.abs(elev - elevation) < ELEVATION_TOLERANCE;
        }
    };

    // Tiles
    const tileIds = scene.tiles.filter(t => isDungeonTile(t) && matchesLevel(t, "Tile")).map(t => t.id);
    if (tileIds.length > 0) await scene.deleteEmbeddedDocuments("Tile", tileIds);

    // Walls (logical walls + doors)
    const wallIds = scene.walls.filter(w => isDungeonWall(w) && matchesLevel(w, "Wall")).map(w => w.id);
    if (wallIds.length > 0) await scene.deleteEmbeddedDocuments("Wall", wallIds);

    // Drawings (wall visuals)
    const drawingIds = scene.drawings.filter(d => isDungeonDrawing(d) && matchesLevel(d, "Drawing")).map(d => d.id);
    if (drawingIds.length > 0) await scene.deleteEmbeddedDocuments("Drawing", drawingIds);
}

async function configureScene(scene) {
    await scene.update({
        "grid.size": GRID_SIZE,
        "grid.type": 1,
        "backgroundColor": "#1a1a1a"
    });
}

function fitToContent(floors, gridSize, padding) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        if (gx < minX) minX = gx;
        if (gy < minY) minY = gy;
        if (gx + 1 > maxX) maxX = gx + 1;
        if (gy + 1 > maxY) maxY = gy + 1;
    }

    const offsetX = -minX + Math.ceil(padding / gridSize);
    const offsetY = -minY + Math.ceil(padding / gridSize);
    const sceneWidth = (maxX - minX) * gridSize + padding * 2;
    const sceneHeight = (maxY - minY) * gridSize + padding * 2;

    return {
        offset: { x: offsetX, y: offsetY },
        width: sceneWidth,
        height: sceneHeight
    };
}

// ═══════════════════════════════════════════════════════
//  TILE RENDERER
// ═══════════════════════════════════════════════════════

async function renderFloorTilesWithElevation(scene, floors, rng, offset, floorTexture, createWithElevation) {
    const gridSize = GRID_SIZE;
    const tileDocs = [];

    for (const coord of floors) {
        const [gx, gy] = coord.split(',').map(Number);
        tileDocs.push({
            texture: { src: floorTexture },
            x: (gx + offset.x) * gridSize,
            y: (gy + offset.y) * gridSize,
            width: gridSize,
            height: gridSize,
            sort: 0,
            flags: {
                [MODULE_ID]: { dungeonFloor: true }
            }
        });
    }

    await createWithElevation("Tile", tileDocs);
}

// ═══════════════════════════════════════════════════════
//  MAIN GENERATE FUNCTION
// ═══════════════════════════════════════════════════════

export async function generateDungeon(config) {
    const scene = canvas.scene;
    if (!scene) {
        ui.notifications.error("SDX | No active scene found.");
        return;
    }

    if (!game.user.isGM) {
        ui.notifications.error("SDX | Only the GM can generate dungeons.");
        return;
    }

    const {
        seed = "abc123",
        roomCount = 10,
        density = 0.8,
        branching = 0.5,
        roomSizeBias = 0.5,
        symmetry = true,
        stairs = 0,
        stairsDown = 0,
        clutter = 0,
        useTexture = false,
        wallShadows = false,
        wallColor = "#5C3D3D",
        wallThickness = 20
    } = config;

    // Validate stairs fit in requested rooms (exclude start room)
    const totalStairs = stairs + stairsDown;
    if (totalStairs > roomCount - 1) {
        ui.notifications.warn(`SDX | Too many stairs (${totalStairs}) for ${roomCount} rooms. Reduce stairs or add more rooms.`);
        return;
    }

    // Detect Levels module and current elevation
    const levelsActive = game.modules.get("levels")?.active ?? false;
    let elevation = 0;
    let wallHeightBottom = 0;
    let wallHeightTop = LEVEL_HEIGHT - 1;

    if (levelsActive) {
        // Use probe tile to reliably detect Levels-assigned elevation
        try {
            const probe = await scene.createEmbeddedDocuments("Tile", [{
                texture: { src: `modules/${MODULE_ID}/assets/Dungeon/floor_tiles/stone_floor_00.png` },
                x: 0, y: 0, width: GRID_SIZE, height: GRID_SIZE,
                hidden: true,
                flags: { [MODULE_ID]: { probe: true } }
            }]);
            if (probe?.length > 0) {
                elevation = probe[0].elevation ?? 0;
                await scene.deleteEmbeddedDocuments("Tile", [probe[0].id]);
            }
        } catch (e) {
            elevation = getCurrentElevation();
        }
        wallHeightBottom = elevation;
        wallHeightTop = elevation + LEVEL_HEIGHT - 1;
        console.log(`${MODULE_ID} | Generator: Levels detected, elevation ${elevation} (${wallHeightBottom}/${wallHeightTop})`);
    }

    ui.notifications.info(`SDX | Generating dungeon${levelsActive ? ` at level ${elevation}` : ""}...`);

    try {
        // 1. Clear only dungeon-generated content at current level
        await clearSceneAtLevel(scene, elevation, levelsActive);

        // 2. Configure scene
        await configureScene(scene);

        // 3. Create seeded RNG
        const rng = seedrandom(seed);

        // 4. Generate layout
        const layout = generateLayout({
            roomCount,
            density,
            linearity: 1 - branching,
            roomSizeBias,
            symmetry
        }, rng);

        // 5. Fit scene to content (expand only if Levels is active to preserve other levels)
        let { offset, width, height } = fitToContent(layout.floors, GRID_SIZE, 300);
        if (levelsActive) {
            const newWidth = Math.max(scene.width, width);
            const newHeight = Math.max(scene.height, height);
            await scene.update({ width: newWidth, height: newHeight });
        } else {
            await scene.update({ width, height });
        }

        // Ensure dungeon content stays inside the scene interior with a 1-cell gap on all sides.
        // scene.padding is a fraction (e.g. 0.25) added around scene.width/height.
        // Interior starts at scenePadX px from the canvas corner.
        // Wall visuals extend wallThickness px outward from floor tiles, so floor tiles must
        // start at least (scenePadX + GRID_SIZE + wallThickness) px from the canvas corner.
        // fitToContent already puts content at 300px from the corner; add the difference if needed.
        {
            const scenePadX = Math.ceil(scene.width * scene.padding / GRID_SIZE) * GRID_SIZE;
            const scenePadY = Math.ceil(scene.height * scene.padding / GRID_SIZE) * GRID_SIZE;
            const minStartX = scenePadX + GRID_SIZE + wallThickness;
            const minStartY = scenePadY + GRID_SIZE + wallThickness;
            const extraX = Math.max(0, Math.ceil((minStartX - 300) / GRID_SIZE));
            const extraY = Math.max(0, Math.ceil((minStartY - 300) / GRID_SIZE));
            if (extraX > 0 || extraY > 0) {
                offset = { x: offset.x + extraX, y: offset.y + extraY };
                console.log(`${MODULE_ID} | Scene padding adjustment: +${extraX},+${extraY} cells (scenePad ${scenePadX}x${scenePadY}px)`);
            }
        }

        // 6. Get selected textures
        const floorTexture = getSelectedFloorTile() || `modules/${MODULE_ID}/assets/Dungeon/floor_tiles/stone_floor_00.png`;
        const wallTilePath = getSelectedWallTile();

        // Helper: create documents in batches and apply elevation if Levels is active
        async function createWithElevation(type, docs, chunkSize = 100) {
            for (let i = 0; i < docs.length; i += chunkSize) {
                const created = await scene.createEmbeddedDocuments(type, docs.slice(i, i + chunkSize));
                if (levelsActive && created.length > 0) {
                    if (type === "Wall") {
                        const updates = created.map(w => ({
                            _id: w.id,
                            "flags.wall-height.bottom": wallHeightBottom,
                            "flags.wall-height.top": wallHeightTop
                        }));
                        await scene.updateEmbeddedDocuments("Wall", updates);
                    } else if (type === "Tile") {
                        const updates = created.map(t => ({
                            _id: t.id,
                            elevation: elevation,
                            "flags.levels.rangeTop": wallHeightTop
                        }));
                        await scene.updateEmbeddedDocuments("Tile", updates);
                    } else if (type === "Drawing") {
                        const updates = created.map(d => ({
                            _id: d.id,
                            elevation: elevation,
                            "flags.levels.rangeTop": wallHeightTop
                        }));
                        await scene.updateEmbeddedDocuments("Drawing", updates);
                    }
                }
            }
        }

        // 7. Render floor tiles
        await renderFloorTilesWithElevation(scene, layout.floors, rng, offset, floorTexture, createWithElevation);

        // 8. Generate logical walls
        const wallsData = generateWalls(layout.floors, offset, layout.entranceEdges, wallThickness);

        // 9. Generate wall visuals
        const drawingsData = generateWallVisuals(layout.floors, offset, {
            useTexture,
            wallColor,
            wallThickness,
            wallTilePath
        }, layout.entranceEdges);

        // 10. Generate doors (using selected door tile for swing animation)
        const doorTilePath = getSelectedDoorTile();
        const doorsData = generateDoors(layout.doorPositions, offset, wallThickness, doorTilePath);

        // 11. Create all walls (logical + doors)
        const allWalls = [...wallsData, ...doorsData];
        await createWithElevation("Wall", allWalls);

        // 12. Create all drawings (wall visuals)
        await createWithElevation("Drawing", drawingsData);

        // 12b. Apply TokenMagic dropshadow2 to wall drawings if Wall Shadows is enabled
        if (wallShadows && window.TokenMagic) {
            const shadowParams = [{
                "filterType": "shadow",
                "filterId": "dropshadow2",
                "rotation": 0,
                "distance": 0,
                "color": 0x000000,
                "alpha": 1,
                "shadowOnly": false,
                "blur": 5,
                "quality": 5,
                "padding": 20
            }];
            const wallDrawings = canvas.drawings.placeables.filter(d => {
                if (!d.document.flags?.[MODULE_ID]?.dungeonWall) return false;
                if (levelsActive) return Math.abs((d.document.elevation ?? 0) - elevation) < ELEVATION_TOLERANCE;
                return true;
            });
            for (const drawing of wallDrawings) {
                try {
                    await TokenMagic.addUpdateFilters(drawing.document, shadowParams);
                } catch (err) {
                    console.warn(`${MODULE_ID} | Wall shadow effect failed:`, err);
                }
            }
        }

        // 13. Place stairs tiles in random rooms
        if ((stairs > 0 || stairsDown > 0) && layout.roomData.length > 0) {
            const stairsTiles = [];
            const usedPositions = new Set(); // track "gx,gy" to avoid overlap

            // Shuffle non-start rooms
            const candidateRooms = layout.roomData.filter(r => !r.isStart);
            for (let i = candidateRooms.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [candidateRooms[i], candidateRooms[j]] = [candidateRooms[j], candidateRooms[i]];
            }

            let roomIdx = 0;

            const placeStairs = (count, textureName, flagKey) => {
                for (let n = 0; n < count && roomIdx < candidateRooms.length; n++, roomIdx++) {
                    const room = candidateRooms[roomIdx].room;
                    const interiorLeft = room.left + 1;
                    const interiorTop = room.top + 1;
                    const interiorW = room.w - 2;
                    const interiorH = room.h - 2;
                    if (interiorW < 1 || interiorH < 1) { n--; continue; }
                    let sx, sy, key;
                    let tries = 0;
                    do {
                        sx = interiorLeft + Math.floor(rng() * interiorW);
                        sy = interiorTop + Math.floor(rng() * interiorH);
                        key = `${sx},${sy}`;
                        tries++;
                    } while (usedPositions.has(key) && tries < 10);
                    usedPositions.add(key);
                    stairsTiles.push({
                        texture: { src: `modules/${MODULE_ID}/assets/Dungeon/${textureName}` },
                        x: (sx + offset.x) * GRID_SIZE + (GRID_SIZE - 50) / 2,
                        y: (sy + offset.y) * GRID_SIZE + (GRID_SIZE - 50) / 2,
                        width: 50,
                        height: 50,
                        sort: 2,
                        flags: { [MODULE_ID]: { [flagKey]: true } }
                    });
                }
            };

            placeStairs(stairs, "stairs.webp", "dungeonStairs");
            placeStairs(stairsDown, "stairsdown.webp", "dungeonStairsDown");

            if (stairsTiles.length > 0) {
                await createWithElevation("Tile", stairsTiles);
            }
        }

        // 14. Place clutter tiles in rooms
        if (clutter > 0 && layout.roomData.length > 0) {
            // Discover clutter files from known folder
            const clutterFolder = `modules/${MODULE_ID}/assets/Dungeon/clutter`;
            let clutterFiles = [];
            try {
                const result = await FilePicker.browse("data", clutterFolder);
                clutterFiles = (result.files || []).filter(f => /\-(\d+)x(\d+)\.\w+$/i.test(f));
            } catch (e) {
                console.warn(`${MODULE_ID} | Could not browse clutter folder:`, e);
            }

            if (clutterFiles.length > 0) {
                // Parse dimensions from filenames
                const clutterItems = clutterFiles.map(f => {
                    const match = f.match(/\-(\d+)x(\d+)\.\w+$/i);
                    return { src: f, w: parseInt(match[1]), h: parseInt(match[2]) };
                });

                const clutterTiles = [];
                const nonStartRooms = layout.roomData.filter(r => !r.isStart);

                for (const rd of nonStartRooms) {
                    const room = rd.room;
                    // Track occupied cells in this room to prevent overlaps
                    const occupied = new Set();
                    for (let c = 0; c < clutter; c++) {
                        const item = clutterItems[Math.floor(rng() * clutterItems.length)];
                        const cellsW = Math.ceil(item.w / GRID_SIZE);
                        const cellsH = Math.ceil(item.h / GRID_SIZE);
                        const fitW = room.w - (cellsW - 1);
                        const fitH = room.h - (cellsH - 1);
                        if (fitW < 1 || fitH < 1) continue;

                        // Try to find a non-overlapping position
                        let gx, gy, overlaps;
                        let tries = 0;
                        do {
                            gx = room.left + Math.floor(rng() * fitW);
                            gy = room.top + Math.floor(rng() * fitH);
                            overlaps = false;
                            for (let ox = 0; ox < cellsW && !overlaps; ox++) {
                                for (let oy = 0; oy < cellsH && !overlaps; oy++) {
                                    if (occupied.has(`${gx + ox},${gy + oy}`)) overlaps = true;
                                }
                            }
                            tries++;
                        } while (overlaps && tries < 20);
                        if (overlaps) continue; // couldn't find a free spot, skip

                        // Mark cells as occupied
                        for (let ox = 0; ox < cellsW; ox++) {
                            for (let oy = 0; oy < cellsH; oy++) {
                                occupied.add(`${gx + ox},${gy + oy}`);
                            }
                        }

                        const pixelX = (gx + offset.x) * GRID_SIZE + (cellsW * GRID_SIZE - item.w) / 2;
                        const pixelY = (gy + offset.y) * GRID_SIZE + (cellsH * GRID_SIZE - item.h) / 2;
                        clutterTiles.push({
                            texture: { src: item.src },
                            x: pixelX,
                            y: pixelY,
                            width: item.w,
                            height: item.h,
                            sort: 2,
                            flags: { [MODULE_ID]: { dungeonClutter: true } }
                        });
                    }
                }

                await createWithElevation("Tile", clutterTiles);
            }
        }

        // 15. Apply background if one is selected in the painter
        const bgSetting = getDungeonBackground();
        if (bgSetting && bgSetting !== "none") {
            await ensureBackgroundDrawing(scene, elevation, bgSetting);
        }

        ui.notifications.info(`SDX | Dungeon generated! ${layout.placedRooms.length} rooms, seed: ${seed}`);
    } catch (err) {
        console.error(`${MODULE_ID} | Dungeon generation failed:`, err);
        ui.notifications.error("SDX | Dungeon generation failed. Check console for details.");
    }
}

// ═══════════════════════════════════════════════════════
//  UI STATE & EXPORTS
// ═══════════════════════════════════════════════════════

export function toggleGeneratorPanel() {
    _generatorExpanded = !_generatorExpanded;
}

export function isGeneratorExpanded() {
    return _generatorExpanded;
}

export function generateRandomSeed() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function getGeneratorSeed() {
    return _generatorSeed;
}

export function setGeneratorSeed(seed) {
    _generatorSeed = seed;
}

export function getGeneratorSettings() {
    return { ..._generatorSettings };
}

export function setGeneratorSettings(settings) {
    Object.assign(_generatorSettings, settings);
}
