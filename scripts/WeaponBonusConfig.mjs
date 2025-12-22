/**
 * Weapon Bonus Configuration System
 * Adds a Bonuses tab to weapon item sheets with:
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
		// Basic bonuses
		damageBonus: "",
		criticalExtraDice: "",
		criticalExtraDamage: "",
		// Requirements for bonuses to apply
		requirements: [],
		// Effects to apply on hit
		effects: []
	};
}

/**
 * Activate the Bonuses tab in an item sheet
 */
function activateBonusesTab(app) {
	const html = app.element;
	if (!html || !html.length) return;
	
	// Click the bonuses tab to activate it
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
}

/**
 * Build the HTML for the Bonuses tab
 */
function buildWeaponBonusTabHtml(flags, item) {
	const enabled = flags.enabled || false;
	const damageBonus = flags.damageBonus || "";
	const criticalExtraDice = flags.criticalExtraDice || "";
	const criticalExtraDamage = flags.criticalExtraDamage || "";
	const requirements = flags.requirements || [];
	const effects = flags.effects || [];
	
	// Build requirements list HTML
	let requirementsHtml = "";
	requirements.forEach((req, index) => {
		requirementsHtml += buildRequirementRowHtml(req, index);
	});
	
	// Build effects list HTML
	let effectsHtml = "";
	effects.forEach((effect, index) => {
		effectsHtml += buildEffectRowHtml(effect, index);
	});
	
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
					<!-- Basic Bonuses Section -->
					<fieldset class="sdx-bonus-fieldset">
						<legend><i class="fas fa-plus-circle"></i> Damage Bonuses</legend>
						
						<div class="sdx-bonus-field">
							<label>Damage Roll Bonus</label>
							<input type="text" class="sdx-damage-bonus" value="${damageBonus}" 
								placeholder="e.g., @abilities.str.mod or 2 or 1d4" />
							<p class="hint">Additional parts to add to the damage roll. Supports formulas like @abilities.str.mod, @details.level, etc.</p>
						</div>
						
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
					
					<!-- Requirements Section -->
					<fieldset class="sdx-bonus-fieldset">
						<legend><i class="fas fa-filter"></i> Bonus Requirements</legend>
						<p class="sdx-section-hint">Define conditions that must be met for bonuses to apply. All requirements must be satisfied (AND logic).</p>
						
						<div class="sdx-requirements-list">
							${requirementsHtml}
						</div>
						
						<button type="button" class="sdx-add-requirement">
							<i class="fas fa-plus"></i> Add Requirement
						</button>
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
								<strong>Target Ancestry</strong> - Target's ancestry
							</div>
						</div>
					</fieldset>
				</div>
			</div>
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
		case "targetName": return "e.g., Goblin";
		case "targetCondition": return "e.g., Frightened";
		case "targetHpPercent": return "e.g., 30";
		case "attackerHpPercent": return "e.g., 50";
		case "targetAncestry": return "e.g., Orc";
		case "attackerCondition": return "e.g., Blessed";
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
		{ value: "attackerHpPercent", label: "Attacker HP %" }
	];
	
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
	$tab.find('.sdx-weapon-bonus-enabled').on('change', async function() {
		const enabled = $(this).is(':checked');
		const $content = $tab.find('.sdx-bonus-content');
		
		if (enabled) {
			$content.removeClass('sdx-disabled');
		} else {
			$content.addClass('sdx-disabled');
		}
		
		await saveWeaponBonusConfig(item, { enabled });
	});
	
	// Basic bonus fields - debounced save
	let saveTimeout;
	$tab.find('.sdx-damage-bonus, .sdx-critical-extra-dice, .sdx-critical-extra-damage').on('input', function() {
		clearTimeout(saveTimeout);
		saveTimeout = setTimeout(async () => {
			await saveBasicBonusFields($tab, item);
		}, 500);
	});
	
	// Also save on blur for immediate feedback
	$tab.find('.sdx-damage-bonus, .sdx-critical-extra-dice, .sdx-critical-extra-damage').on('blur', async function() {
		clearTimeout(saveTimeout);
		await saveBasicBonusFields($tab, item);
	});
	
	// Add requirement button
	$tab.find('.sdx-add-requirement').on('click', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const requirements = currentFlags.requirements || [];
		requirements.push({
			type: "targetName",
			operator: "contains",
			value: ""
		});
		await saveWeaponBonusConfig(item, { requirements });
		app.render(false);
		// Re-activate the bonuses tab after render
		setTimeout(() => activateBonusesTab(app), 50);
	});
	
	// Remove requirement button
	$tab.on('click', '.sdx-remove-requirement', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const index = parseInt($(this).data('index'));
		const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
		const requirements = currentFlags.requirements || [];
		requirements.splice(index, 1);
		await saveWeaponBonusConfig(item, { requirements });
		app.render(false);
		// Re-activate the bonuses tab after render
		setTimeout(() => activateBonusesTab(app), 50);
	});
	
	// Requirement type change - update operators
	$tab.on('change', '.sdx-req-type', async function() {
		const $row = $(this).closest('.sdx-requirement-row');
		const index = parseInt($row.data('index'));
		const type = $(this).val();
		const operators = getOperatorsForType(type);
		
		const $operatorSelect = $row.find('.sdx-req-operator');
		$operatorSelect.empty();
		operators.forEach(opt => {
			$operatorSelect.append(`<option value="${opt.value}">${opt.label}</option>`);
		});
		
		$row.find('.sdx-req-value').attr('placeholder', getPlaceholderForType(type));
		
		await saveRequirementsFromDom($tab, item);
	});
	
	// Requirement operator/value change
	$tab.on('change', '.sdx-req-operator, .sdx-req-value', async function() {
		await saveRequirementsFromDom($tab, item);
	});
	
	// Effect drop area
	const $dropArea = $tab.find('.sdx-effects-drop-area');
	$dropArea.on('dragover', function(e) {
		e.preventDefault();
		$(this).addClass('sdx-drag-over');
	});
	
	$dropArea.on('dragleave', function(e) {
		$(this).removeClass('sdx-drag-over');
	});
	
	$dropArea.on('drop', async function(e) {
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
			requirements: []
		});
		
		await saveWeaponBonusConfig(item, { effects });
		app.render(false);
		// Re-activate the bonuses tab after render
		setTimeout(() => activateBonusesTab(app), 50);
	});
	
	// Remove effect button
	$tab.on('click', '.sdx-remove-effect', async function(e) {
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
	$tab.on('change', '.sdx-effect-chance-input', async function() {
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
	
	// Add effect requirement
	$tab.on('click', '.sdx-add-effect-requirement', async function(e) {
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
	$tab.on('click', '.sdx-remove-effect-requirement', async function(e) {
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
	$tab.on('change', '.sdx-effect-req-type, .sdx-effect-req-operator, .sdx-effect-req-value', async function() {
		await saveEffectRequirementsFromDom($tab, item);
	});
}

/**
 * Save basic bonus fields from the form
 */
async function saveBasicBonusFields($tab, item) {
	const damageBonus = $tab.find('.sdx-damage-bonus').val() || "";
	const criticalExtraDice = $tab.find('.sdx-critical-extra-dice').val() || "";
	const criticalExtraDamage = $tab.find('.sdx-critical-extra-damage').val() || "";
	
	await saveWeaponBonusConfig(item, {
		damageBonus,
		criticalExtraDice,
		criticalExtraDamage
	});
}

/**
 * Save requirements from DOM
 */
async function saveRequirementsFromDom($tab, item) {
	const requirements = [];
	$tab.find('.sdx-requirement-row').each(function() {
		requirements.push({
			type: $(this).find('.sdx-req-type').val(),
			operator: $(this).find('.sdx-req-operator').val(),
			value: $(this).find('.sdx-req-value').val()
		});
	});
	await saveWeaponBonusConfig(item, { requirements });
}

/**
 * Save effect requirements from DOM
 */
async function saveEffectRequirementsFromDom($tab, item) {
	const currentFlags = item.flags?.[MODULE_ID]?.weaponBonus || getDefaultWeaponBonusConfig();
	const effects = currentFlags.effects || [];
	
	$tab.find('.sdx-effect-row').each(function() {
		const effectIndex = parseInt($(this).data('index'));
		if (effects[effectIndex]) {
			const requirements = [];
			$(this).find('.sdx-effect-req-row').each(function() {
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
			
		default:
			return true;
	}
	
	return evaluateString(testValue, operator, value);
}

/**
 * Evaluate string comparison
 */
function evaluateString(testValue, operator, value) {
	const test = (testValue || "").toLowerCase();
	const val = (value || "").toLowerCase();
	
	switch (operator) {
		case "contains":
			return test.includes(val);
		case "equals":
			return test === val;
		case "startsWith":
			return test.startsWith(val);
		case "endsWith":
			return test.endsWith(val);
		case "notContains":
			return !test.includes(val);
		case "notEquals":
			return test !== val;
		default:
			return true;
	}
}

/**
 * Evaluate array contains (for conditions)
 */
function evaluateArrayContains(array, operator, value) {
	const val = (value || "").toLowerCase();
	const hasMatch = array.some(item => (item || "").toLowerCase().includes(val));
	
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
		return { damageBonus: "", criticalDice: 0, criticalDamage: "" };
	}
	
	// Check requirements
	if (!evaluateRequirements(flags.requirements, attacker, target)) {
		return { damageBonus: "", criticalDice: 0, criticalDamage: "" };
	}
	
	return {
		damageBonus: flags.damageBonus || "",
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
			img: effect.img
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
	
	// Check requirements
	if (!evaluateRequirements(flags.requirements, attacker, target)) {
		return { 
			totalBonus: 0, 
			bonusFormula: "", 
			criticalExtraDice: 0, 
			criticalBonus: 0, 
			criticalFormula: "",
			requirementsMet: false 
		};
	}
	
	// Evaluate damage bonus formula
	const bonusFormula = evaluateFormula(flags.damageBonus || "", attacker);
	let totalBonus = 0;
	
	if (bonusFormula) {
		try {
			// Try to evaluate as a roll
			const roll = new Roll(bonusFormula);
			await roll.evaluate();
			totalBonus = roll.total;
		} catch (err) {
			console.warn(`${MODULE_ID} | Failed to evaluate damage bonus formula: ${bonusFormula}`, err);
		}
	}
	
	// Handle critical bonuses
	let criticalExtraDice = 0;
	let criticalBonus = 0;
	let criticalFormula = "";
	
	if (isCritical) {
		criticalExtraDice = parseInt(flags.criticalExtraDice) || 0;
		criticalFormula = evaluateFormula(flags.criticalExtraDamage || "", attacker);
		
		if (criticalFormula) {
			try {
				const critRoll = new Roll(criticalFormula);
				await critRoll.evaluate();
				criticalBonus = critRoll.total;
			} catch (err) {
				console.warn(`${MODULE_ID} | Failed to evaluate critical damage formula: ${criticalFormula}`, err);
			}
		}
	}
	
	return {
		totalBonus,
		bonusFormula,
		criticalExtraDice,
		criticalBonus,
		criticalFormula,
		requirementsMet: true
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

