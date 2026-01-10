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
				<label class="sdx-section-checkbox">
					<input type="checkbox" name="flags.${MODULE_ID}.summoning.enabled" 
					       ${flags.enabled ? 'checked' : ''} 
					       class="sdx-summoning-toggle" />
					<span>Summonings</span>
				</label>
				<span></span>
			</div>
			<div class="content sdx-summoning-content">
				<div class="SD-grid">
					<!-- Summons Profiles List -->
					<h3 class="sdx-section-title">Summon Profiles</h3>
					<div class="sdx-summons-list">
						${summonsList || ''}
					</div>
					
					<!-- Add Profile Button -->
					<button type="button" class="sdx-add-summon-btn">
						<i class="fas fa-plus"></i> Add Summon Profile
					</button>
					
					<!-- Hidden input to store JSON data -->
					<input type="hidden" name="flags.${MODULE_ID}.summoning.profiles" class="sdx-summons-data" value="${JSON.stringify(summonProfilesArray).replace(/"/g, '&quot;')}" />
					
					<!-- Delete at expiry option -->
					<div class="sdx-summoning-option" style="margin-top: 8px;">
						<label class="sdx-checkbox-label" style="display: flex; align-items: center; gap: 6px;">
							<input type="checkbox" name="flags.${MODULE_ID}.summoning.deleteAtExpiry" 
							       ${flags.deleteAtExpiry ? 'checked' : ''} />
							<span>Delete at expiry <i class="fas fa-question-circle sdx-help-icon" style="opacity: 0.6; font-size: 0.9em;" title="Automatically delete summoned tokens when the spell duration expires.&#10;Only works during combat with round/turn-based durations."></i></span>
						</label>
					</div>
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
	const truncatedName = (profile.creatureName || 'Unknown').length > 8
		? (profile.creatureName || 'Unknown').substring(0, 8) + '…'
		: (profile.creatureName || 'Unknown');
	return `
		<div class="sdx-summon-profile" data-index="${index}">
			<div class="sdx-profile-grid">
				<!-- Creature Drop Zone -->
				<div class="sdx-summon-creature-drop">
					${profile.creatureUuid ? `
						<div class="sdx-summon-creature-display" data-uuid="${profile.creatureUuid}" title="${profile.creatureName || 'Unknown'}">
							<img src="${profile.creatureImg || 'icons/svg/mystery-man.svg'}" alt="${profile.creatureName || 'Creature'}" />
							<span>${truncatedName}</span>
						</div>
					` : `
						<span><i class="fas fa-crosshairs"></i> Drop creature here</span>
					`}
				</div>
				<input type="hidden" class="sdx-creature-uuid" value="${profile.creatureUuid || ''}" />
				<input type="hidden" class="sdx-creature-name" value="${profile.creatureName || ''}" />
				<input type="hidden" class="sdx-creature-img" value="${profile.creatureImg || ''}" />
				
				<!-- Count Formula -->
				<div class="sdx-profile-field">
					<label>Count</label>
					<input type="text" class="sdx-summon-count" value="${profile.count || '1'}" 
					       placeholder="1, 1d4, etc." 
					       title="Number of creatures to summon. Can be a number or dice formula (e.g., 1d4, 2d6)." />
				</div>
				
				<!-- Display Name -->
				<div class="sdx-profile-field">
					<label>Display Name</label>
					<input type="text" class="sdx-summon-display-name" value="${profile.displayName || ''}" 
					       placeholder="Optional custom name" />
				</div>
				
				<!-- Remove Button -->
				<button type="button" class="sdx-remove-summon-btn" data-index="${index}" 
				        title="Remove this summon profile">
					<i class="fas fa-times"></i>
				</button>
			</div>
		</div>
	`;
}
