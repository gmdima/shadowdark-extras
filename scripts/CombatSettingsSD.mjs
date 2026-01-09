/**
 * Combat Settings for Shadowdark Extras
 * Adds enhanced damage card features similar to midi-qol
 */

import { getWeaponBonuses, getWeaponEffectsToApply, evaluateRequirements, calculateWeaponBonusDamage, decrementDamageBonusUsage } from "./WeaponBonusConfig.mjs";
import { startDurationSpell, linkEffectToDurationSpell, linkEffectToFocusSpell, linkTargetToFocusSpell, startFocusSpellIfNeeded, getActiveDurationSpells, endFocusSpell } from "./FocusSpellTrackerSD.mjs";
import { setupTemplateEffectFlags } from "./TemplateEffectsSD.mjs";
import { createAuraOnActor } from "./AuraEffectsSD.mjs";

const MODULE_ID = "shadowdark-extras";
let socketlibSocket = null;

// In-memory tracker for messages that have already started duration tracking
// Prevents duplicate calls on message re-render (e.g., critical success)
const _durationStartedMessages = new Set();

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

			// Check for Glassbones effect (double damage)
			const hasGlassbones = token.actor.getFlag("shadowdark-extras", "glassbones");

			let finalDamage = 0;
			const isDamage = data.damage > 0;

			// If damageComponents is provided, process each component separately
			if (data.damageComponents && data.damageComponents.length > 0 && isDamage) {

				for (const component of data.damageComponents) {
					let componentDamage = component.amount || 0;
					const componentType = (component.type || "standard").toLowerCase();

					// Skip standard damage type (no resistance/immunity/vulnerability applies)
					if (componentType !== "standard" && componentType !== "damage") {
						// Check for immunity (0 damage for this component)
						const isImmune = token.actor.getFlag("shadowdark-extras", `immunity.${componentType}`);
						if (isImmune) {
							componentDamage = 0;
						} else {
							// Check for resistance (half damage for this component)
							const isResistant = token.actor.getFlag("shadowdark-extras", `resistance.${componentType}`);
							if (isResistant) {
								const originalDamage = componentDamage;
								componentDamage = Math.floor(componentDamage / 2);
							} else {
								// Check for vulnerability (double damage for this component)
								const isVulnerable = token.actor.getFlag("shadowdark-extras", `vulnerability.${componentType}`);
								if (isVulnerable) {
									const originalDamage = componentDamage;
									componentDamage = componentDamage * 2;
								}
							}
						}

						// Check for physical resistance/immunity/vulnerability (applies to bludgeoning, slashing, piercing)
						if (["bludgeoning", "slashing", "piercing"].includes(componentType)) {
							const isPhysicalImmune = token.actor.getFlag("shadowdark-extras", "immunity.physical");
							if (isPhysicalImmune) {
								componentDamage = 0;
							} else if (componentDamage > 0) {
								const isPhysicalResistant = token.actor.getFlag("shadowdark-extras", "resistance.physical");
								if (isPhysicalResistant) {
									const originalDamage = componentDamage;
									componentDamage = Math.floor(componentDamage / 2);
								} else {
									const isPhysicalVulnerable = token.actor.getFlag("shadowdark-extras", "vulnerability.physical");
									if (isPhysicalVulnerable) {
										const originalDamage = componentDamage;
										componentDamage = componentDamage * 2;
									}
								}
							}

							// Check for non-magical weapon resistance/immunity (only if weapon is not magical)
							if (componentDamage > 0 && !data.isMagicalWeapon) {
								const isNonMagicImmune = token.actor.getFlag("shadowdark-extras", "immunity.nonmagic");
								if (isNonMagicImmune) {
									componentDamage = 0;
								} else {
									const isNonMagicResistant = token.actor.getFlag("shadowdark-extras", "resistance.nonmagic");
									if (isNonMagicResistant) {
										componentDamage = Math.floor(componentDamage / 2);
									}
								}
							}
						}
					}

					finalDamage += componentDamage;
				}



				// Process base damage with its type (uses baseDamageType from weapon flags)
				if (data.baseDamage && data.baseDamage > 0) {
					let baseDamage = data.baseDamage;
					const baseType = (data.baseDamageType || "standard").toLowerCase();

					// Apply resistance/immunity/vulnerability to base damage if not standard
					if (baseType !== "standard" && baseType !== "damage") {
						const isImmune = token.actor.getFlag("shadowdark-extras", `immunity.${baseType}`);
						if (isImmune) {
							baseDamage = 0;
						} else {
							const isResistant = token.actor.getFlag("shadowdark-extras", `resistance.${baseType}`);
							if (isResistant) {
								const originalDamage = baseDamage;
								baseDamage = Math.floor(baseDamage / 2);
							} else {
								const isVulnerable = token.actor.getFlag("shadowdark-extras", `vulnerability.${baseType}`);
								if (isVulnerable) {
									const originalDamage = baseDamage;
									baseDamage = baseDamage * 2;
								}
							}
						}

						// Check for physical resistance/immunity/vulnerability (applies to bludgeoning, slashing, piercing)
						if (["bludgeoning", "slashing", "piercing"].includes(baseType) && baseDamage > 0) {
							const isPhysicalImmune = token.actor.getFlag("shadowdark-extras", "immunity.physical");
							if (isPhysicalImmune) {
								baseDamage = 0;
							} else {
								const isPhysicalResistant = token.actor.getFlag("shadowdark-extras", "resistance.physical");
								if (isPhysicalResistant) {
									const originalDamage = baseDamage;
									baseDamage = Math.floor(baseDamage / 2);
								} else {
									const isPhysicalVulnerable = token.actor.getFlag("shadowdark-extras", "vulnerability.physical");
									if (isPhysicalVulnerable) {
										const originalDamage = baseDamage;
										baseDamage = baseDamage * 2;
									}
								}
							}

							// Check for non-magical weapon resistance/immunity (only if weapon is not magical)
							if (baseDamage > 0 && !data.isMagicalWeapon) {
								const isNonMagicImmune = token.actor.getFlag("shadowdark-extras", "immunity.nonmagic");
								if (isNonMagicImmune) {
									baseDamage = 0;
								} else {
									const isNonMagicResistant = token.actor.getFlag("shadowdark-extras", "resistance.nonmagic");
									if (isNonMagicResistant) {
										baseDamage = Math.floor(baseDamage / 2);
									}
								}
							}
						}
					}

					finalDamage += baseDamage;
				}

				// Glassbones (double damage) - applies after resistance/immunity
				if (hasGlassbones && finalDamage > 0) {
					const originalDamage = finalDamage;
					finalDamage = finalDamage * 2;
				}
			} else {
				// Legacy behavior: single damage value with single type
				// Use baseDamageType if provided (weapon base damage type), otherwise fall back to damageType
				finalDamage = data.damage;
				const effectiveDamageType = (data.baseDamageType || data.damageType || "standard").toLowerCase();

				if (isDamage && effectiveDamageType && effectiveDamageType !== "standard" && effectiveDamageType !== "damage") {

					// Check for immunity (0 damage)
					const isImmune = token.actor.getFlag("shadowdark-extras", `immunity.${effectiveDamageType}`);
					if (isImmune) {
						finalDamage = 0;
					} else {
						// Check for resistance (half damage)
						const isResistant = token.actor.getFlag("shadowdark-extras", `resistance.${effectiveDamageType}`);
						if (isResistant) {
							finalDamage = Math.floor(finalDamage / 2);
						} else {
							// Check for vulnerability (double damage)
							const isVulnerable = token.actor.getFlag("shadowdark-extras", `vulnerability.${effectiveDamageType}`);
							if (isVulnerable) {
								finalDamage = finalDamage * 2;
							}
						}
					}

					// Check for non-magical weapon resistance/immunity (physical damage from non-magical weapons)
					if (finalDamage > 0 && ["bludgeoning", "slashing", "piercing"].includes(effectiveDamageType) && !data.isMagicalWeapon) {
						const isNonMagicImmune = token.actor.getFlag("shadowdark-extras", "immunity.nonmagic");
						if (isNonMagicImmune) {
							finalDamage = 0;
						} else {
							const isNonMagicResistant = token.actor.getFlag("shadowdark-extras", "resistance.nonmagic");
							if (isNonMagicResistant) {
								finalDamage = Math.floor(finalDamage / 2);
							}
						}
					}
				}

				// Glassbones (double damage) - applies after resistance/immunity
				if (hasGlassbones && finalDamage > 0) {
					finalDamage = finalDamage * 2;
				}
			}

			// Negative damage means healing
			const isHealing = finalDamage < 0;
			// For healing: add the absolute value, for damage: subtract
			const hpChange = isHealing ? Math.abs(finalDamage) : -finalDamage;
			const newHp = Math.max(0, Math.min(maxHp, currentHp + hpChange));


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
					}
				} catch (linkError) {
					// Spell tracking might not be enabled, that's okay
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

		// Check for Item first
		let effectDoc = targetActor.items.get(effectItemId);

		// If not an Item, check for ActiveEffect (e.g. Auras)
		if (!effectDoc) {
			effectDoc = targetActor.effects.get(effectItemId);
		}

		if (!effectDoc) {
			console.warn("shadowdark-extras | removeTargetEffect: effect item/document not found");
			return false;
		}

		await effectDoc.delete();
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

	// --- Aura Socket Handlers ---

	socketlibSocket.register("applyAuraEffectViaGM", async ({ sourceTokenId, targetTokenId, trigger, config, auraEffectId, auraEffectActorId }) => {
		const sourceToken = canvas.tokens.get(sourceTokenId);
		const targetToken = canvas.tokens.get(targetTokenId);
		const auraActor = game.actors.get(auraEffectActorId);
		const auraEffect = auraActor?.effects.get(auraEffectId);

		if (!sourceToken || !targetToken || !auraEffect) {
			console.error("shadowdark-extras | applyAuraEffectViaGM: Missing data", { sourceToken, targetToken, auraEffect });
			return;
		}

		const { applyAuraEffect } = await import("./AuraEffectsSD.mjs");
		return applyAuraEffect(sourceToken, targetToken, trigger, config, auraEffect);
	});

	socketlibSocket.register("removeAuraEffectViaGM", async ({ auraEffectId, auraEffectActorId, targetTokenId }) => {
		const auraActor = game.actors.get(auraEffectActorId);
		const auraEffect = auraActor?.effects.get(auraEffectId);
		const targetToken = canvas.tokens.get(targetTokenId);

		if (!auraEffect || !targetToken) {
			console.error("shadowdark-extras | removeAuraEffectViaGM: Missing data", { auraEffect, targetToken });
			return;
		}

		const { removeAuraEffectsFromToken } = await import("./AuraEffectsSD.mjs");
		return removeAuraEffectsFromToken(auraEffect, targetToken);
	});

	socketlibSocket.register("applyAuraConditionsViaGM", async ({ auraEffectId, auraEffectActorId, targetTokenId, effectUuids }) => {
		const targetToken = canvas.tokens.get(targetTokenId);
		let auraActor = game.actors.get(auraEffectActorId);

		// Fallback for unlinked/synthetic actors
		if (!auraActor) {
			auraActor = canvas.tokens.get(auraEffectActorId)?.actor;
		}

		const auraEffect = auraActor?.effects.get(auraEffectId);

		if (!targetToken || !auraEffect) {
			console.error("shadowdark-extras | applyAuraConditionsViaGM: Missing data", {
				targetToken: targetToken?.name,
				auraActor: auraActor?.name,
				auraEffect: auraEffect?.name,
				auraEffectId,
				auraEffectActorId
			});
			return;
		}

		const { applyAuraConditions } = await import("./AuraEffectsSD.mjs");
		return applyAuraConditions(auraEffect, targetToken, effectUuids);
	});

	socketlibSocket.register("applyAuraDamageViaGM", async ({ targetTokenId, config, savedSuccessfully }) => {
		const targetToken = canvas.tokens.get(targetTokenId);
		if (!targetToken) {
			console.error("shadowdark-extras | applyAuraDamageViaGM: Target token not found", targetTokenId);
			return;
		}

		const { applyAuraDamage } = await import("./AuraEffectsSD.mjs");
		return applyAuraDamage(targetToken, config, savedSuccessfully);
	});

	socketlibSocket.register("removeAuraEffectsFromAllViaGM", async ({ auraEffectId, auraEffectActorId }) => {
		const auraActor = game.actors.get(auraEffectActorId);
		const auraEffect = auraActor?.effects.get(auraEffectId);

		if (!auraEffect) {
			console.error("shadowdark-extras | removeAuraEffectsFromAllViaGM: Aura effect not found", auraEffectId);
			return;
		}

		const { removeAuraEffectsFromAll } = await import("./AuraEffectsSD.mjs");
		return removeAuraEffectsFromAll(auraEffect);
	});

	// --- Trade Socket Handlers ---
	// These are for player-to-player trade requests using socketlib prompts

	// Handler: Show trade request prompt to target player
	socketlibSocket.register("showTradeRequestPrompt", async ({ initiatorActorId, targetActorId, initiatorUserId, tradeId }) => {
		const initiatorActor = game.actors.get(initiatorActorId);
		const targetActor = game.actors.get(targetActorId);

		if (!initiatorActor || !targetActor) {
			console.warn(`${MODULE_ID} | Trade request: actors not found`);
			return { accepted: false };
		}

		// Check if this user owns the target actor
		if (!targetActor.isOwner) {
			return { accepted: false };
		}

		// Show confirmation dialog to the target player
		const accepted = await Dialog.confirm({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.trade.request_title"),
			content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.trade.request_prompt", { player: initiatorActor.name })}</p>`,
			yes: () => true,
			no: () => false,
			defaultYes: false
		});

		return { accepted };
	});

	// Handler: Open trade window on this client  
	socketlibSocket.register("openTradeWindow", async ({ tradeId, localActorId, remoteActorId, isInitiator }) => {
		const localActor = game.actors.get(localActorId);
		const remoteActor = game.actors.get(remoteActorId);

		if (!localActor || !remoteActor) {
			console.warn(`${MODULE_ID} | openTradeWindow: actors not found`);
			return;
		}

		// Check if this user owns the local actor
		if (!localActor.isOwner) {
			return; // Not for this user
		}

		// Dynamically import TradeWindowSD to avoid circular imports
		const { default: TradeWindowSD } = await import("./TradeWindowSD.mjs");

		// Create and render the trade window
		const tradeWindow = new TradeWindowSD({
			tradeId: tradeId,
			localActor: localActor,
			remoteActor: remoteActor,
			isInitiator: isInitiator
		});
		tradeWindow.render(true);
	});

	// Handler: Notify initiator that trade was declined
	socketlibSocket.register("notifyTradeDeclined", async ({ targetActorName }) => {
		ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.trade.declined_by", { player: targetActorName }));
	});

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
	hideItemDescription: false, // Hide item description in chat cards (weapon/spell details)
	requireTargetForAttack: "none", // 'none' = no check, 'warn' = warn but proceed, 'block' = prevent attack
	checkWeaponRange: "none", // 'none' = no check, 'warn' = warn but proceed, 'block' = prevent attack if out of range
	untargetAtEndOfTurn: "dead", // 'none' = no untargeting, 'dead' = untarget dead tokens, 'all' = untarget all
	damageCard: {
		showTargets: true,
		showMultipliers: true,
		showApplyButton: true,
		autoApplyDamage: true,
		autoApplyConditions: true,
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

	// Setup hook for un-targeting tokens at end of turn
	setupUntargetHook();
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

}

// Track which messages have already spawned creatures (in-memory cache)
const _spawnedMessages = new Set();
const _itemGiveMessages = new Set();
const _coatingPoisonMessages = new Set();

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
}


