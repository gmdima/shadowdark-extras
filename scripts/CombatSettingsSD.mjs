/**
 * Combat Settings for Shadowdark Extras
 * Adds enhanced damage card features similar to midi-qol
 */

import { getWeaponBonuses, getWeaponEffectsToApply, evaluateRequirements, calculateWeaponBonusDamage } from "./WeaponBonusConfig.mjs";
import { startDurationSpell, linkEffectToDurationSpell, getActiveDurationSpells, endFocusSpell } from "./FocusSpellTrackerSD.mjs";

const MODULE_ID = "shadowdark-extras";
let socketlibSocket = null;

/**
 * Evaluate a formula that may contain expressions like (1 + floor(@level / 2))d6
 * Returns the simplified dice formula, e.g. "2d6" for level 3
 * @param {string} formula - The formula string to evaluate
 * @param {object} rollData - The roll data object with variables like @level
 * @returns {string} - The evaluated formula with expressions resolved
 */
function evaluateFormulaExpressions(formula, rollData) {
	if (!formula) return formula;

	let evaluated = formula;

	// First, replace any @variable references with their values
	evaluated = evaluated.replace(/@(\w+(?:\.\w+)*)/g, (match, path) => {
		const parts = path.split('.');
		let value = rollData;
		for (const part of parts) {
			if (value && typeof value === 'object' && part in value) {
				value = value[part];
			} else {
				return match; // Keep original if not found
			}
		}
		return typeof value === 'number' ? value : match;
	});

	// Now evaluate any parenthetical expressions containing math before 'd'
	// Pattern: (expression)d followed by a number
	evaluated = evaluated.replace(/\(([^)]+)\)\s*d\s*(\d+)/gi, (match, expr, dieSize) => {
		try {
			// Replace math functions and evaluate
			const safeExpr = expr
				.replace(/floor/gi, 'Math.floor')
				.replace(/ceil/gi, 'Math.ceil')
				.replace(/round/gi, 'Math.round')
				.replace(/min/gi, 'Math.min')
				.replace(/max/gi, 'Math.max');
			const numDice = Math.max(1, Math.floor(eval(safeExpr))); // At least 1 die
			console.log(`shadowdark-extras | Evaluated formula expression: (${expr})d${dieSize} → ${numDice}d${dieSize}`);
			return `${numDice}d${dieSize}`;
		} catch (e) {
			console.warn("shadowdark-extras | Could not evaluate expression:", expr, e);
			return match;
		}
	});

	// Clean up any remaining standalone floor/ceil expressions not attached to dice
	evaluated = evaluated.replace(/(\d+)\s*\+\s*floor\s*\(\s*([^)]+)\s*\)/gi, (match, base, expr) => {
		try {
			const result = parseInt(base) + Math.floor(eval(expr));
			return result.toString();
		} catch (e) {
			return match;
		}
	});

	// Clean up whitespace around 'd'
	evaluated = evaluated.replace(/\s+d\s+/gi, 'd');

	console.log(`shadowdark-extras | Formula evaluation: "${formula}" → "${evaluated}"`);
	return evaluated;
}

/**
 * Double the dice in a formula for critical hits
 * E.g., "2d6+3" becomes "4d6+3", "1d8+1d4" becomes "2d8+2d4"
 * Also handles "(1)d6" format
 * @param {string} formula - The dice formula
 * @returns {string} - The formula with doubled dice
 */
function doubleDiceInFormula(formula) {
	if (!formula) return formula;

	// Match dice patterns like Xd6, 2d8, (1)d6, etc.
	// Handle optional parentheses around the number of dice
	const doubled = formula.replace(/\(?(\d+)\)?\s*d\s*(\d+)/gi, (match, numDice, dieSize) => {
		const doubledNum = parseInt(numDice) * 2;
		return `${doubledNum}d${dieSize}`;
	});

	console.log(`shadowdark-extras | Dice doubling: "${formula}" → "${doubled}"`);
	return doubled;
}

/**
 * Show scrolling combat text on a token (floating damage/healing numbers)
 * @param {Token} token - The token to show text on
 * @param {number} amount - The amount of damage (positive) or healing (negative for display, but we pass actual change)
 * @param {boolean} isHealing - Whether this is healing (green) or damage (red)
 */
function showScrollingText(token, amount, isHealing) {
	if (!token || !canvas.interface) return;

	// Get the text to display
	const displayAmount = Math.abs(amount);
	const text = isHealing ? `+${displayAmount}` : `-${displayAmount}`;

	// Configure the scrolling text style
	const style = {
		anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
		direction: isHealing ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
		fontSize: 48,
		fill: isHealing ? "#00ff00" : "#ff0000",
		stroke: "#000000",
		strokeThickness: 4,
		jitter: 0.25
	};

	// Create the scrolling text
	canvas.interface.createScrollingText(token.center, text, style);
}

/**
 * Parse a tiered formula string and return the appropriate formula for the given level
 * Format: "1-3:1d6, 4-6:2d8, 7-9:3d10, 10+:4d12"
 * @param {string} tieredFormula - The tiered formula string
 * @param {number} level - The level to check against
 * @returns {string|null} - The formula for the matching tier, or null if no match
 */
function parseTieredFormula(tieredFormula, level) {
	if (!tieredFormula || tieredFormula.trim() === '') return null;

	// Split by comma to get each tier
	const tiers = tieredFormula.split(',').map(t => t.trim());

	for (const tier of tiers) {
		// Parse each tier - format: "X-Y:formula" or "X+:formula"
		const colonIndex = tier.indexOf(':');
		if (colonIndex === -1) continue;

		const rangeStr = tier.substring(0, colonIndex).trim();
		const formula = tier.substring(colonIndex + 1).trim();

		// Check for "X+" format (level X and above)
		if (rangeStr.endsWith('+')) {
			const minLevel = parseInt(rangeStr.slice(0, -1));
			if (!isNaN(minLevel) && level >= minLevel) {
				return formula;
			}
		}
		// Check for "X-Y" format (level X to Y)
		else if (rangeStr.includes('-')) {
			const [minStr, maxStr] = rangeStr.split('-');
			const minLevel = parseInt(minStr);
			const maxLevel = parseInt(maxStr);
			if (!isNaN(minLevel) && !isNaN(maxLevel) && level >= minLevel && level <= maxLevel) {
				return formula;
			}
		}
		// Check for single level "X"
		else {
			const exactLevel = parseInt(rangeStr);
			if (!isNaN(exactLevel) && level === exactLevel) {
				return formula;
			}
		}
	}

	return null;
}

/**
 * Safely evaluate a requirement formula with roll data
 * Supports comparison operators: <, >, <=, >=, ==, !=
 * @param {string} formula - The requirement formula (e.g., "@target.level < 3")
 * @param {object} rollData - The roll data with variable values
 * @returns {boolean} - Whether the requirement is met
 */
function evaluateRequirement(formula, rollData) {
	if (!formula || formula.trim() === '') return true;

	try {
		// Replace @variable references with their values from rollData
		let evalFormula = formula;

		// Build a regex to find all @variable patterns (including nested like @target.level)
		const variableRegex = /@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

		evalFormula = evalFormula.replace(variableRegex, (match, path) => {
			// Navigate the path in rollData (e.g., "target.level" -> rollData.target.level)
			const value = path.split('.').reduce((obj, key) => obj?.[key], rollData);
			return value !== undefined ? value : 0;
		});

		// Now evaluate the formula as a JavaScript expression
		// Use Function constructor for safer evaluation than eval
		const func = new Function('return (' + evalFormula + ')');
		const result = func();

		// Return true if result is truthy or > 0
		return !!result;
	} catch (err) {
		console.warn(`shadowdark-extras | Failed to evaluate requirement: ${formula}`, err);
		return true; // Fail-open: if we can't evaluate, allow the action
	}
}

/**
 * Build target sub-object for roll data with all relevant stats
 * @param {Actor} targetActor - The target actor
 * @returns {object} - The target roll data object
 */
function buildTargetRollData(targetActor) {
	if (!targetActor) return {};

	const targetActorData = targetActor.getRollData() || {};
	const target = {};

	// Flatten target level
	if (targetActorData.level && typeof targetActorData.level === 'object' && targetActorData.level.value !== undefined) {
		target.level = targetActorData.level.value;
	} else {
		target.level = targetActorData.level || 0;
	}

	// Add target ability modifiers
	if (targetActorData.abilities) {
		['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
			if (targetActorData.abilities[ability]?.mod !== undefined) {
				target[ability] = targetActorData.abilities[ability].mod;
			}
			if (targetActorData.abilities[ability]?.base !== undefined) {
				target[ability + 'Base'] = targetActorData.abilities[ability].base;
			}
		});
	}

	// Add target stats
	if (targetActorData.attributes?.ac?.value !== undefined) target.ac = targetActorData.attributes.ac.value;
	if (targetActorData.attributes?.hp?.value !== undefined) target.hp = targetActorData.attributes.hp.value;

	// Add Ancestry and Subtype
	target.ancestry = targetActor.system?.ancestry?.name || targetActor.system?.details?.ancestry || "";
	target.subtype = targetActor.getFlag(MODULE_ID, "creatureType") || "";
	target.creatureType = target.subtype; // Alias for convenience

	return target;
}

export function setupCombatSocket() {
	if (!globalThis.socketlib) {
		console.error("shadowdark-extras | socketlib not found, combat socket cannot be initialized");
		return;
	}

	socketlibSocket = globalThis.socketlib.registerModule(MODULE_ID);

	if (!socketlibSocket) {
		console.error("shadowdark-extras | Failed to register socket module. Make sure 'socket: true' is set in module.json");
		return;
	}

	// Register socket handler for applying damage/healing
	socketlibSocket.register("applyTokenDamage", async (data) => {
		const token = canvas.tokens.get(data.tokenId);
		if (!token || !token.actor) {
			console.warn("shadowdark-extras | Token not found:", data.tokenId);
			return false;
		}

		try {
			const currentHp = token.actor.system?.attributes?.hp?.value ?? 0;
			const maxHp = token.actor.system?.attributes?.hp?.max ?? 0;

			// Negative damage means healing
			const isHealing = data.damage < 0;
			const newHp = Math.max(0, Math.min(maxHp, currentHp - data.damage));

			console.log("shadowdark-extras | Applying damage/healing via socket:", {
				tokenId: data.tokenId,
				actorName: token.actor.name,
				damage: data.damage,
				isHealing: isHealing,
				oldHp: currentHp,
				newHp: newHp
			});

			await token.actor.update({
				"system.attributes.hp.value": newHp
			});

			// Scrolling combat text is now handled by the updateActor/updateToken hooks
			// so we don't need to call it here anymore

			return true;
		} catch (error) {
			console.error("shadowdark-extras | Error in socket damage handler:", error);
			return false;
		}
	});

	// Register socket handler for showing scrolling text on all clients
	socketlibSocket.register("showScrollingText", (data) => {
		const token = canvas.tokens?.get(data.tokenId);
		if (!token) return;

		showScrollingText(token, data.amount, data.isHealing);
	});

	// Register socket handler for applying conditions/effects
	socketlibSocket.register("applyTokenCondition", async (data) => {
		const token = canvas.tokens.get(data.tokenId);
		if (!token || !token.actor) {
			console.warn("shadowdark-extras | Token not found for condition:", data.tokenId);
			return false;
		}

		try {
			console.log("shadowdark-extras | Applying condition via socket:", {
				tokenId: data.tokenId,
				actorName: token.actor.name,
				effectUuid: data.effectUuid,
				duration: data.duration,
				spellInfo: data.spellInfo,
				cumulative: data.cumulative
			});

			// Get the effect document from UUID
			const effectDoc = await fromUuid(data.effectUuid);
			if (!effectDoc) {
				console.warn("shadowdark-extras | Effect not found:", data.effectUuid);
				return false;
			}

			// Check if this is a non-cumulative effect and target already has it
			// Default to cumulative=true for backward compatibility
			const isCumulative = data.cumulative !== false;
			if (!isCumulative) {
				// Check if target already has an effect with the same source UUID or same name
				const existingEffects = token.actor.items.filter(item => {
					if (item.type !== "Effect") return false;
					// Check by compendium source
					const sourceId = item._stats?.compendiumSource || item.flags?.core?.sourceId;
					if (sourceId === data.effectUuid) return true;
					// Also check by name as fallback
					if (item.name === effectDoc.name) return true;
					return false;
				});

				if (existingEffects.length > 0) {
					// Remove existing effects before applying new one (to reset duration)
					console.log(`shadowdark-extras | Non-cumulative effect "${effectDoc.name}" - removing ${existingEffects.length} existing effect(s) to replace with fresh one`);
					const effectIds = existingEffects.map(e => e.id);
					await token.actor.deleteEmbeddedDocuments("Item", effectIds);
				}
			}

			// Check if the target already has an effect from the same spell and remove it
			// This prevents duplicate effects when casting the same spell on the same target
			if (data.spellInfo?.spellId) {
				const existingEffects = token.actor.items.filter(item => {
					if (item.type !== "Effect") return false;
					// Check if this effect came from the same spell (by matching the compendium source)
					const sourceId = item._stats?.compendiumSource || item.flags?.core?.sourceId;
					return sourceId === data.effectUuid;
				});

				if (existingEffects.length > 0) {
					console.log(`shadowdark-extras | Removing ${existingEffects.length} existing effect(s) from same source before applying new one`);
					const effectIds = existingEffects.map(e => e.id);
					await token.actor.deleteEmbeddedDocuments("Item", effectIds);

					// Also clean up the focus spell tracking for the removed effects
					try {
						const { unlinkEffectFromFocusSpell } = await import('./FocusSpellTrackerSD.mjs');
						for (const effectId of effectIds) {
							await unlinkEffectFromFocusSpell(data.spellInfo.casterActorId, data.spellInfo.spellId, effectId);
						}
					} catch (err) {
						// Focus tracking cleanup is optional
						console.log("shadowdark-extras | Could not clean up focus tracking for removed effect:", err.message);
					}
				}
			}

			// Create the Effect Item on the actor
			// This is the correct approach - the Effect Item has transfer: true on its embedded ActiveEffects,
			// which Foundry automatically applies to the actor. This ensures the effect shows up properly
			// in the Effects and Conditions section with correct source attribution.
			const effectData = effectDoc.toObject();

			// Apply duration overrides to embedded effects if provided
			if (data.duration && Object.keys(data.duration).length > 0 && effectData.effects) {
				effectData.effects = effectData.effects.map(effect => {
					effect.duration = effect.duration || {};
					Object.assign(effect.duration, data.duration);
					return effect;
				});
				console.log("shadowdark-extras | Applied duration override to effect item:", data.duration);
			}

			// Also apply duration to the item's system.duration if it exists
			if (data.duration && effectData.system?.duration) {
				if (data.duration.rounds) {
					effectData.system.duration.value = String(data.duration.rounds);
					effectData.system.duration.type = "rounds";
				}
			}

			// Rename the effect item to indicate it came from the spell
			// effectData.name = `Spell Effect: ${effectData.name}`;

			const createdItems = await token.actor.createEmbeddedDocuments("Item", [effectData]);
			console.log("shadowdark-extras | Applied effect item:", effectDoc.name, "to", token.actor.name);

			// Link to focus spell or duration spell if applicable
			if (data.spellInfo && createdItems.length > 0) {
				const createdEffect = createdItems[0];
				try {
					// Import spell tracking functions
					const { linkEffectToFocusSpell, startFocusSpellIfNeeded, linkEffectToDurationSpell, getActiveDurationSpells } = await import('./FocusSpellTrackerSD.mjs');

					// Check if this is a duration spell (non-focus)
					const caster = game.actors.get(data.spellInfo.casterActorId);
					const activeDuration = caster ? getActiveDurationSpells(caster) : [];
					const isDurationSpell = activeDuration.some(d => d.spellId === data.spellInfo.spellId);

					if (isDurationSpell) {
						// Link to duration spell
						await linkEffectToDurationSpell(
							data.spellInfo.casterActorId,
							data.spellInfo.spellId,
							token.actor.id,
							data.tokenId,
							createdEffect.id
						);
						console.log("shadowdark-extras | Linked effect to duration spell:", data.spellInfo.spellName);
					} else {
						// Try focus spell
						// Ensure focus tracking is started (in case it hasn't been started yet)
						await startFocusSpellIfNeeded(
							data.spellInfo.casterActorId,
							data.spellInfo.spellId,
							data.spellInfo.spellName
						);

						// Now link the effect
						await linkEffectToFocusSpell(
							data.spellInfo.casterActorId,
							data.spellInfo.spellId,
							token.actor.id,
							data.tokenId,
							createdEffect.id
						);
						console.log("shadowdark-extras | Linked effect to focus spell:", data.spellInfo.spellName);
					}
				} catch (linkError) {
					// Spell tracking might not be enabled, that's okay
					console.log("shadowdark-extras | Could not link effect to spell:", linkError.message);
				}
			}

			return true;
		} catch (error) {
			console.error("shadowdark-extras | Error in socket condition handler:", error);
			return false;
		}
	});

	// Register socket handlers for focus/duration spell operations
	socketlibSocket.register("removeTargetEffect", async ({ targetActorId, targetTokenId, effectItemId }) => {
		let targetActor = null;

		// Try to get the actor from the token first (for unlinked tokens)
		if (targetTokenId) {
			const token = canvas.tokens?.get(targetTokenId);
			if (token?.actor) {
				targetActor = token.actor;
			}
		}

		// Fall back to game.actors
		if (!targetActor) {
			targetActor = game.actors.get(targetActorId);
		}

		if (!targetActor) {
			console.warn("shadowdark-extras | removeTargetEffect: target actor not found");
			return false;
		}

		const effectItem = targetActor.items.get(effectItemId);
		if (!effectItem) {
			console.warn("shadowdark-extras | removeTargetEffect: effect item not found");
			return false;
		}

		await effectItem.delete();
		console.log(`shadowdark-extras | Removed effect ${effectItem.name} from ${targetActor.name} via GM socket`);
		return true;
	});

	socketlibSocket.register("applyEffectToTarget", async ({ targetActorId, targetTokenId, effectUuid, casterId, spellId }) => {
		let targetActor = null;

		// Try to get the actor from the token first (for unlinked tokens)
		if (targetTokenId) {
			const token = canvas.tokens?.get(targetTokenId);
			if (token?.actor) {
				targetActor = token.actor;
			}
		}

		// Fall back to game.actors
		if (!targetActor) {
			targetActor = game.actors.get(targetActorId);
		}

		if (!targetActor) {
			console.warn("shadowdark-extras | applyEffectToTarget: target actor not found");
			return { success: false, effectId: null };
		}

		try {
			const effectDoc = await fromUuid(effectUuid);
			if (!effectDoc) {
				console.warn("shadowdark-extras | applyEffectToTarget: effect not found:", effectUuid);
				return { success: false, effectId: null };
			}

			const effectItemData = effectDoc.toObject();
			const createdItems = await targetActor.createEmbeddedDocuments("Item", [effectItemData]);

			if (createdItems.length > 0) {
				const createdEffectId = createdItems[0].id;
				console.log(`shadowdark-extras | Applied effect ${effectDoc.name} to ${targetActor.name} via GM socket`);
				return { success: true, effectId: createdEffectId };
			}

			return { success: false, effectId: null };
		} catch (err) {
			console.error("shadowdark-extras | applyEffectToTarget error:", err);
			return { success: false, effectId: null };
		}
	});

	// Register socket handler to end a focus spell
	socketlibSocket.register("endFocusSpell", async ({ casterId, spellId, reason }) => {
		await endFocusSpell(casterId, spellId, reason);
		return true;
	});

	console.log("shadowdark-extras | All socket handlers registered");
}

