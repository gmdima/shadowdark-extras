/**
 * Generate the Give Item configuration HTML for the spell Activity tab
 */
export function generateItemGiveConfigHTML(MODULE_ID, flags, itemsList, itemProfilesArray) {
	return `
		<div class="SD-box sdx-item-give-box grid-colspan-3">
			<div class="header light">
				<label style="display: flex; align-items: center; gap: 0.5rem;">
					<input type="checkbox" name="flags.${MODULE_ID}.itemGive.enabled" 
					       ${flags.enabled ? 'checked' : ''} 
					       class="sdx-item-give-toggle" />
					<span style="font-weight: bold;">Give Item to Caster</span>
				</label>
				<span></span>
			</div>
			<div class="content sdx-item-give-content">
				<div class="SD-grid">
					<h3 style="grid-column: 1 / -1; margin-bottom: 8px;">Items to Give</h3>
					<div class="sdx-item-give-list" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;">
						${itemsList || '<div class="sdx-no-items">Drop an item here to grant it to the caster on success</div>'}
					</div>
					<button type="button" class="sdx-add-item-give-btn" style="grid-column: 1 / -1; margin-top: 8px;">
						<i class="fas fa-plus"></i> Add Item to Give
					</button>
					<input type="hidden" name="flags.${MODULE_ID}.itemGive.profiles" class="sdx-item-give-data" value="${JSON.stringify(itemProfilesArray).replace(/"/g, '&quot;')}" />
				</div>
			</div>
		</div>
	`;
}

export function generateItemGiveProfileHTML(profile, index) {
	return `
		<div class="sdx-item-give-profile" data-index="${index}">
			<div class="SD-grid" style="align-items: center; gap: 4px;">
				<div class="sdx-item-give-drop" style="grid-column: 1 / 2; min-height: 48px; border: 1px dashed #999; border-radius: 4px; padding: 4px; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.1);">
					${profile.itemUuid ? `
						<div class="sdx-item-give-display" data-uuid="${profile.itemUuid}">
							<img src="${profile.itemImg || 'icons/svg/mystery-man.svg'}" alt="${profile.itemName || 'Item'}" style="width: 40px; height: 40px; border-radius: 4px;" />
							<span style="margin-left: 4px; font-size: 0.9em;">${profile.itemName || 'Item'}</span>
						</div>
					` : `
						<span style="color: #999; font-size: 0.85em;">Drop item here</span>
					`}
				</div>
				<input type="hidden" class="sdx-item-give-uuid" value="${profile.itemUuid || ''}" />
				<input type="hidden" class="sdx-item-give-name" value="${profile.itemName || ''}" />
				<input type="hidden" class="sdx-item-give-img" value="${profile.itemImg || ''}" />
				<div style="grid-column: 2 / 3; display: flex; flex-direction: column;">
					<label style="font-size: 0.85em; margin-bottom: 2px; font-weight: bold;">Quantity</label>
					<input type="text" class="sdx-item-give-quantity" value="${profile.quantity || '1'}" placeholder="1 or 1d4" title="Quantity or dice formula to roll" style="width: 100%;" />
				</div>
				<button type="button" class="sdx-remove-item-give-btn" data-index="${index}" 
				        style="grid-column: 4 / 5; width: 32px; height: 32px; padding: 0; align-self: end;" 
				        title="Remove this item">
					<i class="fas fa-times"></i>
				</button>
			</div>
		</div>
	`;
}