/**
 * Setup hook to delete expired summoned tokens when combat advances
 */
export function setupSummonExpiryHook() {
	Hooks.on("updateCombat", async (combat, changed, options, userId) => {

		// Only process on round changes
		if (!("round" in changed)) {
			return;
		}

		// Only run for GM
		if (!game.user.isGM) return;

		const currentRound = combat.round;
		const sceneId = canvas.scene?.id;


		if (!sceneId) return;

		const expiryList = getSummonedTokensExpiry(sceneId);
		if (!expiryList || expiryList.length === 0) {
			return;
		}


		// expiryList already retrieved above
		const tokensToDelete = [];
		const remainingExpiry = [];
		const expiringMessages = [];
		const remainingMessages = [];

		for (const entry of expiryList) {
			const roundsRemaining = entry.expiryRound - currentRound;

			if (currentRound >= entry.expiryRound) {
				tokensToDelete.push(...entry.tokenIds);
				expiringMessages.push(`<b>${entry.spellName}</b> has expired!`);
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
				}
			} catch (err) {
				console.error("shadowdark-extras | Error deleting expired summons:", err);
			}
		}
	});

}

/**
 * Un-target dead tokens after a roll
 * Called when untargetAtEndOfTurn is set to "dead"
 */
export function untargetDeadTokens() {
	game.user?.targets.forEach((token) => {
		const hp = token.actor?.system?.attributes?.hp?.value;
		if (hp !== undefined && hp <= 0) {
			token.setTarget(false, { releaseOthers: false });
		}
	});
}

/**
 * Un-target all tokens for the current user
 * Called when untargetAtEndOfTurn is set to "all"
 */
export function untargetAllTokens() {
	game.user?.targets.forEach((token) => {
		token.setTarget(false, { releaseOthers: false });
	});
}

/**
 * Setup hook for un-targeting tokens at end of turn
 * This runs when the combat turn advances
 */
export function setupUntargetHook() {
	Hooks.on("updateCombat", (combat, changed, options, userId) => {
		// Only process on turn changes
		if (!("turn" in changed)) {
			return;
		}

		// Get the untarget setting
		let settings;
		try {
			settings = game.settings.get(MODULE_ID, "combatSettings");
		} catch (e) {
			return; // Settings not registered yet
		}

		const untargetMode = settings.untargetAtEndOfTurn || "none";
		if (untargetMode === "none") return;

		// Delay slightly to let any pending damage/HP updates complete
		setTimeout(() => {
			if (untargetMode === "dead") {
				untargetDeadTokens();
			} else if (untargetMode === "all") {
				untargetAllTokens();
			}
		}, 100);
	});
}

