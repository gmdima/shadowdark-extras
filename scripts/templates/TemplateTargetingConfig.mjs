/**
 * Template Targeting Configuration
 * Generates HTML for the targeting configuration section in spell/scroll/wand Activity tab
 */

import { generateAuraConfigHTML, setupAuraConfigHandlers } from './AuraConfig.mjs';

/**
 * Generate the Template Effects configuration HTML
 * @param {string} MODULE_ID - The module ID
 * @param {Object} flags - The item flags
 * @returns {string} HTML string for the template effects configuration
 */
function generateTemplateEffectsHTML(MODULE_ID, flags) {
	const templateEffects = flags.templateEffects || {
		enabled: false,
		triggers: {
			onEnter: false,
			onTurnStart: false,
			onTurnEnd: false,
			onLeave: false
		},
		damage: {
			formula: '',
			type: ''
		},
		save: {
			enabled: false,
			dc: 12,
			ability: 'dex',
			halfOnSuccess: true
		},
		applyConfiguredEffects: false,
		runItemMacro: false
	};

	const enabled = templateEffects.enabled || false;
	const triggers = templateEffects.triggers || {};
	const damage = templateEffects.damage || {};
	const save = templateEffects.save || {};
	const applyConfiguredEffects = templateEffects.applyConfiguredEffects || false;
	const runItemMacro = templateEffects.runItemMacro || false;

	return `
		<div class="sdx-template-effects-section" style="grid-column: 1 / -1; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary);">
			<h3 style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
				<i class="fas fa-fire-alt" style="color: #ff6b35;"></i> 
				Template Effects
				<label style="margin-left: auto; font-weight: normal; font-size: 12px;">
					<input type="checkbox" 
						name="flags.${MODULE_ID}.templateEffects.enabled"
						class="sdx-template-effects-enabled"
						${enabled ? 'checked' : ''}>
					Enable
				</label>
			</h3>
			
			<div class="sdx-template-effects-config" style="${enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
				<div class="SD-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">
					<label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.triggers.onEnter"
							${triggers.onEnter ? 'checked' : ''}>
						<span>On Enter</span>
					</label>
					<label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.triggers.onTurnStart"
							${triggers.onTurnStart ? 'checked' : ''}>
						<span>Turn Start</span>
					</label>
					<label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.triggers.onTurnEnd"
							${triggers.onTurnEnd ? 'checked' : ''}>
						<span>Turn End</span>
					</label>
					<label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.triggers.onLeave"
							${triggers.onLeave ? 'checked' : ''}>
						<span>On Leave (remove)</span>
					</label>
				</div>

				<div class="SD-grid" style="grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
					<div>
						<label style="font-size: 11px; color: #999;">Damage Formula</label>
						<input type="text" 
							name="flags.${MODULE_ID}.templateEffects.damage.formula"
							value="${damage.formula || ''}"
							placeholder="e.g., 2d10"
							style="width: 100%;">
					</div>
					<div>
						<label style="font-size: 11px; color: #999;">Damage Type</label>
						<select name="flags.${MODULE_ID}.templateEffects.damage.type" style="width: 100%;">
							<option value="" ${!damage.type ? 'selected' : ''}>-- None --</option>
							<option value="fire" ${damage.type === 'fire' ? 'selected' : ''}>Fire</option>
							<option value="cold" ${damage.type === 'cold' ? 'selected' : ''}>Cold</option>
							<option value="lightning" ${damage.type === 'lightning' ? 'selected' : ''}>Lightning</option>
							<option value="acid" ${damage.type === 'acid' ? 'selected' : ''}>Acid</option>
							<option value="poison" ${damage.type === 'poison' ? 'selected' : ''}>Poison</option>
							<option value="necrotic" ${damage.type === 'necrotic' ? 'selected' : ''}>Necrotic</option>
							<option value="radiant" ${damage.type === 'radiant' ? 'selected' : ''}>Radiant</option>
							<option value="psychic" ${damage.type === 'psychic' ? 'selected' : ''}>Psychic</option>
							<option value="force" ${damage.type === 'force' ? 'selected' : ''}>Force</option>
							<option value="physical" ${damage.type === 'physical' ? 'selected' : ''}>Physical</option>
						</select>
					</div>
				</div>

				<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
					<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.save.enabled"
							class="sdx-template-save-enabled"
							${save.enabled ? 'checked' : ''}>
						<span style="font-weight: bold;">Allow Saving Throw</span>
					</label>
					
					<div class="sdx-template-save-config SD-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 8px; ${save.enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
						<div>
							<label style="font-size: 11px; color: #999;">Save DC</label>
							<input type="text" 
								name="flags.${MODULE_ID}.templateEffects.save.dc"
								value="${save.dc || 12}"
								placeholder="e.g. 15 or @spellcastingCheck"
								style="width: 100%;">
						</div>
						<div>
							<label style="font-size: 11px; color: #999;">Ability</label>
							<select name="flags.${MODULE_ID}.templateEffects.save.ability" style="width: 100%;">
								<option value="str" ${save.ability === 'str' ? 'selected' : ''}>Strength</option>
								<option value="dex" ${save.ability === 'dex' ? 'selected' : ''}>Dexterity</option>
								<option value="con" ${save.ability === 'con' ? 'selected' : ''}>Constitution</option>
								<option value="int" ${save.ability === 'int' ? 'selected' : ''}>Intelligence</option>
								<option value="wis" ${save.ability === 'wis' ? 'selected' : ''}>Wisdom</option>
								<option value="cha" ${save.ability === 'cha' ? 'selected' : ''}>Charisma</option>
							</select>
						</div>
						<div>
							<label style="font-size: 11px; color: #999;">&nbsp;</label>
							<label style="display: flex; align-items: center; gap: 4px;">
								<input type="checkbox" 
									name="flags.${MODULE_ID}.templateEffects.save.halfOnSuccess"
									${save.halfOnSuccess !== false ? 'checked' : ''}>
								<span style="font-size: 11px;">Half on Save</span>
							</label>
						</div>
					</div>
				</div>

				<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
					<label style="display: flex; align-items: center; gap: 8px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.applyConfiguredEffects"
							${applyConfiguredEffects ? 'checked' : ''}>
						<span>Apply Configured Effects (from Activity tab) on trigger</span>
					</label>
					<p style="font-size: 10px; color: #888; margin: 4px 0 0 24px;">
						Uses the effects already configured in the Effects section above
					</p>
				</div>

				<div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
					<label style="display: flex; align-items: center; gap: 8px;">
						<input type="checkbox" 
							name="flags.${MODULE_ID}.templateEffects.runItemMacro"
							${runItemMacro ? 'checked' : ''}>
						<span><i class="fas fa-code" style="margin-right: 4px;"></i>Run Item Macro on trigger</span>
					</label>
					<p style="font-size: 10px; color: #888; margin: 4px 0 0 24px;">
						Runs the spell's Item Macro when template effects fire. Use for custom behaviors like level-based instant death.
					</p>
				</div>
			</div>
		</div>
	`;
}

