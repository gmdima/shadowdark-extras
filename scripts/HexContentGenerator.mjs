import { loadDungeonData, generateDungeonName } from "./DungeonGenerator.mjs";
import { loadSettlementData, generateSettlementName, generateNpc, cap } from "./SettlementGenerator.mjs";

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
 * Generate a procedural Inn landmark.
 */
async function generateLandmarkInn(data, biomeKey, regionName) {
	const settlementData = await loadSettlementData();
	const inn = data.landmarks.inn;
	const prefix = pick(inn.names.prefixes);
	const suffix = pick(inn.names.suffixes);
	const innName = `${prefix} ${suffix}`;

	const host = generateNpc(settlementData);
	const numPatrons = Math.floor(Math.random() * 3) + 1;
	const patrons = [];
	for (let i = 0; i < numPatrons; i++) {
		const npc = generateNpc(settlementData);
		const type = pick(inn.patronTypes);
		patrons.push(`<strong>${npc.name}</strong>, ${type}`);
	}

	const foodPool = inn.food[biomeKey] || inn.food["plains"];
	const drinkPool = inn.drinks;

	const menuFood = [];
	const usedFood = new Set();
	while (menuFood.length < 2 && usedFood.size < foodPool.length) {
		const f = pick(foodPool);
		if (!usedFood.has(f)) {
			usedFood.add(f);
			menuFood.push(f);
		}
	}

	const menuDrinks = [];
	const usedDrinks = new Set();
	while (menuDrinks.length < 2 && usedDrinks.size < drinkPool.length) {
		const d = pick(drinkPool);
		if (!usedDrinks.has(d)) {
			usedDrinks.add(d);
			menuDrinks.push(d);
		}
	}

	let rumor = "There's talk of strange things in the wilds.";
	if (data.rumorTemplates) {
		const tmpl = pick(data.rumorTemplates);
		const monsters = data.biomes[biomeKey].featureEncounters;
		const link = await monsterLink(pickWeightedUnique(monsters, 1)[0]);
		rumor = tmpl.replace(/\{monster\}/g, link).replace(/\{region\}/g, regionName);
	}

	let html = `<div class="landmark-inn">`;
	html += `<h3>${innName} (Inn)</h3>`;
	html += `<p>This thematic retreat is hosted by <strong>${host.name}</strong>, ${host.appearance} (<em>${host.trait}</em>). In their pocket: ${host.pocket}.</p>`;

	html += `<table><tr><th>Menu Item</th><th>Price</th></tr>`;
	for (const f of menuFood) html += `<tr><td>${f}</td><td>2 sp</td></tr>`;
	for (const d of menuDrinks) html += `<tr><td>${d}</td><td>5 cp</td></tr>`;
	html += `</table>`;

	html += `<h4>Notable Patrons</h4><ul>`;
	for (const p of patrons) html += `<li>${p}</li>`;
	html += `</ul>`;

	html += `<h4>Inn's Rumors</h4><p><em>"${rumor}"</em></p>`;
	html += `</div>`;

	return html;
}

/**
 * Generate a procedural Abandoned Village landmark.
 */
