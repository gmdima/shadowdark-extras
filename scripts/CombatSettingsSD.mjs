/**
 * Combat Settings for Shadowdark Extras
 * Adds enhanced damage card features similar to midi-qol
 */

import { getWeaponBonuses, getWeaponEffectsToApply, evaluateRequirements, calculateWeaponBonusDamage } from "./WeaponBonusConfig.mjs";

const MODULE_ID = "shadowdark-extras";
let socketlibSocket = null;

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
            
            return true;
        } catch (error) {
            console.error("shadowdark-extras | Error in socket damage handler:", error);
            return false;
        }
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
                duration: data.duration
            });
            
            // Get the effect document from UUID
            const effectDoc = await fromUuid(data.effectUuid);
            if (!effectDoc) {
                console.warn("shadowdark-extras | Effect not found:", data.effectUuid);
                return false;
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
            
            await token.actor.createEmbeddedDocuments("Item", [effectData]);
            console.log("shadowdark-extras | Applied effect item:", effectDoc.name, "to", token.actor.name);
            
            return true;
        } catch (error) {
            console.error("shadowdark-extras | Error in socket condition handler:", error);
            return false;
        }
    });
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
}

// Track which messages have already spawned creatures (in-memory cache)
const _spawnedMessages = new Set();
const _itemGiveMessages = new Set();

// Track messages that have already had damage cards injected to prevent duplicates
const _damageCardInjected = new Set();

/**
 * Inject damage card into chat messages
 */
export async function injectDamageCard(message, html, data) {
	console.log("shadowdark-extras | injectDamageCard called", { message, html, data });
	
	// Prevent duplicate injection for the same message
	const messageKey = message.id;
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
			
			// Automatically spawn creatures when spell is cast
			await spawnSummonedCreatures(casterActor, item, profiles);
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
	
	if ((isSpellWithDamage || isSpellWithEffects) && casterActor) {
		// Use the actor who owns the spell item (the caster)
		actor = casterActor;
		console.log("shadowdark-extras | Using spell caster actor:", actor.name);
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
	
	if (storedTargetIds && storedTargetIds.length > 0) {
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
						rollData.target = {};
						
						// Flatten target level
						if (targetRollData.level && typeof targetRollData.level === 'object' && targetRollData.level.value !== undefined) {
							rollData.target.level = targetRollData.level.value;
						} else {
							rollData.target.level = targetRollData.level || 0;
						}
						
						// Add target ability modifiers
						if (targetRollData.abilities) {
							['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
								if (targetRollData.abilities[ability]?.mod !== undefined) {
									rollData.target[ability] = targetRollData.abilities[ability].mod;
								}
								if (targetRollData.abilities[ability]?.base !== undefined) {
									rollData.target[ability + 'Base'] = targetRollData.abilities[ability].base;
								}
							});
						}
						
						// Add target stats
						if (targetRollData.attributes?.ac?.value !== undefined) rollData.target.ac = targetRollData.attributes.ac.value;
						if (targetRollData.attributes?.hp?.value !== undefined) rollData.target.hp = targetRollData.attributes.hp.value;
						
						// Check for tiered formula and resolve it for this target's level
						let targetFormula = formula;
						if (hasTieredFormula) {
							const tieredResult = parseTieredFormula(tieredFormula, rollData.target.level);
							if (tieredResult) {
								targetFormula = tieredResult;
								console.log(`%c║ Using tiered formula for level ${rollData.target.level}: ${targetFormula}`, 'color: #00BCD4; font-weight: bold;');
							}
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
	
	// Check if weapon has effects to apply (from weapon bonus config)
	let weaponEffects = [];
	let weaponBonusDamage = null;
	if (item?.type === "Weapon") {
		const weaponBonusFlags = item.flags?.[MODULE_ID]?.weaponBonus;
		if (weaponBonusFlags?.enabled) {
			// Get target for requirement evaluation
			const targetToken = targets[0];
			const targetActor = targetToken?.actor;
			
			// Check if this was a critical hit
			const shadowdarkRolls = message.flags?.shadowdark?.rolls;
			const mainRoll = shadowdarkRolls?.main;
			const isCritical = mainRoll?.critical === "success";
			
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
	const cardHtml = buildDamageCardHtml(actor, cardTargets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage);
	
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
				
				// Also auto-apply conditions if they exist
				const $applyConditionBtn = html.find('.sdx-apply-condition-btn');
				if ($applyConditionBtn.length) {
					setTimeout(() => {
						$applyConditionBtn.click();
					}, 200); // Slight delay after damage
				}
			}, 100);
		} else {
			console.log("shadowdark-extras | Not auto-applying damage (attack failed, success:", mainRoll?.success, ")");
		}
	} else if (settings.damageCard.autoApplyDamage && messageAuthorId !== game.user.id) {
		console.log("shadowdark-extras | Skipping auto-apply (not message author)");
	}
	
	// Mark this message as having had its damage card injected
	_damageCardInjected.add(messageKey);
	
	console.log("shadowdark-extras | Damage card injected successfully");
}

