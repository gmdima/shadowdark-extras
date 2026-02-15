/**
 * Party Sheet for Shadowdark RPG
 * A group/party management sheet similar to D&D 5e's Group actor
 */

import { getHpWaveColor, isHpWavesEnabled } from "./HpWavesSettingsSD.mjs";
import { getTravelActivities } from "./TravelActivitiesSettingsSD.mjs";
import { getTravelSpeeds } from "./TravelSpeedsSettingsSD.mjs";
import { getCustomLightSources } from "./shadowdark-extras.mjs";

const MODULE_ID = "shadowdark-extras";

/**
 * Get the configured camping/travel tasks
 * @returns {Array} Array of task objects with key, name, abilities, campfire, and bannerImage
 */
function getCampingTasks() {
	return getTravelActivities();
}

/**
 * Party Actor Sheet
 * Extends the base ActorSheet to provide party management functionality
 */
export default class PartySheetSD extends (foundry.appv1?.sheets?.ActorSheet || ActorSheet) {

	/** @inheritdoc */
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ["shadowdark", "sheet", "party", "shadowdark-extras-party"],
			width: 750,
			height: 650,
			resizable: true,
			tabs: [
				{
					navSelector: ".SD-nav",
					contentSelector: ".SD-content-body",
					initial: "tab-members",
				},
			],
			dragDrop: [{ dragSelector: ".item-list .item, .member, .sdx-task-member", dropSelector: null }],
		});
	}

	/** @inheritdoc */
	get template() {
		return `modules/${MODULE_ID}/templates/party.hbs`;
	}

	/** @inheritdoc */
	get title() {
		return this.actor.name;
	}

	/**
	 * Get an actor from a member key (ID or UUID)
	 * @param {string} memberKey - Actor ID or UUID
	 * @returns {Promise<Actor|null>}
	 */
	async _getActorFromKey(memberKey) {
		if (!memberKey) return null;
		// Try as world actor ID first
		let actor = game.actors.get(memberKey);
		if (actor) return actor;
		// Try as UUID (compendium or other)
		if (memberKey.includes(".")) {
			try {
				actor = await fromUuid(memberKey);
			} catch {
				// Ignore errors
			}
		}
		return actor || null;
	}

	/**
	 * Get the members of this party (synchronous, world actors only)
	 * For compendium support, use getMembers() instead
	 * @returns {Actor[]} Array of member actors
	 */
	get members() {
		const memberIds = this.actor.getFlag(MODULE_ID, "members") ?? [];
		return memberIds
			.map(id => {
				// Try as world actor ID first
				const worldActor = game.actors.get(id);
				if (worldActor) return worldActor;
				// For UUIDs stored as IDs, try fromUuidSync (available in V11+)
				if (typeof fromUuidSync === "function" && id.includes(".")) {
					try {
						return fromUuidSync(id);
					} catch {
						return null;
					}
				}
				return null;
			})
			.filter(actor => actor && (actor.type === "Player" || actor.type === "NPC"));
	}

	/**
	 * Get the members of this party (async, supports compendium actors)
	 * @returns {Promise<Actor[]>} Array of member actors
	 */
	async getMembers() {
		const memberIds = this.actor.getFlag(MODULE_ID, "members") ?? [];
		const members = [];
		for (const id of memberIds) {
			let actor = null;
			// Try as world actor ID first
			actor = game.actors.get(id);
			if (!actor && id.includes(".")) {
				// Try as UUID (compendium or other)
				try {
					actor = await fromUuid(id);
				} catch {
					// Ignore errors
				}
			}
			if (actor && (actor.type === "Player" || actor.type === "NPC")) {
				members.push(actor);
			}
		}
		return members;
	}

	_getNpcSpawnCounts() {
		const counts = this.actor.getFlag(MODULE_ID, "npcSpawnCounts");
		return (counts && typeof counts === "object") ? counts : {};
	}

	_getNpcSpawnFormula(actorId) {
		const counts = this._getNpcSpawnCounts();
		const raw = counts?.[actorId];
		if (raw === undefined || raw === null) return "1";
		if (typeof raw === "number") return String(Math.max(1, Math.floor(raw)));
		if (typeof raw === "string") return this._normalizeNpcSpawnFormula(raw);
		return "1";
	}

	_normalizeNpcSpawnFormula(formula) {
		const f = String(formula ?? "").trim();
		if (!f) return "1";
		// Pure number
		if (/^\d+$/.test(f)) return String(Math.max(1, Math.floor(Number(f))));
		// NdX (allow spaces; allow missing N)
		const m = f.match(/^\s*(\d*)\s*d\s*(\d+)\s*$/i);
		if (m) {
			const n = Math.max(1, Number(m[1] || 1));
			const faces = Math.max(1, Number(m[2]));
			return `${Math.floor(n)}d${Math.floor(faces)}`;
		}
		return f;
	}

	async _setNpcSpawnFormula(actorId, formula) {
		const counts = { ...this._getNpcSpawnCounts() };
		counts[actorId] = this._normalizeNpcSpawnFormula(formula);
		await this.actor.setFlag(MODULE_ID, "npcSpawnCounts", counts);
	}

	_adjustNpcSpawnFormula(formula, delta) {
		const f = this._normalizeNpcSpawnFormula(formula);
		// Number
		if (/^\d+$/.test(f)) {
			const n = Math.max(1, Math.floor(Number(f) + delta));
			return String(n);
		}
		// NdX with optional suffix (e.g. 1d4+2) - keep suffix as-is
		const m = f.match(/^\s*(\d*)\s*d\s*(\d+)(.*)$/i);
		if (m) {
			const n0 = Math.max(1, Number(m[1] || 1));
			const faces = Math.max(1, Number(m[2]));
			const suffix = String(m[3] ?? "");
			const n = Math.max(1, Math.floor(n0 + delta));
			return `${n}d${Math.floor(faces)}${suffix}`;
		}
		// Unknown expression: leave unchanged
		return f;
	}

	async _rollNpcSpawnDesiredCount(actorId) {
		const formula = this._getNpcSpawnFormula(actorId);
		try {
			const roll = await (new Roll(formula)).evaluate({ async: true });
			const total = Math.floor(Number(roll.total));
			return Math.max(1, Number.isFinite(total) ? total : 1);
		} catch (e) {
			ui.notifications.warn(`Invalid NPC spawn formula: ${formula}`);
			return 1;
		}
	}

	/**
	 * Get member UUIDs for the party
	 * @returns {string[]}
	 */
	get memberIds() {
		return this.actor.getFlag(MODULE_ID, "members") ?? [];
	}

	/** @inheritdoc */
	async getData(options) {
		const context = await super.getData(options);

		context.config = CONFIG.SHADOWDARK;
		context.cssClass = this.actor.isOwner ? "editable" : "locked";
		context.editable = this.isEditable;
		context.owner = this.actor.isOwner;
		context.isGM = game.user.isGM;

		// Get party members data
		const memberData = await this._prepareMembers();
		context.members = memberData.all;
		context.players = memberData.players;
		context.npcs = memberData.npcs;
		context.memberCount = context.members.length;

		// Get party stats (aggregated)
		context.partyStats = this._calculatePartyStats(context.members);

		// Get shared inventory
		context.inventory = this._prepareInventory();
		context.coins = this._getPartyCoins();
		context.coinSlots = this._calculateCoinSlots();

		// Inventory slot usage (same calculation as Shadowdark player sheet)
		const maxSlotsDefault = Number(CONFIG?.SHADOWDARK?.DEFAULTS?.GEAR_SLOTS);
		const maxSlots = Number(this.actor.getFlag(MODULE_ID, "partyMaxSlots"));
		context.inventorySlots = {
			used: this._calculateInventorySlotsUsed(),
			max: Number.isFinite(maxSlots) ? maxSlots : (Number.isFinite(maxSlotsDefault) ? maxSlotsDefault : 10),
		};
		context.inventorySlots.over = context.inventorySlots.used > context.inventorySlots.max;

		// Get party description (use namespaced TextEditor when available)
		const enrichHTML = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? TextEditor.enrichHTML;
		context.descriptionHTML = await enrichHTML(
			this.actor.getFlag(MODULE_ID, "description") ?? "",
			{
				secrets: this.actor.isOwner,
				async: true,
				relativeTo: this.actor,
			}
		);

		// Prepare camping tasks for Travel tab

		context.campingTasks = await this._prepareCampingTasks(context.members);

		// Prepare travel speeds for Travel tab
		const selectedSpeed = this.actor.getFlag(MODULE_ID, "travelSpeed") ?? "normal";
		context.travelSpeeds = getTravelSpeeds().map(speed => ({
			...speed,
			selected: speed.key === selectedSpeed
		}));

		return context;
	}

	/**
	 * Prepare member data for display
	 * @returns {Promise<Object[]>}
	 */
	async _prepareMembers() {
		const members = await this.getMembers();
		const memberData = [];
		const players = [];
		const npcs = [];

		for (const member of members) {
			if (!member) continue;
			const isNPC = member.type === "NPC";
			const slotsUsed = isNPC ? 0 : this._calculateActorInventorySlotsUsed(member);
			// Use the actor's numGearSlots() method which correctly calculates max slots
			// based on STR, talents (like Hauler), and effects
			const slotsMax = isNPC ? 0 : (typeof member.numGearSlots === 'function' ? member.numGearSlots() : 10);
			const slotsFree = Math.max(0, slotsMax - slotsUsed);

			// Use UUID for compendium actors, ID for world actors (consistent with storage)
			const isCompendiumActor = member.uuid?.startsWith("Compendium.");
			const memberKey = isCompendiumActor ? member.uuid : member.id;

			const data = {
				id: member.id,
				uuid: member.uuid,
				memberKey, // The key used for storage (ID or UUID)
				name: member.name,
				img: member.img,
				isNPC,
				isCompendiumActor,
				spawnFormula: isNPC ? this._getNpcSpawnFormula(memberKey) : null,
				hp: {
					value: member.system?.attributes?.hp?.value ?? 0,
					max: member.system?.attributes?.hp?.max ?? 0
				},
				ac: member.system?.attributes?.ac?.value ?? 0,
				level: isNPC ? null : (member.system?.level?.value ?? 1),
				xp: {
					current: member.system?.level?.xp ?? 0,
					next: (member.system?.level?.value ?? 1) * 10  // Shadowdark: 10 XP per level
				},
				className: await this._getMemberClassName(member),
				ancestryName: await this._getMemberAncestryName(member),
				isOwner: member.isOwner,
				// Calculate HP percentage for visual bar
				hpPercent: Math.round(((member.system?.attributes?.hp?.value ?? 0) / (member.system?.attributes?.hp?.max ?? 1)) * 100) || 0,
				// Wave translate: HP% - 15 = translateY% (100% HP = 85% hidden, 0% HP = visible)
				hpWaveTranslate: Math.max(0, Math.round(((member.system?.attributes?.hp?.value ?? 0) / (member.system?.attributes?.hp?.max ?? 1)) * 100) - 15) || 0,
				// HP wave color based on ancestry (resolved name)
				hpWaveColor: getHpWaveColor(member, await this._getMemberAncestryName(member)),
				// HP waves enabled
				hpWavesEnabled: isHpWavesEnabled(),
				// HP wave CSS class
				hpWaveClass: (() => {
					const hpVal = member.system?.attributes?.hp?.value ?? 0;
					const hpMax = member.system?.attributes?.hp?.max ?? 1;
					const pct = Math.round((hpVal / hpMax) * 100) || 0;
					if (pct >= 100) return "hp-full";
					if (pct <= 0) return "hp-dead";
					return "";
				})(),
				// Active effects
				effects: member.effects.filter(e => !e.disabled).map(e => ({
					id: e.id,
					name: e.name,
					img: e.img || "icons/svg/aura.svg"
				})),
				slots: {
					used: slotsUsed,
					max: slotsMax,
					free: slotsFree,
				},
				// Ability modifiers
				abilities: {
					str: member.system.abilities?.str?.mod ?? this._calculateMod(member.system.abilities?.str?.base ?? 10),
					dex: member.system.abilities?.dex?.mod ?? this._calculateMod(member.system.abilities?.dex?.base ?? 10),
					con: member.system.abilities?.con?.mod ?? this._calculateMod(member.system.abilities?.con?.base ?? 10),
					int: member.system.abilities?.int?.mod ?? this._calculateMod(member.system.abilities?.int?.base ?? 10),
					wis: member.system.abilities?.wis?.mod ?? this._calculateMod(member.system.abilities?.wis?.base ?? 10),
					cha: member.system.abilities?.cha?.mod ?? this._calculateMod(member.system.abilities?.cha?.base ?? 10),
				}
			};

			memberData.push(data);
			if (isNPC) npcs.push(data);
			else players.push(data);
		}

		return { all: memberData, players, npcs };
	}

	/**
	 * Calculate ability modifier from score
	 * @param {number} score
	 * @returns {number}
	 */
	_calculateMod(score) {
		if (score >= 1 && score <= 3) return -4;
		if (score >= 4 && score <= 5) return -3;
		if (score >= 6 && score <= 7) return -2;
		if (score >= 8 && score <= 9) return -1;
		if (score >= 10 && score <= 11) return 0;
		if (score >= 12 && score <= 13) return 1;
		if (score >= 14 && score <= 15) return 2;
		if (score >= 16 && score <= 17) return 3;
		if (score >= 18) return 4;
		return 0;
	}

	/**
	 * Get member's class name
	 * @param {Actor} member
	 * @returns {Promise<string>}
	 */
	async _getMemberClassName(member) {
		if (!member.system.class) return "";
		const classItem = await fromUuid(member.system.class);
		return classItem?.name ?? "";
	}

	/**
	 * Get the ancestry name for a party member
	 * @param {Actor} member
	 * @returns {Promise<string>}
	 */
	async _getMemberAncestryName(member) {
		if (!member.system.ancestry) return "";
		const ancestryItem = await fromUuid(member.system.ancestry);
		return ancestryItem?.name ?? "";
	}

	/**
	 * Calculate aggregated party statistics
	 * @param {Object[]} members
	 * @returns {Object}
	 */
	_calculatePartyStats(members) {
		if (members.length === 0) {
			return {
				totalHp: 0,
				maxHp: 0,
				avgAc: 0,
				avgLevel: 0
			};
		}

		const totalHp = members.reduce((sum, m) => sum + m.hp.value, 0);
		const maxHp = members.reduce((sum, m) => sum + m.hp.max, 0);
		const avgAc = Math.round(members.reduce((sum, m) => sum + m.ac, 0) / members.length);
		const levelMembers = members.filter(m => !m.isNPC && Number.isFinite(Number(m.level)));
		const avgLevel = levelMembers.length
			? Math.round(levelMembers.reduce((sum, m) => sum + Number(m.level), 0) / levelMembers.length)
			: 0;

		return { totalHp, maxHp, avgAc, avgLevel };
	}

	/**
	 * Prepare camping tasks data for the Travel tab
	 * @param {Object[]} membersData - Prepared members data
	 * @returns {Promise<Object[]>}
	 */
	async _prepareCampingTasks(membersData) {
		const assignments = this.actor.getFlag(MODULE_ID, "travelAssignments") ?? {};
		const dcs = this.actor.getFlag(MODULE_ID, "travelDCs") ?? {};
		const selections = this.actor.getFlag(MODULE_ID, "travelSelections") ?? {};
		const campingTasks = getCampingTasks();

		return campingTasks.map(task => {
			const dc = dcs[task.key] ?? 12;
			const assignedMemberIds = assignments[task.key] ?? [];
			const assignedMembers = assignedMemberIds
				.map(memberId => membersData.find(m => m.memberKey === memberId || m.id === memberId))
				.filter(m => m !== undefined);

			// Filter out empty strings from abilities
			const abilities = (task.abilities || []).filter(ab => ab && ab.trim());
			return {
				key: task.key,
				name: task.name,
				abilities: abilities,
				abilitiesText: abilities.join(" / "),
				campfire: task.campfire,
				bannerImage: task.bannerImage || "",
				dc,
				assignedMembers: assignedMembers.map(m => {
					const selectionIdx = selections[task.key]?.[m.memberKey] ?? 0;
					const selectedAbility = abilities[selectionIdx] || abilities[0] || "";
					return {
						...m,
						isOwner: this._canUserMoveMember(m),
						selectedAbility: selectedAbility.toUpperCase(),
						selectionIdx
					};
				})
			};
		});
	}

	/**
	 * Check if current user can move a member in travel assignments
	 * @param {Object} memberData - Member data object
	 * @returns {boolean}
	 */
	_canUserMoveMember(memberData) {
		if (game.user.isGM) return true;
		if (!memberData) return false;
		// Check if user owns the actor
		const actor = game.actors.get(memberData.id);
		return actor?.isOwner ?? false;
	}

	/**
	 * Get travel task assignments
	 * @returns {Object}
	 */
	_getTravelAssignments() {
		return this.actor.getFlag(MODULE_ID, "travelAssignments") ?? {};
	}

	/**
	 * Set travel task assignments
	 * @param {Object} assignments
	 */
	async _setTravelAssignments(assignments) {
		await this.actor.setFlag(MODULE_ID, "travelAssignments", assignments);
	}

	/**
	 * Assign a member to a camping task
	 * @param {string} taskKey - The task key
	 * @param {string} memberId - The member ID or key
	 */
	async _assignMemberToTask(taskKey, memberId) {
		const assignments = { ...this._getTravelAssignments() };

		// Remove from any existing task first
		for (const key of Object.keys(assignments)) {
			if (Array.isArray(assignments[key])) {
				assignments[key] = assignments[key].filter(id => id !== memberId);
			}
		}

		// Add to new task
		if (!Array.isArray(assignments[taskKey])) {
			assignments[taskKey] = [];
		}
		if (!assignments[taskKey].includes(memberId)) {
			assignments[taskKey].push(memberId);
		}

		await this._setTravelAssignments(assignments);
	}

	/**
	 * Remove a member from a camping task
	 * @param {string} taskKey - The task key
	 * @param {string} memberId - The member ID or key
	 */
	async _removeMemberFromTask(taskKey, memberId) {
		const assignments = { ...this._getTravelAssignments() };
		if (Array.isArray(assignments[taskKey])) {
			assignments[taskKey] = assignments[taskKey].filter(id => id !== memberId);
		}
		await this._setTravelAssignments(assignments);
	}

	/**
	 * Reset all travel assignments
	 */
	async _resetTravelAssignments() {
		await this.actor.unsetFlag(MODULE_ID, "travelAssignments");
	}

	/** @inheritdoc */
	_onDragStart(event) {
		const target = event.currentTarget;

		// Check if this is a member being dragged (for dropping on canvas to create token)
		if (target.classList.contains("member") || target.closest(".member") || target.classList.contains("sdx-task-member") || target.closest(".sdx-task-member")) {
			const memberEl = target.closest(".member") || target.closest(".sdx-task-member");
			const uuid = memberEl?.dataset?.uuid;

			if (uuid) {
				// Set drag data as Actor type so Foundry creates a token on canvas drop
				const dragData = {
					type: "Actor",
					uuid: uuid
				};
				event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
				return;
			}
		}

		// Fall back to default behavior for items
		return super._onDragStart(event);
	}

	/** @inheritdoc */
	async _onDrop(event) {
		const getDragEventData = foundry?.applications?.ux?.TextEditor?.implementation?.getDragEventData ?? TextEditor.getDragEventData;
		const data = getDragEventData(event);

		// Handle drop on travel task
		const travelTarget = event.target.closest(".sdx-camping-task");
		if (travelTarget && data?.type === "Actor") {
			event.preventDefault(); // Stop propagation
			const taskKey = travelTarget.dataset.taskKey;

			if (!taskKey) return;

			// Get the actor
			const dropped = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
			if (!dropped) return;

			// Check if actor is in party
			// Use UUID for compendium actors, ID for world actors to match storage
			const isCompendiumActor = dropped.uuid?.startsWith("Compendium.");
			const memberKey = isCompendiumActor ? dropped.uuid : dropped.id;

			if (!this.memberIds.includes(memberKey)) {
				ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.travel.warn_not_member"));
				return;
			}

			// Check ownership
			if (!dropped.isOwner && !game.user.isGM) {
				ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.travel.warn_not_owner"));
				return;
			}

			// Assign to task
			await this._assignMemberToTask(taskKey, memberKey);
			return;
		}

		if (data?.type === "Actor") {
			if (!this.actor.isOwner) return;
			const dropped = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
			if (!dropped) return;
			if (dropped.type !== "Player" && dropped.type !== "NPC") return;
			if (dropped.id === this.actor.id) return;

			// Use UUID for compendium actors, ID for world actors
			// Compendium UUIDs contain "Compendium." prefix
			const isCompendiumActor = dropped.uuid?.startsWith("Compendium.");
			const memberKey = isCompendiumActor ? dropped.uuid : dropped.id;

			// Check if already a member - handle reordering
			if (this.memberIds.includes(memberKey)) {
				const targetMemberEl = event.target.closest(".member");
				if (targetMemberEl) {
					const targetKey = targetMemberEl.dataset.memberId;
					if (targetKey && targetKey !== memberKey) {
						await this._reorderMember(memberKey, targetKey);
					}
				}
				return;
			}

			const next = Array.from(new Set([...this.memberIds, memberKey]));

			// Enforce sorting on add (Players first)
			// We need to fetch all members to sort them
			const currentMembers = await this.getMembers();
			const newMember = dropped;
			const allMembers = [...currentMembers, newMember];

			allMembers.sort((a, b) => {
				if (a.type === "Player" && b.type === "NPC") return -1;
				if (a.type === "NPC" && b.type === "Player") return 1;
				return 0;
			});

			const nextIds = allMembers.map(m => m.uuid?.startsWith("Compendium.") ? m.uuid : m.id);

			await this.actor.setFlag(MODULE_ID, "members", nextIds);
			if (dropped.type === "NPC") {
				const counts = this._getNpcSpawnCounts();
				// Use the same key for NPC spawn counts
				if (counts[memberKey] === undefined) await this._setNpcSpawnFormula(memberKey, "1");
			}
			return;
		}

		return super._onDrop(event);
	}

	/**
	 * Reorder a member in the list
	 * @param {string} sourceKey 
	 * @param {string} targetKey 
	 */
	async _reorderMember(sourceKey, targetKey) {
		const members = await this.getMembers();
		const sourceIndex = members.findIndex(m => (m.uuid === sourceKey || m.id === sourceKey));
		if (sourceIndex === -1) return;

		const sourceMember = members[sourceIndex];

		// Remove source
		members.splice(sourceIndex, 1);

		// Find target index in the array without source
		// We need to check uuid or id
		const targetIndex = members.findIndex(m => (m.uuid === targetKey || m.id === targetKey));

		if (targetIndex !== -1) {
			members.splice(targetIndex, 0, sourceMember);
		} else {
			members.push(sourceMember);
		}

		// Enforce Player -> NPC sorting
		members.sort((a, b) => {
			if (a.type === "Player" && b.type === "NPC") return -1;
			if (a.type === "NPC" && b.type === "Player") return 1;
			return 0;
		});

		const nextIds = members.map(m => m.uuid?.startsWith("Compendium.") ? m.uuid : m.id);
		await this.actor.setFlag(MODULE_ID, "members", nextIds);
	}

	/**
	 * Prepare party shared inventory
	 * @returns {Object}
	 */
	_prepareInventory() {
		const inventory = [];
		const treasure = [];
		const freeCarrySeen = {};

		// Check if unidentified feature is enabled
		let unidentifiedEnabled = false;
		try {
			unidentifiedEnabled = game.settings.get(MODULE_ID, "enableUnidentified");
		} catch {
			// Setting not registered yet
		}

		for (const item of this.actor.items) {
			if (!item.system.isPhysical) continue;

			const itemData = item.toObject();
			itemData.uuid = item.uuid;

			// Handle unidentified items - mask name for non-GM users
			const isUnidentified = unidentifiedEnabled && Boolean(item.getFlag(MODULE_ID, "unidentified"));
			itemData.isUnidentified = isUnidentified;
			if (isUnidentified && !game.user.isGM) {
				const customName = item.getFlag(MODULE_ID, "unidentifiedName");
				itemData.displayName = (customName && customName.trim())
					? customName.trim()
					: game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
			} else {
				itemData.displayName = item.name;
			}

			itemData.showQuantity = item.system.quantity > 1 ||
				item.system.isAmmunition ||
				(item.system.slots?.per_slot > 1);
			itemData.slotsCost = this._calculateItemSlotsCost(item, freeCarrySeen);

			// Light source handling
			itemData.isLightSource = ["Basic", "Effect"].includes(item.type) && item.system.light?.isSource;
			itemData.lightActive = itemData.isLightSource && item.system.light?.active;

			if (item.system.treasure) {
				treasure.push(itemData);
			} else {
				inventory.push(itemData);
			}
		}

		inventory.sort((a, b) => a.name.localeCompare(b.name));
		treasure.sort((a, b) => a.name.localeCompare(b.name));

		return { items: inventory, treasure };
	}

	_calculateItemSlotsCost(item, freeCarrySeen) {
		if (!item?.system?.isPhysical) return 0;
		if (item.type === "Gem") return 0;
		if (item.system.stashed) return 0;

		let freeCarry = Number(item.system?.slots?.free_carry) || 0;
		const nameKey = String(item.name || "");
		const alreadySeen = Number(freeCarrySeen?.[nameKey]) || 0;
		freeCarry = Math.max(0, freeCarry - alreadySeen);
		freeCarrySeen[nameKey] = alreadySeen + freeCarry;

		const perSlot = Number(item.system?.slots?.per_slot) || 1;
		const quantity = Number(item.system?.quantity) || 1;
		const slotsUsed = Number(item.system?.slots?.slots_used) || 0;
		let slotsForItem = Math.ceil(quantity / perSlot) * slotsUsed;
		slotsForItem -= freeCarry * slotsUsed;

		if (!Number.isFinite(slotsForItem)) return 0;
		return slotsForItem;
	}

	/**
	 * Get party coins
	 * @returns {Object}
	 */
	_getPartyCoins() {
		return {
			gp: this.actor.getFlag(MODULE_ID, "coins.gp") ?? 0,
			sp: this.actor.getFlag(MODULE_ID, "coins.sp") ?? 0,
			cp: this.actor.getFlag(MODULE_ID, "coins.cp") ?? 0
		};
	}

	/**
	 * Calculate how many slots the party coins occupy
	 * 1 slot per 100 coins total (regardless of type)
	 * @returns {number}
	 */
	_calculateCoinSlots() {
		const coins = this._getPartyCoins();
		const gp = Math.max(0, parseInt(coins.gp) || 0);
		const sp = Math.max(0, parseInt(coins.sp) || 0);
		const cp = Math.max(0, parseInt(coins.cp) || 0);

		// Total number of coins
		const totalCoins = gp + sp + cp;

		// 1 slot per 100 coins, rounded down
		return Math.floor(totalCoins / 100);
	}

	_calculateActorInventorySlotsUsed(actor) {
		if (!actor) return 0;
		const freeCarrySeen = {};
		let total = 0;
		for (const item of actor.items) {
			total += this._calculateItemSlotsCost(item, freeCarrySeen);
		}
		// Add coin slots for this actor
		total += this._calculateActorCoinSlots(actor);
		return total;
	}

	/**
	 * Calculate how many slots an actor's coins occupy
	 * 1 slot per 100 coins total (regardless of type)
	 * @param {Actor} actor - The actor to calculate coin slots for
	 * @returns {number}
	 */
	_calculateActorCoinSlots(actor) {
		if (!actor?.system?.coins) return 0;
		const coins = actor.system.coins;
		const gp = Math.max(0, parseInt(coins.gp) || 0);
		const sp = Math.max(0, parseInt(coins.sp) || 0);
		const cp = Math.max(0, parseInt(coins.cp) || 0);

		// Total number of coins
		const totalCoins = gp + sp + cp;

		// 1 slot per 100 coins, rounded down
		return Math.floor(totalCoins / 100);
	}

	_calculateInventorySlotsUsed() {
		const freeCarrySeen = {};
		let total = 0;
		for (const item of this.actor.items) {
			total += this._calculateItemSlotsCost(item, freeCarrySeen);
		}
		// Add coin slots
		total += this._calculateCoinSlots();
		return total;
	}

	/** @inheritdoc */
	activateListeners(html) {
		super.activateListeners(html);

		// Member interactions
		html.find("[data-action='open-member']").click(this._onOpenMember.bind(this));
		html.find("[data-action='remove-member']").click(this._onRemoveMember.bind(this));
		html.find("[data-action='place-members']").click(this._onPlaceMembers.bind(this));
		html.find("[data-action='reward-xp']").click(this._onRewardXp.bind(this));
		html.find("[data-action='reward-coins']").click(this._onRewardCoins.bind(this));
		html.find("[data-action='sync-lights']").click(this._onSyncLights.bind(this));
		html.find("[data-action='roll-weather']").click(this._onRollWeather.bind(this));
		html.find("[data-action='change-travel-speed']").change(this._onChangeTravelSpeed.bind(this));

		// XP controls
		html.find("[data-action='xp-increment']").click(this._onXpIncrement.bind(this));
		html.find("[data-action='xp-decrement']").click(this._onXpDecrement.bind(this));

		// NPC spawn count controls
		html.find("[data-action='npc-count-increment']").click(this._onNpcCountIncrement.bind(this));
		html.find("[data-action='npc-count-decrement']").click(this._onNpcCountDecrement.bind(this));
		html.find("[data-action='npc-count-change']").change(this._onNpcCountChange.bind(this));

		// Inventory interactions
		html.find("[data-action='create-item']").click(this._onCreateItem.bind(this));
		html.find("[data-action='configure-party-slots']").click(this._onConfigurePartySlots.bind(this));
		html.find("[data-action='item-increment']").click(this._onItemIncrement.bind(this));
		html.find("[data-action='item-decrement']").click(this._onItemDecrement.bind(this));
		html.find("[data-action='toggle-light']").click(this._onToggleLightSource.bind(this));
		html.find(".item-image").click(this._onItemChat.bind(this));
		html.find(".item-name[data-action='show-details']").click(
			event => shadowdark.utils.toggleItemDetails(event.currentTarget)
		);

		// Item context menu
		this._itemContextMenu(html.get(0));

		// Coin inputs
		html.find(".coin-value").change(this._onCoinChange.bind(this));
		html.find("[data-action='add-coins']").click(this._onAddCoins.bind(this));
		html.find("[data-action='divide-coins']").click(this._onDivideCoins.bind(this));

		// Description editing
		html.find("[data-action='edit-description']").click(this._onEditDescription.bind(this));

		// Travel Tab interactions
		html.find("[data-action='reset-travel']").click(this._onResetTravel.bind(this));
		html.find("[data-action='remove-travel-member']").click(this._onRemoveTravelMember.bind(this));

		// Travel Rolling

		html.find(".sdx-task-dc").change(this._onChangeTravelDC.bind(this));
		html.find(".sdx-task-header").click(this._onRollTravelTask.bind(this));
		html.find(".sdx-task-member").contextmenu(this._onToggleTravelAbility.bind(this));
	}

	async _onSyncLights(event) {
		event.preventDefault();
		ui.notifications.info("Syncing party token lights...");
		await syncPartyTokenLight(this.actor);
	}

	async _onDivideCoins(event) {
		event.preventDefault();
		if (!game.user.isGM) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_gm_only"));
			return;
		}

		// Filter to only include Player type actors (exclude NPCs)
		const members = this.members.filter(m => m.type === "Player");
		if (members.length === 0) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_no_members"));
			return;
		}

		const treasury = this._getPartyCoins();
		const gp = Math.max(0, parseInt(treasury.gp) || 0);
		const sp = Math.max(0, parseInt(treasury.sp) || 0);
		const cp = Math.max(0, parseInt(treasury.cp) || 0);

		const n = members.length;
		const each = {
			gp: Math.floor(gp / n),
			sp: Math.floor(sp / n),
			cp: Math.floor(cp / n),
		};
		const remainder = {
			gp: gp - each.gp * n,
			sp: sp - each.sp * n,
			cp: cp - each.cp * n,
		};

		const distributedTotal = each.gp * n + each.sp * n + each.cp * n;
		if (distributedTotal === 0) {
			ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_nothing"));
			return;
		}

		const gpLabel = game.i18n.localize("SHADOWDARK.coins.gp");
		const spLabel = game.i18n.localize("SHADOWDARK.coins.sp");
		const cpLabel = game.i18n.localize("SHADOWDARK.coins.cp");
		const memberLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_member");

		const rows = members
			.map(m => `
				<tr>
					<td class="member">${foundry.utils.escapeHTML(m.name)}</td>
					<td class="num">${each.gp}</td>
					<td class="num">${each.sp}</td>
					<td class="num">${each.cp}</td>
				</tr>
			`)
			.join("");

		const content = `
			<div class="shadowdark-extras-divide-coins">
				<p>${game.i18n.format("SHADOWDARK_EXTRAS.party.divide_coins_prompt", { count: n })}</p>
				<table>
					<thead>
						<tr>
							<th>${memberLabel}</th>
							<th>${gpLabel}</th>
							<th>${spLabel}</th>
							<th>${cpLabel}</th>
						</tr>
					</thead>
					<tbody>
						${rows}
					</tbody>
				</table>
				<p class="remainder">
					${game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_remainder")}: ${remainder.gp} ${gpLabel}, ${remainder.sp} ${spLabel}, ${remainder.cp} ${cpLabel}
				</p>
			</div>
		`;

		const confirmed = await new Promise((resolve) => {
			new Dialog({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_title"),
				content,
				buttons: {
					confirm: {
						label: game.i18n.localize("SHADOWDARK_EXTRAS.party.divide_coins_confirm"),
						callback: () => resolve(true),
					},
					cancel: {
						label: game.i18n.localize("SHADOWDARK_EXTRAS.party.cancel"),
						callback: () => resolve(false),
					},
				},
				default: "confirm",
				close: () => resolve(false),
			}).render(true);
		});

		if (!confirmed) return;

		// Update treasury first (remainder stays)
		await this.actor.setFlag(MODULE_ID, "coins.gp", remainder.gp);
		await this.actor.setFlag(MODULE_ID, "coins.sp", remainder.sp);
		await this.actor.setFlag(MODULE_ID, "coins.cp", remainder.cp);

		// Update member coins
		const updates = members.map(m => {
			const coins = m.system?.coins ?? {};
			return {
				_id: m.id,
				"system.coins.gp": (Number(coins.gp) || 0) + each.gp,
				"system.coins.sp": (Number(coins.sp) || 0) + each.sp,
				"system.coins.cp": (Number(coins.cp) || 0) + each.cp,
			};
		});
		await Actor.updateDocuments(updates);
		this.render();
	}

	async _onConfigurePartySlots(event) {
		event.preventDefault();
		if (!this.actor.isOwner) return;

		const currentRaw = Number(this.actor.getFlag(MODULE_ID, "partyMaxSlots"));
		const defaultRaw = Number(CONFIG?.SHADOWDARK?.DEFAULTS?.GEAR_SLOTS);
		const current = Number.isFinite(currentRaw) ? currentRaw : (Number.isFinite(defaultRaw) ? defaultRaw : 10);

		const title = game.i18n.localize("SHADOWDARK_EXTRAS.party.slots.configure_title");
		const content = `
			<form class="shadowdark-extras-party-slots">
				<div class="form-group">
					<label>${game.i18n.localize("SHADOWDARK_EXTRAS.party.slots.max_label")}</label>
					<input type="number" name="maxSlots" value="${current}" min="0" step="1" />
				</div>
			</form>
		`;

		const result = await new Promise((resolve) => {
			new Dialog({
				title,
				content,
				buttons: {
					save: {
						label: game.i18n.localize("SHADOWDARK_EXTRAS.party.save"),
						callback: (html) => {
							const value = Number(html.find('input[name="maxSlots"]').val());
							resolve(value);
						},
					},
					cancel: {
						label: game.i18n.localize("SHADOWDARK_EXTRAS.party.cancel"),
						callback: () => resolve(null),
					},
				},
				default: "save",
				close: () => resolve(null),
			}).render(true);
		});

		if (result === null) return;
		const next = Math.max(0, Math.floor(Number(result) || 0));
		await this.actor.setFlag(MODULE_ID, "partyMaxSlots", next);
		this.render();
	}

	/**
	 * Create item context menu
	 * @param {HTMLElement} html
	 */
	_itemContextMenu(html) {
		new foundry.applications.ux.ContextMenu.implementation(
			html,
			".inventory-main .item",
			this._getItemContextOptions(),
			{ jQuery: false }
		);
	}

	/**
	 * Get context menu options for items
	 * @returns {Object[]}
	 */
	_getItemContextOptions() {
		return [
			{
				name: game.i18n.localize("SHADOWDARK.sheet.general.item_edit.title"),
				icon: '<i class="fas fa-edit"></i>',
				condition: () => this.actor.isOwner,
				callback: element => {
					const itemId = element.dataset.itemId;
					const item = this.actor.items.get(itemId);
					return item?.sheet.render(true);
				},
			},
			{
				name: game.i18n.localize("SHADOWDARK.sheet.general.item_delete.title"),
				icon: '<i class="fas fa-trash"></i>',
				condition: () => this.actor.isOwner,
				callback: element => {
					const itemId = element.dataset.itemId;
					this.actor.deleteEmbeddedDocuments("Item", [itemId]);
				},
			},
			{
				name: game.i18n.localize("SHADOWDARK_EXTRAS.party.transfer_to_member"),
				icon: '<i class="fas fa-share"></i>',
				condition: () => this.actor.isOwner && this.members.length > 0,
				callback: element => this._onTransferItem(element),
			},
		];
	}

	/**
	 * Handle dropping an actor onto the party sheet
	 * @inheritdoc
	 */
	async _onDropActor(event, data) {
		if (!this.actor.isOwner) return false;

		const actor = await fromUuid(data.uuid);
		if (!actor) return false;

		// Only allow Player and NPC type actors
		if (actor.type !== "Player" && actor.type !== "NPC") {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.only_players"));
			return false;
		}

		// Use UUID for compendium actors, ID for world actors
		const isCompendiumActor = actor.uuid?.startsWith("Compendium.");
		const memberKey = isCompendiumActor ? actor.uuid : actor.id;

		// Check if actor is already a member
		const memberIds = this.memberIds;
		if (memberIds.includes(memberKey)) {
			ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.already_member"));
			return false;
		}

		// Add member
		memberIds.push(memberKey);
		await this.actor.setFlag(MODULE_ID, "members", memberIds);

		// Set NPC spawn formula if NPC
		if (actor.type === "NPC") {
			const counts = this._getNpcSpawnCounts();
			if (counts[memberKey] === undefined) await this._setNpcSpawnFormula(memberKey, "1");
		}

		ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.party.member_added", { name: actor.name }));
		return true;
	}

	/**
	 * Handle dropping an item onto the party sheet
	 * @inheritdoc
	 */
	async _onDropItem(event, data) {
		if (!this.actor.isOwner) return false;

		const item = await fromUuid(data.uuid);
		if (!item) return false;

		// Check if item is being dropped on a member (for transfer)
		const memberElement = event.target.closest(".member[data-uuid]");
		if (memberElement) {
			const memberUuid = memberElement.dataset.uuid;
			const member = await fromUuid(memberUuid);
			if (member && member.isOwner) {
				const move = item.parent === this.actor;
				await this._transferItemToActor(item, member, { move });

				// Mask item name if unidentified and user is not GM
				const isUnidentified = item.getFlag(MODULE_ID, "unidentified");
				const displayName = (isUnidentified && !game.user.isGM)
					? game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label")
					: item.name;

				ui.notifications.info(
					game.i18n.format("SHADOWDARK_EXTRAS.party.item_transferred", {
						item: displayName,
						member: member.name,
					})
				);
				return true;
			}
		}

		// Standard item drop to party inventory
		return super._onDropItem(event, data);
	}

	_isContainerItem(item) {
		return item?.type === "Basic" && Boolean(item.getFlag?.(MODULE_ID, "isContainer"));
	}

	_getContainedItems(containerItem) {
		const actor = containerItem?.parent;
		if (!actor) return [];
		return actor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === containerItem.id);
	}

	_calculateSlotsFromItemData(itemData) {
		const system = itemData?.system ?? {};
		const qty = Math.max(0, Number(system.quantity ?? 1) || 0);
		const perSlot = Math.max(1, Number(system.slots?.per_slot ?? 1) || 1);
		const slotsUsed = Math.max(0, Number(system.slots?.slots_used ?? 1) || 0);
		return Math.ceil(qty / perSlot) * slotsUsed;
	}

	async _transferItemToActor(item, targetActor, { move }) {
		if (!item || !targetActor) return;
		const targetIsItemPiles = Boolean(targetActor.getFlag?.("item-piles", "data")?.enabled);

		// Non-container: default behavior
		if (!this._isContainerItem(item) || !item.parent) {
			const itemData = item.toObject();
			await targetActor.createEmbeddedDocuments("Item", [itemData]);
			if (move) await item.delete();
			return;
		}

		// Container transfer/copy
		const sourceActor = item.parent;
		const contained = this._getContainedItems(item);
		const containerData = item.toObject();
		// Clear the packed items to prevent the createItem hook from unpacking them
		// (we will manually create the contained items from the source actor's embedded items)
		if (containerData.flags?.[MODULE_ID]) {
			containerData.flags[MODULE_ID].containerPackedItems = [];
			// Also clear the unpacked flags
			delete containerData.flags[MODULE_ID].containerUnpacked;
			delete containerData.flags[MODULE_ID].containerUnpackedOnActor;
		}
		const [createdContainer] = await targetActor.createEmbeddedDocuments("Item", [containerData]);
		if (!createdContainer) {
			if (move) return;
			return;
		}

		const childData = contained.map(child => {
			const data = child.toObject();
			data.flags = data.flags ?? {};
			data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
			data.flags[MODULE_ID].containerId = createdContainer.id;
			// Keep hidden while contained
			data.system = data.system ?? {};
			data.system.isPhysical = false;
			// Ensure we can restore if removed later
			if (data.flags[MODULE_ID].containerOrigIsPhysical === undefined) data.flags[MODULE_ID].containerOrigIsPhysical = true;
			// Let Foundry assign fresh IDs
			delete data._id;
			return data;
		});

		// If the target is an Item Piles actor, do not create embedded contained items.
		// Keep contents packed on the container item only.
		if (!targetIsItemPiles && childData.length) {
			await targetActor.createEmbeddedDocuments("Item", childData, { sdxInternal: true });
		}

		// For Item Piles targets, restore the packed items since we cleared them
		if (targetIsItemPiles && contained.length) {
			// Rebuild packed data from source contained items
			const packedData = contained.map(child => {
				const data = child.toObject();
				delete data._id;
				data.flags = data.flags ?? {};
				data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
				data.flags[MODULE_ID].containerId = null;
				data.system = data.system ?? {};
				data.system.isPhysical = false;
				return data;
			});
			await createdContainer.setFlag(MODULE_ID, "containerPackedItems", packedData);
		}

		// Update container slot cost to reflect contents
		const baseSlotsUsed = Number(createdContainer.system?.slots?.slots_used ?? 1) || 1;
		const containedSlots = childData.reduce((sum, d) => sum + this._calculateSlotsFromItemData(d), 0);
		await createdContainer.update({
			"system.slots.slots_used": Math.max(baseSlotsUsed, containedSlots),
		}, { sdxInternal: true });

		if (move) {
			// Delete children first so deleteItem hook doesn't try to "release" them
			for (const child of contained) {
				await child.delete({ sdxInternal: true });
			}
			await item.delete({ sdxInternal: true });
		}
	}

	/**
	 * Open a member's character sheet
	 * @param {Event} event
	 */
	async _onOpenMember(event) {
		event.preventDefault();
		const uuid = event.currentTarget.closest("[data-uuid]")?.dataset.uuid;
		if (!uuid) return;

		const actor = await fromUuid(uuid);
		actor?.sheet.render(true);
	}

	/**
	 * Remove a member from the party
	 * @param {Event} event
	 */
	async _onRemoveMember(event) {
		event.preventDefault();
		event.stopPropagation();

		if (!this.actor.isOwner) return;

		const memberElement = event.currentTarget.closest("[data-uuid]");
		const memberKey = memberElement?.dataset.memberId;
		if (!memberKey) return;

		// Get the actor - try world actor first, then UUID
		let member = game.actors.get(memberKey);
		if (!member && memberKey.includes(".")) {
			try {
				member = await fromUuid(memberKey);
			} catch {
				// Ignore
			}
		}
		const memberName = member?.name ?? "Unknown";

		const confirmed = await Dialog.confirm({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.remove_member"),
			content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.party.confirm_remove", { name: memberName })}</p>`,
		});
		if (!confirmed) return;

		const memberIds = this.memberIds.filter(id => id !== memberKey);
		await this.actor.setFlag(MODULE_ID, "members", memberIds);

		if (member?.type === "NPC") {
			const counts = { ...this._getNpcSpawnCounts() };
			if (counts[memberKey] !== undefined) {
				delete counts[memberKey];
				await this.actor.setFlag(MODULE_ID, "npcSpawnCounts", counts);
			}
		}

		ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.party.member_removed", { name: memberName }));
	}

	/**
	 * Increment member XP
	 * @param {Event} event
	 */
	async _onXpIncrement(event) {
		event.preventDefault();
		event.stopPropagation();

		const memberKey = event.currentTarget.dataset.memberId;
		const member = await this._getActorFromKey(memberKey);
		if (!member || !member.isOwner) return;

		const currentXp = member.system.level?.xp ?? 0;
		await member.update({ "system.level.xp": currentXp + 1 });
	}

	/**
	 * Decrement member XP
	 * @param {Event} event
	 */
	async _onXpDecrement(event) {
		event.preventDefault();
		event.stopPropagation();

		const memberKey = event.currentTarget.dataset.memberId;
		const member = await this._getActorFromKey(memberKey);
		if (!member || !member.isOwner) return;

		const currentXp = member.system.level?.xp ?? 0;
		if (currentXp > 0) {
			await member.update({ "system.level.xp": currentXp - 1 });
		}
	}

	async _onNpcCountIncrement(event) {
		event.preventDefault();
		event.stopPropagation();
		if (!this.actor.isOwner) return;

		const memberKey = event.currentTarget.dataset.memberId;
		const member = await this._getActorFromKey(memberKey);
		if (!member || member.type !== "NPC") return;

		const current = this._getNpcSpawnFormula(memberKey);
		await this._setNpcSpawnFormula(memberKey, this._adjustNpcSpawnFormula(current, +1));
	}

	async _onNpcCountDecrement(event) {
		event.preventDefault();
		event.stopPropagation();
		if (!this.actor.isOwner) return;

		const memberKey = event.currentTarget.dataset.memberId;
		const member = await this._getActorFromKey(memberKey);
		if (!member || member.type !== "NPC") return;

		const current = this._getNpcSpawnFormula(memberKey);
		await this._setNpcSpawnFormula(memberKey, this._adjustNpcSpawnFormula(current, -1));
	}

	async _onNpcCountChange(event) {
		event.preventDefault();
		event.stopPropagation();
		if (!this.actor.isOwner) return;

		const memberKey = event.currentTarget.dataset.memberId;
		const member = await this._getActorFromKey(memberKey);
		if (!member || member.type !== "NPC") return;

		const value = String(event.currentTarget.value ?? "");
		await this._setNpcSpawnFormula(memberKey, value);
		// Normalize UI in case of invalid input
		this.render(false);
	}

	/**
	 * Place all party members on the canvas one by one with crosshair targeting
	 * @param {Event} event
	 */
	async _onPlaceMembers(event) {
		event.preventDefault();

		if (!canvas.scene) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.no_scene"));
			return;
		}

		const allMembers = await this.getMembers();
		if (allMembers.length === 0) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.no_members"));
			return;
		}

		// Check what types of members we have
		const hasPlayers = allMembers.some(m => m.type === "Player");
		const hasNpcs = allMembers.some(m => m.type === "NPC");

		// If we have both types, show a selection dialog
		let filter = "all";
		if (hasPlayers && hasNpcs) {
			filter = await new Promise((resolve) => {
				new Dialog({
					title: game.i18n.localize("SHADOWDARK_EXTRAS.party.place_tokens_title"),
					content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.party.place_tokens_prompt")}</p>`,
					buttons: {
						all: {
							icon: '<i class="fas fa-users"></i>',
							label: game.i18n.localize("SHADOWDARK_EXTRAS.party.place_all"),
							callback: () => resolve("all")
						},
						players: {
							icon: '<i class="fas fa-user"></i>',
							label: game.i18n.localize("SHADOWDARK_EXTRAS.party.place_players"),
							callback: () => resolve("players")
						},
						npcs: {
							icon: '<i class="fas fa-dragon"></i>',
							label: game.i18n.localize("SHADOWDARK_EXTRAS.party.place_npcs"),
							callback: () => resolve("npcs")
						}
					},
					default: "all",
					close: () => resolve(null)
				}).render(true);
			});

			if (!filter) return; // User closed the dialog
		}

		// Filter members based on selection
		const members = filter === "players" ? allMembers.filter(m => m.type === "Player")
			: filter === "npcs" ? allMembers.filter(m => m.type === "NPC")
				: allMembers;

		// Build list of members to place
		// PCs: place once. NPCs: roll configured formula and place that many.
		const membersToPlace = [];
		for (const member of members) {
			// Use UUID for compendium actors, ID for world actors
			const isCompendiumActor = member.uuid?.startsWith("Compendium.");
			const memberKey = isCompendiumActor ? member.uuid : member.id;

			if (member.type === "Player") {
				membersToPlace.push(member);
				continue;
			}
			if (member.type === "NPC") {
				const desired = await this._rollNpcSpawnDesiredCount(memberKey);
				for (let i = 0; i < desired; i++) membersToPlace.push(member);
			}
		}

		if (membersToPlace.length === 0) {
			ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.party.all_members_present"));
			return;
		}

		// Minimize the sheet to allow canvas interaction
		this.minimize();

		let placedCount = 0;

		// Place each token one by one
		for (const member of membersToPlace) {
			const placed = await this._placeTokenWithPreview(member);
			if (placed) {
				placedCount++;
			} else {
				// User cancelled, stop placing
				break;
			}
		}

		// Restore the sheet
		this.maximize();

		if (placedCount > 0) {
			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.party.members_placed", { count: placedCount })
			);
		}
	}

	/**
	 * Place a single token with crosshair preview
	 * @param {Actor} member - The actor to place
	 * @returns {Promise<boolean>} - Whether the token was placed
	 */
	async _placeTokenWithPreview(member) {
		// For compendium actors, we need to import them to the world first
		let actorToPlace = member;
		const isCompendiumActor = member.uuid?.startsWith("Compendium.");

		if (isCompendiumActor) {
			// Check if already imported by looking for an actor with same name and compendium source
			let existingActor = game.actors.find(a =>
				a.name === member.name &&
				a.flags?.core?.sourceId === member.uuid
			);

			if (!existingActor) {
				// Import the actor from compendium
				try {
					const imported = await Actor.implementation.create(member.toObject());
					if (imported) {
						// Record the compendium source on the imported actor without using the deprecated core.sourceId flag
						try {
							await imported.update({ "_stats.compendiumSource": member.uuid });
						} catch {
							// Fallback to writing the legacy flag if update fails for any reason
							await imported.setFlag("core", "sourceId", member.uuid);
						}
						existingActor = imported;
						ui.notifications.info(
							game.i18n.format("SHADOWDARK_EXTRAS.party.actor_imported", { name: member.name })
						);
					}
				} catch (e) {
					console.error(`${MODULE_ID} | Failed to import compendium actor`, e);
					ui.notifications.error(
						game.i18n.format("SHADOWDARK_EXTRAS.party.import_failed", { name: member.name })
					);
					return false;
				}
			}

			if (!existingActor) {
				ui.notifications.error(
					game.i18n.format("SHADOWDARK_EXTRAS.party.import_failed", { name: member.name })
				);
				return false;
			}

			actorToPlace = existingActor;
		}

		// Get the token document for this actor
		const tokenDocument = await actorToPlace.getTokenDocument();
		const tokenData = tokenDocument.toObject();

		// Create a preview token sprite for the cursor
		const texture = await loadTexture(tokenData.texture.src);
		const preview = new PIXI.Sprite(texture);
		const gridSize = canvas.grid.size;
		const tokenSize = tokenData.width * gridSize;

		preview.anchor.set(0.5);
		preview.width = tokenSize;
		preview.height = tokenSize;
		preview.alpha = 0.7;
		preview.visible = false;

		canvas.stage.addChild(preview);

		return new Promise((resolve) => {
			// Show placement instructions
			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.party.place_member_instruction", { name: member.name })
			);

			const onMouseMove = (event) => {
				const pos = event.data.getLocalPosition(canvas.stage);
				// Snap to grid
				const snapped = canvas.grid.getSnappedPoint({ x: pos.x, y: pos.y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });
				preview.position.set(snapped.x + tokenSize / 2, snapped.y + tokenSize / 2);
				preview.visible = true;
			};

			const onClick = async (event) => {
				// Left click to place
				const pos = event.data.getLocalPosition(canvas.stage);
				const snapped = canvas.grid.getSnappedPoint({ x: pos.x, y: pos.y }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER });

				// Cleanup
				canvas.stage.off("mousemove", onMouseMove);
				canvas.stage.off("mousedown", onClick);
				canvas.stage.off("rightdown", onRightClick);
				canvas.stage.removeChild(preview);
				preview.destroy();

				// Create the token
				tokenData.x = snapped.x;
				tokenData.y = snapped.y;
				await canvas.scene.createEmbeddedDocuments("Token", [tokenData]);

				resolve(true);
			};

			const onRightClick = (event) => {
				// Right click to cancel
				canvas.stage.off("mousemove", onMouseMove);
				canvas.stage.off("mousedown", onClick);
				canvas.stage.off("rightdown", onRightClick);
				canvas.stage.removeChild(preview);
				preview.destroy();

				resolve(false);
			};

			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					canvas.stage.off("mousemove", onMouseMove);
					canvas.stage.off("mousedown", onClick);
					canvas.stage.off("rightdown", onRightClick);
					canvas.stage.removeChild(preview);
					preview.destroy();
					document.removeEventListener("keydown", onKeyDown);
					resolve(false);
				}
			};

			canvas.stage.on("mousemove", onMouseMove);
			canvas.stage.on("mousedown", onClick);
			canvas.stage.on("rightdown", onRightClick);
			document.addEventListener("keydown", onKeyDown);
		});
	}

	/**
	 * Reward XP to all party members
	 * @param {Event} event
	 */
	async _onRewardXp(event) {
		event.preventDefault();

		const members = this.members.filter(m => m.type === "Player" && m.isOwner);
		if (members.length === 0) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.no_members"));
			return;
		}

		// Prompt for XP amount
		const content = `
			<form>
				<div class="form-group">
					<label>${game.i18n.localize("SHADOWDARK_EXTRAS.party.reward_xp_prompt")}</label>
					<input type="number" name="xp" value="1" min="1" autofocus/>
				</div>
			</form>
		`;

		const xpAmount = await Dialog.prompt({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.reward_xp_title"),
			content: content,
			callback: (html) => {
				const form = html[0].querySelector("form");
				return parseInt(form.xp.value) || 0;
			},
			rejectClose: false
		});

		if (!xpAmount || xpAmount <= 0) return;

		// Award XP to each member
		for (const member of members) {
			const currentXp = member.system.level?.xp ?? 0;
			await member.update({ "system.level.xp": currentXp + xpAmount });
		}

		ui.notifications.info(
			game.i18n.format("SHADOWDARK_EXTRAS.party.xp_rewarded", {
				xp: xpAmount,
				count: members.length
			})
		);
	}

	/**
	 * Reward coins to all player members
	 * @param {Event} event
	 */
	async _onRewardCoins(event) {
		event.preventDefault();

		const members = this.members.filter(m => m.type === "Player" && m.isOwner);
		if (members.length === 0) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.no_members"));
			return;
		}

		// Get localized labels
		const gpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_gp");
		const spLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_sp");
		const cpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_cp");

		// Dialog content with clear warning that coins go to EACH member
		const content = `
			<form class="reward-coins-form">
				<p style="color: #1f1f1fff; font-weight: bold; text-align: center; margin-bottom: 10px; padding: 8px; background: rgba(201, 169, 97, 0.1); border-radius: 4px;">
					<i class="fas fa-info-circle"></i>
					${game.i18n.localize("SHADOWDARK_EXTRAS.party.reward_coins_warning")}
				</p>
				<div class="form-group">
					<label>${gpLabel}</label>
					<input type="number" name="gp" value="0" min="0" />
				</div>
				<div class="form-group">
					<label>${spLabel}</label>
					<input type="number" name="sp" value="0" min="0" />
				</div>
				<div class="form-group">
					<label>${cpLabel}</label>
					<input type="number" name="cp" value="0" min="0" />
				</div>
				<p style="font-size: 0.85em; color: #272727ff; text-align: center; margin-top: 10px;">
					${game.i18n.format("SHADOWDARK_EXTRAS.party.reward_coins_members", { count: members.length })}
				</p>
			</form>
		`;

		const result = await Dialog.prompt({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.reward_coins_title"),
			content: content,
			callback: (html) => {
				const form = html[0].querySelector("form");
				return {
					gp: parseInt(form.gp.value) || 0,
					sp: parseInt(form.sp.value) || 0,
					cp: parseInt(form.cp.value) || 0
				};
			},
			rejectClose: false
		});

		if (!result) return;
		const { gp, sp, cp } = result;

		// Check if any coins to award
		if (gp <= 0 && sp <= 0 && cp <= 0) return;

		// Award coins to each member
		for (const member of members) {
			const currentGp = member.system.coins?.gp ?? 0;
			const currentSp = member.system.coins?.sp ?? 0;
			const currentCp = member.system.coins?.cp ?? 0;

			await member.update({
				"system.coins.gp": currentGp + gp,
				"system.coins.sp": currentSp + sp,
				"system.coins.cp": currentCp + cp
			});
		}

		// Build notification message
		const coinParts = [];
		if (gp > 0) coinParts.push(`${gp} ${gpLabel}`);
		if (sp > 0) coinParts.push(`${sp} ${spLabel}`);
		if (cp > 0) coinParts.push(`${cp} ${cpLabel}`);

		ui.notifications.info(
			game.i18n.format("SHADOWDARK_EXTRAS.party.coins_rewarded", {
				coins: coinParts.join(", "),
				count: members.length
			})
		);
	}

	/**
	 * Create a new item in party inventory
	 * @param {Event} event
	 */
	async _onCreateItem(event) {
		event.preventDefault();

		const itemData = {
			name: game.i18n.localize("SHADOWDARK_EXTRAS.party.new_item"),
			type: "Basic",
			img: "icons/svg/item-bag.svg"
		};

		await this.actor.createEmbeddedDocuments("Item", [itemData]);
	}

	/**
	 * Increment item quantity
	 * @param {Event} event
	 */
	async _onItemIncrement(event) {
		event.preventDefault();
		const itemId = event.currentTarget.dataset.itemId;
		const item = this.actor.items.get(itemId);
		if (item) {
			const newQty = (item.system.quantity || 1) + 1;
			await item.update({ "system.quantity": newQty });
		}
	}

	/**
	 * Decrement item quantity
	 * @param {Event} event
	 */
	async _onItemDecrement(event) {
		event.preventDefault();
		const itemId = event.currentTarget.dataset.itemId;
		const item = this.actor.items.get(itemId);
		if (item && item.system.quantity > 1) {
			const newQty = item.system.quantity - 1;
			await item.update({ "system.quantity": newQty });
		}
	}

	/**
	 * Post item to chat
	 * @param {Event} event
	 */
	async _onItemChat(event) {
		event.preventDefault();
		const itemId = event.currentTarget.closest(".item")?.dataset.itemId;
		const item = this.actor.items.get(itemId);
		item?.displayCard();
	}

	/**
	 * Toggle a light source on/off
	 * @param {Event} event
	 */
	async _onToggleLightSource(event) {
		event.preventDefault();

		const itemId = event.currentTarget.dataset.itemId;
		const item = this.actor.items.get(itemId);
		if (!item) return;

		const active = !item.system.light.active;

		if (active) {
			// Turn off any other active light sources first
			const activeLights = this.actor.items.filter(
				i => ["Basic", "Effect"].includes(i.type) && i.system.light?.isSource && i.system.light?.active
			);
			for (const light of activeLights) {
				await this.actor.updateEmbeddedDocuments("Item", [{
					"_id": light.id,
					"system.light.active": false,
				}]);
			}
		}

		// Update the item's light active state
		const dataUpdate = {
			"_id": item.id,
			"system.light.active": active,
		};

		if (!item.system.light.hasBeenUsed) {
			dataUpdate["system.light.hasBeenUsed"] = true;
		}

		await this.actor.updateEmbeddedDocuments("Item", [dataUpdate]);

		// Update the party actor's token light settings
		await this._updatePartyTokenLight(active, item);

		// Notify light source tracker if available
		if (game.shadowdark?.lightSourceTracker) {
			game.shadowdark.lightSourceTracker.toggleLightSource(this.actor, item);
		}
	}

	/**
	 * Update the party actor's token light settings
	 * @param {boolean} active - Whether the light is being turned on
	 * @param {Item} item - The light source item
	 */
	async _updatePartyTokenLight(active, item) {
		let lightData;

		if (active) {
			// Get the light settings from the mapping
			try {
				const lightSources = await foundry.utils.fetchJsonWithTimeout(
					"systems/shadowdark/assets/mappings/map-light-sources.json"
				);
				lightData = lightSources[item.system.light.template]?.light ?? { dim: 0, bright: 0 };
			} catch (e) {
				console.warn("Failed to load light source mappings:", e);
				lightData = { dim: 0, bright: 0 };
			}
		} else {
			lightData = { dim: 0, bright: 0 };
		}

		// Update the token on canvas if it exists
		const token = this.actor.getActiveTokens()[0];
		if (token) {
			await token.document.update({ light: lightData });
		}

		// Update the prototype token
		await this.actor.update({ "prototypeToken.light": lightData });
	}

	/**
	 * Handle coin value changes
	 * @param {Event} event
	 */
	async _onCoinChange(event) {
		const input = event.currentTarget;
		const coinType = input.dataset.coin;
		const value = Math.max(0, parseInt(input.value) || 0);

		await this.actor.setFlag(MODULE_ID, `coins.${coinType}`, value);
	}

	/**
	 * Add coins to party treasury via dialog
	 * @param {Event} event
	 */
	async _onAddCoins(event) {
		event.preventDefault();

		const gpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_gp");
		const spLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_sp");
		const cpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_cp");

		const content = `
			<form class="add-coins-form">
				<p>${game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_prompt")}</p>
				<div class="form-group">
					<label>${gpLabel}</label>
					<input type="number" name="gp" value="0" min="0" />
				</div>
				<div class="form-group">
					<label>${spLabel}</label>
					<input type="number" name="sp" value="0" min="0" />
				</div>
				<div class="form-group">
					<label>${cpLabel}</label>
					<input type="number" name="cp" value="0" min="0" autofocus />
				</div>
			</form>
		`;

		const result = await Dialog.prompt({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_title"),
			content: content,
			callback: (html) => {
				const form = html[0].querySelector("form");
				return {
					gp: parseInt(form.gp.value) || 0,
					sp: parseInt(form.sp.value) || 0,
					cp: parseInt(form.cp.value) || 0
				};
			},
			rejectClose: false
		});

		if (!result) return;

		const { gp, sp, cp } = result;
		if (gp === 0 && sp === 0 && cp === 0) return;

		// Get current coins and add the new amounts
		const currentCoins = this._getPartyCoins();
		const newGp = Math.max(0, (parseInt(currentCoins.gp) || 0) + gp);
		const newSp = Math.max(0, (parseInt(currentCoins.sp) || 0) + sp);
		const newCp = Math.max(0, (parseInt(currentCoins.cp) || 0) + cp);

		await this.actor.setFlag(MODULE_ID, "coins.gp", newGp);
		await this.actor.setFlag(MODULE_ID, "coins.sp", newSp);
		await this.actor.setFlag(MODULE_ID, "coins.cp", newCp);

		// Build notification message
		const parts = [];
		if (gp !== 0) parts.push(`${gp} ${gpLabel}`);
		if (sp !== 0) parts.push(`${sp} ${spLabel}`);
		if (cp !== 0) parts.push(`${cp} ${cpLabel}`);

		ui.notifications.info(
			game.i18n.format("SHADOWDARK_EXTRAS.party.coins_added", { coins: parts.join(", ") })
		);
	}

	/**
	 * Edit party description
	 * @param {Event} event
	 */
	async _onEditDescription(event) {
		event.preventDefault();

		const currentDescription = this.actor.getFlag(MODULE_ID, "description") ?? "";

		new Dialog({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.edit_description"),
			content: `
				<form>
					<div class="form-group stacked">
						<label>${game.i18n.localize("SHADOWDARK_EXTRAS.party.description")}</label>
						<textarea name="description" rows="10" style="width: 100%; min-height: 200px;">${currentDescription}</textarea>
					</div>
				</form>
			`,
			buttons: {
				save: {
					icon: '<i class="fas fa-save"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.party.save"),
					callback: async (html) => {
						const description = html.find('[name="description"]').val();
						await this.actor.setFlag(MODULE_ID, "description", description);
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.party.cancel")
				}
			},
			default: "save"
		}).render(true);
	}

	/**
	 * Transfer item to a party member
	 * @param {HTMLElement} element
	 */
	async _onTransferItem(element) {
		const itemId = element.dataset.itemId;
		const item = this.actor.items.get(itemId);
		if (!item) return;

		// Only world actors can receive items (not compendium actors)
		const members = this.members.filter(m => m.isOwner && !m.uuid?.startsWith("Compendium."));
		if (members.length === 0) {
			ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.party.warn.no_owned_members"));
			return;
		}

		// Create dialog to select member
		const memberOptions = members.map(m =>
			`<option value="${m.id}">${m.name}</option>`
		).join("");

		new Dialog({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.transfer_to_member"),
			content: `
				<form>
					<div class="form-group">
						<label>${game.i18n.localize("SHADOWDARK_EXTRAS.party.select_member")}</label>
						<select name="member">${memberOptions}</select>
					</div>
				</form>
			`,
			buttons: {
				transfer: {
					icon: '<i class="fas fa-share"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.party.transfer"),
					callback: async (html) => {
						const memberId = html.find('[name="member"]').val();
						const member = game.actors.get(memberId);
						if (!member) return;

						await this._transferItemToActor(item, member, { move: true });

						// Mask item name if unidentified and user is not GM
						const isUnidentified = item.getFlag(MODULE_ID, "unidentified");
						const displayName = (isUnidentified && !game.user.isGM)
							? game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label")
							: item.name;

						ui.notifications.info(
							game.i18n.format("SHADOWDARK_EXTRAS.party.item_transferred", {
								item: displayName,
								member: member.name
							})
						);
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.party.cancel")
				}
			},
			default: "transfer"
		}).render(true);
	}

	/**
	 * Handle resetting all travel assignments
	 * @param {Event} event
	 */
	async _onResetTravel(event) {
		event.preventDefault();
		if (!this.actor.isOwner) return;

		const confirmed = await Dialog.confirm({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.party.travel.reset_title"),
			content: game.i18n.localize("SHADOWDARK_EXTRAS.party.travel.reset_confirm"),
			yes: () => true,
			no: () => false,
			defaultYes: false
		});

		if (confirmed) {
			await this._resetTravelAssignments();
		}
	}

	/**
	 * Handle removing a member from a travel task
	 * @param {Event} event
	 */
	async _onRemoveTravelMember(event) {
		event.preventDefault();
		event.stopPropagation();
		const target = event.currentTarget;
		const taskKey = target.dataset.taskKey;
		const memberId = target.dataset.memberId;

		if (taskKey && memberId) {
			await this._removeMemberFromTask(taskKey, memberId);
		} else {
			console.warn("Shadowdark Extras | Missing taskKey or memberId for removal", taskKey, memberId);
		}
	}

	/* -------------------------------------------- */
	/*  Travel Tab Rolling Handlers                 */
	/* -------------------------------------------- */

	async _onToggleTravelAbility(event) {
		event.preventDefault();
		event.stopPropagation();
		console.log("Shadowdark Extras | Toggle Ability: Right Click Detected");
		const target = event.currentTarget;
		const taskKey = target.dataset.taskKey;
		const memberId = target.dataset.memberId;
		console.log("Shadowdark Extras | Toggle Ability Data:", { taskKey, memberId });

		if (!taskKey || !memberId) return;

		// Get current selections
		const selections = { ...(this.actor.getFlag(MODULE_ID, "travelSelections") ?? {}) };
		if (!selections[taskKey]) selections[taskKey] = {};

		const campingTasks = getCampingTasks();
		const task = campingTasks.find(t => t.key === taskKey);
		if (!task || !task.abilities || task.abilities.length < 2) return;

		const currentIdx = selections[taskKey][memberId] ?? 0;
		const nextIdx = (currentIdx + 1) % task.abilities.length;
		selections[taskKey][memberId] = nextIdx;

		console.log("Shadowdark Extras | New Selection Index:", nextIdx);
		await this.actor.setFlag(MODULE_ID, "travelSelections", selections);
	}

	async _onChangeTravelDC(event) {
		event.preventDefault();
		const target = event.currentTarget;
		const taskKey = target.dataset.taskKey;
		const value = parseInt(target.value);

		const dcs = { ...this.actor.getFlag(MODULE_ID, "travelDCs") ?? {} };
		dcs[taskKey] = !isNaN(value) ? value : 12;

		await this.actor.setFlag(MODULE_ID, "travelDCs", dcs);
	}



	async _onRollTravelTask(event) {
		event.preventDefault();
		const target = event.currentTarget;
		const taskKey = target.dataset.taskKey;

		const campingTasks = getCampingTasks();
		const task = campingTasks.find(t => t.key === taskKey);
		if (!task) return;

		const assignments = this.actor.getFlag(MODULE_ID, "travelAssignments") ?? {};
		const assignedIds = assignments[taskKey] ?? [];
		if (assignedIds.length === 0) return;

		const dcs = this.actor.getFlag(MODULE_ID, "travelDCs") ?? {};
		const dc = dcs[taskKey] ?? 12;

		const selections = this.actor.getFlag(MODULE_ID, "travelSelections") ?? {};

		const members = await this.getMembers();
		const actorsToRoll = assignedIds.map(id => members.find(m => m.id === id || m.uuid === id)).filter(m => m);

		if (actorsToRoll.length === 0) return;

		const rolls = [];
		for (const actor of actorsToRoll) {
			const isCompendium = actor.uuid.startsWith("Compendium.");
			const memberKey = isCompendium ? actor.uuid : actor.id;

			const selectionIdx = selections[taskKey]?.[memberKey] ?? 0;
			const ability = task.abilities[selectionIdx] || task.abilities[0];
			rolls.push({ actor, ability });
		}

		console.log("Shadowdark Extras | Rolling Task:", { taskKey, rolls });

		for (const { actor, ability } of rolls) {
			const abilityId = ability.toLowerCase();
			if (actor.rollAbility) {
				try {
					const abilityLabel = game.i18n.localize(CONFIG.SHADOWDARK.ABILITIES_LONG[abilityId]);
					await actor.rollAbility(abilityId, {
						target: dc,
						title: `${task.name} Check - ${abilityLabel}`
					});
				} catch (err) {
					console.error("Shadowdark Extras | Error rolling ability:", err);
				}
			} else {
				ui.notifications.warn("Cannot roll ability for actor type: " + actor.type);
			}
		}
	}

	/**
	 * Handle rolling for weather
	 * @param {Event} event 
	 */
	async _onRollWeather(event) {
		event.preventDefault();

		// Play dice sound if available
		if (shadowdark.utils.diceSound) {
			shadowdark.utils.diceSound();
		}

		// Roll 1d6
		const roll = await new Roll("1d6").evaluate({ async: true });

		// Determine outcome
		const isBadWeather = roll.total === 1;

		let content = "";
		let flavor = "Weather Check";

		if (isBadWeather) {
			// Roll duration for bad weather (1d4 days)
			const durationRoll = await new Roll("1d4").evaluate({ async: true });

			content = `
				<div class="shadowdark chat-card item-card" style="border: 1px solid #ff3333; border-radius: 4px; overflow: hidden; box-shadow: 0 0 10px rgba(255, 51, 51, 0.2);">
					<div class="card-header" style="display: flex; flex-direction: column; gap: 8px; padding: 10px; background: rgba(255, 51, 51, 0.1);">
						<div style="display: flex; align-items: center; gap: 10px;">
							<img src="icons/magic/air/fog-gas-smoke-swirling-yellow.webp" title="Bad Weather" style="width: 36px; height: 36px; border: 1px solid #c9aa58; border-radius: 4px;"/>
							<h3 style="margin: 0; color: #ff3333; font-family: 'Montserrat', sans-serif; font-size: 1.2em; text-shadow: 1px 1px 2px #000;">Bad Weather</h3>
						</div>
						<div style="display: block !important; padding: 5px 0;">
							<p style="margin: 4px 0;"><strong>Storms!</strong></p>
							<p style="margin: 4px 0;">Normal terrain is <strong>difficult</strong> for <strong>${durationRoll.total} days</strong> (rolled 1d4).</p>
							<p style="margin: 4px 0; font-size: 0.9em;"><em>If in an extreme climate, terrain is impassible.</em></p>
						</div>
						<div cstyle="display: block !important; font-size: 0.85em; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 5px; color: #aaa;">
							<span>Rolled 1 on 1d6</span>
						</div>
					</div>
				</div>
			`;
		} else {
			content = `
				<div class="shadowdark chat-card item-card" style="border: 1px solid #c9aa58; border-radius: 4px; overflow: hidden; box-shadow: 0 0 10px rgba(201, 170, 88, 0.2);">
					<div class="card-header" style="display: flex; flex-direction: column; gap: 8px; padding: 10px; background: rgba(201, 170, 88, 0.05);">
						<div style="display: flex; align-items: center; gap: 10px;">
							<img src="icons/magic/light/explosion-star-large-blue-yellow.webp" title="Good Weather" style="width: 36px; height: 36px; border: 1px solid #c9aa58; border-radius: 4px;"/>
							<h3 style="margin: 0; color: #c9aa58; font-family: 'Montserrat', sans-serif; font-size: 1.2em; text-shadow: 1px 1px 2px #000;">Good Weather</h3>
						</div>
						<div style="display: block !important; padding: 5px 0;">
							<p style="margin: 4px 0; color: #eee;">The weather is clear and favorable for travel.</p>
						</div>
						<div style="display: block !important; font-size: 0.85em; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 5px; color: #aaa;">
							<span>Rolled ${roll.total} on 1d6</span>
						</div>
					</div>
				</div>
			`;
		}

		// Create chat message
		ChatMessage.create({
			user: game.user.id,
			speaker: ChatMessage.getSpeaker({ actor: this.actor }),
			content: content,
			flavor: flavor
		});
	}

	/**
	 * Handle changing the travel speed
	 * @param {Event} event
	 */
	async _onChangeTravelSpeed(event) {
		event.preventDefault();
		const speedKey = event.currentTarget.value;
		await this.actor.setFlag(MODULE_ID, "travelSpeed", speedKey);
	}
}

// ============================================
// PARTY TOKEN LIGHT SYNCHRONIZATION
// ============================================

/**
 * Get the brightest light source from all party members
 * @param {Actor} partyActor - The party actor
 * @returns {Promise<Object|null>} Light configuration or null if no lights
 */
export async function getBrightestPartyLight(partyActor) {
	if (!partyActor) return null;

	// Get party members
	const memberIds = partyActor.getFlag(MODULE_ID, "members") ?? [];
	const members = [];

	for (const id of memberIds) {
		let actor = game.actors.get(id);
		if (!actor && id.includes(".")) {
			try {
				actor = await fromUuid(id);
			} catch {
				continue;
			}
		}
		if (actor) members.push(actor);
	}

	if (members.length === 0) return null;

	// Find all active light sources from all members
	let brightestLight = null;
	let maxBright = -1;
	let maxDim = -1;

	for (const member of members) {
		console.log(`${MODULE_ID} | Checking member: ${member.name}`);
		// Check all items for light sources
		for (const item of member.items) {
			// Light sources are Basic or Effect items with light.isSource = true
			const isLightSource = ["Basic", "Effect"].includes(item.type) && item.system?.light?.isSource;
			const isActive = item.system?.light?.active;

			console.log(`${MODULE_ID} | Item: ${item.name}, type: ${item.type}, isLightSource: ${isLightSource}, isActive: ${isActive}`);

			if (isLightSource && isActive) {
				console.log(`${MODULE_ID} | Found active light: ${item.name}`, item.system.light);

				// Load Shadowdark's official light source mappings
				const templateName = item.system.light.template;
				let lightTemplate = null;

				try {
					const lightSources = await foundry.utils.fetchJsonWithTimeout(
						"systems/shadowdark/assets/mappings/map-light-sources.json"
					);
					lightTemplate = lightSources[templateName]?.light;
					console.log(`${MODULE_ID} | Loaded template '${templateName}' from Shadowdark mappings:`, lightTemplate);
				} catch (e) {
					console.warn(`${MODULE_ID} | Failed to load light mappings:`, e);
				}

				// If template not found in JSON, use fallback values
				if (!lightTemplate) {
					console.log(`${MODULE_ID} | Template '${templateName}' not in JSON, using fallback`);
					// Fallback values matching Shadowdark's actual light mappings
					const FALLBACK_TEMPLATES = {
						"torch": { bright: 5, dim: 30, color: "#d1c846", alpha: 0.2, angle: 360 },
						"lantern": { bright: 15, dim: 60, color: "#d1c846", alpha: 0.2, angle: 360 },
						"lightSpellNear": { bright: 30, dim: 0, color: null, alpha: 0.2, angle: 360 },
						"lightSpellDouble": { bright: 60, dim: 0, color: null, alpha: 0.2, angle: 360 },
					};

					// Merge custom templates
					const customSources = getCustomLightSources();
					for (const [key, source] of Object.entries(customSources)) {
						FALLBACK_TEMPLATES[key] = source.light;
					}

					lightTemplate = FALLBACK_TEMPLATES[templateName];
				}

				console.log(`${MODULE_ID} | Template: ${templateName}`, lightTemplate);

				// Get bright and dim from the template or item
				let bright = lightTemplate?.bright ?? item.system.light.bright ?? 0;
				let dim = lightTemplate?.dim ?? item.system.light.dim ?? 0;

				console.log(`${MODULE_ID} | Light values - bright: ${bright}, dim: ${dim}`);

				// Compare brightness (bright distance is primary, dim is tiebreaker)
				if (bright > maxBright || (bright === maxBright && dim > maxDim)) {
					maxBright = bright;
					maxDim = dim;

					// Build light configuration using template values or item values
					brightestLight = {
						bright: bright,
						dim: dim,
						angle: lightTemplate?.angle ?? item.system.light.angle ?? 360,
						color: lightTemplate?.color ?? item.system.light.color,
						alpha: lightTemplate?.alpha ?? item.system.light.alpha ?? 0.5,
						animation: lightTemplate?.animation ?? item.system.light.animation ?? {},
						darkness: item.system.light.darkness ?? {},
						attenuation: lightTemplate?.attenuation ?? item.system.light.attenuation ?? 0.5,
						luminosity: lightTemplate?.luminosity ?? item.system.light.luminosity ?? 0.5,
						saturation: lightTemplate?.saturation ?? item.system.light.saturation ?? 0,
						contrast: lightTemplate?.contrast ?? item.system.light.contrast ?? 0,
						shadows: lightTemplate?.shadows ?? item.system.light.shadows ?? 0,
						coloration: lightTemplate?.coloration ?? item.system.light.coloration ?? 1,
					};
					console.log(`${MODULE_ID} | New brightest light:`, brightestLight);
				}
			}
		}
	}

	return brightestLight;
}

/**
 * Sync party token lights with the brightest light from party members
 * @param {Actor} partyActor - The party actor
 */
export async function syncPartyTokenLight(partyActor) {
	console.log(`${MODULE_ID} | syncPartyTokenLight called with:`, partyActor);

	// Check if this is a party by looking for the members flag
	const hasMembers = partyActor?.getFlag(MODULE_ID, "members");
	console.log(`${MODULE_ID} | Has members flag:`, hasMembers);

	if (!partyActor || !hasMembers) {
		console.warn(`${MODULE_ID} | syncPartyTokenLight: Not a party actor (no members flag)`, partyActor);
		return;
	}

	console.log(`${MODULE_ID} | Syncing light for party: ${partyActor.name}`);

	// Get the brightest light from party members
	const brightestLight = await getBrightestPartyLight(partyActor);

	// Find all tokens for this party actor on the current scene
	const partyTokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === partyActor.id) ?? [];

	if (partyTokens.length === 0) {
		console.log(`${MODULE_ID} | No party tokens found on canvas for ${partyActor.name}`);
		return;
	}

	// Update each party token
	for (const token of partyTokens) {
		const updates = {};

		if (brightestLight) {
			// Enable light with brightest source configuration
			updates["light.dim"] = brightestLight.dim;
			updates["light.bright"] = brightestLight.bright;
			updates["light.angle"] = brightestLight.angle;
			updates["light.color"] = brightestLight.color;
			updates["light.alpha"] = brightestLight.alpha;
			updates["light.animation"] = brightestLight.animation;
			updates["light.darkness"] = brightestLight.darkness;
			updates["light.attenuation"] = brightestLight.attenuation;
			updates["light.luminosity"] = brightestLight.luminosity;
			updates["light.saturation"] = brightestLight.saturation;
			updates["light.contrast"] = brightestLight.contrast;
			updates["light.shadows"] = brightestLight.shadows;
			updates["light.coloration"] = brightestLight.coloration;

			console.log(`${MODULE_ID} | Party token ${token.name} light ON: ${brightestLight.bright}/${brightestLight.dim}`);
		} else {
			// No lights active - turn off party token light
			updates["light.dim"] = 0;
			updates["light.bright"] = 0;

			console.log(`${MODULE_ID} | Party token ${token.name} light OFF`);
		}

		await token.document.update(updates);
	}
}

/**
 * Find all parties that contain a given actor
 * @param {Actor} actor - The actor to search for
 * @returns {Actor[]} Array of party actors containing this member
 */
export function getPartiesContainingActor(actor) {
	if (!actor) return [];

	const parties = [];
	const actorKey1 = actor.id;
	const actorKey2 = actor.uuid;

	for (const potentialParty of game.actors) {
		// Check if this actor has party members (indicates it's a party)
		const memberIds = potentialParty.getFlag(MODULE_ID, "members");
		if (!memberIds) continue;

		if (memberIds.includes(actorKey1) || memberIds.includes(actorKey2)) {
			parties.push(potentialParty);
		}
	}

	return parties;
}
