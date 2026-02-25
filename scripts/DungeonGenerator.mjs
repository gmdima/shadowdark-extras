const MODULE_ID = "shadowdark-extras";

let _data = null;
let _monsterIndex = null;

// ── Data Loading ────────────────────────────────────────────────────────────

export async function loadDungeonData() {
	if (_data) return _data;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/dungeon-data.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_data = await resp.json();
		// Merge supplemental temple room descriptions into the main roomDescriptions object
		if (_data.roomDescriptions_temple) {
			for (const [key, val] of Object.entries(_data.roomDescriptions_temple)) {
				_data.roomDescriptions[key] = val;
			}
		}
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load dungeon data:`, err);
		ui.notifications?.error("SDX | Could not load dungeon data.");
		throw err;
	}
	return _data;
}

let _bookData = null;
export async function loadBookData() {
	if (_bookData) return _bookData;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/dungeon-books.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_bookData = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load dungeon books:`, err);
		throw err;
	}
	return _bookData;
}

let _motivationsData = null;
export async function loadMotivationsData() {
	if (_motivationsData) return _motivationsData;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/dungeon-motivations.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_motivationsData = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load dungeon motivations:`, err);
		throw err;
	}
	return _motivationsData;
}

async function getMonsterIndex() {
	if (_monsterIndex) return _monsterIndex;
	_monsterIndex = new Map();
	try {
		const pack = game.packs.get("shadowdark.monsters");
		if (!pack) return _monsterIndex;
		const index = await pack.getIndex();
		for (const entry of index) {
			_monsterIndex.set(entry.name, entry._id);
		}
	} catch (err) {
		console.warn(`${MODULE_ID} | Could not load monster compendium index:`, err);
	}
	return _monsterIndex;
}

async function monsterLink(name) {
	const index = await getMonsterIndex();
	const id = index.get(name);
	if (id) return `@UUID[Compendium.shadowdark.monsters.${id}]{${name}}`;
	return name;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Resolve inline [A|B|C] tokens and named [tableName] references recursively.
 * Innermost bracket groups (no nested brackets) are resolved first, repeated
 * until no [...] groups remain. Named lookups are resolved from `tables`.
 */
function resolveTemplate(template, tables = {}) {
	if (!template) return template;
	let result = template;
	const inner = /\[([^\[\]]+)\]/g;
	let prev;
	do {
		prev = result;
		result = result.replace(inner, (_, group) => {
			if (group.includes("|")) {
				const options = group.split("|");
				return options[Math.floor(Math.random() * options.length)];
			} else {
				const table = tables[group.trim()];
				if (Array.isArray(table) && table.length > 0) {
					return resolveTemplate(
						table[Math.floor(Math.random() * table.length)],
						tables
					);
				}
				return group; // unknown token — leave as-is
			}
		});
	} while (result !== prev);
	return result;
}

function pickN(arr, n) {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(n, shuffled.length));
}

function pickWeighted(weighted) {
	const pool = [];
	for (const entry of weighted) {
		for (let i = 0; i < (entry.weight || 1); i++) pool.push(entry);
	}
	return pool[Math.floor(Math.random() * pool.length)];
}

function pickWeightedUnique(weighted, count) {
	const pool = [];
	for (const entry of weighted) {
		for (let i = 0; i < (entry.weight || 1); i++) pool.push(entry);
	}
	const results = [];
	const used = new Set();
	let attempts = 0;
	while (results.length < count && attempts < 200) {
		const entry = pool[Math.floor(Math.random() * pool.length)];
		const key = entry.type || entry.name || JSON.stringify(entry);
		if (!used.has(key)) {
			used.add(key);
			results.push(entry);
		}
		attempts++;
	}
	return results;
}

function randRange(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cap(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Name Generation ─────────────────────────────────────────────────────────

export function generateDungeonName(data) {
	const prefix = pick(data.dungeonNames.prefixes);
	const suffix = pick(data.dungeonNames.suffixes);
	return `${prefix} ${suffix}`;
}

// ── Key System ──────────────────────────────────────────────────────────────

function buildKeyMap(data, roomCount) {
	const keyMap = [];
	const lockCount = Math.min(
		roomCount <= 6 ? 1 : roomCount <= 10 ? 2 : 3,
		Math.floor(roomCount / 2)
	);

	const usedLockRooms = new Set();
	const usedKeyRooms = new Set();

	for (let i = 0; i < lockCount; i++) {
		const sigil = pick(data.keyData.sigils);
		const hidingSpot = pick(data.keyData.hidingSpots);

		// Lock room: pick from upper half of rooms (2..roomCount)
		let lockRoom;
		let attempts = 0;
		do {
			lockRoom = randRange(Math.max(2, Math.floor(roomCount / 2)), roomCount);
			attempts++;
		} while (usedLockRooms.has(lockRoom) && attempts < 50);
		usedLockRooms.add(lockRoom);

		// Key room: always lower number than lock room
		let keyRoom;
		attempts = 0;
		do {
			keyRoom = randRange(1, lockRoom - 1);
			attempts++;
		} while (usedKeyRooms.has(keyRoom) && attempts < 50);
		usedKeyRooms.add(keyRoom);

		keyMap.push({ lockRoom, keyRoom, sigil, hidingSpot });
	}

	return keyMap;
}

// ── Room Connectivity ───────────────────────────────────────────────────────

function buildRoomConnections(roomCount, data) {
	// Each room connects to the next (linear path)
	// Plus some random branches for larger dungeons
	const connections = [];
	for (let i = 1; i <= roomCount; i++) {
		connections[i] = [];
	}

	// Linear spine: 1→2→3→...→N
	for (let i = 1; i < roomCount; i++) {
		const dir = pick(data.directions);
		connections[i].push({ toRoom: i + 1, direction: dir });
		// Reverse direction
		const reverseDir = reverseDirection(dir);
		connections[i + 1].push({ toRoom: i, direction: reverseDir });
	}

	// Add 1-3 branch connections for medium/large dungeons
	if (roomCount > 6) {
		const branchCount = randRange(1, Math.min(3, Math.floor(roomCount / 3)));
		for (let b = 0; b < branchCount; b++) {
			const from = randRange(1, roomCount - 2);
			const to = randRange(from + 2, roomCount);
			// Avoid duplicates
			if (connections[from].some(c => c.toRoom === to)) continue;
			const dir = pick(data.directions);
			connections[from].push({ toRoom: to, direction: dir });
			connections[to].push({ toRoom: from, direction: reverseDirection(dir) });
		}
	}

	return connections;
}

function reverseDirection(dir) {
	const map = {
		"North": "South", "South": "North",
		"East": "West", "West": "East",
		"Northeast": "Southwest", "Southwest": "Northeast",
		"Northwest": "Southeast", "Southeast": "Northwest",
	};
	return map[dir] || "opposite";
}

// ── Map Layout & Rendering ──────────────────────────────────────────────────

function buildDungeonLayout(connections) {
	const layout = new Map(); // roomNum -> { x, y }
	const roomCount = connections.length - 1; // index 0 is unused

	// Start room 1 at origin
	layout.set(1, { x: 0, y: 0 });

	const queue = [1];
	const visited = new Set([1]);

	const dirOffsets = {
		"North": { dx: 0, dy: -1 },
		"South": { dx: 0, dy: 1 },
		"East": { dx: 1, dy: 0 },
		"West": { dx: -1, dy: 0 },
		"Northeast": { dx: 1, dy: -1 },
		"Northwest": { dx: -1, dy: -1 },
		"Southeast": { dx: 1, dy: 1 },
		"Southwest": { dx: -1, dy: 1 },
	};

	// Attempt to place rooms. If there's a collision, we'll try to nudge them.
	while (queue.length > 0) {
		const current = queue.shift();
		const currentPos = layout.get(current);

		for (const conn of connections[current]) {
			if (!visited.has(conn.toRoom)) {
				const offset = dirOffsets[conn.direction] || { dx: Math.random() > 0.5 ? 1 : -1, dy: 0 };

				// Standard spacing
				const spacing = 2; // grid units
				let targetX = currentPos.x + (offset.dx * spacing);
				let targetY = currentPos.y + (offset.dy * spacing);

				// Basic collision resolution: if occupied, nudge right until free
				let collisionAttempts = 0;
				while (isOccupied(layout, targetX, targetY) && collisionAttempts < 10) {
					targetX += 1;
					targetY += (Math.random() > 0.5 ? 1 : -1);
					collisionAttempts++;
				}

				layout.set(conn.toRoom, { x: targetX, y: targetY });
				visited.add(conn.toRoom);
				queue.push(conn.toRoom);
			}
		}
	}

	return layout;
}

function isOccupied(layout, x, y) {
	// Simple bounding box check (rooms take up roughly 1x1 space)
	for (const pos of layout.values()) {
		if (Math.abs(pos.x - x) < 1.5 && Math.abs(pos.y - y) < 1.5) {
			return true;
		}
	}
	return false;
}

function generateDungeonSVG(layout, connections) {
	// Calculate bounds
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const pos of layout.values()) {
		if (pos.x < minX) minX = pos.x;
		if (pos.x > maxX) maxX = pos.x;
		if (pos.y < minY) minY = pos.y;
		if (pos.y > maxY) maxY = pos.y;
	}

	// Canvas padding and scaling
	const padding = 2; // grid units
	const scale = 50; // pixels per grid unit
	const roomSize = 40; // pixel size of room rect

	const width = (maxX - minX + (padding * 2)) * scale;
	const height = (maxY - minY + (padding * 2)) * scale;

	// Center map in canvas
	const offsetX = (-minX + padding) * scale;
	const offsetY = (-minY + padding) * scale;

	let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" style="background-color: #f4f4f4; border: 1px solid #ccc; max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 1em;">`;

	// Draw grid (optional, but looks nice)
	svg += `<defs><pattern id="grid" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">
				<path d="M ${scale} 0 L 0 0 0 ${scale}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
			</pattern></defs>`;
	svg += `<rect width="100%" height="100%" fill="url(#grid)" />`;

	// Draw connections (corridors)
	svg += `<g id="corridors" stroke="#555" stroke-width="6" stroke-linecap="round">`;
	const drawnConnections = new Set();
	for (let i = 1; i < connections.length; i++) {
		const fromPos = layout.get(i);
		if (!fromPos) continue;
		const px1 = fromPos.x * scale + offsetX;
		const py1 = fromPos.y * scale + offsetY;

		for (const conn of connections[i]) {
			// Avoid drawing reverse connections twice
			const connKey = [i, conn.toRoom].sort().join("-");
			if (drawnConnections.has(connKey)) continue;

			const toPos = layout.get(conn.toRoom);
			if (!toPos) continue;
			const px2 = toPos.x * scale + offsetX;
			const py2 = toPos.y * scale + offsetY;

			svg += `<line x1="${px1}" y1="${py1}" x2="${px2}" y2="${py2}" />`;
			drawnConnections.add(connKey);
		}
	}
	svg += `</g>`;

	// Draw rooms
	svg += `<g id="rooms">`;
	for (const [roomNum, pos] of layout.entries()) {
		const px = pos.x * scale + offsetX;
		const py = pos.y * scale + offsetY;

		// Room shape
		svg += `<rect x="${px - roomSize / 2}" y="${py - roomSize / 2}" width="${roomSize}" height="${roomSize}" rx="4" fill="#fff" stroke="#333" stroke-width="2" />`;

		// Room number
		svg += `<text x="${px}" y="${py + 5}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#333" text-anchor="middle">${roomNum}</text>`;
	}
	svg += `</g>`;

	svg += `</svg>`;
	return svg;
}

