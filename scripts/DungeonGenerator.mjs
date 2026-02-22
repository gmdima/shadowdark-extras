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
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load dungeon data:`, err);
		ui.notifications?.error("SDX | Could not load dungeon data.");
		throw err;
	}
	return _data;
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
	const roomDesc = descs ? pick(descs) : "A nondescript room.";
	const roomDeco = decos ? pick(decos) : "";

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

	// Pick room types
	const roomTypes = pickWeightedUnique(data.roomTypes, roomCount);
	// Pad with random picks if we don't have enough unique types
	while (roomTypes.length < roomCount) {
		roomTypes.push(pickWeighted(data.roomTypes));
	}

	// ── Overview ─────────────────────────────────────────────────────────────
	let html = `<h2>${dungeonName}</h2>`;
	html += `<p><em>${dungeonType.label} — Hex ${hexLabel}</em></p>`;
	html += `<p>${description}</p>`;

	// Room index
	html += `<h3>Rooms</h3><ol>`;
	for (let i = 0; i < roomCount; i++) {
		html += `<li>${roomTypes[i].label}</li>`;
	}
	html += `</ol>`;

	// Wandering monsters
	html += `<h2>Wandering Monsters</h2>`;
	html += `<p>Check <strong>${data.wanderingMonsters.chance}</strong> (${data.wanderingMonsters.checkFrequency}) for a wandering encounter:</p>`;
	html += await generateWanderingTable(data, typeKey);

	// ── Rooms ────────────────────────────────────────────────────────────────
	html += `<hr>`;
	for (let i = 0; i < roomCount; i++) {
		html += await generateRoom(
			data, i + 1, roomTypes[i], connections, keyMap, typeKey, treasureTier,
			sizeKey !== "small"
		);
		if (i < roomCount - 1) html += `<hr>`;
	}

	// Attribution
	html += `<hr><p style="font-size:0.75em;opacity:0.6;">Generated from <a href="https://hexroll.app">Hexroll</a> data</p>`;

	return { html, dungeonName };
}
