/**
 * Focus Spell Tracker for Shadowdark Extras
 * 
 * This module tracks active focus spells and the effects they have applied to targets.
 * When a focus spell fails or is intentionally dropped, all associated effects are removed.
 * 
 * Features:
 * - Tracks which spells are currently being focused on by each actor
 * - Links effects applied to targets back to the source spell and caster
 * - Shows active focus spells on the player sheet's spells tab
 * - Automatically removes effects when focus is lost (failed roll or manual end)
 * - Provides UI to manually end focus on a spell
 */

import { getSocket } from "./CombatSettingsSD.mjs";

const MODULE_ID = "shadowdark-extras";

// Storage key for focus spell data in actor flags
const FOCUS_SPELL_FLAG = "activeFocusSpells";

/**
 * Data structure for an active focus spell:
 * {
 *   spellId: string,           // The ID of the spell item on the caster
 *   spellName: string,         // Display name of the spell
 *   spellImg: string,          // Image of the spell
 *   casterId: string,          // Actor ID of the caster
 *   casterName: string,        // Display name of the caster
 *   startTime: number,         // World time when focus started
 *   startRound: number|null,   // Combat round when focus started (if in combat)
 *   spellData: {               // Cached spell data for rolls (in case item is deleted, e.g. scrolls)
 *     tier: number,            // Spell tier
 *     ability: string,         // Spellcasting ability (e.g. 'INT', 'WIS', 'CHA')
 *     dc: number,              // Spell DC
 *     type: string             // Original item type ('Spell', 'Scroll', etc.)
 *   },
 *   targetEffects: [{          // Array of effects applied to targets
 *     targetActorId: string,   // Actor ID of the target
 *     targetTokenId: string,   // Token ID of the target (may vary by scene)
 *     effectItemId: string,    // Effect Item ID on the target actor
 *     targetName: string       // Display name of the target
 *   }]
 * }
 */

/**
 * Initialize the Focus Spell Tracker
 */
export function initFocusSpellTracker() {
	console.log("shadowdark-extras | Initializing Focus Spell Tracker");

	// Hook into chat message rendering to track focus spells
	// (We use renderChatMessage because we need to parse the HTML for actor/item IDs)
	Hooks.on("renderChatMessage", handleChatMessageRender);

	// Hook into effect creation to link effects to focus spells
	Hooks.on("createItem", handleEffectCreated);

	// Hook into effect deletion to clean up tracking
	Hooks.on("deleteItem", handleEffectDeleted);

	// Hook into token deletion to clean up focus tracking
	Hooks.on("deleteToken", handleTokenDeleted);

	// Hook into actor sheet rendering to add focus spell display
	Hooks.on("renderPlayerSheetSD", injectFocusSpellsUI);

	// Disable right-click context menu on spell items (runs separately from focus UI)
	Hooks.on("renderPlayerSheetSD", disableSpellContextMenu);

	// Hook into combat updates to remind about focus spells at turn start
	Hooks.on("updateCombat", handleCombatUpdate);

	// Hook into combat updates to process duration spells (per-turn damage, expiry)
	Hooks.on("updateCombat", handleDurationSpellCombatUpdate);

	// Hook into chat message rendering to add click handlers for focus roll buttons
	Hooks.on("renderChatMessage", handleFocusReminderChatClick);

	// Hook into chat message rendering to add click handlers for duration damage apply buttons
	Hooks.on("renderChatMessage", handleDurationDamageApplyClick);

	// Hook into chat message rendering to track wand uses
	Hooks.on("renderChatMessage", handleWandUsesTracking);

	// Hook into player sheet rendering to display wand uses next to wand names
	Hooks.on("renderPlayerSheetSD", injectWandUsesDisplay);

	console.log("shadowdark-extras | Focus Spell Tracker initialized (using shared socket)");
}

/**
 * Helper function to get the shared socket from CombatSettingsSD
 * @returns {object|null} The socketlib socket instance
 */
function getFocusSpellSocket() {
	return getSocket();
}

/**
 * Handle chat message rendering to detect spell casts
 * Extracts actor/item IDs from the chat card HTML data attributes
 */
async function handleChatMessageRender(message, html, data) {
	// Only process if current user is the author to avoid duplicate processing
	if (message.author?.id !== game.user.id) return;

	// Check if this is a Shadowdark roll message
	const sdFlags = message.flags?.shadowdark;
	if (!sdFlags?.isRoll) return;

	// Get actor and item IDs from the chat card HTML
	const chatCard = html.find('.chat-card');
	if (!chatCard.length) return;

	const actorId = chatCard.data('actorId');
	const itemId = chatCard.data('itemId');

	if (!actorId || !itemId) return;

	const actor = game.actors.get(actorId);
	const item = actor?.items.get(itemId);

	if (!actor || !item) return;

	// Check if this is a spell type
	if (!["Spell", "Scroll", "Wand", "NPC Spell"].includes(item.type)) return;

	// Check if this is a focus-type spell
	const isFocusSpell = item.system?.duration?.type === "focus";
	if (!isFocusSpell) return;

	const spellId = item.id;
	const casterId = actor.id;
	const success = sdFlags.success === true;
	const critical = sdFlags.critical;

	// Check if this is a focus roll (maintenance) or initial cast
	// Focus rolls have "Focus Check" in the flavor
	const focusCheckText = game.i18n.localize("SHADOWDARK.chat.spell_focus_check");
	const activeFocusSpells = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];

	// Find focus entry by ID first, then by name (for temporary spell items from scrolls)
	let focusEntry = activeFocusSpells.find(f => f.spellId === spellId);
	let isAlreadyFocusing = !!focusEntry;

	// If not found by ID, try to find by name (for temp spells created from cached scroll data)
	if (!focusEntry && item.name) {
		focusEntry = activeFocusSpells.find(f => f.spellName === item.name);
		if (focusEntry) {
			isAlreadyFocusing = true;
			console.log(`shadowdark-extras | Found focus entry by name: ${item.name}`);
		}
	}

	const isFocusRoll = message.flavor?.includes(focusCheckText) ||
		message.flavor?.includes("Focus Check");

	console.log(`shadowdark-extras | Focus spell detected: ${item.name}`, {
		isFocusRoll,
		isAlreadyFocusing,
		success,
		critical,
		spellId,
		casterId,
		flavor: message.flavor,
		focusEntrySpellId: focusEntry?.spellId
	});

	if (isFocusRoll) {
		// This is a focus maintenance roll
		if (!success || critical === "failure") {
			// Focus failed - end the spell and remove effects
			console.log(`shadowdark-extras | Focus failed for ${item.name}, ending focus and removing effects`);

			// Use the focus entry's spellId (which is the original tracked ID, not temp spell ID)
			const trackedSpellId = focusEntry?.spellId || spellId;

			// On critical failure, also mark the spell as lost (like Shadowdark does)
			// Only update if the item is a permanent spell (not a temp spell)
			if (critical === "failure") {
				console.log(`shadowdark-extras | Critical failure on focus check - marking spell as lost`);
				// Only update the item if it's not a temporary spell
				const permanentItem = actor.items.get(trackedSpellId);
				if (permanentItem) {
					await permanentItem.update({ "system.lost": true });
				}
				await endFocusSpell(casterId, trackedSpellId, "spell_lost");
			} else {
				await endFocusSpell(casterId, trackedSpellId, "focus_failed");
			}
		} else {
			console.log(`shadowdark-extras | Focus maintained for ${item.name}`);
			// Don't re-apply effects - they're already applied
		}
	} else if (!isAlreadyFocusing) {
		// This is the initial cast (only start tracking if not already focusing)
		if (success && critical !== "failure") {
			// Spell cast successfully - start tracking focus
			console.log(`shadowdark-extras | Starting focus tracking for ${item.name}`);
			await startFocusSpell(actor, item);
		}
	}
}

/**
 * Start tracking a focus spell
 */
async function startFocusSpell(actor, spell, perTurnConfig = null) {
	// Cache spell data so we can still roll focus checks even if the item is deleted (e.g., scrolls)
	const spellData = {
		tier: spell.system?.tier ?? 1,
		ability: spell.system?.spellcasting?.ability ?? actor.system?.spellcastingAbility ?? "INT",
		dc: spell.system?.dc ?? spell.system?.tier ? (10 + spell.system.tier) : 11,
		type: spell.type,
		description: spell.system?.description ?? "",
		// Cache the spell's class UUIDs - important for focus rolls to use correct ability
		class: spell.system?.class || [],
		// Cache the spell name for scrolls (stored as spellName in scroll system data)
		spellName: spell.system?.spellName || spell.name
	};

	const focusData = {
		spellId: spell.id,
		spellName: spell.name,
		spellImg: spell.img,
		casterId: actor.id,
		casterName: actor.name,
		startTime: game.time.worldTime,
		startRound: game.combat?.round ?? null,
		spellData: spellData, // Cache spell data for focus rolls
		targetEffects: [],
		// Per-turn damage/healing config
		perTurnDamage: perTurnConfig?.perTurnDamage || null,
		perTurnTrigger: perTurnConfig?.perTurnTrigger || "start",
		damageType: perTurnConfig?.damageType || "",
		reapplyEffects: perTurnConfig?.reapplyEffects || false,
		effects: perTurnConfig?.effects || []
	};

	// Get current active focus spells
	const currentFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];

	// Check if we're already focusing on this spell (shouldn't happen, but be safe)
	const existingIndex = currentFocus.findIndex(f => f.spellId === spell.id);
	if (existingIndex >= 0) {
		// Update existing entry
		currentFocus[existingIndex] = focusData;
	} else {
		// Add new entry
		currentFocus.push(focusData);
	}

	await actor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, currentFocus);

	// Add Concentration effect to the actor
	const concentrationIcon = "icons/magic/time/hourglass-tilted-glowing-gold.webp";
	const concentrationName = game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.concentration_name", { spellName: spell.name });
	const concentrationDesc = game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.concentration_description", { spellName: spell.name });

	const effectData = {
		name: concentrationName,
		type: "Effect",
		img: concentrationIcon,
		system: {
			description: concentrationDesc,
			duration: {
				type: "focus",
				value: 0,
				unit: ""
			}
		},
		effects: [{
			name: concentrationName,
			icon: concentrationIcon,
			origin: spell.uuid,
			transfer: true,
			statuses: ["concentration"],
			disabled: false
		}],
		flags: {
			[MODULE_ID]: {
				isConcentration: true,
				spellId: spell.id
			}
		}
	};

	try {
		const created = await actor.createEmbeddedDocuments("Item", [effectData]);
		if (created.length > 0) {
			const effectId = created[0].id;
			// Update the focus entry with the effect ID
			const updatedFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
			const entryIndex = updatedFocus.findIndex(f => f.spellId === spell.id);
			if (entryIndex >= 0) {
				updatedFocus[entryIndex].concentrationEffectId = effectId;
				await actor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, updatedFocus);
			}
		}
	} catch (err) {
		console.error("shadowdark-extras | Failed to create concentration effect:", err);
	}

	// Notify user
	ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.started", { spellName: spell.name }));

	// Refresh the actor sheet if open
	actor.sheet?.render(false);
}

// Storage key for duration spell data in actor flags
const DURATION_SPELL_FLAG = "activeDurationSpells";

/**
 * Start tracking a duration spell (non-focus spells with turn/round duration)
 * @param {Actor} caster - The caster actor
 * @param {Item} spell - The spell item
 * @param {Array} targetTokenIds - Array of target token IDs
 * @param {Object} spellConfig - Configuration from spellDamage flags
 */
