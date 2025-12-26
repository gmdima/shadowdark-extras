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
	const isAlreadyFocusing = activeFocusSpells.some(f => f.spellId === spellId);
	const isFocusRoll = message.flavor?.includes(focusCheckText) ||
		message.flavor?.includes("Focus Check");

	console.log(`shadowdark-extras | Focus spell detected: ${item.name}`, {
		isFocusRoll,
		isAlreadyFocusing,
		success,
		critical,
		spellId,
		casterId,
		flavor: message.flavor
	});

	if (isFocusRoll) {
		// This is a focus maintenance roll
		if (!success || critical === "failure") {
			// Focus failed - end the spell and remove effects
			console.log(`shadowdark-extras | Focus failed for ${item.name}, ending focus and removing effects`);

			// On critical failure, also mark the spell as lost (like Shadowdark does)
			if (critical === "failure") {
				console.log(`shadowdark-extras | Critical failure on focus check - marking spell as lost`);
				await item.update({ "system.lost": true });
				await endFocusSpell(casterId, spellId, "spell_lost");
			} else {
				await endFocusSpell(casterId, spellId, "focus_failed");
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
async function startFocusSpell(actor, spell) {
	const focusData = {
		spellId: spell.id,
		spellName: spell.name,
		spellImg: spell.img,
		casterId: actor.id,
		casterName: actor.name,
		startTime: game.time.worldTime,
		startRound: game.combat?.round ?? null,
		targetEffects: []
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
	return durationData;
}

/**
 * Get all active duration spells for an actor
 */
export function getActiveDurationSpells(actor) {
	return actor.getFlag(MODULE_ID, DURATION_SPELL_FLAG) || [];
}

/**
 * End a duration spell and remove all associated effects from targets
 * @param {string} casterId - The caster actor ID
 * @param {string} instanceId - The unique instance ID of the spell (or spellId for backwards compatibility)
 * @param {string} reason - The reason for ending ("expired" or "manual")
 */
export async function endDurationSpell(casterId, instanceId, reason = "expired") {
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

	// Remove from tracking
	activeDuration.splice(spellIndex, 1);
	await caster.setFlag(MODULE_ID, DURATION_SPELL_FLAG, activeDuration);

	// Post to chat
	const chatContent = `
		<div class="shadowdark chat-card focus-ended">
			<header class="card-header flexrow">
				<img src="${durationEntry.spellImg}" alt="${durationEntry.spellName}"/>
				<h3>Spell Duration Ended</h3>
			</header>
			<div class="card-content">
				<p><strong>${durationEntry.spellName}</strong></p>
				<p>${reason === "expired" ? "The spell has expired." : "The spell was ended manually."}</p>
				${durationEntry.targetEffects?.length > 0 ? `<p>Effects removed from ${durationEntry.targetEffects.length} target(s).</p>` : ""}
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
export async function startFocusSpellIfNeeded(casterActorId, spellId, spellName) {
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

	// Start tracking
	console.log(`shadowdark-extras | Starting focus tracking for ${spellName} (triggered by effect application)`);
	await startFocusSpell(caster, spell);
	return true;
}

/**
 * Handle effect item creation - link to active focus spell if applicable
 */
async function handleEffectCreated(item, options, userId) {
	if (item.type !== "Effect") return;
	if (!item.actor) return;

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

	if (!focusEntry) return;

	// Link this effect to the focus spell
	const targetToken = item.actor.getActiveTokens()?.[0];

	focusEntry.targetEffects.push({
		targetActorId: item.actor.id,
		targetTokenId: targetToken?.id ?? null,
		effectItemId: item.id,
		targetName: item.actor.name
	});

	await sourceActor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	console.log(`shadowdark-extras | Linked effect ${item.name} to focus spell ${sourceSpell.name}`);
}

/**
 * Handle effect deletion - clean up tracking if needed
 */
async function handleEffectDeleted(item, options, userId) {
	if (item.type !== "Effect") return;

	// Find and clean up any focus spell tracking that referenced this effect
	for (const actor of game.actors) {
		const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG);
		if (!activeFocus || activeFocus.length === 0) continue;

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
}

/**
 * Handle token deletion - clean up any focus tracking that targeted this token
 */
async function handleTokenDeleted(tokenDoc, options, userId) {
	const deletedTokenId = tokenDoc.id;

	// Search all actors for focus spells targeting this token
	for (const actor of game.actors) {
		const activeFocus = actor.getFlag(MODULE_ID, FOCUS_SPELL_FLAG);
		if (!activeFocus || activeFocus.length === 0) continue;

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

	// Build a minimal reminder message
	const spellList = activeFocus.map(f => {
		const targets = f.targetEffects.map(te => te.targetName).join(", ") ||
			game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.no_targets");
		return `<span class="sdx-focus-reminder-spell"><i class="fa-solid fa-brain"></i> <strong>${f.spellName}</strong> → ${targets}</span>`;
	}).join("");

	const content = `
		<div class="sdx-focus-reminder">
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

		let needsUpdate = false;
		const expiredSpellIds = [];

		for (const durationSpell of activeDuration) {
			// Use instanceId if available, fallback to spellId
			const spellInstanceId = durationSpell.instanceId || durationSpell.spellId;

			// Check for expiry
			if (currentRound > durationSpell.expiryRound) {
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
 */
async function applyDurationSpellPerTurnDamage(durationSpell, targetActor, targetTokenId) {
	const formula = durationSpell.perTurnDamage;
	if (!formula) return;

	try {
		// Roll the damage
		const roll = new Roll(formula);
		await roll.evaluate();

		const damage = roll.total;
		const damageType = durationSpell.damageType || "damage";

		// Get the token
		const token = canvas.tokens?.get(targetTokenId);
		if (!token?.actor) {
			console.warn(`shadowdark-extras | Could not find token ${targetTokenId} for per-turn damage`);
			return;
		}

		// Apply damage
		const currentHp = token.actor.system.attributes.hp.value;
		const newHp = Math.max(0, currentHp - damage);
		await token.actor.update({ "system.attributes.hp.value": newHp });

		// Post to chat
		const content = `
			<div class="shadowdark chat-card sdx-duration-damage">
				<header class="card-header flexrow">
					<img src="${durationSpell.spellImg}" alt="${durationSpell.spellName}"/>
					<h3>${durationSpell.spellName} - Per-Turn ${damageType}</h3>
				</header>
				<div class="card-content">
					<p><strong>${targetActor.name}</strong> takes <strong>${damage}</strong> ${damageType} damage!</p>
					<p class="sdx-roll-breakdown">${formula} = ${roll.result}</p>
				</div>
			</div>
		`;

		await ChatMessage.create({
			content: content,
			speaker: ChatMessage.getSpeaker({ actor: game.actors.get(durationSpell.casterId) }),
			type: CONST.CHAT_MESSAGE_STYLES.OTHER
		});

		console.log(`shadowdark-extras | Applied ${damage} ${damageType} damage to ${targetActor.name} from ${durationSpell.spellName}`);
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
	let durationEntry = activeDuration.find(d => d.instanceId === instanceId);
	if (!durationEntry) {
		durationEntry = activeDuration.find(d => d.spellId === instanceId);
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

	// Add the effect to tracking
	durationEntry.targetEffects.push({
		targetActorId: targetActor?.id || null,
		targetTokenId: targetTokenId,
		effectItemId: effectItemId,
		targetName: targetActor?.name || "Unknown"
	});

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
					const effectItem = targetActor.items.get(targetEffect.effectItemId);
					if (effectItem) {
						await effectItem.delete();
						console.log(`shadowdark-extras | Removed effect ${effectItem.name} from ${removedTarget.name}`);
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

			const effectItem = targetActor.items.get(targetEffect.effectItemId);
			if (!effectItem) {
				console.warn(`shadowdark-extras | Effect item ${targetEffect.effectItemId} not found on ${targetActor.name}`);
				return;
			}

			// Delete the effect - use socket if we don't have permission
			const socket = getFocusSpellSocket();
			if (game.user.isGM || targetActor.isOwner) {
				await effectItem.delete();
				console.log(`shadowdark-extras | Removed effect ${effectItem.name} from ${targetActor.name}`);
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
				<img src="${focusEntry.spellImg}" alt="${focusEntry.spellName}"/>
				<h3>${game.i18n.localize("SHADOWDARK_EXTRAS.focus_tracker.focus_ended")}</h3>
			</header>
			<div class="card-content">
				<p><strong>${focusEntry.spellName}</strong></p>
				<p>${reasonText}</p>
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
			actor.castSpell(spellId, { isFocusRoll: true });
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

		// Build target list for tooltip
		const targetsList = focus.targetEffects.map(te => te.targetName).join(", ") ||
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
					<i class="fas fa-bullseye"></i> ${focus.targetEffects.length}
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
	focusEntry.targetEffects.push({
		targetActorId: targetActor.id,
		targetTokenId: resolvedTokenId,
		effectItemId: effectItemId,
		targetName: targetActor.name
	});

	await casterActor.setFlag(MODULE_ID, FOCUS_SPELL_FLAG, activeFocus);

	console.log(`shadowdark-extras | Linked effect ${effectItemId} to focus spell ${spellId}`);

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