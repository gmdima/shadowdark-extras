/**
 * Template Targeting Configuration
 * Generates HTML for the targeting configuration section in spell/scroll/wand Activity tab
 */

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
					</div>
				</div>
			</div>
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
}