/**
 * Get the socketlib socket instance for use in other modules
 * @returns {object|null} The socketlib socket instance
 */
export function getSocket() {
	return socketlibSocket;
}

/**
 * Combat Settings Configuration Application
 */
export class CombatSettingsApp extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "shadowdark-combat-settings",
			classes: ["shadowdark-extras", "combat-settings"],
			title: "Automatic Combat Settings",
			template: "modules/shadowdark-extras/templates/combat-settings.hbs",
			width: 600,
			height: "auto",
			closeOnSubmit: true,
			submitOnChange: false,
			submitOnClose: false,
			tabs: []
		});
	}

	async getData(options = {}) {
		const data = await super.getData(options);

		// Get current combat settings
		data.settings = game.settings.get(MODULE_ID, "combatSettings");

		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Add any custom listeners here
	}

	async _updateObject(event, formData) {
		// Save the combat settings
		const settings = foundry.utils.expandObject(formData);
		await game.settings.set(MODULE_ID, "combatSettings", settings);

		ui.notifications.info("Combat settings saved successfully");
	}
}

/**
 * Default combat settings configuration
 */
export const DEFAULT_COMBAT_SETTINGS = {
	showDamageCard: true, // Default to enabled for testing
	showForPlayers: true, // Show damage card for players
	scrollingCombatText: true, // Show floating damage/healing numbers on tokens
	damageCard: {
		showTargets: true,
		showMultipliers: true,
		showApplyButton: true,
		autoApplyDamage: true,
		damageMultipliers: [
			{ value: 0, label: "×", enabled: true },
			{ value: -1, label: "-1", enabled: false },
			{ value: 0, label: "0", enabled: true },
			{ value: 0.25, label: "¼", enabled: true },
			{ value: 0.5, label: "½", enabled: true },
			{ value: 1, label: "1", enabled: true },
			{ value: 2, label: "2", enabled: true }
		]
	}
};

/**
 * Register combat settings
 */
export function registerCombatSettings() {
	// Register the combat settings data (not shown in config)
	game.settings.register(MODULE_ID, "combatSettings", {
		name: "Combat Settings Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: foundry.utils.deepClone(DEFAULT_COMBAT_SETTINGS)
	});

	// Register a menu button to open the Combat Settings app
	game.settings.registerMenu(MODULE_ID, "combatSettingsMenu", {
		name: "Combat Settings",
		label: "Configure Combat Settings",
		hint: "Configure enhanced combat features like auto apply damage, damage cards and target management",
		icon: "fas fa-crossed-swords",
		type: CombatSettingsApp,
		restricted: true
	});

	// Setup hook for summoned token expiry
	setupSummonExpiryHook();
}

// Track HP values before updates for scrolling text
const _preUpdateHp = new Map();

/**
 * Setup scrolling combat text hooks
 * This catches HP changes from any source (not just our damage cards)
 */
export function setupScrollingCombatText() {
	// Store HP before update
	Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
		// Only process if HP is being changed
		const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
		if (newHp === undefined) return;

		// Store the current HP for comparison after update
		// Use a unique key: for synthetic actors use token id, for real actors use actor id
		const key = actor.isToken ? `token-${actor.token?.id}` : `actor-${actor.id}`;
		const currentHp = actor.system?.attributes?.hp?.value;

		if (currentHp !== undefined) {
			_preUpdateHp.set(key, {
				oldHp: currentHp,
				maxHp: actor.system?.attributes?.hp?.max ?? currentHp,
				isToken: actor.isToken,
				tokenId: actor.token?.id,
				actorId: actor.id
			});
		}
	});

	// Show scrolling text after update
	Hooks.on("updateActor", (actor, changes, options, userId) => {
		// Check if scrolling combat text is enabled
		let settings;
		try {
			settings = game.settings.get(MODULE_ID, "combatSettings");
		} catch (e) {
			return; // Settings not registered yet
		}

		if (settings.scrollingCombatText === false) return;

		// Only process if HP was changed
		const newHp = foundry.utils.getProperty(changes, "system.attributes.hp.value");
		if (newHp === undefined) return;

		// Get the stored pre-update HP using the same key logic
		const key = actor.isToken ? `token-${actor.token?.id}` : `actor-${actor.id}`;
		const preData = _preUpdateHp.get(key);
		if (!preData) return;
		_preUpdateHp.delete(key);

		const hpChange = preData.oldHp - newHp;
		if (hpChange === 0) return;

		const isHealing = hpChange < 0;

		// Find the appropriate token(s) to show scrolling text on
		let tokens = [];

		if (actor.isToken) {
			// Synthetic actor (unlinked token) - get the specific token
			const token = canvas.tokens?.get(actor.token?.id);
			if (token) tokens.push(token);
		} else {
			// Real actor - find all LINKED tokens for this actor
			tokens = canvas.tokens?.placeables?.filter(t =>
				t.actor?.id === actor.id && t.document.actorLink
			) || [];
		}

		for (const token of tokens) {
			// Use socket to broadcast to all clients if available
			if (socketlibSocket) {
				socketlibSocket.executeForEveryone("showScrollingText", {
					tokenId: token.id,
					amount: Math.abs(hpChange),
					isHealing: isHealing
				});
			} else {
				// Fallback to local-only
				showScrollingText(token, Math.abs(hpChange), isHealing);
			}
		}
	});

	console.log("shadowdark-extras | Scrolling combat text initialized");
}

// Track which messages have already spawned creatures (in-memory cache)
const _spawnedMessages = new Set();
const _itemGiveMessages = new Set();

// Track summoned tokens with expiry info for auto-deletion
// Map<sceneId, Array<{tokenIds: string[], expiryRound: number, spellName: string}>>
const _summonedTokensExpiry = new Map();

/**
 * Get summoned token expiry data from scene flags (persistent) or in-memory Map
 */
function getSummonedTokensExpiry(sceneId) {
	// Try in-memory first
	if (_summonedTokensExpiry.has(sceneId)) {
		return _summonedTokensExpiry.get(sceneId);
	}
	// Try scene flags as fallback (persistent)
	const scene = game.scenes.get(sceneId);
	const flagData = scene?.flags?.[MODULE_ID]?.summonedTokensExpiry;
	if (flagData && Array.isArray(flagData)) {
		_summonedTokensExpiry.set(sceneId, flagData);
		return flagData;
	}
	return null;
}

/**
 * Save summoned token expiry data to both in-memory and scene flags
 */
async function saveSummonedTokensExpiry(sceneId, expiryList) {
	if (expiryList && expiryList.length > 0) {
		_summonedTokensExpiry.set(sceneId, expiryList);
		const scene = game.scenes.get(sceneId);
		if (scene && game.user.isGM) {
			await scene.setFlag(MODULE_ID, 'summonedTokensExpiry', expiryList);
		}
	} else {
		_summonedTokensExpiry.delete(sceneId);
		const scene = game.scenes.get(sceneId);
		if (scene && game.user.isGM) {
			await scene.unsetFlag(MODULE_ID, 'summonedTokensExpiry');
		}
	}
}

/**
 * Add summoned tokens to expiry tracking (exported)
 */
export async function trackSummonedTokensForExpiry(sceneId, tokenIds, expiryRound, spellName) {
	const existingList = getSummonedTokensExpiry(sceneId) || [];
	existingList.push({ tokenIds, expiryRound, spellName });
	await saveSummonedTokensExpiry(sceneId, existingList);
	console.log(`shadowdark-extras | Saved ${tokenIds.length} summoned tokens for expiry at round ${expiryRound}`);
}


/**
 * Setup hook to delete expired summoned tokens when combat advances
 */
export function setupSummonExpiryHook() {
	Hooks.on("updateCombat", async (combat, changed, options, userId) => {
		console.log("shadowdark-extras | updateCombat hook fired", { changed, round: combat.round });

		// Only process on round changes
		if (!("round" in changed)) {
			console.log("shadowdark-extras | Not a round change, skipping");
			return;
		}

		// Only run for GM
		if (!game.user.isGM) return;

		const currentRound = combat.round;
		const sceneId = canvas.scene?.id;

		console.log(`shadowdark-extras | Processing round ${currentRound} on scene ${sceneId}`);

		if (!sceneId) return;

		const expiryList = getSummonedTokensExpiry(sceneId);
		if (!expiryList || expiryList.length === 0) {
			console.log("shadowdark-extras | No summons tracked for this scene");
			return;
		}

		console.log(`shadowdark-extras | Checking ${expiryList.length} tracked summons`);

		// expiryList already retrieved above
		const tokensToDelete = [];
		const remainingExpiry = [];
		const expiringMessages = [];
		const remainingMessages = [];

		for (const entry of expiryList) {
			const roundsRemaining = entry.expiryRound - currentRound;
			console.log(`shadowdark-extras | Entry: ${entry.spellName}, expires round ${entry.expiryRound}, current: ${currentRound}, remaining: ${roundsRemaining}`);

			if (currentRound >= entry.expiryRound) {
				tokensToDelete.push(...entry.tokenIds);
				expiringMessages.push(`<b>${entry.spellName}</b> has expired!`);
				console.log(`shadowdark-extras | EXPIRED: ${entry.spellName}`);
			} else {
				remainingExpiry.push(entry);
				remainingMessages.push(`<b>${entry.spellName}</b>: ${roundsRemaining} round${roundsRemaining !== 1 ? 's' : ''} remaining`);
			}
		}

		// Update the tracking list
		await saveSummonedTokensExpiry(sceneId, remainingExpiry);

		// Post chat message with summon status
		const allMessages = [...expiringMessages, ...remainingMessages];
		if (allMessages.length > 0) {
			const content = `
				<div class="sdx-summon-status">
					<h4 style="margin: 0 0 6px 0; border-bottom: 1px solid #666; padding-bottom: 4px;">
						<i class="fas fa-dragon"></i> Summon Status
					</h4>
					<ul style="margin: 0; padding-left: 16px; list-style-type: none;">
						${allMessages.map(m => `<li style="margin: 2px 0;">${m}</li>`).join('')}
					</ul>
				</div>
			`;
			ChatMessage.create({
				content: content,
				whisper: [game.user.id] // Whisper to GM only
			});
		}

		// Delete expired tokens
		if (tokensToDelete.length > 0) {
			try {
				// Filter to only tokens that still exist on the scene
				const existingTokenIds = tokensToDelete.filter(id => canvas.tokens.get(id));
				if (existingTokenIds.length > 0) {
					await canvas.scene.deleteEmbeddedDocuments("Token", existingTokenIds);
					ui.notifications.info(`Deleted ${existingTokenIds.length} expired summoned creature(s)`);
					console.log(`shadowdark-extras | Deleted ${existingTokenIds.length} expired summoned tokens:`, existingTokenIds);
				}
			} catch (err) {
				console.error("shadowdark-extras | Error deleting expired summons:", err);
			}
		}
	});

	console.log("shadowdark-extras | Summon expiry hook initialized");
}

// Track messages that have already had damage cards injected to prevent duplicates
const _damageCardInjected = new Set();

// Track messages that have already had template placement to prevent re-triggering
const _templatePlacedMessages = new Set();

/**
 * Show a dialog allowing the user to select which effects to apply
 * @param {Array} effectOptions - Array of {uuid, name, img, data} objects
 * @returns {Promise<Array>} - Array of selected effect data objects, or null if cancelled
 */
