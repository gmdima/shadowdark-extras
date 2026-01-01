/**
 * Weapon Bonus Configuration System
 * Adds a Bonuses tab to weapon item sheets with:
 * - To-hit bonus formulas (using attacker stats)
 * - Damage bonus formulas (using attacker stats)
 * - Critical hit extra dice and damage
 * - Conditional requirements (target name, conditions, HP%, etc.)
 * - Effect/condition application on hit with chance percentage
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Default weapon bonus configuration
 */
export function getDefaultWeaponBonusConfig() {
	return {
		enabled: false,
		// Multiple to-hit bonuses with individual requirements
		hitBonuses: [],
		// Multiple damage bonuses with individual requirements
		damageBonuses: [],
		// Legacy single bonus (for migration)
		damageBonus: "",
		// Critical hit bonuses
		criticalExtraDice: "",
		criticalExtraDamage: "",
		// Legacy requirements (for migration)
		requirements: [],
		// Effects to apply on hit
		effects: [],
		// Item Macro configuration
		itemMacro: {
			enabled: false,
			runAsGm: false,
			triggers: [] // beforeAttack, onHit, onCritical, onMiss, onCriticalMiss, onEquip, onUnequip
		}
	};
}

/**
 * Activate the Bonuses tab in an item sheet
 */
function activateBonusesTab(app) {
	const html = app.element;
	if (!html || !html.length) return;

	// Try to activate using the app's tab controller if available
	if (app._tabs && app._tabs.length > 0) {
		for (const tabs of app._tabs) {
			if (tabs._group === "primary") {
				tabs.activate("tab-bonuses");
				return;
			}
		}
	}

	// Fallback: Click the bonuses tab to activate it
	const $bonusesTab = html.find('nav.SD-nav[data-group="primary"] [data-tab="tab-bonuses"]');
	if ($bonusesTab.length) {
		$bonusesTab.trigger('click');
	}
}

/**
 * Inject the Bonuses tab into weapon item sheets
 */
export function injectWeaponBonusTab(app, html, item) {
	// Only for Weapon type items
	if (item.type !== "Weapon") return;

	// Find the nav tabs - Shadowdark uses SD-nav with navigation-tab class
	const $nav = html.find('nav.SD-nav[data-group="primary"]');
	if (!$nav.length) {
		console.log(`${MODULE_ID} | No nav tabs found for weapon bonus injection`);
		return;
	}

	// Check if tab already exists
	if ($nav.find('[data-tab="tab-bonuses"]').length) return;

	// Add the Bonuses tab to navigation (before Source tab)
	const bonusTabNav = `<a class="navigation-tab" data-tab="tab-bonuses"><i class="fas fa-dice-d20"></i> Bonuses</a>`;
	const $sourceTab = $nav.find('[data-tab="tab-source"]');
	if ($sourceTab.length) {
		$sourceTab.before(bonusTabNav);
	} else {
		$nav.append(bonusTabNav);
	}

	// Get current configuration
	const flags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();

	// Build the tab content
	const tabContent = buildWeaponBonusTabHtml(flags, item);

	// Find the sheet body/content area - Shadowdark uses SD-content-body
	const $sheetBody = html.find('.SD-content-body, section.SD-content-body');
	if ($sheetBody.length) {
		$sheetBody.append(tabContent);
		console.log(`${MODULE_ID} | Injected bonuses tab content`);
	} else {
		console.log(`${MODULE_ID} | Could not find SD-content-body`);
	}

	// Activate tab functionality
	activateWeaponBonusListeners(html, app, item);

	// Inject Animation button after the Bonuses tab
	injectWeaponAnimationButton(html, item);
}

/**
 * Inject the Animation button into weapon and shield item sheets
 * @param {jQuery} html - The sheet HTML
 * @param {Item} item - The weapon or shield item
 */
export function injectWeaponAnimationButton(html, item) {
	// Find the nav tabs
	const $nav = html.find('nav.SD-nav[data-group="primary"]');
	if (!$nav.length) return;

	// Check if button already exists
	if ($nav.find('.sdx-weapon-animation-btn').length) return;

	// Add the Animation button after the Bonuses tab
	const animationBtn = `<a class="sdx-weapon-animation-btn navigation-tab" title="${game.i18n.localize("SHADOWDARK_EXTRAS.weaponAnimation.button")}"><i class="fas fa-wand-magic-sparkles"></i></a>`;
	const $bonusesTab = $nav.find('[data-tab="tab-bonuses"]');
	if ($bonusesTab.length) {
		$bonusesTab.after(animationBtn);
	} else {
		$nav.append(animationBtn);
	}

	// Add click handler for the animation button
	html.find('.sdx-weapon-animation-btn').on('click', async (event) => {
		event.preventDefault();
		event.stopPropagation();

		// Dynamic import to avoid circular dependency
		const { openWeaponAnimationConfig } = await import("./WeaponAnimationConfig.mjs");
		openWeaponAnimationConfig(item);
	});

	console.log(`${MODULE_ID} | Injected weapon animation button`);
}

/**
 * Build the HTML for the Bonuses tab
 */
function buildWeaponBonusTabHtml(flags, item) {
	const enabled = flags.enabled || false;
	const criticalExtraDice = flags.criticalExtraDice || "";
	const criticalExtraDamage = flags.criticalExtraDamage || "";
	const effects = flags.effects || [];

	// Item Macro configuration
	const itemMacro = flags.itemMacro || { enabled: false, runAsGm: false, triggers: [] };
	const itemMacroModuleActive = game.modules.get("itemacro")?.active;

	// Handle hit bonuses
	let hitBonuses = flags.hitBonuses || [];

	// Handle damage bonuses (with migration from legacy single bonus)
	let damageBonuses = flags.damageBonuses || [];
	if (damageBonuses.length === 0 && flags.damageBonus) {
		// Migrate legacy single bonus
		damageBonuses = [{
			formula: flags.damageBonus,
			label: "",
			requirements: flags.requirements || []
		}];
	}

	// Build hit bonuses list HTML
	let hitBonusesHtml = "";
	hitBonuses.forEach((bonus, index) => {
		hitBonusesHtml += buildHitBonusRowHtml(bonus, index);
	});

	// Build damage bonuses list HTML
	let damageBonusesHtml = "";
	damageBonuses.forEach((bonus, index) => {
		damageBonusesHtml += buildDamageBonusRowHtml(bonus, index);
	});

	// Build effects list HTML
	let effectsHtml = "";
	effects.forEach((effect, index) => {
		effectsHtml += buildEffectRowHtml(effect, index);
	});

	// Build Item Macro section HTML
	const itemMacroHtml = buildItemMacroSectionHtml(itemMacro, itemMacroModuleActive);

	return `
		<div class="tab" data-group="primary" data-tab="tab-bonuses">
			<div class="sdx-weapon-bonus-config">
				<!-- Enable Toggle -->
				<div class="sdx-bonus-section sdx-bonus-enable">
					<label class="sdx-toggle-label">
						<input type="checkbox" class="sdx-weapon-bonus-enabled" ${enabled ? 'checked' : ''} />
						<span>Enable Weapon Bonuses</span>
					</label>
				</div>
				
				<div class="sdx-bonus-content ${enabled ? '' : 'sdx-disabled'}">
					<!-- To Hit Bonuses Section -->
					<fieldset class="sdx-bonus-fieldset sdx-hit-bonuses-fieldset">
						<legend><i class="fas fa-bullseye"></i> To Hit Bonuses</legend>
						<p class="sdx-section-hint">Add bonuses to attack rolls with optional requirements. Bonuses without requirements always apply.</p>
						
						<div class="sdx-hit-bonuses-list">
							${hitBonusesHtml}
						</div>
						
						<button type="button" class="sdx-add-hit-bonus">
							<i class="fas fa-plus"></i> Add To Hit Bonus
						</button>
					</fieldset>

					<!-- Damage Bonuses Section -->
					<fieldset class="sdx-bonus-fieldset sdx-damage-bonuses-fieldset">
						<legend><i class="fas fa-burst"></i> Damage Bonuses</legend>
						<p class="sdx-section-hint">Add damage bonuses with optional requirements. Bonuses without requirements always apply.</p>
						
						<div class="sdx-damage-bonuses-list">
							${damageBonusesHtml}
						</div>
						
						<button type="button" class="sdx-add-damage-bonus">
							<i class="fas fa-plus"></i> Add Damage Bonus
						</button>
					</fieldset>
					
					<!-- Critical Hit Section -->
					<fieldset class="sdx-bonus-fieldset">
						<legend><i class="fas fa-crosshairs"></i> Critical Hit Bonuses</legend>
						
						<div class="sdx-bonus-field">
							<label>Extra Critical Hit Dice</label>
							<input type="text" class="sdx-critical-extra-dice" value="${criticalExtraDice}" 
								placeholder="e.g., 1 or 2" />
							<p class="hint">Additional number of damage dice to roll on a critical hit.</p>
						</div>
						
						<div class="sdx-bonus-field">
							<label>Extra Critical Hit Damage</label>
							<input type="text" class="sdx-critical-extra-damage" value="${criticalExtraDamage}" 
								placeholder="e.g., 1d6 or @abilities.str.mod" />
							<p class="hint">Additional damage to add on critical hits. Supports formulas.</p>
						</div>
					</fieldset>
					
					<!-- Effects on Hit Section -->
					<fieldset class="sdx-bonus-fieldset">
						<legend><i class="fas fa-magic"></i> Apply Effects on Hit</legend>
						<p class="sdx-section-hint">Drag Effect or Condition items here to apply them when this weapon hits.</p>
						
						<div class="sdx-effects-drop-area" data-drop-type="effect">
							<div class="sdx-effects-list">
								${effectsHtml}
							</div>
							<div class="sdx-drop-placeholder ${effects.length ? 'hidden' : ''}">
								<i class="fas fa-hand-point-down"></i>
								<span>Drop Effect/Condition items here</span>
							</div>
						</div>
					</fieldset>
					
					<!-- Item Macro Section -->
					${itemMacroHtml}
					
					<!-- Formula Reference -->
					<fieldset class="sdx-bonus-fieldset sdx-formula-reference">
						<legend><i class="fas fa-book"></i> Formula Reference</legend>
						<div class="sdx-reference-grid">
							<div class="sdx-reference-column">
								<h4>Attacker Stats</h4>
								<code>@abilities.str.mod</code> - STR modifier<br>
								<code>@abilities.dex.mod</code> - DEX modifier<br>
								<code>@abilities.con.mod</code> - CON modifier<br>
								<code>@abilities.int.mod</code> - INT modifier<br>
								<code>@abilities.wis.mod</code> - WIS modifier<br>
								<code>@abilities.cha.mod</code> - CHA modifier<br>
								<code>@details.level</code> - Character level
							</div>
							<div class="sdx-reference-column">
								<h4>Requirement Types</h4>
								<strong>Target Name</strong> - Check target's name<br>
								<strong>Target Condition</strong> - Check target's effects<br>
								<strong>Target HP %</strong> - Target's health percentage<br>
								<strong>Attacker HP %</strong> - Your health percentage<br>
								<strong>Target Ancestry</strong> - Target's ancestry<br>
								${game.settings.get(MODULE_ID, "enableNpcCreatureType") ? '<strong>Target Subtype</strong> - Target\'s creature type' : ''}
							</div>
						</div>
					</fieldset>
				</div>
			</div>
		</div>
	`;
}

