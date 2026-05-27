/**
 * Generate the Item Macro configuration HTML
 * @param {string} MODULE_ID - The module identifier
 * @param {object} flags - The item macro flags
 * @param {string} itemType - 'spell' or 'weapon' to customize triggers
 * @returns {string} HTML string
 */
export function generateItemMacroConfigHTML(MODULE_ID, flags, itemType = 'spell') {
	const macroFlags = flags.itemMacro || { enabled: false, runAsGm: false, triggers: [] };
	const runAsGm = macroFlags.runAsGm || false;
	const triggers = macroFlags.triggers || [];

	// Support both native and legacy itemacro flags for the command
	const macroCommand = flags.macroCommand ?? flags.itemacro?.macro?.command ?? "";

	// Define triggers based on item type
	const spellTriggers = [
		{ value: "onCast", label: "Run macro on cast", icon: "fa-magic" },
		{ value: "onSuccess", label: "Run macro on success", icon: "fa-check-circle" },
		{ value: "onCritical", label: "Run macro on critical success", icon: "fa-burst" },
		{ value: "onFailure", label: "Run macro on failure", icon: "fa-times-circle" },
		{ value: "onCriticalFail", label: "Run macro on critical failure", icon: "fa-skull" }
	];

	const potionTriggers = [
		{ value: "onCast", label: "Run macro on drink", icon: "fa-flask" }
	];

	const scrollWandTriggers = [
		{ value: "onCast", label: "Run macro on use", icon: "fa-scroll" }
	];

	const abilityTriggers = [
		{ value: "onUse", label: "Run macro on use", icon: "fa-bolt" }
	];

	// Select triggers based on item type
	let triggerOptions;
	if (itemType === 'potion') {
		triggerOptions = potionTriggers;
	} else if (itemType === 'scroll' || itemType === 'wand') {
		triggerOptions = scrollWandTriggers;
	} else if (itemType === 'classAbility' || itemType === 'npcFeature') {
		triggerOptions = abilityTriggers;
	} else {
		triggerOptions = spellTriggers;
	}

	// Build trigger checkboxes
	const triggerCheckboxesHtml = triggerOptions.map(opt => `
		<label class="sdx-macro-trigger-option">
			<input type="checkbox" class="sdx-spell-macro-trigger-checkbox" 
				data-trigger="${opt.value}" 
				${triggers.includes(opt.value) ? 'checked' : ''} />
			<i class="fas ${opt.icon}"></i>
			<span>${opt.label}</span>
		</label>
	`).join('');


	return `
		<div class="SD-box sdx-item-macro-box grid-colspan-3">
			<div class="header light">
				<label class="sdx-section-label">
					<i class="fas fa-scroll"></i>
					<span>Item Macro</span>
				</label>
			</div>
			<div class="content">
				<div class="SD-grid">
					<div class="sdx-macro-editor-section grid-colspan-3">
						<label class="sdx-triggers-label">Macro Command (JavaScript):</label>
						<textarea class="sdx-item-macro-command" 
							placeholder="// Write your macro here... (actor, token, item, args are available)"
							spellcheck="false">${macroCommand}</textarea>
					</div>

					<div class="sdx-macro-gm-toggle grid-colspan-3">
						<label class="sdx-toggle-label">
							<input type="checkbox" class="sdx-spell-macro-run-as-gm" 
								${runAsGm ? 'checked' : ''} />
							<i class="fas fa-crown"></i>
							<span>Run macro as GM</span>
						</label>
						<p class="hint">Execute the macro with GM permissions using socketlib.</p>
					</div>
					
					<div class="sdx-macro-triggers-section grid-colspan-3">
						<label class="sdx-triggers-label">Execute macro on:</label>
						<div class="sdx-macro-trigger-grid">
							${triggerCheckboxesHtml}
						</div>
					</div>
					
					<details class="sdx-macro-guide grid-colspan-3">
						<summary><i class="fas fa-book-open"></i> Macro Development Guide</summary>
						<div class="sdx-macro-guide-content">
							<h4>Available Arguments</h4>
							<p>SDX provides these variables to your macro:</p>
							<pre><code>// Scope variables:
item          // The spell/item
actor         // The casting actor
token         // The caster's token
speaker       // ChatMessage speaker data
character     // The user's assigned character

// SDX-specific data in args:
args.trigger      // String - which trigger fired
args.isSuccess    // Boolean - did the spell succeed?
args.isFailure    // Boolean - did the spell fail?
args.isCritical   // Boolean - was it a critical success?
args.isCriticalFail // Boolean - was it a critical failure?
args.rollResult   // Spell roll result (total)
args.rollData     // Full roll data object
args.targets      // Array of targeted tokens
args.target       // First target token
args.targetActor  // First target's actor</code></pre>
						</div>
					</details>
				</div>
			</div>
		</div>
	`;
}

/**
 * Get the Item Macro configuration for a spell/item
 * @param {Item} item - The item to get config for
 * @returns {Object} - The macro configuration
 */
export function getItemMacroConfig(item) {
	const MODULE_ID = "shadowdark-extras";
	const flags = item.flags?.[MODULE_ID]?.itemMacro || {};
	return {
		enabled: flags.triggers?.length > 0,
		runAsGm: flags.runAsGm || false,
		triggers: flags.triggers || []
	};
}
