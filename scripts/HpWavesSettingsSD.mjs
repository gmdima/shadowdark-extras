/**
 * HP Waves Settings for Shadowdark Extras
 * Allows enabling/disabling HP waves and customizing colors by ancestry
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
export class HpWavesSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static _instance = null;

	static DEFAULT_OPTIONS = {
		id: "sdx-hp-waves-settings",
		classes: ["shadowdark", "shadowdark-extras", "hp-waves-settings-app"],
		tag: "form",
		window: {
			title: "SHADOWDARK_EXTRAS.hp_waves.title",
			resizable: true
		},
		position: {
			width: 500,
			height: "auto"
		},
		form: {
			handler: HpWavesSettingsApp.formHandler,
			submitOnChange: true,
			closeOnSubmit: false
		}
	};

	static PARTS = {
		form: {
			template: `modules/${MODULE_ID}/templates/hp-waves-settings.hbs`
		}
	};

	static show() {
		if (!this._instance) {
			this._instance = new HpWavesSettingsApp();
		}
		this._instance.render({ force: true });
		return this._instance;
	}

	async _prepareContext(options) {
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

	_onRender(context, options) {
		const html = this.element;
		if (!html) return;

		// Add new ancestry color row
		html.querySelector(".sdx-add-ancestry")?.addEventListener("click", (ev) => {
			ev.preventDefault();
			const list = html.querySelector(".sdx-ancestry-list");
			if (!list) return;
			const newIndex = list.querySelectorAll(".sdx-ancestry-row").length;

			const row = document.createElement("div");
			row.className = "sdx-ancestry-row";
			row.dataset.index = String(newIndex);
			row.innerHTML = `
				<input type="text" name="ancestryColors.${newIndex}.ancestry"
					placeholder="${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.ancestry_placeholder")}"
					value="" class="sdx-ancestry-name"/>
				<input type="color" name="ancestryColors.${newIndex}.color" value="#dc2626" class="sdx-ancestry-color"/>
				<button type="button" class="sdx-remove-ancestry" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.remove")}">
					<i class="fas fa-trash"></i>
				</button>
			`;
			list.appendChild(row);
			this.setPosition({ height: "auto" });
		});

		// Remove ancestry color row (event delegation)
		html.addEventListener("click", (ev) => {
			const removeBtn = ev.target.closest(".sdx-remove-ancestry");
			if (!removeBtn) return;
			ev.preventDefault();

			removeBtn.closest(".sdx-ancestry-row")?.remove();

			// Re-index remaining rows
			html.querySelectorAll(".sdx-ancestry-row").forEach((row, i) => {
				row.dataset.index = String(i);
				row.querySelectorAll("input").forEach(input => {
					const oldName = input.getAttribute("name");
					if (oldName) {
						const field = oldName.split(".").pop();
						input.setAttribute("name", `ancestryColors.${i}.${field}`);
					}
				});
			});
			this.setPosition({ height: "auto" });
			// Trigger form submit to persist
			html.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
		});

		// Reset to defaults
		html.querySelector(".sdx-reset-defaults")?.addEventListener("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await foundry.applications.api.DialogV2.confirm({
				window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_confirm_title") },
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_confirm_content")}</p>`,
				modal: true
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "hpWavesSettings", foundry.utils.deepClone(DEFAULT_HP_WAVES_SETTINGS));
				this.render({ force: true });
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.hp_waves.reset_complete"));
			}
		});

		// Save button - close after submit
		html.querySelector('button[name="submit"]')?.addEventListener("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	static async formHandler(event, form, formData) {
		const flat = formData.object;
		const settings = {
			enabled: flat.enabled ?? true,
			defaultColor: flat.defaultColor || "#dc2626",
			ancestryColors: []
		};

		// Collect ancestry colors from form data
		const ancestryData = {};
		for (const [key, value] of Object.entries(flat)) {
			if (key.startsWith("ancestryColors.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];
				if (!ancestryData[index]) ancestryData[index] = {};
				ancestryData[index][field] = value;
			}
		}

		for (const [, data] of Object.entries(ancestryData)) {
			if (data.ancestry && data.ancestry.trim()) {
				settings.ancestryColors.push({
					ancestry: data.ancestry.trim(),
					color: data.color || "#dc2626"
				});
			}
		}

		await game.settings.set(MODULE_ID, "hpWavesSettings", settings);

		// Refresh any open sheets to show changes
		for (const app of foundry.applications.instances.values()) {
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
