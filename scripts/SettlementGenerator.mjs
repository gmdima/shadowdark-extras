import { formatHexCoord } from "./SDXCoordsSD.mjs";
import { resolveTemplate } from "./HexContentGenerator.mjs";
import { getNearbyContent } from "./ContentRegistry.mjs";
import { HEX_JOURNAL_NAME } from "./HexTooltipSD.mjs";

const MODULE_ID = "shadowdark-extras";

let _data = null;
let _monsterIndex = null;
let _fortunateEventData = null;
let _questData = null;

export async function loadSettlementData() {
	if (_data) return _data;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/settlement-data.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_data = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load settlement data:`, err);
		ui.notifications?.error("SDX | Could not load settlement data.");
		throw err;
	}
	return _data;
}

let _hiddenTraitsData = null;
export async function loadHiddenTraitsData() {
	if (_hiddenTraitsData) return _hiddenTraitsData;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/npc-hidden-traits.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_hiddenTraitsData = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load hidden NPC traits:`, err);
		throw err;
	}
	return _hiddenTraitsData;
}

export async function loadFortunateEventData() {
	if (_fortunateEventData) return _fortunateEventData;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/fortunate-event-data.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_fortunateEventData = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load fortunate event data:`, err);
		throw err;
	}
	return _fortunateEventData;
}

async function loadQuestData() {
	if (_questData) return _questData;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/quest-data.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_questData = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load quest data:`, err);
		_questData = null;
	}
	return _questData;
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

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, Math.min(n, shuffled.length));
}

function pickWeighted(weighted, count) {
	const pool = [];
	for (const entry of weighted) {
		for (let i = 0; i < (entry.weight || 1); i++) pool.push(entry);
	}
	const results = [];
	const usedTypes = new Set();
	let attempts = 0;
	while (results.length < count && attempts < 200) {
		const entry = pool[Math.floor(Math.random() * pool.length)];
		if (!usedTypes.has(entry.type)) {
			usedTypes.add(entry.type);
			results.push(entry);
		}
		attempts++;
	}
	return results;
}