async function generateLandmarkAbandonedVillage(data, biomeKey) {
	const landmark = data.landmarks.abandonedVillage;
	let description = pick(landmark.descriptions);

	if (description.includes("{settlement}")) {
		const settlementName = generateSettlementName(await loadSettlementData());
		description = description.replace(/\{settlement\}/g, `<strong>${settlementName}</strong>`);
	}

	if (description.includes("{monster}")) {
		const monsters = data.biomes[biomeKey].featureEncounters;
		const link = await monsterLink(pickWeightedUnique(monsters, 1)[0]);
		description = description.replace(/\{monster\}/g, link);
	}

	let html = `<div class="landmark-village">`;
	html += `<h3>Abandoned Village (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Altar landmark.
 */
function generateLandmarkAltar(data) {
	const landmark = data.landmarks.altar;
	const description = pick(landmark.descriptions);
	let html = `<div class="landmark-altar">`;
	html += `<h3>Ancient Altar (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Signaling Tower landmark.
 */
function generateLandmarkSignalingTower(data) {
	const landmark = data.landmarks.signalingTower;
	const description = pick(landmark.descriptions);
	let html = `<div class="landmark-signaling-tower">`;
	html += `<h3>Signaling Tower (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `<p><em>${landmark.supplemental}</em></p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Wagons landmark.
 */
function generateLandmarkWagons(data) {
	const landmark = data.landmarks.wagons;
	const number = pick(landmark.numbers);
	const template = pick(landmark.descriptions);
	const description = template
		.replace(/\{number\}/g, number)
		.replace(/\{NumberCap\}/g, cap(number));
	let html = `<div class="landmark-wagons">`;
	html += `<h3>Abandoned Wagons (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Dead Adventurers landmark.
 */
function generateLandmarkDeadAdventurers(data) {
	const landmark = data.landmarks.deadAdventurers;
	const number = pick(landmark.numbers);
	const template = pick(landmark.descriptions);
	const description = template
		.replace(/\{number\}/g, number)
		.replace(/\{NumberCap\}/g, cap(number));
	let html = `<div class="landmark-adventurers">`;
	html += `<h3>Dead Adventurers (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Sacrificial Site landmark.
 */
function generateLandmarkSacrificialSite(data) {
	const landmark = data.landmarks.sacrificialSite;
	const subject = pick(landmark.subjects);
	const description = landmark.descriptionTemplate.replace(/\{subject\}/g, subject);
	let html = `<div class="landmark-sacrificial">`;
	html += `<h3>Sacrificial Site (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Dead Monster landmark.
 */
async function generateLandmarkDeadMonster(data, biomeKey) {
	const landmark = data.landmarks.deadMonster;
	const template = pick(landmark.descriptions);
	const monsters = data.biomes[biomeKey].featureEncounters;
	const link = await monsterLink(pickWeightedUnique(monsters, 1)[0]);
	const description = template.replace(/\{monster\}/g, link);
	let html = `<div class="landmark-monster-remains">`;
	html += `<h3>Monster Remains (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `</div>`;
	return html;
}

/**
 * Generate a procedural Watchtower landmark.
 */
function generateLandmarkWatchtower(data, biomeKey) {
	const watchtower = data.landmarks.watchtower;
	const description = pick(watchtower.descriptions);

	let html = `<div class="landmark-watchtower">`;
	html += `<h3>Watchtower (Landmark)</h3>`;
	html += `<p>${description}</p>`;
	html += `<p><em>Travelers who spend time surveying from this vantage point eliminate the risk of becoming lost for the remainder of the day.</em></p>`;
	html += `</div>`;

	return html;
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

	// Landmarks - 0, 1, or 2
	const landmarkSlots = 2; // Maximum slots available

	if (data.landmarks) {
		let landmarkHtml = "";
		let generatedCount = 0;
		const isDifficult = ["swamp", "mountain", "jungle"].includes(biomeKey);

		// Landmark rolling rules and helpers
		const landmarkConfigs = [
			{ key: "inn", gen: async (d, b, r) => await generateLandmarkInn(d, b, r) },
			{ key: "watchtower", gen: (d, b) => generateLandmarkWatchtower(d, b) },
			{ key: "abandonedVillage", gen: async (d, b) => await generateLandmarkAbandonedVillage(d, b) },
			{ key: "altar", gen: (d) => generateLandmarkAltar(d) },
			{ key: "signalingTower", gen: (d) => generateLandmarkSignalingTower(d) },
			{ key: "wagons", gen: (d) => generateLandmarkWagons(d) },
			{ key: "deadAdventurers", gen: (d) => generateLandmarkDeadAdventurers(d) },
			{ key: "sacrificialSite", gen: (d) => generateLandmarkSacrificialSite(d) },
			{ key: "deadMonster", gen: async (d, b) => await generateLandmarkDeadMonster(d, b) }
		];

		// Shuffle or iterate? Let's iterate in order for now as a "priority" or "fairness" roll
		// but we want randomization. Let's shuffle the configs first.
		const shuffled = [...landmarkConfigs].sort(() => Math.random() - 0.5);

		for (const config of shuffled) {
			if (generatedCount >= landmarkSlots) break;

			const lData = data.landmarks[config.key];
			if (!lData) continue;

			if (lData.excludedBiomes && lData.excludedBiomes.includes(biomeKey)) continue;

			const threshold = isDifficult ? lData.probabilities.difficult : lData.probabilities.normal;
			if (Math.random() < threshold) {
				landmarkHtml += await config.gen(data, biomeKey, regionName);
				generatedCount++;
			}
		}

		if (generatedCount > 0) {
			html += `<h2>Landmarks</h2>`;
			html += landmarkHtml;
		}
	}

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
		const numItems = Math.floor(Math.random() * 4) + 4; // 4 to 7 standard items
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