// ── Doorway Generation ──────────────────────────────────────────────────────

function generateDoorway(data, fromRoom, toRoom, direction, keyMap) {
	const shape = pickWeighted(data.doors.shapes).shape;
	const material = pick(data.doors.materials);
	const stateEntry = pickWeighted(data.doors.states);
	let state = stateEntry.state;
	let stateDesc = stateEntry.description;

	// Check if this door should be locked with a sigil
	const lockEntry = keyMap.find(k => k.lockRoom === fromRoom || k.lockRoom === toRoom);
	let sigilNote = "";
	if (lockEntry && state !== "trapped") {
		state = "locked";
		stateDesc = `The door is locked. A sigil of <em>${lockEntry.sigil}</em> is engraved on the lock.`;
		sigilNote = ` Requires the key marked with <em>${lockEntry.sigil}</em>.`;
	}

	return `<strong>${direction}</strong> — ${cap(shape)} ${material} door (${state}). ${stateDesc}${sigilNote} Leads to Room ${toRoom}.`;
}

// ── Trap Generation ─────────────────────────────────────────────────────────

function generateTrap(data) {
	const trapType = pick(data.traps.areaTrapTypes);
	const desc = pick(trapType.descriptions);
	const trigger = pick(data.traps.triggers);
	return {
		html: `<p>Triggered by <strong>${trigger}</strong>. ${desc} <strong>DC 12 ${cap(trapType.save)} save</strong> or sustain <strong>${trapType.damage} damage</strong>.</p>`,
	};
}

