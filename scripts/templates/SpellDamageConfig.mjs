/**
 * Generate the Spell Damage/Heal configuration HTML
 * @param {string} MODULE_ID - The module identifier
 * @param {object} flags - The spellDamage flags
 * @param {string} effectsListHtml - HTML for the effects list
 * @param {array} effectsArray - Array of effects
 * @param {boolean} effectsApplyToTarget - Whether effects apply to target or self
 * @param {object} options - Additional options (targetLabel, formulaHelp, requirementExamples)
 * @param {string} criticalEffectsListHtml - HTML for the critical effects list
 * @param {array} criticalEffectsArray - Array of critical effects
 * @returns {string} HTML string
 */
export function generateSpellDamageConfigHTML(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, options = {}, criticalEffectsListHtml = '', criticalEffectsArray = []) {
	const {
		targetLabel = 'TARGET',
		formulaHelp = 'Available variables:&#10;CASTER: @level, @str, @dex, @con, @int, @wis, @cha, @strBase, @dexBase, @conBase, @intBase, @wisBase, @chaBase, @hp, @ac&#10;TARGET: @target.level, @target.str, @target.dex, @target.con, @target.int, @target.wis, @target.cha, @target.strBase, @target.dexBase, @target.conBase, @target.intBase, @target.wisBase, @target.chaBase, @target.hp, @target.ac, @target.ancestry, @target.subtype&#10;&#10;Examples:&#10;(1 + floor(@level / 2))d6&#10;(@level)d6 + @int&#10;3d6 + @target.level&#10;(floor(@target.chaBase / 3))d6&#10;(@level + @target.level)d6',
		requirementExamples = '@target.level < 3, @target.hp > 10, @level >= 5, @target.subtype == "Undead"',
		effectsRequirementExamples = '@target.level < 5, @target.hp < 20, @level >= 3, @target.ancestry == "Orc"',
		showTargetOption = true,
		tieredFormulaHelp = 'Level-based tiered formula. Rolls different dice based on target\'s level.&#10;&#10;Format: level-range:formula, level-range:formula, ...&#10;&#10;Examples:&#10;1-3:1d6, 4-6:2d8, 7-9:3d10, 10+:4d12&#10;1-4:1d4, 5-9:2d6, 10+:3d8+2&#10;1:1d4, 2:2d4, 3:3d4, 4+:4d4',
		noteText = 'Use parentheses for variables as die count: <code>(@level)d6</code> not <code>@level d6</code>'
	} = options;

	return `
		<div class="SD-box sdx-spell-damage-box grid-colspan-3">
			<div class="header light">
				<label>
					<input type="checkbox" name="flags.${MODULE_ID}.spellDamage.enabled" 
					       ${flags.enabled ? 'checked' : ''} 
					       class="sdx-spell-damage-toggle" />
					Damage/Healing
				</label>
				<span></span>
			</div>
			<div class="content sdx-spell-damage-content" style="display: ${flags.enabled ? 'block' : 'none'}">
				<div class="SD-grid">
					<h3>Type</h3>
					<select name="flags.${MODULE_ID}.spellDamage.damageType" class="sdx-spell-damage-type-input">
						<option value="">Select Type</option>
						<option value="Fire" ${flags.damageType === 'Fire' ? 'selected' : ''}>Fire</option>
						<option value="Cold" ${flags.damageType === 'Cold' ? 'selected' : ''}>Cold</option>
						<option value="Lightning" ${flags.damageType === 'Lightning' ? 'selected' : ''}>Lightning</option>
						<option value="Acid" ${flags.damageType === 'Acid' ? 'selected' : ''}>Acid</option>
						<option value="Poison" ${flags.damageType === 'Poison' ? 'selected' : ''}>Poison</option>
						<option value="Necrotic" ${flags.damageType === 'Necrotic' ? 'selected' : ''}>Necrotic</option>
						<option value="Radiant" ${flags.damageType === 'Radiant' ? 'selected' : ''}>Radiant</option>
						<option value="Force" ${flags.damageType === 'Force' ? 'selected' : ''}>Force</option>
						<option value="Psychic" ${flags.damageType === 'Psychic' ? 'selected' : ''}>Psychic</option>
						<option value="Healing" ${flags.damageType === 'Healing' ? 'selected' : ''}>Healing</option>
					</select>
					
					<h3>Requirement</h3>
					<input type="text" name="flags.${MODULE_ID}.spellDamage.damageRequirement" 
					       value="${flags.damageRequirement || ''}" 
					       placeholder="e.g., @target.ancestry == &quot;Undead&quot;" 
					       title="Formula that must be true for damage to apply. Leave blank to always apply.&#10;Examples: ${requirementExamples}" 
					       style="grid-column: span 2;" />
					
					<h3>If Fails</h3>
					<select name="flags.${MODULE_ID}.spellDamage.damageRequirementFailAction">
						<option value="zero" ${(flags.damageRequirementFailAction || 'zero') === 'zero' ? 'selected' : ''}>Zero Damage</option>
						<option value="half" ${flags.damageRequirementFailAction === 'half' ? 'selected' : ''}>Half Damage</option>
					</select>
					
					<!-- Formula Type Selection -->
					<h3 style="grid-column: 1 / -1; margin-top: 12px; margin-bottom: 8px; border-bottom: 1px solid #999; padding-bottom: 4px;">Formula Type (select one)</h3>
					
					<!-- BASIC -->
					<div style="grid-column: 1 / -1;">
						<label style="display: flex; align-items: center; gap: 6px; font-weight: bold; margin-bottom: 8px;">
							<input type="radio" name="flags.${MODULE_ID}.spellDamage.formulaType" value="basic" 
						       ${!flags.formulaType || flags.formulaType === 'basic' ? 'checked' : ''}
						       class="sdx-formula-type-radio" />
						BASIC
					</label>
					<div class="sdx-formula-section sdx-basic-formula" style="display: ${!flags.formulaType || flags.formulaType === 'basic' ? 'grid' : 'none'}; grid-template-columns: subgrid; grid-column: 1 / -1; gap: 4px; padding-left: 24px;">
							<h3>Number</h3>
							<input type="number" name="flags.${MODULE_ID}.spellDamage.numDice" 
							       value="${flags.numDice}" min="1" step="1" />
							
							<h3>Die</h3>
							<select name="flags.${MODULE_ID}.spellDamage.dieType">
								<option value="d4" ${flags.dieType === 'd4' ? 'selected' : ''}>d4</option>
								<option value="d6" ${flags.dieType === 'd6' ? 'selected' : ''}>d6</option>
								<option value="d8" ${flags.dieType === 'd8' ? 'selected' : ''}>d8</option>
								<option value="d10" ${flags.dieType === 'd10' ? 'selected' : ''}>d10</option>
								<option value="d12" ${flags.dieType === 'd12' ? 'selected' : ''}>d12</option>
								<option value="d20" ${flags.dieType === 'd20' ? 'selected' : ''}>d20</option>
							</select>
							
							<h3>Bonus</h3>
							<input type="number" name="flags.${MODULE_ID}.spellDamage.bonus" 
							       value="${flags.bonus}" step="1" />
							
							<h3>Scaling</h3>
							<select name="flags.${MODULE_ID}.spellDamage.scaling">
								<option value="none" ${!flags.scaling || flags.scaling === 'none' ? 'selected' : ''}>No Scaling</option>
								<option value="every-level" ${flags.scaling === 'every-level' ? 'selected' : ''}>Every Level</option>
								<option value="every-other-level" ${flags.scaling === 'every-other-level' ? 'selected' : ''}>Every Other Level</option>
							</select>
							
							<h3>Dice</h3>
							<input type="number" name="flags.${MODULE_ID}.spellDamage.scalingDice" 
							       value="${flags.scalingDice}" min="0" step="1" />
						</div>
					</div>
					
					<!-- FORMULA -->
					<div style="grid-column: 1 / -1; margin-top: 8px;">
						<label style="display: flex; align-items: center; gap: 6px; font-weight: bold; margin-bottom: 8px;">
							<input type="radio" name="flags.${MODULE_ID}.spellDamage.formulaType" value="formula" 
						       ${flags.formulaType === 'formula' ? 'checked' : ''}
						       class="sdx-formula-type-radio" />
						FORMULA <i class="fas fa-question-circle" style="font-size: 0.9em; opacity: 0.6; cursor: help; font-weight: normal;" title="${formulaHelp}"></i>
					</label>
					<div class="sdx-formula-section sdx-custom-formula" style="display: ${flags.formulaType === 'formula' ? 'grid' : 'none'}; grid-template-columns: subgrid; grid-column: 1 / -1; gap: 4px; padding-left: 24px;">
							<input type="text" name="flags.${MODULE_ID}.spellDamage.formula" 
							       value="${flags.formula}" placeholder="e.g., (@level)d6 + @int" 
							       style="grid-column: 1 / -1;" />
						</div>
					</div>
					
					<!-- TIERED -->
					<div style="grid-column: 1 / -1; margin-top: 8px;">
						<label style="display: flex; align-items: center; gap: 6px; font-weight: bold; margin-bottom: 8px;">
							<input type="radio" name="flags.${MODULE_ID}.spellDamage.formulaType" value="tiered" 
						       ${flags.formulaType === 'tiered' ? 'checked' : ''}
						       class="sdx-formula-type-radio" />
						TIERED <i class="fas fa-question-circle" style="font-size: 0.9em; opacity: 0.6; cursor: help; font-weight: normal;" title="${tieredFormulaHelp}"></i>
					</label>
					<div class="sdx-formula-section sdx-tiered-formula" style="display: ${flags.formulaType === 'tiered' ? 'grid' : 'none'}; grid-template-columns: subgrid; grid-column: 1 / -1; gap: 4px; padding-left: 24px;">
							<input type="text" name="flags.${MODULE_ID}.spellDamage.tieredFormula" 
							       value="${flags.tieredFormula || ''}" 
							       placeholder="e.g., 1-3:1d6, 4-6:2d8, 7-9:3d10, 10+:4d12"
							       style="grid-column: 1 / -1;" />
						</div>
					</div>
				</div>
			</div>
			
			<!-- Effects section - always visible -->
			<h3 class="sdx-section-title">Effects/Conditions</h3>
			<div class="sdx-effects-container">
				<div class="sdx-effects-column">
					<div class="sdx-spell-effects-drop-area" data-effect-type="normal">
						<div class="sdx-spell-effects-list">
							${effectsListHtml || '<div class="sdx-no-effects"><i class="fas fa-magic"></i> Drag and drop conditions or effects here</div>'}
						</div>
					</div>
				</div>
				<div class="sdx-effects-column sdx-critical-effects-column">
					<label class="sdx-critical-label"><i class="fas fa-star"></i> Critical</label>
					<div class="sdx-spell-effects-drop-area sdx-critical-effects-drop-area" data-effect-type="critical">
						<div class="sdx-spell-critical-effects-list">
							${criticalEffectsListHtml || '<div class="sdx-no-effects"><i class="fas fa-star-exclamation"></i> Optional</div>'}
						</div>
					</div>
				</div>
			</div>
			<input type="hidden" name="flags.${MODULE_ID}.spellDamage.effects" class="sdx-effects-data" value="${JSON.stringify(effectsArray).replace(/"/g, '&quot;')}" />
			<input type="hidden" name="flags.${MODULE_ID}.spellDamage.criticalEffects" class="sdx-critical-effects-data" value="${JSON.stringify(criticalEffectsArray).replace(/"/g, '&quot;')}" />
			
			<!-- Requirement for effects -->
			<h3 class="sdx-section-title sdx-section-title-small">Effects Requirement <i class="fas fa-question-circle sdx-help-icon" title="Formula that must be true for effects to apply. Leave blank to always apply.&#10;Examples: ${effectsRequirementExamples}"></i></h3>
			<input type="text" name="flags.${MODULE_ID}.spellDamage.effectsRequirement" 
			       value="${flags.effectsRequirement || ''}" 
			       placeholder="e.g., @target.subtype == &quot;Undead&quot;" 
			       class="sdx-full-width-input" />
			
			<!-- Apply To setting for effects -->
			<h3 class="sdx-section-title sdx-section-title-small">Apply Effects To</h3>
			<div class="sdx-radio-group">
				<label class="sdx-radio-label">
					<input type="radio" name="flags.${MODULE_ID}.spellDamage.effectsApplyToTarget" 
					       value="true" ${effectsApplyToTarget === true ? 'checked' : ''} />
					<span>Target</span>
				</label>
				<label class="sdx-radio-label">
					<input type="radio" name="flags.${MODULE_ID}.spellDamage.effectsApplyToTarget" 
					       value="false" ${effectsApplyToTarget === false ? 'checked' : ''} />
					<span>Self</span>
				</label>
			</div>
			
			<!-- Effect Selection Mode (for multiple effects) -->
			<h3 class="sdx-section-title sdx-section-title-small">Effect Selection Mode <i class="fas fa-question-circle sdx-help-icon" title="When multiple effects are configured, controls how they are applied.&#10;&#10;All: Apply all configured effects&#10;Random: Randomly select one effect&#10;Prompt: Ask which effects to apply"></i></h3>
			<div class="sdx-radio-group">
				<label class="sdx-radio-label">
					<input type="radio" name="flags.${MODULE_ID}.spellDamage.effectSelectionMode" 
					       value="all" ${!flags.effectSelectionMode || flags.effectSelectionMode === 'all' ? 'checked' : ''} />
					<span>All</span>
				</label>
				<label class="sdx-radio-label">
					<input type="radio" name="flags.${MODULE_ID}.spellDamage.effectSelectionMode" 
					       value="random" ${flags.effectSelectionMode === 'random' ? 'checked' : ''} />
					<span>Random</span>
				</label>
				<label class="sdx-radio-label">
					<input type="radio" name="flags.${MODULE_ID}.spellDamage.effectSelectionMode" 
					       value="prompt" ${flags.effectSelectionMode === 'prompt' ? 'checked' : ''} />
					<span>Prompt</span>
				</label>
			</div>
			
			<!-- Duration Tracking Section -->
			<h3 class="sdx-section-title" style="margin-top: 16px; border-top: 2px solid #7a5a30; padding-top: 12px;">
				<i class="fas fa-clock"></i> Duration Tracking
				<i class="fas fa-question-circle sdx-help-icon" title="Track this spell's duration and apply effects each turn. Use for spells like Cloud Kill that deal damage over multiple rounds."></i>
			</h3>
			
			<div class="sdx-duration-tracking-options">
				<label class="sdx-checkbox-label">
					<input type="checkbox" name="flags.${MODULE_ID}.spellDamage.trackDuration" 
					       ${flags.trackDuration ? 'checked' : ''} 
					       class="sdx-track-duration-toggle" />
					<span>Track in Duration Tracker</span>
				</label>
			</div>
			
			<div class="sdx-duration-content" style="display: ${flags.trackDuration ? 'block' : 'none'}; margin-left: 20px;">
				<div class="sdx-duration-options-grid">
					<label>Per-Turn Trigger:</label>
					<select name="flags.${MODULE_ID}.spellDamage.perTurnTrigger" class="sdx-per-turn-trigger">
						<option value="start" ${!flags.perTurnTrigger || flags.perTurnTrigger === 'start' ? 'selected' : ''}>Start of Turn</option>
						<option value="end" ${flags.perTurnTrigger === 'end' ? 'selected' : ''}>End of Turn</option>
					</select>
					
					<label>Per-Turn Damage:</label>
					<input type="text" name="flags.${MODULE_ID}.spellDamage.perTurnDamage" 
					       value="${flags.perTurnDamage || ''}" 
					       placeholder="e.g., 2d6" 
					       title="Damage formula rolled each turn" />
					
					<label class="sdx-checkbox-label" style="grid-column: span 2;">
						<input type="checkbox" name="flags.${MODULE_ID}.spellDamage.reapplyEffects" 
						       ${flags.reapplyEffects ? 'checked' : ''} />
						<span>Apply effects each turn (if not already applied)</span>
					</label>
				</div>
			</div>
		</div>
	`;
}