async function showEffectSelectionDialog(effectOptions) {
	return new Promise((resolve) => {
		// Build checkboxes HTML
		let checkboxesHtml = '';
		for (let i = 0; i < effectOptions.length; i++) {
			const opt = effectOptions[i];
			checkboxesHtml += `
				<div class="sdx-effect-option" style="display: flex; align-items: center; gap: 8px; padding: 4px 0;">
					<input type="checkbox" id="effect-${i}" name="effect-${i}" value="${i}" checked style="width: 16px; height: 16px;">
					<img src="${opt.img}" alt="${opt.name}" style="width: 24px; height: 24px; border-radius: 4px;">
					<label for="effect-${i}" style="cursor: pointer;">${opt.name}</label>
				</div>
			`;
		}

		const dialogContent = `
			<form>
				<p style="margin-bottom: 12px;">Select which effects to apply:</p>
				<div class="sdx-effect-options" style="display: flex; flex-direction: column; gap: 4px;">
					${checkboxesHtml}
				</div>
			</form>
		`;

		new Dialog({
			title: "Select Effects",
			content: dialogContent,
			buttons: {
				apply: {
					icon: '<i class="fas fa-check"></i>',
					label: "Apply Selected",
					callback: (html) => {
						const selectedEffects = [];
						for (let i = 0; i < effectOptions.length; i++) {
							const checkbox = html.find(`input[name="effect-${i}"]`);
							if (checkbox.is(':checked')) {
								selectedEffects.push(effectOptions[i].data);
							}
						}
						resolve(selectedEffects);
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: "Cancel",
					callback: () => resolve(null)
				}
			},
			default: "apply",
			close: () => resolve(null)
		}).render(true);
	});
}

/**
 * Inject damage card into chat messages
 */
export async function injectDamageCard(message, html, data) {
	console.log("shadowdark-extras | injectDamageCard called", { message, html, data });

	// Skip if the message is being deleted or closed
	if (html.hasClass('deleting') || data.canClose) {
		console.log("shadowdark-extras | Message is being deleted/closed, skipping");
		return;
	}

	// Skip if a damage card is already in the DOM for this message
	if (html.find('.sdx-damage-card').length > 0) {
		console.log("shadowdark-extras | Damage card already exists in DOM, skipping");
		return;
	}

	// Prevent duplicate injection for the same message
	const messageKey = message.id;

	// Skip if damage card was already fully injected for this message
	if (_damageCardInjected.has(messageKey)) {
		console.log("shadowdark-extras | Damage card already injected for this message, skipping");
		return;
	}

	// Check if damage card feature is enabled
	let settings;
	try {
		settings = game.settings.get(MODULE_ID, "combatSettings");
		console.log("shadowdark-extras | Combat settings:", settings);
	} catch (e) {
		console.log("shadowdark-extras | Settings not registered yet:", e);
		return; // Settings not registered yet
	}

	if (!settings.showDamageCard) {
		console.log("shadowdark-extras | Damage card disabled in settings");
		return;
	}

	// Check if player damage cards are enabled (for non-GMs)
	if (!game.user.isGM && !settings.showForPlayers) {
		console.log("shadowdark-extras | Damage card disabled for players");
		return;
	}

	// Check if this is a Shadowdark weapon/attack card with damage OR a spell with damage configured
	const hasWeaponCard = html.find('.chat-card').length > 0;
	const hasDamageRoll = html.find('.dice-total').length > 0;

	// Also check for damage text or damage formula
	const messageText = html.text();
	const hasDamageKeyword = messageText.toLowerCase().includes('damage') ||
		html.find('h4').text().toLowerCase().includes('damage');

	console.log("shadowdark-extras | Damage detection:", {
		hasWeaponCard,
		hasDamageRoll,
		hasDamageKeyword,
		flavor: message.flavor,
		rollType: message.flags?.shadowdark?.rollType
	});

	// Check if this looks like a damage roll
	const isDamageRoll = (hasWeaponCard && hasDamageRoll && hasDamageKeyword) ||
		(message.flavor?.toLowerCase().includes('damage')) ||
		(message.flags?.shadowdark?.rollType === 'damage');

	// Check if this is a spell cast with damage/heal configuration or effects
	let isSpellWithDamage = false;
	let isSpellWithEffects = false;
	let spellDamageConfig = null;
	let casterActor = null; // The actor who owns the spell item
	let item = null; // The spell/potion item

	// Get the item from the chat card if it exists
	const cardData = html.find('.chat-card').data();
	console.log("shadowdark-extras | Card data:", cardData);
	let itemType = null; // Track the item type
	if (cardData?.actorId && cardData?.itemId) {
		casterActor = game.actors.get(cardData.actorId);
		item = casterActor?.items.get(cardData.itemId);
		console.log("shadowdark-extras | Retrieved item:", item?.name, "from actor:", casterActor?.name);

		// If item not found (consumed), try to get it from message flags
		if (!item && message.flags?.[MODULE_ID]?.itemConfig) {
			const storedConfig = message.flags[MODULE_ID].itemConfig;
			console.log("shadowdark-extras | Item not found on actor, using stored config:", storedConfig);

			// Create a minimal item-like object with the stored configuration
			item = {
				name: storedConfig.name,
				type: storedConfig.type,
				flags: {
					[MODULE_ID]: {
						summoning: storedConfig.summoning,
						itemGive: storedConfig.itemGive
					}
				}
			};
		}

		// Check if this is a spell or potion type item with damage configuration or effects
		if (item && ["Spell", "Scroll", "Wand", "NPC Spell", "Potion"].includes(item.type)) {
			itemType = item.type; // Store item type for later checks
			spellDamageConfig = item.flags?.["shadowdark-extras"]?.spellDamage;
			if (spellDamageConfig?.enabled) {
				isSpellWithDamage = true;
				console.log("shadowdark-extras | Item has damage configuration:", spellDamageConfig);
			}
			// Check for effects even if damage is not enabled
			if (spellDamageConfig?.effects) {
				let effects = [];
				if (typeof spellDamageConfig.effects === 'string') {
					try {
						effects = JSON.parse(spellDamageConfig.effects);
					} catch (err) {
						effects = [];
					}
				} else if (Array.isArray(spellDamageConfig.effects)) {
					effects = spellDamageConfig.effects;
				}
				if (effects.length > 0) {
					isSpellWithEffects = true;
					console.log("shadowdark-extras | Item has effects:", effects);
				}
			}
			// Also check for critical effects
			if (spellDamageConfig?.criticalEffects) {
				let critEffects = [];
				if (typeof spellDamageConfig.criticalEffects === 'string') {
					try {
						critEffects = JSON.parse(spellDamageConfig.criticalEffects);
					} catch (err) {
						critEffects = [];
					}
				} else if (Array.isArray(spellDamageConfig.criticalEffects)) {
					critEffects = spellDamageConfig.criticalEffects;
				}
				if (critEffects.length > 0) {
					isSpellWithEffects = true;
					console.log("shadowdark-extras | Item has critical effects:", critEffects);
				}
			}
		}
	}

	// Check for summoning configuration (independent of damage/effects)
	const summoningConfig = item?.flags?.[MODULE_ID]?.summoning;
	if (summoningConfig?.enabled && summoningConfig?.profiles && summoningConfig.profiles.length > 0) {
		console.log("shadowdark-extras | Item has summoning configured");
		console.log("shadowdark-extras | Message author:", message.author.id, "Current user:", game.user.id);

		// Only spawn for the user who created the message (the caster)
		if (message.author.id !== game.user.id) {
			console.log("shadowdark-extras | Skipping summoning - not the message author");
			// Don't return - still process other damage/effects for observers
		} else if (_spawnedMessages.has(message.id)) {
			// Check in-memory cache (synchronous, prevents race condition)
			console.log("shadowdark-extras | Skipping summoning - already spawned for this message");
		} else {
			// Check if the spell cast was successful (skip this check for potions, scrolls, and wands)
			if (!["Potion", "Scroll", "Wand"].includes(itemType)) {
				const shadowdarkRolls = message.flags?.shadowdark?.rolls;
				const mainRoll = shadowdarkRolls?.main;

				if (!mainRoll || mainRoll.success !== true) {
					console.log("shadowdark-extras | Spell cast failed, not summoning creatures");
					return;
				}
			}

			// Mark as spawned immediately (synchronous)
			_spawnedMessages.add(message.id);

			console.log("shadowdark-extras | Profiles type:", typeof summoningConfig.profiles);
			console.log("shadowdark-extras | Profiles value:", summoningConfig.profiles);
			console.log("shadowdark-extras | Is Array?:", Array.isArray(summoningConfig.profiles));

			// Parse profiles if it's a string
			let profiles = summoningConfig.profiles;
			if (typeof profiles === 'string') {
				try {
					profiles = JSON.parse(profiles);
					console.log("shadowdark-extras | Parsed profiles from string:", profiles);
				} catch (err) {
					console.error("shadowdark-extras | Failed to parse profiles:", err);
					return;
				}
			}

			// Check for critical success to double duration
			const shadowdarkRolls = message.flags?.shadowdark?.rolls;
			const mainRoll = shadowdarkRolls?.main;
			const isCriticalSuccess = mainRoll?.critical === "success";
			if (isCriticalSuccess) {
				console.log("shadowdark-extras | Critical success! Duration will be doubled for summons");
			}

			// Automatically spawn creatures when spell is cast
			await spawnSummonedCreatures(casterActor, item, profiles, summoningConfig, isCriticalSuccess);
		}
	}

	const itemGiveConfig = item?.flags?.[MODULE_ID]?.itemGive;
	console.log("shadowdark-extras | Checking item give - item:", item?.name, "type:", itemType, "config:", itemGiveConfig);
	if (itemGiveConfig?.enabled && itemGiveConfig?.profiles && itemGiveConfig.profiles.length > 0) {
		console.log("shadowdark-extras | Item give configured");
		if (message.author.id !== game.user.id) {
			console.log("shadowdark-extras | Skipping item give - not the message author");
		} else if (_itemGiveMessages.has(message.id)) {
			console.log("shadowdark-extras | Skipping item give - already processed this message");
		} else {
			let shouldGive = true;
			if (!["Potion", "Scroll", "Wand"].includes(itemType)) {
				const shadowdarkRolls = message.flags?.shadowdark?.rolls;
				const mainRoll = shadowdarkRolls?.main;
				if (!mainRoll || mainRoll.success !== true) {
					console.log("shadowdark-extras | Spell cast failed, not giving items");
					shouldGive = false;
				}
			}
			if (shouldGive) {
				_itemGiveMessages.add(message.id);
				let profiles = itemGiveConfig.profiles;
				if (typeof profiles === 'string') {
					try {
						profiles = JSON.parse(profiles);
					} catch (err) {
						console.error("shadowdark-extras | Failed to parse item give profiles:", err);
						profiles = [];
					}
				}
				await giveItemsToCaster(casterActor, item, profiles);
			}
		}
	}

	if (!isDamageRoll && !isSpellWithDamage && !isSpellWithEffects) {
		console.log("shadowdark-extras | Not a damage roll, spell with damage, or spell with effects, skipping");
		return;
	}

	// Get the actor for damage rolls - for spells use the caster, otherwise use speaker
	const speaker = message.speaker;
	let actor;
	let casterTokenId = speaker?.token || ''; // The actual token that made the attack/cast

	if ((isSpellWithDamage || isSpellWithEffects) && casterActor) {
		// Use the actor who owns the spell item (the caster)
		actor = casterActor;
		console.log("shadowdark-extras | Using spell caster actor:", actor.name, "token:", casterTokenId);
	} else {
		// For regular attacks, use the speaker
		if (!speaker?.actor) {
			console.log("shadowdark-extras | No speaker actor");
			return;
		}
		actor = game.actors.get(speaker.actor);
		if (!actor) {
			console.log("shadowdark-extras | Actor not found");
			return;
		}
	}

	// Get targeted tokens - use stored targets from message flags if available
	let targets = [];
	const storedTargetIds = message.flags?.["shadowdark-extras"]?.targetIds;

	// Check if item has template targeting mode enabled
	const targetingConfig = item?.flags?.[MODULE_ID]?.targeting;
	let useTemplateTargeting = targetingConfig?.mode === 'template' &&
		message.author.id === game.user.id && // Only for the caster
		!_templatePlacedMessages.has(messageKey); // Use in-memory check instead of flags

	// For spells that require success rolls, only show template if spell succeeded
	if (useTemplateTargeting && !["Potion", "Scroll", "Wand"].includes(itemType)) {
		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;
		if (!mainRoll || mainRoll.success !== true) {
			console.log("shadowdark-extras | Spell cast failed, not showing template placement");
			useTemplateTargeting = false;
		}
	}

	if (useTemplateTargeting) {
		console.log("shadowdark-extras | Template targeting enabled, showing template placement");

		// Get template settings
		const templateSettings = targetingConfig.template || {};
		const templateType = templateSettings.type || 'circle';
		const templateSize = templateSettings.size || 30;
		const placement = templateSettings.placement || 'choose';
		const fillColor = templateSettings.fillColor || '#4e9a06';
		const deleteMode = templateSettings.deleteMode || 'none';
		const deleteDuration = templateSettings.deleteDuration || 3;
		const deleteSeconds = templateSettings.deleteSeconds || 1;
		const hideOutline = templateSettings.hideOutline || false;
		const excludeCaster = templateSettings.excludeCaster || false;

		// TokenMagic settings
		const tmSettings = templateSettings.tokenMagic || {};
		const tmTexture = tmSettings.texture || '';
		const tmOpacity = tmSettings.opacity ?? 0.5;
		const tmPreset = tmSettings.preset || 'NOFX';
		const tmTint = tmSettings.tint || '';

		// Calculate auto-delete timing
		let autoDelete = null;
		if (deleteMode === 'endOfTurn') {
			// Delete after 6 seconds (roughly end of turn)
			autoDelete = 6000;
		} else if (deleteMode === 'duration') {
			// Delete after rounds * 6 seconds (roughly 1 round = 6 seconds)
			autoDelete = deleteDuration * 6000;
		} else if (deleteMode === 'seconds') {
			// Delete after X seconds
			autoDelete = deleteSeconds * 1000;
		}

		try {
			// Use SDX.templates API if available
			if (typeof SDX !== 'undefined' && SDX.templates) {
				// Determine placement mode
				let result;
				if (placement === 'centered') {
					// Auto-center on caster's token
					const casterTokenId = speaker?.token;
					const casterToken = canvas.tokens.get(casterTokenId);
					if (casterToken) {
						// Place template centered on caster
						result = await SDX.templates.placeAndTarget({
							type: templateType,
							size: templateSize,
							fillColor: fillColor,
							autoDelete: autoDelete,
							x: casterToken.center.x,
							y: casterToken.center.y,
							texture: tmTexture || null,
							textureOpacity: tmOpacity,
							tmfxPreset: tmPreset,
							tmfxTint: tmTint
						});
					}
				} else if (placement === 'caster') {
					// Originate from caster - origin locked to caster, user controls direction
					const casterTokenId = speaker?.token;
					const casterToken = canvas.tokens.get(casterTokenId);
					if (casterToken) {
						result = await SDX.templates.placeAndTarget({
							type: templateType,
							size: templateSize,
							fillColor: fillColor,
							autoDelete: autoDelete,
							originFromCaster: {
								x: casterToken.center.x,
								y: casterToken.center.y
							},
							texture: tmTexture || null,
							textureOpacity: tmOpacity,
							tmfxPreset: tmPreset,
							tmfxTint: tmTint
						});
					} else {
						// No caster token found, fall back to choose location
						console.warn("shadowdark-extras | Caster token not found for originate from caster, falling back to choose location");
						result = await SDX.templates.placeAndTarget({
							type: templateType,
							size: templateSize,
							fillColor: fillColor,
							autoDelete: autoDelete,
							texture: tmTexture || null,
							textureOpacity: tmOpacity,
							tmfxPreset: tmPreset,
							tmfxTint: tmTint
						});
					}
				} else {
					// Choose location - user clicks to place
					result = await SDX.templates.placeAndTarget({
						type: templateType,
						size: templateSize,
						fillColor: fillColor,
						autoDelete: autoDelete,
						texture: tmTexture || null,
						textureOpacity: tmOpacity,
						tmfxPreset: tmPreset,
						tmfxTint: tmTint
					});
				}

				if (result && result.tokens) {
					targets = result.tokens.map(t => canvas.tokens.get(t.id)).filter(t => t);
					console.log("shadowdark-extras | Template targeting got tokens:", targets.length);

					// Filter out caster if excludeCaster is enabled
					if (excludeCaster && speaker?.token) {
						targets = targets.filter(t => t.id !== speaker.token);
						console.log("shadowdark-extras | After excluding caster, tokens:", targets.length);
					}

					// Mark this message as having template placed using in-memory tracking
					// We avoid message.update() because it triggers re-renders that remove our injected damage card
					_templatePlacedMessages.add(messageKey);
				} else {
					console.log("shadowdark-extras | Template placement cancelled");
					return; // User cancelled
				}
			} else {
				console.warn("shadowdark-extras | SDX.templates not available, falling back to user targets");
				targets = Array.from(game.user.targets || []);
			}
		} catch (err) {
			console.error("shadowdark-extras | Error during template placement:", err);
			targets = Array.from(game.user.targets || []);
		}
	} else if (storedTargetIds && storedTargetIds.length > 0) {
		// Use the stored targets from when the message was created
		targets = storedTargetIds
			.map(id => canvas.tokens.get(id))
			.filter(t => t); // Filter out any tokens that no longer exist
		console.log("shadowdark-extras | Using stored targets:", targets.length);
	} else {
		// Fallback to current user's targets (backward compatibility)
		targets = Array.from(game.user.targets || []);
		console.log("shadowdark-extras | Using current user targets:", targets.length);
	}

	console.log("shadowdark-extras | Targets:", targets);

	// Don't show card if no targets
	if (targets.length === 0 && !game.user.isGM) {
		console.log("shadowdark-extras | No targets selected");
		return;
	}

	// Calculate total damage from the roll
	let totalDamage = 0;
	let damageType = "damage"; // "damage" or "healing"

	// For spells with damage configuration, calculate damage from the spell config
	if (isSpellWithDamage && spellDamageConfig) {
		// Check if the spell cast was successful (skip this check for potions, scrolls, and wands)
		if (!["Potion", "Scroll", "Wand"].includes(itemType)) {
			const shadowdarkRolls = message.flags?.shadowdark?.rolls;
			const mainRoll = shadowdarkRolls?.main;

			if (!mainRoll || mainRoll.success !== true) {
				console.log("shadowdark-extras | Spell cast failed, not applying damage");
				return;
			}
		}

		damageType = spellDamageConfig.damageType || "damage";

		// Clear any cached roll data from previous items
		window._lastSpellRollBreakdown = null;
		window._perTargetDamage = null;
		window._damageRequirement = null;

		// Determine which formula type to use (default to 'basic' if not specified)
		const formulaType = spellDamageConfig.formulaType || 'basic';

		// Check if the spell was a critical success (for dice doubling)
		const shadowdarkRolls2 = message.flags?.shadowdark?.rolls;
		const mainRoll2 = shadowdarkRolls2?.main;
		const isSpellCritical = mainRoll2?.critical === "success";

		console.log("shadowdark-extras | Spell critical check:", {
			critical: mainRoll2?.critical,
			isSpellCritical,
			formulaType
		});

		// Build damage formula based on selected formula type
		let formula = '';
		let tieredFormula = '';
		let hasTieredFormula = false;

		if (formulaType === 'formula') {
			// Use custom formula
			formula = spellDamageConfig.formula || '';
		} else if (formulaType === 'tiered') {
			// Use tiered formula
			tieredFormula = spellDamageConfig.tieredFormula || '';
			hasTieredFormula = tieredFormula.trim() !== '';
		} else {
			// Use basic formula (numDice + dieType + bonus)
			// NOTE: Critical doubling is handled later by doubleDiceInFormula for all formula types
			const numDice = spellDamageConfig.numDice || 1;
			const dieType = spellDamageConfig.dieType || "d6";
			const bonus = spellDamageConfig.bonus || 0;

			formula = `${numDice}${dieType}`;
			if (bonus > 0) {
				formula += `+${bonus}`;
			} else if (bonus < 0) {
				formula += `${bonus}`;
			}
		}

		// Roll the damage formula (or tiered formula)
		if (formula || hasTieredFormula) {
			try {
				// Check if formula contains target variables (tiered formulas always need per-target evaluation)
				const hasTargetVariables = (formula && formula.includes('@target.')) || hasTieredFormula;

				// Create base roll data with caster data
				const baseRollData = actor?.getRollData() || {};
				// Flatten level.value to just level for easier formula usage
				if (baseRollData.level && typeof baseRollData.level === 'object' && baseRollData.level.value !== undefined) {
					baseRollData.level = baseRollData.level.value;
				}
				// Ensure ability modifiers are available as @str, @dex, etc.
				if (baseRollData.abilities) {
					['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
						if (baseRollData.abilities[ability]?.mod !== undefined) {
							baseRollData[ability] = baseRollData.abilities[ability].mod; // @cha = modifier
						}
						if (baseRollData.abilities[ability]?.base !== undefined) {
							baseRollData[ability + 'Base'] = baseRollData.abilities[ability].base; // @chaBase = base score
						}
					});
				}
				// Ensure other common stats are available
				if (baseRollData.attributes?.ac?.value !== undefined) baseRollData.ac = baseRollData.attributes.ac.value;
				if (baseRollData.attributes?.hp?.value !== undefined) baseRollData.hp = baseRollData.attributes.hp.value;

				// If formula uses target variables OR we have a tiered formula (which needs target level), we need to roll per-target
				if ((hasTargetVariables || hasTieredFormula) && targets.length > 0) {
					const formulaDisplay = hasTieredFormula ? `Tiered: ${tieredFormula}` : formula;
					console.log(`%c╔═══════════════════════════════════════════════════════╗`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c║ SPELL ${damageType.toUpperCase()} ROLL (PER-TARGET)`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c╠═══════════════════════════════════════════════════════╣`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c║ Caster:  ${actor.name} (Level ${baseRollData.level})`, 'color: #9C27B0; font-weight: bold;');
					console.log(`%c║ Formula: ${formulaDisplay}`, 'color: #2196F3; font-weight: bold;');

					// Store per-target damage for later use
					window._perTargetDamage = {};
					let totalDamageSum = 0;

					for (const target of targets) {
						const targetActor = target.actor;
						if (!targetActor) continue;

						// Clone base roll data and add target data
						const rollData = foundry.utils.duplicate(baseRollData);
						const targetRollData = targetActor.getRollData() || {};

						// Create target object in rollData
						rollData.target = buildTargetRollData(targetActor);

						// Check for tiered formula and resolve it for this target's level
						let targetFormula = formula;
						if (hasTieredFormula) {
							const tieredResult = parseTieredFormula(tieredFormula, rollData.target.level);
							if (tieredResult) {
								targetFormula = tieredResult;
								console.log(`%c║ Using tiered formula for level ${rollData.target.level}: ${targetFormula}`, 'color: #00BCD4; font-weight: bold;');
							}
						}

						// Evaluate any expressions in the formula (e.g., (1 + floor(@level / 2))d6 -> 2d6)
						targetFormula = evaluateFormulaExpressions(targetFormula, rollData);

						// Double dice on critical hit
						if (isSpellCritical) {
							targetFormula = doubleDiceInFormula(targetFormula);
							console.log(`%c║ Critical hit! Doubled dice: ${targetFormula}`, 'color: #FF5722; font-weight: bold;');
						}

						// Roll for this specific target
						const roll = new Roll(targetFormula, rollData);
						await roll.evaluate();
						let targetDamage = roll.total;

						// Check damage requirement if it exists
						if (spellDamageConfig.damageRequirement && spellDamageConfig.damageRequirement.trim() !== '') {
							const reqFormula = spellDamageConfig.damageRequirement.trim();
							const requirementMet = evaluateRequirement(reqFormula, rollData);

							if (!requirementMet) {
								const failAction = spellDamageConfig.damageRequirementFailAction || 'zero';
								if (failAction === 'half') {
									targetDamage = Math.floor(targetDamage / 2);
									console.log(`%c║   Requirement failed (${reqFormula}): halving damage`, 'color: #FFC107; font-weight: bold;');
								} else {
									targetDamage = 0;
									console.log(`%c║   Requirement failed (${reqFormula}): zeroing damage`, 'color: #FFC107; font-weight: bold;');
								}
							}
						}

						totalDamageSum += targetDamage;

						// Store this target's damage
						window._perTargetDamage[target.id] = {
							damage: targetDamage,
							roll: roll,
							formula: roll.formula
						};

						console.log(`%c║ ${targetActor.name}: ${targetDamage} (Level ${rollData.target.level})`, 'color: #FF9800; font-weight: bold;');
					}

					// Use average damage for display (or total, depending on your preference)
					totalDamage = Math.floor(totalDamageSum / targets.length);
					window._lastSpellRollBreakdown = `Per-target (avg: ${totalDamage})`;

					console.log(`%c║ Average: ${totalDamage}`, 'color: #F44336; font-weight: bold; font-size: 14px;');
					console.log(`%c╚═══════════════════════════════════════════════════════╝`, 'color: #4CAF50; font-weight: bold;');
				} else {
					// No target variables and no tiered formula, roll once for all targets
					const rollData = baseRollData;

					// Check for tiered formula - use caster's level when no targets
					let finalFormula = formula;
					if (hasTieredFormula) {
						const tieredResult = parseTieredFormula(tieredFormula, rollData.level);
						if (tieredResult) {
							finalFormula = tieredResult;
							console.log(`%c║ Using tiered formula for caster level ${rollData.level}: ${finalFormula}`, 'color: #00BCD4; font-weight: bold;');
						}
					}

					// Evaluate any expressions in the formula (e.g., (1 + floor(@level / 2))d6 -> 2d6)
					finalFormula = evaluateFormulaExpressions(finalFormula, rollData);

					// Double dice on critical hit
					if (isSpellCritical) {
						const originalFormula = finalFormula;
						finalFormula = doubleDiceInFormula(finalFormula);
						console.log(`%c║ Critical hit! Doubled dice: ${originalFormula} → ${finalFormula}`, 'color: #FF5722; font-weight: bold;');
					}

					const roll = new Roll(finalFormula, rollData);
					await roll.evaluate();
					totalDamage = roll.total;

					// Check damage requirement if it exists
					// For non-per-target damage, we evaluate the requirement without target context
					if (spellDamageConfig.damageRequirement && spellDamageConfig.damageRequirement.trim() !== '') {
						// If the requirement has @target variables but we're not rolling per-target,
						// we'll apply the requirement to each target when damage is actually applied
						const requirementFormula = spellDamageConfig.damageRequirement.trim();

						// Only evaluate now if there are no target variables
						if (!requirementFormula.includes('@target.')) {
							const requirementMet = evaluateRequirement(requirementFormula, rollData);

							if (!requirementMet) {
								const failAction = spellDamageConfig.damageRequirementFailAction || 'zero';
								if (failAction === 'half') {
									totalDamage = Math.floor(totalDamage / 2);
									console.log(`%c║ Requirement failed (${requirementFormula}): halving damage`, 'color: #FFC107; font-weight: bold;');
								} else {
									totalDamage = 0;
									console.log(`%c║ Requirement failed (${requirementFormula}): zeroing damage`, 'color: #FFC107; font-weight: bold;');
								}
							}
						} else {
							// Store requirement info for per-target evaluation during damage application
							window._damageRequirement = {
								formula: requirementFormula,
								failAction: spellDamageConfig.damageRequirementFailAction || 'zero',
								casterData: rollData
							};
							console.log(`%c║ Damage requirement will be evaluated per-target: ${requirementFormula}`, 'color: #2196F3; font-weight: bold;');
						}
					}

					// Build detailed breakdown of the roll
					const diceBreakdown = roll.dice.map(d => {
						const results = d.results.map(r => r.result).join(', ');
						return `${d.number}${d.faces === 'f' ? 'dF' : 'd' + d.faces}: [${results}]`;
					}).join(' + ');

					const rollBreakdown = roll.formula + ' = ' + (diceBreakdown || totalDamage);
					const formulaDisplay = hasTieredFormula ? `Tiered → ${finalFormula}` : finalFormula;

					console.log(`%c╔═══════════════════════════════════════════════════════╗`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c║ SPELL ${damageType.toUpperCase()} ROLL`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c╠═══════════════════════════════════════════════════════╣`, 'color: #4CAF50; font-weight: bold;');
					console.log(`%c║ Caster:  ${actor.name} (Level ${rollData.level})`, 'color: #9C27B0; font-weight: bold;');
					console.log(`%c║ Formula: ${formulaDisplay}`, 'color: #2196F3; font-weight: bold;');
					console.log(`%c║ Result:  ${rollBreakdown}`, 'color: #FF9800; font-weight: bold;');
					console.log(`%c║ Total:   ${totalDamage}`, 'color: #F44336; font-weight: bold; font-size: 14px;');
					console.log(`%c╚═══════════════════════════════════════════════════════╝`, 'color: #4CAF50; font-weight: bold;');

					// Store roll breakdown for use in damage card
					window._lastSpellRollBreakdown = rollBreakdown;
					// Store the actual Roll object so buildRollBreakdown can extract individual dice
					window._lastSpellRoll = roll;
				}
			} catch (error) {
				console.error("shadowdark-extras | Error rolling spell damage:", error);
				ui.notifications.error(`Invalid spell damage formula: ${formula}`);
				return;
			}
		}
	}
	// For regular weapon damage, get from message rolls
	else {
		// Shadowdark stores rolls in message.flags.shadowdark.rolls
		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		if (shadowdarkRolls?.damage?.roll?.total) {
			totalDamage = shadowdarkRolls.damage.roll.total;
		} else if (message.rolls?.[0]) {
			// Fallback to standard rolls array
			totalDamage = message.rolls[0].total || 0;
		} else {
			// Last resort: try to parse from the displayed total in the damage section
			const $damageTotal = html.find('.card-damage-roll-single .dice-total, .card-damage-rolls .dice-total').first();
			if ($damageTotal.length) {
				totalDamage = parseInt($damageTotal.text()) || 0;
			}
		}
	}

	console.log("shadowdark-extras | Total damage:", totalDamage);

	// Check if spell has effects to apply
	let spellEffects = [];
	if ((isSpellWithDamage || isSpellWithEffects) && spellDamageConfig?.effects) {
		// Handle case where effects might be a string instead of an array
		if (typeof spellDamageConfig.effects === 'string') {
			try {
				spellEffects = JSON.parse(spellDamageConfig.effects);
			} catch (err) {
				console.warn("shadowdark-extras | Could not parse spell effects:", err);
				spellEffects = [];
			}
		} else if (Array.isArray(spellDamageConfig.effects)) {
			spellEffects = spellDamageConfig.effects;
		}
		console.log("shadowdark-extras | Spell has effects to apply:", spellEffects);
	}

	// Check if this was a critical hit (for doubling bonus dice)
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const mainRoll = shadowdarkRolls?.main;
	const isCritical = mainRoll?.critical === "success";
	console.log("shadowdark-extras | Critical detection:", { mainRollCritical: mainRoll?.critical, isCritical });

	// Check if spell has critical effects and this was a critical success
	// If critical effects exist, use them INSTEAD of normal effects
	if (isCritical && (isSpellWithDamage || isSpellWithEffects) && spellDamageConfig?.criticalEffects) {
		let criticalEffects = [];
		if (typeof spellDamageConfig.criticalEffects === 'string') {
			try {
				criticalEffects = JSON.parse(spellDamageConfig.criticalEffects);
			} catch (err) {
				console.warn("shadowdark-extras | Could not parse spell critical effects:", err);
				criticalEffects = [];
			}
		} else if (Array.isArray(spellDamageConfig.criticalEffects)) {
			criticalEffects = spellDamageConfig.criticalEffects;
		}

		// If critical effects exist, replace normal effects with them
		if (criticalEffects.length > 0) {
			console.log("shadowdark-extras | Critical success! Using critical effects instead:", criticalEffects);
			spellEffects = criticalEffects;
		}
	}

	// Get effect selection mode and apply it
	const effectSelectionMode = spellDamageConfig?.effectSelectionMode || 'all';
	let originalEffectsForPrompt = null; // Store original effects for 'prompt' mode

	if (spellEffects.length > 1) {
		console.log("shadowdark-extras | Effect selection mode:", effectSelectionMode, "Effects count:", spellEffects.length);

		if (effectSelectionMode === 'random') {
			// Randomly select one effect
			const randomIndex = Math.floor(Math.random() * spellEffects.length);
			const selectedEffect = spellEffects[randomIndex];
			console.log("shadowdark-extras | Random mode: selected effect", randomIndex, selectedEffect);
			spellEffects = [selectedEffect];
		} else if (effectSelectionMode === 'prompt') {
			// Store original effects for the click handler to use for prompting
			originalEffectsForPrompt = [...spellEffects];
			console.log("shadowdark-extras | Prompt mode: will ask user to select effects");
		}
		// 'all' mode: keep all effects as-is
	}

	// Check if weapon has effects to apply (from weapon bonus config)
	let weaponEffects = [];
	let weaponBonusDamage = null;
	if (item?.type === "Weapon") {
		const weaponBonusFlags = item.flags?.[MODULE_ID]?.weaponBonus;
		if (weaponBonusFlags?.enabled) {
			// Get target for requirement evaluation
			const targetToken = targets[0];
			const targetActor = targetToken?.actor;

			// Get weapon effects to apply
			weaponEffects = getWeaponEffectsToApply(item, actor, targetActor);
			console.log("shadowdark-extras | Weapon has effects to apply:", weaponEffects);

			// Calculate weapon bonus damage
			try {
				weaponBonusDamage = await calculateWeaponBonusDamage(item, actor, targetActor, isCritical);
				if (weaponBonusDamage.requirementsMet && (weaponBonusDamage.totalBonus !== 0 || weaponBonusDamage.criticalBonus !== 0)) {
					// Add bonus damage to total (but show it separately in the card)
					totalDamage += weaponBonusDamage.totalBonus + weaponBonusDamage.criticalBonus;
					console.log("shadowdark-extras | Added weapon bonus damage:", weaponBonusDamage);
				}
			} catch (err) {
				console.warn("shadowdark-extras | Failed to calculate weapon bonus damage:", err);
			}
		}
	}

	// Combine spell effects and weapon effects
	const allEffects = [...spellEffects, ...weaponEffects];

	if (totalDamage === 0 && allEffects.length === 0) {
		console.log("shadowdark-extras | No damage or effects to apply");
		return; // Nothing to apply
	}

	// Override targets based on effectsApplyToTarget setting
	// Damage/healing always applies to targets, only effects can apply to self
	const cardTargets = targets;

	console.log("shadowdark-extras | Building damage card HTML...");

	// Build the damage card HTML (pass allEffects which includes both spell and weapon effects)
	const cardHtml = await buildDamageCardHtml(actor, cardTargets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage, isCritical, item, casterTokenId);

	console.log("shadowdark-extras | Card HTML built, length:", cardHtml?.length);
	console.log("shadowdark-extras | Injecting damage card HTML");

	// Insert the damage card after the chat card or message content
	const $chatCard = html.find('.chat-card');
	console.log("shadowdark-extras | Chat card found:", $chatCard.length);

	if ($chatCard.length) {
		$chatCard.after(cardHtml);
		console.log("shadowdark-extras | Inserted after .chat-card");
	} else {
		const $messageContent = html.find('.message-content');
		console.log("shadowdark-extras | Message content found:", $messageContent.length);
		$messageContent.append(cardHtml);
		console.log("shadowdark-extras | Appended to .message-content");
	}

	// Attach event listeners
	attachDamageCardListeners(html, message.id);

	// Mark message as fully processed now that damage card is injected
	_damageCardInjected.add(messageKey);

	// Check if this is a Focus Check (spell focus maintenance roll)
	// Focus Checks should roll damage but NOT auto-apply effects (effects are already applied)
	const focusCheckText = game.i18n.localize("SHADOWDARK.chat.spell_focus_check");
	const isFocusCheck = message.flavor?.includes(focusCheckText) ||
		message.flavor?.includes("Focus Check");

	if (isFocusCheck) {
		console.log("shadowdark-extras | This is a Focus Check - damage will roll but effects won't be auto-applied");
	}

	// Auto-apply damage if setting is enabled
	// Only auto-apply if there's an attack roll that hit
	// IMPORTANT: Only the message author should auto-apply to prevent duplicates
	const messageAuthorId = message.author?.id ?? message.user?.id;
	if (settings.damageCard.autoApplyDamage && targets.length > 0 && messageAuthorId === game.user.id) {
		// Check if this was an attack that hit
		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;

		// Only auto-apply if:
		// 1. There's no main roll at all (pure damage roll with no attack), OR
		// 2. The main roll exists AND success is explicitly true
		const shouldAutoApply = !mainRoll || mainRoll.success === true;

		if (shouldAutoApply) {
			console.log("shadowdark-extras | Auto-applying damage (main roll:", mainRoll ? "exists, success: " + mainRoll.success : "none", ")");
			// Wait a tiny bit for the card to fully render, then auto-click the apply button(s)
			setTimeout(() => {
				const $applyDamageBtn = html.find('.sdx-apply-damage-btn');
				if ($applyDamageBtn.length) {
					$applyDamageBtn.click();
				}

				// Also auto-apply conditions if they exist - BUT NOT for Focus Checks
				// Effects are already applied on the initial cast
				if (!isFocusCheck) {
					const $applyConditionBtn = html.find('.sdx-apply-condition-btn');
					if ($applyConditionBtn.length) {
						setTimeout(() => {
							$applyConditionBtn.click();
						}, 200); // Slight delay after damage
					}
				} else {
					console.log("shadowdark-extras | Skipping effect auto-apply for Focus Check");
				}
			}, 100);
		} else {
			console.log("shadowdark-extras | Not auto-applying damage (attack failed, success:", mainRoll?.success, ")");
		}
	} else if (settings.damageCard.autoApplyDamage && messageAuthorId !== game.user.id) {
		console.log("shadowdark-extras | Skipping auto-apply (not message author)");
	}

	// Start duration spell tracking if enabled
	// Only start if this is a spell with trackDuration enabled and cast was successful
	if (item && ["Spell", "Scroll", "Wand", "NPC Spell"].includes(item.type) &&
		spellDamageConfig?.trackDuration &&
		!isFocusCheck &&
		messageAuthorId === game.user.id) {

		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;
		const castSuccessful = !mainRoll || mainRoll.success === true;

		if (castSuccessful) {
			try {
				// Get target token IDs for tracking
				const targetTokenIds = targets.map(t => t.id);

				// Prepare spell config for duration tracking
				const durationConfig = {
					perTurnTrigger: spellDamageConfig.perTurnTrigger || "start",
					perTurnDamage: spellDamageConfig.perTurnDamage || "",
					reapplyEffects: spellDamageConfig.reapplyEffects || false,
					damageType: spellDamageConfig.damageType || "",
					effects: spellDamageConfig.effects || []
				};

				await startDurationSpell(actor, item, targetTokenIds, durationConfig);
				console.log("shadowdark-extras | Started duration spell tracking for:", item.name);
			} catch (durationError) {
				console.warn("shadowdark-extras | Failed to start duration spell tracking:", durationError);
			}
		}
	}

	console.log("shadowdark-extras | Damage card injected successfully");
}

/**
 * Build roll breakdown information from message
 * Returns an object with formula, total, diceHtml, and bonusHtml
 */
async function buildRollBreakdown(message, weaponBonusDamage = null, isCritical = false) {
	// Try to get the damage roll from Shadowdark's rolls
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const damageRollData = shadowdarkRolls?.damage?.roll;

	// Also check standard message rolls
	const messageRoll = message.rolls?.[0];

	// Also check for stored spell roll
	const spellRoll = window._lastSpellRoll;

	// Use whichever roll we can find (prioritize message rolls, then spell roll)
	const roll = damageRollData || messageRoll || spellRoll;

	if (!roll) {
		// Check for spell roll breakdown stored in window (fallback for per-target)
		if (window._lastSpellRollBreakdown && !window._perTargetDamage) {
			return {
				formula: window._lastSpellRollBreakdown.split(' = ')[0] || '',
				total: window._lastSpellRollBreakdown.split(' = ')[1] || '',
				breakdownHtml: ''
			};
		}
		return null;
	}

	// Clear the stored spell roll after using it
	if (spellRoll && roll === spellRoll) {
		window._lastSpellRoll = null;
	}

	// Extract dice information
	let diceResults = []; // Array of individual dice results
	let totalDiceSum = 0;

	// Handle Foundry Roll object
	// Check roll.dice first (if it has items), otherwise check roll.terms for Die objects
	let dice = [];
	if (roll.dice && roll.dice.length > 0) {
		dice = roll.dice;
	} else if (roll.terms) {
		// Filter terms to find dice (objects with faces property)
		dice = roll.terms.filter(t => t.faces !== undefined);
	}

	if (dice.length > 0) {
		for (const die of dice) {
			const faces = die.faces;
			const results = die.results || [];

			for (const r of results) {
				const val = r.result;
				const isCrit = val === faces;
				const isFumble = val === 1;
				const cssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');
				diceResults.push({
					value: val,
					cssClass: cssClass,
					faces: faces
				});
				totalDiceSum += val;
			}
		}
	}

	// Extract numeric modifiers/bonuses
	const bonuses = [];

	// Check for numeric terms in the roll
	const terms = roll.terms || [];
	let operator = '+';

	for (let i = 0; i < terms.length; i++) {
		const term = terms[i];

		// Track operators
		if (term.operator) {
			operator = term.operator;
			continue;
		}

		// Get numeric values that aren't dice
		if (term.number !== undefined && !term.faces) {
			const value = term.number;
			if (value !== 0) {
				bonuses.push({
					label: 'Modifier',
					value: operator === '-' ? -value : value
				});
			}
		}
	}

	// Add weapon bonus if applicable - use stored roll results instead of re-rolling
	const weaponBonusDiceResults = [];
	if (weaponBonusDamage && weaponBonusDamage.requirementsMet) {
		console.log("shadowdark-extras | Processing weapon bonus for breakdown:", {
			bonusFormula: weaponBonusDamage.bonusFormula,
			criticalFormula: weaponBonusDamage.criticalFormula,
			isCritical: isCritical,
			totalBonus: weaponBonusDamage.totalBonus,
			bonusRollResults: weaponBonusDamage.bonusRollResults
		});

		// Use the stored roll results from calculateWeaponBonusDamage
		if (weaponBonusDamage.bonusRollResults && weaponBonusDamage.bonusRollResults.length > 0) {
			for (const result of weaponBonusDamage.bonusRollResults) {
				if (result.faces > 0) {
					// This is a die result
					const cssClass = result.isMax ? 'sdx-die-max' : (result.isMin ? 'sdx-die-min' : '');
					weaponBonusDiceResults.push({
						value: result.value,
						cssClass,
						faces: result.faces,
						isBonus: true,
						label: result.label
					});
				} else {
					// This is a static bonus
					bonuses.push({
						label: result.label || 'Bonus',
						value: result.value
					});
				}
			}
		} else if (weaponBonusDamage.totalBonus !== 0 && !weaponBonusDamage.bonusFormula.includes('d')) {
			// Fallback for static bonuses without roll results
			bonuses.push({
				label: 'Weapon Bonus',
				value: weaponBonusDamage.totalBonus
			});
		}

		// Handle critical roll results
		if (weaponBonusDamage.criticalRollResults && weaponBonusDamage.criticalRollResults.length > 0) {
			for (const result of weaponBonusDamage.criticalRollResults) {
				if (result.faces > 0) {
					const cssClass = result.isMax ? 'sdx-die-max' : (result.isMin ? 'sdx-die-min' : '');
					weaponBonusDiceResults.push({
						value: result.value,
						cssClass,
						faces: result.faces,
						isCritBonus: true,
						label: result.label
					});
				} else {
					bonuses.push({
						label: result.label || 'Critical Bonus',
						value: result.value
					});
				}
			}
		} else if (weaponBonusDamage.criticalBonus !== 0) {
			// Fallback for critical bonus without roll results
			bonuses.push({
				label: `Crit (${weaponBonusDamage.criticalFormula})`,
				value: weaponBonusDamage.criticalBonus
			});
		}
	}

	// Build the breakdown string: "Total = d1 + d2 + ... + bonus"
	let breakdownParts = [];

	// Add dice results with data attributes for individual rerolling
	let dieIndex = 0;
	for (const die of diceResults) {
		breakdownParts.push({
			html: `<span class="sdx-die sdx-die-clickable ${die.cssClass}" data-die-index="${dieIndex}" data-faces="${die.faces}" title="Click to reroll this d${die.faces}">${die.value}</span>`,
			value: die.value,
			faces: die.faces
		});
		dieIndex++;
	}

	// Add weapon bonus dice (styled differently, also clickable)
	for (const die of weaponBonusDiceResults) {
		const extraClass = die.isCritBonus ? 'sdx-crit-bonus' : 'sdx-weapon-bonus';
		const labelTitle = die.label ? `${die.label} - ` : '';
		breakdownParts.push({
			html: `<span class="sdx-die sdx-die-clickable ${die.cssClass} ${extraClass}" data-die-index="${dieIndex}" data-faces="${die.faces}" title="${labelTitle}Click to reroll this d${die.faces}">${die.value}</span>`,
			value: die.value,
			faces: die.faces
		});
		dieIndex++;
	}

	// Add static bonuses (just the number, sign handled by join logic)
	for (const bonus of bonuses) {
		const absValue = Math.abs(bonus.value);
		breakdownParts.push({
			html: `<span class="sdx-bonus-val" title="${bonus.label}">${absValue}</span>`,
			value: bonus.value
		});
	}

	// Calculate actual total from parts (sum all dice and bonuses)
	let actualTotal = 0;
	for (const part of breakdownParts) {
		actualTotal += part.value;
	}

	// Build the breakdown HTML: "Total = d1 + d2 + bonus"
	let breakdownHtml = '';
	if (breakdownParts.length > 0) {
		const partsHtml = breakdownParts.map((part, index) => {
			if (index === 0) return part.html;
			// For subsequent parts, show + or - based on the value
			if (part.value < 0) return `<span class="sdx-plus"> - </span>${part.html}`;
			return `<span class="sdx-plus"> + </span>${part.html}`;
		}).join('');

		breakdownHtml = `
			<div class="sdx-roll-breakdown-line">
				<span class="sdx-roll-total">${actualTotal}</span>
				<span class="sdx-equals"> = </span>
				${partsHtml}
			</div>
		`;
	}

	return {
		formula: roll.formula || '',
		total: roll.total || 0,
		breakdownHtml
	};
}

/**
 * Build the damage card HTML
 */
async function buildDamageCardHtml(actor, targets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage = null, isCritical = false, spellItem = null, casterTokenId = '') {
	console.log("shadowdark-extras | buildDamageCardHtml started", { actor, targets, totalDamage, damageType, allEffects, settings, weaponBonusDamage, isCritical, casterTokenId });

	const cardSettings = settings.damageCard;
	const isHealing = damageType?.toLowerCase() === "healing";

	// Build roll breakdown HTML
	let rollBreakdownHtml = '';
	const rollBreakdown = await buildRollBreakdown(message, weaponBonusDamage, isCritical);
	if (rollBreakdown) {
		// Store formula for reroll - escape quotes for data attribute
		const rerollFormula = (rollBreakdown.formula || '').replace(/"/g, '&quot;');

		// Store weapon bonus info for reroll
		let weaponBonusData = '';
		if (weaponBonusDamage && weaponBonusDamage.requirementsMet) {
			const bonusInfo = {
				bonusFormula: weaponBonusDamage.bonusFormula || '',
				totalBonus: weaponBonusDamage.totalBonus || 0,
				criticalFormula: weaponBonusDamage.criticalFormula || '',
				criticalBonus: weaponBonusDamage.criticalBonus || 0
			};
			weaponBonusData = JSON.stringify(bonusInfo).replace(/"/g, '&quot;');
		}

		rollBreakdownHtml = `
			<div class="sdx-roll-breakdown">
				<div class="sdx-roll-formula-row">
					<div class="sdx-roll-formula">${rollBreakdown.formula}</div>
					<button type="button" class="sdx-reroll-btn" data-formula="${rerollFormula}" data-weapon-bonus="${weaponBonusData}" title="Reroll damage (e.g., for Luck token)">
						<i class="fas fa-dice"></i>
					</button>
				</div>
				${rollBreakdown.breakdownHtml || ''}
			</div>
		`;
	}

	// Build targets HTML
	let targetsHtml = '';
	if (cardSettings.showTargets && targets.length > 0) {
		console.log("shadowdark-extras | Building targets HTML for", targets.length, "targets");
		targetsHtml = '<div class="sdx-damage-targets">';

		for (const target of targets) {
			try {
				console.log("shadowdark-extras | Processing target:", target);
				const targetActor = target.actor;
				if (!targetActor) {
					console.warn("shadowdark-extras | Target has no actor:", target);
					continue;
				}

				console.log("shadowdark-extras | Target actor:", targetActor);

				const hp = targetActor.system?.attributes?.hp;
				const currentHp = hp?.value ?? 0;
				const maxHp = hp?.max ?? 0;

				console.log("shadowdark-extras | Target HP:", { currentHp, maxHp });

				const damageSign = isHealing ? "+" : "-";

				// Check if this target has per-target damage
				const perTargetDamage = window._perTargetDamage?.[target.id];
				const targetSpecificDamage = perTargetDamage ? perTargetDamage.damage : totalDamage;

				// Get roll breakdown for tooltip
				let rollBreakdown = window._lastSpellRollBreakdown || '';
				if (perTargetDamage && perTargetDamage.roll) {
					// Build breakdown for this specific target
					const diceBreakdown = perTargetDamage.roll.dice.map(d => {
						const results = d.results.map(r => r.result).join(', ');
						return `${d.number}${d.faces === 'f' ? 'dF' : 'd' + d.faces}: [${results}]`;
					}).join(' + ');
					rollBreakdown = perTargetDamage.formula + ' = ' + (diceBreakdown || targetSpecificDamage);
				}
				const tooltipAttr = rollBreakdown ? `data-tooltip="${rollBreakdown}" title="${rollBreakdown}"` : '';

				// Only show damage preview if there's actual damage/healing
				let damagePreviewHtml = '';
				if (targetSpecificDamage > 0) {
					damagePreviewHtml = `<div class="sdx-damage-preview">${damageSign}<span class="sdx-damage-value" data-base-damage="${targetSpecificDamage}" ${tooltipAttr}>${targetSpecificDamage}</span></div>`;
				}

				targetsHtml += `
					<div class="sdx-target-item" data-token-id="${target.id}" data-actor-id="${targetActor.id}">
						<div class="sdx-target-header">
							<img src="${targetActor.img}" alt="${targetActor.name}" class="sdx-target-img"/>
							<div class="sdx-target-name">${targetActor.name}</div>
							${damagePreviewHtml}
						</div>
						${cardSettings.showMultipliers && totalDamage > 0 ? buildMultipliersHtml(cardSettings.damageMultipliers, target.id) : ''}
					</div>
				`;
			} catch (error) {
				console.error("shadowdark-extras | Error processing target:", error, target);
			}
		}

		targetsHtml += '</div>';
	}

	console.log("shadowdark-extras | Targets HTML built");

	// Build apply buttons
	let applyButtonHtml = '';

	// Damage/healing button
	if (cardSettings.showApplyButton && targets.length > 0 && totalDamage > 0) {
		const buttonText = isHealing ? "APPLY HEALING" : "APPLY DAMAGE";
		const buttonIcon = isHealing ? "fa-heart-pulse" : "fa-hand-sparkles";

		applyButtonHtml = `
			<div class="sdx-damage-actions">
				<button type="button" class="sdx-apply-damage-btn" data-damage-type="${damageType}">
					<i class="fas ${buttonIcon}"></i> ${buttonText}
				</button>
		`;
	}

	// Condition button (separate from damage - can appear even for effect-only spells/weapons)
	if (allEffects && allEffects.length > 0 && targets.length > 0) {
		const effectsJson = JSON.stringify(allEffects);
		const effectsApplyToTarget = spellDamageConfig?.effectsApplyToTarget === true;
		const effectsRequirement = spellDamageConfig?.effectsRequirement || '';

		// Include spell info for focus spell tracking
		const spellInfo = spellItem && ["Spell", "Scroll", "Wand", "NPC Spell"].includes(spellItem.type) ? {
			spellId: spellItem.id,
			spellName: spellItem.name,
			casterActorId: actor?.id
		} : null;
		const spellInfoJson = spellInfo ? JSON.stringify(spellInfo).replace(/"/g, '&quot;') : '';

		// Start actions div if not already started
		if (!applyButtonHtml) {
			applyButtonHtml = '<div class="sdx-damage-actions">';
		}

		applyButtonHtml += `
			<button type="button" class="sdx-apply-condition-btn" 
			        data-effects='${effectsJson}' 
			        data-apply-to-target="${effectsApplyToTarget}"
			        data-effects-requirement="${effectsRequirement.replace(/"/g, '&quot;')}"
			        data-spell-info="${spellInfoJson}"
			        data-effect-selection-mode="${spellDamageConfig?.effectSelectionMode || 'all'}">
				<i class="fas fa-wand-sparkles"></i> APPLY CONDITION
			</button>
		`;
	}

	// Close actions div if any buttons were added
	if (applyButtonHtml) {
		applyButtonHtml += `</div>`;
	}

	console.log("shadowdark-extras | Building final card HTML");

	// Determine card header based on content
	let headerText, headerIcon;
	if (totalDamage > 0) {
		headerText = isHealing ? "APPLY HEALING" : "APPLY DAMAGE";
		headerIcon = isHealing ? "fa-heart-pulse" : "fa-heart";
	} else if (allEffects && allEffects.length > 0) {
		headerText = "APPLY EFFECTS";
		headerIcon = "fa-wand-sparkles";
	} else {
		headerText = "SPELL EFFECTS";
		headerIcon = "fa-magic";
	}

	const finalHtml = `
		<div class="sdx-damage-card" data-message-id="${message.id}" data-caster-actor-id="${actor?.id || ''}" data-caster-token-id="${casterTokenId}" data-base-damage="${totalDamage}" data-damage-type="${damageType}">
			<div class="sdx-damage-card-header">
				<i class="fas ${headerIcon}"></i> ${headerText} <i class="fas fa-chevron-down"></i>
			</div>
			${rollBreakdownHtml}
			<div class="sdx-damage-card-tabs">
				<div class="sdx-tab active">
					<i class="fas fa-bullseye"></i> TARGETED
				</div>
				<div class="sdx-tab">
					<i class="fas fa-mouse-pointer"></i> SELECTED
				</div>
			</div>
			<div class="sdx-damage-card-content">
				${targetsHtml}
				${applyButtonHtml}
			</div>
		</div>
	`;

	console.log("shadowdark-extras | Final HTML built, length:", finalHtml.length);

	return finalHtml;
}

/**
 * Build multipliers HTML for a target
 */
function buildMultipliersHtml(multipliers, tokenId) {
	console.log("shadowdark-extras | buildMultipliersHtml called", { multipliers, tokenId });

	let html = '<div class="sdx-multipliers" data-token-id="' + tokenId + '">';

	// Convert multipliers to array if it's an object
	const multipliersArray = Array.isArray(multipliers) ? multipliers : Object.values(multipliers);

	console.log("shadowdark-extras | Multipliers array:", multipliersArray);

	for (const mult of multipliersArray) {
		if (!mult.enabled) continue;

		// Parse the value to handle both string and number
		const multValue = typeof mult.value === 'string' ? parseFloat(mult.value) : mult.value;
		const isDefault = multValue === 1;
		const activeClass = isDefault ? 'active' : '';

		html += `
			<button type="button" 
			        class="sdx-multiplier-btn ${activeClass}" 
			        data-multiplier="${multValue}"
			        data-token-id="${tokenId}">
				${mult.label}
			</button>
		`;
	}

	html += '</div>';

	console.log("shadowdark-extras | Multipliers HTML:", html);

	return html;
}

/**
 * Helper function to rebuild targets list based on active tab
 */
function rebuildTargetsList($card, messageId, baseDamage) {
	const $activeTab = $card.find('.sdx-tab.active');
	const activeTabIndex = $card.find('.sdx-tab').index($activeTab);
	const settings = game.settings.get("shadowdark-extras", "combatSettings");
	const cardSettings = settings.damageCard;

	let targets = [];
	let tabName = '';

	// Get the message to access stored targets
	const message = game.messages.get(messageId);
	const storedTargetIds = message?.flags?.["shadowdark-extras"]?.targetIds;

	// First tab (index 0) is TARGETED, second tab (index 1) is SELECTED
	if (activeTabIndex === 0) {
		// Use stored targets from message if available
		if (storedTargetIds && storedTargetIds.length > 0) {
			targets = storedTargetIds
				.map(id => canvas.tokens.get(id))
				.filter(t => t); // Filter out any tokens that no longer exist
			console.log("shadowdark-extras | Using stored targets for TARGETED tab:", targets.length);
		} else {
			// Fallback to current user's targets
			targets = Array.from(game.user.targets);
			console.log("shadowdark-extras | Using current user targets for TARGETED tab:", targets.length);
		}
		tabName = 'TARGETED';
	} else if (activeTabIndex === 1) {
		targets = canvas.tokens.controlled.filter(t => t.actor);
		tabName = 'SELECTED';
	}

	console.log("shadowdark-extras | Rebuilding targets list for:", tabName, "Index:", activeTabIndex, "Count:", targets.length);

	// Get damage type from card
	const damageType = $card.data('damage-type') || 'damage';
	const isHealing = damageType === 'healing';
	const damageSign = isHealing ? '+' : '-';

	// Build new targets HTML
	let targetsHtml = '';
	for (const target of targets) {
		const actor = target.actor;
		if (!actor) continue;

		const tokenId = target.id;
		const actorId = actor.id;
		const name = actor.name;
		const img = actor.img || "icons/svg/mystery-man.svg";

		targetsHtml += `
			<div class="sdx-target-item" data-token-id="${tokenId}" data-actor-id="${actorId}">
				<div class="sdx-target-header">
					<img src="${img}" alt="${name}" class="sdx-target-img"/>
					<div class="sdx-target-name">${name}</div>
					<div class="sdx-damage-preview">${damageSign}<span class="sdx-damage-value" data-base-damage="${baseDamage}">${baseDamage}</span></div>
				</div>
				${buildMultipliersHtml(cardSettings.damageMultipliers, tokenId)}
			</div>
		`;
	}

	if (targetsHtml === '') {
		targetsHtml = '<div class="sdx-no-targets">No ' + tabName.toLowerCase() + ' tokens</div>';
	}

	// Build apply button with appropriate text for damage type
	const buttonText = isHealing ? 'APPLY HEALING' : 'APPLY DAMAGE';
	const buttonIcon = isHealing ? 'fa-heart-pulse' : 'fa-hand-sparkles';
	const applyButtonHtml = cardSettings.showApplyButton ?
		`<button type="button" class="sdx-apply-damage-btn" data-damage-type="${damageType}"><i class="fas ${buttonIcon}"></i> ${buttonText}</button>` : '';

	// Replace the content
	$card.find('.sdx-damage-card-content').html(targetsHtml + applyButtonHtml);

	// Re-attach listeners for new elements
	attachMultiplierListeners($card);
}

/**
 * Attach multiplier button listeners
 */
function attachMultiplierListeners($card) {
	$card.find('.sdx-multiplier-btn').off('click').on('click', function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $btn = $(this);
		const tokenId = $btn.data('token-id');
		const multiplier = parseFloat($btn.data('multiplier'));

		// Update active state
		$btn.siblings().removeClass('active');
		$btn.addClass('active');

		// Update damage preview
		const $targetItem = $card.find(`.sdx-target-item[data-token-id="${tokenId}"]`);
		const $damageValue = $targetItem.find('.sdx-damage-value');
		const baseDamage = parseInt($damageValue.data('base-damage'));

		let newDamage;
		if (multiplier === 0 && $btn.text().trim() === '×') {
			newDamage = 0;
		} else if (multiplier === -1) {
			newDamage = -baseDamage;
		} else {
			newDamage = Math.floor(baseDamage * multiplier);
		}

		$damageValue.text(Math.abs(newDamage));

		const $preview = $targetItem.find('.sdx-damage-preview');
		if (newDamage < 0) {
			$preview.html('+<span class="sdx-damage-value" data-base-damage="' + baseDamage + '">' + Math.abs(newDamage) + '</span>');
		} else if (newDamage === 0) {
			$preview.html('<span class="sdx-damage-value" data-base-damage="' + baseDamage + '">0</span>');
		} else {
			$preview.html('-<span class="sdx-damage-value" data-base-damage="' + baseDamage + '">' + newDamage + '</span>');
		}

		$targetItem.data('calculated-damage', newDamage);
	});
}

/**
 * Spawn summoned creatures automatically when a spell is cast
 * @param {boolean} isCriticalSuccess - If true, duration will be doubled
 */
async function spawnSummonedCreatures(casterActor, item, profiles, summoningConfig = {}, isCriticalSuccess = false) {
	console.log("shadowdark-extras | Spawning summoned creatures", { isCriticalSuccess });

	try {
		// Check if Portal library is available
		if (typeof Portal === 'undefined') {
			ui.notifications.error("Portal library not found. Please install the 'portal-lib' module.");
			return;
		}

		// Get the caster's token as the origin point
		const casterToken = casterActor?.getActiveTokens()?.[0];

		if (!casterToken) {
			ui.notifications.warn("Could not find caster token on the scene");
			return;
		}

		console.log("shadowdark-extras | Caster token:", casterToken.name);

		// Create Portal instance and set origin
		const portal = new Portal();
		portal.origin(casterToken);

		// Add each creature profile
		for (const profile of profiles) {
			console.log("shadowdark-extras | Processing profile:", profile);

			if (!profile.creatureUuid) {
				console.warn("shadowdark-extras | Skipping profile with no UUID");
				continue;
			}

			// Parse count formula if it's a dice formula
			let countFormula = profile.count || "1";
			let count = 1;

			if (typeof countFormula === 'string' && countFormula.includes('d')) {
				try {
					const roll = new Roll(countFormula);
					await roll.evaluate();
					count = roll.total;

					// Post roll result to chat
					await roll.toMessage({
						flavor: `Summoning ${profile.displayName || profile.creatureName || 'creatures'}`,
						speaker: ChatMessage.getSpeaker({ actor: casterActor })
					});
				} catch (err) {
					console.warn("shadowdark-extras | Invalid count formula, using 1:", countFormula, err);
					count = 1;
				}
			} else {
				count = parseInt(countFormula) || 1;
			}

			console.log("shadowdark-extras | Adding creature to portal - UUID:", profile.creatureUuid, "Count:", count);

			// Add the creature to the portal (Portal expects just the UUID/name and count)
			portal.addCreature(profile.creatureUuid, { count });
		}

		// Spawn directly - this will show placement UI and spawn the creatures
		console.log("shadowdark-extras | Calling portal.spawn()...");
		console.log("shadowdark-extras | Portal tokens before spawn:", portal.tokens);
		const creatures = await portal.spawn();
		console.log("shadowdark-extras | Portal.spawn() returned:", creatures);

		// Check if creatures were spawned
		if (creatures && creatures.length > 0) {
			// Grant ownership to the caster
			const tokenUpdates = creatures.map(token => {
				const update = {
					_id: token.id,
					[`ownership.${game.user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
				};

				// For unlinked tokens, also update the actor ownership in actorData
				if (!token.actorLink) {
					update[`actorData.ownership.${game.user.id}`] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
				}

				return update;
			});

			await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates);
			console.log("shadowdark-extras | Granted ownership to caster for", tokenUpdates.length, "tokens");

			// Track tokens for expiry if deleteAtExpiry is enabled
			if (summoningConfig.deleteAtExpiry && game.combat) {
				const duration = item?.system?.duration;
				const durationType = duration?.type; // e.g., "rounds", "turns", "minutes", etc.
				let durationValue = parseInt(duration?.value) || 0;

				// Double duration on critical success
				if (isCriticalSuccess && durationValue > 0) {
					durationValue = durationValue * 2;
					console.log("shadowdark-extras | Critical success! Doubled duration from", duration?.value, "to", durationValue);
				}

				if ((durationType === 'rounds' || durationType === 'turns') && durationValue > 0) {
					const currentRound = game.combat.round || 1;
					const expiryRound = currentRound + durationValue;

					const sceneId = canvas.scene.id;
					const tokenIds = creatures.map(t => t.id);

					// Use the helper function for persistent storage
					await trackSummonedTokensForExpiry(sceneId, tokenIds, expiryRound, item?.name || 'Unknown Spell');

					console.log(`shadowdark-extras | Tracking ${tokenIds.length} summoned tokens for expiry at round ${expiryRound} (current: ${currentRound}, duration: ${durationValue} ${durationType})`);
				}
			}

			ui.notifications.info(`Summoned ${creatures.length} creature(s)`);
		} else {
			ui.notifications.warn("No creatures were spawned - check that creature UUIDs are valid");
		}
	} catch (err) {
		console.error("shadowdark-extras | Error summoning creatures:", err);
		ui.notifications.error("Failed to summon creatures: " + err.message);
	}
}