// ── Encounter Generation ────────────────────────────────────────────────────

async function generateEncounter(data, typeKey) {
	const dungeonType = data.dungeonTypes[typeKey];
	const themes = dungeonType.encounterThemes;
	const theme = pick(themes);
	const category = data.encounterCategories[theme];
	if (!category) return null;

	const monsterEntry = pickWeighted(category.monsters);
	const count = randRange(monsterEntry.count[0], monsterEntry.count[1]);
	const link = await monsterLink(monsterEntry.name);
	const hint = pick(category.hints);
	const foreshadowing = pick(category.foreshadowing);

	const countText = count === 1 ? `1x` : `${count}x`;
	return {
		html: `<p><em>${foreshadowing}</em></p><p>${hint} ${countText} ${link} lurk here.</p>`,
	};
}

// ── Treasure Generation ─────────────────────────────────────────────────────

function generateTreasure(data, tier) {
	const t = data.treasure.tiers[String(tier)] || data.treasure.tiers["1"];
	const gold = randRange(t.goldRange[0], t.goldRange[1]);
	const item = pick(t.items);
	const container = pick(data.containers.types);
	const location = pick(data.containers.locations);

	let html = `<p>${container.label} ${location}. Inside: <strong>${gold} gp</strong>`;
	if (Math.random() < 0.6) {
		html += ` and ${item}`;
	}
	html += `.</p>`;

	// Container trap (~20% chance)
	if (Math.random() < 0.2) {
		const trap = pick(data.traps.containerTrapTypes);
		const trapDesc = pick(trap.descriptions);
		html += `<p><em>Trapped!</em> ${trapDesc} <strong>DC 12 ${cap(trap.save)} save</strong> or sustain <strong>${trap.damage} damage</strong>.</p>`;
	}

	return { html };
}