/**
 * Generate the targeting configuration HTML
 * @param {string} MODULE_ID - The module ID
 * @param {Object} flags - The item flags
 * @returns {string} HTML string for the targeting configuration
 */
export function generateTemplateTargetingConfigHTML(MODULE_ID, flags) {
	const targeting = flags.targeting || {
		mode: 'targeted', // 'targeted' or 'template'
		template: {
			type: 'circle',
			size: 30,
			placement: 'choose', // 'choose', 'caster', or 'centered'
			fillColor: '#4e9a06',
			deleteMode: 'none', // 'none', 'endOfTurn', 'duration', 'seconds'
			deleteDuration: 3,
			deleteSeconds: 1,
			hideOutline: false,
			excludeCaster: false,
			tokenMagic: {
				texture: '',
				opacity: 0.5,
				preset: 'NOFX',
				tint: ''
			}
		}
	};

	const mode = targeting.mode || 'targeted';
	const template = targeting.template || {};
	const templateType = template.type || 'circle';
	const templateSize = template.size || 30;
	const placement = template.placement || 'choose';
	const fillColor = template.fillColor || '#4e9a06';
	const deleteMode = template.deleteMode || 'none';
	const deleteDuration = template.deleteDuration || 3;
	const deleteSeconds = template.deleteSeconds || 1;
	const hideOutline = template.hideOutline || false;
	const excludeCaster = template.excludeCaster || false;

	// TokenMagic settings
	const tokenMagic = template.tokenMagic || {};
	const tmTexture = tokenMagic.texture || '';
	const tmOpacity = tokenMagic.opacity ?? 0.5;
	const tmPreset = tokenMagic.preset || 'NOFX';
	const tmTint = tokenMagic.tint || '';

	// Check if TokenMagic module is active
	const tokenMagicActive = game.modules.get('tokenmagic')?.active ?? false;

	// Get TokenMagic presets if module is active
	let tmPresets = [];
	if (tokenMagicActive && globalThis.TokenMagic?.getPresets) {
		try {
			tmPresets = TokenMagic.getPresets('tmfx-template') || [];
		} catch (e) {
			console.warn('shadowdark-extras | Failed to get TokenMagic presets:', e);
		}
	}

	return `
		<div class="SD-box sdx-targeting-box grid-colspan-3">
			<div class="header light">
				<label>
					<i class="fas fa-crosshairs"></i>
					Targeting
				</label>
				<span></span>
			</div>
			<div class="content sdx-targeting-content">
				<div class="SD-grid sdx-targeting-mode-grid">
					<div class="sdx-targeting-mode-options">
						<label class="sdx-radio-option">
							<input type="radio" 
								name="flags.${MODULE_ID}.targeting.mode" 
								value="targeted"
								class="sdx-targeting-mode-radio"
								${mode === 'targeted' ? 'checked' : ''}>
							<span class="sdx-radio-label">
								<i class="fas fa-bullseye"></i>
								Use Targeted Token(s)
							</span>
						</label>
						<label class="sdx-radio-option">
							<input type="radio" 
								name="flags.${MODULE_ID}.targeting.mode" 
								value="template"
								class="sdx-targeting-mode-radio"
								${mode === 'template' ? 'checked' : ''}>
							<span class="sdx-radio-label">
								<i class="fas fa-draw-polygon"></i>
								Use Templates
							</span>
						</label>
					</div>
				</div>

				<div class="sdx-template-settings" style="${mode === 'template' ? '' : 'display: none;'}">
					<div class="SD-grid sdx-template-grid">
						<h3>Type</h3>
						<select name="flags.${MODULE_ID}.targeting.template.type" class="sdx-template-type-select">
							<option value="circle" ${templateType === 'circle' ? 'selected' : ''}>Circle</option>
							<option value="cone" ${templateType === 'cone' ? 'selected' : ''}>Cone</option>
							<option value="ray" ${templateType === 'ray' ? 'selected' : ''}>Ray</option>
							<option value="rect" ${templateType === 'rect' ? 'selected' : ''}>Rectangle</option>
						</select>

						<h3>Size (ft)</h3>
						<input type="number" 
							name="flags.${MODULE_ID}.targeting.template.size" 
							value="${templateSize}" 
							min="5" 
							step="5">

						<h3>Fill Color</h3>
						<div class="sdx-color-input-group">
							<input type="color" 
								class="sdx-color-picker"
								value="${fillColor}">
							<input type="text" 
								name="flags.${MODULE_ID}.targeting.template.fillColor" 
								value="${fillColor}"
								class="sdx-color-text">
						</div>

						<h3>Placement</h3>
						<select name="flags.${MODULE_ID}.targeting.template.placement" class="sdx-placement-select" style="grid-column: span 3;">
							<option value="choose" ${placement === 'choose' ? 'selected' : ''}>Choose Location (click to place)</option>
							<option value="caster" ${placement === 'caster' ? 'selected' : ''}>Originate from Caster (for cones/rays)</option>
							<option value="centered" ${placement === 'centered' ? 'selected' : ''}>Centered on Caster (auto-place)</option>
						</select>

						<h3>When to Delete</h3>
						<div class="sdx-delete-options" style="grid-column: span 3;">
							<label class="sdx-radio-option">
								<input type="radio" 
									name="flags.${MODULE_ID}.targeting.template.deleteMode" 
									value="none"
									class="sdx-delete-mode-radio"
									${deleteMode === 'none' ? 'checked' : ''}>
								<span>Do not delete</span>
							</label>
							<label class="sdx-radio-option">
								<input type="radio" 
									name="flags.${MODULE_ID}.targeting.template.deleteMode" 
									value="endOfTurn"
									class="sdx-delete-mode-radio"
									${deleteMode === 'endOfTurn' ? 'checked' : ''}>
								<span>End of turn</span>
							</label>
							<label class="sdx-radio-option">
								<input type="radio" 
									name="flags.${MODULE_ID}.targeting.template.deleteMode" 
									value="duration"
									class="sdx-delete-mode-radio"
									${deleteMode === 'duration' ? 'checked' : ''}>
								<span>After</span>
								<input type="number" 
									name="flags.${MODULE_ID}.targeting.template.deleteDuration" 
									value="${deleteDuration}" 
									min="1" 
									max="100"
									class="sdx-duration-input"
									style="width: 50px; margin: 0 4px;"
									${deleteMode !== 'duration' ? 'disabled' : ''}>
								<span>rounds</span>
							</label>
							<label class="sdx-radio-option">
								<input type="radio" 
									name="flags.${MODULE_ID}.targeting.template.deleteMode" 
									value="seconds"
									class="sdx-delete-mode-radio"
									${deleteMode === 'seconds' ? 'checked' : ''}>
								<span>After</span>
								<input type="number" 
									name="flags.${MODULE_ID}.targeting.template.deleteSeconds" 
									value="${deleteSeconds}" 
									min="0.1" 
									step="0.1"
									class="sdx-duration-input"
									style="width: 50px; margin: 0 4px;"
									${deleteMode !== 'seconds' ? 'disabled' : ''}>
								<span>seconds</span>
							</label>
						</div>

						<div style="grid-column: 1 / -1; margin-top: 8px; display: flex; gap: 16px; flex-wrap: wrap;">
							<label class="sdx-checkbox-option">
								<input type="checkbox" 
									name="flags.${MODULE_ID}.targeting.template.hideOutline"
									${hideOutline ? 'checked' : ''}>
								<span>Hide Outline</span>
							</label>
							<label class="sdx-checkbox-option">
								<input type="checkbox" 
									name="flags.${MODULE_ID}.targeting.template.excludeCaster"
									${excludeCaster ? 'checked' : ''}>
								<span>Exclude Caster</span>
							</label>
						</div>
						
						${tokenMagicActive ? `
						<div class="sdx-tokenmagic-section" style="grid-column: 1 / -1; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary);">
							<h3 style="grid-column: 1 / -1; margin-bottom: 8px;">
								<i class="fas fa-magic"></i> TokenMagic Effects
							</h3>
							<div class="SD-grid" style="grid-template-columns: 1fr 2fr; gap: 8px; align-items: center;">
								<label>Texture</label>
								<div class="sdx-texture-input-group" style="display: flex; gap: 4px;">
									<input type="text" 
										name="flags.${MODULE_ID}.targeting.template.tokenMagic.texture"
										value="${tmTexture}"
										class="sdx-tm-texture-input"
										placeholder="Path to texture image..."
										style="flex: 1;">
									<button type="button" class="sdx-tm-texture-picker" title="Browse Files">
										<i class="fas fa-file-image"></i>
									</button>
								</div>
								
								<label>Opacity</label>
								<div class="sdx-opacity-input-group" style="display: flex; gap: 8px; align-items: center;">
									<input type="range" 
										name="flags.${MODULE_ID}.targeting.template.tokenMagic.opacity"
										value="${tmOpacity}"
										min="0.1" max="1" step="0.05"
										class="sdx-tm-opacity-slider"
										style="flex: 1;">
									<span class="sdx-tm-opacity-value" style="min-width: 35px; text-align: right;">${tmOpacity}</span>
								</div>
								
								<label>Special Effect</label>
								<select name="flags.${MODULE_ID}.targeting.template.tokenMagic.preset" class="sdx-tm-preset-select">
									<option value="NOFX" ${tmPreset === 'NOFX' ? 'selected' : ''}>None</option>
									${tmPresets.map(p => `<option value="${p.name}" ${tmPreset === p.name ? 'selected' : ''}>${p.name}</option>`).join('')}
								</select>
								
								<label>Effect Tint</label>
								<div class="sdx-tint-input-group" style="display: flex; gap: 4px;">
									<input type="color" 
										class="sdx-tm-tint-picker"
										value="${tmTint || '#ffffff'}"
										${tmPreset === 'NOFX' ? 'disabled' : ''}>
									<input type="text" 
										name="flags.${MODULE_ID}.targeting.template.tokenMagic.tint"
										value="${tmTint}"
										class="sdx-tm-tint-text"
										placeholder="#ffffff"
										style="flex: 1;"
										${tmPreset === 'NOFX' ? 'disabled' : ''}>
								</div>
							</div>
						</div>
						` : ''}

						${generateTemplateEffectsHTML(MODULE_ID, flags)}
					</div>
				</div>
			</div>
		</div>

		<!-- Aura Effects - Independent section (not tied to Templates) -->
		${generateAuraConfigHTML(MODULE_ID, flags)}
	</div>
	`;
}