export async function startDurationSpell(caster, spell, targetTokenIds = [], spellConfig = {}) {
	// Get spell duration from the spell item
	// Handle case where value might be a string like "5" or a number
	const rawDurationValue = spell.system?.duration?.value;
	const durationValue = typeof rawDurationValue === 'string' ? parseInt(rawDurationValue, 10) || 1 : (rawDurationValue || 1);
	const durationType = spell.system?.duration?.type || "rounds";

	console.log(`shadowdark-extras | Duration spell: ${spell.name}, value: ${durationValue}, type: ${durationType}`);

	// Calculate expiry round
	const currentRound = game.combat?.round ?? 0;
	let expiryRound = currentRound;

	if (durationType === "rounds") {
		expiryRound = currentRound + durationValue;
	} else if (durationType === "turns") {
		expiryRound = currentRound + Math.ceil(durationValue / 10); // Approximate
	}

	console.log(`shadowdark-extras | Duration spell tracking: current round ${currentRound}, expiry round ${expiryRound}`);

	// Build target info
	const targets = targetTokenIds.map(tokenId => {
		const token = canvas.tokens?.get(tokenId);
		return {
			tokenId: tokenId,
			actorId: token?.actor?.id || null,
			name: token?.name || "Unknown"
		};
	});

	// Generate a unique instance ID for this spell cast
	const instanceId = `${spell.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	const durationData = {
		instanceId: instanceId, // Unique ID for this specific cast
		spellId: spell.id,
		spellName: spell.name,
		spellImg: spell.img,
		casterId: caster.id,
		casterName: caster.name,
		templateId: spellConfig.templateId || null, // Link to the specific template
		startRound: currentRound,
		expiryRound: expiryRound,
		durationValue: durationValue,
		durationType: durationType,
		targets: targets,
		targetEffects: [], // Track effects applied to targets for cleanup
		perTurnTrigger: spellConfig.perTurnTrigger || "start",
		perTurnDamage: spellConfig.perTurnDamage || "",
		reapplyEffects: spellConfig.reapplyEffects || false,
		damageType: spellConfig.damageType || "",
		effects: spellConfig.effects || [],
		lastProcessedRound: currentRound, // Don't process on cast round
		processedTargetsThisRound: {} // Track which targets have been processed this round
	};

	// Get current active duration spells
	const currentDuration = caster.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];

	// Always add as a new instance (no longer check for existing same spell)
	currentDuration.push(durationData);

	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, currentDuration);

	ui.notifications.info(`${spell.name} is being tracked (${durationValue} ${durationType})`);

	// Refresh the actor sheet if open
	caster.sheet?.render(false);

	console.log(`shadowdark-extras | Started duration tracking for ${spell.name}`, durationData);
	console.log(`shadowdark-extras | Duration spell templateId: ${durationData.templateId || 'NOT SET'}`);
	return durationData;
}

/**
 * Get all active duration spells for an actor
 */
export function getActiveDurationSpells(actor) {
	return actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
}

// Storage key for spell modifications on items
const SPELL_MODIFICATIONS_FLAG = "spellModifications";

/**
 * Register a spell modification on an item
 * This stores the original state of the item so it can be reverted when the spell ends.
 * 
 * @param {Actor} caster - The caster who applied the modification
 * @param {Item} spell - The spell item that applied the modification
 * @param {Item} targetItem - The item being modified (weapon, armor, etc.)
 * @param {Object} changes - The changes being applied (keys are paths like "system.magicItem")
 * @param {Object} options - Display options for when the spell ends
 * @param {string} options.icon - FontAwesome icon class (e.g., "fas fa-hand-sparkles")
 * @param {string} options.endMessage - Message template with {weapon} and {actor} placeholders
 * @returns {Object} - The modification entry created
 */
export async function registerSpellModification(caster, spell, targetItem, changes, options = {}) {
	if (!caster || !spell || !targetItem) {
		console.warn("shadowdark-extras | registerSpellModification called with missing parameters");
		return null;
	}

	// Get current modifications on the item
	const currentMods = targetItem.getFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG) || [];

	// Capture original state for the paths being changed
	const originalState = {};
	const modifiedPaths = Object.keys(changes);

	for (const path of modifiedPaths) {
		// Deep get the current value at this path
		originalState[path] = foundry.utils.getProperty(targetItem, path) ?? null;
	}

	// Generate unique instance ID that matches duration tracking
	const instanceId = `${spell.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	// Create the modification entry
	const modEntry = {
		instanceId: instanceId,
		spellId: spell.id,
		casterId: caster.id,
		casterName: caster.name,
		spellName: spell.name,
		spellImg: spell.img,
		originalState: originalState,
		modifiedPaths: modifiedPaths,
		icon: options.icon || "fas fa-magic",
		endMessage: options.endMessage || `The spell effect fades from {weapon} on {actor}.`,
		createdAt: Date.now()
	};

	// Add to item's modifications list
	currentMods.push(modEntry);
	await targetItem.setFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG, currentMods);

	console.log(`shadowdark-extras | Registered spell modification for ${spell.name} on ${targetItem.name}`, modEntry);
	console.log(`shadowdark-extras | Captured original state:`, originalState);

	return modEntry;
}

/**
 * Revert all spell modifications when a spell ends
 * Automatically called by endDurationSpell/endFocusSpell
 * 
 * @param {string} spellId - The spell ID
 * @param {string} casterId - The caster actor ID
 */
async function revertSpellModifications(spellId, casterId) {
	console.warn(`shadowdark-extras | [REVERT] Reverting spell modifications for spell ${spellId} by caster ${casterId}`);

	const caster = game.actors.get(casterId);
	const revertedItems = [];
	const processedActorIds = new Set();

	// Helper function to process an actor's items
	async function processActorItems(actor) {
		if (!actor || processedActorIds.has(actor.id)) return;
		processedActorIds.add(actor.id);

		const items = actor.items.filter(item => {
			const mods = item.getFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG);
			return mods && mods.some(m => m.spellId === spellId && m.casterId === casterId);
		});

		for (const item of items) {
			const mods = item.getFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG) || [];
			const matchingMods = mods.filter(m => m.spellId === spellId && m.casterId === casterId);

			if (matchingMods.length === 0) continue;

			// Build the update object to restore original state
			const updates = {};
			let modEntry = null;

			for (const mod of matchingMods) {
				modEntry = mod; // Keep reference for chat message

				// Restore each path to its original value
				for (const path of mod.modifiedPaths) {
					const originalValue = mod.originalState[path];
					// Use null instead of undefined for proper deletion, or use the original value
					updates[path] = originalValue === undefined ? null : originalValue;
				}
			}

			// Apply the reversion
			try {
				console.log(`shadowdark-extras | Applying reversion to ${item.name} on ${actor.name}:`, updates);
				await item.update(updates);
				console.log(`shadowdark-extras | Reverted ${item.name} on ${actor.name}`, updates);

				// Remove the modification entries from the item
				const remainingMods = mods.filter(m => !(m.spellId === spellId && m.casterId === casterId));
				if (remainingMods.length > 0) {
					await item.setFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG, remainingMods);
				} else {
					await item.unsetFlag(MODULE_ID, SPELL_MODIFICATIONS_FLAG);
				}

				revertedItems.push({ item, actor, modEntry });
			} catch (err) {
				console.error(`shadowdark-extras | Failed to revert ${item.name}:`, err);
			}
		}
	}

	// Search all actors in the actors directory
	for (const actor of game.actors.contents) {
		await processActorItems(actor);
	}

	// Also search token actors on the current scene (for unlinked tokens)
	if (canvas.tokens?.placeables) {
		for (const token of canvas.tokens.placeables) {
			if (token.actor && !token.document.actorLink) {
				// This is an unlinked token - process its actor
				await processActorItems(token.actor);
			}
		}
	}

	// Post chat messages for reverted items
	for (const { item, actor, modEntry } of revertedItems) {
		const message = modEntry.endMessage
			.replace("{weapon}", item.name)
			.replace("{actor}", actor.name);

		await ChatMessage.create({
			content: `<div class="shadowdark chat-card">
				<h3><i class="${modEntry.icon}"></i> ${modEntry.spellName} Ended</h3>
				<p>${message}</p>
			</div>`,
			speaker: ChatMessage.getSpeaker({ actor: caster }),
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		});
	}

	if (revertedItems.length > 0) {
		console.log(`shadowdark-extras | Reverted ${revertedItems.length} item(s) modified by spell ${spellId}`);
	}

	return revertedItems;
}

/**
 * End a duration spell and remove all associated effects from targets
 * @param {string} casterId - The caster actor ID
 * @param {string} instanceId - The unique instance ID of the spell (or spellId for backwards compatibility)
 * @param {string} reason - The reason for ending ("expired" or "manual")
 */