function randRange(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function cap(s) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Watabou city map URL builder ────────────────────────────────────────────

/**
 * Check adjacent hexes for ocean terrain.
 * @param {string} hexKey - "i_j"
 * @returns {{ hasOcean: boolean, allOcean: boolean, oceanCount: number, totalNeighbors: number }}
 */
function getAdjacentOceanInfo(hexKey) {
	const result = { hasOcean: false, allOcean: false, oceanCount: 0, totalNeighbors: 0 };
	if (!hexKey || !canvas?.grid?.isHexagonal) return result;

	const [i, j] = hexKey.split("_").map(Number);
	if (isNaN(i) || isNaN(j)) return result;

	const sceneId = canvas.scene?.id;
	if (!sceneId) return result;

	// Read hex data from journal
	const journal = game.journal.find(jj => jj.name === HEX_JOURNAL_NAME);
	const allData = journal?.getFlag(MODULE_ID, "hexData") ?? {};
	const sceneData = allData[sceneId] ?? {};

	// Ocean terrain labels
	const OCEAN_LABELS = new Set(["Ocean", "Water"]);

	try {
		const neighbors = canvas.grid.getAdjacentOffsets({ i, j });
		result.totalNeighbors = neighbors.length;
		for (const n of neighbors) {
			const nKey = `${n.i}_${n.j}`;
			const rec = sceneData[nKey];
			if (rec?.terrain && OCEAN_LABELS.has(rec.terrain)) {
				result.oceanCount++;
			}
		}
		result.hasOcean = result.oceanCount > 0;
		result.allOcean = result.totalNeighbors > 0 && result.oceanCount === result.totalNeighbors;
	} catch { /* grid not ready */ }

	return result;
}

/**
 * Build a Watabou generator URL with parameters matching the settlement.
 * Villages use the village-generator; towns and cities use the city-generator.
 * @param {string} settlementName
 * @param {string} typeKey - "village", "town", or "city"
 * @param {{ hasOcean: boolean, allOcean: boolean }} oceanInfo
 * @returns {{ viewUrl: string, svgUrl: string }}
 */
function buildWatabouUrl(settlementName, typeKey, oceanInfo) {
	const seed = Math.floor(Math.random() * 2147483647);

	if (typeKey === "village") {
		// ── Village Generator ──
		const pop = randRange(50, 400);
		const roads = Math.floor(Math.random() * 99999);

		// Pick random tags from the available options
		const tagPool = [
			"confluence", "crossroads", "dead end",
			"farmland", "grove", "highway", "no square", "organic",
			"palisade", "pond", "river", "sparse", "uncultivated",
			"dense", "district", "isolated", "no orchards",
		];
		const tagCount = randRange(1, 4);
		const tags = pickN(tagPool, tagCount);

		// Context-aware coast/island tags
		if (oceanInfo.allOcean) {
			tags.push("island");
		} else if (oceanInfo.hasOcean) {
			tags.push("coast");
		}

		const params = {
			seed,
			name: settlementName,
			pop,
			roads,
			tags: tags.join(","),
		};
		const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
		const base = "https://watabou.github.io/village-generator/";
		return {
			viewUrl: `${base}?${qs}`,
			svgUrl: `${base}?${qs}&export=svg`,
		};
	}

	// ── City Generator (town / city) ──
	const sizes = { town: 25, city: 45 };
	const size = sizes[typeKey] ?? 25;

	const params = {
		size,
		seed,
		name: settlementName,
		citadel: typeKey === "city" ? 1 : 0,
		urban_castle: typeKey === "city" ? (Math.random() < 0.3 ? 1 : 0) : 0,
		plaza: 1,
		temple: 1,
		walls: 1,
		shantytown: typeKey === "city" ? 1 : 0,
		coast: oceanInfo.hasOcean ? 1 : 0,
		river: Math.random() < 0.4 ? 1 : 0,
		greens: 0,
		gates: -1,
	};

	const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
	const base = "https://watabou.github.io/city-generator/";
	return {
		viewUrl: `${base}?${qs}`,
		svgUrl: `${base}?${qs}&export=svg`,
	};
}

// ── Nearby hex coordinate generation ────────────────────────────────────────

function generateNearbyHexRef(hexKey) {
	const [ci, cj] = hexKey.split("_").map(Number);
	// Random offset 1-4 hexes away in each axis
	const di = randRange(1, 4) * (Math.random() < 0.5 ? -1 : 1);
	const dj = randRange(1, 4) * (Math.random() < 0.5 ? -1 : 1);
	const ni = Math.max(0, ci + di);
	const nj = Math.max(0, cj + dj);
	try {
		return `Hex ${formatHexCoord({ i: ni, j: nj })}`;
	} catch {
		return `Hex ${ni}.${nj}`;
	}
}

// ── Name & NPC generation ───────────────────────────────────────────────────

export function generateSettlementName(data) {
	const prefix = pick(data.settlementNames.prefixes);
	const suffix = pick(data.settlementNames.suffixes);
	return `${prefix}${suffix}`;
}

export function generateNpc(data) {
	const isMale = Math.random() < 0.5;
	const first = isMale ? pick(data.npcNames.firstMale) : pick(data.npcNames.firstFemale);
	const last = pick(data.npcNames.lastNames);
	const trait = pick(data.npcTraits);
	const appearance = pick(data.npcAppearances);
	const pocket = pick(data.pocketItems);

	let hiddenTrait = null;
	if (_hiddenTraitsData && Math.random() < 0.20) {
		hiddenTrait = pick(_hiddenTraitsData.hiddenTraits);
	}

	return { name: `${first} ${last}`, trait, appearance, pocket, hiddenTrait };
}

function generateShopName(data, shopType) {
	const names = data.shopNames[shopType];
	if (!names) return shopType.charAt(0).toUpperCase() + shopType.slice(1).replace(/_/g, " ");
	return `${pick(names.prefix)} ${pick(names.suffix)}`;
}

// ── Book title generation ────────────────────────────────────────────────────

function generateBookTitle(data) {
	const bt = data.bookTitles;
	if (!bt) return "Untitled Manuscript";
	const pattern = pick(bt.patterns);
	return pattern
		.replace(/\{noun\}/g, () => pick(bt.nouns))
		.replace(/\{adjective\}/g, () => pick(bt.adjectives))
		.replace(/\{person\}/g, () => pick(bt.persons))
		.replace(/\{place\}/g, () => pick(bt.places))
		.replace(/\{concept\}/g, () => pick(bt.concepts));
}

function generateBookItem(data) {
	const title = generateBookTitle(data);
	const price = pick(data.bookTitles?.prices ?? ["5 gp"]);
	return { name: `"${title}"`, price };
}

// ── Shop inventory ──────────────────────────────────────────────────────────

function generateShopInventory(data, shopType) {
	const items = data.shopInventory?.[shopType];
	if (!items || items.length === 0) return [];

	const base = pickN(items, randRange(3, Math.min(6, items.length)));

	// Bookstores and libraries also stock random rare books
	if ((shopType === "bookstore" || shopType === "library") && data.bookTitles) {
		const bookCount = randRange(2, 4);
		for (let i = 0; i < bookCount; i++) {
			base.push(generateBookItem(data));
		}
	}

	return base;
}

// ── Shop quest (context-aware with registry fallback) ──────────────────────────────

function generateShopQuest(data, hexKey, typeKey, nearbyContent) {
	if (Math.random() > (data.questChance ?? 0.35)) return null;

	const template = pick(data.shopQuestTemplates);
	const item = pick(data.questItems);
	const secret = pick(data.questSecrets);
	const goods = pick(data.questGoods);
	const reward = pick(data.questRewardRanges[typeKey] ?? ["50 gp"]);

	// Use a real location from the registry if available
	let hexRef;
	if (nearbyContent && nearbyContent.length > 0) {
		const target = pick(nearbyContent);
		hexRef = `<strong>${target.name}</strong> (${hexKeyToLabel(target.hexKey)})`;
	} else {
		hexRef = generateNearbyHexRef(hexKey);
	}

	return template
		.replace(/\{item\}/g, item)
		.replace(/\{secret\}/g, secret)
		.replace(/\{goods\}/g, goods)
		.replace(/\{reward\}/g, reward)
		.replace(/\{hexRef\}/g, hexRef);
}

// ── Section generators ──────────────────────────────────────────────────────

function generateShopSection(data, shop, owner, hexKey, typeKey, nearbyContent) {
	const shopName = generateShopName(data, shop.type);
	const inventory = generateShopInventory(data, shop.type);
	const quest = generateShopQuest(data, hexKey, typeKey, nearbyContent);

	let html = `<h3>${shopName} <em>(${shop.label})</em></h3>`;

	// Owner line — hexroll style: name, appearance (trait). pocket items.
	html += `<p>Merchant: <strong>${owner.name}</strong>. `;
	html += `${cap(owner.appearance)} (<em>${cap(owner.trait)}</em>).`;
	html += ` In the pocket: <strong>${owner.pocket}</strong>.`;
	if (owner.hiddenTrait) {
		html += ` <p class="secret"><strong>Secret:</strong> ${owner.hiddenTrait}</p>`;
	}
	html += `</p>`;

	// Inventory table
	if (inventory.length) {
		html += `<table><tr><th>Item</th><th>Price</th></tr>`;
		for (const item of inventory) {
			html += `<tr><td>${item.name}</td><td>${item.price}</td></tr>`;
		}
		html += `</table>`;
	}

	// Quest
	if (quest) {
		const secretId = `secret-${(typeof foundry !== 'undefined' && foundry.utils) ? foundry.utils.randomID() : Math.random().toString(36).substring(2, 10)}`;
		html += `<section id="${secretId}" class="secret">`;
		html += `<ul><li>${quest}</li></ul>`;
		html += `</section>`;
	}

	return html;
}

function generateTavernSection(data, keeper, hexKey, typeKey, nearbyContent) {
	const td = data.tavernData;
	const tavernName = generateShopName(data, "tavern");

	// Drinks — pick 3-5 unique
	const drinkPool = [];
	for (const d of td.drinks) {
		for (let i = 0; i < (d.weight || 1); i++) drinkPool.push(d);
	}
	const drinkSet = new Set();
	const drinks = [];
	let attempts = 0;
	while (drinks.length < randRange(3, 5) && attempts < 100) {
		const d = drinkPool[Math.floor(Math.random() * drinkPool.length)];
		if (!drinkSet.has(d.name)) {
			drinkSet.add(d.name);
			drinks.push(d);
		}
		attempts++;
	}

	// Menu — 3-4 dishes
	const dishCount = randRange(3, 4);
	const dishes = [];
	for (let i = 0; i < dishCount; i++) {
		const style = pick(td.menuStyles);
		const meat = pick(td.menuMeats);
		const sauce = pick(td.menuSauces);
		const side = pick(td.menuSides);
		const price = pick(["1 sp 5 cp", "2 sp", "2 sp 5 cp", "3 sp"]);
		dishes.push({ desc: `${style} ${meat}, glazed with ${sauce}, served with ${side}`, price });
	}

	// Lodging — 1-3 options
	const lodgingCount = randRange(1, 3);
	const lodging = pickN(td.lodging, lodgingCount);

	let html = `<h2>The ${tavernName}</h2>`;
	html += `<p>Keeper: <strong>${keeper.name}</strong>. `;
	html += `${cap(keeper.appearance)} (<em>${cap(keeper.trait)}</em>).`;
	html += ` In the pocket: <strong>${keeper.pocket}</strong>.`;
	if (keeper.hiddenTrait) {
		html += ` <p class="secret"><strong>Secret:</strong> ${keeper.hiddenTrait}</p>`;
	}
	html += `</p>`;

	// Menu table
	html += `<h3>Menu</h3>`;
	html += `<table><tr><th>Dish</th><th>Price</th></tr>`;
	for (const d of dishes) {
		html += `<tr><td>${d.desc}</td><td>${d.price}</td></tr>`;
	}
	html += `</table>`;

	// Drinks table
	html += `<h3>Drinks</h3>`;
	html += `<table><tr><th>Drink</th><th>Price</th></tr>`;
	for (const d of drinks) {
		html += `<tr><td>${d.name}</td><td>${d.price}</td></tr>`;
	}
	html += `</table>`;

	// Lodging table
	if (lodging.length) {
		html += `<h3>Lodging</h3>`;
		html += `<table><tr><th>Room</th><th>Price</th><th>Capacity</th></tr>`;
		for (const l of lodging) {
			html += `<tr><td>${l.name}</td><td>${l.price}</td><td>${l.capacity}</td></tr>`;
		}
		html += `</table>`;
	}

	// Tavern quest
	const quest = generateShopQuest(data, hexKey, typeKey, nearbyContent);
	if (quest) {
		const secretId = `secret-${(typeof foundry !== 'undefined' && foundry.utils) ? foundry.utils.randomID() : Math.random().toString(36).substring(2, 10)}`;
		html += `<section id="${secretId}" class="secret">`;
		html += `<ul><li>${quest}</li></ul>`;
		html += `</section>`;
	}

	return html;
}

function generateFaction(data) {
	const factionTypes = Object.keys(data.factions);
	const fType = pick(factionTypes);
	const faction = data.factions[fType];
	const name = `${pick(faction.namePrefix)} ${pick(faction.nameSuffix)}`;
	const purpose = pick(faction.purposes);
	const factionLabel = cap(fType);

	let html = `<h2>Faction: ${name}</h2>`;
	html += `<p><em>${factionLabel}.</em> They are ${purpose}.</p>`;
	return html;
}

async function fillQuestTemplate(template, data, hexKey, nearbyContent) {
	const npc = generateNpc(data);
	const goods = pick(data.questGoods);

	// Use a real location from the registry if available
	let hexRef;
	if (nearbyContent && nearbyContent.length > 0) {
		const target = pick(nearbyContent);
		hexRef = `<strong>${target.name}</strong> (${hexKeyToLabel(target.hexKey)})`;
	} else {
		hexRef = generateNearbyHexRef(hexKey);
	}

	// Pick a random monster from the compendium for quest hooks
	const index = await getMonsterIndex();
	let monsterText = "a dangerous creature";
	if (index.size > 0) {
		const names = Array.from(index.keys());
		const name = pick(names);
		monsterText = await monsterLink(name);
	}

	return template
		.replace(/\{npc\}/g, `<strong>${npc.name}</strong>`)
		.replace(/\{goods\}/g, goods)
		.replace(/\{location\}/g, hexRef)
		.replace(/\{monster\}/g, monsterText);
}

// ── Context-Aware Quest Generation ──────────────────────────────────────────

function hexKeyToLabel(hexKey) {
	const [i, j] = hexKey.split("_").map(Number);
	try {
		return `Hex ${formatHexCoord({ i, j })}`;
	} catch {
		return `Hex ${i}.${j}`;
	}
}

async function generateContextQuests(data, hexKey, typeKey, allNpcs) {
	const questData = await loadQuestData();
	if (!questData) return null; // Fall back to generic quests

	// Query the registry:
	// - Dungeons/wilderness: 7 hex radius
	// - Settlements: 50 hex radius (settlements are far apart)
	let nearby = [];
	let nearbySettlementsWide = [];
	try {
		nearby = getNearbyContent(hexKey, 7);
		nearbySettlementsWide = getNearbyContent(hexKey, 50, ["settlement"]);
	} catch (err) {
		console.warn(`${MODULE_ID} | Could not query content registry:`, err);
		return null;
	}

	// Combine: use nearby for dungeons/wilderness, wide search for settlements
	const allNearby = [
		...nearby.filter(e => e.type !== "settlement"),
		...nearbySettlementsWide,
	];

	if (allNearby.length === 0) return null; // No nearby content — fall back

	// Group nearby content by type
	const nearbyDungeons = allNearby.filter(e => e.type === "dungeon");
	const nearbySettlements = allNearby.filter(e => e.type === "settlement");
	const nearbyWilderness = allNearby.filter(e => e.type === "wilderness");

	// Determine which quest types are available based on what's nearby
	const availableTypes = [];
	for (const [key, qType] of Object.entries(questData.questTypes)) {
		const canTarget = qType.targetTypes.some(t => {
			if (t === "dungeon") return nearbyDungeons.length > 0;
			if (t === "settlement") return nearbySettlements.length > 0;
			if (t === "wilderness") return nearbyWilderness.length > 0;
			return false;
		});
		if (canTarget) availableTypes.push(key);
	}

	if (availableTypes.length === 0) return null;

	// Pick 3-5 quest hooks, with priority to diverse types
	const hookCount = randRange(3, 5);
	const chosenTypes = pickN(availableTypes, hookCount);

	// Get a monster for bounty quests
	const monsterIndex = await getMonsterIndex();
	let monsterText = "a dangerous creature";
	if (monsterIndex.size > 0) {
		const names = Array.from(monsterIndex.keys());
		monsterText = await monsterLink(pick(names));
	}

	const quests = [];
	for (const qTypeKey of chosenTypes) {
		const qType = questData.questTypes[qTypeKey];
		const template = pick(qType.templates);

		// Pick a suitable target based on the quest's targetTypes
		let target = null;
		const possibleTargetTypes = qType.targetTypes.filter(t => {
			if (t === "dungeon") return nearbyDungeons.length > 0;
			if (t === "settlement") return nearbySettlements.length > 0;
			if (t === "wilderness") return nearbyWilderness.length > 0;
			return false;
		});
		const chosenTargetType = pick(possibleTargetTypes);
		if (chosenTargetType === "dungeon") target = pick(nearbyDungeons);
		else if (chosenTargetType === "settlement") target = pick(nearbySettlements);
		else if (chosenTargetType === "wilderness") target = pick(nearbyWilderness);

		if (!target) continue;

		// Fill template placeholders
		const npc = pick(allNpcs);
		const relation = pick(questData.relations);
		const questItem = pick(questData.questItems);
		const goods = pick(data.questGoods);
		const reward = pick(questData.rewards[typeKey] || questData.rewards.village);
		const timeframe = pick(questData.timeframes);
		const targetHex = hexKeyToLabel(target.hexKey);

		// Get a fresh monster for each quest that needs one
		let questMonster = monsterText;
		if (monsterIndex.size > 0) {
			const names = Array.from(monsterIndex.keys());
			questMonster = await monsterLink(pick(names));
		}

		const filled = template
			.replace(/\{npcName\}/g, `<strong>${npc.name}</strong>`)
			.replace(/\{relation\}/g, relation)
			.replace(/\{targetName\}/g, target.name)
			.replace(/\{targetHex\}/g, targetHex)
			.replace(/\{questItem\}/g, questItem)
			.replace(/\{goods\}/g, goods)
			.replace(/\{reward\}/g, reward)
			.replace(/\{timeframe\}/g, timeframe)
			.replace(/\{monster\}/g, questMonster);

		quests.push({ type: qType.label, text: filled });
	}

	return quests.length > 0 ? quests : null;
}

// ── NPC Relations ───────────────────────────────────────────────────────────

function generateRelations(data, npcs, typeKey) {
	const rel = data.npcRelations;
	if (!rel || npcs.length < 2) return [];

	const maxRel = rel.maxRelations?.[typeKey] ?? 2;
	const count = randRange(1, Math.min(maxRel, Math.floor(npcs.length / 2)));
	const categories = ["business", "conflict", "personal", "alliance", "criminal"];

	const relations = [];
	const usedPairs = new Set();

	for (let i = 0; i < count; i++) {
		let a, b, attempts = 0;
		do {
			a = randRange(0, npcs.length - 1);
			b = randRange(0, npcs.length - 1);
			attempts++;
		} while ((a === b || usedPairs.has(`${a}_${b}`) || usedPairs.has(`${b}_${a}`)) && attempts < 50);
		if (a === b) continue;

		usedPairs.add(`${a}_${b}`);

		const category = pick(categories);
		const templates = rel[category];
		if (!templates || templates.length === 0) continue;
		const template = pick(templates);

		relations.push({
			from: npcs[a],
			to: npcs[b],
			text: template,
		});
	}

	return relations;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Get available settlement types for the picker UI.
 */
export async function getSettlementTypes() {
	const data = await loadSettlementData();
	return Object.entries(data.settlementTypes).map(([key, val]) => ({ key, label: val.label }));
}

/**
 * Generate settlement HTML content and return it with the settlement name.
 * @param {string} typeKey   - "village", "town", or "city"
 * @param {string} hexLabel  - Display label for the hex (e.g. "14.7")
 * @param {string} hexKey    - Internal hex key "i_j" for nearby hex refs
 */
export async function generateSettlementHtml(typeKey, hexLabel, hexKey) {
	const data = await loadSettlementData();
	const sType = data.settlementTypes[typeKey];
	if (!sType) return { html: "<p>Unknown settlement type.</p>", settlementName: typeKey };

	// Use a fallback hexKey for quest generation if not provided
	const safeHexKey = hexKey || "5_5";

	const settlementName = generateSettlementName(data);
	const prefix = pick(sType.prefixes);
	const description = pick(sType.descriptions);

	// Load hidden traits first so generateNpc can use them
	await loadHiddenTraitsData();

	const ruler = generateNpc(data);
	const rulerTitle = pick(data.rulerTitles[typeKey] || ["Leader"]);

	// Pre-generate all NPCs so we can create relations between them
	const [minShops, maxShops] = sType.shopCount;
	const shopCount = randRange(minShops, maxShops);
	const eligibleShops = data.shopTypes.filter(s => s.type !== "tavern");
	const shops = pickWeighted(eligibleShops, shopCount);

	const allNpcs = [];
	const shopOwners = [];
	for (const shop of shops) {
		const npc = generateNpc(data);
		npc.role = shop.label;
		shopOwners.push(npc);
		allNpcs.push(npc);
	}
	const tavernKeeper = generateNpc(data);
	tavernKeeper.role = "Tavern Keeper";
	allNpcs.push(tavernKeeper);

	// Ruler is also part of the NPC pool
	ruler.role = rulerTitle;
	allNpcs.push(ruler);

	// Build HTML
	let html = "";

	// Header
	html += `<h2>${prefix} ${settlementName}</h2>`;
	html += `<p><em>${sType.label} — Hex ${hexLabel}</em></p>`;

	// Watabou city map — embedded iframe
	const oceanInfo = getAdjacentOceanInfo(safeHexKey);
	const watabouUrls = buildWatabouUrl(settlementName, typeKey, oceanInfo);
	html += `<div style="margin:0.5em 0 1em;position:relative;">`;
	html += `<iframe src="${watabouUrls.viewUrl}" style="width:100%;height:500px;border:1px solid rgba(0,0,0,0.2);border-radius:6px;" sandbox="allow-scripts allow-same-origin"></iframe>`;
	html += `<div style="position:absolute;top:0;left:0;width:100%;height:100%;cursor:default;" oncontextmenu="return false;"></div>`;
	html += `</div>`;

	html += `<p>${description}</p>`;
	html += `<p>Ruled by <strong>${rulerTitle} ${ruler.name}</strong>, ${ruler.appearance}. ${cap(ruler.trait)}.`;
	if (ruler.hiddenTrait) {
		html += ` <p class="secret"><strong>Secret:</strong> ${ruler.hiddenTrait}</p>`;
	}
	html += `</p>`;

	// Fortunate Event
	const fortChance = { "village": 0.25, "town": 0.30, "city": 0.35 }[typeKey] || 0;
	if (Math.random() < fortChance) {
		const fortData = await loadFortunateEventData();
		if (fortData) {
			const selections = {};
			const combinedTables = {
				...data.templateTables,
				...fortData,
				nearby_village_name: data.nearbyVillageNames || [],
				old_names_for_women: data.npcNames?.firstFemale || [],
				old_names_for_men: data.npcNames?.firstMale || [],
				human_name: data.npcNames?.firstMale || [],
				domestic_animal_adjective: [
					"overworked", "hungry", "underfed", "thoroughbred", "extremely hardy",
					"tired", "prize-winning", "gaunt", "well-treated", "exceptionally stubborn"
				],
				draft_animals: ["oxen", "work horses", "donkeys", "mules"],
				conveyances: ["carts", "wagons", "sledges", "drays"]
			};
			const template = pick(fortData.fortunate_event);
			const eventText = resolveTemplate(template, combinedTables, selections);

			html += `<h2>Fortunate Event</h2>`;
			html += `<p>${eventText}</p>`;
		}
	}

	// Fetch nearby content ONCE for the whole settlement (shared by shops, tavern, and quests)
	// Dungeons/wilderness: 7 hex radius. Settlements: 50 hex radius.
	let nearbyContent = [];
	try {
		const nearbyClose = getNearbyContent(safeHexKey, 7);
		const nearbySettlementsWide = getNearbyContent(safeHexKey, 50, ["settlement"]);
		nearbyContent = [
			...nearbyClose.filter(e => e.type !== "settlement"),
			...nearbySettlementsWide,
		];
	} catch (err) {
		console.warn(`${MODULE_ID} | Could not query content registry for shops:`, err);
	}

	// Notable Locations — each shop gets a rich sub-section
	html += `<h2>Notable Locations</h2>`;
	for (let i = 0; i < shops.length; i++) {
		html += generateShopSection(data, shops[i], shopOwners[i], safeHexKey, typeKey, nearbyContent);
	}

	// Tavern
	html += generateTavernSection(data, tavernKeeper, safeHexKey, typeKey, nearbyContent);

	// Factions, Relationships, and Quest Hooks - GM Only
	const secretId = `secret-${(typeof foundry !== 'undefined' && foundry.utils) ? foundry.utils.randomID() : Math.random().toString(36).substring(2, 10)}`;
	html += `<section id="${secretId}" class="secret">`;

	// Faction (town/city only)
	if (sType.hasFaction) {
		html += generateFaction(data);
	}

	// NPC Relations
	const relations = generateRelations(data, allNpcs, typeKey);
	if (relations.length > 0) {
		html += `<h2>Relationships</h2>`;
		html += `<ul>`;
		for (const r of relations) {
			html += `<li><strong>${r.from.name}</strong> (${r.from.role}) ${r.text} <strong>${r.to.name}</strong> (${r.to.role}).</li>`;
		}
		html += `</ul>`;
	}

	// Quest Hooks — try context-aware quests first, fall back to generic
	const contextQuests = await generateContextQuests(data, safeHexKey, typeKey, allNpcs);
	html += `<h2>Quest Hooks / Rumors</h2>`;
	if (contextQuests && contextQuests.length > 0) {
		html += `<table><tr><th>1d${contextQuests.length}</th><th>Type</th><th>Hook</th></tr>`;
		for (let i = 0; i < contextQuests.length; i++) {
			html += `<tr><td>${i + 1}</td><td><em>${contextQuests[i].type}</em></td><td>${contextQuests[i].text}</td></tr>`;
		}
		html += `</table>`;
	} else {
		// Fallback: generic quest hooks with random hex references
		const hookCount = randRange(3, 4);
		const templates = pickN(data.questHooks, hookCount);
		html += `<table><tr><th>1d${hookCount}</th><th>Hook</th></tr>`;
		for (let i = 0; i < templates.length; i++) {
			const filled = await fillQuestTemplate(templates[i], data, safeHexKey, nearbyContent);
			html += `<tr><td>${i + 1}</td><td>${filled}</td></tr>`;
		}
		html += `</table>`;
	}

	html += `</section>`;

	// Attribution
	html += `<hr><p style="font-size:0.75em;opacity:0.6;">Generated from <a href="https://hexroll.app">Hexroll</a> data</p>`;

	return { html, settlementName };
}