/**
 * Build HTML for a single hit bonus row with its own requirements
 */
function buildHitBonusRowHtml(bonus, index) {
	const formula = bonus.formula || "";
	const label = bonus.label || "";
	const exclusive = bonus.exclusive || false;
	const requirements = bonus.requirements || [];

	// Build requirements for this hit bonus
	let reqsHtml = "";
	requirements.forEach((req, reqIndex) => {
		reqsHtml += buildHitBonusRequirementRowHtml(req, index, reqIndex);
	});

	return `
		<div class="sdx-hit-bonus-row" data-index="${index}">
			<div class="sdx-hit-bonus-header">
				<div class="sdx-hit-bonus-inputs">
					<input type="text" class="sdx-hit-bonus-formula" value="${formula}" 
						placeholder="e.g., 2 or @abilities.dex.mod" title="To hit bonus" />
					<input type="text" class="sdx-hit-bonus-label" value="${label}" 
						placeholder="Label (optional, e.g., vs Undead)" title="Label" />
				</div>
				<button type="button" class="sdx-remove-hit-bonus" data-index="${index}">
					<i class="fas fa-trash"></i>
				</button>
			</div>
			<div class="sdx-hit-bonus-requirements">
				<div class="sdx-hit-bonus-reqs-header">
					<span>Requirements (optional):</span>
					<label class="sdx-exclusive-label" title="If checked and requirements are met, only this bonus applies (ignores other bonuses)">
						<input type="checkbox" class="sdx-hit-bonus-exclusive" data-bonus-index="${index}" ${exclusive ? 'checked' : ''} />
						<span>Exclusive</span>
					</label>
					<button type="button" class="sdx-add-hit-bonus-requirement" data-bonus-index="${index}">
						<i class="fas fa-plus"></i>
					</button>
				</div>
				<div class="sdx-hit-bonus-reqs-list" data-bonus-index="${index}">
					${reqsHtml}
				</div>
			</div>
		</div>
	`;
}

/**
 * Build HTML for a requirement row within a hit bonus
 */