// Track messages that have already had template placement to prevent re-triggering
const _templatePlacedMessages = new Set();
// Track messages that have already auto-applied conditions/damage to prevent duplicates
const _autoAppliedMessages = new Set();


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

	// Prevent duplicate injection for the same message
	const messageKey = message.id;
	const isAuthor = message.author.id === game.user.id;

	// Skip if the message is being deleted or closed
	if (html.hasClass('deleting') || data.canClose) {
		return;
	}

	// Skip if a damage card is already in the DOM for this message
	if (html.find('.sdx-damage-card').length > 0) {
		return;
	}

	// Check if damage card feature is enabled
	let settings;
	try {
		settings = game.settings.get(MODULE_ID, "combatSettings");
	} catch (e) {
		return; // Settings not registered yet
	}

	if (!settings.showDamageCard) {
		return;
	}

	// Skip initiative rolls - they should not show damage cards
	const messageFlavor = (message.flavor || "").toLowerCase();
	const rollType = message.flags?.shadowdark?.rollType;
	if (rollType === "initiative" || messageFlavor.includes("initiative")) {
		return;
	}

	// Check if player damage cards are enabled (for non-GMs)
	// Note: We don't return early here - we still process templates, summoning, effects, etc.
	// We just skip the damage card HTML injection at the end
	const hideDamageCardFromPlayer = !game.user.isGM && !settings.showForPlayers;
	if (hideDamageCardFromPlayer) {
	}

	// Check if this is a Shadowdark weapon/attack card with damage OR a spell with damage configured
	const hasWeaponCard = html.find('.chat-card').length > 0;
	const hasDamageRoll = html.find('.dice-total').length > 0;

	// Also check for damage text or damage formula using localized keywords
	const messageText = html.text().toLowerCase();
	const flavorText = (message.flavor || "").toLowerCase();

	// Support for different languages
	const damageKeywords = ["damage", "dégât", "dégâts", "schaden", "daño", "dano", "урон", "vahinko", "soins", "healing"];
	try {
		const damageLabel = game.i18n.localize("SHADOWDARK.roll.damage").toLowerCase();
		if (damageLabel && !damageKeywords.includes(damageLabel)) {
			damageKeywords.push(damageLabel);
			// For languages like French, "Jet de dégâts" -> add "dégâts" part
			const parts = damageLabel.split(/[\s']+/);
			for (const part of parts) {
				if (part.length > 3) damageKeywords.push(part);
			}
		}
		const applyDamageLabel = game.i18n.localize("SHADOWDARK.chat_card.context.apply_damage").toLowerCase();
		if (applyDamageLabel && !damageKeywords.includes(applyDamageLabel)) damageKeywords.push(applyDamageLabel);
	} catch (e) {
		// game.i18n might not be fully ready
	}

	const hasDamageKeyword = damageKeywords.some(kw => messageText.includes(kw)) ||
		damageKeywords.some(kw => html.find('h4, h3, h2').text().toLowerCase().includes(kw));


	// Check if this looks like a damage roll
	const isDamageRoll = (hasWeaponCard && hasDamageRoll && hasDamageKeyword) ||
		(damageKeywords.some(kw => flavorText.includes(kw))) ||
		(message.flags?.shadowdark?.rollType === 'damage');

	// Check if this is a spell cast with damage/heal configuration or effects
	let isSpellWithDamage = false;
	let isSpellWithEffects = false;
	let spellDamageConfig = null;
	let casterActor = null; // The actor who owns the spell item
	let item = null; // The spell/potion item

	// Get the item from the chat card if it exists
	const cardData = html.find('.chat-card').data();
	let itemType = null; // Track the item type
	if (cardData?.actorId && cardData?.itemId) {
		casterActor = game.actors.get(cardData.actorId);
		item = casterActor?.items.get(cardData.itemId);

		// If item not found (consumed), try to get it from message flags
		if (!item && message.flags?.[MODULE_ID]?.itemConfig) {
			const storedConfig = message.flags[MODULE_ID].itemConfig;

			// Create a minimal item-like object with the stored configuration
			item = {
				name: storedConfig.name,
				type: storedConfig.type,
				flags: {
					[MODULE_ID]: {
						summoning: storedConfig.summoning,
						itemGive: storedConfig.itemGive,
						auraEffects: storedConfig.auraEffects,
						spellDamage: storedConfig.spellDamage,
						coatingPoison: storedConfig.coatingPoison
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
				}
			}
		}
	}

	// Check for aura effects configuration
	const hasAuraEnabled = item?.flags?.[MODULE_ID]?.auraEffects?.enabled || false;
	if (hasAuraEnabled) {
	}

	// Check for summoning configuration (independent of damage/effects)
	const summoningConfig = item?.flags?.[MODULE_ID]?.summoning;
	if (summoningConfig?.enabled && summoningConfig?.profiles && summoningConfig.profiles.length > 0) {

		// Only spawn for the user who created the message (the caster)
		if (message.author.id !== game.user.id) {
			// Don't return - still process other damage/effects for observers
		} else if (_spawnedMessages.has(message.id)) {
			// Check in-memory cache (synchronous, prevents race condition)
		} else {
			// Check if the spell cast was successful (skip this check for potions and scrolls which always succeed)
			// Wands have spell rolls, so they need the success check
			if (!["Potion", "Scroll"].includes(itemType)) {
				const shadowdarkRolls = message.flags?.shadowdark?.rolls;
				const mainRoll = shadowdarkRolls?.main;

				if (!mainRoll || mainRoll.success !== true) {
					return;
				}
			}

			// Mark as spawned immediately (synchronous)
			_spawnedMessages.add(message.id);


			// Parse profiles if it's a string
			let profiles = summoningConfig.profiles;
			if (typeof profiles === 'string') {
				try {
					profiles = JSON.parse(profiles);
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
			}

			// Automatically spawn creatures when spell is cast
			await spawnSummonedCreatures(casterActor, item, profiles, summoningConfig, isCriticalSuccess);
		}
	}

	const itemGiveConfig = item?.flags?.[MODULE_ID]?.itemGive;
	if (itemGiveConfig?.enabled && itemGiveConfig?.profiles && itemGiveConfig.profiles.length > 0) {
		if (message.author.id !== game.user.id) {
		} else if (_itemGiveMessages.has(message.id)) {
		} else {
			let shouldGive = true;
			if (!["Potion", "Scroll"].includes(itemType)) {
				const shadowdarkRolls = message.flags?.shadowdark?.rolls;
				const mainRoll = shadowdarkRolls?.main;
				if (!mainRoll || mainRoll.success !== true) {
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

	// Process coating poison for potions
	const coatingPoisonConfig = item?.flags?.[MODULE_ID]?.coatingPoison;
	if (coatingPoisonConfig?.enabled && itemType === "Potion") {
		if (message.author.id !== game.user.id) {
			// Don't process for other users
		} else if (_coatingPoisonMessages.has(message.id)) {
			// Already processed
		} else {
			_coatingPoisonMessages.add(message.id);

			// Determine target actor - use target if present, otherwise self
			const targetToken = Array.from(game.user.targets)[0];
			const targetActor = targetToken?.actor || casterActor;

			if (targetActor) {
				await applyCoatingPoison(casterActor, targetActor, coatingPoisonConfig, item.name);
			}
		}
	}

	if (!isDamageRoll && !isSpellWithDamage && !isSpellWithEffects && !hasAuraEnabled) {
		return;
	}

	// Get the actor for damage rolls - for spells use the caster, otherwise use speaker
	const speaker = message.speaker;
	let actor = casterActor; // Start with the actor found from chat card data
	let casterTokenId = speaker?.token || ''; // The actual token that made the attack/cast

	if (!actor && speaker?.actor) {
		// Fallback to speaker if not found from card data
		actor = game.actors.get(speaker.actor);
	}

	if (!actor) {
		return;
	}

	if ((isSpellWithDamage || isSpellWithEffects)) {
	} else {
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
	// Note: Potions and Scrolls don't have successful roll requirements (they always succeed when used)
	// Wands DO have spell rolls, so they need the success check
	if (useTemplateTargeting && !["Potion", "Scroll"].includes(itemType)) {
		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;
		if (!mainRoll || mainRoll.success !== true) {
			useTemplateTargeting = false;
		}
	}

	if (useTemplateTargeting) {

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

		// Calculate auto-delete timing (time-based modes only)
		// For round-based deletion, we use flags on the template instead
		let autoDelete = null;
		let expiryRounds = null;
		if (deleteMode === 'endOfTurn') {
			// Delete at end of caster's turn - tracked via combat, fallback to 6 seconds  
			autoDelete = 6000;
		} else if (deleteMode === 'duration') {
			// Delete after X combat rounds - tracked via template flags
			// autoDelete stays null, we store expiryRounds instead
			expiryRounds = deleteDuration;
		} else if (deleteMode === 'seconds') {
			// Delete after X seconds (time-based)
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

					// Filter out caster if excludeCaster is enabled
					if (excludeCaster && speaker?.token) {
						targets = targets.filter(t => t.id !== speaker.token);
					}

					// Apply template effects configuration if enabled
					const templateEffectsConfig = item?.flags?.[MODULE_ID]?.templateEffects;
					if (result.template && templateEffectsConfig?.enabled) {
						await setupTemplateEffectFlags(result.template, {
							enabled: true,
							spellName: item.name,
							casterActorId: casterActor?.id,
							casterTokenId: speaker?.token,
							onEnter: templateEffectsConfig.triggers?.onEnter || false,
							onTurnStart: templateEffectsConfig.triggers?.onTurnStart || false,
							onTurnEnd: templateEffectsConfig.triggers?.onTurnEnd || false,
							onLeave: templateEffectsConfig.triggers?.onLeave || false,
							damageFormula: templateEffectsConfig.damage?.formula || '',
							damageType: templateEffectsConfig.damage?.type || '',
							saveEnabled: templateEffectsConfig.save?.enabled || false,
							saveDCFormula: templateEffectsConfig.save?.dc || '12',  // Store as formula string
							spellcastingCheckTotal: (() => {
								let total = message.flags?.shadowdark?.rolls?.main?.total;

								// Check for nested roll object (structure shown in user screenshot)
								if (total === undefined) {
									total = message.flags?.shadowdark?.rolls?.main?.roll?.total;
								}

								// Fallback to core rolls if flags are missing
								if (total === undefined && message.rolls?.length > 0) {
									total = message.rolls[0].total;
								}

								total = total || 0;
								console.log(`shadowdark-extras | Extracted spellcastingCheckTotal: ${total}`, {
									flags: message.flags?.shadowdark?.rolls,
									core: message.rolls?.map(r => r.total)
								});
								return total;
							})(), // Caster's spell roll
							casterLevel: casterActor?.system?.level?.value || 1,
							casterAbilities: {
								str: casterActor?.system?.abilities?.str?.mod || 0,
								dex: casterActor?.system?.abilities?.dex?.mod || 0,
								con: casterActor?.system?.abilities?.con?.mod || 0,
								int: casterActor?.system?.abilities?.int?.mod || 0,
								wis: casterActor?.system?.abilities?.wis?.mod || 0,
								cha: casterActor?.system?.abilities?.cha?.mod || 0
							},
							saveAbility: templateEffectsConfig.save?.ability || 'dex',
							halfOnSuccess: templateEffectsConfig.save?.halfOnSuccess || false,
							effects: templateEffectsConfig.applyConfiguredEffects ?
								(spellDamageConfig?.effects || []) : [],
							excludeCaster: excludeCaster,
							runItemMacro: templateEffectsConfig.runItemMacro || false,
							spellId: item.id
						});
					}

					// Note: Aura effects are now applied after target gathering (see below)
					// to work for both template and targeted modes
					// Store round-based expiry info on template for combat-based deletion
					if (result.template && expiryRounds && expiryRounds > 0) {
						const currentRound = game.combat?.round || 0;
						const expiryRound = currentRound + expiryRounds;
						await result.template.setFlag(MODULE_ID, 'templateExpiry', {
							spellName: item.name,
							createdRound: currentRound,
							expiryRound: expiryRound,
							duration: expiryRounds
						});
					}

					// Store template ID for duration spell linking
					if (result.template) {
						window._lastPlacedTemplateId = result.template.id;
					}

					// Mark this message as having template placed using in-memory tracking
					// We avoid message.update() because it triggers re-renders that remove our injected damage card
					_templatePlacedMessages.add(messageKey);
				} else {
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
	} else {
		// Fallback to current user's targets (backward compatibility)
		targets = Array.from(game.user.targets || []);
	}


	// For "Self" range spells, if no targets are selected, use the caster's token as target
	// Range can be either a string directly (e.g., "self") or an object with a value property
	const rawRange = item?.system?.range;
	const spellRange = (typeof rawRange === 'string' ? rawRange : rawRange?.value || "").toLowerCase();
	if (targets.length === 0 && spellRange === "self" && casterActor) {
		const casterTokenId = speaker?.token;
		if (casterTokenId) {
			const casterToken = canvas.tokens?.get(casterTokenId);
			if (casterToken) {
				targets = [casterToken];
			}
		}
		if (targets.length === 0) {
			// Fallback: find first token for this actor on the current scene
			const casterToken = canvas.tokens?.placeables.find(t => t.actor?.id === casterActor.id);
			if (casterToken) {
				targets = [casterToken];
			}
		}
	}

	// Apply Aura Effects if configured (works for both template and targeted modes)
	const auraConfig = item?.flags?.[MODULE_ID]?.auraEffects;
	// Check if this is a focus maintenance roll (not initial cast)
	const auraFocusCheckText = game.i18n.localize("SHADOWDARK.chat.spell_focus_check") || "Focus Check";
	const isFocusRoll = message.flavor?.includes(auraFocusCheckText) || message.flavor?.includes("Focus Check");
	// Check if aura was already created for this message (prevents duplicate on re-render)
	const auraAlreadyCreated = message.getFlag(MODULE_ID, "auraCreated");

	// Check if spell cast was successful (treat no roll as success for scrolls/wands)
	const auraShadowdarkRolls = message.flags?.shadowdark?.rolls;
	const auraMainRoll = auraShadowdarkRolls?.main;
	const spellCastSuccessful = !auraMainRoll || auraMainRoll.success === true;

	let auraCreatedThisCall = false;
	if (auraConfig?.enabled && !isFocusRoll && !auraAlreadyCreated && spellCastSuccessful) {

		// Only process aura creation for the user who created the message OR the first active GM
		// This ensures only one client performs the database operations and initial processing
		const primaryExecutorId = game.users.activeGM?.id || message.author?.id;

		if (primaryExecutorId !== game.user.id) {
			// If it's the GM casting but this client is a player, we still treat the aura as "handled"
			// so this client's damage card (if any) doesn't try to auto-apply redundant effects
			if (game.user.id !== primaryExecutorId) {
				auraCreatedThisCall = true;
			}
		} else {
			// Determine which actor to attach the aura to
			let auraActor = null;
			if (auraConfig.attachTo === 'target' && targets.length > 0) {
				auraActor = targets[0].actor;
			} else {
				// Default to caster
				auraActor = casterActor;
			}

			if (auraActor) {
				const durationConfig = item.system.duration;
				const auraExpiryRounds = durationConfig?.type === 'rounds' ? (durationConfig.value || 0) : null;

				// Log what effects we're trying to use

				// Parse effects - they may be stored as JSON string
				let auraEffects = [];
				if (auraConfig.applyConfiguredEffects && spellDamageConfig?.effects) {
					let rawEffects = spellDamageConfig.effects;
					// Parse if it's a string
					if (typeof rawEffects === 'string') {
						try {
							rawEffects = JSON.parse(rawEffects);
						} catch (e) {
							console.error("shadowdark-extras | Failed to parse effects JSON:", e);
							rawEffects = [];
						}
					}
					// Extract UUIDs from effect objects
					if (Array.isArray(rawEffects)) {
						auraEffects = rawEffects.map(eff => eff.uuid || eff).filter(Boolean);
					}
				}

				const effect = await createAuraOnActor(auraActor, {
					radius: auraConfig.radius || 30,
					triggers: auraConfig.triggers || {},
					damage: auraConfig.damage || {},
					save: auraConfig.save || {},
					effects: auraEffects,
					animation: auraConfig.animation || {},
					tokenFilters: auraConfig.tokenFilters || {},
					disposition: auraConfig.disposition || 'all',
					includeSelf: auraConfig.includeSelf || false,
					checkVisibility: auraConfig.checkVisibility || false,
					applyConfiguredEffects: auraConfig.applyConfiguredEffects || false,
					effectsTriggers: auraConfig.effectsTriggers || {},
					damageTriggers: auraConfig.damageTriggers || {},
					runItemMacro: auraConfig.runItemMacro || false,
					macroTriggers: auraConfig.macroTriggers || {}
				}, item, durationConfig, auraExpiryRounds);

				if (effect) {
					auraCreatedThisCall = true;
					// Mark message to prevent duplicate aura creation on re-render
					await message.setFlag(MODULE_ID, "auraCreated", true);

					// If this is a focus spell, link the aura effect to the focus spell tracking
					if (durationConfig?.type === "focus") {
						const spellInstanceId = item.id;
						// Prepare per-turn config for focus spell
						const perTurnConfig = spellDamageConfig?.trackDuration ? {
							perTurnTrigger: spellDamageConfig.perTurnTrigger || "start",
							perTurnDamage: spellDamageConfig.perTurnDamage || "",
							damageType: spellDamageConfig.damageType || "",
							reapplyEffects: spellDamageConfig.reapplyEffects || false,
							effects: spellDamageConfig.effects || []
						} : null;

						// Ensure focus tracking is started (in case chat hook hasn't fired yet)
						await startFocusSpellIfNeeded(actor.id, spellInstanceId, item.name, perTurnConfig);

						// Link the newly created aura effect to the focus spell
						// For focus spells, we MUST use linkEffectToFocusSpell (not Duration spell)
						await linkEffectToFocusSpell(actor.id, spellInstanceId, auraActor.id, auraActor.token?.id, effect.id);
					} else if ((durationConfig?.type === "rounds" || durationConfig?.type === "turns") && spellDamageConfig?.trackDuration) {
						// For non-focus spells, start a duration spell in the tracker
						// and link THIS aura effect to it so it gets deleted when finished
						try {
							const trackerConfig = {
								perTurnTrigger: spellDamageConfig.perTurnTrigger || "start",
								perTurnDamage: spellDamageConfig.perTurnDamage || "",
								reapplyEffects: spellDamageConfig.reapplyEffects || false,
								damageType: spellDamageConfig.damageType || "",
								effects: spellDamageConfig.effects || [],
								templateId: window._lastPlacedTemplateId || null
							};

							const instance = await startDurationSpell(casterActor, item, [], trackerConfig);
							if (instance?.instanceId) {
								await linkEffectToDurationSpell(casterActor.id, instance.instanceId, auraActor.id, auraActor.token?.id, effect.id);

								// Set flag to skip later duration tracking check for this message
								message.setFlag(MODULE_ID, "durationTrackerStarted", true);
							}
						} catch (err) {
							console.warn("shadowdark-extras | Failed to start duration tracking for aura:", err);
						}
					}
				}
			}
		}
	}
	// Don't show card if no targets
	if (targets.length === 0 && !game.user.isGM) {
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
				return;
			}
		}

		damageType = spellDamageConfig.damageType || "damage";

		// Synchronization Check: Only author rolls, others use synced results
		const syncedResults = message.getFlag(MODULE_ID, "spellDamageResults");

		if (syncedResults) {
			totalDamage = syncedResults.totalDamage;
			damageType = syncedResults.damageType;
			window._lastSpellRollBreakdown = syncedResults.rollBreakdown;

			const rollData = syncedResults.rollJSON || syncedResults.rollData;
			if (rollData) {
				try {
					window._lastSpellRoll = (typeof rollData === "string") ? Roll.fromJSON(rollData) : Roll.fromData(rollData);
				} catch (e) {
					console.error("shadowdark-extras | Error loading synced spell roll:", e);
				}
			}

			if (syncedResults.perTargetDamage) {
				window._perTargetDamage = {};
				for (const [id, d] of Object.entries(syncedResults.perTargetDamage)) {
					const tRollData = d.rollJSON || d.rollData;
					if (tRollData) {
						try {
							window._perTargetDamage[id] = {
								damage: d.damage,
								formula: d.formula,
								roll: (typeof tRollData === "string") ? Roll.fromJSON(tRollData) : Roll.fromData(tRollData)
							};
						} catch (e) {
							console.error(`shadowdark-extras | Error loading synced per-target roll for ${id}:`, e);
						}
					}
				}
			}

			if (syncedResults.damageRequirement) {
				window._damageRequirement = syncedResults.damageRequirement;
			}

			// We have everything we need from sync, skip rolling
		} else if (!isAuthor) {
			// Not the author and no results yet - wait for sync
			return;
		} else {
			// AUTHOR: Continue with normal rolling logic
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
					formula += `+ ${bonus}`;
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
								}
							}

							// Evaluate any expressions in the formula (e.g., (1 + floor(@level / 2))d6 -> 2d6)
							targetFormula = evaluateFormulaExpressions(targetFormula, rollData);

							// Double dice on critical hit
							if (isSpellCritical) {
								targetFormula = doubleDiceInFormula(targetFormula);
							}

							// Roll for this specific target
							const roll = new Roll(targetFormula, rollData);
							await roll.evaluate();

							// Show 3D dice animation if Dice So Nice is available
							if (game.dice3d) {
								await game.dice3d.showForRoll(roll, game.user, true);
							}

							let targetDamage = roll.total;


							// Check damage requirement if it exists
							if (spellDamageConfig.damageRequirement && spellDamageConfig.damageRequirement.trim() !== '') {
								const reqFormula = spellDamageConfig.damageRequirement.trim();
								const requirementMet = evaluateRequirement(reqFormula, rollData);

								if (!requirementMet) {
									const failAction = spellDamageConfig.damageRequirementFailAction || 'zero';
									if (failAction === 'half') {
										targetDamage = Math.floor(targetDamage / 2);
									} else {
										targetDamage = 0;
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

						}

						// Use average damage for display (or total, depending on your preference)
						totalDamage = Math.floor(totalDamageSum / targets.length);
						window._lastSpellRollBreakdown = `Per - target(avg: ${totalDamage})`;

					} else {
						// No target variables and no tiered formula, roll once for all targets
						const rollData = baseRollData;

						// Check for tiered formula - use caster's level when no targets
						let finalFormula = formula;
						if (hasTieredFormula) {
							const tieredResult = parseTieredFormula(tieredFormula, rollData.level);
							if (tieredResult) {
								finalFormula = tieredResult;
							}
						}

						// Evaluate any expressions in the formula (e.g., (1 + floor(@level / 2))d6 -> 2d6)
						finalFormula = evaluateFormulaExpressions(finalFormula, rollData);

						// Double dice on critical hit
						if (isSpellCritical) {
							const originalFormula = finalFormula;
							finalFormula = doubleDiceInFormula(finalFormula);
						}

						const roll = new Roll(finalFormula, rollData);
						await roll.evaluate();

						// Show 3D dice animation if Dice So Nice is available
						if (game.dice3d) {
							await game.dice3d.showForRoll(roll, game.user, true);
						}

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
									} else {
										totalDamage = 0;
									}
								}
							} else {
								// Store requirement info for per-target evaluation during damage application
								window._damageRequirement = {
									formula: requirementFormula,
									failAction: spellDamageConfig.damageRequirementFailAction || 'zero',
									casterData: rollData
								};
							}
						}

						// Build detailed breakdown of the roll
						const diceBreakdown = roll.dice.map(d => {
							const results = d.results.map(r => r.result).join(', ');
							return `${d.number}${d.faces === 'f' ? 'dF' : 'd' + d.faces}: [${results}]`;
						}).join(' + ');

						const rollBreakdown = roll.formula + ' = ' + (diceBreakdown || totalDamage);
						const formulaDisplay = hasTieredFormula ? `Tiered → ${finalFormula} ` : finalFormula;


						// Store roll breakdown for use in damage card
						window._lastSpellRollBreakdown = rollBreakdown;
						// Store the actual Roll object so buildRollBreakdown can extract individual dice
						window._lastSpellRoll = roll;
					}

					// AUTHOR: Save the finalized results to message flags for other clients
					const flagData = {
						totalDamage,
						damageType,
						rollBreakdown: window._lastSpellRollBreakdown,
						rollJSON: window._lastSpellRoll?.toJSON(),
						damageRequirement: window._damageRequirement
					};

					if (window._perTargetDamage) {
						flagData.perTargetDamage = {};
						for (const [id, d] of Object.entries(window._perTargetDamage)) {
							flagData.perTargetDamage[id] = {
								damage: d.damage,
								formula: d.formula,
								rollJSON: d.roll.toJSON()
							};
						}
					}

					await message.setFlag(MODULE_ID, "spellDamageResults", flagData);

					// Allow the re-render from setFlag to handle final injection for consistency
					return;
				} catch (error) {
					console.error("shadowdark-extras | Error rolling spell damage:", error);
					ui.notifications.error(`Invalid spell damage formula: ${formula}`);
					return;
				}
			}
		}
	} else {
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
	}

	// If this is an aura spell with applyToOriginator=false, skip effects for the originator
	// Effects will be applied via the aura enter/leave triggers instead
	if (hasAuraEnabled && auraConfig && auraConfig.applyToOriginator === false) {
		spellEffects = [];
	}

	// Check if this was a critical hit (for doubling bonus dice)
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const mainRoll = shadowdarkRolls?.main;
	const isCritical = mainRoll?.critical === "success";

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
			spellEffects = criticalEffects;
		}
	}

	// Get effect selection mode and apply it
	const effectSelectionMode = spellDamageConfig?.effectSelectionMode || 'all';
	let originalEffectsForPrompt = null; // Store original effects for 'prompt' mode

	if (spellEffects.length > 1) {

		if (effectSelectionMode === 'random') {
			// Randomly select one effect
			const randomIndex = Math.floor(Math.random() * spellEffects.length);
			const selectedEffect = spellEffects[randomIndex];
			spellEffects = [selectedEffect];
		} else if (effectSelectionMode === 'prompt') {
			// Store original effects for the click handler to use for prompting
			originalEffectsForPrompt = [...spellEffects];
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

			// Check for synced weapon bonus results in flags
			const syncedWeaponResults = message.getFlag(MODULE_ID, "weaponBonusResults");
			if (syncedWeaponResults) {
				weaponBonusDamage = syncedWeaponResults;

				// Reconstruct Roll results if needed (though they are mainly used for display)
				// The breakdown logic will use bonusRollResults/criticalRollResults which are plain objects
			} else if (isAuthor) {
				// Author calculates and persists results
				try {
					weaponBonusDamage = await calculateWeaponBonusDamage(item, actor, targetActor, isCritical);

					// Trigger Dice So Nice for author
					if (game.dice3d) {
						if (weaponBonusDamage.bonusRolls) {
							for (const roll of weaponBonusDamage.bonusRolls) {
								game.dice3d.showForRoll(roll, game.user, true);
							}
						}
						if (weaponBonusDamage.criticalRolls) {
							for (const roll of weaponBonusDamage.criticalRolls) {
								game.dice3d.showForRoll(roll, game.user, true);
							}
						}
					}

					// Prepare results for flag (must be plain objects/JSON compatible)
					const persistData = {
						totalBonus: weaponBonusDamage.totalBonus,
						bonusFormula: weaponBonusDamage.bonusFormula,
						bonusParts: weaponBonusDamage.bonusParts,
						bonusRollResults: weaponBonusDamage.bonusRollResults,
						damageComponents: weaponBonusDamage.damageComponents,
						criticalExtraDice: weaponBonusDamage.criticalExtraDice,
						criticalBonus: weaponBonusDamage.criticalBonus,
						criticalFormula: weaponBonusDamage.criticalFormula,
						criticalRollResults: weaponBonusDamage.criticalRollResults,
						requirementsMet: weaponBonusDamage.requirementsMet,
						damageTypes: weaponBonusDamage.damageTypes,
						// Track usage info for decrementing after damage is applied
						appliedBonusIndicesWithUsage: weaponBonusDamage.appliedBonusIndicesWithUsage || [],
						weaponItemId: item?.id,
						actorId: actor?.id
					};

					await message.setFlag(MODULE_ID, "weaponBonusResults", persistData);

					// Allow the re-render from setFlag to handle final injection for consistency
					return;
				} catch (err) {
					console.warn("shadowdark-extras | Failed to calculate weapon bonus damage:", err);
				}
			} else {
				// Not the author and no results yet - wait for sync
				return;
			}

			if (weaponBonusDamage?.requirementsMet && (weaponBonusDamage.totalBonus !== 0 || weaponBonusDamage.criticalBonus !== 0)) {
				// Add bonus damage to total (but show it separately in the card)
				totalDamage += weaponBonusDamage.totalBonus + weaponBonusDamage.criticalBonus;

				// If weapon has specific damage types, override the generic "damage" type
				if (weaponBonusDamage.damageTypes && weaponBonusDamage.damageTypes.length > 0) {
					damageType = weaponBonusDamage.damageTypes[0]; // Take the first type for now
				}
			}
		}
	}

	const hasWeaponBonuses = weaponBonusDamage && weaponBonusDamage.requirementsMet && (weaponBonusDamage.totalBonus !== 0 || (isCritical && weaponBonusDamage.criticalBonus !== 0));

	// Combine spell effects and weapon effects
	const allEffects = [...spellEffects, ...weaponEffects];

	if (totalDamage === 0 && allEffects.length === 0) {
		return; // Nothing to apply
	}

	// Override targets based on effectsApplyToTarget setting
	// Damage/healing always applies to targets, only effects can apply to self
	const cardTargets = targets;


	// Get base damage type (use item flag for weapons, damageType for spells/others)
	const baseDamageType = item?.type === "Weapon" ? (item.getFlag?.(MODULE_ID, 'baseDamageType') || 'standard') : damageType;

	// Check if this is a magical weapon attack
	const isMagicalWeapon = item?.type === "Weapon" && item?.system?.magicItem === true;

	// Build the damage card HTML (pass allEffects which includes both spell and weapon effects)
	const cardHtml = await buildDamageCardHtml(actor, cardTargets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage, isCritical, item, casterTokenId, baseDamageType, isMagicalWeapon);



	// Insert the damage card after the chat card or message content
	// Skip injection if damage card is hidden from this player
	if (hideDamageCardFromPlayer) {
	} else {
		const $chatCard = html.find('.chat-card');

		if ($chatCard.length) {
			$chatCard.after(cardHtml);
		} else {
			const $messageContent = html.find('.message-content');
			$messageContent.append(cardHtml);
		}
	}

	// Attach event listeners (only if damage card was injected)
	if (!hideDamageCardFromPlayer) {
		attachDamageCardListeners(html, message.id);
	} else if (isSpellWithDamage || isSpellWithEffects || hasWeaponBonuses || allEffects.length > 0) {
		// If damage card is hidden, show a minimal summary for both spells AND weapons (if they have bonuses)

		// Hide native damage rolls to avoid redundancy when showing our summary
		// This applies to Shadowdark's native weapon damage displays
		html.find('.card-damage-roll-single, .card-damage-rolls').hide();
		html.find('.chat-card h3:contains("Damage Roll")').hide();
		html.find('.chat-card h4:contains("Damage Roll")').hide();

		const isHealing = damageType?.toLowerCase() === "healing";
		const damageLabel = isHealing ? "Healing" : "Damage";

		// Build formula and results using buildRollBreakdown for consistency
		const rollSummary = await buildRollBreakdown(message, weaponBonusDamage, isCritical, baseDamageType);

		let formula = rollSummary?.formula || "";
		let results = rollSummary?.total || totalDamage;

		// Fallback for spell rolls
		if (!formula) {
			const roll = window._lastSpellRoll;
			if (roll) {
				formula = roll.formula;
			} else if (window._lastSpellRollBreakdown) {
				formula = window._lastSpellRollBreakdown.split(' = ')[0];
			}
		}

		// Build breakdown tooltip HTML if components exist
		let breakdownTooltipHtml = '';
		if (rollSummary?.components && rollSummary.components.length > 0) {
			const componentLines = rollSummary.components.map(c => {
				const displayType = (c.type && c.type !== 'standard') ? c.type.charAt(0).toUpperCase() + c.type.slice(1).toLowerCase() : '';
				const typeLabel = displayType ? ` ${displayType}` : '';
				const labelText = c.label ? `[${c.label}] ` : '';
				const diceResults = (c.dice && c.dice.length > 0) ? ` [${c.dice.join(',')}] ` : ' ';
				return `<div style="display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); padding: 2px 0;">
					<span style="font-size: 11px; white-space: nowrap;">${labelText}${c.formula}${diceResults}</span>
					<span style="font-weight: bold; font-size: 11px;">${c.total}${typeLabel}</span>
				</div>`;
			}).join('');

			breakdownTooltipHtml = `
				<div class="sdx-damage-tooltip" style="display: none; margin-top: 8px; padding: 4px 8px; background: rgba(0,0,0,0.03); border-radius: 4px; border: 1px solid rgba(0,0,0,0.05); text-align: left;">
					${componentLines}
				</div>
			`;
		}

		const minimalHtml = `
			<div class="sdx-minimal-damage-summary" style="margin-top: 8px; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px;">
				<div class="dice-roll sdx-expandable-roll" data-action="toggleDamageBreakdown" style="cursor: pointer; text-align: center;">
					<div class="dice-formula" style="font-size: 11px;">${formula}</div>
					<div class="dice-result">
						<div class="dice-total" style="background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.1); border-radius: 3px; padding: 4px 12px; font-weight: bold; font-size: 16px; display: inline-block;">
							Total: ${results}
						</div>
						${breakdownTooltipHtml}
					</div>
				</div>
			</div>
		`;

		const $chatCard = html.find('.chat-card');
		if ($chatCard.length) {
			$chatCard.append(minimalHtml);
		} else {
			html.find('.message-content').append(minimalHtml);
		}
	}

	// Mark message as fully processed now that damage card is injected

	// Check if this is a Focus Check (spell focus maintenance roll)
	// Focus Checks should roll damage but NOT auto-apply effects (effects are already applied)
	const focusCheckText = game.i18n.localize("SHADOWDARK.chat.spell_focus_check");
	const isFocusCheck = message.flavor?.includes(focusCheckText) ||
		message.flavor?.includes("Focus Check");

	if (isFocusCheck) {
	}

	// Auto-apply damage and/or conditions based on separate settings
	// Only auto-apply if there's an attack roll that hit
	// IMPORTANT: Only the message author should auto-apply to prevent duplicates
	const messageAuthorId = message.author?.id ?? message.user?.id;
	const shouldAutoApplyDamage = settings.damageCard.autoApplyDamage;
	// Default to true for backwards compatibility if setting doesn't exist yet
	const shouldAutoApplyConditions = settings.damageCard.autoApplyConditions !== false;

	// For self-targeting spells, allow auto-apply even without external targets
	const effectsApplyToTargetAuto = spellDamageConfig?.effectsApplyToTarget === true;
	const hasSelfTargetAuto = !effectsApplyToTargetAuto && actor;
	const hasValidTargets = targets.length > 0 || hasSelfTargetAuto;
	if ((shouldAutoApplyDamage || shouldAutoApplyConditions) && hasValidTargets && messageAuthorId === game.user.id) {
		// Check if this was an attack that hit
		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;


		// Check for already applied flag (persistently) or in-memory (for immediate re-renders)
		const alreadyApplied = message.getFlag(MODULE_ID, "autoApplied") || _autoAppliedMessages.has(message.id);

		// Only auto-apply if:
		// 1. There's no main roll at all (pure damage roll with no attack), OR
		// 2. The main roll exists AND success is explicitly true
		// AND 3. No aura was just created/processed to avoid double-application
		// AND 4. Has not already been applied
		const shouldAutoApply = (!mainRoll || mainRoll.success === true) && !auraCreatedThisCall && !alreadyApplied;

		if (shouldAutoApply) {
			// Mark as applied immediately to prevent race conditions
			_autoAppliedMessages.add(message.id);
			// Persist the flag (async, but in-memory set handles the gap)
			message.setFlag(MODULE_ID, "autoApplied", true);
			// Wait a tiny bit for the card to fully render, then auto-click the apply button(s)
			setTimeout(() => {
				// Auto-apply damage if enabled
				if (shouldAutoApplyDamage) {
					const $applyDamageBtn = html.find('.sdx-apply-damage-btn');
					if ($applyDamageBtn.length) {
						$applyDamageBtn.click();
					}
				}

				// Auto-apply conditions if enabled - BUT NOT for Focus Checks
				// Effects are already applied on the initial cast
				if (shouldAutoApplyConditions && !isFocusCheck) {
					const $applyConditionBtn = html.find('.sdx-apply-condition-btn');
					if ($applyConditionBtn.length) {
						setTimeout(() => {
							$applyConditionBtn.click();
						}, 200); // Slight delay after damage
					}
				} else if (isFocusCheck) {
				}
			}, 100);
		} else {
		}
	} else if ((shouldAutoApplyDamage || shouldAutoApplyConditions) && messageAuthorId !== game.user.id) {
	}

	// Add event listener for minimal summary toggle
	html.find('[data-action="toggleDamageBreakdown"]').on('click', (event) => {
		event.preventDefault();
		const $target = $(event.currentTarget);
		const $tooltip = $target.find('.sdx-damage-tooltip');
		$target.toggleClass('expanded');
		$tooltip.slideToggle(150);
	});

	// Start duration spell tracking if enabled
	// Only start if this is a spell with trackDuration enabled and cast was successful
	// AND we haven't already started it (e.g. for an aura)
	// AND it's NOT a focus spell (focus spells use focus tracker, not duration tracker)
	const isFocusSpell = item?.system?.duration?.type === "focus";
	if (item && ["Spell", "Scroll", "Wand", "NPC Spell"].includes(item.type) &&
		spellDamageConfig?.trackDuration &&
		!isFocusCheck &&
		!isFocusSpell &&
		messageAuthorId === game.user.id &&
		!message.getFlag(MODULE_ID, "durationTrackerStarted")) {

		const shadowdarkRolls = message.flags?.shadowdark?.rolls;
		const mainRoll = shadowdarkRolls?.main;
		const castSuccessful = !mainRoll || mainRoll.success === true;

		if (castSuccessful) {
			// Create a unique key for this message's duration tracking
			const durationKey = `${message.id}-duration`;

			// Skip if already processed (in-memory check is synchronous and reliable)
			if (_durationStartedMessages.has(durationKey)) {
				return; // Already started tracking for this message
			}

			// Mark as processing immediately (before async operations)
			_durationStartedMessages.add(durationKey);

			try {
				// Get target token IDs for tracking
				let targetTokenIds = targets.map(t => t.id);

				// For "Self" range spells, if no targets are selected, use the caster's token
				// Range can be either a string directly (e.g., "self") or an object with a value property
				const durationRawRange = item.system?.range;
				const durationSpellRange = (typeof durationRawRange === 'string' ? durationRawRange : durationRawRange?.value || "").toLowerCase();
				if (targetTokenIds.length === 0 && durationSpellRange === "self") {
					const casterTokenId = message.speaker?.token;
					if (casterTokenId) {
						targetTokenIds = [casterTokenId];
					} else {
						// Fallback: find first token for this actor on the current scene
						const casterToken = canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);
						if (casterToken) {
							targetTokenIds = [casterToken.id];
						}
					}
				}

				// Prepare spell config for duration tracking
				const durationConfig = {
					perTurnTrigger: spellDamageConfig.perTurnTrigger || "start",
					perTurnDamage: spellDamageConfig.perTurnDamage || "",
					reapplyEffects: spellDamageConfig.reapplyEffects || false,
					damageType: spellDamageConfig.damageType || "",
					effects: spellDamageConfig.effects || [],
					templateId: window._lastPlacedTemplateId || null
				};

				// Clear the temp variable
				window._lastPlacedTemplateId = null;

				await startDurationSpell(actor, item, targetTokenIds, durationConfig);

				// Also mark message with flag for persistence (backup check)
				await message.setFlag(MODULE_ID, "durationTrackerStarted", true);
			} catch (durationError) {
				console.warn("shadowdark-extras | Failed to start duration spell tracking:", durationError);
			}
		}
	}

	// Link targets to focus spells if no effects are being applied
	// This ensures focus spells with only damage/healing (like Regenerate) show targets in the tracker
	if (isFocusSpell && targets.length > 0 && allEffects.length === 0 && !isFocusCheck) {
		const spellId = item.id;
		const casterActor = actor;

		// Link each target to the focus spell
		for (const target of targets) {
			const targetActor = target.actor;
			const targetTokenId = target.id;

			if (targetActor) {
				await linkTargetToFocusSpell(casterActor.id, spellId, targetActor.id, targetTokenId);
			}
		}
	}

}

