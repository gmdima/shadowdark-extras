/**
 * Travel Activities Settings for Shadowdark Extras
 * Allows configuring the camping/travel activities shown in the Party Sheet Travel tab
 */

const MODULE_ID = "shadowdark-extras";

// All available abilities for selection
const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

// Default travel activities (matches original hardcoded values)
const DEFAULT_TRAVEL_ACTIVITIES = [
	{ key: "battenDown", name: "Batten Down", abilities: ["INT", "CON"], campfire: true, bannerImage: "modules/shadowdark-extras/assets/travel/batten_down.png" },
	{ key: "cook", name: "Cook", abilities: ["INT", "WIS"], campfire: true, bannerImage: "modules/shadowdark-extras/assets/travel/cook.png" },
	{ key: "craft", name: "Craft", abilities: ["DEX"], campfire: true, bannerImage: "modules/shadowdark-extras/assets/travel/craft.png" },
	{ key: "entertain", name: "Entertain", abilities: ["CHA"], campfire: true, bannerImage: "modules/shadowdark-extras/assets/travel/entertain.png" },
	{ key: "firewood", name: "Firewood", abilities: ["STR", "CON"], campfire: false, bannerImage: "modules/shadowdark-extras/assets/travel/firewood.png" },
	{ key: "hunt", name: "Hunt", abilities: ["STR", "DEX"], campfire: false, bannerImage: "modules/shadowdark-extras/assets/travel/hunt.png" },
	{ key: "keepWatch", name: "Keep Watch", abilities: ["WIS"], campfire: true, bannerImage: "modules/shadowdark-extras/assets/travel/keep_watch.png" },
	{ key: "predict", name: "Predict", abilities: ["INT", "WIS"], campfire: false, bannerImage: "modules/shadowdark-extras/assets/travel/predict.png" }
];

/**
 * Travel Activities Settings Application
 */