async function giveItemsToCaster(casterActor, item, profiles) {
	console.log("shadowdark-extras | Giving configured items to caster");
	if (!casterActor) {
		console.warn("shadowdark-extras | No caster actor available to receive items");
		return;
	}
	if (!profiles || profiles.length === 0) {
		console.warn("shadowdark-extras | No item profiles provided");
		return;
	}
	const itemsToCreate = [];
	for (const profile of profiles) {
		if (!profile || !profile.itemUuid) continue;
		let quantity = 1;
		const qtyValue = (profile.quantity || '1').toString().trim();
		if (qtyValue.includes('d')) {
			try {
				const roll = new Roll(qtyValue);
				await roll.evaluate();
				quantity = Math.max(1, roll.total || 1);
				await roll.toMessage({
					flavor: `Item giver: ${profile.itemName || item.name || 'Item'}`,
					speaker: ChatMessage.getSpeaker({ actor: casterActor })
				});
			} catch (err) {
				console.warn("shadowdark-extras | Invalid item quantity formula, defaulting to 1:", qtyValue, err);
				quantity = 1;
			}
		} else if (qtyValue !== '') {
			const parsed = parseInt(qtyValue);
			if (!Number.isNaN(parsed)) {
				quantity = Math.max(1, parsed);
			}
		}
		try {
			const sourceItem = await fromUuid(profile.itemUuid);
			if (!sourceItem || !(sourceItem instanceof Item)) {
				console.warn(`shadowdark-extras | Skipping item give for invalid source: ${profile.itemName}`);
				continue;
			}
			const itemData = duplicate(sourceItem.toObject());
			delete itemData._id;
			if (!itemData.system) itemData.system = {};
			itemData.system.quantity = quantity;
			itemsToCreate.push(itemData);
		} catch (err) {
			console.error("shadowdark-extras | Failed to load item for item giver:", err);
		}
	}
	if (itemsToCreate.length === 0) {
		console.warn("shadowdark-extras | No valid items were available to create");
		return;
	}
	try {
		const createdItems = await casterActor.createEmbeddedDocuments("Item", itemsToCreate);
		const itemSummaries = createdItems.map(createdItem => `${createdItem.name} x${createdItem.system?.quantity || 1}`);
		ui.notifications.info(`Granted ${itemSummaries.join(', ')} to ${casterActor.name}`);
	} catch (err) {
		console.error("shadowdark-extras | Failed to add items to caster:", err);
		ui.notifications.error("Failed to grant items to caster: " + err.message);
	}
}