// ── Special Feature Generation ──────────────────────────────────────────────

function generatePool(data) {
	const liquid = pick(data.specialFeatures.pools.liquids);
	const effect = pick(data.specialFeatures.pools.effects);
	return `<p>A pool of <strong>${liquid}</strong> sits recessed into the chamber floor. ${effect}</p>`;
}

function generateWell(data) {
	let desc = pick(data.specialFeatures.wells);
	if (data.specialFeatures.wellSubdescriptions && data.specialFeatures.wellSubdescriptions.length > 0) {
		const subdesc = pick(data.specialFeatures.wellSubdescriptions);
		desc += ` ${subdesc}`;
	}
	return `<p>${desc}</p>`;
}

function generateSpecialFeature(data) {
	const featureType = pick(["debris", "debris", "remains", "pool", "fungi", "fountain"]);

	switch (featureType) {
		case "debris": {
			const item = pick(data.debris.primary);
			const secondary = pick(data.debris.secondary);
			const location = pick(data.debris.locations);
			return `<p>${cap(item)} lies ${location}, surrounded by ${secondary}.</p>`;
		}
		case "remains": {
			const body = pick(data.specialFeatures.remains.bodyTypes);
			const equipment = pick(data.specialFeatures.remains.equipment);
			const state = pick(data.specialFeatures.remains.equipmentStates);
			return `<p>You find ${body}. It carries a <strong>${equipment}</strong> (${state}).</p>`;
		}
		case "pool": {
			const liquid = pick(data.specialFeatures.pools.liquids);
			const effect = pick(data.specialFeatures.pools.effects);
			return `<p>A shallow pool of ${liquid} fills a depression in the floor. ${effect}</p>`;
		}
		case "fungi": {
			const qty = pick(data.specialFeatures.fungi.quantities);
			const color = pick(data.specialFeatures.fungi.colors);
			const effect = pick(data.specialFeatures.fungi.effects);
			return `<p>${qty} ${color} bioluminescent mushrooms grow here. ${effect}</p>`;
		}
		case "fountain": {
			return `<p>${pick(data.specialFeatures.fountains.descriptions)}</p>`;
		}
		default:
			return "";
	}
}