export async function endDurationSpell(casterId, instanceId, reason = "expired") {
	console.warn(`shadowdark-extras | [ENTRY] endDurationSpell called with casterId=${casterId}, instanceId=${instanceId}, reason=${reason}`);

	const caster = game.actors.get(casterId);
	if (!caster) return;

	const activeDuration = caster.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
	// Find by instanceId first, fallback to spellId for backwards compatibility
	let spellIndex = activeDuration.findIndex(d => d.instanceId === instanceId);
	if (spellIndex < 0) {
		spellIndex = activeDuration.findIndex(d => d.spellId === instanceId);
	}

	if (spellIndex < 0) return;

	const durationEntry = activeDuration[spellIndex];
	console.log(`shadowdark-extras | [DEBUG] Found duration entry:`, durationEntry);

	// Remove all effects applied to targets
	if (durationEntry.targetEffects && durationEntry.targetEffects.length > 0) {
		console.log(`shadowdark-extras | Removing ${durationEntry.targetEffects.length} effects from duration spell ${durationEntry.spellName}`);

		for (const targetEffect of durationEntry.targetEffects) {
			try {
				// Use socketlib to remove the effect as GM
				const socket = getFocusSpellSocket();
				if (socket) {
					await socket.executeAsGM("removeTargetEffect", {
						targetActorId: targetEffect.targetActorId,
						targetTokenId: targetEffect.targetTokenId,
						effectItemId: targetEffect.effectItemId
					});
					console.log(`shadowdark-extras | Removed effect via socket`);
				} else {
					// Fallback for GM or if socket not available
					let targetActor = null;

					// Try token first (for unlinked tokens)
					if (targetEffect.targetTokenId) {
						const token = canvas.tokens?.get(targetEffect.targetTokenId);
						if (token?.actor) {
							targetActor = token.actor;
						}
					}

					// Fall back to actor ID
					if (!targetActor && targetEffect.targetActorId) {
						targetActor = game.actors.get(targetEffect.targetActorId);
					}

					if (!targetActor) {
						console.warn(`shadowdark-extras | Could not find target actor for effect removal`);
						continue;
					}

					// Find and remove the effect
					const effectItem = targetActor.items.get(targetEffect.effectItemId);
					if (effectItem) {
						await effectItem.delete();
						console.log(`shadowdark-extras | Removed effect ${effectItem.name} from ${targetActor.name}`);
					}
				}
			} catch (err) {
				console.warn(`shadowdark-extras | Failed to remove effect:`, err);
			}
		}
	}

	// Revert any item modifications made by this spell (generic system)
	console.log(`shadowdark-extras | [DEBUG] About to call revertSpellModifications with spellId=${durationEntry.spellId}, casterId=${casterId}`);
	await revertSpellModifications(durationEntry.spellId, casterId);

	// Legacy support: Clean up old Holy Weapon or Cleansing Weapon bonuses (pre-generic system)
	// This can be removed in a future version after macros are updated
	console.log(`shadowdark-extras | [DEBUG] Checking legacy weapon cleanup for spellId=${durationEntry.spellId}, casterId=${casterId}`);
	for (const actor of game.actors.contents) {
		const weapons = actor.items.filter(item => item.type === "Weapon");
		for (const weapon of weapons) {
			const holyWeaponSpellId = weapon.getFlag("shadowdark-extras", "holyWeaponSpellId");
			const holyWeaponCasterId = weapon.getFlag("shadowdark-extras", "holyWeaponCasterId");
			const cleansingWeaponSpellId = weapon.getFlag("shadowdark-extras", "cleansingWeaponSpellId");
			const cleansingWeaponCasterId = weapon.getFlag("shadowdark-extras", "cleansingWeaponCasterId");

			// Debug log to see what flags are set on weapons
			if (holyWeaponSpellId || cleansingWeaponSpellId) {
				console.log(`shadowdark-extras | [DEBUG] Weapon ${weapon.name} on ${actor.name} has flags:`, {
					holyWeaponSpellId, holyWeaponCasterId, cleansingWeaponSpellId, cleansingWeaponCasterId,
					targetSpellId: durationEntry.spellId, targetCasterId: casterId
				});
			}

			// Check if this weapon was blessed by the ending spell (old flag system)
			if ((holyWeaponSpellId === durationEntry.spellId && holyWeaponCasterId === casterId) ||
				(cleansingWeaponSpellId === durationEntry.spellId && cleansingWeaponCasterId === casterId)) {

				const isCleansing = !!cleansingWeaponSpellId;
				console.log(`shadowdark-extras | [Legacy] Removing ${isCleansing ? 'Cleansing' : 'Holy'} Weapon bonuses from ${weapon.name} on ${actor.name}`);

				// Remove the weapon bonuses and magical status
				const updates = {
					"system.magicItem": false,
					[`flags.shadowdark-extras.weaponBonus`]: null
				};

				if (isCleansing) {
					updates[`flags.shadowdark-extras.cleansingWeaponSpellId`] = null;
					updates[`flags.shadowdark-extras.cleansingWeaponCasterId`] = null;
				} else {
					updates[`flags.shadowdark-extras.holyWeaponSpellId`] = null;
					updates[`flags.shadowdark-extras.holyWeaponCasterId`] = null;
				}

				await weapon.update(updates);

				// Post to chat
				const title = isCleansing ? "Cleansing Weapon Ended" : "Holy Weapon Ended";
				const icon = isCleansing ? "fas fa-fire" : "fas fa-hand-sparkles";
				const messageText = isCleansing
					? `The purifying flames fade from <strong>${actor.name}'s ${weapon.name}</strong>.`
					: `The holy blessing fades from <strong>${actor.name}'s ${weapon.name}</strong>.`;

				await ChatMessage.create({
					content: `<div class="shadowdark chat-card">
						<h3><i class="${icon}"></i> ${title}</h3>
						<p>${messageText}</p>
					</div>`,
					speaker: ChatMessage.getSpeaker({ actor: caster }),
					type: CONST.CHAT_MESSAGE_STYLES.OTHER
				});
			}
		}
	}

	// Delete associated templates from the scene
	// Use the stored templateId for precise 1:1 matching, fall back to name matching for old data
	try {
		const scene = canvas.scene;
		if (scene) {
			const templatesToDelete = [];

			// If we have a specific templateId, use it for precise deletion
			if (durationEntry.templateId) {
				const template = scene.templates?.get(durationEntry.templateId);
				if (template) {
					templatesToDelete.push(durationEntry.templateId);
					console.log(`shadowdark-extras | Found specific template to delete: ${durationEntry.templateId}`);
				}
			} else {
				// Fallback: match by spell name and caster (for duration spells without templateId)
				const templates = scene.templates || [];
				for (const template of templates) {
					const templateFlags = template.flags?.["shadowdark-extras"]?.templateEffects;
					if (!templateFlags?.enabled) continue;

					const matchesSpell = templateFlags.spellName === durationEntry.spellName;
					const matchesCaster = templateFlags.casterActorId === casterId ||
						templateFlags.casterId === casterId;

					if (matchesSpell && matchesCaster) {
						templatesToDelete.push(template.id);
						console.log(`shadowdark-extras | Found template to delete for ${durationEntry.spellName} (fallback matching)`);
					}
				}
			}

			if (templatesToDelete.length > 0) {
				await scene.deleteEmbeddedDocuments("MeasuredTemplate", templatesToDelete);
				console.log(`shadowdark-extras | Deleted ${templatesToDelete.length} template(s) for ended spell ${durationEntry.spellName}`);
			}
		}
	} catch (err) {
		console.warn(`shadowdark-extras | Failed to delete templates for ended spell:`, err);
	}

	// Remove from tracking
	activeDuration.splice(spellIndex, 1);
	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);

	// Post to chat
	const chatContent = `
		<div class="shadowdark chat-card focus-ended">
			<header class="card-header flexrow">
				<img class="focus-ended-icon" src="${durationEntry.spellImg}" alt="${durationEntry.spellName}"/>
				<div class="focus-ended-header-text">
					<h3>${game.i18n.localize("SHADOWDARK_EXTRAS.duration_tracker.spell_ended_title")}</h3>
					<p class="spell-name">${durationEntry.spellName}</p>
				</div>
			</header>
			<div class="card-content">
				<p class="reason-text">${reason === "expired" ? game.i18n.localize("SHADOWDARK_EXTRAS.duration_tracker.reason_expired") : game.i18n.localize("SHADOWDARK_EXTRAS.duration_tracker.reason_manual")}</p>
				${durationEntry.targetEffects?.length > 0 ? `<p style="font-size: 11px; color: #999;">${game.i18n.format("SHADOWDARK_EXTRAS.duration_tracker.effects_removed", { count: durationEntry.targetEffects.length })}</p>` : ""}
			</div>
		</div>
	`;

	await ChatMessage.create({
		content: chatContent,
		speaker: ChatMessage.getSpeaker({ actor: caster }),
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	});

	ui.notifications.info(`${durationEntry.spellName} has ${reason === "expired" ? "expired" : "ended"}`);
	caster.sheet?.render(false);
}

/**
 * Start focus spell tracking if the spell is a focus spell and not already tracked.
 * Called from effect application to ensure focus is tracked before linking effects.
 * 
 * @param {string} casterActorId - The caster actor ID
 * @param {string} spellId - The spell item ID  
 * @param {string} spellName - The spell name (for lookup)
 * @returns {boolean} - True if focus is now being tracked for this spell
 */
export async function startFocusSpellIfNeeded(casterActorId, spellId, spellName, perTurnConfig = null) {
	const caster = game.actors.get(casterActorId);
	if (!caster) {
		console.warn(`shadowdark-extras | Cannot start focus tracking: caster ${casterActorId} not found`);
		return false;
	}

	// Check if already tracking this spell
	const activeFocus = caster.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	if (activeFocus.some(f => f.spellId === spellId)) {
		console.log(`shadowdark-extras | Focus already being tracked for ${spellName}`);
		return true;
	}

	// Get the spell item
	const spell = caster.items.get(spellId);
	if (!spell) {
		console.warn(`shadowdark-extras | Cannot start focus tracking: spell ${spellId} not found on actor`);
		return false;
	}

	// Check if this is a focus-type spell
	const isFocusSpell = spell.system?.duration?.type === "focus";
	if (!isFocusSpell) {
		console.log(`shadowdark-extras | Spell ${spellName} is not a focus spell, skipping focus tracking`);
		return false;
	}

	// Start tracking with per-turn config
	console.log(`shadowdark-extras | Starting focus tracking for ${spellName} (triggered by effect application)`);
	await startFocusSpell(caster, spell, perTurnConfig);
	return true;
}

/**
 * Handle effect item creation - link to active focus spell if applicable
 */
async function handleEffectCreated(item, options, userId) {
	if (item.type !== "Effect") return;
	if (!item.actor) return;

	// Skip concentration effects - these are on the caster, not targets
	// Without this check, the caster would be added to targetEffects and receive per-turn damage
	const isConcentration = item.getFlag("shadowdark-extras", "isConcentration");
	if (isConcentration) return;

	// Check if this effect was created via the damage card's "Apply Condition" button
	// We need to link it to the caster's active focus spell

	// Get the origin information from the effect if available
	const origin = item.effects?.contents?.[0]?.origin;
	if (!origin) return;

	// Try to find the source actor and spell
	const originDoc = await fromUuid(origin);
	if (!originDoc) return;

	let sourceActor, sourceSpell;

	if (originDoc instanceof Item) {
		sourceSpell = originDoc;
		sourceActor = originDoc.actor;
	} else if (originDoc instanceof Actor) {
		sourceActor = originDoc;
	}

	if (!sourceActor || !sourceSpell) return;

	// Check if the source spell is a focus spell being tracked
	const activeFocus = sourceActor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusEntry = activeFocus.find(f => f.spellId === sourceSpell.id);

	const targetToken = item.actor.getActiveTokens()?.[0];

	if (focusEntry) {
		await linkEffectToFocusSpell(sourceActor, sourceSpell.id, item.actor, targetToken?.id, item.id);
		return;
	}

	// Check if it's a duration spell being tracked
	await linkEffectToDurationSpell(sourceActor, sourceSpell.id, item.actor, targetToken?.id, item.id);
}

/**
 * Handle effect deletion - clean up tracking if needed
 */
async function handleEffectDeleted(item, options, userId) {
	if (item.type !== "Effect") return;

	// Find and clean up any focus/duration spell tracking that referenced this effect
	for (const actor of game.actors) {
		const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG);
		if (activeFocus && activeFocus.length > 0) {
			let updated = false;
			for (const focusEntry of activeFocus) {
				const effectIndex = focusEntry.targetEffects.findIndex(
					te => te.effectItemId === item.id && te.targetActorId === item.actor?.id
				);

				if (effectIndex >= 0) {
					focusEntry.targetEffects.splice(effectIndex, 1);
					updated = true;
				}
			}

			if (updated) {
				await actor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);
			}
		}

		// Check Duration Spells
		const activeDuration = actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG);
		if (activeDuration && activeDuration.length > 0) {
			let updated = false;
			for (const durationEntry of activeDuration) {
				if (!durationEntry.targetEffects) continue;

				const effectIndex = durationEntry.targetEffects.findIndex(
					te => te.effectItemId === item.id && te.targetActorId === item.actor?.id
				);

				if (effectIndex >= 0) {
					durationEntry.targetEffects.splice(effectIndex, 1);
					updated = true;
				}
			}

			if (updated) {
				await actor.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);
			}
		}
	}
}

/**
 * Handle token deletion - clean up any focus/duration tracking that targeted this token
 */
async function handleTokenDeleted(tokenDoc, options, userId) {
	const deletedTokenId = tokenDoc.id;

	// Search all actors for focus/duration spells targeting this token
	for (const actor of game.actors) {
		const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG);
		if (activeFocus && activeFocus.length > 0) {
			let updated = false;
			for (const focusEntry of activeFocus) {
				// Remove any target effects that reference the deleted token
				const originalLength = focusEntry.targetEffects.length;
				focusEntry.targetEffects = focusEntry.targetEffects.filter(
					te => te.targetTokenId !== deletedTokenId
				);

				if (focusEntry.targetEffects.length !== originalLength) {
					updated = true;
					console.log(`shadowdark-extras | Removed target effects for deleted token ${deletedTokenId} from focus spell ${focusEntry.spellName}`);
				}
			}

			if (updated) {
				await actor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);
			}
		}

		// Check Duration Spells
		const activeDuration = actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG);
		if (activeDuration && activeDuration.length > 0) {
			let updated = false;
			for (const durationEntry of activeDuration) {
				// Clean up targetEffects
				if (durationEntry.targetEffects) {
					const originalLength = durationEntry.targetEffects.length;
					durationEntry.targetEffects = durationEntry.targetEffects.filter(
						te => te.targetTokenId !== deletedTokenId
					);
					if (durationEntry.targetEffects.length !== originalLength) updated = true;
				}

				// Clean up targets
				if (durationEntry.targets) {
					const originalLength = durationEntry.targets.length;
					durationEntry.targets = durationEntry.targets.filter(
						t => t.tokenId !== deletedTokenId
					);
					if (durationEntry.targets.length !== originalLength) updated = true;
				}
			}

			if (updated) {
				await actor.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);
				console.log(`shadowdark-extras | Removed targets for deleted token ${deletedTokenId} from duration spells`);
			}
		}
	}
}

// Track which combat turn we've already sent a reminder for
let _lastFocusReminderKey = null;

/**
 * Handle combat update - remind player about active focus spells at turn start
 */