function buildHitBonusRequirementRowHtml(req, bonusIndex, reqIndex) {
	const type = req.type || "targetName";
	const operator = req.operator || "contains";
	const value = req.value || "";

	const typeOptions = [
		{ value: "targetName", label: "Target Name" },
		{ value: "targetCondition", label: "Target Has Condition" },
		{ value: "targetHpPercent", label: "Target HP %" },
		{ value: "attackerHpPercent", label: "Attacker HP %" },
		{ value: "targetAncestry", label: "Target Ancestry" }
	];

	if (game.settings.get(MODULE_ID, "enableNpcCreatureType")) {
		typeOptions.push({ value: "targetSubtype", label: "Target Subtype" });
	}

	const operatorOptions = getOperatorsForType(type);

	return `
		<div class="sdx-hit-bonus-req-row" data-bonus-index="${bonusIndex}" data-req-index="${reqIndex}">
			<select class="sdx-hit-bonus-req-type">
				${typeOptions.map(opt => `<option value="${opt.value}" ${type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<select class="sdx-hit-bonus-req-operator">
				${operatorOptions.map(opt => `<option value="${opt.value}" ${operator === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<input type="text" class="sdx-hit-bonus-req-value" value="${value}" placeholder="${getPlaceholderForType(type)}" />
			<button type="button" class="sdx-remove-hit-bonus-requirement" data-bonus-index="${bonusIndex}" data-req-index="${reqIndex}">
				<i class="fas fa-times"></i>
			</button>
		</div>
	`;
}

/**
 * Build HTML for a single damage bonus row with its own requirements
 */
function buildDamageBonusRowHtml(bonus, index) {
	const formula = bonus.formula || "";
	const label = bonus.label || "";
	const exclusive = bonus.exclusive || false;
	const requirements = bonus.requirements || [];

	// Build requirements for this damage bonus
	let reqsHtml = "";
	requirements.forEach((req, reqIndex) => {
		reqsHtml += buildDamageBonusRequirementRowHtml(req, index, reqIndex);
	});

	return `
		<div class="sdx-damage-bonus-row" data-index="${index}">
			<div class="sdx-damage-bonus-header">
				<div class="sdx-damage-bonus-inputs">
					<input type="text" class="sdx-damage-bonus-formula" value="${formula}" 
						placeholder="e.g., 1d4 or @abilities.str.mod" title="Damage formula" />
					<input type="text" class="sdx-damage-bonus-label" value="${label}" 
						placeholder="Label (optional, e.g., vs Undead)" title="Label" />
					<select class="sdx-damage-bonus-type" title="Damage Type">
						<option value="" ${!bonus.damageType ? 'selected' : ''}>Standard Damage</option>
						<option value="bludgeoning" ${bonus.damageType === 'bludgeoning' ? 'selected' : ''}>Bludgeoning</option>
						<option value="slashing" ${bonus.damageType === 'slashing' ? 'selected' : ''}>Slashing</option>
						<option value="piercing" ${bonus.damageType === 'piercing' ? 'selected' : ''}>Piercing</option>
						<option value="physical" ${bonus.damageType === 'physical' ? 'selected' : ''}>Physical (Generic)</option>
						<option value="fire" ${bonus.damageType === 'fire' ? 'selected' : ''}>Fire</option>
						<option value="cold" ${bonus.damageType === 'cold' ? 'selected' : ''}>Cold</option>
						<option value="lightning" ${bonus.damageType === 'lightning' ? 'selected' : ''}>Lightning</option>
						<option value="acid" ${bonus.damageType === 'acid' ? 'selected' : ''}>Acid</option>
						<option value="poison" ${bonus.damageType === 'poison' ? 'selected' : ''}>Poison</option>
						<option value="necrotic" ${bonus.damageType === 'necrotic' ? 'selected' : ''}>Necrotic</option>
						<option value="radiant" ${bonus.damageType === 'radiant' ? 'selected' : ''}>Radiant</option>
						<option value="psychic" ${bonus.damageType === 'psychic' ? 'selected' : ''}>Psychic</option>
						<option value="force" ${bonus.damageType === 'force' ? 'selected' : ''}>Force</option>
					</select>
				</div>
				<button type="button" class="sdx-remove-damage-bonus" data-index="${index}">
					<i class="fas fa-trash"></i>
				</button>
			</div>
			<div class="sdx-damage-bonus-requirements">
				<div class="sdx-damage-bonus-reqs-header">
					<span>Requirements (optional):</span>
					<label class="sdx-exclusive-label" title="If checked and requirements are met, only this bonus applies (ignores other bonuses)">
						<input type="checkbox" class="sdx-damage-bonus-exclusive" data-bonus-index="${index}" ${exclusive ? 'checked' : ''} />
						<span>Exclusive</span>
					</label>
					<button type="button" class="sdx-add-damage-bonus-requirement" data-bonus-index="${index}">
						<i class="fas fa-plus"></i>
					</button>
				</div>
				<div class="sdx-damage-bonus-reqs-list" data-bonus-index="${index}">
					${reqsHtml}
				</div>
			</div>
		</div>
	`;
}

/**
 * Build HTML for a requirement row within a damage bonus
 */
function buildDamageBonusRequirementRowHtml(req, bonusIndex, reqIndex) {
	const type = req.type || "targetName";
	const operator = req.operator || "contains";
	const value = req.value || "";

	const typeOptions = [
		{ value: "targetName", label: "Target Name" },
		{ value: "targetCondition", label: "Target Has Condition" },
		{ value: "targetHpPercent", label: "Target HP %" },
		{ value: "attackerHpPercent", label: "Attacker HP %" },
		{ value: "targetAncestry", label: "Target Ancestry" }
	];

	if (game.settings.get(MODULE_ID, "enableNpcCreatureType")) {
		typeOptions.push({ value: "targetSubtype", label: "Target Subtype" });
	}

	const operatorOptions = getOperatorsForType(type);

	return `
		<div class="sdx-damage-bonus-req-row" data-bonus-index="${bonusIndex}" data-req-index="${reqIndex}">
			<select class="sdx-damage-bonus-req-type">
				${typeOptions.map(opt => `<option value="${opt.value}" ${type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<select class="sdx-damage-bonus-req-operator">
				${operatorOptions.map(opt => `<option value="${opt.value}" ${operator === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<input type="text" class="sdx-damage-bonus-req-value" value="${value}" placeholder="${getPlaceholderForType(type)}" />
			<button type="button" class="sdx-remove-damage-bonus-requirement" data-bonus-index="${bonusIndex}" data-req-index="${reqIndex}">
				<i class="fas fa-times"></i>
			</button>
		</div>
	`;
}

/**
 * Build HTML for a single requirement row
 */
function buildRequirementRowHtml(req, index) {
	const type = req.type || "targetName";
	const operator = req.operator || "contains";
	const value = req.value || "";

	const typeOptions = [
		{ value: "targetName", label: "Target Name" },
		{ value: "targetCondition", label: "Target Has Condition/Effect" },
		{ value: "targetHpPercent", label: "Target HP %" },
		{ value: "attackerHpPercent", label: "Attacker HP %" },
		{ value: "targetAncestry", label: "Target Ancestry" },
		{ value: "attackerCondition", label: "Attacker Has Condition/Effect" }
	];

	if (game.settings.get(MODULE_ID, "enableNpcCreatureType")) {
		typeOptions.push({ value: "targetSubtype", label: "Target Subtype" });
	}

	const operatorOptions = getOperatorsForType(type);

	return `
		<div class="sdx-requirement-row" data-index="${index}">
			<select class="sdx-req-type">
				${typeOptions.map(opt => `<option value="${opt.value}" ${type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<select class="sdx-req-operator">
				${operatorOptions.map(opt => `<option value="${opt.value}" ${operator === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<input type="text" class="sdx-req-value" value="${value}" placeholder="${getPlaceholderForType(type)}" />
			<button type="button" class="sdx-remove-requirement" data-index="${index}">
				<i class="fas fa-trash"></i>
			</button>
		</div>
	`;
}

/**
 * Get operators available for a requirement type
 */
function getOperatorsForType(type) {
	if (type === "targetHpPercent" || type === "attackerHpPercent") {
		return [
			{ value: "lessThan", label: "Less than" },
			{ value: "lessThanOrEqual", label: "Less than or equal" },
			{ value: "greaterThan", label: "Greater than" },
			{ value: "greaterThanOrEqual", label: "Greater than or equal" },
			{ value: "equals", label: "Equals" }
		];
	}

	return [
		{ value: "contains", label: "Contains" },
		{ value: "equals", label: "Equals" },
		{ value: "startsWith", label: "Starts with" },
		{ value: "endsWith", label: "Ends with" },
		{ value: "notContains", label: "Does not contain" },
		{ value: "notEquals", label: "Does not equal" }
	];
}

/**
 * Get placeholder text for a requirement type
 */
function getPlaceholderForType(type) {
	switch (type) {
		case "targetName": return "e.g., Orc, Goblin, Skeleton";
		case "targetCondition": return "e.g., Frightened, Paralyzed";
		case "targetHpPercent": return "e.g., 30";
		case "attackerHpPercent": return "e.g., 50";
		case "targetAncestry": return "e.g., Undead, Humanoid";
		case "targetSubtype": return "e.g., Beast, Ooze, Undead";
		case "attackerCondition": return "e.g., Blessed, Inspired";
		default: return "";
	}
}

/**
 * Build HTML for a single effect row
 */
function buildEffectRowHtml(effect, index) {
	const uuid = effect.uuid || "";
	const name = effect.name || "Unknown Effect";
	const img = effect.img || "icons/svg/aura.svg";
	const chance = effect.chance ?? 100;
	const applyToTarget = effect.applyToTarget !== false; // Default to true for backward compatibility
	const cumulative = effect.cumulative !== false; // Default to true for backward compatibility (stack effects)
	const requirements = effect.requirements || [];

	// Build mini requirements for this effect
	let effectReqsHtml = "";
	requirements.forEach((req, reqIndex) => {
		effectReqsHtml += buildEffectRequirementRowHtml(req, index, reqIndex);
	});

	return `
		<div class="sdx-effect-row" data-index="${index}" data-uuid="${uuid}">
			<div class="sdx-effect-header">
				<img src="${img}" class="sdx-effect-img" />
				<span class="sdx-effect-name">${name}</span>
				<div class="sdx-effect-chance">
					<label>Chance:</label>
					<input type="number" class="sdx-effect-chance-input" value="${chance}" min="0" max="100" />
					<span>%</span>
				</div>
				<button type="button" class="sdx-remove-effect" data-index="${index}">
					<i class="fas fa-trash"></i>
				</button>
			</div>
			<div class="sdx-effect-apply-to">
				<span class="sdx-apply-to-label">Apply to:</span>
				<label class="sdx-radio-label">
					<input type="radio" name="sdx-effect-apply-to-${index}" class="sdx-effect-apply-to-radio" 
					       data-effect-index="${index}" value="target" ${applyToTarget ? 'checked' : ''} />
					<i class="fas fa-crosshairs"></i> Target
				</label>
				<label class="sdx-radio-label">
					<input type="radio" name="sdx-effect-apply-to-${index}" class="sdx-effect-apply-to-radio" 
					       data-effect-index="${index}" value="attacker" ${!applyToTarget ? 'checked' : ''} />
					<i class="fas fa-user"></i> Attacker
				</label>
				<span class="sdx-effect-separator">|</span>
				<label class="sdx-checkbox-label" title="If unchecked, won't apply if target already has this condition">
					<input type="checkbox" class="sdx-effect-cumulative-checkbox" data-effect-index="${index}" ${cumulative ? 'checked' : ''} />
					<i class="fas fa-layer-group"></i> Cumulative
				</label>
			</div>
			<div class="sdx-effect-requirements">
				<div class="sdx-effect-reqs-header">
					<span>Application Requirements (optional):</span>
					<button type="button" class="sdx-add-effect-requirement" data-effect-index="${index}">
						<i class="fas fa-plus"></i>
					</button>
				</div>
				<div class="sdx-effect-reqs-list" data-effect-index="${index}">
					${effectReqsHtml}
				</div>
			</div>
		</div>
	`;
}

/**
 * Build HTML for a requirement row within an effect
 */
function buildEffectRequirementRowHtml(req, effectIndex, reqIndex) {
	const type = req.type || "targetName";
	const operator = req.operator || "contains";
	const value = req.value || "";

	const typeOptions = [
		{ value: "targetName", label: "Target Name" },
		{ value: "targetCondition", label: "Target Has Condition" },
		{ value: "targetHpPercent", label: "Target HP %" },
		{ value: "attackerHpPercent", label: "Attacker HP %" },
		{ value: "targetAncestry", label: "Target Ancestry" }
	];

	if (game.settings.get(MODULE_ID, "enableNpcCreatureType")) {
		typeOptions.push({ value: "targetSubtype", label: "Target Subtype" });
	}

	const operatorOptions = getOperatorsForType(type);

	return `
		<div class="sdx-effect-req-row" data-effect-index="${effectIndex}" data-req-index="${reqIndex}">
			<select class="sdx-effect-req-type">
				${typeOptions.map(opt => `<option value="${opt.value}" ${type === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<select class="sdx-effect-req-operator">
				${operatorOptions.map(opt => `<option value="${opt.value}" ${operator === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
			</select>
			<input type="text" class="sdx-effect-req-value" value="${value}" placeholder="${getPlaceholderForType(type)}" />
			<button type="button" class="sdx-remove-effect-requirement" data-effect-index="${effectIndex}" data-req-index="${reqIndex}">
				<i class="fas fa-times"></i>
			</button>
		</div>
	`;
}

/**
 * Build HTML for the Item Macro section
 * @param {Object} itemMacro - The item macro configuration
 * @param {boolean} moduleActive - Whether the Item Macro module is active
 * @returns {string} - HTML string
 */
function buildItemMacroSectionHtml(itemMacro, moduleActive) {
	const enabled = itemMacro.enabled || false;
	const runAsGm = itemMacro.runAsGm || false;
	const triggers = itemMacro.triggers || [];

	// Define available triggers
	const triggerOptions = [
		{ value: "beforeAttack", label: "Run macro before attack roll", icon: "fa-hourglass-start" },
		{ value: "onHit", label: "Run macro if hit", icon: "fa-bullseye" },
		{ value: "onCritical", label: "Run macro if critical hit", icon: "fa-burst" },
		{ value: "onMiss", label: "Run macro if miss", icon: "fa-times-circle" },
		{ value: "onCriticalMiss", label: "Run macro if critical miss", icon: "fa-skull" },
		{ value: "onEquip", label: "Run macro on equip", icon: "fa-hand-holding" },
		{ value: "onUnequip", label: "Run macro on unequip", icon: "fa-hand" }
	];

	// If module is not active, show notice
	if (!moduleActive) {
		return `
			<fieldset class="sdx-bonus-fieldset sdx-item-macro-fieldset">
				<legend><i class="fas fa-scroll"></i> Item Macro</legend>
				<div class="sdx-item-macro-unavailable">
					<i class="fas fa-exclamation-triangle"></i>
					<span>The <strong>Item Macro</strong> module is not installed or not enabled.</span>
					<p class="hint">Install and enable the Item Macro module to attach macros to this weapon.</p>
				</div>
			</fieldset>
		`;
	}

	// Build trigger checkboxes
	const triggerCheckboxesHtml = triggerOptions.map(opt => `
		<label class="sdx-macro-trigger-option">
			<input type="checkbox" class="sdx-macro-trigger-checkbox" value="${opt.value}" 
				${triggers.includes(opt.value) ? 'checked' : ''} />
			<i class="fas ${opt.icon}"></i>
			<span>${opt.label}</span>
		</label>
	`).join('');

	return `
		<fieldset class="sdx-bonus-fieldset sdx-item-macro-fieldset">
			<legend><i class="fas fa-scroll"></i> Item Macro</legend>
			<p class="sdx-section-hint">Configure when to execute this weapon's Item Macro during combat.</p>
			
			<div class="sdx-macro-gm-toggle">
				<label class="sdx-toggle-label">
					<input type="checkbox" class="sdx-macro-run-as-gm" ${runAsGm ? 'checked' : ''} />
					<i class="fas fa-crown"></i>
					<span>Run macro as GM</span>
				</label>
				<p class="hint">Execute the macro with GM permissions using socketlib.</p>
			</div>
			
			<div class="sdx-macro-triggers-section">
				<label class="sdx-triggers-label">Execute macro on:</label>
				<div class="sdx-macro-trigger-grid">
					${triggerCheckboxesHtml}
				</div>
			</div>
			
			<details class="sdx-macro-guide">
				<summary><i class="fas fa-book-open"></i> Macro Development Guide</summary>
				<div class="sdx-macro-guide-content">
					<h4>Available Arguments</h4>
					<p>Item Macro provides these variables to your macro:</p>
					<pre><code>// Standard Item Macro variables:
item          // The weapon item
actor         // The attacking actor
token         // The attacker's token
speaker       // ChatMessage speaker data
character     // The user's assigned character

// SDX-specific data in args:
args.isHit        // Boolean - did the attack hit?
args.isMiss       // Boolean - did the attack miss?
args.isCritical   // Boolean - was it a critical hit?
args.isCriticalMiss // Boolean - was it a critical miss?
args.rollResult   // Attack roll result (total)
args.rollData     // Full roll data object
args.trigger      // String - which trigger fired
args.targets      // Array of targeted tokens
args.target       // First target token
args.targetActor  // First target's actor</code></pre>
					
					<h4>Example: Play Effect on Critical Hit</h4>
					<pre><code>if (args.isCritical && token) {
  new Sequence()
    .effect()
    .file("jb2a.divine_smite.caster.yellowwhite")
    .atLocation(token)
    .play();
}</code></pre>
					
					<h4>Example: Extra Damage vs Undead</h4>
					<pre><code>if (args.isHit) {
  const ancestry = args.targetActor?.system?.ancestry?.name;
  if (ancestry?.toLowerCase().includes("undead")) {
    ChatMessage.create({
      content: \`\${item.name} burns the undead!\`,
      speaker: speaker
    });
  }
}</code></pre>
					
					<h4>Example: Heal on Kill (requires GM execution)</h4>
					<pre><code>if (args.isHit && args.targetActor) {
  const hp = args.targetActor.system.attributes.hp;
  if (hp.value <= 0) {
    const healing = 5;
    const current = actor.system.attributes.hp.value;
    const max = actor.system.attributes.hp.max;
    await actor.update({
      "system.attributes.hp.value": Math.min(max, current + healing)
    });
    ui.notifications.info(\`Healed \${healing} HP!\`);
  }
}</code></pre>
				</div>
			</details>
		</fieldset>
	`;
}

/**
 * Activate event listeners for the Bonuses tab
 */
function activateWeaponBonusListeners(html, app, item) {
	const $tab = html.find('[data-tab="tab-bonuses"]');
	if (!$tab.length) {
		console.log(`${MODULE_ID} | Could not find bonuses tab for listeners`);
		return;
	}

	console.log(`${MODULE_ID} | Activating weapon bonus listeners`);

	// Enable/disable toggle
	$tab.find('.sdx-weapon-bonus-enabled').on('change', async function () {
		const enabled = $(this).is(':checked');
		const $content = $tab.find('.sdx-bonus-content');

		if (enabled) {
			$content.removeClass('sdx-disabled');
		} else {
			$content.addClass('sdx-disabled');
		}

		await saveWeaponBonusConfig(item, { enabled });
	});

	// Critical hit fields - debounced save
	let saveTimeout;
	$tab.find('.sdx-critical-extra-dice, .sdx-critical-extra-damage').on('input', function () {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await saveCriticalBonusFields($tab, item);
		}, 500);
	});

	$tab.find('.sdx-critical-extra-dice, .sdx-critical-extra-damage').on('blur', async function () {
		clearTimeout(saveTimeout);
		await saveCriticalBonusFields($tab, item);
	});

	// ========== HIT BONUS LISTENERS ==========

	// Add hit bonus button
	$tab.find('.sdx-add-hit-bonus').on('click', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const hitBonuses = currentFlags.hitBonuses || [];
		hitBonuses.push({
			formula: "",
			label: "",
			requirements: []
		});
		await saveWeaponBonusConfig(item, { hitBonuses });
		app.render(false);
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Remove hit bonus button
	$tab.on('click', '.sdx-remove-hit-bonus', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const index = parseInt($(this).data('index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const hitBonuses = currentFlags.hitBonuses || [];
		hitBonuses.splice(index, 1);
		await saveWeaponBonusConfig(item, { hitBonuses });
		app.render(false);
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Hit bonus formula/label change - debounced save
	$tab.on('input', '.sdx-hit-bonus-formula, .sdx-hit-bonus-label', function () {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await saveHitBonusesFromDom($tab, item);
		}, 500);
	});

	$tab.on('blur', '.sdx-hit-bonus-formula, .sdx-hit-bonus-label', async function () {
		clearTimeout(saveTimeout);
		await saveHitBonusesFromDom($tab, item);
	});

	// Add hit bonus requirement
	$tab.on('click', '.sdx-add-hit-bonus-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const bonusIndex = parseInt($(this).data('bonus-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const hitBonuses = currentFlags.hitBonuses || [];

		if (hitBonuses[bonusIndex]) {
			hitBonuses[bonusIndex].requirements = hitBonuses[bonusIndex].requirements || [];
			hitBonuses[bonusIndex].requirements.push({
				type: "targetName",
				operator: "contains",
				value: ""
			});
			await saveWeaponBonusConfig(item, { hitBonuses });
			app.render(false);
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Remove hit bonus requirement
	$tab.on('click', '.sdx-remove-hit-bonus-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const bonusIndex = parseInt($(this).data('bonus-index'));
		const reqIndex = parseInt($(this).data('req-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const hitBonuses = currentFlags.hitBonuses || [];

		if (hitBonuses[bonusIndex]?.requirements) {
			hitBonuses[bonusIndex].requirements.splice(reqIndex, 1);
			await saveWeaponBonusConfig(item, { hitBonuses });
			app.render(false);
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Hit bonus requirement type/operator/value change
	$tab.on('change', '.sdx-hit-bonus-req-type, .sdx-hit-bonus-req-operator, .sdx-hit-bonus-req-value', async function () {
		await saveHitBonusesFromDom($tab, item);
	});

	// Hit bonus exclusive checkbox change
	$tab.on('change', '.sdx-hit-bonus-exclusive', async function () {
		if ($(this).is(':checked')) {
			// Uncheck all other exclusive checkboxes for hit bonuses
			$tab.find('.sdx-hit-bonus-exclusive').not(this).prop('checked', false);
		}
		await saveHitBonusesFromDom($tab, item);
	});

	// ========== DAMAGE BONUS LISTENERS ==========

	// Add damage bonus button
	$tab.find('.sdx-add-damage-bonus').on('click', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const damageBonuses = currentFlags.damageBonuses || [];
		damageBonuses.push({
			formula: "",
			label: "",
			requirements: []
		});
		await saveWeaponBonusConfig(item, { damageBonuses });
		app.render(false);
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Remove damage bonus button
	$tab.on('click', '.sdx-remove-damage-bonus', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const index = parseInt($(this).data('index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const damageBonuses = currentFlags.damageBonuses || [];
		damageBonuses.splice(index, 1);
		await saveWeaponBonusConfig(item, { damageBonuses });
		app.render(false);
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Damage bonus formula/label change - debounced save
	$tab.on('input', '.sdx-damage-bonus-formula, .sdx-damage-bonus-label', function () {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await saveDamageBonusesFromDom($tab, item);
		}, 500);
	});

	$tab.on('blur', '.sdx-damage-bonus-formula, .sdx-damage-bonus-label', async function () {
		clearTimeout(saveTimeout);
		await saveDamageBonusesFromDom($tab, item);
	});

	// Damage bonus type change
	$tab.on('change', '.sdx-damage-bonus-type', async function () {
		await saveDamageBonusesFromDom($tab, item);
	});

	// Add damage bonus requirement
	$tab.on('click', '.sdx-add-damage-bonus-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const bonusIndex = parseInt($(this).data('bonus-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const damageBonuses = currentFlags.damageBonuses || [];

		if (damageBonuses[bonusIndex]) {
			damageBonuses[bonusIndex].requirements = damageBonuses[bonusIndex].requirements || [];
			damageBonuses[bonusIndex].requirements.push({
				type: "targetName",
				operator: "contains",
				value: ""
			});
			await saveWeaponBonusConfig(item, { damageBonuses });
			app.render(false);
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Remove damage bonus requirement
	$tab.on('click', '.sdx-remove-damage-bonus-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const bonusIndex = parseInt($(this).data('bonus-index'));
		const reqIndex = parseInt($(this).data('req-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const damageBonuses = currentFlags.damageBonuses || [];

		if (damageBonuses[bonusIndex]?.requirements) {
			damageBonuses[bonusIndex].requirements.splice(reqIndex, 1);
			await saveWeaponBonusConfig(item, { damageBonuses });
			app.render(false);
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Damage bonus requirement type/operator/value change
	$tab.on('change', '.sdx-damage-bonus-req-type, .sdx-damage-bonus-req-operator, .sdx-damage-bonus-req-value', async function () {
		await saveDamageBonusesFromDom($tab, item);
	});

	// Exclusive checkbox change - only one can be exclusive at a time
	$tab.on('change', '.sdx-damage-bonus-exclusive', async function () {
		if ($(this).is(':checked')) {
			// Uncheck all other exclusive checkboxes
			$tab.find('.sdx-damage-bonus-exclusive').not(this).prop('checked', false);
		}
		await saveDamageBonusesFromDom($tab, item);
	});

	// Effect drop area
	const $dropArea = $tab.find('.sdx-effects-drop-area');
	$dropArea.on('dragover', function (e) {
		e.preventDefault();
		$(this).addClass('sdx-drag-over');
	});

	$dropArea.on('dragleave', function (e) {
		$(this).removeClass('sdx-drag-over');
	});

	$dropArea.on('drop', async function (e) {
		e.preventDefault();
		$(this).removeClass('sdx-drag-over');

		const data = TextEditor.getDragEventData(e.originalEvent);
		if (data?.type !== "Item") {
			ui.notifications.warn("Only items can be dropped here");
			return;
		}

		const droppedItem = await fromUuid(data.uuid);
		if (!droppedItem) {
			ui.notifications.warn("Could not find the dropped item");
			return;
		}

		// Only accept Effect, Condition, or NPC Feature items
		const validTypes = ["Effect", "Condition", "NPC Feature"];
		if (!validTypes.includes(droppedItem.type) && droppedItem.system?.category !== "effect") {
			ui.notifications.warn("Only Effect, Condition, or NPC Feature items can be dropped here");
			return;
		}

		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];

		// Check if already added
		if (effects.some(e => e.uuid === data.uuid)) {
			ui.notifications.warn("This effect is already added");
			return;
		}

		effects.push({
			uuid: data.uuid,
			name: droppedItem.name,
			img: droppedItem.img,
			chance: 100,
			applyToTarget: true,
			requirements: []
		});

		await saveWeaponBonusConfig(item, { effects });
		app.render(false);
		// Re-activate the bonuses tab after render
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Remove effect button
	$tab.on('click', '.sdx-remove-effect', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const index = parseInt($(this).data('index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];
		effects.splice(index, 1);
		await saveWeaponBonusConfig(item, { effects });
		app.render(false);
		// Re-activate the bonuses tab after render
		setTimeout(() => activateBonusesTab(app), 50);
	});

	// Effect chance change
	$tab.on('change', '.sdx-effect-chance-input', async function () {
		const $row = $(this).closest('.sdx-effect-row');
		const index = parseInt($row.data('index'));
		const chance = Math.min(100, Math.max(0, parseInt($(this).val()) || 100));

		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];
		if (effects[index]) {
			effects[index].chance = chance;
			await saveWeaponBonusConfig(item, { effects });
		}
	});

	// Effect apply-to radio button change
	$tab.on('change', '.sdx-effect-apply-to-radio', async function () {
		const effectIndex = parseInt($(this).data('effect-index'));
		const applyToTarget = $(this).val() === 'target';

		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];
		if (effects[effectIndex]) {
			effects[effectIndex].applyToTarget = applyToTarget;
			await saveWeaponBonusConfig(item, { effects });
		}
	});

	// Effect cumulative checkbox change
	$tab.on('change', '.sdx-effect-cumulative-checkbox', async function () {
		const effectIndex = parseInt($(this).data('effect-index'));
		const cumulative = $(this).is(':checked');

		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];
		if (effects[effectIndex]) {
			effects[effectIndex].cumulative = cumulative;
			await saveWeaponBonusConfig(item, { effects });
		}
	});

	// Add effect requirement
	$tab.on('click', '.sdx-add-effect-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const effectIndex = parseInt($(this).data('effect-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];

		if (effects[effectIndex]) {
			effects[effectIndex].requirements = effects[effectIndex].requirements || [];
			effects[effectIndex].requirements.push({
				type: "targetName",
				operator: "contains",
				value: ""
			});
			await saveWeaponBonusConfig(item, { effects });
			app.render(false);
			// Re-activate the bonuses tab after render
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Remove effect requirement
	$tab.on('click', '.sdx-remove-effect-requirement', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const effectIndex = parseInt($(this).data('effect-index'));
		const reqIndex = parseInt($(this).data('req-index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const effects = currentFlags.effects || [];

		if (effects[effectIndex]?.requirements) {
			effects[effectIndex].requirements.splice(reqIndex, 1);
			await saveWeaponBonusConfig(item, { effects });
			app.render(false);
			// Re-activate the bonuses tab after render
			setTimeout(() => activateBonusesTab(app), 50);
		}
	});

	// Effect requirement changes
	$tab.on('change', '.sdx-effect-req-type, .sdx-effect-req-operator, .sdx-effect-req-value', async function () {
		await saveEffectRequirementsFromDom($tab, item);
	});

	// ========== ITEM MACRO LISTENERS ==========

	// Item Macro: Run as GM toggle
	$tab.on('change', '.sdx-macro-run-as-gm', async function () {
		const runAsGm = $(this).is(':checked');
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const itemMacro = currentFlags.itemMacro || { enabled: false, runAsGm: false, triggers: [] };
		itemMacro.runAsGm = runAsGm;
		await saveWeaponBonusConfig(item, { itemMacro });
	});

	// Item Macro: Trigger checkboxes
	$tab.on('change', '.sdx-macro-trigger-checkbox', async function () {
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const itemMacro = currentFlags.itemMacro || { enabled: false, runAsGm: false, triggers: [] };

		// Collect all checked triggers
		const triggers = [];
		$tab.find('.sdx-macro-trigger-checkbox:checked').each(function () {
			triggers.push($(this).val());
		});

		itemMacro.triggers = triggers;
		// Enable item macro if any triggers are selected
		itemMacro.enabled = triggers.length > 0;
		await saveWeaponBonusConfig(item, { itemMacro });
	});
}

/**
 * Save critical hit bonus fields from the form
 */
async function saveCriticalBonusFields($tab, item) {
	const criticalExtraDice = $tab.find('.sdx-critical-extra-dice').val() || "";
	const criticalExtraDamage = $tab.find('.sdx-critical-extra-damage').val() || "";

	await saveWeaponBonusConfig(item, {
		criticalExtraDice,
		criticalExtraDamage
	});
}

/**
 * Save hit bonuses from DOM
 */
async function saveHitBonusesFromDom($tab, item) {
	const hitBonuses = [];
	$tab.find('.sdx-hit-bonus-row').each(function () {
		const $row = $(this);
		const requirements = [];

		$row.find('.sdx-hit-bonus-req-row').each(function () {
			requirements.push({
				type: $(this).find('.sdx-hit-bonus-req-type').val(),
				operator: $(this).find('.sdx-hit-bonus-req-operator').val(),
				value: $(this).find('.sdx-hit-bonus-req-value').val()
			});
		});

		hitBonuses.push({
			formula: $row.find('.sdx-hit-bonus-formula').val() || "",
			label: $row.find('.sdx-hit-bonus-label').val() || "",
			exclusive: $row.find('.sdx-hit-bonus-exclusive').is(':checked'),
			requirements: requirements
		});
	});
	await saveWeaponBonusConfig(item, { hitBonuses });
}

/**
 * Save damage bonuses from DOM
 */
async function saveDamageBonusesFromDom($tab, item) {
	const damageBonuses = [];
	$tab.find('.sdx-damage-bonus-row').each(function () {
		const $row = $(this);
		const requirements = [];

		$row.find('.sdx-damage-bonus-req-row').each(function () {
			requirements.push({
				type: $(this).find('.sdx-damage-bonus-req-type').val(),
				operator: $(this).find('.sdx-damage-bonus-req-operator').val(),
				value: $(this).find('.sdx-damage-bonus-req-value').val()
			});
		});

		damageBonuses.push({
			formula: $row.find('.sdx-damage-bonus-formula').val() || "",
			label: $row.find('.sdx-damage-bonus-label').val() || "",
			damageType: $row.find('.sdx-damage-bonus-type').val() || "",
			exclusive: $row.find('.sdx-damage-bonus-exclusive').is(':checked'),
			requirements: requirements
		});
	});
	await saveWeaponBonusConfig(item, { damageBonuses });
}

/**
 * Save effect requirements from DOM
 */
async function saveEffectRequirementsFromDom($tab, item) {
	const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
	const effects = currentFlags.effects || [];

	$tab.find('.sdx-effect-row').each(function () {
		const effectIndex = parseInt($(this).data('index'));
		if (effects[effectIndex]) {
			const requirements = [];
			$(this).find('.sdx-effect-req-row').each(function () {
				requirements.push({
					type: $(this).find('.sdx-effect-req-type').val(),
					operator: $(this).find('.sdx-effect-req-operator').val(),
					value: $(this).find('.sdx-effect-req-value').val()
				});
			});
			effects[effectIndex].requirements = requirements;
		}
	});

	await saveWeaponBonusConfig(item, { effects });
}

/**
 * Save weapon bonus configuration to item flags
 */
async function saveWeaponBonusConfig(item, updates) {
	const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
	const newFlags = foundry.utils.mergeObject(currentFlags, updates);

	await item.update({
		[`flags.${MODULE_ID}.weaponBonus`]: newFlags
	}, { render: false });

	console.log(`${MODULE_ID} | Saved weapon bonus config:`, newFlags);
}

/**
 * Evaluate requirements against attacker and target
 * @param {Object[]} requirements - Array of requirement objects
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor
 * @returns {boolean} - Whether all requirements are met
 */
export function evaluateRequirements(requirements, attacker, target) {
	if (!requirements || requirements.length === 0) return true;

	for (const req of requirements) {
		if (!evaluateSingleRequirement(req, attacker, target)) {
			return false;
		}
	}

	return true;
}

/**
 * Evaluate a single requirement
 */
function evaluateSingleRequirement(req, attacker, target) {
	const { type, operator, value } = req;
	if (!value && type !== "targetCondition" && type !== "attackerCondition") return true; // Empty value = no requirement

	let testValue = "";

	switch (type) {
		case "targetName":
			testValue = target?.name || "";
			break;

		case "targetCondition":
			// Check if target has any effect/condition containing the value
			const targetEffects = target?.effects?.contents || [];
			const targetItems = target?.items?.filter(i => i.type === "Effect" || i.system?.category === "effect") || [];
			const allTargetEffects = [...targetEffects.map(e => e.name), ...targetItems.map(i => i.name)];
			return evaluateArrayContains(allTargetEffects, operator, value);

		case "attackerCondition":
			const attackerEffects = attacker?.effects?.contents || [];
			const attackerItems = attacker?.items?.filter(i => i.type === "Effect" || i.system?.category === "effect") || [];
			const allAttackerEffects = [...attackerEffects.map(e => e.name), ...attackerItems.map(i => i.name)];
			return evaluateArrayContains(allAttackerEffects, operator, value);

		case "targetHpPercent":
			const targetHp = target?.system?.attributes?.hp;
			if (!targetHp) return false;
			const targetPercent = (targetHp.value / targetHp.max) * 100;
			return evaluateNumeric(targetPercent, operator, parseFloat(value));

		case "attackerHpPercent":
			const attackerHp = attacker?.system?.attributes?.hp;
			if (!attackerHp) return false;
			const attackerPercent = (attackerHp.value / attackerHp.max) * 100;
			return evaluateNumeric(attackerPercent, operator, parseFloat(value));

		case "targetAncestry":
			testValue = target?.system?.ancestry?.name || target?.system?.details?.ancestry || "";
			break;

		case "targetSubtype":
			testValue = target?.getFlag(MODULE_ID, "creatureType") || "";
			break;

		default:
			return true;
	}

	return evaluateString(testValue, operator, value);
}

/**
 * Evaluate string comparison
 * Supports comma-separated values for OR logic (e.g., "orc, goblin, skeleton")
 */
function evaluateString(testValue, operator, value) {
	const test = (testValue || "").toLowerCase();

	// Split by comma and trim whitespace for OR logic
	const values = (value || "").split(',').map(v => v.trim().toLowerCase()).filter(v => v);

	// If no values, treat as empty/match all
	if (values.length === 0) return true;

	switch (operator) {
		case "contains":
			// Match if test contains ANY of the comma-separated values
			return values.some(val => test.includes(val));
		case "equals":
			// Match if test equals ANY of the comma-separated values
			return values.some(val => test === val);
		case "startsWith":
			// Match if test starts with ANY of the comma-separated values
			return values.some(val => test.startsWith(val));
		case "endsWith":
			// Match if test ends with ANY of the comma-separated values
			return values.some(val => test.endsWith(val));
		case "notContains":
			// Match if test does NOT contain ANY of the comma-separated values
			return !values.some(val => test.includes(val));
		case "notEquals":
			// Match if test does NOT equal ANY of the comma-separated values
			return !values.some(val => test === val);
		default:
			return true;
	}
}

/**
 * Evaluate array contains (for conditions)
 * Supports comma-separated values for OR logic (e.g., "Frightened, Paralyzed")
 */
function evaluateArrayContains(array, operator, value) {
	// Split by comma and trim whitespace for OR logic
	const values = (value || "").split(',').map(v => v.trim().toLowerCase()).filter(v => v);

	// If no values, treat as empty/no requirement
	if (values.length === 0) return true;

	// Check if any array item contains any of the comma-separated values
	const hasMatch = array.some(item => {
		const itemLower = (item || "").toLowerCase();
		return values.some(val => itemLower.includes(val));
	});

	switch (operator) {
		case "contains":
		case "equals":
			return hasMatch;
		case "notContains":
		case "notEquals":
			return !hasMatch;
		default:
			return hasMatch;
	}
}

/**
 * Evaluate numeric comparison
 */
function evaluateNumeric(testValue, operator, value) {
	switch (operator) {
		case "lessThan":
			return testValue < value;
		case "lessThanOrEqual":
			return testValue <= value;
		case "greaterThan":
			return testValue > value;
		case "greaterThanOrEqual":
			return testValue >= value;
		case "equals":
			return Math.abs(testValue - value) < 0.01;
		default:
			return true;
	}
}

/**
 * Get the to-hit bonus for a weapon
 * @param {Item} weapon - The weapon item
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor (optional)
 * @returns {Object} - { hitBonus, hitBonusParts }
 */
export function getWeaponHitBonuses(weapon, attacker, target) {
	const flags = weapon.flags?.[MODULE_ID]?.weaponBonus;
	if (!flags?.enabled) {
		return { hitBonus: "", hitBonusParts: [] };
	}

	// Process hit bonuses array
	const hitBonuses = flags.hitBonuses || [];
	const applicableBonuses = [];
	let exclusiveMatch = null;

	// Process each hit bonus entry
	for (const bonus of hitBonuses) {
		if (!bonus.formula) continue;

		// Check this bonus's requirements
		if (evaluateRequirements(bonus.requirements || [], attacker, target)) {
			if (bonus.exclusive) {
				exclusiveMatch = {
					formula: bonus.formula,
					label: bonus.label || ""
				};
				break; // Stop processing, use only this exclusive bonus
			}
			applicableBonuses.push({
				formula: bonus.formula,
				label: bonus.label || ""
			});
		}
	}

	// If an exclusive bonus matched, use only that
	if (exclusiveMatch) {
		return {
			hitBonus: exclusiveMatch.formula,
			hitBonusParts: [exclusiveMatch]
		};
	}

	// Combine all applicable bonus formulas
	const combinedFormula = applicableBonuses.map(b => b.formula).filter(f => f).join(" + ");

	return {
		hitBonus: combinedFormula,
		hitBonusParts: applicableBonuses
	};
}

/**
 * Get the bonus damage formula for a weapon
 * @param {Item} weapon - The weapon item
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor (optional)
 * @param {boolean} isCritical - Whether this is a critical hit
 * @returns {Object} - { damageBonus, criticalDice, criticalDamage }
 */
export function getWeaponBonuses(weapon, attacker, target, isCritical = false) {
	const flags = weapon.flags?.[MODULE_ID]?.weaponBonus;
	if (!flags?.enabled) {
		return { damageBonus: "", damageBonusParts: [], criticalDice: 0, criticalDamage: "" };
	}

	// Process damage bonuses array
	const damageBonuses = flags.damageBonuses || [];
	const applicableBonuses = [];
	let exclusiveMatch = null;

	// Handle legacy single damageBonus with legacy requirements
	if (damageBonuses.length === 0 && flags.damageBonus) {
		if (evaluateRequirements(flags.requirements, attacker, target)) {
			applicableBonuses.push({ formula: flags.damageBonus, label: "" });
		}
	} else {
		// Process each damage bonus entry
		for (const bonus of damageBonuses) {
			if (!bonus.formula) continue;

			// Check this bonus's requirements
			if (evaluateRequirements(bonus.requirements || [], attacker, target)) {
				if (bonus.exclusive) {
					exclusiveMatch = {
						formula: bonus.formula,
						label: bonus.label || ""
					};
					break; // Stop processing, use only this exclusive bonus
				}
				applicableBonuses.push({
					formula: bonus.formula,
					label: bonus.label || ""
				});
			}
		}
	}

	// If an exclusive bonus matched, use only that
	if (exclusiveMatch) {
		return {
			damageBonus: exclusiveMatch.formula,
			damageBonusParts: [exclusiveMatch],
			criticalDice: parseInt(flags.criticalExtraDice) || 0,
			criticalDamage: flags.criticalExtraDamage || ""
		};
	}

	// Combine all applicable bonus formulas
	const combinedFormula = applicableBonuses.map(b => b.formula).filter(f => f).join(" + ");

	return {
		damageBonus: combinedFormula,
		damageBonusParts: applicableBonuses,
		criticalDice: parseInt(flags.criticalExtraDice) || 0,
		criticalDamage: flags.criticalExtraDamage || ""
	};
}

/**
 * Get effects to apply from a weapon hit
 * @param {Item} weapon - The weapon item
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor
 * @returns {Object[]} - Array of { uuid, name, img } for effects that should apply
 */
export function getWeaponEffectsToApply(weapon, attacker, target) {
	const flags = weapon.flags?.[MODULE_ID]?.weaponBonus;
	if (!flags?.enabled || !flags.effects?.length) {
		return [];
	}

	const effectsToApply = [];

	for (const effect of flags.effects) {
		// Check effect-specific requirements
		if (!evaluateRequirements(effect.requirements, attacker, target)) {
			continue;
		}

		// Roll for chance
		const chance = effect.chance ?? 100;
		if (chance < 100) {
			const roll = Math.random() * 100;
			if (roll > chance) {
				console.log(`${MODULE_ID} | Effect ${effect.name} failed chance roll (${roll.toFixed(1)} > ${chance})`);
				continue;
			}
		}

		effectsToApply.push({
			uuid: effect.uuid,
			name: effect.name,
			img: effect.img,
			applyToTarget: effect.applyToTarget !== false, // Default to true for backward compatibility
			cumulative: effect.cumulative !== false // Default to true for backward compatibility (stack effects)
		});
	}

	return effectsToApply;
}

/**
 * Evaluate a formula string with actor roll data
 * @param {string} formula - The formula to evaluate (e.g., "@abilities.str.mod" or "2" or "1d4")
 * @param {Actor} actor - The actor to get roll data from
 * @returns {string} - The evaluated formula with values substituted
 */
export function evaluateFormula(formula, actor) {
	if (!formula) return "";

	// Get actor roll data
	const rollData = actor?.getRollData?.() || {};

	// Also add some common shortcuts
	rollData.level = actor?.system?.level?.value || actor?.system?.details?.level || 1;
	rollData.str = actor?.system?.abilities?.str?.mod || 0;
	rollData.dex = actor?.system?.abilities?.dex?.mod || 0;
	rollData.con = actor?.system?.abilities?.con?.mod || 0;
	rollData.int = actor?.system?.abilities?.int?.mod || 0;
	rollData.wis = actor?.system?.abilities?.wis?.mod || 0;
	rollData.cha = actor?.system?.abilities?.cha?.mod || 0;

	// Replace @variable references with their values
	let result = formula;
	const variableRegex = /@([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

	result = result.replace(variableRegex, (match, path) => {
		const value = path.split('.').reduce((obj, key) => obj?.[key], rollData);
		return value !== undefined ? String(value) : "0";
	});

	return result;
}

/**
 * Calculate the total weapon bonus damage for a hit
 * @param {Item} weapon - The weapon item
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor (optional)
 * @param {boolean} isCritical - Whether this is a critical hit
 * @returns {Object} - { totalBonus, bonusFormula, criticalExtraDice, criticalBonus, criticalFormula, requirementsMet }
 */
export async function calculateWeaponBonusDamage(weapon, attacker, target, isCritical = false) {
	const flags = weapon?.flags?.[MODULE_ID]?.weaponBonus;
	if (!flags?.enabled) {
		return {
			totalBonus: 0,
			bonusFormula: "",
			criticalExtraDice: 0,
			criticalBonus: 0,
			criticalFormula: "",
			requirementsMet: true
		};
	}

	// Process damage bonuses array
	const damageBonuses = flags.damageBonuses || [];
	let applicableParts = [];
	let exclusiveMatch = null;

	// Handle legacy single damageBonus with legacy requirements
	if (damageBonuses.length === 0 && flags.damageBonus) {
		if (evaluateRequirements(flags.requirements || [], attacker, target)) {
			const formula = evaluateFormula(flags.damageBonus, attacker);
			if (formula) {
				applicableParts.push({ formula, label: "" });
			}
		}
	} else {
		// Process each damage bonus entry
		for (const bonus of damageBonuses) {
			if (!bonus.formula) continue;

			// Check this bonus's requirements
			if (evaluateRequirements(bonus.requirements || [], attacker, target)) {
				const formula = evaluateFormula(bonus.formula, attacker);
				if (formula) {
					const part = {
						formula,
						label: bonus.label || "",
						damageType: bonus.damageType || ""
					};
					// If this bonus is exclusive and has requirements, use only this bonus
					if (bonus.exclusive && bonus.requirements && bonus.requirements.length > 0) {
						exclusiveMatch = part;
						break; // Stop processing other bonuses
					}
					applicableParts.push(part);
				}
			}
		}
	}

	// If an exclusive bonus matched, use only that
	if (exclusiveMatch) {
		applicableParts = [exclusiveMatch];
	}

	// Roll each damage bonus separately to track damage by type
	const damageComponents = [];
	let totalBonus = 0;
	let bonusRollResults = []; // Store individual dice results for display

	for (const part of applicableParts) {
		if (!part.formula) continue;

		try {
			const roll = new Roll(part.formula);
			await roll.evaluate();
			const amount = roll.total;
			totalBonus += amount;

			damageComponents.push({
				amount: amount,
				type: part.damageType || "standard",
				label: part.label || "",
				formula: part.formula
			});

			// Extract dice results from the roll for display
			for (const term of roll.terms) {
				if (term.operator) continue; // Skip operators
				if (term.faces !== undefined && term.results) {
					for (const r of term.results) {
						bonusRollResults.push({
							value: r.result,
							faces: term.faces,
							label: part.label || '',
							damageType: part.damageType || '',
							isMax: r.result === term.faces,
							isMin: r.result === 1
						});
					}
				} else if (term.number !== undefined && !term.faces) {
					// Static number
					bonusRollResults.push({
						value: term.number,
						faces: 0, // 0 means static bonus
						label: part.label || '',
						damageType: part.damageType || '',
						isMax: false,
						isMin: false
					});
				}
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Failed to evaluate damage bonus formula: ${part.formula}`, err);
		}
	}

	// Combine all applicable bonus formulas for display
	const bonusFormula = applicableParts.map(p => p.formula).join(" + ");

	// Handle critical bonuses
	let criticalExtraDice = 0;
	let criticalBonus = 0;
	let criticalFormula = "";
	let criticalRollResults = [];

	if (isCritical) {
		criticalExtraDice = parseInt(flags.criticalExtraDice) || 0;
		criticalFormula = evaluateFormula(flags.criticalExtraDamage || "", attacker);

		if (criticalFormula) {
			try {
				const critRoll = new Roll(criticalFormula);
				await critRoll.evaluate();
				criticalBonus = critRoll.total;

				// Critical damage is treated as "standard" type
				damageComponents.push({
					amount: criticalBonus,
					type: "standard",
					label: "Critical",
					formula: criticalFormula
				});

				// Extract dice results from critical roll
				for (const term of critRoll.terms) {
					if (term.operator) continue;
					if (term.faces !== undefined && term.results) {
						for (const r of term.results) {
							criticalRollResults.push({
								value: r.result,
								faces: term.faces,
								label: 'Critical',
								isMax: r.result === term.faces,
								isMin: r.result === 1
							});
						}
					} else if (term.number !== undefined && !term.faces && term.number !== 0) {
						criticalRollResults.push({
							value: term.number,
							faces: 0,
							label: 'Critical',
							isMax: false,
							isMin: false
						});
					}
				}
			} catch (err) {
				console.warn(`${MODULE_ID} | Failed to evaluate critical damage formula: ${criticalFormula}`, err);
			}
		}
	}

	return {
		totalBonus,
		bonusFormula,
		bonusParts: applicableParts,
		bonusRollResults, // Actual dice results from the roll
		damageComponents, // NEW: Array of { amount, type, label, formula }
		criticalExtraDice,
		criticalBonus,
		criticalFormula,
		criticalRollResults, // Actual dice results from critical roll
		requirementsMet: applicableParts.length > 0 || damageBonuses.length === 0,
		damageTypes: applicableParts.map(p => p.damageType).filter(t => t)
	};
}

/**
 * Process weapon bonuses for a chat message and inject display
 * @param {ChatMessage} message - The chat message
 * @param {jQuery} html - The message HTML
 * @param {Item} weapon - The weapon item
 * @param {Actor} attacker - The attacking actor
 * @param {Actor} target - The target actor (optional)
 * @param {boolean} isCritical - Whether this was a critical hit
 */
export async function injectWeaponBonusDisplay(message, html, weapon, attacker, target, isCritical) {
	const bonusData = await calculateWeaponBonusDamage(weapon, attacker, target, isCritical);

	if (!bonusData.requirementsMet) {
		console.log(`${MODULE_ID} | Weapon bonus requirements not met for ${weapon.name}`);
		return;
	}

	const hasBonuses = bonusData.totalBonus !== 0 ||
		(isCritical && (bonusData.criticalExtraDice > 0 || bonusData.criticalBonus !== 0));

	if (!hasBonuses) return;

	// Build bonus display HTML
	let bonusHtml = `<div class="sdx-weapon-bonus-display">`;
	bonusHtml += `<div class="sdx-bonus-header"><i class="fas fa-dice-d20"></i> Weapon Bonuses</div>`;

	if (bonusData.totalBonus !== 0) {
		const sign = bonusData.totalBonus > 0 ? "+" : "";
		bonusHtml += `<div class="sdx-bonus-line">
			<span class="sdx-bonus-label">Damage Bonus:</span>
			<span class="sdx-bonus-value">${sign}${bonusData.totalBonus}</span>
			<span class="sdx-bonus-formula">(${bonusData.bonusFormula})</span>
		</div>`;
	}

	if (isCritical && bonusData.criticalExtraDice > 0) {
		bonusHtml += `<div class="sdx-bonus-line">
			<span class="sdx-bonus-label">Extra Crit Dice:</span>
			<span class="sdx-bonus-value">+${bonusData.criticalExtraDice}</span>
		</div>`;
	}

	if (isCritical && bonusData.criticalBonus !== 0) {
		const sign = bonusData.criticalBonus > 0 ? "+" : "";
		bonusHtml += `<div class="sdx-bonus-line">
			<span class="sdx-bonus-label">Crit Damage:</span>
			<span class="sdx-bonus-value">${sign}${bonusData.criticalBonus}</span>
			<span class="sdx-bonus-formula">(${bonusData.criticalFormula})</span>
		</div>`;
	}

	bonusHtml += `</div>`;

	// Find where to inject (after the damage roll)
	const $damageRoll = html.find('.dice-roll').last();
	if ($damageRoll.length) {
		$damageRoll.after(bonusHtml);
	} else {
		// Fallback: append to message content
		html.find('.message-content').append(bonusHtml);
	}
}

/**
 * Get the Item Macro configuration for a weapon
 * @param {Item} weapon - The weapon item
 * @returns {Object} - { enabled, runAsGm, triggers }
 */
export function getWeaponItemMacroConfig(weapon) {
	const flags = weapon?.flags?.[MODULE_ID]?.weaponBonus;
	if (!flags?.itemMacro) {
		return { enabled: false, runAsGm: false, triggers: [] };
	}

	return {
		enabled: flags.itemMacro.enabled || false,
		runAsGm: flags.itemMacro.runAsGm || false,
		triggers: flags.itemMacro.triggers || []
	};
}