// ── Room Generation ─────────────────────────────────────────────────────────

async function generateRoom(data, roomNum, roomType, connections, keyMap, typeKey, treasureTier, allowPool = false) {
	const descs = data.roomDescriptions[roomType.type];
	const decos = data.roomDecorations[roomType.type];
	const tables = data.templateTables || {};
	const rawDesc = descs ? pick(descs) : "A nondescript room.";
	const rawDeco = decos ? pick(decos) : "";
	const roomDesc = resolveTemplate(rawDesc, tables);
	const roomDeco = resolveTemplate(rawDeco, tables);

	// Appearance detail
	const cover = pick(data.appearances.covers);
	const location = pick(data.appearances.locations);

	let html = `<h2>Room ${roomNum}: ${roomType.label}</h2>`;
	html += `<p>${roomDesc}`;
	if (roomDeco) html += ` ${roomDeco}`;
	html += `</p>`;
	html += `<p><em>${cap(cover)} mark ${location}.</em></p>`;

	// Doorways
	const roomConnections = connections[roomNum] || [];
	if (roomConnections.length > 0) {
		html += `<h3>Doorways</h3><ul>`;
		for (const conn of roomConnections) {
			html += `<li>${generateDoorway(data, roomNum, conn.toRoom, conn.direction, keyMap)}</li>`;
		}
		html += `</ul>`;
	}

	// Key placement — check if this room holds a key
	const keyEntry = keyMap.find(k => k.keyRoom === roomNum);
	if (keyEntry) {
		html += `<h3>Hidden Key</h3>`;
		html += `<p>A small iron key marked with <em>${keyEntry.sigil}</em> is hidden in ${keyEntry.hidingSpot}. It unlocks the door in Room ${keyEntry.lockRoom}.</p>`;
	}

	// Trap (~30% chance)
	if (Math.random() < 0.3) {
		const trap = generateTrap(data);
		html += `<h3>Trap!</h3>`;
		html += trap.html;
	}

	// Encounter (~40% chance)
	if (Math.random() < 0.4) {
		const encounter = await generateEncounter(data, typeKey);
		if (encounter) {
			html += `<h3>Encounter</h3>`;
			html += encounter.html;
		}
	}

	// Treasure (~25% chance)
	if (Math.random() < 0.25) {
		const treasure = generateTreasure(data, treasureTier);
		html += `<h3>Treasure</h3>`;
		html += treasure.html;
	}

	// Special features (~50% chance)
	if (Math.random() < 0.5) {
		const feature = generateSpecialFeature(data);
		html += `<h3>Features</h3>`;
		html += feature;
	}

	// Pool (~20% chance, medium/large dungeons only)
	if (allowPool && Math.random() < 0.2) {
		html += `<h3>Pool</h3>`;
		html += generatePool(data);
	}

	// Well (Specific to room)
	if (arguments.length > 8 && arguments[8]) {
		html += `<h3>Well</h3>`;
		html += generateWell(data);
	}

	return html;
}