async function handleCombatUpdate(combat, changed, options, userId) {
	// Only trigger on turn or round changes
	if (!("turn" in changed) && !("round" in changed)) return;

	// Create a unique key for this combat turn
	const reminderKey = `${combat.id}-${combat.round}-${combat.turn}`;

	// Skip if we've already sent a reminder for this exact turn
	if (_lastFocusReminderKey === reminderKey) return;
	_lastFocusReminderKey = reminderKey;

	// Get the current combatant (whose turn is now starting)
	const combatant = combat.combatant;
	if (!combatant?.actor) return;

	const actor = combatant.actor;
	const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];

	if (activeFocus.length === 0) return;

	// Only ONE client should create the message to avoid duplicates
	// Prefer the player owner, fallback to the active GM
	const playerOwner = game.users.find(u => !u.isGM && actor.testUserPermission(u, "OWNER"));
	const shouldCreate = playerOwner
		? game.user.id === playerOwner.id
		: (game.user.isGM && game.users.activeGM?.id === game.user.id);
	if (!shouldCreate) return;

	// Build a minimal reminder message with clickable focus roll buttons
	const spellList = activeFocus.map(f => {
		const targets = f.targetEffects.map(te => te.targetName).join(", ") ||
			game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.no_targets");
		return `<div class="sdx-focus-reminder-spell">
			<a class="sdx-focus-roll-btn" data-actor-id="${actor.id}" data-spell-id="${f.spellId}" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.roll_focus")}">
				<i class="fa-solid fa-brain"></i>
			</a>
			<strong>${f.spellName}</strong> → ${targets}
		</div>`;
	}).join("");

	const content = `
		<div class="sdx-focus-reminder" data-actor-id="${actor.id}">
			<div class="sdx-focus-reminder-header">
				<i class="fa-solid fa-brain"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.focus_reminder")}
			</div>
			<div class="sdx-focus-reminder-list">${spellList}</div>
		</div>
	`;

	await ChatMessage.create({
		content: content,
		speaker: ChatMessage.getSpeaker({ actor }),
		whisper: game.users.filter(u => actor.testUserPermission(u, "OWNER")).map(u => u.id),
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	});

	// Process per-turn damage for focus spells (if configured)
	// This runs separately from reminders to handle healing/damage each turn
	for (const focusSpell of activeFocus) {
		if (!focusSpell.perTurnDamage) continue;

		// Process each target that has effects from this focus spell
		for (const targetEffect of focusSpell.targetEffects) {
			// Get the target actor
			let targetActor = null;
			if (targetEffect.targetTokenId) {
				const token = canvas.tokens?.get(targetEffect.targetTokenId);
				targetActor = token?.actor;
			}
			if (!targetActor) {
				targetActor = game.actors.get(targetEffect.targetActorId);
			}

			if (!targetActor) continue;

			// Apply per-turn damage/healing to this target
			await applyFocusSpellPerTurnDamage(focusSpell, targetActor, targetEffect.targetTokenId);
		}
	}
}

/**
 * Apply per-turn damage/healing from a focus spell to a target
 */
async function applyFocusSpellPerTurnDamage(focusSpell, targetActor, targetTokenId) {
	const MODULE_ID = "shadowdark-extras";
	const formula = focusSpell.perTurnDamage;
	if (!formula) return;

	try {
		// Roll the damage/healing
		const roll = new Roll(formula);
		await roll.evaluate();

		// Show 3D dice animation if Dice So Nice is available
		if (game.dice3d) {
			await game.dice3d.showForRoll(roll, game.user, true);
		}


		const damage = roll.total;
		const damageType = focusSpell.damageType || "damage";
		const isHealing = damageType.toLowerCase() === "healing";

		// Get the token
		const token = canvas.tokens?.get(targetTokenId);
		if (!token?.actor) {
			console.warn(`shadowdark-extras | Could not find token ${targetTokenId} for per-turn ${isHealing ? 'healing' : 'damage'}`);
			return;
		}

		// Check if auto-apply is enabled
		const settings = game.settings.get(MODULE_ID, "combatSettings") || {};
		const autoApplyDamage = settings.damageCard?.autoApplyDamage ?? true;

		// Auto-apply if enabled
		if (autoApplyDamage && game.user.isGM) {
			const currentHP = token.actor.system.attributes.hp.value;
			const maxHP = token.actor.system.attributes.hp.max;
			const newHP = isHealing
				? Math.min(maxHP, currentHP + damage)
				: Math.max(0, currentHP - damage);

			await token.actor.update({ "system.attributes.hp.value": newHP });
		}

		// Create chat message
		const content = `
			<div class="sdx-focus-damage-card">
				<div class="sdx-duration-damage-header">
					<i class="fa-solid fa-brain"></i>
					<span class="sdx-duration-damage-title">${focusSpell.spellName}</span>
				</div>
				<div class="sdx-duration-damage-content">
					<span class="sdx-duration-damage-target">
						<strong>${token.name}</strong> ${isHealing ? 'regains' : 'takes'} <strong class="sdx-damage-value">${damage}</strong> ${damageType}${isHealing ? '' : ' damage'}!
					</span>
					<span class="sdx-duration-damage-roll">${formula} = ${roll.result}</span>
				</div>
			</div>
		`;

		await ChatMessage.create({
			content: content,
			speaker: ChatMessage.getSpeaker({ actor: targetActor }),
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		});
	} catch (err) {
		console.error(`shadowdark-extras | Error applying per-turn damage for focus spell: `, err);
	}
}

/**
 * Handle clicks on focus roll buttons in chat messages
 */
function handleFocusReminderChatClick(message, html, data) {
	// Find all focus roll buttons in this message
	const focusRollBtns = html.find(".sdx-focus-roll-btn");
	if (focusRollBtns.length === 0) return;

	focusRollBtns.on("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();

		const btn = event.currentTarget;
		const actorId = btn.dataset.actorId;
		const spellId = btn.dataset.spellId;

		if (!actorId || !spellId) {
			console.warn("shadowdark-extras | Focus roll button missing actorId or spellId");
			return;
		}

		const actor = game.actors.get(actorId);
		if (!actor) {
			ui.notifications.error("Could not find the actor for this focus spell.");
			return;
		}

		// Check if the current user owns this actor
		if (!actor.isOwner) {
			ui.notifications.warn("You do not own this actor.");
			return;
		}

		// Roll the focus check with auto-targeting
		await rollFocusSpellWithTargets(actor, spellId);
	});
}

/**
 * Roll a focus spell check, automatically targeting the tokens affected by the spell.
 * This ensures the damage card system can find the targets even if the player
 * doesn't have them manually targeted.
 * 
 * @param {Actor} actor - The actor rolling the focus check
 * @param {string} spellId - The spell ID to roll focus for
 */
async function rollFocusSpellWithTargets(actor, spellId) {
	// Get the active focus spell data
	const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusEntry = activeFocus.find(f => f.spellId === spellId);

	if (focusEntry && focusEntry.targetEffects && focusEntry.targetEffects.length > 0) {
		// Collect all target token IDs from the focus spell tracking
		const targetTokenIds = focusEntry.targetEffects
			.map(te => te.targetTokenId)
			.filter(id => id); // Filter out null/undefined

		if (targetTokenIds.length > 0) {
			// Get the token documents and programmatically target them
			const tokensToTarget = [];
			for (const tokenId of targetTokenIds) {
				const token = canvas.tokens?.get(tokenId);
				if (token) {
					tokensToTarget.push(token);
				}
			}

			if (tokensToTarget.length > 0) {
				console.log(`shadowdark-extras | Auto-targeting ${tokensToTarget.length} token(s) for focus spell: ${focusEntry.spellName}`);

				// Clear existing targets first, then set new ones
				game.user.targets.forEach(t => t.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: false }));

				// Set targets programmatically using the Token.setTarget method
				for (const token of tokensToTarget) {
					token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
				}
			}
		}
	}

	// Roll the focus check
	const spell = actor.items.get(spellId);

	if (spell) {
		// Spell item still exists - use normal method
		console.log(`shadowdark-extras | Rolling focus check for spell ${spellId} on actor ${actor.name}`);
		actor.castSpell(spellId, { isFocusRoll: true });
	} else if (focusEntry?.spellData) {
		// Spell item no longer exists (e.g., scroll was consumed) - use cached data
		console.log(`shadowdark-extras | Spell item ${spellId} no longer exists, using cached data for focus roll`);
		await rollFocusCheckFromCachedData(actor, focusEntry);
	} else {
		ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.item_no_longer_exists"));
	}
}

/**
 * Roll a focus check using cached spell data when the original item no longer exists
 * (e.g., when the spell was cast from a scroll that was consumed)
 * 
 * @param {Actor} actor - The actor rolling the focus check
 * @param {Object} focusEntry - The focus spell tracking entry with cached spellData
 */
async function rollFocusCheckFromCachedData(actor, focusEntry) {
	const spellData = focusEntry.spellData || {};
	const spellName = focusEntry.spellName;
	const spellImg = focusEntry.spellImg;
	const tier = spellData.tier ?? 1;

	// Create a temporary spell item with the cached data
	// This allows us to use the native Shadowdark roll dialog
	// We need to get the actor's class UUIDs for the spell to be castable
	let classUuids = spellData.class || [];

	// If no class UUIDs cached, try to get from actor's current class
	if (!classUuids.length || classUuids.length === 0) {
		try {
			const actorClass = await actor.getClass();
			if (actorClass) {
				classUuids = [actorClass.uuid];
			}
		} catch (e) {
			console.warn("shadowdark-extras | Could not get actor class for temp spell", e);
		}
	}

	const tempSpellData = {
		name: spellName,
		type: "Spell",
		img: spellImg,
		system: {
			tier: tier,
			description: spellData.description || "",
			duration: {
				type: "focus",
				value: 1
			},
			lost: false,
			// Use the class UUIDs so Shadowdark can determine casting ability
			class: classUuids
		}
	};

	try {
		// Create a temporary embedded spell item on the actor
		const [tempSpell] = await actor.createEmbeddedDocuments("Item", [tempSpellData], { temporary: false });

		if (!tempSpell) {
			throw new Error("Failed to create temporary spell item");
		}

		console.log(`shadowdark-extras | Created temporary spell: ${tempSpell.name} (${tempSpell.id}) for focus roll`);

		// Use the native Shadowdark spell casting mechanism
		// The { isFocusRoll: true } option tells the system this is a focus check
		await actor.castSpell(tempSpell.id, { isFocusRoll: true });

		// Delete the temporary spell item after a brief delay to allow the roll to complete
		// We need to wait because castSpell is async but we need the roll to process first
		setTimeout(async () => {
			try {
				const itemStillExists = actor.items.get(tempSpell.id);
				if (itemStillExists) {
					await actor.deleteEmbeddedDocuments("Item", [tempSpell.id]);
					console.log(`shadowdark-extras | Deleted temporary spell: ${spellName}`);
				}
			} catch (err) {
				console.warn(`shadowdark-extras | Could not delete temporary spell:`, err);
			}
		}, 2000);

	} catch (err) {
		console.error(`shadowdark-extras | Error rolling focus from cached data:`, err);
		ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.focus_roll_error") || "Error rolling focus check");
	}
}

/**
 * Handle clicks on duration damage apply buttons in chat messages
 */