/**
 * Build roll breakdown information from message
 * Returns an object with formula, total, diceHtml, and bonusHtml
 */
function buildRollBreakdown(message, weaponBonusDamage = null) {
	// Try to get the damage roll from Shadowdark's rolls
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const damageRollData = shadowdarkRolls?.damage?.roll;
	
	// Also check standard message rolls
	const messageRoll = message.rolls?.[0];
	
	// Use whichever roll we can find
	const roll = damageRollData || messageRoll;
	
	if (!roll) {
		// Check for spell roll breakdown stored in window
		if (window._lastSpellRollBreakdown && !window._perTargetDamage) {
			return {
				formula: window._lastSpellRollBreakdown.split(' = ')[0] || '',
				total: window._lastSpellRollBreakdown.split(' = ')[1] || '',
				diceHtml: '',
				bonusHtml: ''
			};
		}
		return null;
	}
	
	// Extract dice information
	let diceHtml = '';
	let totalDiceSum = 0;
	
	// Handle Foundry Roll object
	const dice = roll.dice || roll.terms?.filter(t => t.faces) || [];
	
	if (dice.length > 0) {
		const diceGroups = [];
		
		for (const die of dice) {
			const faces = die.faces;
			const results = die.results || [];
			const diceStr = results.map(r => {
				const val = r.result;
				const isCrit = val === faces;
				const isFumble = val === 1;
				const cssClass = isCrit ? 'sdx-die-max' : (isFumble ? 'sdx-die-min' : '');
				return `<span class="sdx-die ${cssClass}">${val}</span>`;
			}).join('');
			
			const sum = results.reduce((acc, r) => acc + r.result, 0);
			totalDiceSum += sum;
			
			diceGroups.push(`
				<div class="sdx-dice-group">
					<span class="sdx-dice-label">${results.length}d${faces}</span>
					<span class="sdx-dice-results">${diceStr}</span>
					<span class="sdx-dice-sum">= ${sum}</span>
				</div>
			`);
		}
		
		diceHtml = diceGroups.join('');
	}
	
	// Extract numeric modifiers/bonuses
	let bonusHtml = '';
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
	
	// Add weapon bonus if applicable
	if (weaponBonusDamage && weaponBonusDamage.requirementsMet) {
		if (weaponBonusDamage.totalBonus !== 0) {
			bonuses.push({
				label: `Bonus (${weaponBonusDamage.bonusFormula})`,
				value: weaponBonusDamage.totalBonus
			});
		}
		if (weaponBonusDamage.criticalBonus !== 0) {
			bonuses.push({
				label: `Crit (${weaponBonusDamage.criticalFormula})`,
				value: weaponBonusDamage.criticalBonus
			});
		}
	}
	
	if (bonuses.length > 0) {
		bonusHtml = bonuses.map(b => {
			const sign = b.value >= 0 ? '+' : '';
			return `<div class="sdx-bonus-item"><span class="sdx-bonus-label">${b.label}</span><span class="sdx-bonus-val">${sign}${b.value}</span></div>`;
		}).join('');
	}
	
	return {
		formula: roll.formula || '',
		total: roll.total || 0,
		diceHtml,
		bonusHtml
	};
}

