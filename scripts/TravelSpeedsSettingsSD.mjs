/**
 * Travel Speeds Settings for Shadowdark Extras
 * Allows configuring the travel speeds shown in the Party Sheet Travel tab
 */

const MODULE_ID = "shadowdark-extras";

// Default travel speeds
const DEFAULT_TRAVEL_SPEEDS = [
	{ key: "slow", name: "Slow" },
	{ key: "normal", name: "Normal" },
	{ key: "fast", name: "Fast" }
];

/**
 * Travel Speeds Settings Application
 */
export class TravelSpeedsSettingsApp extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "sdx-travel-speeds-settings",
			title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.title"),
			template: `modules/${MODULE_ID}/templates/travel-speeds-settings.hbs`,
			classes: ["shadowdark", "shadowdark-extras", "travel-speeds-settings-app"],
			width: 500,
			height: "auto",
			resizable: true,
			closeOnSubmit: false,
			submitOnChange: true,
			scrollY: [".sdx-speeds-list"]
		});
	}

	static _instance = null;

	static show() {
		if (!this._instance) {
			this._instance = new TravelSpeedsSettingsApp();
		}
		this._instance.render(true);
		return this._instance;
	}

	getData(options = {}) {
		let speeds = getTravelSpeeds();

		// Ensure we always have speeds to display
		if (!speeds || !Array.isArray(speeds) || speeds.length === 0) {
			speeds = foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS);
		}

		return {
			speeds: speeds.map((speed, index) => ({
				...speed,
				index
			})),
			MODULE_ID
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Store reference to html for use in event handlers
		this._html = html;

		// Add new speed
		html.find(".sdx-add-speed").on("click", (ev) => {
			ev.preventDefault();
			console.log("Shadowdark Extras | Add Speed clicked");
			this._addSpeed(this._html);
		});

		// Remove speed
		html.on("click", ".sdx-remove-speed", (ev) => {
			ev.preventDefault();
			this._removeSpeed(html, ev);
		});

		// Move speed up
		html.on("click", ".sdx-move-up", (ev) => {
			ev.preventDefault();
			this._moveSpeed(html, ev, -1);
		});

		// Move speed down
		html.on("click", ".sdx-move-down", (ev) => {
			ev.preventDefault();
			this._moveSpeed(html, ev, 1);
		});

		// Reset to defaults
		html.find(".sdx-reset-defaults").on("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_confirm_title"),
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_confirm_content")}</p>`
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "travelSpeeds", { speeds: foundry.utils.deepClone(DEFAULT_TRAVEL_SPEEDS) });
				this.render(true);
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.travel_speeds.reset_complete"));
			}
		});

		// Save button - close after submit
		html.find('button[name="submit"]').on("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	_addSpeed(html) {
		// Use element reference if html is stale
		const $html = this.element || html;
		const $list = $html.find(".sdx-speeds-list");
		console.log("Shadowdark Extras | Speeds list found:", $list.length);
		const newIndex = $list.find(".sdx-speed-row").length;
		const newKey = `speed${Date.now()}`;

		const newRow = `
			<div class="sdx-speed-row" data-index="${newIndex}">
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
			</div>
		`;
		$list.append(newRow);
		this.setPosition({ height: "auto" });
	}

	_removeSpeed(html, ev) {
		$(ev.currentTarget).closest(".sdx-speed-row").remove();
		const $html = this.element || html;
		this._reindexRows($html);
		this.setPosition({ height: "auto" });
		this._onSubmit(ev);
	}

	_moveSpeed(html, ev, direction) {
		const $html = this.element || html;
		const $row = $(ev.currentTarget).closest(".sdx-speed-row");
		const $rows = $html.find(".sdx-speed-row");
		const currentIndex = $rows.index($row);
		const newIndex = currentIndex + direction;

		if (newIndex < 0 || newIndex >= $rows.length) return;

		if (direction < 0) {
			$row.insertBefore($rows.eq(newIndex));
		} else {
			$row.insertAfter($rows.eq(newIndex));
		}

		this._reindexRows($html);
		this._onSubmit(ev);
	}

	_reindexRows(html) {
		const $html = this.element || html;
		$html.find(".sdx-speed-row").each((i, row) => {
			$(row).attr("data-index", i);
			$(row).find("input, select").each((j, input) => {
				const $input = $(input);
				const oldName = $input.attr("name");
				if (oldName && oldName.startsWith("speeds.")) {
					const parts = oldName.split(".");
					parts[1] = i;
					$input.attr("name", parts.join("."));
				}
			});
		});
	}

	async _updateObject(event, formData) {
		// Process form data into speeds array
		const speedsData = {};

		for (const [key, value] of Object.entries(formData)) {
			if (key.startsWith("speeds.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];

				if (!speedsData[index]) {
					speedsData[index] = {};
				}

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
		for (const app of Object.values(ui.windows)) {
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