function handleDurationDamageApplyClick(message, html, data) {
	// Find all duration damage apply buttons in this message
	const applyBtns = html.find(".sdx-duration-apply-btn");
	if (applyBtns.length === 0) return;

	applyBtns.on("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();

		const btn = event.currentTarget;
		const $btn = $(btn);

		// Disable immediately to prevent double-clicks
		if ($btn.prop("disabled") || $btn.hasClass("sdx-duration-applied")) {
			return; // Already applied
		}
		$btn.prop("disabled", true).html('<i class="fas fa-spinner fa-spin"></i> Applying...');

		const tokenId = btn.dataset.tokenId;
		const damage = parseInt(btn.dataset.damage);
		const actorName = btn.dataset.actorName;

		if (!tokenId || isNaN(damage)) {
			console.warn("shadowdark-extras | Duration apply button missing tokenId or damage");
			$btn.prop("disabled", false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
			return;
		}

		try {
			// Only GM can apply damage via socket or directly
			if (!game.user.isGM) {
				// Use socket to ask GM to apply
				const socket = getSocket();
				if (socket) {
					socket.executeAsGM("applyDamage", tokenId, damage, actorName);
				} else {
					ui.notifications.warn("Cannot apply damage - no GM connected.");
					$btn.prop("disabled", false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
					return;
				}
			} else {
				// GM applies directly
				const token = canvas.tokens?.get(tokenId);
				if (!token?.actor) {
					ui.notifications.error("Could not find the target token.");
					$btn.prop("disabled", false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
					return;
				}

				const currentHp = token.actor.system.attributes.hp.value;
				const newHp = Math.max(0, currentHp - damage);
				await token.actor.update({ "system.attributes.hp.value": newHp });
			}

			// Update the button to show it was applied
			$btn.html('<i class="fas fa-check"></i> Applied');
			$btn.addClass("sdx-duration-applied");

			// Update the message flags
			await message.setFlag(MODULE_ID, "applied", true);

			ui.notifications.info(`Applied ${damage} damage to ${actorName}`);
		} catch (err) {
			console.error("shadowdark-extras | Failed to apply duration damage:", err);
			$btn.prop("disabled", false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
		}
	});
}

// Track which combat state we've already processed for duration spells
let _lastDurationProcessKey = null;

/**
 * Handle combat update - process duration spell per-turn damage and expiry
 */
async function handleDurationSpellCombatUpdate(combat, changed, options, userId) {
	// Only process on turn changes (when someone's turn starts)
	if (!("turn" in changed) && !("round" in changed)) return;

	// Only GM should process duration spells to avoid duplicates
	if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;

	// Create a unique key for this combat state
	const processKey = `${combat.id}-${combat.round}-${combat.turn}`;
	if (_lastDurationProcessKey === processKey) return;
	_lastDurationProcessKey = processKey;

	const currentRound = combat.round;
	const combatant = combat.combatant;
	if (!combatant?.actor) return;

	const currentActor = combatant.actor;
	const currentTokenId = combatant.token?.id;

	console.log(`shadowdark-extras | Processing duration spells for round ${currentRound}, turn of ${currentActor.name} (token: ${currentTokenId})`);

	// Process all actors with duration spells
	for (const actor of game.actors) {
		const activeDuration = actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
		if (activeDuration.length === 0) continue;

		console.log(`shadowdark-extras | [DEBUG] Actor ${actor.name} has ${activeDuration.length} duration spell(s):`,
			activeDuration.map(d => ({ name: d.spellName, expiryRound: d.expiryRound, currentRound })));

		let needsUpdate = false;
		const expiredSpellIds = [];

		for (const durationSpell of activeDuration) {
			// Use instanceId if available, fallback to spellId
			const spellInstanceId = durationSpell.instanceId || durationSpell.spellId;

			console.log(`shadowdark-extras | [DEBUG] Checking spell ${durationSpell.spellName}: currentRound=${currentRound}, expiryRound=${durationSpell.expiryRound}, shouldExpire=${currentRound >= durationSpell.expiryRound}`);

			// Check for expiry - use >= so spell expires ON the expiry round, not after
			if (currentRound >= durationSpell.expiryRound) {
				console.log(`shadowdark-extras | Duration spell ${durationSpell.spellName} has expired`);
				expiredSpellIds.push(spellInstanceId);
				continue;
			}

			// Check for per-turn damage
			if (durationSpell.perTurnDamage) {
				// Initialize processedTargets tracking if not exists
				if (!durationSpell.processedTargetsThisRound) {
					durationSpell.processedTargetsThisRound = {};
				}

				// Reset processed targets at the start of a new round
				if (durationSpell.lastProcessedRound < currentRound) {
					durationSpell.processedTargetsThisRound = {};
					durationSpell.lastProcessedRound = currentRound;
					needsUpdate = true;
				}

				// Find the target entry for the current combatant
				const targetEntry = durationSpell.targets.find(t =>
					t.tokenId === currentTokenId || t.actorId === currentActor.id
				);

				if (targetEntry) {
					// Check if we already processed this target this round
					const targetKey = targetEntry.tokenId || targetEntry.actorId;
					if (!durationSpell.processedTargetsThisRound[targetKey]) {
						console.log(`shadowdark-extras | Applying per-turn damage for ${durationSpell.spellName} to ${currentActor.name}`);

						// Apply per-turn damage to this target
						await applyDurationSpellPerTurnDamage(durationSpell, currentActor, currentTokenId);

						// Mark this target as processed this round
						durationSpell.processedTargetsThisRound[targetKey] = true;
						needsUpdate = true;
					} else {
						console.log(`shadowdark-extras | Target ${currentActor.name} already processed this round for ${durationSpell.spellName}`);
					}
				}
			}
		}

		// End expired spells using instanceId
		for (const spellInstanceId of expiredSpellIds) {
			await endDurationSpell(actor.id, spellInstanceId, "expired");
		}

		// Update the flag if needed (filter by instanceId or spellId)
		if (needsUpdate) {
			const updatedDuration = activeDuration.filter(d => {
				const id = d.instanceId || d.spellId;
				return !expiredSpellIds.includes(id);
			});
			await actor.setFlag(MODULE_ID, DURATION_SPELL_FLAG, updatedDuration);
		}
	}
}

/**
 * Apply per-turn damage from a duration spell to a target
 * Respects the autoApplyDamage combat setting
 */
async function applyDurationSpellPerTurnDamage(durationSpell, targetActor, targetTokenId) {
	const MODULE_ID = "shadowdark-extras";
	const formula = durationSpell.perTurnDamage;
	if (!formula) return;

	try {
		// Roll the damage
		const roll = new Roll(formula);
		await roll.evaluate();

		// Show 3D dice animation if Dice So Nice is available
		if (game.dice3d) {
			await game.dice3d.showForRoll(roll, game.user, true);
		}


		const damage = roll.total;
		const damageType = durationSpell.damageType || "damage";

		// Get the token
		const token = canvas.tokens?.get(targetTokenId);
		if (!token?.actor) {
			console.warn(`shadowdark-extras | Could not find token ${targetTokenId} for per-turn damage`);
			return;
		}

		// Check if auto-apply is enabled
		const settings = game.settings.get(MODULE_ID, "combatSettings") || {};
		const autoApplyDamage = settings.damageCard?.autoApplyDamage ?? true;

		// Create the chat message content with compact styling
		const applyButtonHtml = !autoApplyDamage ? `
			<button type="button" class="sdx-duration-apply-btn" 
				data-token-id="${targetTokenId}" 
				data-damage="${damage}"
				data-actor-name="${targetActor.name}">
				<i class="fas fa-heart-broken"></i> Apply Damage
			</button>
		` : '';

		const content = `
			<div class="sdx-duration-damage-card">
				<div class="sdx-duration-damage-header">
					<i class="fa-solid fa-hourglass-half"></i>
					<span class="sdx-duration-damage-title">${durationSpell.spellName}</span>
				</div>
				<div class="sdx-duration-damage-content">
					<span class="sdx-duration-damage-target">
						<strong>${token.name}</strong> takes <strong class="sdx-damage-value">${damage}</strong> ${damageType} damage!
					</span>
					<span class="sdx-duration-damage-roll">${formula} = ${roll.result}</span>
				</div>
				${applyButtonHtml}
			</div>
		`;

		// Create the chat message
		const chatMessage = await ChatMessage.create({
			content: content,
			speaker: ChatMessage.getSpeaker({ actor: game.actors.get(durationSpell.casterId) }),
			type: CONST.CHAT_MESSAGE_STYLES.OTHER,
			flags: {
				[MODULE_ID]: {
					isDurationDamage: true,
					tokenId: targetTokenId,
					damage: damage,
					damageType: damageType,
					applied: autoApplyDamage
				}
			}
		});

		// Apply damage if auto-apply is enabled
		if (autoApplyDamage) {
			const currentHp = token.actor.system.attributes.hp.value;
			const newHp = Math.max(0, currentHp - damage);
			await token.actor.update({ "system.attributes.hp.value": newHp });
			console.log(`shadowdark-extras | Auto-applied ${damage} ${damageType} damage to ${targetActor.name} from ${durationSpell.spellName}`);
		} else {
			console.log(`shadowdark-extras | Per-turn damage rolled for ${targetActor.name}: ${damage} ${damageType} (awaiting manual apply)`);
		}
	} catch (err) {
		console.error(`shadowdark-extras | Failed to apply per-turn damage:`, err);
	}
}

/**
 * Link an effect to an active duration spell
 * Call this when applying effects via the damage card for duration spells
 * 
 * @param {string|Actor} casterActorOrId - The caster actor or their ID
 * @param {string} spellId - The spell item ID
 * @param {string|Actor} targetActorOrId - The target actor or their ID
 * @param {string} targetTokenId - The target token ID
 * @param {string} effectItemId - The effect item ID on the target
 */
/**
 * Link an applied effect to a duration spell for cleanup tracking
 * @param {string|Actor} casterActorOrId - The caster actor or ID
 * @param {string} instanceId - The unique instance ID of the spell (or spellId for backwards compatibility)
 * @param {string|Actor} targetActorOrId - The target actor or ID
 * @param {string} targetTokenId - The target token ID
 * @param {string} effectItemId - The effect item ID
 */
export async function linkEffectToDurationSpell(casterActorOrId, instanceId, targetActorOrId, targetTokenId, effectItemId) {
	const caster = typeof casterActorOrId === 'string' ? game.actors.get(casterActorOrId) : casterActorOrId;
	if (!caster) {
		console.warn(`shadowdark-extras | Cannot link effect: caster not found`);
		return false;
	}

	const targetActor = typeof targetActorOrId === 'string' ? game.actors.get(targetActorOrId) : targetActorOrId;

	const activeDuration = caster.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
	// Find by instanceId first, fallback to spellId for backwards compatibility
	// Use findLast for spellId fallback to get the MOST RECENT instance (newest cast)
	let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
	if (!durationEntry) {
		// Find the most recent duration spell with this spellId
		durationEntry = activeDuration.findLast(d => d.spellId === instanceId);
	}

	if (!durationEntry) {
		console.log(`shadowdark-extras | Cannot link effect: spell ${instanceId} is not being tracked as duration spell`);
		return false;
	}

	// Check if this effect is already linked
	if (durationEntry.targetEffects.some(te => te.effectItemId === effectItemId)) {
		console.log(`shadowdark-extras | Effect ${effectItemId} already linked to duration spell ${durationEntry.spellName}`);
		return true;
	}

	// Resolve target name (prefer token name)
	let targetName = targetActor?.name || "Unknown";
	if (targetTokenId) {
		const token = canvas.tokens?.get(targetTokenId);
		if (token) targetName = token.name;
	} else if (targetActor?.token) {
		targetName = targetActor.token.name;
	}

	// Add the effect to tracking
	durationEntry.targetEffects.push({
		targetActorId: targetActor?.id || null,
		targetTokenId: targetTokenId,
		effectItemId: effectItemId,
		targetName: targetName
	});

	// Also add to main targets array if not already present (for UI display)
	// We allow the caster to be a target for Duration spells (e.g. self-buffs like Mage Armor)
	if (targetActor || targetTokenId) {
		const targetAlreadyInList = durationEntry.targets.some(t =>
			(t.actorId && t.actorId === targetActor?.id) ||
			(t.tokenId && t.tokenId === targetTokenId)
		);
		if (!targetAlreadyInList) {
			durationEntry.targets.push({
				tokenId: targetTokenId || null,
				actorId: targetActor?.id || null,
				name: targetName
			});
			console.log(`shadowdark-extras | Added target to duration spell targets: ${targetActor?.name || targetTokenId}`);
		}
	}

	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);

	console.log(`shadowdark-extras | Linked effect ${effectItemId} to duration spell ${durationEntry.spellName}`);
	return true;
}

/**
 * Add a new target to an existing duration spell
 * Used when a creature enters an area of effect
 * 
 * @param {string} casterId - The caster actor ID
 * @param {string} instanceId - The unique instance ID of the spell (or spellId for backwards compatibility)
 * @param {string} tokenId - The token ID to add
 */
export async function addTargetToDurationSpell(casterId, instanceId, tokenId) {
	const caster = game.actors.get(casterId);
	if (!caster) {
		console.warn(`shadowdark-extras | Cannot add target: caster ${casterId} not found`);
		return false;
	}

	const token = canvas.tokens?.get(tokenId);
	if (!token) {
		console.warn(`shadowdark-extras | Cannot add target: token ${tokenId} not found`);
		return false;
	}

	const activeDuration = caster.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
	// Find by instanceId first, fallback to spellId for backwards compatibility
	let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
	if (!durationEntry) {
		durationEntry = activeDuration.find(d => d.spellId === instanceId);
	}

	if (!durationEntry) {
		console.warn(`shadowdark-extras | Cannot add target: spell ${instanceId} not being tracked`);
		return false;
	}

	// Check if already a target
	if (durationEntry.targets.some(t => t.tokenId === tokenId)) {
		ui.notifications.warn(`${token.name} is already a target of ${durationEntry.spellName}`);
		return false;
	}

	// Add the target
	durationEntry.targets.push({
		tokenId: tokenId,
		actorId: token.actor?.id || null,
		name: token.name || "Unknown"
	});

	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);

	// Apply effects if the spell has any
	if (durationEntry.effects && durationEntry.effects.length > 0) {
		let effects = durationEntry.effects;
		if (typeof effects === 'string') {
			try {
				effects = JSON.parse(effects);
			} catch (e) {
				effects = [];
			}
		}

		// Use instanceId for linking effects
		const spellInstanceId = durationEntry.instanceId || durationEntry.spellId;

		for (const effectData of effects) {
			const effectUuid = typeof effectData === 'string' ? effectData : effectData.uuid;
			try {
				let createdEffectId = null;

				// Use socket for GM operation to handle permission issues
				const socket = getFocusSpellSocket();
				if (socket) {
					const result = await socket.executeAsGM("applyEffectToTarget", {
						targetActorId: token.actor?.id,
						targetTokenId: tokenId,
						effectUuid: effectUuid,
						casterId: casterId,
						spellId: spellInstanceId
					});
					if (result.success) {
						createdEffectId = result.effectId;
					}
				} else {
					// Fallback for GM or if socket not available
					const effectDoc = await fromUuid(effectUuid);
					if (!effectDoc) continue;

					const effectItemData = effectDoc.toObject();
					const createdItems = await token.actor.createEmbeddedDocuments("Item", [effectItemData]);

					if (createdItems.length > 0) {
						createdEffectId = createdItems[0].id;
					}
				}

				if (createdEffectId) {
					// Link the effect to the duration spell using instanceId
					await linkEffectToDurationSpell(casterId, spellInstanceId, token.actor.id, tokenId, createdEffectId);
					console.log(`shadowdark-extras | Applied effect to new target ${token.name}`);
				}
			} catch (err) {
				console.warn(`shadowdark-extras | Failed to apply effect to new target:`, err);
			}
		}
	}

	ui.notifications.info(`Added ${token.name} to ${durationEntry.spellName}`);
	caster.sheet?.render(false);

	// Post to chat
	const content = `
		<div class="shadowdark chat-card sdx-duration-damage">
			<header class="card-header flexrow">
				<img src="${durationEntry.spellImg}" alt="${durationEntry.spellName}"/>
				<h3>${durationEntry.spellName} - Target Added</h3>
			</header>
			<div class="card-content">
				<p><strong>${token.name}</strong> has entered the area of effect.</p>
			</div>
		</div>
	`;

	await ChatMessage.create({
		content: content,
		speaker: ChatMessage.getSpeaker({ actor: caster }),
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	});

	console.log(`shadowdark-extras | Added ${token.name} to duration spell ${durationEntry.spellName}`);
	return true;
}

/**
 * Remove a target from an existing duration spell
 * Used when a creature leaves an area of effect
 * 
 * @param {string} casterId - The caster actor ID
 * @param {string} instanceId - The unique instance ID of the spell (or spellId for backwards compatibility)
 * @param {string} tokenId - The token ID to remove
 */
export async function removeTargetFromDurationSpell(casterId, instanceId, tokenId) {
	const caster = game.actors.get(casterId);
	if (!caster) {
		console.warn(`shadowdark-extras | Cannot remove target: caster ${casterId} not found`);
		return false;
	}

	const activeDuration = caster.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
	// Find by instanceId first, fallback to spellId for backwards compatibility
	let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
	if (!durationEntry) {
		durationEntry = activeDuration.find(d => d.spellId === instanceId);
	}

	if (!durationEntry) {
		console.warn(`shadowdark-extras | Cannot remove target: spell ${instanceId} not being tracked`);
		return false;
	}

	// Find and remove the target
	const targetIndex = durationEntry.targets.findIndex(t => t.tokenId === tokenId);
	if (targetIndex < 0) {
		console.warn(`shadowdark-extras | Target ${tokenId} not found in spell targets`);
		return false;
	}

	const removedTarget = durationEntry.targets[targetIndex];
	durationEntry.targets.splice(targetIndex, 1);

	// Remove any effects applied to this target
	const effectsToRemove = durationEntry.targetEffects?.filter(te => te.targetTokenId === tokenId) || [];

	for (const targetEffect of effectsToRemove) {
		try {
			// Use socketlib to remove the effect as GM
			const socket = getFocusSpellSocket();
			if (socket) {
				await socket.executeAsGM("removeTargetEffect", {
					targetActorId: targetEffect.targetActorId,
					targetTokenId: targetEffect.targetTokenId,
					effectItemId: targetEffect.effectItemId
				});
				console.log(`shadowdark-extras | Removed effect via socket from ${removedTarget.name}`);
			} else {
				// Fallback for GM or if socket not available
				let targetActor = null;
				const token = canvas.tokens?.get(tokenId);
				if (token?.actor) {
					targetActor = token.actor;
				} else if (targetEffect.targetActorId) {
					targetActor = game.actors.get(targetEffect.targetActorId);
				}

				if (targetActor) {
					// Check for Item first
					let effectDoc = targetActor.items.get(targetEffect.effectItemId);

					// If not an Item, check for ActiveEffect (e.g. Auras)
					if (!effectDoc) {
						effectDoc = targetActor.effects.get(targetEffect.effectItemId);
					}

					if (effectDoc) {
						await effectDoc.delete();
						console.log(`shadowdark-extras | Removed effect ${effectDoc.name || targetEffect.effectItemId} from ${removedTarget.name}`);
					}
				}
			}
		} catch (err) {
			console.warn(`shadowdark-extras | Failed to remove effect from target:`, err);
		}
	}

	// Remove the effect references from tracking
	durationEntry.targetEffects = durationEntry.targetEffects?.filter(te => te.targetTokenId !== tokenId) || [];

	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);

	ui.notifications.info(`Removed ${removedTarget.name} from ${durationEntry.spellName}`);
	caster.sheet?.render(false);

	// Post to chat
	const content = `
		<div class="shadowdark chat-card sdx-duration-damage">
			<header class="card-header flexrow">
				<img src="${durationEntry.spellImg}" alt="${durationEntry.spellName}"/>
				<h3>${durationEntry.spellName} - Target Removed</h3>
			</header>
			<div class="card-content">
				<p><strong>${removedTarget.name}</strong> has left the area of effect.</p>
				${effectsToRemove.length > 0 ? `<p>Effects removed.</p>` : ""}
			</div>
		</div>
	`;

	await ChatMessage.create({
		content: content,
		speaker: ChatMessage.getSpeaker({ actor: caster }),
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	});

	console.log(`shadowdark-extras | Removed ${removedTarget.name} from duration spell ${durationEntry.spellName}`);
	return true;
}