export class TravelActivitiesSettingsApp extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "sdx-travel-activities-settings",
			title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.title"),
			template: `modules/${MODULE_ID}/templates/travel-activities-settings.hbs`,
			classes: ["shadowdark", "shadowdark-extras", "travel-activities-settings-app"],
			width: 700,
			height: "auto",
			resizable: true,
			closeOnSubmit: false,
			submitOnChange: true,
			scrollY: [".sdx-activities-list"]
		});
	}

	static _instance = null;

	static show() {
		if (!this._instance) {
			this._instance = new TravelActivitiesSettingsApp();
		}
		this._instance.render(true);
		return this._instance;
	}

	getData(options = {}) {
		let activities = getTravelActivities();

		// Ensure we always have activities to display
		if (!activities || !Array.isArray(activities) || activities.length === 0) {
			activities = foundry.utils.deepClone(DEFAULT_TRAVEL_ACTIVITIES);
		}

		return {
			activities: activities.map((activity, index) => ({
				...activity,
				index,
				abilitiesSelected: ABILITIES.map(ab => ({
					value: ab,
					label: ab,
					selected: (activity.abilities || []).includes(ab)
				}))
			})),
			ABILITIES,
			MODULE_ID
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Store reference to html for use in event handlers
		this._html = html;

		// Add new activity
		html.find(".sdx-add-activity").on("click", (ev) => {
			ev.preventDefault();
			console.log("Shadowdark Extras | Add Activity clicked");
			this._addActivity(this._html);
		});

		// Remove activity
		html.on("click", ".sdx-remove-activity", (ev) => {
			ev.preventDefault();
			this._removeActivity(html, ev);
		});

		// Move activity up
		html.on("click", ".sdx-move-up", (ev) => {
			ev.preventDefault();
			this._moveActivity(html, ev, -1);
		});

		// Move activity down
		html.on("click", ".sdx-move-down", (ev) => {
			ev.preventDefault();
			this._moveActivity(html, ev, 1);
		});

		// Reset to defaults
		html.find(".sdx-reset-defaults").on("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_confirm_title"),
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_confirm_content")}</p>`
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "travelActivities", { activities: foundry.utils.deepClone(DEFAULT_TRAVEL_ACTIVITIES) });
				this.render(true);
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_complete"));
			}
		});

		// File picker for banner image
		html.on("click", ".sdx-file-picker", (ev) => {
			ev.preventDefault();
			const button = ev.currentTarget;
			const index = button.dataset.index;
			const input = html.find(`input[name="activities.${index}.bannerImage"]`);

			const fp = new FilePicker({
				type: "image",
				current: input.val(),
				callback: (path) => {
					input.val(path);
					this._onSubmit(ev);
				}
			});
			fp.browse();
		});

		// Save button - close after submit
		html.find('button[name="submit"]').on("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	_addActivity(html) {
		// Use element reference if html is stale
		const $html = this.element || html;
		const $list = $html.find(".sdx-activities-list");
		console.log("Shadowdark Extras | Activities list found:", $list.length);
		const newIndex = $list.find(".sdx-activity-row").length;
		const newKey = `activity${Date.now()}`;

		const abilitiesCheckboxes = ABILITIES.map(ab => `
			<label class="sdx-ability-checkbox">
				<input type="checkbox" name="activities.${newIndex}.abilities" value="${ab}">
				${ab}
			</label>
		`).join("");

		const newRow = `
			<div class="sdx-activity-row" data-index="${newIndex}">
				<div class="sdx-activity-header">
					<div class="sdx-activity-order">
						<button type="button" class="sdx-move-up" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.move_up")}">
							<i class="fas fa-chevron-up"></i>
						</button>
						<button type="button" class="sdx-move-down" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.move_down")}">
							<i class="fas fa-chevron-down"></i>
						</button>
					</div>
					<input type="hidden" name="activities.${newIndex}.key" value="${newKey}">
					<input type="text" name="activities.${newIndex}.name"
						placeholder="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.name_placeholder")}"
						value="" class="sdx-activity-name"/>
					<button type="button" class="sdx-remove-activity" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.remove")}">
						<i class="fas fa-trash"></i>
					</button>
				</div>
				<div class="sdx-activity-body">
					<div class="sdx-activity-abilities">
						<label>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.abilities")}:</label>
						<div class="sdx-abilities-grid">
							${abilitiesCheckboxes}
						</div>
					</div>
					<div class="sdx-activity-options">
						<label class="sdx-campfire-checkbox">
							<input type="checkbox" name="activities.${newIndex}.campfire">
							${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.campfire")}
						</label>
					</div>
					<div class="sdx-activity-banner">
						<label>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.banner_image")}:</label>
						<div class="sdx-banner-input">
							<input type="text" name="activities.${newIndex}.bannerImage" value="" class="sdx-banner-path"/>
							<button type="button" class="sdx-file-picker" data-index="${newIndex}" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.browse")}">
								<i class="fas fa-file-image"></i>
							</button>
						</div>
					</div>
				</div>
			</div>
		`;
		$list.append(newRow);
		this.setPosition({ height: "auto" });
	}

	_removeActivity(html, ev) {
		$(ev.currentTarget).closest(".sdx-activity-row").remove();
		const $html = this.element || html;
		this._reindexRows($html);
		this.setPosition({ height: "auto" });
		this._onSubmit(ev);
	}

	_moveActivity(html, ev, direction) {
		const $html = this.element || html;
		const $row = $(ev.currentTarget).closest(".sdx-activity-row");
		const $rows = $html.find(".sdx-activity-row");
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
		$html.find(".sdx-activity-row").each((i, row) => {
			$(row).attr("data-index", i);
			$(row).find("input, select").each((j, input) => {
				const $input = $(input);
				const oldName = $input.attr("name");
				if (oldName && oldName.startsWith("activities.")) {
					const parts = oldName.split(".");
					parts[1] = i;
					$input.attr("name", parts.join("."));
				}
			});
			$(row).find(".sdx-file-picker").attr("data-index", i);
		});
	}

	async _updateObject(event, formData) {
		// Process form data into activities array
		const activitiesData = {};

		for (const [key, value] of Object.entries(formData)) {
			if (key.startsWith("activities.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];

				if (!activitiesData[index]) {
					activitiesData[index] = { abilities: [] };
				}

				if (field === "abilities") {
					// Handle checkbox array for abilities
					if (value === true || value === "on") {
						// This shouldn't happen with our structure, but handle it
					} else if (typeof value === "string") {
						activitiesData[index].abilities.push(value);
					} else if (Array.isArray(value)) {
						activitiesData[index].abilities = value;
					}
				} else if (field === "campfire") {
					activitiesData[index].campfire = value === true || value === "on" || value === "true";
				} else {
					activitiesData[index][field] = value;
				}
			}
		}

		// Convert to array and filter out incomplete entries
		const activities = [];
		const indices = Object.keys(activitiesData).map(Number).sort((a, b) => a - b);

		for (const index of indices) {
			const data = activitiesData[index];
			if (data.name && data.name.trim()) {
				// Filter out empty strings from abilities array
				const filteredAbilities = (data.abilities || []).filter(ab => ab && ab.trim());
				activities.push({
					key: data.key || `activity${Date.now()}_${index}`,
					name: data.name.trim(),
					abilities: filteredAbilities,
					campfire: data.campfire ?? false,
					bannerImage: data.bannerImage || ""
				});
			}
		}

		await game.settings.set(MODULE_ID, "travelActivities", { activities });

		// Refresh any open party sheets to show changes
		for (const app of Object.values(ui.windows)) {
			if (app.constructor.name === "PartySheetSD") {
				app.render(false);
			}
		}
	}
}

/**
 * Get the configured travel activities
 * @returns {Array} Array of travel activity objects
 */
export function getTravelActivities() {
	try {
		const saved = game.settings.get(MODULE_ID, "travelActivities");
		// Handle both old array format and new object format
		if (saved) {
			if (Array.isArray(saved) && saved.length > 0) {
				return saved;
			}
			if (saved.activities && Array.isArray(saved.activities) && saved.activities.length > 0) {
				return saved.activities;
			}
		}
	} catch (e) {
		// Setting not registered yet, return defaults
	}
	return foundry.utils.deepClone(DEFAULT_TRAVEL_ACTIVITIES);
}

/**
 * Register Travel Activities settings
 */
export function registerTravelActivitiesSettings() {
	// Register the travel activities data (not shown in config)
	game.settings.register(MODULE_ID, "travelActivities", {
		name: "Travel Activities Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: { activities: foundry.utils.deepClone(DEFAULT_TRAVEL_ACTIVITIES) }
	});

	// Register a menu button to open the Travel Activities Settings app
	game.settings.registerMenu(MODULE_ID, "travelActivitiesMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_activities.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_activities.label"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.travel_activities.hint"),
		icon: "fas fa-campground",
		type: TravelActivitiesSettingsApp,
		restricted: true
	});
}

export { DEFAULT_TRAVEL_ACTIVITIES, ABILITIES };