// ── Wandering Monster Table ─────────────────────────────────────────────────

async function generateWanderingTable(data, typeKey) {
	const dungeonType = data.dungeonTypes[typeKey];
	const themes = dungeonType.encounterThemes;
	const entries = [];
	const usedNames = new Set();

	for (let i = 0; i < 6; i++) {
		const theme = pick(themes);
		const category = data.encounterCategories[theme];
		if (!category) continue;

		let monsterEntry;
		let attempts = 0;
		do {
			monsterEntry = pickWeighted(category.monsters);
			attempts++;
		} while (usedNames.has(monsterEntry.name) && attempts < 20);
		usedNames.add(monsterEntry.name);

		const count = randRange(monsterEntry.count[0], monsterEntry.count[1]);
		const link = await monsterLink(monsterEntry.name);
		entries.push(`${count}x ${link}`);
	}

	// Pad to 6 entries if needed
	while (entries.length < 6) {
		entries.push(entries[entries.length - 1] || "Nothing");
	}

	let html = `<table><tr><th>1d6</th><th>Encounter</th></tr>`;
	for (let i = 0; i < 6; i++) {
		html += `<tr><td>${i + 1}</td><td>${entries[i]}</td></tr>`;
	}
	html += `</table>`;

	return html;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function getDungeonTypes() {
	const data = await loadDungeonData();
	return Object.entries(data.dungeonTypes).map(([key, val]) => ({ key, label: val.label }));
}

export function getDungeonSizes() {
	return [
		{ key: "small", label: "Small (4-6 rooms)", range: [4, 6] },
		{ key: "medium", label: "Medium (7-10 rooms)", range: [7, 10] },
		{ key: "large", label: "Large (11-15 rooms)", range: [11, 15] },
	];
}

/**
 * Generate a complete dungeon as a single HTML page.
 * @param {string} typeKey   - "temple", "tomb", or "dungeon"
 * @param {string} sizeKey   - "small", "medium", or "large"
 * @param {string} hexLabel  - Display label for the hex (e.g. "14.7")
 * @param {string} hexKey    - Internal hex key "i_j"
 * @returns {{ html: string, dungeonName: string }}
 */
export async function generateDungeonHtml(typeKey, sizeKey, hexLabel, hexKey) {
	const data = await loadDungeonData();
	const dungeonType = data.dungeonTypes[typeKey];
	if (!dungeonType) return { html: "<p>Unknown dungeon type.</p>", dungeonName: typeKey };

	const sizeSpec = getDungeonSizes().find(s => s.key === sizeKey);
	const roomCount = sizeSpec ? randRange(sizeSpec.range[0], sizeSpec.range[1]) : randRange(4, 6);

	const dungeonName = generateDungeonName(data);
	const description = pick(dungeonType.descriptions);

	// Determine treasure tier based on size
	const treasureTier = sizeKey === "small" ? 1 : sizeKey === "medium" ? 2 : 3;

	// Build key system
	const keyMap = buildKeyMap(data, roomCount);

	// Build room connections
	const connections = buildRoomConnections(roomCount, data);

	// Pick room types — use type-specific pool if the dungeonType defines one
	const roomTypePool = dungeonType.roomTypes || data.roomTypes;
	const roomTypes = pickWeightedUnique(roomTypePool, roomCount);
	// Pad with random picks if we don't have enough unique types
	while (roomTypes.length < roomCount) {
		roomTypes.push(pickWeighted(roomTypePool));
	}

	// ── Generate & Upload Map Image ──────────────────────────────────────────
	const layout = buildDungeonLayout(connections);
	const svgString = generateDungeonSVG(layout, connections);

	// Convert SVG to File
	const blob = new Blob([svgString], { type: 'image/svg+xml' });
	const safeFileName = `${dungeonName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${hexKey}.svg`;
	let fileObj;
	if (typeof File !== 'undefined') { // Browser
		fileObj = new File([blob], safeFileName, { type: 'image/svg+xml' });
	} else { // Fallback shouldn't usually happen in Foundry UI, but safe
		fileObj = blob;
		fileObj.name = safeFileName;
	}

	let mapSrc = "";
	try {
		// Ensure directory exists (Foundry API: data, path, options)
		const targetFolder = "hexlocations";
		try {
			await FilePicker.createDirectory("data", targetFolder);
		} catch (e) {
			// Directory probably exists, ignore
		}

		// Upload the file
		const uploadResult = await FilePicker.upload("data", targetFolder, fileObj);
		mapSrc = uploadResult.path;
	} catch (err) {
		console.warn(`${MODULE_ID} | Failed to upload dungeon map:`, err);
		// Fallback to inline data URI if upload fails (some browsers might still display it)
		mapSrc = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgString)))}`;
	}

	// ── Overview ─────────────────────────────────────────────────────────────
	let html = `<h2>${dungeonName}</h2>`;
	html += `<p><em>${dungeonType.label} — Hex ${hexLabel}</em></p>`;
	if (mapSrc) {
		const mapSecretId = `secret-${(typeof foundry !== 'undefined' && foundry.utils) ? foundry.utils.randomID() : Math.random().toString(36).substring(2, 10)}`;
		html += `<section id="${mapSecretId}" class="secret">`;
		html += `<div style="text-align: center; margin: 10px 0;">`;
		html += `<img src="${mapSrc}" alt="Dungeon Map" style="max-width: 450px; width: 100%; border: 1px solid #ccc; border-radius: 8px;">`;
		html += `</div>`;
		html += `</section>`;
	}
	html += `<p>${description}</p>`;

	if (typeKey === "dungeon") {
		const motData = await loadMotivationsData();
		const pickedMots = pickN(motData.motivations, 3);
		html += `<h3>Peculiar Motivations</h3>`;
		html += `<p>There is someone here with some peculiar motivations, choose one or make your own:</p>`;
		html += `<ul>`;
		for (const mot of pickedMots) {
			html += `<li>${mot}</li>`;
		}
		html += `</ul>`;
	}

	// Wandering monsters
	html += `<h2>Wandering Monsters</h2>`;
	html += `<p>Check <strong>${data.wanderingMonsters.chance}</strong> (${data.wanderingMonsters.checkFrequency}) for a wandering encounter:</p>`;
	html += await generateWanderingTable(data, typeKey);

	// Rooms ────────────────────────────────────────────────────────────────
	html += `<hr>`;

	// Pick a random room to have the book
	const bookRoomIndex = randRange(0, roomCount - 1);
	const bookData = await loadBookData();

	// Pick a random room to have a well (50% chance for dungeons/temples)
	let wellRoomIndex = -1;
	if ((typeKey === "dungeon" || typeKey === "temple") && Math.random() < 0.5) {
		wellRoomIndex = randRange(0, roomCount - 1);
	}

	for (let i = 0; i < roomCount; i++) {
		html += await generateRoom(
			data, i + 1, roomTypes[i], connections, keyMap, typeKey, treasureTier,
			sizeKey !== "small",
			i === wellRoomIndex
		);

		// Add book if this is the chosen room
		if (i === bookRoomIndex) {
			const chosenBook = pick(bookData.books);
			const chosenLocation = pick(bookData.bookLocations);
			html += `<p><strong>Rare Find (Book):</strong> You notice a book ${chosenLocation}. The cover reads: <em>"${chosenBook}"</em>.</p>`;
		}

		if (i < roomCount - 1) html += `<hr>`;
	}

	// Attribution
	html += `<hr><p style="font-size:0.75em;opacity:0.6;">Generated from <a href="https://hexroll.app">Hexroll</a> data</p>`;

	return { html, dungeonName };
}