/**
 * End a focus spell and remove all associated effects
 * @param {string} casterId - The actor ID of the caster
 * @param {string} spellId - The spell item ID
 * @param {string} reason - Why the focus ended ("focus_failed", "manual", "spell_lost")
 */
export async function endFocusSpell(casterId, spellId, reason = "manual") {
	const caster = game.actors.get(casterId);
	if (!caster) {
		console.warn(`shadowdark-extras | Cannot end focus spell: caster ${casterId} not found`);
		return;
	}

	const activeFocus = caster.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusIndex = activeFocus.findIndex(f => f.spellId === spellId);

	if (focusIndex < 0) {
		console.warn(`shadowdark-extras | Cannot end focus spell: spell ${spellId} not being focused`);
		return;
	}

	const focusEntry = activeFocus[focusIndex];

	// Remove all effects applied to targets
	const removalPromises = focusEntry.targetEffects.map(async (targetEffect) => {
		try {
			// For unlinked tokens, we need to get the actor from the token, not from game.actors
			// The effect is on the synthetic token actor, not the base actor
			let targetActor = null;

			// Try to get the actor from the token first (for unlinked tokens)
			if (targetEffect.targetTokenId) {
				const token = canvas.tokens?.get(targetEffect.targetTokenId);
				if (token?.actor) {
					targetActor = token.actor;
					console.log(`shadowdark-extras | Found target actor from token: ${targetActor.name}`);
				}
			}

			// Fall back to game.actors (for linked tokens or if token not found)
			if (!targetActor) {
				targetActor = game.actors.get(targetEffect.targetActorId);
			}

			if (!targetActor) {
				console.warn(`shadowdark-extras | Target actor ${targetEffect.targetActorId} not found (token: ${targetEffect.targetTokenId})`);
				return;
			}

			// Check for Item first
			let effectDoc = targetActor.items.get(targetEffect.effectItemId);

			// If not an Item, check for ActiveEffect (e.g. Auras)
			if (!effectDoc) {
				effectDoc = targetActor.effects.get(targetEffect.effectItemId);
			}

			if (!effectDoc) {
				console.warn(`shadowdark-extras | Effect item/document ${targetEffect.effectItemId} not found on ${targetActor.name}`);
				return;
			}

			// Delete the effect - use socket if we don't have permission
			const socket = getFocusSpellSocket();
			if (game.user.isGM || targetActor.isOwner) {
				await effectDoc.delete();
				console.log(`shadowdark-extras | Removed effect ${effectDoc.name || targetEffect.effectItemId} from ${targetActor.name}`);
			} else if (socket) {
				await socket.executeAsGM("removeTargetEffect", {
					targetActorId: targetEffect.targetActorId,
					targetTokenId: targetEffect.targetTokenId,
					effectItemId: targetEffect.effectItemId
				});
			}
		} catch (err) {
			console.error(`shadowdark-extras | Error removing effect:`, err);
		}
	});

	await Promise.all(removalPromises);

	// Remove the Concentration effect from the caster
	if (focusEntry.concentrationEffectId) {
		const effectItem = caster.items.get(focusEntry.concentrationEffectId);
		if (effectItem) {
			await effectItem.delete();
			console.log(`shadowdark-extras | Removed concentration effect ${effectItem.name} from caster`);
		}
	} else {
		// Fallback: search for any concentration effect linked to this spell
		const strayEffect = caster.items.find(i =>
			i.type === "Effect" &&
			i.flags?.[MODULE_ID]?.isConcentration &&
			i.flags?.[MODULE_ID]?.spellId === spellId
		);
		if (strayEffect) {
			await strayEffect.delete();
			console.log(`shadowdark-extras | Removed stray concentration effect ${strayEffect.name} from caster`);
		}
	}

	// Remove the focus entry from tracking
	activeFocus.splice(focusIndex, 1);
	await caster.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	// Show notification
	const reasonKey = `SHADOWDARK_EXTRAS.focus_tracker.ended_${reason}`;
	const message = game.i18n.format(reasonKey, {
		spellName: focusEntry.spellName,
		targetCount: focusEntry.targetEffects.length
	});
	ui.notifications.info(message);

	// Post to chat
	const chatContent = await renderFocusEndedChat(focusEntry, reason);
	await ChatMessage.create({
		content: chatContent,
		speaker: ChatMessage.getSpeaker({ actor: caster }),
		type: CONST.CHAT_MESSAGE_STYLES.OTHER
	});

	// Refresh the actor sheet if open
	caster.sheet?.render(false);
}

/**
 * Render chat message for when focus ends
 */
