/**
 * Travel Speeds Settings for Shadowdark Extras
 * Allows configuring the travel speeds shown in the Party Sheet Travel tab
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Default travel speeds
const DEFAULT_TRAVEL_SPEEDS = [
	{ key: "slow", name: "Slow" },
	{ key: "normal", name: "Normal" },
	{ key: "fast", name: "Fast" }
];

/**
 * Travel Speeds Settings Application
 */
export class TravelSpeedsSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static _instance = null;

	static DEFAULT_OPTIONS = {
		id: "sdx-travel-speeds-settings",
		classes: ["shadowdark", "shadowdark-extras", "travel-speeds-settings-app"],
		tag: "form",
		window: {
			title: "SHADOWDARK_EXTRAS.travel_speeds.title",
			resizable: true
		},
		position: {
			width: 500,
			height: "auto"
		},
		form: {
			handler: TravelSpeedsSettingsApp.formHandler,
			submitOnChange: true,
			closeOnSubmit: false
		}
	};

	static PARTS = {
		form: {
			template: `modules/${MODULE_ID}/templates/travel-speeds-settings.hbs`,
			scrollable: [".sdx-speeds-list"]
		}
	};

	static show() {
		if (!this._instance) {
			this._instance = new TravelSpeedsSettingsApp();
		}
		this._instance.render({ force: true });
		return this._instance;
	}

	async _prepareContext(options) {
		let speeds = getTravelSpeeds();

		if (!speeds || !Array.isArray(speeds) || speeds.length === 0) {
			speeds = foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS);
		}

		return {
			speeds: speeds.map((speed, index) => ({ ...speed, index })),
			MODULE_ID
		};
	}

	_onRender(context, options) {
		const html = this.element;
		if (!html) return;

		// Add new speed
		html.querySelector(".sdx-add-speed")?.addEventListener("click", (ev) => {
			ev.preventDefault();
			this._addSpeed();
		});

		// Event delegation for row buttons
		html.addEventListener("click", (ev) => {
			if (ev.target.closest(".sdx-remove-speed")) {
				ev.preventDefault();
				this._removeSpeed(ev);
			} else if (ev.target.closest(".sdx-move-up")) {
				ev.preventDefault();
				this._moveSpeed(ev, -1);
			} else if (ev.target.closest(".sdx-move-down")) {
				ev.preventDefault();
				this._moveSpeed(ev, 1);
			}
		});

		// Reset to defaults
		html.querySelector(".sdx-reset-defaults")?.addEventListener("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await foundry.applications.api.DialogV2.confirm({
				window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_confirm_title") },
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_confirm_content")}</p>`,
				modal: true
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "travelSpeeds", { speeds: foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS) });
				this.render({ force: true });
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_complete"));
			}
		});

		// Save button - close after submit
		html.querySelector('button[name="submit"]')?.addEventListener("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	_addSpeed() {
		const html = this.element;
		const list = html?.querySelector(".sdx-speeds-list");
		if (!list) return;
		const newIndex = list.querySelectorAll(".sdx-speed-row").length;
		const newKey = `speed${Date.now()}`;

		const row = document.createElement("div");
		row.className = "sdx-speed-row";
		row.dataset.index = String(newIndex);
		row.innerHTML = `
			<div class="sdx-speed-order">
				<button type="button" class="sdx-move-up" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.move_up")}">
					<i class="fas fa-chevron-up"></i>
				</button>
				<button type="button" class="sdx-move-down" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.move_down")}">
					<i class="fas fa-chevron-down"></i>
				</button>
			</div>
			<input type="hidden" name="speeds.${newIndex}.key" value="${newKey}">
			<input type="text" name="speeds.${newIndex}.name"
				placeholder="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.name_placeholder")}"
				value="" class="sdx-speed-name"/>
			<button type="button" class="sdx-remove-speed" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.remove")}">
				<i class="fas fa-trash"></i>
			</button>
		`;
		list.appendChild(row);
		this.setPosition({ height: "auto" });
	}

	_removeSpeed(ev) {
		ev.target.closest(".sdx-speed-row")?.remove();
		this._reindexRows();
		this.setPosition({ height: "auto" });
		this.element?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
	}

	_moveSpeed(ev, direction) {
		const html = this.element;
		const row = ev.target.closest(".sdx-speed-row");
		const rows = Array.from(html.querySelectorAll(".sdx-speed-row"));
		const currentIndex = rows.indexOf(row);
		const newIndex = currentIndex + direction;

		if (newIndex < 0 || newIndex >= rows.length) return;

		if (direction < 0) {
			rows[newIndex].before(row);
		} else {
			rows[newIndex].after(row);
		}

		this._reindexRows();
		html?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
	}

	_reindexRows() {
		const html = this.element;
		if (!html) return;
		html.querySelectorAll(".sdx-speed-row").forEach((row, i) => {
			row.dataset.index = String(i);
			row.querySelectorAll("input, select").forEach(input => {
				const oldName = input.getAttribute("name");
				if (oldName && oldName.startsWith("speeds.")) {
					const parts = oldName.split(".");
					parts[1] = String(i);
					input.setAttribute("name", parts.join("."));
				}
			});
		});
	}

	static async formHandler(event, form, formData) {
		const flat = formData.object;
		const speedsData = {};

		for (const [key, value] of Object.entries(flat)) {
			if (key.startsWith("speeds.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];
				if (!speedsData[index]) speedsData[index] = {};
				speedsData[index][field] = value;
			}
		}

		// Convert to array and filter out incomplete entries
		const speeds = [];
		const indices = Object.keys(speedsData).map(Number).sort((a, b) => a - b);

		for (const index of indices) {
			const data = speedsData[index];
			if (data.name && data.name.trim()) {
				speeds.push({
					key: data.key || `speed${Date.now()}_${index}`,
					name: data.name.trim()
				});
			}
		}

		await game.settings.set(MODULE_ID, "travelSpeeds", { speeds });

		// Refresh any open party sheets to show changes
		for (const app of foundry.applications.instances.values()) {
			if (app.constructor.name === "PartySheetSD") {
				app.render(false);
			}
		}
	}
}

/**
 * Get the configured travel speeds
 * @returns {Array} Array of travel speed objects
 */
export function getTravelSpeeds() {
	try {
		const saved = game.settings.get(MODULE_ID, "travelSpeeds");
		// Handle both old array format and new object format
		if (saved) {
			if (Array.isArray(saved) && saved.length > 0) {
				return saved;
			}
			if (saved.speeds && Array.isArray(saved.speeds) && saved.speeds.length > 0) {
				return saved.speeds;
			}
		}
	} catch (e) {
		// Setting not registered yet, return defaults
	}
	return foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS);
}

/**
 * Register Travel Speeds settings
 */
export function registerTravelSpeedsSettings() {
	// Register the travel speeds data (not shown in config)
	game.settings.register(MODULE_ID, "travelSpeeds", {
		name: "Travel Speeds Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: { speeds: foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS) }
	});

	// Register a menu button to open the Travel Speeds Settings app
	game.settings.registerMenu(MODULE_ID, "travelSpeedsMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_speeds.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_speeds.label"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_speeds.hint"),
		icon: "fas fa-running",
		type: TravelSpeedsSettingsApp,
		restricted: true
	});
}

export { DEFAULT_TRAVEL_SPEEDS };
