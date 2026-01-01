/**
 * Aura Configuration UI
 * Generates HTML for the aura configuration section in spell/scroll/wand Activity tab
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Generate the Aura Effects configuration HTML
 * @param {string} MODULE_ID - The module ID
 * @param {Object} flags - The item flags
 * @returns {string} HTML string for the aura effects configuration
 */
export function generateAuraConfigHTML(moduleId, flags) {
    const auraConfig = flags.auraEffects || {
        enabled: false,
        attachTo: 'caster', // 'caster' or 'target'
        radius: 30,
        triggers: {
            onEnter: false,
            onLeave: false,
            onTurnStart: false,
            onTurnEnd: false
        },
        damage: {
            formula: '',
            type: ''
        },
        save: {
            enabled: false,
            dc: 12,
            ability: 'con',
            halfOnSuccess: false
        },
        animation: {
            enabled: true,
            style: 'circle',
            tint: '#4488ff'
        },
        disposition: 'all',
        includeSelf: false,
        applyToOriginator: true,
        checkVisibility: false,
        applyConfiguredEffects: false,
        runItemMacro: false
    };

    const enabled = auraConfig.enabled || false;
    const attachTo = auraConfig.attachTo || 'caster';
    const radius = auraConfig.radius || 30;
    const triggers = auraConfig.triggers || {};
    const damage = auraConfig.damage || {};
    const save = auraConfig.save || {};
    const animation = auraConfig.animation || {};
    const disposition = auraConfig.disposition || 'all';
    const includeSelf = auraConfig.includeSelf || false;
    const applyToOriginator = auraConfig.applyToOriginator !== false; // default true
    const checkVisibility = auraConfig.checkVisibility || false;
    const applyConfiguredEffects = auraConfig.applyConfiguredEffects || false;
    const runItemMacro = auraConfig.runItemMacro || false;

    return `
        <div class="sdx-aura-effects-section" style="grid-column: 1 / -1; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border-light-tertiary);">
            <h3 style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-circle-notch" style="color: #4488ff;"></i> 
                Aura Effects
                <label style="margin-left: auto; font-weight: normal; font-size: 12px;">
                    <input type="checkbox" 
                        name="flags.${moduleId}.auraEffects.enabled"
                        class="sdx-aura-effects-enabled"
                        ${enabled ? 'checked' : ''}>
                    Enable
                </label>
            </h3>
            
            <div class="sdx-aura-effects-config" style="${enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                <!-- Attach To & Size Row -->
                <div class="SD-grid" style="grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                    <div>
                        <label style="font-size: 11px; color: #999; display: block; margin-bottom: 4px;">Attach To</label>
                        <div style="display: flex; gap: 12px;">
                            <label style="display: flex; align-items: center; gap: 4px;">
                                <input type="radio" 
                                    name="flags.${moduleId}.auraEffects.attachTo"
                                    value="caster"
                                    ${attachTo === 'caster' ? 'checked' : ''}>
                                <span>Caster</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 4px;">
                                <input type="radio" 
                                    name="flags.${moduleId}.auraEffects.attachTo"
                                    value="target"
                                    ${attachTo === 'target' ? 'checked' : ''}>
                                <span>Target</span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #999;">Radius (feet)</label>
                        <input type="number" 
                            name="flags.${moduleId}.auraEffects.radius"
                            value="${radius}"
                            min="5" max="300" step="5"
                            style="width: 100%;">
                    </div>
                </div>

                <!-- Triggers Row -->
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #999; display: block; margin-bottom: 4px;">Triggers</label>
                    <div class="SD-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px;">
                        <label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" 
                                name="flags.${moduleId}.auraEffects.triggers.onEnter"
                                ${triggers.onEnter ? 'checked' : ''}>
                            <span>On Enter</span>
                        </label>
                        <label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" 
                                name="flags.${moduleId}.auraEffects.triggers.onTurnStart"
                                ${triggers.onTurnStart ? 'checked' : ''}>
                            <span>Turn Start</span>
                        </label>
                        <label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" 
                                name="flags.${moduleId}.auraEffects.triggers.onTurnEnd"
                                ${triggers.onTurnEnd ? 'checked' : ''}>
                            <span>Turn End</span>
                        </label>
                        <label class="sdx-checkbox-option" style="display: flex; align-items: center; gap: 4px;">
                            <input type="checkbox" 
                                name="flags.${moduleId}.auraEffects.triggers.onLeave"
                                ${triggers.onLeave ? 'checked' : ''}>
                            <span>On Leave (remove)</span>
                        </label>
                    </div>
                </div>

                <!-- Damage Row -->
                <div class="SD-grid" style="grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                    <div>
                        <label style="font-size: 11px; color: #999;">Damage Formula</label>
                        <input type="text" 
                            name="flags.${moduleId}.auraEffects.damage.formula"
                            value="${damage.formula || ''}"
                            placeholder="e.g., 2d6"
                            style="width: 100%;">
                    </div>
                    <div>
                        <label style="font-size: 11px; color: #999;">Damage Type</label>
                        <select name="flags.${moduleId}.auraEffects.damage.type" style="width: 100%;">
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
                            <option value="healing" ${damage.type === 'healing' ? 'selected' : ''}>Healing</option>
                            <option value="temphp" ${damage.type === 'temphp' ? 'selected' : ''}>Temp HP</option>
                        </select>
                    </div>
                </div>

                <!-- Save Section -->
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <input type="checkbox" 
                            name="flags.${moduleId}.auraEffects.save.enabled"
                            class="sdx-aura-save-enabled"
                            ${save.enabled ? 'checked' : ''}>
                        <span style="font-weight: bold;">Allow Saving Throw</span>
                    </label>
                    
                    <div class="sdx-aura-save-config SD-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 8px; ${save.enabled ? '' : 'opacity: 0.5; pointer-events: none;'}">
                        <div>
                            <label style="font-size: 11px; color: #999;">Save DC</label>
                            <input type="number" 
                                name="flags.${moduleId}.auraEffects.save.dc"
                                value="${save.dc || 12}"
                                min="1" max="30"
                                style="width: 100%;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #999;">Ability</label>
                            <select name="flags.${moduleId}.auraEffects.save.ability" style="width: 100%;">
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
                                    name="flags.${moduleId}.auraEffects.save.halfOnSuccess"
                                    ${save.halfOnSuccess ? 'checked' : ''}>
                                <span style="font-size: 11px;">Half on Save</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Disposition & Include Self -->
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
                    <div class="SD-grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="font-size: 11px; color: #999;">Affects</label>
                            <select name="flags.${moduleId}.auraEffects.disposition" style="width: 100%;">
                                <option value="all" ${disposition === 'all' ? 'selected' : ''}>All Tokens</option>
                                <option value="ally" ${disposition === 'ally' ? 'selected' : ''}>Allies Only</option>
                                <option value="enemy" ${disposition === 'enemy' ? 'selected' : ''}>Enemies Only</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #999;">&nbsp;</label>
                            <label style="display: flex; align-items: center; gap: 4px;">
                                <input type="checkbox" 
                                    name="flags.${moduleId}.auraEffects.includeSelf"
                                    ${includeSelf ? 'checked' : ''}>
                                <span style="font-size: 11px;">Include Aura Bearer</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                                <input type="checkbox" 
                                    name="flags.${moduleId}.auraEffects.applyToOriginator"
                                    ${applyToOriginator ? 'checked' : ''}>
                                <span style="font-size: 11px;">Apply Effects to Originator</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                                <input type="checkbox" 
                                    name="flags.${moduleId}.auraEffects.checkVisibility"
                                    ${checkVisibility ? 'checked' : ''}>
                                <span style="font-size: 11px;">Check Visibility (LOS)</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- Animation Section -->
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <input type="checkbox" 
                            name="flags.${moduleId}.auraEffects.animation.enabled"
                            class="sdx-aura-animation-enabled"
                            ${animation.enabled !== false ? 'checked' : ''}>
                        <span style="font-weight: bold;"><i class="fas fa-magic"></i> Show Animation</span>
                    </label>
                    
                    <div class="sdx-aura-animation-config SD-grid" style="grid-template-columns: 1fr 1fr; gap: 8px; ${animation.enabled !== false ? '' : 'opacity: 0.5; pointer-events: none;'}">
                        <div>
                            <label style="font-size: 11px; color: #999;">Style</label>
                            <select name="flags.${moduleId}.auraEffects.animation.style" style="width: 100%;">
                                <option value="circle" ${animation.style === 'circle' ? 'selected' : ''}>Circle Aura</option>
                                <option value="darkness" ${animation.style === 'darkness' ? 'selected' : ''}>Darkness</option>
                                <option value="pulse" ${animation.style === 'pulse' ? 'selected' : ''}>Pulsing</option>
                                <option value="glow" ${animation.style === 'glow' ? 'selected' : ''}>Glow</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #999;">Tint Color</label>
                            <input type="color" 
                                name="flags.${moduleId}.auraEffects.animation.tint"
                                value="${animation.tint || '#4488ff'}"
                                style="width: 100%; height: 26px;">
                        </div>
                        <div>
                            <label style="font-size: 11px; color: #999;">Scale Multiplier</label>
                            <input type="number" 
                                name="flags.${moduleId}.auraEffects.animation.scaleMultiplier"
                                value="${animation.scaleMultiplier ?? 1.0}"
                                min="0.1" max="5" step="0.1"
                                style="width: 100%;"
                                title="Adjust animation size (1.0 = matches radius, 2.0 = double, 0.5 = half)">
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-size: 11px; color: #999;">Opacity: <span class="sdx-opacity-value">${Math.round((animation.opacity ?? 0.6) * 100)}%</span></label>
                            <input type="range" 
                                name="flags.${moduleId}.auraEffects.animation.opacity"
                                class="sdx-aura-opacity-slider"
                                min="0.1" max="1" step="0.1"
                                value="${animation.opacity ?? 0.6}"
                                style="width: 100%;">
                        </div>
                    </div>
                </div>

                <!-- Effects Section -->
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" 
                            name="flags.${moduleId}.auraEffects.applyConfiguredEffects"
                            ${applyConfiguredEffects ? 'checked' : ''}>
                        <span>Apply Configured Effects (from Activity tab) on trigger</span>
                    </label>
                    <p style="font-size: 10px; color: #888; margin: 4px 0 0 24px;">
                        Uses the effects already configured in the Effects section above
                    </p>
                </div>

                <!-- Item Macro Section -->
                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--color-border-light-tertiary);">
                    <label style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" 
                            name="flags.${moduleId}.auraEffects.runItemMacro"
                            ${runItemMacro ? 'checked' : ''}>
                        <span><i class="fas fa-code" style="margin-right: 4px;"></i>Run Item Macro on trigger</span>
                    </label>
                    <p style="font-size: 10px; color: #888; margin: 4px 0 0 24px;">
                        Runs the spell's Item Macro when aura effects fire. Use for custom behaviors.
                    </p>
                </div>
            </div>
        </div>
    `;
}

