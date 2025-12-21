/**
 * Generate the Summoning configuration HTML for use with Portal library
 * @param {string} MODULE_ID - The module identifier
 * @param {object} flags - The summoning flags
 * @param {string} summonsList - HTML for the summons profiles list
 * @param {array} summonProfilesArray - Array of summon profiles
 * @returns {string} HTML string
 */
export function generateSummoningConfigHTML(MODULE_ID, flags, summonsList, summonProfilesArray) {
	return `
		<div class="SD-box sdx-summoning-box grid-colspan-3">
			<div class="header light">
				<label style="display: flex; align-items: center; gap: 0.5rem;">
					<input type="checkbox" name="flags.${MODULE_ID}.summoning.enabled" 
					       ${flags.enabled ? 'checked' : ''} 
					       class="sdx-summoning-toggle" />
					<span style="font-weight: bold;">Summonings</span>
				</label>
				<span></span>
			</div>
			<div class="content sdx-summoning-content">
				<div class="SD-grid">
					<!-- Summons Profiles List -->
					<h3 style="grid-column: 1 / -1; margin-bottom: 8px;">Summon Profiles</h3>
					<div class="sdx-summons-list" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;">
						${summonsList || '<div class="sdx-no-summons">Click "Add Summon Profile" to add creatures</div>'}
					</div>
					
					<!-- Add Profile Button -->
					<button type="button" class="sdx-add-summon-btn" style="grid-column: 1 / -1; margin-top: 8px;">
						<i class="fas fa-plus"></i> Add Summon Profile
					</button>
					
					<!-- Hidden input to store JSON data -->
					<input type="hidden" name="flags.${MODULE_ID}.summoning.profiles" class="sdx-summons-data" value="${JSON.stringify(summonProfilesArray).replace(/"/g, '&quot;')}" />
				</div>
			</div>
		</div>
	`;
}

/**
 * Generate HTML for a single summon profile
 * @param {object} profile - The summon profile data
 * @param {number} index - Index of the profile
 * @returns {string} HTML string
 */
export function generateSummonProfileHTML(profile, index) {
	return `
		<div class="sdx-summon-profile" data-index="${index}">
			<div class="SD-grid" style="align-items: center; gap: 4px;">
				<!-- Creature Drop Zone -->
				<div class="sdx-summon-creature-drop" style="grid-column: 1 / 2; min-height: 48px; border: 1px dashed #999; border-radius: 4px; padding: 4px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1);">
					${profile.creatureUuid ? `
						<div class="sdx-summon-creature-display" data-uuid="${profile.creatureUuid}">
							<img src="${profile.creatureImg || 'icons/svg/mystery-man.svg'}" alt="${profile.creatureName || 'Creature'}" style="width: 40px; height: 40px; border-radius: 4px;" />
							<span style="margin-left: 4px; font-size: 0.9em;">${profile.creatureName || 'Unknown'}</span>
						</div>
					` : `
						<span style="color: #999; font-size: 0.85em;">Drop creature here</span>
					`}
				</div>
				<input type="hidden" class="sdx-creature-uuid" value="${profile.creatureUuid || ''}" />
				<input type="hidden" class="sdx-creature-name" value="${profile.creatureName || ''}" />
				<input type="hidden" class="sdx-creature-img" value="${profile.creatureImg || ''}" />
				
				<!-- Count Formula -->
				<div style="grid-column: 2 / 3; display: flex; flex-direction: column;">
					<label style="font-size: 0.85em; margin-bottom: 2px; font-weight: bold;">Count</label>
					<input type="text" class="sdx-summon-count" value="${profile.count || '1'}" 
					       placeholder="1, 1d4, etc." 
					       title="Number of creatures to summon. Can be a number or dice formula (e.g., 1d4, 2d6)." 
					       style="width: 100%;" />
				</div>
				
				<!-- Display Name -->
				<div style="grid-column: 3 / 4; display: flex; flex-direction: column;">
					<label style="font-size: 0.85em; margin-bottom: 2px; font-weight: bold;">Display Name</label>
					<input type="text" class="sdx-summon-display-name" value="${profile.displayName || ''}" 
					       placeholder="Optional custom name" 
					       style="width: 100%;" />
				</div>
				
				<!-- Remove Button -->
				<button type="button" class="sdx-remove-summon-btn" data-index="${index}" 
				        style="grid-column: 4 / 5; width: 32px; height: 32px; padding: 0; align-self: end;"
				        title="Remove this summon profile">
					<i class="fas fa-times"></i>
				</button>
			</div>
		</div>
	`;
}