/**
 * Build the damage card HTML
 */
function buildDamageCardHtml(actor, targets, totalDamage, damageType, allEffects, spellDamageConfig, settings, message, weaponBonusDamage = null) {
	console.log("shadowdark-extras | buildDamageCardHtml started", { actor, targets, totalDamage, damageType, allEffects, settings, weaponBonusDamage });
	
	const cardSettings = settings.damageCard;
	const isHealing = damageType?.toLowerCase() === "healing";
	
	// Build roll breakdown HTML
	let rollBreakdownHtml = '';
	const rollBreakdown = buildRollBreakdown(message, weaponBonusDamage);
	if (rollBreakdown) {
		rollBreakdownHtml = `
			<div class="sdx-roll-breakdown">
				<div class="sdx-roll-formula">${rollBreakdown.formula}</div>
				<div class="sdx-roll-result">
					<span class="sdx-roll-total">${rollBreakdown.total}</span>
				</div>
				${rollBreakdown.diceHtml ? `<div class="sdx-roll-dice">${rollBreakdown.diceHtml}</div>` : ''}
				${rollBreakdown.bonusHtml ? `<div class="sdx-roll-bonuses">${rollBreakdown.bonusHtml}</div>` : ''}
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
		
		// Start actions div if not already started
		if (!applyButtonHtml) {
			applyButtonHtml = '<div class="sdx-damage-actions">';
		}
		
		applyButtonHtml += `
			<button type="button" class="sdx-apply-condition-btn" 
			        data-effects='${effectsJson}' 
			        data-apply-to-target="${effectsApplyToTarget}"
			        data-effects-requirement="${effectsRequirement.replace(/"/g, '&quot;')}">
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
		<div class="sdx-damage-card" data-message-id="${message.id}" data-caster-actor-id="${actor?.id || ''}" data-base-damage="${totalDamage}" data-damage-type="${damageType}">
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
	$card.find('.sdx-multiplier-btn').off('click').on('click', function(e) {
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
 */
async function spawnSummonedCreatures(casterActor, item, profiles) {
	console.log("shadowdark-extras | Spawning summoned creatures");
	
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
	$card.find('.sdx-damage-card-header').on('click', function(e) {
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
	$card.find('.sdx-tab').on('click', function(e) {
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
	
	// Apply damage button click (use delegation since button may be rebuilt)
		// Apply damage button click (use delegation since button may be rebuilt)
		$card.on('click', '.sdx-apply-damage-btn', async function(e) {
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
							targetRollData.target = {};
							
							// Flatten target level
							if (targetActorData.level && typeof targetActorData.level === 'object' && targetActorData.level.value !== undefined) {
								targetRollData.target.level = targetActorData.level.value;
							} else {
								targetRollData.target.level = targetActorData.level || 0;
							}
							
							// Add target ability modifiers
							if (targetActorData.abilities) {
								['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
									if (targetActorData.abilities[ability]?.mod !== undefined) {
										targetRollData.target[ability] = targetActorData.abilities[ability].mod;
									}
									if (targetActorData.abilities[ability]?.base !== undefined) {
										targetRollData.target[ability + 'Base'] = targetActorData.abilities[ability].base;
									}
								});
							}
							
							// Add target stats
							if (targetActorData.attributes?.ac?.value !== undefined) targetRollData.target.ac = targetActorData.attributes.ac.value;
							if (targetActorData.attributes?.hp?.value !== undefined) targetRollData.target.hp = targetActorData.attributes.hp.value;
							
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
	$card.on('click', '.sdx-apply-condition-btn', async function(e) {
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
			
			// Get targets based on applyToTarget setting
			let targets = [];
			if (applyToTarget) {
				// Apply to targets shown in the card
				const $targets = $card.find('.sdx-target-item');
				targets = $targets.map((i, el) => canvas.tokens.get($(el).data('token-id'))).get().filter(t => t);
			} else {
				// Apply to self (the caster - whoever owns the spell)
				if (casterActor) {
					// Find the caster's token on the current scene
					const casterToken = canvas.tokens.placeables.find(t => t.actor?.id === casterActorId);
					if (casterToken) targets = [casterToken];
				}
			}
			
			console.log("shadowdark-extras | Applying to", targets.length, "token(s)");
			
			if (targets.length === 0) {
				ui.notifications.warn("No targets found for condition");
				$btn.prop('disabled', false);
				$btn.data('applying', false);
				return;
			}
			
			let appliedCount = 0;
			let skippedCount = 0;
			
			// Apply each effect to each target
			for (const target of targets) {
				// Check effects requirement if it exists
				let requirementMet = true;
				if (effectsRequirement && effectsRequirement.trim() !== '') {
					try {
						const targetRollData = foundry.utils.duplicate(casterRollData);
						
						// Add target data if available
						if (target.actor) {
							const targetActorData = target.actor.getRollData() || {};
							targetRollData.target = {};
							
							// Flatten target level
							if (targetActorData.level && typeof targetActorData.level === 'object' && targetActorData.level.value !== undefined) {
								targetRollData.target.level = targetActorData.level.value;
							} else {
								targetRollData.target.level = targetActorData.level || 0;
							}
							
							// Add target ability modifiers
							if (targetActorData.abilities) {
								['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
									if (targetActorData.abilities[ability]?.mod !== undefined) {
										targetRollData.target[ability] = targetActorData.abilities[ability].mod;
									}
									if (targetActorData.abilities[ability]?.base !== undefined) {
										targetRollData.target[ability + 'Base'] = targetActorData.abilities[ability].base;
									}
								});
							}
							
							// Add target stats
							if (targetActorData.attributes?.ac?.value !== undefined) targetRollData.target.ac = targetActorData.attributes.ac.value;
							if (targetActorData.attributes?.hp?.value !== undefined) targetRollData.target.hp = targetActorData.attributes.hp.value;
						}
						
						// Evaluate the requirement
				requirementMet = evaluateRequirement(effectsRequirement, targetRollData);
						if (!requirementMet) {
							console.log(`shadowdark-extras | Effects requirement failed for ${target.name}: ${effectsRequirement}`);
							skippedCount += effects.length;
							continue; // Skip this target
						} else {
							console.log(`shadowdark-extras | Effects requirement met for ${target.name}: ${effectsRequirement}`);
						}
					} catch (err) {
						console.warn(`shadowdark-extras | Failed to evaluate effects requirement for target ${target.id}:`, err);
						// On error, assume requirement is met (fail-open)
					}
				}
				
				for (const effectData of effects) {
					// Handle both old format (string UUID) and new format (object with uuid and duration)
					const effectUuid = typeof effectData === 'string' ? effectData : effectData.uuid;
					const duration = typeof effectData === 'object' && effectData.duration ? effectData.duration : {};
					
					console.log("shadowdark-extras | Applying effect to token:", target.id, "Effect:", effectUuid, "Duration override:", duration);
					
					// Use socketlib to apply condition via GM
					if (socketlibSocket) {
						try {
							const success = await socketlibSocket.executeAsGM("applyTokenCondition", {
								tokenId: target.id,
								effectUuid: effectUuid,
								duration: duration
							});
							
							if (success) {
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
				const targetText = applyToTarget ? "target(s)" : "caster";
				let message = `Applied ${appliedCount} condition(s) to ${targetText}`;
				if (skippedCount > 0) {
					message += ` (${skippedCount} skipped - requirement not met)`;
				}
				ui.notifications.info(message);
				$btn.html('<i class="fas fa-check"></i> APPLIED');
			} else if (skippedCount > 0) {
				ui.notifications.warn(`No conditions applied - requirement not met for any target`);
				$btn.html('<i class="fas fa-exclamation"></i> REQ FAILED');
			} else {
				ui.notifications.warn("No conditions were applied");
			}
		} catch (err) {
			console.error("shadowdark-extras | Error applying conditions:", err);
			ui.notifications.error("Failed to apply conditions");
			$btn.prop('disabled', false);
			$btn.data('applying', false);
		}
	});
	
	// Summon creatures button click
	$card.on('click', '.sdx-summon-creatures-btn', async function(e) {
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