/**
 * Setup event handlers for the aura config UI
 * @param {HTMLElement|JQuery} html - The form HTML (can be jQuery or native DOM)
 */
export function setupAuraConfigHandlers(html) {
    // Ensure we have native DOM element
    const element = html instanceof jQuery ? html[0] : html;
    if (!element) return;

    // Toggle aura config visibility
    const auraEnabledCheckbox = element.querySelector('.sdx-aura-effects-enabled');
    const auraConfig = element.querySelector('.sdx-aura-effects-config');

    if (auraEnabledCheckbox && auraConfig) {
        auraEnabledCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                auraConfig.style.opacity = '1';
                auraConfig.style.pointerEvents = 'auto';
            } else {
                auraConfig.style.opacity = '0.5';
                auraConfig.style.pointerEvents = 'none';
            }
        });
    }

    // Toggle save config visibility
    const saveEnabledCheckbox = element.querySelector('.sdx-aura-save-enabled');
    const saveConfig = element.querySelector('.sdx-aura-save-config');

    if (saveEnabledCheckbox && saveConfig) {
        saveEnabledCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                saveConfig.style.opacity = '1';
                saveConfig.style.pointerEvents = 'auto';
            } else {
                saveConfig.style.opacity = '0.5';
                saveConfig.style.pointerEvents = 'none';
            }
        });
    }

    // Toggle animation config visibility
    const animEnabledCheckbox = element.querySelector('.sdx-aura-animation-enabled');
    const animConfig = element.querySelector('.sdx-aura-animation-config');

    if (animEnabledCheckbox && animConfig) {
        animEnabledCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                animConfig.style.opacity = '1';
                animConfig.style.pointerEvents = 'auto';
            } else {
                animConfig.style.opacity = '0.5';
                animConfig.style.pointerEvents = 'none';
            }
        });
    }

    // Update opacity slider value display
    const opacitySlider = element.querySelector('.sdx-aura-opacity-slider');
    const opacityValue = element.querySelector('.sdx-opacity-value');
    if (opacitySlider && opacityValue) {
        opacitySlider.addEventListener('input', (e) => {
            opacityValue.textContent = Math.round(e.target.value * 100) + '%';
        });
    }
}
