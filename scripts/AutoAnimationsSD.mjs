/**
 * Automated Animations Integration for Shadowdark
 * 
 * This module provides proper integration between Shadowdark RPG and Automated Animations.
 * It ensures animations only play on successful attacks/spell casts instead of on every roll.
 * 
 * The problem: By default, Automated Animations uses the createChatMessage hook which fires
 * immediately when any chat message is created - including when a roll is made, regardless
 * of success or failure. It also fires for item cards (pre-roll) which show "Roll Attack" buttons.
 * 
 * The solution: We use the "AutomatedAnimations-WorkflowStart" hook to intercept AA's
 * workflow and stop animations for:
 * 1. Item cards (pre-roll messages with "Roll Attack" button)
 * 2. Failed attack/spell rolls
 * 3. Critical failures
 * 
 * Only successful rolls trigger animations.
 */

const MODULE_ID = "shadowdark-extras";

// Store item cards (non-rolls) to block animations on them
let recentItemCards = new Map();

/**
 * Debug logging helper
 * @param {...any} args - Arguments to log
 */
function debug(...args) {
	// Always log for now during development - change to check settings later
	console.log("Automated Animations | Shadowdark |", ...args);
}

/**
 * Check if the roll was successful based on Shadowdark flags
 * @param {object} flags - The shadowdark flags from the chat message
 * @returns {object} - Object with success info
 */
function checkRollSuccess(flags) {
	if (!flags?.isRoll) {
		return { isRoll: false, shouldAnimate: false };
	}
	
	// Check critical states
	const critical = flags.critical;
	const hasTarget = flags.hasTarget;
	const success = flags.success;
	
	// Critical failure - never animate
	if (critical === "failure") {
		debug("Critical failure - skipping animation");
		return { isRoll: true, shouldAnimate: false, isCriticalFailure: true };
	}
	
	// Critical success - always animate
	if (critical === "success") {
		debug("Critical success - playing animation");
		return { isRoll: true, shouldAnimate: true, isCriticalSuccess: true };
	}
	
	// Has a target (attack or spell with DC)
	if (hasTarget) {
		if (success) {
			debug("Successful attack/spell - playing animation");
			return { isRoll: true, shouldAnimate: true, isSuccess: true };
		} else {
			debug("Failed attack/spell - skipping animation");
			return { isRoll: true, shouldAnimate: false, isFailure: true };
		}
	}
	
	// No target (ability check, damage roll, or spell without target)
	// For spells without a target DC, we should animate based on setting
	const rolls = flags.rolls;
	const itemType = rolls?.main?.data?.item?.type;
	
	if (itemType === "Spell" || itemType === "Scroll" || 
		itemType === "Wand" || itemType === "NPC Spell") {
		// Check setting for spells without target
		let animateSpellsWithoutTarget = true;
		try {
			animateSpellsWithoutTarget = game.settings.get(MODULE_ID, "aaAnimateSpellsWithoutTarget");
		} catch (e) {
			// Use default
		}
		if (animateSpellsWithoutTarget) {
			debug("Spell without target - playing animation");
			return { isRoll: true, shouldAnimate: true, isSpell: true };
		} else {
			debug("Spell without target - skipping (disabled in settings)");
			return { isRoll: true, shouldAnimate: false, isSpell: true };
		}
	}
	
	// For weapons without targets, still animate (they were used)
	if (itemType === "Weapon" || itemType === "NPC Attack" || itemType === "NPC Special Attack") {
		debug("Weapon attack without target - playing animation");
		return { isRoll: true, shouldAnimate: true, isWeapon: true };
	}
	
	// For other rolls without targets (ability checks, etc.), don't animate
	debug("Roll without target or item - skipping");
	return { isRoll: true, shouldAnimate: false };
}

/**
 * Register settings for the Automated Animations integration
 */