async function renderFocusEndedChat(focusEntry, reason) {
	const reasonText = game.i18n.localize(`SHADOWDARK_EXTRAS.focus_tracker.reason_${reason}`);

	let targetList = "";
	if (focusEntry.targetEffects.length > 0) {
		targetList = "<ul>" + focusEntry.targetEffects.map(te =>
			`<li>${te.targetName}</li>`
		).join("") + "</ul>";
	}

	return `
		<div class="shadowdark chat-card focus-ended">
			<header class="card-header flexrow">
				<img class="focus-ended-icon" src="${focusEntry.spellImg}" alt="${focusEntry.spellName}"/>
				<div class="focus-ended-header-text">
					<h3>${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.focus_ended")}</h3>
					<p class="spell-name">${focusEntry.spellName}</p>
				</div>
			</header>
			<div class="card-content">
				<p class="reason-text">${reasonText}</p>
				${focusEntry.targetEffects.length > 0 ? `
					<p>${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.effects_removed")}:</p>
					${targetList}
				` : ""}
			</div>
		</div>
	`;
}

/**
 * Inject focus spells UI into the player sheet's spells tab
 */
function injectFocusSpellsUI(sheet, html, data) {
	const actor = sheet.actor;
	if (!actor) return;

	const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const activeDuration = actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];

	// Find the spells tab
	const spellsTab = html.find(".tab-spells");
	if (spellsTab.length === 0) return;

	// Build and inject duration spells section (if any)
	if (activeDuration.length > 0) {
		const durationHtml = buildDurationSpellsHtml(actor, activeDuration);
		spellsTab.prepend(durationHtml);

		// Attach end duration event listener
		spellsTab.find("[data-action='end-duration']").on("click", async (event) => {
			event.preventDefault();
			const instanceId = event.currentTarget.dataset.instanceId;
			await endDurationSpell(actor.id, instanceId, "manual");
		});

		// Toggle targets list visibility
		spellsTab.find("[data-action='toggle-duration-targets']").on("click", (event) => {
			event.preventDefault();
			const instanceId = event.currentTarget.dataset.instanceId;
			const targetsList = spellsTab.find(`.sdx-duration-targets-list[data-instance-id="${instanceId}"]`);
			const icon = $(event.currentTarget).find("i");

			if (targetsList.is(":visible")) {
				targetsList.slideUp(200);
				icon.removeClass("fa-chevron-up").addClass("fa-chevron-down");
			} else {
				targetsList.slideDown(200);
				icon.removeClass("fa-chevron-down").addClass("fa-chevron-up");
			}
		});

		// Add target to duration spell
		spellsTab.find("[data-action='add-duration-target']").on("click", async (event) => {
			event.preventDefault();
			const instanceId = event.currentTarget.dataset.instanceId;

			// Get currently targeted tokens
			const targets = Array.from(game.user.targets || []);
			if (targets.length === 0) {
				ui.notifications.warn("Please target one or more tokens to add to the spell area.");
				return;
			}

			// Find by instanceId first, fallback to spellId
			let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
			if (!durationEntry) {
				durationEntry = activeDuration.find(d => d.spellId === instanceId);
			}
			if (!durationEntry) return;

			// Confirm adding targets
			const targetNames = targets.map(t => t.name).join(", ");
			const confirmed = await Dialog.confirm({
				title: "Add Targets to Spell",
				content: `<p>Add <strong>${targetNames}</strong> to <strong>${durationEntry.spellName}</strong>?</p>
				          <p>They will receive the spell's effects and start taking per-turn damage.</p>`,
				defaultYes: true
			});

			if (confirmed) {
				for (const token of targets) {
					await addTargetToDurationSpell(actor.id, instanceId, token.id);
				}
			}
		});

		// Remove individual target from duration spell
		spellsTab.find("[data-action='remove-duration-target']").on("click", async (event) => {
			event.preventDefault();
			event.stopPropagation();
			const instanceId = event.currentTarget.dataset.instanceId;
			const tokenId = event.currentTarget.dataset.tokenId;

			// Find by instanceId first, fallback to spellId
			let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
			if (!durationEntry) {
				durationEntry = activeDuration.find(d => d.spellId === instanceId);
			}
			const target = durationEntry?.targets?.find(t => t.tokenId === tokenId);

			if (!target) return;

			const confirmed = await Dialog.confirm({
				title: "Remove Target from Spell",
				content: `<p>Remove <strong>${target.name}</strong> from <strong>${durationEntry.spellName}</strong>?</p>
				          <p>Any effects applied by this spell will be removed from them.</p>`,
				defaultYes: true
			});

			if (confirmed) {
				await removeTargetFromDurationSpell(actor.id, instanceId, tokenId);
			}
		});

		// Pan to target token (click handler)
		spellsTab.find(".sdx-duration-target").each((i, targetEl) => {
			const $target = $(targetEl);
			const tokenId = $target.data("token-id");

			// Inject pan button if it doesn't exist
			if (tokenId && !$target.find(".sdx-pan-to-target").length) {
				const $nameSpan = $target.find(".sdx-target-name");
				const $panButton = $(`
					<a class="sdx-pan-to-target" data-token-id="${tokenId}" 
					   data-tooltip="Pan camera to this token" 
					   style="margin: 0 4px; cursor: pointer;">
						<i class="fas fa-location-crosshairs" style="color: #3498db;"></i>
					</a>
				`);
				$panButton.insertAfter($nameSpan);
			}
		});

		// Click handler for pan button
		spellsTab.find(".sdx-pan-to-target").on("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const tokenId = event.currentTarget.dataset.tokenId;
			const token = canvas.tokens?.get(tokenId);

			if (token) {
				canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
			} else {
				ui.notifications.warn("Token not found on this scene.");
			}
		});

		// Hover handler for visual highlighting
		spellsTab.find(".sdx-duration-target").on("mouseenter", (event) => {
			const $target = $(event.currentTarget);
			const tokenId = $target.data("token-id");
			const token = canvas.tokens?.get(tokenId);

			if (token) {
				// Create a visual ping effect
				canvas.ping(token.center, {
					style: CONFIG.Canvas.pings.types.PULSE,
					color: "#3498db",
					duration: 1500
				});
			}
		});
	}

	// Build and inject focus spells section (if any)
	if (activeFocus.length > 0) {
		const focusHtml = buildFocusSpellsHtml(actor, activeFocus);
		spellsTab.prepend(focusHtml);

		// Attach event listeners
		spellsTab.find("[data-action='end-focus']").on("click", async (event) => {
			event.preventDefault();
			const spellId = event.currentTarget.dataset.spellId;

			const focusEntry = activeFocus.find(f => f.spellId === spellId);
			const confirmed = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.end_focus_title"),
				content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.end_focus_confirm", {
					spellName: focusEntry?.spellName ?? "Unknown",
					targetCount: focusEntry?.targetEffects?.length ?? 0
				})}</p>`,
				defaultYes: false
			});

			if (confirmed) {
				await endFocusSpell(actor.id, spellId, "manual");
			}
		});

		// Focus roll button
		spellsTab.find("[data-action='focus-roll']").on("click", async (event) => {
			event.preventDefault();
			const spellId = event.currentTarget.dataset.spellId;
			await rollFocusSpellWithTargets(actor, spellId);
		});

		// Disable brain icons for currently focused spells
		const focusedSpellIds = activeFocus.map(f => f.spellId);
		for (const spellId of focusedSpellIds) {
			const spellItem = spellsTab.find(`li.item[data-item-id="${spellId}"]`);
			if (spellItem.length) {
				const focusAction = spellItem.find("[data-action='focus-spell']");
				if (focusAction.length) {
					focusAction.addClass("sdx-disabled");
					focusAction.prop("disabled", true);
					focusAction.off("click").on("click", (e) => e.preventDefault());
				}
			}
		}
	}
}

/**
 * Build HTML for the active duration spells section
 */
function buildDurationSpellsHtml(actor, activeDuration) {
	const currentRound = game.combat?.round ?? 0;
	let spellsHtml = "";

	for (const duration of activeDuration) {
		const remainingRounds = Math.max(0, duration.expiryRound - currentRound);
		const targetCount = duration.targets?.length || 0;
		// Use instanceId if available, fallback to spellId
		const spellInstanceId = duration.instanceId || duration.spellId;

		// Build target list HTML with individual remove buttons
		let targetsListHtml = "";
		if (duration.targets && duration.targets.length > 0) {
			for (const target of duration.targets) {
				// Check if this target has effects applied
				const hasEffects = duration.targetEffects?.some(te =>
					te.targetTokenId === target.tokenId || te.targetActorId === target.actorId
				);

				targetsListHtml += `
					<div class="sdx-duration-target" data-token-id="${target.tokenId}" data-actor-id="${target.actorId || ''}">
						<span class="sdx-target-name">
							<i class="fas fa-user"></i> ${target.name}
							${hasEffects ? '<i class="fas fa-magic" title="Has effects applied" style="color: #9b59b6; margin-left: 4px;"></i>' : ''}
						</span>
						<a class="sdx-remove-target" data-action="remove-duration-target" 
						   data-instance-id="${spellInstanceId}" 
						   data-token-id="${target.tokenId}"
						   data-tooltip="Remove from spell (left area)">
							<i class="fas fa-times" style="color: #ff6666;"></i>
						</a>
					</div>
				`;
			}
		} else {
			targetsListHtml = '<div class="sdx-no-targets">No targets</div>';
		}

		spellsHtml += `
			<li class="item sdx-duration-spell" data-instance-id="${spellInstanceId}" data-spell-id="${duration.spellId}">
				<div class="sdx-duration-spell-header">
					<div class="item-image" style="background-image: url(${duration.spellImg})">
						<i class="fas fa-clock"></i>
					</div>
					<div class="sdx-focus-info">
						<span class="sdx-duration-spell-name">${duration.spellName}</span>
					</div>
					<span class="sdx-duration-time" title="Remaining duration">
						${remainingRounds} rnd${remainingRounds !== 1 ? 's' : ''}
					</span>
					<span class="sdx-focus-targets">
						<i class="fas fa-bullseye"></i> ${targetCount}
					</span>
					<div class="actions">
						<a data-action="toggle-duration-targets" data-instance-id="${spellInstanceId}"
						   data-tooltip="Show/hide targets">
							<i class="fas fa-chevron-down"></i>
						</a>
						<a data-action="add-duration-target" data-instance-id="${spellInstanceId}"
						   data-tooltip="Add selected token to spell (entered area)">
							<i class="fas fa-plus" style="color: #2ecc71;"></i>
						</a>
						<a data-action="end-duration" data-instance-id="${spellInstanceId}"
						   data-tooltip="End this spell">
							<i class="fa-solid fa-xmark" style="color: #ff6666;"></i>
						</a>
					</div>
				</div>
				<div class="sdx-duration-targets-list" data-instance-id="${spellInstanceId}" style="display: none;">
					${targetsListHtml}
				</div>
			</li>
		`;
	}

	return `
		<div class="SD-box sdx-duration-spells-section">
			<div class="header">
				<label>
					<i class="fas fa-clock"></i>
					Active Duration Spells
				</label>
			</div>
			<div class="content">
				<ol class="SD-list sdx-duration-spells-list">
					${spellsHtml}
				</ol>
			</div>
		</div>
		<br>
	`;
}

/**
 * Disable right-click context menu on spell items
 */
function disableSpellContextMenu(sheet, html, data) {
	const spellsTab = html.find(".tab-spells");
	if (spellsTab.length === 0) return;

	// Disable Foundry's context menu by overriding the context menu entries for spell items
	spellsTab.find("li.item").each((i, el) => {
		$(el).on("contextmenu", (e) => {
			e.preventDefault();
			e.stopImmediatePropagation();
			return false;
		});
	});
}

/**
 * Build HTML for the active focus spells section
 */
function buildFocusSpellsHtml(actor, activeFocus) {
	let spellsHtml = "";

	for (const focus of activeFocus) {
		// Calculate how long focus has been maintained
		const focusedTime = calculateFocusDuration(focus);

		// Filter out concentration effects (effects on the caster) for display
		const nonConcentrationEffects = focus.targetEffects.filter(te => te.targetActorId !== focus.casterId);
		const targetCount = nonConcentrationEffects.length;

		// Build target list for tooltip (excluding concentration on caster)
		const targetsList = nonConcentrationEffects.map(te => te.targetName).join(", ") ||
			game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.no_targets");

		spellsHtml += `
			<li class="item sdx-focus-spell" data-spell-id="${focus.spellId}">
				<div class="item-image" style="background-image: url(${focus.spellImg})">
					<i class="fa-solid fa-brain"></i>
				</div>
				<div class="sdx-focus-info">
					<span class="sdx-focus-spell-name">${focus.spellName}</span>
				</div>
				<span class="sdx-focus-time" title="${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.time_focused")}">${focusedTime}</span>
				<span class="sdx-focus-targets" title="${targetsList}">
					<i class="fas fa-bullseye"></i> ${targetCount}
				</span>
				<div class="actions">
					<a data-action="focus-roll" data-spell-id="${focus.spellId}" 
					   data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.roll_focus")}">
						<i class="fa-solid fa-brain"></i>
					</a>
					<a data-action="end-focus" data-spell-id="${focus.spellId}"
					   data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.end_focus")}">
						<i class="fa-solid fa-xmark" style="color: #ff6666;"></i>
					</a>
				</div>
			</li>
		`;
	}

	return `
		<div class="SD-box sdx-focus-spells-section">
			<div class="header">
				<label>
					<i class="fa-solid fa-brain"></i>
					${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.active_focus_spells")}
				</label>
			</div>
			<div class="content">
				<ol class="SD-list sdx-focus-spells-list">
					${spellsHtml}
				</ol>
			</div>
		</div>
		<br>
	`;
}

/**
 * Calculate how long focus has been maintained
 */
function calculateFocusDuration(focus) {
	if (game.combat && focus.startRound !== null) {
		const rounds = game.combat.round - focus.startRound;
		return game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.rounds", { count: rounds });
	}

	const seconds = game.time.worldTime - focus.startTime;

	if (seconds < 60) {
		return game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.seconds", { count: seconds });
	} else if (seconds < 3600) {
		const minutes = Math.floor(seconds / 60);
		return game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.minutes", { count: minutes });
	} else {
		const hours = Math.floor(seconds / 3600);
		return game.i18n.format("SHADOWDARK_EXTRAS.focus_tracker.hours", { count: hours });
	}
}

/**
 * Get all active focus spells for an actor
 */
export function getActiveFocusSpells(actor) {
	return actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
}

/**
 * Check if an actor is currently focusing on a specific spell
 */
export function isFocusingOnSpell(actor, spellId) {
	const activeFocus = getActiveFocusSpells(actor);
	return activeFocus.some(f => f.spellId === spellId);
}

/**
 * Manually link an effect to an active focus spell
 * Call this when applying effects via the damage card
 * 
 * @param {string|Actor} casterActorOrId - The caster actor or their ID
 * @param {string} spellId - The spell item ID
 * @param {string|Actor} targetActorOrId - The target actor or their ID
 * @param {string} targetTokenId - The target token ID (required for unlinked tokens)
 * @param {string} effectItemId - The effect item ID on the target
 */
export async function linkEffectToFocusSpell(casterActorOrId, spellId, targetActorOrId, targetTokenId, effectItemId) {
	// Resolve caster actor
	const casterActor = typeof casterActorOrId === 'string'
		? game.actors.get(casterActorOrId)
		: casterActorOrId;

	if (!casterActor) {
		console.warn(`shadowdark-extras | Cannot link effect: caster actor not found`);
		return false;
	}

	// Resolve target actor - for unlinked tokens, we need to get from the token
	let targetActor = null;
	let resolvedTokenId = targetTokenId;

	// Try to get the actor from the token first (for unlinked tokens)
	if (targetTokenId) {
		const token = canvas.tokens?.get(targetTokenId);
		if (token?.actor) {
			targetActor = token.actor;
		}
	}

	// Fall back to game.actors or direct actor reference
	if (!targetActor) {
		targetActor = typeof targetActorOrId === 'string'
			? game.actors.get(targetActorOrId)
			: targetActorOrId;
	}

	if (!targetActor) {
		console.warn(`shadowdark-extras | Cannot link effect: target actor not found`);
		return false;
	}

	// If we didn't have a token ID, try to find one
	if (!resolvedTokenId) {
		resolvedTokenId = targetActor.getActiveTokens()?.[0]?.id || null;
	}

	const activeFocus = casterActor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusEntry = activeFocus.find(f => f.spellId === spellId);

	if (!focusEntry) {
		console.log(`shadowdark-extras | Cannot link effect: spell ${spellId} is not being focused (this is normal for non-focus spells)`);
		return false;
	}

	// Check if this effect is already linked
	const existing = focusEntry.targetEffects.find(
		te => te.effectItemId === effectItemId && te.targetActorId === targetActor.id
	);

	if (existing) {
		return true; // Already linked
	}

	// Resolve target name (prefer token name)
	let targetName = targetActor.name;
	if (resolvedTokenId) {
		const token = canvas.tokens?.get(resolvedTokenId);
		if (token) targetName = token.name;
	} else if (targetActor.token) {
		targetName = targetActor.token.name;
	}

	focusEntry.targetEffects.push({
		targetActorId: targetActor.id,
		targetTokenId: resolvedTokenId,
		effectItemId: effectItemId,
		targetName: targetName
	});

	await casterActor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	console.log(`shadowdark-extras | Linked effect ${effectItemId} to focus spell ${spellId}`);

	// Refresh the actor sheet if open
	casterActor.sheet?.render(false);

	return true;
}

/**
 * Link a target to an active focus spell without requiring an effect
 * Use this for spells that only deal damage/healing without transferring conditions
 * 
 * @param {string|Actor} casterActorOrId - The caster actor or their ID
 * @param {string} spellId - The spell item ID
 * @param {string|Actor} targetActorOrId - The target actor or their ID
 * @param {string} targetTokenId - The target token ID (required for unlinked tokens)
 */
export async function linkTargetToFocusSpell(casterActorOrId, spellId, targetActorOrId, targetTokenId) {
	// Resolve caster actor
	const casterActor = typeof casterActorOrId === 'string'
		? game.actors.get(casterActorOrId)
		: casterActorOrId;

	if (!casterActor) {
		console.warn(`shadowdark-extras | Cannot link target: caster actor not found`);
		return false;
	}

	// Resolve target actor
	let targetActor = null;
	let resolvedTokenId = targetTokenId;

	if (targetTokenId) {
		const token = canvas.tokens?.get(targetTokenId);
		if (token?.actor) {
			targetActor = token.actor;
			resolvedTokenId = targetTokenId;
		}
	}

	if (!targetActor) {
		targetActor = typeof targetActorOrId === 'string'
			? game.actors.get(targetActorOrId)
			: targetActorOrId;
	}

	if (!targetActor) {
		console.warn(`shadowdark-extras | Cannot link target: target actor not found`);
		return false;
	}

	// Find the focus spell entry
	const activeFocus = casterActor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusEntry = activeFocus.find(f => f.spellId === spellId);

	if (!focusEntry) {
		console.warn(`shadowdark-extras | Cannot link target: focus spell ${spellId} not found in tracking`);
		return false;
	}

	// Check if this target is already linked (by actor/token)
	const existing = focusEntry.targetEffects.find(
		te => (te.targetTokenId && te.targetTokenId === resolvedTokenId) ||
			(te.targetActorId === targetActor.id && !te.targetTokenId)
	);

	if (existing) {
		return true; // Already linked
	}

	// Resolve target name (prefer token name)
	let targetName = targetActor.name;
	if (resolvedTokenId) {
		const token = canvas.tokens?.get(resolvedTokenId);
		if (token) targetName = token.name;
	} else if (targetActor.token) {
		targetName = targetActor.token.name;
	}

	// Add target without an effect ID
	focusEntry.targetEffects.push({
		targetActorId: targetActor.id,
		targetTokenId: resolvedTokenId,
		effectItemId: null, // No effect, just tracking the target
		targetName: targetName
	});

	await casterActor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	console.log(`shadowdark-extras | Linked target ${targetName} to focus spell ${spellId} (no effect)`);

	// Refresh the actor sheet if open
	casterActor.sheet?.render(false);

	return true;
}
/**
 * Unlink an effect from a focus spell's tracking
 * Called when an effect is removed/replaced before a new one is applied
 * 
 * @param {string} casterActorId - The caster actor ID
 * @param {string} spellId - The spell item ID
 * @param {string} effectItemId - The effect item ID to unlink
 */
export async function unlinkEffectFromFocusSpell(casterActorId, spellId, effectItemId) {
	const casterActor = game.actors.get(casterActorId);
	if (!casterActor) return false;

	const activeFocus = casterActor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG) || [];
	const focusEntry = activeFocus.find(f => f.spellId === spellId);

	if (!focusEntry) return false;

	const effectIndex = focusEntry.targetEffects.findIndex(te => te.effectItemId === effectItemId);
	if (effectIndex < 0) return false;

	// Remove the effect from tracking
	focusEntry.targetEffects.splice(effectIndex, 1);
	await casterActor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	console.log(`shadowdark-extras | Unlinked effect ${effectItemId} from focus spell ${spellId}`);
	return true;
}

/**
 * Handle wand uses tracking - decrement uses when a wand is cast
 * This runs on chat message render to detect wand casts
 */
async function handleWandUsesTracking(message, html, data) {
	// Only process if current user is the author to avoid duplicate processing
	if (message.author?.id !== game.user.id) return;

	// Check if wand uses tracking is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableWandUses")) return;
	} catch {
		return;
	}

	// Check if this is a Shadowdark roll message
	const sdFlags = message.flags?.shadowdark;
	if (!sdFlags?.isRoll) return;

	// Get actor and item IDs from the chat card HTML
	const chatCard = html.find('.chat-card');
	if (!chatCard.length) return;

	const actorId = chatCard.data('actorId');
	const itemId = chatCard.data('itemId');

	if (!actorId || !itemId) return;

	const actor = game.actors.get(actorId);
	const item = actor?.items.get(itemId);

	if (!actor || !item) return;

	// Only process Wand items
	if (item.type !== "Wand") return;

	// Check if this wand has uses tracking enabled
	const wandUsesFlags = item.flags?.[MODULE_ID]?.wandUses;
	if (!wandUsesFlags?.enabled) return;

	const currentUses = wandUsesFlags.current ?? 0;
	const maxUses = wandUsesFlags.max ?? 0;

	// Check if this is a focus check (not initial cast) - don't consume uses for focus checks
	const focusCheckText = game.i18n.localize("SHADOWDARK.chat.spell_focus_check");
	const isFocusCheck = message.flavor?.includes(focusCheckText) || message.flavor?.includes("Focus Check");
	if (isFocusCheck) {
		console.log(`shadowdark-extras | Wand focus check detected, not consuming uses for ${item.name}`);
		return;
	}

	// Decrement uses (on any cast, success or failure)
	if (currentUses > 0) {
		const newUses = currentUses - 1;
		await item.update({
			[`flags.${MODULE_ID}.wandUses.current`]: newUses
		});

		console.log(`shadowdark-extras | Wand ${item.name} uses: ${currentUses} -> ${newUses}`);

		// Notify if wand is depleted
		if (newUses === 0) {
			ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.wand.depleted", { name: item.name }));
		}
	}
}

/**
 * Inject wand uses display into player sheet spell list
 * Shows current/max uses next to wand names in the "SPELLS FROM ITEMS" section
 */
function injectWandUsesDisplay(app, html, data) {
	// Check if wand uses tracking is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableWandUses")) return;
	} catch {
		return;
	}

	const actor = app.actor;
	if (!actor) return;

	// Handle v13 native HTML elements
	const $html = html instanceof HTMLElement ? $(html) : html;

	// Find all item entries in the spell tab (wands are in SD-list with li.item elements)
	const $spellTab = $html.find('.tab-spells, section[data-tab="tab-spells"]');
	if (!$spellTab.length) return;

	// Find wand items - they have data-item-id attribute
	$spellTab.find('li.item[data-item-id]').each((i, el) => {
		const $item = $(el);
		const itemId = $item.data('item-id');
		if (!itemId) return;

		const item = actor.items.get(itemId);
		if (!item || item.type !== "Wand") return;

		// Check if uses tracking is enabled for this wand
		const wandUsesFlags = item.flags?.[MODULE_ID]?.wandUses;
		if (!wandUsesFlags?.enabled) return;

		const currentUses = wandUsesFlags.current ?? 0;
		const maxUses = wandUsesFlags.max ?? 0;

		// Find the item name element (it's an anchor with class "item-name")
		const $nameElement = $item.find('a.item-name');
		if (!$nameElement.length) return;

		// Remove any existing uses display
		$nameElement.find('.sdx-wand-uses-display').remove();

		// Create uses display element and append inside the name element
		const usesDisplay = $(`<span class="sdx-wand-uses-display" style="margin-left: 6px; color: rgba(255, 255, 255, 0.9) !important; font-family: 'Montserrat Medium', Montserrat, sans-serif; font-weight: 500;">${currentUses}/${maxUses}</span>`);
		$nameElement.append(usesDisplay);
	});
}