/**
 * Attach event listeners to damage card elements
 */
function attachDamageCardListeners(html, messageId) {
	const $card = html.find('.sdx-damage-card');

	// Header collapse/expand
	$card.find('.sdx-damage-card-header').on('click', function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $header = $(this);
		const $chevron = $header.find('.fa-chevron-down, .fa-chevron-up');
		const $content = $card.find('.sdx-damage-card-content');
		const $tabs = $card.find('.sdx-damage-card-tabs');

		// Toggle content visibility
		$content.slideToggle(200);
		$tabs.slideToggle(200);

		// Toggle chevron direction
		if ($chevron.hasClass('fa-chevron-down')) {
			$chevron.removeClass('fa-chevron-down').addClass('fa-chevron-up');
		} else {
			$chevron.removeClass('fa-chevron-up').addClass('fa-chevron-down');
		}
	});

	// Tab switching
	$card.find('.sdx-tab').on('click', function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $tab = $(this);
		if ($tab.hasClass('active')) return;

		// Update active tab
		$tab.siblings().removeClass('active');
		$tab.addClass('active');

		// Get base damage from card's data attribute
		const baseDamage = parseInt($card.data('base-damage')) || 0;

		// Rebuild targets list
		rebuildTargetsList($card, messageId, baseDamage);
	});

	// Initial multiplier listeners
	attachMultiplierListeners($card);

	// Individual die click to reroll single die
	$card.on('click', '.sdx-die-clickable', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $die = $(this);
		const dieIndex = parseInt($die.data('die-index'));
		const faces = parseInt($die.data('faces'));

		if (isNaN(dieIndex) || isNaN(faces)) {
			console.warn("shadowdark-extras | Invalid die data for reroll");
			return;
		}

		console.log("shadowdark-extras | Rerolling single die:", { dieIndex, faces });

		// Roll a single die
		const roll = new Roll(`1d${faces}`);
		await roll.evaluate();
		const newValue = roll.total;

		// Determine CSS class for the new value
		const isCrit = newValue === faces;
		const isFumble = newValue === 1;
		const newCssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');

		// Update the die's display
		$die.text(newValue);
		$die.removeClass('sdx-die-max sdx-die-min').addClass(newCssClass);

		// Recalculate total by summing all dice and bonuses in the breakdown
		let newTotal = 0;
		const $breakdownLine = $card.find('.sdx-roll-breakdown-line');

		// Sum all dice values
		$breakdownLine.find('.sdx-die').each(function () {
			newTotal += parseInt($(this).text()) || 0;
		});

		// Sum all bonus values (considering the sign from adjacent plus/minus)
		$breakdownLine.find('.sdx-bonus-val').each(function () {
			const $bonus = $(this);
			const bonusValue = parseInt($bonus.text()) || 0;
			// Check if the previous sibling is a minus sign
			const $prev = $bonus.prev('.sdx-plus');
			if ($prev.length && $prev.text().includes('-')) {
				newTotal -= bonusValue;
			} else {
				newTotal += bonusValue;
			}
		});

		// Update the total display
		$breakdownLine.find('.sdx-roll-total').text(newTotal);

		// Update card data
		$card.attr('data-base-damage', newTotal);
		$card.data('base-damage', newTotal);

		// Update all target damage displays
		const damageType = $card.data('damage-type');
		const isHealing = damageType?.toLowerCase() === 'healing';

		$card.find('.sdx-target-item').each(function () {
			const $targetItem = $(this);
			const $targetDamage = $targetItem.find('.sdx-damage-value');
			const $activeMultiplier = $targetItem.find('.sdx-multiplier-btn.active');
			const multiplier = parseFloat($activeMultiplier.data('multiplier')) || 1;
			const newDamage = Math.floor(newTotal * multiplier);

			$targetDamage.text(newDamage);
			$targetDamage.attr('data-base-damage', newDamage);
		});

		// Show notification
		ui.notifications.info(`Rerolled d${faces}: ${newValue} (new total: ${newTotal})`);
	});

	// Reroll damage button click
	$card.on('click', '.sdx-reroll-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $btn = $(this);
		const formula = $btn.data('formula');
		const weaponBonusDataStr = $btn.attr('data-weapon-bonus');

		if (!formula) {
			ui.notifications.warn("No damage formula to reroll");
			return;
		}

		// Disable button temporarily
		$btn.prop('disabled', true);
		$btn.find('i').removeClass('fa-dice').addClass('fa-spinner fa-spin');

		try {
			// Roll the base formula
			const roll = new Roll(formula);
			await roll.evaluate();

			// Parse weapon bonus data if present
			let weaponBonus = null;
			if (weaponBonusDataStr) {
				try {
					weaponBonus = JSON.parse(weaponBonusDataStr);
					console.log("shadowdark-extras | Parsed weapon bonus:", weaponBonus);
				} catch (e) {
					console.warn("shadowdark-extras | Could not parse weapon bonus data:", e);
				}
			}

			// Roll weapon bonus formulas if they exist
			let newBonusTotal = 0;
			let newCriticalTotal = 0;
			const bonusDiceResults = [];

			if (weaponBonus?.bonusFormula) {
				const bonusRoll = new Roll(weaponBonus.bonusFormula);
				await bonusRoll.evaluate();
				newBonusTotal = bonusRoll.total;
				console.log("shadowdark-extras | Rolled bonus formula:", weaponBonus.bonusFormula, "=", newBonusTotal);

				// Extract dice results from bonus roll
				for (const term of bonusRoll.terms) {
					if (term.faces !== undefined && term.results) {
						for (const r of term.results) {
							const val = r.result;
							const isCrit = val === term.faces;
							const isFumble = val === 1;
							const cssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');
							bonusDiceResults.push({ value: val, cssClass, faces: term.faces, isBonus: true });
						}
					}
				}
			}

			if (weaponBonus?.criticalFormula) {
				const critRoll = new Roll(weaponBonus.criticalFormula);
				await critRoll.evaluate();
				newCriticalTotal = critRoll.total;
				console.log("shadowdark-extras | Rolled critical formula:", weaponBonus.criticalFormula, "=", newCriticalTotal);

				// Extract dice results from critical roll
				for (const term of critRoll.terms) {
					if (term.faces !== undefined && term.results) {
						for (const r of term.results) {
							const val = r.result;
							const isCrit = val === term.faces;
							const isFumble = val === 1;
							const cssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');
							bonusDiceResults.push({ value: val, cssClass, faces: term.faces, isCritBonus: true });
						}
					}
				}
			}

			// Build new breakdown HTML
			const dice = roll.terms.filter(t => t.faces !== undefined);
			const diceResults = [];

			for (const die of dice) {
				const faces = die.faces;
				const results = die.results || [];
				for (const r of results) {
					const val = r.result;
					const isCrit = val === faces;
					const isFumble = val === 1;
					const cssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');
					diceResults.push({ value: val, cssClass, faces });
				}
			}

			// Get static bonuses from roll terms (like STR modifier)
			const bonuses = [];
			let operator = '+';
			for (const term of roll.terms) {
				if (term.operator) {
					operator = term.operator;
					continue;
				}
				if (term.number !== undefined && !term.faces) {
					const value = term.number;
					if (value !== 0) {
						bonuses.push({
							label: 'Modifier',
							value: operator === '-' ? -value : value
						});
					}
				}
			}

			// Calculate total including weapon bonuses
			let totalDamage = roll.total + newBonusTotal + newCriticalTotal;

			console.log("shadowdark-extras | Reroll totals:", {
				rollTotal: roll.total,
				newBonusTotal,
				newCriticalTotal,
				totalDamage
			});

			// Build breakdown parts
			const breakdownParts = [];

			// Add base dice results with data attributes for individual rerolling
			let dieIndex = 0;
			for (const die of diceResults) {
				breakdownParts.push({
					html: `<span class="sdx-die sdx-die-clickable ${die.cssClass}" data-die-index="${dieIndex}" data-faces="${die.faces}" title="Click to reroll this d${die.faces}">${die.value}</span>`,
					value: die.value,
					faces: die.faces
				});
				dieIndex++;
			}

			// Add static bonuses (like STR modifier)
			for (const bonus of bonuses) {
				const absValue = Math.abs(bonus.value);
				breakdownParts.push({
					html: `<span class="sdx-bonus-val" title="${bonus.label || ''}">${absValue}</span>`,
					value: bonus.value
				});
			}

			// Add weapon bonus dice results (styled differently, also clickable)
			for (const die of bonusDiceResults) {
				const extraClass = die.isCritBonus ? 'sdx-crit-bonus' : 'sdx-weapon-bonus';
				breakdownParts.push({
					html: `<span class="sdx-die sdx-die-clickable ${die.cssClass} ${extraClass}" data-die-index="${dieIndex}" data-faces="${die.faces}" title="Click to reroll this d${die.faces}">${die.value}</span>`,
					value: die.value,
					faces: die.faces
				});
				dieIndex++;
			}

			// Build HTML string
			const partsHtml = breakdownParts.map((part, index) => {
				if (index === 0) return part.html;
				if (part.value < 0) return `<span class="sdx-plus"> - </span>${part.html}`;
				return `<span class="sdx-plus"> + </span>${part.html}`;
			}).join('');

			const newBreakdownHtml = `
				<div class="sdx-roll-breakdown-line">
					<span class="sdx-roll-total">${totalDamage}</span>
					<span class="sdx-equals"> = </span>
					${partsHtml}
				</div>
			`;

			// Update the card
			$card.find('.sdx-roll-breakdown-line').replaceWith(newBreakdownHtml);
			$card.attr('data-base-damage', totalDamage);
			$card.data('base-damage', totalDamage);

			// Update all target damage displays
			const damageType = $card.data('damage-type');
			const isHealing = damageType?.toLowerCase() === 'healing';
			const sign = isHealing ? '+' : '-';

			console.log("shadowdark-extras | About to update targets, finding .sdx-target-item...");
			const $targetItems = $card.find('.sdx-target-item');
			console.log("shadowdark-extras | Found target items:", $targetItems.length);

			$targetItems.each(function () {
				const $targetItem = $(this);
				const $targetDamage = $targetItem.find('.sdx-damage-value');
				const $activeMultiplier = $targetItem.find('.sdx-multiplier-btn.active');
				const multiplier = parseFloat($activeMultiplier.data('multiplier')) || 1;
				const newDamage = Math.floor(totalDamage * multiplier);

				console.log("shadowdark-extras | Updating target damage:", {
					found: $targetDamage.length,
					multiplier,
					newDamage,
					totalDamage,
					currentText: $targetDamage.text()
				});

				$targetDamage.text(newDamage);
				$targetDamage.attr('data-base-damage', newDamage);
			});

			// Show notification
			ui.notifications.info(`Rerolled damage: ${totalDamage}`);

		} catch (err) {
			console.error("shadowdark-extras | Error rerolling damage:", err);
			ui.notifications.error("Failed to reroll damage");
		} finally {
			// Re-enable button
			$btn.prop('disabled', false);
			$btn.find('i').removeClass('fa-spinner fa-spin').addClass('fa-dice');
		}
	});

	// Apply damage button click (use delegation since button may be rebuilt)
	// Apply damage button click (use delegation since button may be rebuilt)
	$card.on('click', '.sdx-apply-damage-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $btn = $(this);

		// Prevent duplicate applications
		if ($btn.data('applying')) {
			console.log("shadowdark-extras | Already applying damage, skipping");
			return;
		}

		$btn.data('applying', true);
		$btn.prop('disabled', true);

		console.log("shadowdark-extras | Apply damage clicked");

		try {
			const $targets = $card.find('.sdx-target-item');
			console.log("shadowdark-extras | Found targets:", $targets.length);

			const damageType = $card.data('damage-type') || 'damage';
			console.log("shadowdark-extras | Card damage type:", damageType);
			const isHealing = damageType?.toLowerCase() === 'healing';
			console.log("shadowdark-extras | Is healing?", isHealing);

			let appliedCount = 0;

			for (const targetEl of $targets) {
				const $target = $(targetEl);
				const tokenId = $target.data('token-id');
				const token = canvas.tokens.get(tokenId);

				let calculatedDamage = $target.data('calculated-damage');

				if (calculatedDamage === undefined || calculatedDamage === null) {
					const $damageValue = $target.find('.sdx-damage-value');
					calculatedDamage = parseInt($damageValue.text()) || 0;

					// If it's healing, make damage negative
					if (isHealing) {
						calculatedDamage = -calculatedDamage;
					}
				}

				// Check if we need to evaluate a per-target damage requirement
				if (window._damageRequirement && token && token.actor) {
					const reqInfo = window._damageRequirement;
					try {
						// Build roll data with target context
						const targetRollData = foundry.utils.duplicate(reqInfo.casterData);
						const targetActorData = token.actor.getRollData() || {};

						// Create target object in rollData
						targetRollData.target = buildTargetRollData(token.actor);

						// Evaluate the requirement
						const requirementMet = evaluateRequirement(reqInfo.formula, targetRollData);

						if (!requirementMet) {
							console.log(`shadowdark-extras | Requirement failed for ${token.name}: ${reqInfo.formula}`);
							if (reqInfo.failAction === 'half') {
								calculatedDamage = Math.floor(calculatedDamage / 2);
								console.log(`shadowdark-extras | Halving damage to: ${calculatedDamage}`);
							} else {
								calculatedDamage = 0;
								console.log(`shadowdark-extras | Zeroing damage`);
							}
						} else {
							console.log(`shadowdark-extras | Requirement met for ${token.name}: ${reqInfo.formula}`);
						}
					} catch (err) {
						console.warn(`shadowdark-extras | Failed to evaluate requirement for target ${tokenId}:`, err);
					}
				}

				console.log("shadowdark-extras | Applying damage to token:", tokenId, "Damage:", calculatedDamage, "Is Healing:", isHealing);

				if (calculatedDamage === 0) {
					console.log("shadowdark-extras | Skipping zero damage");
					continue;
				}

				// Use socketlib to apply damage via GM
				if (socketlibSocket) {
					try {
						const success = await socketlibSocket.executeAsGM("applyTokenDamage", {
							tokenId: tokenId,
							damage: calculatedDamage
						});

						if (success) {
							appliedCount++;
						} else {
							console.warn("shadowdark-extras | Failed to apply damage to token:", tokenId);
						}
					} catch (socketError) {
						console.error("shadowdark-extras | Socket error applying damage:", socketError);
					}
				} else {
					console.error("shadowdark-extras | socketlib not initialized");
					ui.notifications.error("Socket communication not available");
				}
			}

			if (appliedCount > 0) {
				const appliedText = isHealing ? 'Healing' : 'Damage';
				ui.notifications.info(`${appliedText} applied to ${appliedCount} target(s)`);
				$btn.html('<i class="fas fa-check"></i> APPLIED');
			} else {
				ui.notifications.warn("No damage to apply");
				$btn.html('<i class="fas fa-exclamation"></i> NO TARGETS');
			}

			setTimeout(() => {
				const damageType = $card.data('damage-type') || 'damage';
				const buttonText = damageType === 'healing' ? 'APPLY HEALING' : 'APPLY DAMAGE';
				const buttonIcon = damageType === 'healing' ? 'fa-heart-pulse' : 'fa-hand-sparkles';
				$btn.html(`<i class="fas ${buttonIcon}"></i> ${buttonText}`);
				$btn.prop('disabled', false);
				$btn.data('applying', false);
			}, 2000);

		} catch (error) {
			console.error("shadowdark-extras | Error applying damage:", error);
			ui.notifications.error("Failed to apply damage: " + error.message);
			$btn.prop('disabled', false);
			$btn.data('applying', false);
		}
	});

	// Apply condition button click
	$card.on('click', '.sdx-apply-condition-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $btn = $(this);

		// Prevent duplicate applications
		if ($btn.data('applying')) {
			console.log("shadowdark-extras | Already applying conditions, skipping");
			return;
		}

		$btn.data('applying', true);
		$btn.prop('disabled', true);

		console.log("shadowdark-extras | Apply condition clicked");

		try {
			const effectsJson = $btn.data('effects');
			const applyToTarget = $btn.data('apply-to-target');
			const effectsRequirement = $btn.data('effects-requirement') || '';

			// Get spell info for focus spell tracking
			const spellInfoAttr = $btn.attr('data-spell-info');
			let spellInfo = null;
			if (spellInfoAttr) {
				try {
					spellInfo = JSON.parse(spellInfoAttr);
				} catch (err) {
					console.warn("shadowdark-extras | Could not parse spell info:", err);
				}
			}

			let effects = [];
			if (typeof effectsJson === 'string') {
				effects = JSON.parse(effectsJson);
			} else if (Array.isArray(effectsJson)) {
				effects = effectsJson;
			}

			console.log("shadowdark-extras | Applying effects:", effects, "To target:", applyToTarget, "Requirement:", effectsRequirement);

			if (effects.length === 0) {
				ui.notifications.warn("No conditions to apply");
				$btn.prop('disabled', false);
				$btn.data('applying', false);
				return;
			}

			// Handle 'prompt' selection mode - show dialog to select effects
			const effectSelectionMode = $btn.data('effect-selection-mode') || 'all';
			if (effectSelectionMode === 'prompt' && effects.length > 1) {
				console.log("shadowdark-extras | Prompt mode: showing effect selection dialog");

				// Build effect names for the dialog by resolving UUIDs
				const effectOptions = [];
				for (const effectData of effects) {
					const effectUuid = typeof effectData === 'string' ? effectData : effectData.uuid;
					try {
						const effectDoc = await fromUuid(effectUuid);
						effectOptions.push({
							uuid: effectUuid,
							name: effectDoc?.name || 'Unknown Effect',
							img: effectDoc?.img || 'icons/svg/mystery-man.svg',
							data: effectData
						});
					} catch (err) {
						effectOptions.push({
							uuid: effectUuid,
							name: 'Unknown Effect',
							img: 'icons/svg/mystery-man.svg',
							data: effectData
						});
					}
				}

				// Show selection dialog
				const selectedEffects = await showEffectSelectionDialog(effectOptions);

				if (!selectedEffects || selectedEffects.length === 0) {
					console.log("shadowdark-extras | User cancelled or selected no effects");
					$btn.prop('disabled', false);
					$btn.data('applying', false);
					return;
				}

				// Replace effects with user selection
				effects = selectedEffects;
				console.log("shadowdark-extras | User selected effects:", effects);
			}

			// Get caster data for requirement evaluation
			const casterActorId = $card.data('caster-actor-id');
			const casterActor = casterActorId ? game.actors.get(casterActorId) : null;
			let casterRollData = {};
			if (casterActor) {
				casterRollData = casterActor.getRollData() || {};
				// Flatten level
				if (casterRollData.level && typeof casterRollData.level === 'object' && casterRollData.level.value !== undefined) {
					casterRollData.level = casterRollData.level.value;
				}
				// Add ability modifiers
				if (casterRollData.abilities) {
					['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
						if (casterRollData.abilities[ability]?.mod !== undefined) {
							casterRollData[ability] = casterRollData.abilities[ability].mod;
						}
						if (casterRollData.abilities[ability]?.base !== undefined) {
							casterRollData[ability + 'Base'] = casterRollData.abilities[ability].base;
						}
					});
				}
				// Add stats
				if (casterRollData.attributes?.ac?.value !== undefined) casterRollData.ac = casterRollData.attributes.ac.value;
				if (casterRollData.attributes?.hp?.value !== undefined) casterRollData.hp = casterRollData.attributes.hp.value;
			}

			// Get card targets (enemies shown in the card)
			const $cardTargets = $card.find('.sdx-target-item');
			const cardTargets = $cardTargets.map((i, el) => canvas.tokens.get($(el).data('token-id'))).get().filter(t => t);

			// Get caster token using the stored token ID (the actual token that attacked/cast)
			const casterTokenId = $card.data('caster-token-id');
			let casterToken = null;
			if (casterTokenId) {
				casterToken = canvas.tokens.get(casterTokenId);
				console.log("shadowdark-extras | Found caster token by ID:", casterToken?.name);
			}
			// Fallback to finding by actor ID if token ID not available
			if (!casterToken && casterActor) {
				casterToken = canvas.tokens.placeables.find(t => t.actor?.id === casterActorId);
				console.log("shadowdark-extras | Fallback: found caster token by actor ID:", casterToken?.name);
			}

			let appliedCount = 0;
			let skippedCount = 0;

			// Apply each effect to appropriate tokens based on individual effect settings
			for (const effectData of effects) {
				// Handle both old format (string UUID) and new format (object with uuid, duration, applyToTarget)
				const effectUuid = typeof effectData === 'string' ? effectData : effectData.uuid;
				const duration = typeof effectData === 'object' && effectData.duration ? effectData.duration : {};
				// Check individual effect's applyToTarget setting, fall back to global setting
				const effectApplyToTarget = typeof effectData === 'object' && effectData.applyToTarget !== undefined
					? effectData.applyToTarget
					: applyToTarget;
				// Check individual effect's cumulative setting (default true for backward compatibility)
				const effectCumulative = typeof effectData === 'object' && effectData.cumulative !== undefined
					? effectData.cumulative
					: true;

				// Determine which tokens to apply this effect to
				let effectTargets = [];
				if (effectApplyToTarget) {
					effectTargets = cardTargets;
				} else {
					if (casterToken) effectTargets = [casterToken];
				}

				if (effectTargets.length === 0) {
					console.log(`shadowdark-extras | No targets for effect ${effectUuid} (applyToTarget: ${effectApplyToTarget})`);
					continue;
				}

				// Apply to each target for this effect
				for (const target of effectTargets) {
					// Check effects requirement if it exists (only for target-directed effects)
					let requirementMet = true;
					if (effectApplyToTarget && effectsRequirement && effectsRequirement.trim() !== '') {
						try {
							const targetRollData = foundry.utils.duplicate(casterRollData);

							// Add target data if available
							if (target.actor) {
								targetRollData.target = buildTargetRollData(target.actor);
							}

							// Evaluate the requirement
							requirementMet = evaluateRequirement(effectsRequirement, targetRollData);
							if (!requirementMet) {
								console.log(`shadowdark-extras | Effects requirement failed for ${target.name}: ${effectsRequirement}`);
								skippedCount++;
								continue; // Skip this target
							} else {
								console.log(`shadowdark-extras | Effects requirement met for ${target.name}: ${effectsRequirement}`);
							}
						} catch (err) {
							console.warn(`shadowdark-extras | Failed to evaluate effects requirement for target ${target.id}:`, err);
							// On error, assume requirement is met (fail-open)
						}
					}

					console.log("shadowdark-extras | Applying effect to token:", target.id, "Effect:", effectUuid, "Duration override:", duration, "ApplyToTarget:", effectApplyToTarget, "Cumulative:", effectCumulative);

					// Use socketlib to apply condition via GM
					if (socketlibSocket) {
						try {
							const success = await socketlibSocket.executeAsGM("applyTokenCondition", {
								tokenId: target.id,
								effectUuid: effectUuid,
								duration: duration,
								spellInfo: spellInfo,  // Pass spell info for focus tracking
								cumulative: effectCumulative  // Pass cumulative flag
							});

							if (success === true) {
								appliedCount++;
							} else {
								console.warn("shadowdark-extras | Failed to apply condition to token:", target.id);
							}
						} catch (socketError) {
							console.error("shadowdark-extras | Socket error applying condition:", socketError);
						}
					} else {
						console.error("shadowdark-extras | socketlib not initialized");
						ui.notifications.error("Socket communication not available");
					}
				}
			}

			console.log("shadowdark-extras | Applied", appliedCount, "conditions, skipped", skippedCount);

			if (appliedCount > 0) {
				let message = `Applied ${appliedCount} condition(s)`;
				if (skippedCount > 0) {
					message += ` (${skippedCount} skipped - requirement not met)`;
				}
				ui.notifications.info(message);
				$btn.html('<i class="fas fa-check"></i> APPLIED');
			} else if (skippedCount > 0) {
				ui.notifications.warn(`No conditions applied - requirement not met for any target`);
				$btn.html('<i class="fas fa-exclamation"></i> REQ FAILED');
			} else {
				ui.notifications.warn("No conditions were applied - no valid targets");
			}
		} catch (err) {
			console.error("shadowdark-extras | Error applying conditions:", err);
			ui.notifications.error("Failed to apply conditions");
			$btn.prop('disabled', false);
			$btn.data('applying', false);
		}
	});

	// Summon creatures button click
	$card.on('click', '.sdx-summon-creatures-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		const $btn = $(this);

		// Prevent duplicate summonings
		if ($btn.data('summoning')) {
			console.log("shadowdark-extras | Already summoning creatures, skipping");
			return;
		}

		$btn.data('summoning', true);
		$btn.prop('disabled', true);

		console.log("shadowdark-extras | Summon creatures clicked");

		try {
			const profilesJson = $btn.data('profiles');
			let profiles = [];
			if (typeof profilesJson === 'string') {
				profiles = JSON.parse(profilesJson);
			} else if (Array.isArray(profilesJson)) {
				profiles = profilesJson;
			}

			console.log("shadowdark-extras | Summoning profiles:", profiles);

			if (profiles.length === 0) {
				ui.notifications.warn("No summon profiles configured");
				$btn.prop('disabled', false);
				$btn.data('summoning', false);
				return;
			}

			// Check if Portal library is available
			if (typeof Portal === 'undefined') {
				ui.notifications.error("Portal library is required for summoning but not found");
				$btn.prop('disabled', false);
				$btn.data('summoning', false);
				return;
			}

			// Get the caster token to use as origin
			const casterActorId = $card.data('caster-actor-id');
			const casterActor = casterActorId ? game.actors.get(casterActorId) : null;
			const casterToken = casterActor ? canvas.tokens.placeables.find(t => t.actor?.id === casterActorId) : null;

			if (!casterToken) {
				ui.notifications.warn("Could not find caster token for summoning");
				$btn.prop('disabled', false);
				$btn.data('summoning', false);
				return;
			}

			// Create Portal instance
			const portal = new Portal();
			portal.origin(casterToken);

			// Add all creature profiles
			for (const profile of profiles) {
				if (!profile.creatureUuid) {
					console.warn("shadowdark-extras | Skipping profile with no creature UUID:", profile);
					continue;
				}

				// Add creature with count and display name
				portal.addCreature({
					creature: profile.creatureUuid,
					count: profile.count || '1',
					displayName: profile.displayName || ''
				});
			}

			// Show dialog and spawn
			const spawnedTokens = await portal.dialog({
				spawn: true,
				multipleChoice: true, // Allow selecting which creatures to summon
				title: "Summon Creatures"
			});

			if (spawnedTokens && spawnedTokens.length > 0) {
				ui.notifications.info(`Summoned ${spawnedTokens.length} creature(s)`);
				$btn.html('<i class="fas fa-check"></i> SUMMONED');
			} else {
				ui.notifications.info("Summoning cancelled");
				$btn.prop('disabled', false);
				$btn.data('summoning', false);
			}
		} catch (err) {
			console.error("shadowdark-extras | Error summoning creatures:", err);
			ui.notifications.error("Failed to summon creatures");
			$btn.prop('disabled', false);
			$btn.data('summoning', false);
		}
	});
}