function registerSettings() {
	// Only register if AA is active
	if (!game.modules.get("autoanimations")?.active) {
		return;
	}
	
	game.settings.register(MODULE_ID, "aaIntegration", {
		name: "SDX.Settings.AAIntegration.Name",
		hint: "SDX.Settings.AAIntegration.Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	});
	
	game.settings.register(MODULE_ID, "aaAnimateOnSuccess", {
		name: "SDX.Settings.AAAnimateOnSuccess.Name",
		hint: "SDX.Settings.AAAnimateOnSuccess.Hint",
		scope: "world",
		config: false,
		type: Boolean,
		default: true
	});
	
	game.settings.register(MODULE_ID, "aaAnimateSpellsWithoutTarget", {
		name: "SDX.Settings.AAAnimateSpellsWithoutTarget.Name",
		hint: "SDX.Settings.AAAnimateSpellsWithoutTarget.Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true
	});
}

/**
 * Setup our integration using AA's official WorkflowStart hook
 * This allows us to stop animations for failed rolls before they play
 */
function setupAAIntegration() {
	// Check if Automated Animations is active
	if (!game.modules.get("autoanimations")?.active) {
		console.log("Shadowdark Extras | Automated Animations not active, skipping integration");
		return;
	}
	
	// Check if our integration is enabled
	let integrationEnabled = true;
	try {
		integrationEnabled = game.settings.get(MODULE_ID, "aaIntegration");
	} catch (e) {
		// Settings not registered yet, use default
	}
	
	if (!integrationEnabled) {
		console.log("Shadowdark Extras | AA Integration disabled in settings");
		return;
	}
	
	console.log("Shadowdark Extras | Initializing Automated Animations integration for Shadowdark");
	
	// Listen for chat messages to track item cards (pre-roll messages)
	// We need to block animations on these since they're not actual rolls
	Hooks.on("createChatMessage", (msg, options, userId) => {
		// Only track messages from this user
		if (msg.author?.id !== game.user.id) {
			return;
		}
		
		// Skip actual rolls - we handle those in WorkflowStart
		if (msg.flags?.shadowdark?.isRoll) {
			return;
		}
		
		// Check if this is an item card (has data-item-id in HTML but no roll)
		// These are the "Roll Attack" / item preview cards
		const content = msg.content || "";
		const hasItemId = content.includes('data-item-id="');
		const hasActorId = content.includes('data-actor-id="');
		const hasChatCardButtons = content.includes('chat-card-buttons') || content.includes('data-action="roll-');
		
		if (hasItemId && hasActorId && hasChatCardButtons) {
			// Extract item name from the card for matching
			const itemNameMatch = content.match(/<h3[^>]*class="item-name"[^>]*>([^<]+)<\/h3>/);
			const itemName = itemNameMatch ? itemNameMatch[1].trim() : null;
			
			if (itemName) {
				// Store this as a recent item card to block
				recentItemCards.set(itemName, {
					messageId: msg.id,
					timestamp: Date.now()
				});
				debug("Stored item card (pre-roll) for blocking:", itemName);
				
				// Clean up old entries after 5 seconds
				setTimeout(() => {
					recentItemCards.delete(itemName);
				}, 5000);
			}
		}
	});
	
	// Use AA's official WorkflowStart hook to intercept animations
	// This hook fires right before AA plays an animation, allowing us to stop it
	Hooks.on("AutomatedAnimations-WorkflowStart", (clonedData, animationData) => {
		const animatingItemName = clonedData.item?.name;
		
		debug("AA WorkflowStart triggered for item:", animatingItemName);
		debug("clonedData:", clonedData);
		
		// Always ensure stopWorkflow starts as false for this call
		clonedData.stopWorkflow = false;
		
		if (!animatingItemName) {
			debug("No item name found, allowing animation");
			return;
		}
		
		// FIRST: Check if this is an item card (pre-roll) - ALWAYS block these
		const itemCard = recentItemCards.get(animatingItemName);
		if (itemCard && (Date.now() - itemCard.timestamp < 3000)) {
			debug("Blocking animation for item card (pre-roll):", animatingItemName);
			clonedData.stopWorkflow = true;
			// Clean up immediately after blocking
			recentItemCards.delete(animatingItemName);
			return;
		}
		
		// Clean up expired item cards on every check
		for (const [name, data] of recentItemCards.entries()) {
			if (Date.now() - data.timestamp > 3000) {
				recentItemCards.delete(name);
			}
		}
		
		// Get the chat message from the workflow - AA passes it as clonedData.workflow
		const message = clonedData.workflow;
		const shadowdarkFlags = message?.flags?.shadowdark;
		
		debug("Message flags:", shadowdarkFlags);
		
		// If no shadowdark flags, this might be an item card - check HTML for roll indicators
		if (!shadowdarkFlags) {
			// Check if the message content looks like an item card (has roll button)
			const content = message?.content || "";
			const hasRollButton = content.includes('data-action="roll-') || content.includes('chat-card-buttons');
			if (hasRollButton) {
				debug("Item card detected (no shadowdark flags, has roll button) - blocking animation");
				clonedData.stopWorkflow = true;
				return;
			}
			// No flags and no roll button - allow animation (might be a different system's message)
			debug("No shadowdark flags and no roll button - allowing animation");
			return;
		}
		
		// Check if this is an actual roll (has isRoll flag)
		if (!shadowdarkFlags.isRoll) {
			debug("Not a Shadowdark roll (isRoll flag missing) - blocking animation");
			clonedData.stopWorkflow = true;
			return;
		}
		
		// Now check the roll result
		const rollResult = checkRollSuccess(shadowdarkFlags);
		debug("Roll result:", rollResult);
		
		// If the roll should not animate, stop the workflow
		if (!rollResult.shouldAnimate) {
			debug("Stopping AA workflow - roll was not successful");
			clonedData.stopWorkflow = true;
			return;
		}
		
		// Roll was successful - allow animation
		// Explicitly ensure stopWorkflow is false to allow animation
		clonedData.stopWorkflow = false;
		
		if (rollResult.isCriticalSuccess) {
			clonedData.isCritical = true;
			debug("Animation will play - critical success");
		} else if (rollResult.isSuccess) {
			debug("Animation will play - successful roll");
		} else {
			debug("Animation will play - roll marked as should animate");
		}
	});
	
	console.log("Shadowdark Extras | AA Integration ready - animations will only play on successful rolls");
}

/**
 * Initialize the Automated Animations integration
 * This should be called during the "init" hook
 */
export function initAutoAnimationsIntegration() {
	console.log("Shadowdark Extras | initAutoAnimationsIntegration called");
	
	// Register settings immediately (we're already in the init hook)
	registerSettings();
	
	// Setup the integration when ready
	Hooks.once("ready", () => {
		console.log("Shadowdark Extras | Ready hook fired, calling setupAAIntegration");
		setupAAIntegration();
	});
}

export default {
	initAutoAnimationsIntegration,
	checkRollSuccess
};