/**
 * Build roll breakdown information from message
 * Returns an object with formula, total, diceHtml, and bonusHtml
 */
async function buildRollBreakdown(message, weaponBonusDamage = null, isCritical = false, baseDamageType = 'standard') {
	// Try to get the damage roll from Shadowdark's rolls
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const damageRollData = shadowdarkRolls?.damage?.roll;

	// Also check standard message rolls
	const messageRoll = message.rolls?.[0];

	// Also check for synced spell roll in flags
	const syncedSpellResults = message.getFlag(MODULE_ID, "spellDamageResults");
	let spellRollFromFlag = null;
	const sRollData = syncedSpellResults?.rollJSON || syncedSpellResults?.rollData;
	if (sRollData) {
		try {
			spellRollFromFlag = (typeof sRollData === "string") ? Roll.fromJSON(sRollData) : Roll.fromData(sRollData);
		} catch (e) {
			console.error("shadowdark-extras | Error parsing roll from flag:", e);
		}
	}

	// Also check for stored spell roll
	const spellRoll = window._lastSpellRoll;

	// Use whichever roll we can find (prioritize synced flag, then Shadowdark rolls, then window global)
	const roll = spellRollFromFlag || damageRollData || messageRoll || spellRoll;

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
				label: `Crit(${weaponBonusDamage.criticalFormula})`,
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
			html: `<span class="sdx-bonus-val" title="${bonus.label || ''}">${absValue}</span>`,
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
			if (part.value < 0) return `<span class="sdx-plus"> - </span> ${part.html} `;
			return `<span class="sdx-plus"> + </span> ${part.html} `;
		}).join('');

		breakdownHtml = `
							<div class="sdx-roll-breakdown-line">
				<span class="sdx-roll-total">${actualTotal}</span>
				<span class="sdx-equals"> = </span>
				${partsHtml}
			</div>
							`;
	}

	// Build full display formula
	let fullFormula = roll.formula || '';
	if (weaponBonusDamage && weaponBonusDamage.requirementsMet) {
		if (weaponBonusDamage.bonusFormula) {
			fullFormula += ` + ${weaponBonusDamage.bonusFormula}`;
		}
		if (weaponBonusDamage.criticalFormula && isCritical) {
			fullFormula += ` + ${weaponBonusDamage.criticalFormula}`;
		}
	}

	// Build components list for expandable tooltip
	const components = [];

	// Base damage component
	const isHealing = baseDamageType?.toLowerCase() === "healing";
	const baseLabel = isHealing
		? (game.i18n.localize("SHADOWDARK_EXTRAS.chat.base_healing") || "Base Healing")
		: (game.i18n.localize("SHADOWDARK_EXTRAS.chat.base_damage") || "Base Damage");

	components.push({
		formula: roll.formula || '',
		total: roll.total || 0,
		label: baseLabel,
		type: baseDamageType,
		dice: diceResults.map(d => d.value)
	});

	// Bonus components
	if (weaponBonusDamage?.damageComponents) {
		for (const comp of weaponBonusDamage.damageComponents) {
			components.push({
				formula: comp.formula,
				total: comp.amount,
				label: comp.label,
				type: comp.type
			});
		}
	}

	return {
		formula: fullFormula,
		total: actualTotal,
		breakdownHtml,
		components
	};
}