/**
 * Add event listeners for the targeting configuration
 * Call this after rendering the sheet
 * @param {HTMLElement} html - The sheet HTML element
 * @param {string} MODULE_ID - The module ID
 */
export function activateTemplateTargetingListeners(html, MODULE_ID) {
	// Toggle template settings visibility based on targeting mode
	const modeRadios = html.querySelectorAll('.sdx-targeting-mode-radio');
	const templateSettings = html.querySelector('.sdx-template-settings');

	if (modeRadios && templateSettings) {
		modeRadios.forEach(radio => {
			radio.addEventListener('change', (e) => {
				templateSettings.style.display = e.target.value === 'template' ? '' : 'none';
			});
		});
	}

	// Toggle duration input based on delete mode
	const deleteModeRadios = html.querySelectorAll('.sdx-delete-mode-radio');
	const durationInput = html.querySelector('.sdx-duration-input');

	if (deleteModeRadios && durationInput) {
		deleteModeRadios.forEach(radio => {
			radio.addEventListener('change', (e) => {
				durationInput.disabled = e.target.value !== 'duration';
			});
		});
	}

	// Sync color picker with text input
	const colorPicker = html.querySelector('.sdx-targeting-box .sdx-color-picker');
	const colorText = html.querySelector('.sdx-targeting-box .sdx-color-text');

	if (colorPicker && colorText) {
		colorPicker.addEventListener('input', (e) => {
			colorText.value = e.target.value;
		});
		colorText.addEventListener('input', (e) => {
			if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
				colorPicker.value = e.target.value;
			}
		});
	}

	// Template Effects: Toggle config visibility based on enabled checkbox
	const templateEffectsEnabled = html.querySelector('.sdx-template-effects-enabled');
	const templateEffectsConfig = html.querySelector('.sdx-template-effects-config');

	if (templateEffectsEnabled && templateEffectsConfig) {
		templateEffectsEnabled.addEventListener('change', (e) => {
			if (e.target.checked) {
				templateEffectsConfig.style.opacity = '';
				templateEffectsConfig.style.pointerEvents = '';
			} else {
				templateEffectsConfig.style.opacity = '0.5';
				templateEffectsConfig.style.pointerEvents = 'none';
			}
		});
	}

	// Template Effects: Toggle save config visibility
	const templateSaveEnabled = html.querySelector('.sdx-template-save-enabled');
	const templateSaveConfig = html.querySelector('.sdx-template-save-config');

	if (templateSaveEnabled && templateSaveConfig) {
		templateSaveEnabled.addEventListener('change', (e) => {
			if (e.target.checked) {
				templateSaveConfig.style.opacity = '';
				templateSaveConfig.style.pointerEvents = '';
			} else {
				templateSaveConfig.style.opacity = '0.5';
				templateSaveConfig.style.pointerEvents = 'none';
			}
		});
	}

	// Setup Aura Effects handlers
	setupAuraConfigHandlers($(html));
}
