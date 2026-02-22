import { loadDungeonData, generateDungeonName } from "./DungeonGenerator.mjs";
import { loadSettlementData, generateSettlementName } from "./SettlementGenerator.mjs";

const MODULE_ID = "shadowdark-extras";

let _data = null;
let _monsterIndex = null;

async function loadData() {
	if (_data) return _data;
	try {
		const resp = await fetch(`modules/${MODULE_ID}/scripts/data/hexroll-data.json`);
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
		_data = await resp.json();
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to load hexroll data:`, err);
		ui.notifications?.error("SDX | Could not load hexroll data.");
		throw err;
	}
	return _data;
}

/**
 * Get the compendium index for shadowdark.monsters, cached after first load.
 * Returns a Map of monster name → compendium document ID.
 */
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

/**
 * Resolve a monster name to a FoundryVTT enriched @UUID link.
 * Falls back to plain text if the monster isn't found in the compendium.
 */
async function monsterLink(name) {
	const index = await getMonsterIndex();
	const id = index.get(name);
	if (id) return `@UUID[Compendium.shadowdark.monsters.${id}]{${name}}`;
	return name;
}

function pick(arr) {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Pick N unique entries from a weighted array.
 * Each entry has { name, weight }. Higher weight = more likely.
 */
function pickWeightedUnique(weighted, count) {
	const pool = [];
	for (const entry of weighted) {
		for (let i = 0; i < entry.weight; i++) pool.push(entry.name);
	}
	const results = [];
	const used = new Set();
	let attempts = 0;
	while (results.length < count && attempts < 200) {
		const name = pool[Math.floor(Math.random() * pool.length)];
		if (!used.has(name)) {
			used.add(name);
			results.push(name);
		}
		attempts++;
	}
	return results;
}

/**
 * Generate a random region name for a biome.
 */
export function generateRegionName(data, biomeKey) {
	const biome = data.biomes[biomeKey];
	if (!biome) return "Unknown Region";
	const prefix = pick(data.regionNames);
	const suffix = pick(biome.regionSuffixes);
	return `${prefix} ${suffix}`;
}

/**
 * Get available biomes for the picker UI.
 */
export async function getAvailableBiomes() {
	const data = await loadData();
	return Object.entries(data.biomes).map(([key, val]) => ({ key, label: val.label }));
}

/**
 * Generate hex wilderness content and format as HTML.
 * Encounter names are resolved to @UUID compendium links.
 */
export async function generateHexHtml(biomeKey, hexLabel) {
	const data = await loadData();
	const biome = data.biomes[biomeKey];
	if (!biome) return { html: "<p>Unknown biome.</p>", regionName: biomeKey };

	// Pick content
	const description = pick(biome.descriptions);
	const location = pick(biome.locations);
	const regionName = generateRegionName(data, biomeKey);

	// Pick 4 random encounters (weighted, unique)
	const encounters = pickWeightedUnique(biome.randomEncounters, 4);

	// Pick weather variant
	const weatherType = biome.weatherTypes
		? pick(biome.weatherTypes)
		: biome.weatherType;
	const weatherTable = data.weatherTables[weatherType];
	const variant = weatherTable ? pick(weatherTable.variants) : null;

	// Build HTML
	let html = "";

	// Header
	html += `<h2>The ${regionName}</h2>`;
	html += `<p><em>${biome.label} — Hex ${hexLabel}</em></p>`;

	// Description
	html += `<p>${description}</p>`;
	html += `<p><em>Located ${location}.</em></p>`;

	// Rumors — pick from feature encounters + rumor templates
	const rumorMonsters = pickWeightedUnique(biome.featureEncounters, 4);
	if (data.rumorTemplates && rumorMonsters.length > 0) {
		const secretId = `secret-${foundry.utils.randomID()}`;
		html += `<section id="${secretId}" class="secret">`;
		html += `<h2>Rumors</h2>`;
		html += `<table><tr><th>1d${rumorMonsters.length}</th><th>Rumor</th></tr>`;
		const usedTemplates = new Set();
		for (let i = 0; i < rumorMonsters.length; i++) {
			let tmpl;
			let attempts = 0;
			do {
				tmpl = pick(data.rumorTemplates);
				attempts++;
			} while (usedTemplates.has(tmpl) && attempts < 50);
			usedTemplates.add(tmpl);
			const link = await monsterLink(rumorMonsters[i]);
			const text = tmpl.replace(/\{monster\}/g, link).replace(/\{region\}/g, regionName);
			html += `<tr><td>${i + 1}</td><td>${text}</td></tr>`;
		}
		html += `</table>`;
		html += `</section>`;
	}

	// Random Encounters — resolve to compendium links
	const encountersSecretId = `secret-${foundry.utils.randomID()}`;
	html += `<section id="${encountersSecretId}" class="secret">`;
	html += `<h2>Random Encounters</h2>`;
	html += `<p>There's a <strong>1 in 6</strong> chance when exploring `;
	html += `(or <strong>2 in 6</strong> if camping overnight) to encounter:</p>`;
	html += `<table><tr><th>1d4</th><th>Encounter</th></tr>`;
	for (let i = 0; i < encounters.length; i++) {
		const link = await monsterLink(encounters[i]);
		html += `<tr><td>${i + 1}</td><td>${link}</td></tr>`;
	}
	html += `</table>`;
	html += `</section>`;

	// Weather
	if (variant) {
		const weatherSecretId = `secret-${foundry.utils.randomID()}`;
		html += `<section id="${weatherSecretId}" class="secret">`;
		html += `<h2>Regional Weather</h2>`;
		html += `<table><tr><th>2d6</th>`;
		for (const season of variant.seasons) {
			html += `<th>${season}</th>`;
		}
		html += `</tr>`;
		for (const row of variant.rows) {
			html += `<tr><td><strong>${row.roll}</strong></td>`;
			for (const val of row.values) {
				html += `<td>${val}</td>`;
			}
			html += `</tr>`;
		}
		html += `</table>`;
		if (variant.hazard) {
			html += `<p><em>${variant.hazard}</em></p>`;
		}
		html += `</section>`;
	}

	// Pool — biome-gated probability
	const poolChance = biomeKey === "ocean" ? 0 : biomeKey === "desert" ? 0.01 : 0.1;
	if (data.wildernessPool && Math.random() < poolChance) {
		const poolData = data.wildernessPool;
		const poolType = pick(poolData.types);
		const poolLiquid = pick(poolData.liquids);
		const poolEffect = pick(poolData.effects);
		const poolSecretId = `secret-${foundry.utils.randomID()}`;
		html += `<section id="${poolSecretId}" class="secret">`;
		html += `<h2>Pool</h2>`;
		html += `<p>You come across <strong>${poolType}</strong> filled with ${poolLiquid}. ${poolEffect}</p>`;
		html += `</section>`;
	}

	// Mouth — 20% chance, excluding ocean
	if (biomeKey !== "ocean" && Math.random() < 0.20 && data.mouths?.[biomeKey]) {
		const mouthLocation = pick(data.mouths[biomeKey]);
		const mouthSecretId = `secret-${foundry.utils.randomID()}`;
		html += `<section id="${mouthSecretId}" class="secret">`;
		html += `<h2>Mouth</h2>`;
		html += `<p>Exploring this area reveals a <strong>hidden entrance</strong> ${mouthLocation}.</p>`;
		html += `</section>`;
	}

	// Caravan / Ship Encounter
	const caravanChance = biomeKey === "ocean" ? 0.25 : ["plains", "forest"].includes(biomeKey) ? 0.35 : 0.20;
	if (data.caravans && Math.random() < caravanChance) {
		const cd = data.caravans;
		const isShip = biomeKey === "ocean";
		const vehicleColor = pick(cd.colors);
		const vehicleType = pick(isShip ? cd.shipTypes : cd.landTypes);
		const vehicleName = isShip ? "Ship" : "Caravan";

		const merchantName = pick(cd.merchantNames);
		const merchantTrait = pick(cd.npcTraits);

		// 1 to 2 assistants
		const numAssistants = Math.floor(Math.random() * 2) + 1;
		const assistants = [];
		for (let i = 0; i < numAssistants; i++) {
			assistants.push(`${pick(cd.merchantNames)}, ${pick(cd.npcRoles)}`);
		}

		// Inventory
		const numItems = Math.floor(Math.random() * 4) + 2; // 2 to 5 standard items
		const items = [];
		for (let i = 0; i < numItems; i++) {
			items.push(pick(cd.equipment));
		}

		// 60% chance for 1 magic item
		if (Math.random() < 0.60) {
			items.push(pick(cd.magicItems));
		}

		const secretId = `secret-${foundry.utils.randomID()}`;
		html += `<section id="${secretId}" class="secret">`;
		html += `<h2>Merchant ${vehicleName}</h2>`;
		html += `<p>You encounter a ${vehicleType} ${vehicleColor}-colored ${vehicleName.toLowerCase()}. It is owned by <strong>${merchantName}</strong>, a merchant ${merchantTrait}.</p>`;
		html += `<p>Traveling with them: ${assistants.join(" and ")}.</p>`;

		html += `<h3>Items for Sale</h3>`;
		html += `<table><tr><th>Item</th><th>Price</th></tr>`;
		for (const item of items) {
			html += `<tr><td>${item.Title}</td><td>${item.Cost}</td></tr>`;
		}
		html += `</table>`;

		// Add a rumor if available
		const rumorMonsters = pickWeightedUnique(biome.featureEncounters, 2);
		if (data.rumorTemplates && rumorMonsters.length > 0) {
			html += `<h3>Rumors</h3><ul>`;
			for (let i = 0; i < rumorMonsters.length; i++) {
				const tmpl = pick(data.rumorTemplates);
				const link = await monsterLink(rumorMonsters[i]);
				const text = tmpl.replace(/\{monster\}/g, link).replace(/\{region\}/g, regionName);
				html += `<li>${text}</li>`;
			}
			html += `</ul>`;
		}

		// Campfire Tale
		if (data.caravans.campfireTales) {
			let taleTemplate = pick(data.caravans.campfireTales);

			if (taleTemplate.includes("{dungeon}")) {
				const dungeonData = await loadDungeonData();
				const dungeonName = generateDungeonName(dungeonData);
				taleTemplate = taleTemplate.replace(/\{dungeon\}/g, `<strong>${dungeonName}</strong>`);
			}

			if (taleTemplate.includes("{settlement}")) {
				const settlementData = await loadSettlementData();
				const settlementName = generateSettlementName(settlementData);
				taleTemplate = taleTemplate.replace(/\{settlement\}/g, `<strong>${settlementName}</strong>`);
			}

			if (taleTemplate.includes("{magicWord}") && data.caravans.magicWords) {
				const magicWord = pick(data.caravans.magicWords);
				taleTemplate = taleTemplate.replace(/\{magicWord\}/g, `<strong>${magicWord}</strong>`);
			}

			if (taleTemplate.includes("{dungeonLocation}") && data.caravans.dungeonLocations) {
				const dungeonLocation = pick(data.caravans.dungeonLocations);
				taleTemplate = taleTemplate.replace(/\{dungeonLocation\}/g, `<strong>${dungeonLocation}</strong>`);
			}

			html += `<h3>Campfire Tale</h3>`;
			html += `<p><em>If you sit by their fire, <strong>${merchantName}</strong> ${taleTemplate}</em></p>`;
		}

		html += `</section>`;
	}

	// Attribution
	html += `<hr><p style="font-size:0.75em;opacity:0.6;">Generated from <a href="https://hexroll.app">Hexroll</a> data</p>`;

	return { html, regionName };
}