/**
 * Build the damage card HTML
 */
async function buildDamageCardHtml(actor, targets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage = null, isCritical = false, spellItem = null, casterTokenId = '', baseDamageType = 'standard', isMagicalWeapon = false) {


	const cardSettings = settings.damageCard;
	const isHealing = damageType?.toLowerCase() === "healing";

	// Build roll breakdown HTML
	let rollBreakdownHtml = '';
	const rollBreakdown = await buildRollBreakdown(message, weaponBonusDamage, isCritical, baseDamageType);
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
				criticalBonus: weaponBonusDamage.criticalBonus || 0,
				damageComponents: weaponBonusDamage.damageComponents || []
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
		targetsHtml = '<div class="sdx-damage-targets">';

		for (const target of targets) {
			try {
				const targetActor = target.actor;
				if (!targetActor) {
					console.warn("shadowdark-extras | Target has no actor:", target);
					continue;
				}


				const hp = targetActor.system?.attributes?.hp;
				const currentHp = hp?.value ?? 0;
				const maxHp = hp?.max ?? 0;


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

				// Add enable/disable checkbox if auto-apply is disabled
				const enableCheckbox = !cardSettings.autoApplyDamage ? `
							<input type="checkbox" class="sdx-target-enable-checkbox" data-token-id="${target.id}" checked title="Enable/disable this target" />
								` : '';

				targetsHtml += `
								<div class="sdx-target-item" data-token-id="${target.id}" data-actor-id="${targetActor.id}" data-enabled="true">
									${enableCheckbox}
						<div class="sdx-target-header">
							<img src="${targetActor.img}" alt="${targetActor.name}" class="sdx-target-img" />
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
	// For self-targeting effects, show button even without targets (caster is the target)
	const effectsApplyToTarget = spellDamageConfig?.effectsApplyToTarget === true;
	const hasSelfTarget = !effectsApplyToTarget && actor;
	if (allEffects && allEffects.length > 0 && (targets.length > 0 || hasSelfTarget)) {
		const effectsJson = JSON.stringify(allEffects);
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
						<div class="sdx-damage-card" data-message-id="${message.id}" data-caster-actor-id="${actor?.id || ''}" data-caster-token-id="${casterTokenId}" data-base-damage="${totalDamage}" data-damage-type="${damageType}" data-base-damage-type="${baseDamageType}" data-is-magical-weapon="${isMagicalWeapon}">
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
		</div >
						`;


	return finalHtml;
}

/**
 * Build multipliers HTML for a target
 */
function buildMultipliersHtml(multipliers, tokenId) {

	let html = '<div class="sdx-multipliers" data-token-id="' + tokenId + '">';

	// Convert multipliers to array if it's an object
	const multipliersArray = Array.isArray(multipliers) ? multipliers : Object.values(multipliers);


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
		} else {
			// Fallback to current user's targets
			targets = Array.from(game.user.targets);
		}
		tabName = 'TARGETED';
	} else if (activeTabIndex === 1) {
		targets = canvas.tokens.controlled.filter(t => t.actor);
		tabName = 'SELECTED';
	}


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

		// Add enable/disable checkbox if auto-apply is disabled
		const enableCheckbox = !cardSettings.autoApplyDamage ? `
						<input type="checkbox" class="sdx-target-enable-checkbox" data-token-id="${tokenId}" checked title="Enable/disable this target" />
							` : '';

		targetsHtml += `
							<div class="sdx-target-item" data-token-id="${tokenId}" data-actor-id="${actorId}" data-enabled="true">
								${enableCheckbox}
					<div class="sdx-target-header">
						<img src="${img}" alt="${name}" class="sdx-target-img" />
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

	// Preserve existing Apply Condition button data before rebuilding
	const $existingConditionBtn = $card.find('.sdx-apply-condition-btn');
	let conditionButtonHtml = '';
	if ($existingConditionBtn.length > 0) {
		// Recreate the condition button with same attributes
		const effectsData = $existingConditionBtn.attr('data-effects') || '';
		const applyToTarget = $existingConditionBtn.attr('data-apply-to-target') || 'true';
		const effectsRequirement = $existingConditionBtn.attr('data-effects-requirement') || '';
		const spellInfoData = $existingConditionBtn.attr('data-spell-info') || '';
		const effectSelectionMode = $existingConditionBtn.attr('data-effect-selection-mode') || 'all';

		conditionButtonHtml = `
			<button type="button" class="sdx-apply-condition-btn"
				data-effects='${effectsData}'
				data-apply-to-target="${applyToTarget}"
				data-effects-requirement="${effectsRequirement}"
				data-spell-info="${spellInfoData}"
				data-effect-selection-mode="${effectSelectionMode}">
				<i class="fas fa-wand-sparkles"></i> APPLY EFFECTS
			</button>`;
	}

	// Build apply button with appropriate text for damage type
	const baseDamageValue = parseInt($card.data('base-damage')) || baseDamage;
	const buttonText = isHealing ? 'APPLY HEALING' : 'APPLY DAMAGE';
	const buttonIcon = isHealing ? 'fa-heart-pulse' : 'fa-hand-sparkles';
	// Only show damage button if there's actual damage to apply
	const applyDamageButtonHtml = cardSettings.showApplyButton && baseDamageValue > 0 ?
		`<button type="button" class="sdx-apply-damage-btn" data-damage-type="${damageType}"><i class="fas ${buttonIcon}"></i> ${buttonText}</button>` : '';

	// Combine buttons in a wrapper if any exist
	let buttonsHtml = '';
	if (applyDamageButtonHtml || conditionButtonHtml) {
		buttonsHtml = '<div class="sdx-damage-actions">' + applyDamageButtonHtml + conditionButtonHtml + '</div>';
	}

	// Replace the content
	$card.find('.sdx-damage-card-content').html(targetsHtml + buttonsHtml);

	// Re-attach listeners for new elements
	attachMultiplierListeners($card);
	attachTargetEnableListeners($card);
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

		// Get the original damage type to determine proper +/- display
		const originalDamageType = $card.data('original-damage-type') || $card.data('damage-type');
		const isOriginallyHealing = (originalDamageType || '').toLowerCase() === 'healing';

		// Determine the correct +/- sign based on:
		// - For healing spells: positive newDamage = + (healing), negative = - (damage)
		// - For damage spells: positive newDamage = - (damage), negative = + (healing) 
		const $preview = $targetItem.find('.sdx-damage-preview');
		let previewSign;

		if (newDamage === 0) {
			previewSign = '';
		} else if (isOriginallyHealing) {
			// Healing spell: positive = +, negative = -
			previewSign = newDamage > 0 ? '+' : '-';
		} else {
			// Damage spell: positive = -, negative = +
			previewSign = newDamage > 0 ? '-' : '+';
		}

		$preview.html(previewSign + '<span class="sdx-damage-value" data-base-damage="' + baseDamage + '">' + Math.abs(newDamage) + '</span>');

		$targetItem.data('calculated-damage', newDamage);
		// Update card damage type and button text based on whether damage is healing or damaging
		// This handles cases where multipliers flip the damage sign
		const $applyBtn = $card.find('.sdx-apply-damage-btn');

		// Store original damage type on first load (use the originalDamageType variable)
		if (!$card.data('original-damage-type')) {
			$card.data('original-damage-type', originalDamageType);
		}

		// Determine effective type based on multiplier (isOriginallyHealing already defined above)
		// For healing spells: positive multiplier = healing, negative = damage
		// For damage spells: positive multiplier = damage, negative = healing
		let effectiveDamageType;
		let finalCalculatedDamage;

		if (isOriginallyHealing) {
			if (newDamage >= 0) {
				// Positive on healing spell = healing
				effectiveDamageType = 'Healing';
				finalCalculatedDamage = newDamage;
			} else {
				// Negative on healing spell = damage (flip the sign for damage application)
				effectiveDamageType = 'damage';
				finalCalculatedDamage = Math.abs(newDamage);
			}
		} else {
			if (newDamage >= 0) {
				// Positive on damage spell = damage
				effectiveDamageType = 'damage';
				finalCalculatedDamage = newDamage;
			} else {
				// Negative on damage spell = healing (flip the sign for healing application)
				effectiveDamageType = 'Healing';
				finalCalculatedDamage = Math.abs(newDamage);
			}
		}

		// Store the final calculated damage (always positive, type determines heal vs damage)
		$targetItem.data('calculated-damage', finalCalculatedDamage);

		// Update card damage type
		$card.data('damage-type', effectiveDamageType);

		// Update button text and icon
		const isHealing = effectiveDamageType.toLowerCase() === 'healing';
		const buttonText = isHealing ? 'APPLY HEALING' : 'APPLY DAMAGE';
		const buttonIcon = isHealing ? 'fa-heart-pulse' : 'fa-hand-sparkles';
		$applyBtn.html(`<i class="fas ${buttonIcon}"></i> ${buttonText}`);
	});
}

/**
 * Attach target enable/disable checkbox listeners
 */
function attachTargetEnableListeners($card) {
	$card.find('.sdx-target-enable-checkbox').off('change').on('change', function (e) {
		e.stopPropagation();

		const $checkbox = $(this);
		const tokenId = $checkbox.data('token-id');
		const isEnabled = $checkbox.is(':checked');

		// Update target item's enabled state
		const $targetItem = $card.find(`.sdx-target-item[data-token-id="${tokenId}"]`);
		$targetItem.attr('data-enabled', isEnabled);
		$targetItem.data('enabled', isEnabled);

		// Visual feedback - gray out disabled targets
		if (isEnabled) {
			$targetItem.removeClass('sdx-target-disabled');
		} else {
			$targetItem.addClass('sdx-target-disabled');
		}

	});
}

/**
 * Spawn summoned creatures automatically when a spell is cast
 * @param {boolean} isCriticalSuccess - If true, duration will be doubled
 */
async function spawnSummonedCreatures(casterActor, item, profiles, summoningConfig = {}, isCriticalSuccess = false) {

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


		// Create Portal instance and set origin
		const portal = new Portal();
		portal.origin(casterToken);

		// Add each creature profile
		for (const profile of profiles) {

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
						flavor: `Summoning ${profile.displayName || profile.creatureName || 'creatures'} `,
						speaker: ChatMessage.getSpeaker({ actor: casterActor })
					});
				} catch (err) {
					console.warn("shadowdark-extras | Invalid count formula, using 1:", countFormula, err);
					count = 1;
				}
			} else {
				count = parseInt(countFormula) || 1;
			}


			// Add the creature to the portal (Portal expects just the UUID/name and count)
			portal.addCreature(profile.creatureUuid, { count });
		}

		// Spawn directly - this will show placement UI and spawn the creatures
		const creatures = await portal.spawn();

		// Check if creatures were spawned
		if (creatures && creatures.length > 0) {
			// Grant ownership to the caster
			const tokenUpdates = creatures.map(token => {
				const update = {
					_id: token.id,
					[`ownership.${game.user.id} `]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
				};

				// For unlinked tokens, also update the actor ownership in actorData
				if (!token.actorLink) {
					update[`actorData.ownership.${game.user.id} `] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
				}

				return update;
			});

			await canvas.scene.updateEmbeddedDocuments("Token", tokenUpdates);

			// Track tokens for expiry if deleteAtExpiry is enabled
			if (summoningConfig.deleteAtExpiry && game.combat) {
				const duration = item?.system?.duration;
				const durationType = duration?.type; // e.g., "rounds", "turns", "minutes", etc.
				let durationValue = parseInt(duration?.value) || 0;

				// Double duration on critical success
				if (isCriticalSuccess && durationValue > 0) {
					durationValue = durationValue * 2;
				}

				if ((durationType === 'rounds' || durationType === 'turns') && durationValue > 0) {
					const currentRound = game.combat.round || 1;
					const expiryRound = currentRound + durationValue;

					const sceneId = canvas.scene.id;
					const tokenIds = creatures.map(t => t.id);

					// Use the helper function for persistent storage
					await trackSummonedTokensForExpiry(sceneId, tokenIds, expiryRound, item?.name || 'Unknown Spell');

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
					flavor: `Item giver: ${profile.itemName || item.name || 'Item'} `,
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
				console.warn(`shadowdark - extras | Skipping item give for invalid source: ${profile.itemName} `);
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
		const itemSummaries = createdItems.map(createdItem => `${createdItem.name} x${createdItem.system?.quantity || 1} `);
		ui.notifications.info(`Granted ${itemSummaries.join(', ')} to ${casterActor.name} `);
	} catch (err) {
		console.error("shadowdark-extras | Failed to add items to caster:", err);
		ui.notifications.error("Failed to grant items to caster: " + err.message);
	}
}

/**
 * Apply coating poison to a weapon from a potion
 * Shows a dialog to select a weapon, then adds poison damage bonus to it
 * @param {Actor} casterActor - The actor who used the potion
 * @param {Actor} targetActor - The actor whose weapon will be coated (may be same as caster)
 * @param {object} config - The coating poison configuration
 * @param {string} potionName - Name of the potion for display purposes
 */
async function applyCoatingPoison(casterActor, targetActor, config, potionName) {
	if (!targetActor) {
		ui.notifications.warn("No target found for coating poison!");
		return;
	}

	// Get all weapons from target actor
	const weapons = targetActor.items.filter(item => item.type === "Weapon");
	if (weapons.length === 0) {
		ui.notifications.warn(`${targetActor.name} has no weapons to coat!`);
		return;
	}

	// Filter out weapons that already have active poison damage bonuses (usage > 0 or no usage = permanent)
	// Allow weapons with depleted poison (usage === 0) to be coated again
	const availableWeapons = weapons.filter(weapon => {
		const currentBonus = weapon.getFlag(MODULE_ID, "weaponBonus");
		const hasActivePoisonBonus = currentBonus?.damageBonuses?.some(b =>
			b.damageType?.toLowerCase() === "poison" && b.usage !== 0
		);
		return !hasActivePoisonBonus;
	});

	if (availableWeapons.length === 0) {
		ui.notifications.warn(`${targetActor.name} has no weapons available for poison coating (all already have poison damage)!`);
		return;
	}

	// Build the damage formula based on config
	let damageFormula = "";
	const casterLevel = casterActor?.system?.level?.value || 1;

	if (config.formulaType === "basic") {
		const numDice = config.numDice || 1;
		const dieType = config.dieType || "d6";
		const bonus = config.bonus || 0;
		damageFormula = `${numDice}${dieType}`;
		if (bonus !== 0) {
			damageFormula += bonus > 0 ? `+${bonus}` : `${bonus}`;
		}
	} else if (config.formulaType === "formula") {
		damageFormula = config.formula || "1d6";
		// Replace level placeholder with actual level
		damageFormula = damageFormula.replace(/@level/gi, casterLevel);
	} else if (config.formulaType === "tiered") {
		// Parse tiered formula like "1-3:1d4, 4-6:1d6, 7+:1d8"
		const tieredFormula = config.tieredFormula || "1+:1d6";
		damageFormula = parseTieredFormula(tieredFormula, casterLevel) || "1d6";
	}

	// Get usage from config (null/undefined = permanent)
	const poisonUsage = config.usage !== undefined && config.usage !== null && config.usage !== ""
		? parseInt(config.usage, 10)
		: null;
	const usageText = poisonUsage !== null ? `${poisonUsage} uses` : "permanently";

	// Build weapon selection dropdown
	const weaponChoices = availableWeapons.map(w =>
		`<option value="${w.id}">${w.name}</option>`
	).join('');

	new Dialog({
		title: `${potionName} - Coat Weapon`,
		content: `
			<form>
				<div class="form-group">
					<label>Choose a weapon to coat with poison:</label>
					<select name="weaponId" style="width: 100%; margin-top: 5px;">${weaponChoices}</select>
				</div>
				<p style="margin-top: 10px; font-style: italic; font-size: 0.9em;">
					The weapon will deal +${damageFormula} poison damage (${usageText}).
				</p>
			</form>
		`,
		buttons: {
			coat: {
				icon: '<i class="fas fa-skull-crossbones"></i>',
				label: "Coat Weapon",
				callback: async (html) => {
					const weaponId = html.find('[name="weaponId"]').val();
					const weapon = targetActor.items.get(weaponId);
					if (!weapon) {
						ui.notifications.error("Weapon not found!");
						return;
					}

					// Get existing weapon bonus or create new structure
					const existingBonus = weapon.getFlag(MODULE_ID, "weaponBonus") || {};

					// Create the poison coating bonus
					const poisonCoatingBonus = {
						enabled: true,
						hitBonuses: existingBonus.hitBonuses || [],
						damageBonuses: [
							...(existingBonus.damageBonuses || []),
							{
								formula: damageFormula,
								label: potionName,
								damageType: "poison",
								exclusive: false,
								prompt: false,
								requirements: [],
								usage: poisonUsage
							}
						],
						damageBonus: existingBonus.damageBonus || "",
						criticalExtraDice: existingBonus.criticalExtraDice || "",
						criticalExtraDamage: existingBonus.criticalExtraDamage || "",
						requirements: existingBonus.requirements || [],
						effects: existingBonus.effects || [],
						itemMacro: existingBonus.itemMacro || { enabled: false, runAsGm: false, triggers: [] }
					};

					// Update the weapon with the poison coating
					await weapon.setFlag(MODULE_ID, "weaponBonus", poisonCoatingBonus);

					ui.notifications.info(`${weapon.name} is now coated with poison (+${damageFormula}, ${usageText})!`);
					ChatMessage.create({
						speaker: ChatMessage.getSpeaker({ actor: casterActor }),
						content: `<div class="shadowdark chat-card">
							<h3><i class="fas fa-skull-crossbones"></i> Poison Coating</h3>
							<p><strong>${casterActor?.name || "Someone"}</strong> coats <strong>${targetActor.name}'s ${weapon.name}</strong> with poison!</p>
							<p><em>The weapon now deals +${damageFormula} poison damage (${usageText}).</em></p>
						</div>`
					});
				}
			},
			cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
		},
		default: "coat"
	}).render(true);
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

	// Initial target enable/disable listeners
	attachTargetEnableListeners($card);

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


		// Roll a single die
		const roll = new Roll(`1d${faces} `);
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
				if (part.value < 0) return `<span class="sdx-plus"> - </span> ${part.html} `;
				return `<span class="sdx-plus"> + </span> ${part.html} `;
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

			const $targetItems = $card.find('.sdx-target-item');

			$targetItems.each(function () {
				const $targetItem = $(this);
				const $targetDamage = $targetItem.find('.sdx-damage-value');
				const $activeMultiplier = $targetItem.find('.sdx-multiplier-btn.active');
				const multiplier = parseFloat($activeMultiplier.data('multiplier')) || 1;
				const newDamage = Math.floor(totalDamage * multiplier);


				$targetDamage.text(newDamage);
				$targetDamage.attr('data-base-damage', newDamage);
			});

			// Show notification
			ui.notifications.info(`Rerolled damage: ${totalDamage} `);

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
			return;
		}

		$btn.data('applying', true);
		$btn.prop('disabled', true);


		try {
			const $targets = $card.find('.sdx-target-item');

			const damageType = $card.data('damage-type') || 'damage';
			const isHealing = damageType?.toLowerCase() === 'healing';

			let appliedCount = 0;

			for (const targetEl of $targets) {
				const $target = $(targetEl);

				// Skip disabled targets
				const isEnabled = $target.data('enabled') !== false && $target.attr('data-enabled') !== 'false';
				if (!isEnabled) {
					continue;
				}

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
							if (reqInfo.failAction === 'half') {
								calculatedDamage = Math.floor(calculatedDamage / 2);
							} else {
								calculatedDamage = 0;
							}
						} else {
						}
					} catch (err) {
						console.warn(`shadowdark - extras | Failed to evaluate requirement for target ${tokenId}: `, err);
					}
				}


				// Socket handler expects negative values for healing
				// Make damage negative if this is healing
				const finalDamageForSocket = isHealing ? -Math.abs(calculatedDamage) : calculatedDamage;

				if (calculatedDamage === 0) {
					continue;
				}

				// Use socketlib to apply damage via GM
				if (socketlibSocket) {
					try {
						const damageType = $card.data('damage-type') || 'damage';
						const baseDamage = parseInt($card.data('base-damage')) || 0;

						// Get damage components from weapon bonus data if available
						let damageComponents = [];
						const $rerollBtn = $card.find('.sdx-reroll-btn');
						if ($rerollBtn.length) {
							const weaponBonusAttr = $rerollBtn.attr('data-weapon-bonus');
							if (weaponBonusAttr) {
								try {
									const weaponBonusData = JSON.parse(weaponBonusAttr.replace(/&quot;/g, '"'));
									damageComponents = weaponBonusData.damageComponents || [];
								} catch (e) {
									console.warn("shadowdark-extras | Failed to parse weapon bonus data:", e);
								}
							}
						}

						// Calculate base damage (total minus bonus components)
						const totalBonusDamage = damageComponents.reduce((sum, c) => sum + (c.amount || 0), 0);
						const weaponBaseDamage = Math.max(0, calculatedDamage - totalBonusDamage);

						// Get base damage type from card data (set by weapon flags)
						const baseDamageType = $card.data('base-damage-type') || damageType || 'standard';

						// Check if this is a magical weapon attack
						const isMagicalWeapon = $card.data('is-magical-weapon') === true || $card.data('is-magical-weapon') === 'true';

						const success = await socketlibSocket.executeAsGM("applyTokenDamage", {
							tokenId: tokenId,
							damage: finalDamageForSocket,
							damageType: damageType,
							damageComponents: damageComponents,
							baseDamage: weaponBaseDamage,
							baseDamageType: baseDamageType,
							isMagicalWeapon: isMagicalWeapon
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

				// Decrement weapon bonus usage for bonuses that have limited uses
				try {
					const messageId = $card.data('message-id');
					if (messageId) {
						const message = game.messages.get(messageId);
						const weaponBonusResults = message?.getFlag(MODULE_ID, "weaponBonusResults");
						if (weaponBonusResults?.appliedBonusIndicesWithUsage?.length > 0 &&
							weaponBonusResults.weaponItemId && weaponBonusResults.actorId) {
							const ownerActor = game.actors.get(weaponBonusResults.actorId);
							const weaponItem = ownerActor?.items.get(weaponBonusResults.weaponItemId);
							if (weaponItem) {
								await decrementDamageBonusUsage(weaponItem, weaponBonusResults.appliedBonusIndicesWithUsage);
							}
						}
					}
				} catch (decrementError) {
					console.warn("shadowdark-extras | Failed to decrement weapon bonus usage:", decrementError);
				}
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
			return;
		}

		$btn.data('applying', true);
		$btn.prop('disabled', true);


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


			if (effects.length === 0) {
				ui.notifications.warn("No conditions to apply");
				$btn.prop('disabled', false);
				$btn.data('applying', false);
				return;
			}

			// Handle 'prompt' selection mode - show dialog to select effects
			const effectSelectionMode = $btn.data('effect-selection-mode') || 'all';
			if (effectSelectionMode === 'prompt' && effects.length > 1) {

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
					$btn.prop('disabled', false);
					$btn.data('applying', false);
					return;
				}

				// Replace effects with user selection
				effects = selectedEffects;
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
			}
			// Fallback to finding by actor ID if token ID not available
			if (!casterToken && casterActor) {
				casterToken = canvas.tokens.placeables.find(t => t.actor?.id === casterActorId);
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
				// Tab override: If there are targets shown in the current tab, use those
				// regardless of the effectApplyToTarget setting. This allows users to
				// manually apply self-effects to other tokens via Selected/Targeted tabs.
				let effectTargets = [];
				if (cardTargets.length > 0) {
					// Use targets from the current tab (override)
					effectTargets = cardTargets;
				} else if (effectApplyToTarget) {
					// No targets in tab, but configured to apply to target - keep empty (will show warning)
					effectTargets = [];
				} else {
					// No targets in tab and configured for self - apply to caster
					if (casterToken) effectTargets = [casterToken];
				}

				if (effectTargets.length === 0) {
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
								skippedCount++;
								continue; // Skip this target
							} else {
							}
						} catch (err) {
							console.warn(`shadowdark - extras | Failed to evaluate effects requirement for target ${target.id}: `, err);
							// On error, assume requirement is met (fail-open)
						}
					}


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
			return;
		}

		$btn.data('summoning', true);
		$btn.prop('disabled', true);


		try {
			const profilesJson = $btn.data('profiles');
			let profiles = [];
			if (typeof profilesJson === 'string') {
				profiles = JSON.parse(profilesJson);
			} else if (Array.isArray(profilesJson)) {
				profiles = profilesJson;
			}


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