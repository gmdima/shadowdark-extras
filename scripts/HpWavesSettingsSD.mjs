/**
 * HP Waves Settings for Shadowdark Extras
 * Allows enabling/disabling HP waves and customizing colors by ancestry
 */

const MODULE_ID = "shadowdark-extras";

// Default settings
const DEFAULT_HP_WAVES_SETTINGS = {
	enabled: true,
	defaultColor: "#dc2626", // Red
	ancestryColors: [
		// Example entries - users can add their own
	]
};

/**
 * HP Waves Settings Application
 */
export class HpWavesSettingsApp extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "sdx-hp-waves-settings",
			title: game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.title"),
			template: `modules/${MODULE_ID}/templates/hp-waves-settings.hbs`,
			classes: ["shadowdark", "shadowdark-extras", "hp-waves-settings-app"],
			width: 500,
			height: "auto",
			resizable: true,
			closeOnSubmit: false,
			submitOnChange: true
		});
	}

	static _instance = null;

	static show() {
		if (!this._instance) {
			this._instance = new HpWavesSettingsApp();
		}
		this._instance.render(true);
		return this._instance;
	}

	getData(options = {}) {
		const savedSettings = game.settings.get(MODULE_ID, "hpWavesSettings");
		const settings = foundry.utils.mergeObject(
			foundry.utils.deepClone(DEFAULT_HP_WAVES_SETTINGS),
			savedSettings || {},
			{ inplace: false, recursive: true }
		);

		return {
			enabled: settings.enabled,
			defaultColor: settings.defaultColor,
			ancestryColors: settings.ancestryColors || [],
			MODULE_ID
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Add new ancestry color row
		html.find(".sdx-add-ancestry").on("click", (ev) => {
			ev.preventDefault();
			const $list = html.find(".sdx-ancestry-list");
			const newIndex = $list.find(".sdx-ancestry-row").length;
			
			const newRow = `
				<div class="sdx-ancestry-row" data-index="${newIndex}">
					<input type="text" name="ancestryColors.${newIndex}.ancestry" 
						placeholder="${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.ancestry_placeholder")}" 
						value="" class="sdx-ancestry-name"/>
					<input type="color" name="ancestryColors.${newIndex}.color" value="#dc2626" class="sdx-ancestry-color"/>
					<button type="button" class="sdx-remove-ancestry" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.remove")}">
						<i class="fas fa-trash"></i>
					</button>
				</div>
			`;
			$list.append(newRow);
			this.setPosition({ height: "auto" });
		});

		// Remove ancestry color row
		html.on("click", ".sdx-remove-ancestry", (ev) => {
			ev.preventDefault();
			$(ev.currentTarget).closest(".sdx-ancestry-row").remove();
			// Re-index remaining rows
			html.find(".sdx-ancestry-row").each((i, row) => {
				$(row).attr("data-index", i);
				$(row).find("input").each((j, input) => {
					const $input = $(input);
					const oldName = $input.attr("name");
					if (oldName) {
						const field = oldName.split(".").pop();
						$input.attr("name", `ancestryColors.${i}.${field}`);
					}
				});
			});
			this.setPosition({ height: "auto" });
			// Trigger form change to save
			this._onSubmit(ev);
		});

		// Reset to defaults
		html.find(".sdx-reset-defaults").on("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_confirm_title"),
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_confirm_content")}</p>`
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "hpWavesSettings", foundry.utils.deepClone(DEFAULT_HP_WAVES_SETTINGS));
				this.render(true);
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_complete"));
			}
		});

		// Save button - close after submit
		html.find('button[name="submit"]').on("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	async _updateObject(event, formData) {
		// Process form data into settings object
		const settings = {
			enabled: formData.enabled ?? true,
			defaultColor: formData.defaultColor || "#dc2626",
			ancestryColors: []
		};

		// Collect ancestry colors from form data
		const ancestryData = {};
		for (const [key, value] of Object.entries(formData)) {
			if (key.startsWith("ancestryColors.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];
				if (!ancestryData[index]) ancestryData[index] = {};
				ancestryData[index][field] = value;
			}
		}

		// Convert to array, filtering out empty entries
		for (const [index, data] of Object.entries(ancestryData)) {
			if (data.ancestry && data.ancestry.trim()) {
				settings.ancestryColors.push({
					ancestry: data.ancestry.trim(),
					color: data.color || "#dc2626"
				});
			}
		}

		await game.settings.set(MODULE_ID, "hpWavesSettings", settings);
		
		// Refresh any open sheets to show changes
		for (const app of Object.values(ui.windows)) {
			if (app.constructor.name === "PlayerSheetSD" || app.constructor.name === "ShadowdarkPartySheet") {
				app.render(false);
			}
		}
	}
}

/**
 * Get the wave color for an actor based on ancestry settings
 * @param {Actor} actor - The actor to get color for (optional, for future use)
 * @param {string} ancestryName - The resolved ancestry name
 * @returns {string} - The hex color for the waves
 */
export function getHpWaveColor(actor, ancestryName = "") {
	const settings = game.settings.get(MODULE_ID, "hpWavesSettings");
	if (!settings) return "#dc2626";

	if (ancestryName && settings.ancestryColors) {
		// Find matching ancestry (case-insensitive)
		const match = settings.ancestryColors.find(ac => 
			ac.ancestry.toLowerCase() === ancestryName.toLowerCase()
		);
		if (match) return match.color;
	}

	return settings.defaultColor || "#dc2626";
}

/**
 * Check if HP waves are enabled
 * @returns {boolean}
 */
export function isHpWavesEnabled() {
	const settings = game.settings.get(MODULE_ID, "hpWavesSettings");
	return settings?.enabled ?? true;
}

/**
 * Register HP waves settings
 */
export function registerHpWavesSettings() {
	// Register the HP waves settings data (not shown in config)
	game.settings.register(MODULE_ID, "hpWavesSettings", {
		name: "HP Waves Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: foundry.utils.deepClone(DEFAULT_HP_WAVES_SETTINGS)
	});

	// Register a menu button to open the HP Waves Settings app
	game.settings.registerMenu(MODULE_ID, "hpWavesSettingsMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.hp_waves.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.hp_waves.label"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.hp_waves.hint"),
		icon: "fas fa-water",
		type: HpWavesSettingsApp,
		restricted: true
	});
}

export { DEFAULT_HP_WAVES_SETTINGS };
