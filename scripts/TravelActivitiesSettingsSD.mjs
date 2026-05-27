/**
 * Travel Activities Settings for Shadowdark Extras
 * Allows configuring the camping/travel activities shown in the Party Sheet Travel tab
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
export class TravelActivitiesSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	static _instance = null;

	static DEFAULT_OPTIONS = {
		id: "sdx-travel-activities-settings",
		classes: ["shadowdark", "shadowdark-extras", "travel-activities-settings-app"],
		tag: "form",
		window: {
			title: "SHADOWDARK_EXTRAS.travel_activities.title",
			resizable: true
		},
		position: {
			width: 700,
			height: "auto"
		},
		form: {
			handler: TravelActivitiesSettingsApp.formHandler,
			submitOnChange: true,
			closeOnSubmit: false
		}
	};

	static PARTS = {
		form: {
			template: `modules/${MODULE_ID}/templates/travel-activities-settings.hbs`,
			scrollable: [".sdx-activities-list"]
		}
	};

	static show() {
		if (!this._instance) {
			this._instance = new TravelActivitiesSettingsApp();
		}
		this._instance.render({ force: true });
		return this._instance;
	}

	async _prepareContext(options) {
		let activities = getTravelActivities();

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

	_onRender(context, options) {
		const html = this.element;
		if (!html) return;

		// Add new activity
		html.querySelector(".sdx-add-activity")?.addEventListener("click", (ev) => {
			ev.preventDefault();
			this._addActivity();
		});

		// Event delegation for row buttons
		html.addEventListener("click", (ev) => {
			if (ev.target.closest(".sdx-remove-activity")) {
				ev.preventDefault();
				this._removeActivity(ev);
			} else if (ev.target.closest(".sdx-move-up")) {
				ev.preventDefault();
				this._moveActivity(ev, -1);
			} else if (ev.target.closest(".sdx-move-down")) {
				ev.preventDefault();
				this._moveActivity(ev, 1);
			} else if (ev.target.closest(".sdx-file-picker")) {
				ev.preventDefault();
				const button = ev.target.closest(".sdx-file-picker");
				const index = button.dataset.index;
				const input = html.querySelector(`input[name="activities.${index}.bannerImage"]`);
				const fp = new foundry.applications.apps.FilePicker.implementation({
					type: "image",
					current: input?.value || "",
					callback: (path) => {
						if (input) input.value = path;
						html.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
					}
				});
				fp.browse();
			}
		});

		// Reset to defaults
		html.querySelector(".sdx-reset-defaults")?.addEventListener("click", async (ev) => {
			ev.preventDefault();
			const confirmed = await foundry.applications.api.DialogV2.confirm({
				window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_confirm_title") },
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_confirm_content")}</p>`,
				modal: true
			});
			if (confirmed) {
				await game.settings.set(MODULE_ID, "travelActivities", { activities: foundry.utils.deepClone(DEFAULT_TRAVEL_ACTIVITIES) });
				this.render({ force: true });
				ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.travel_activities.reset_complete"));
			}
		});

		// Save button - close after submit
		html.querySelector('button[name="submit"]')?.addEventListener("click", () => {
			setTimeout(() => this.close(), 100);
		});
	}

	_addActivity() {
		const html = this.element;
		const list = html?.querySelector(".sdx-activities-list");
		if (!list) return;
		const newIndex = list.querySelectorAll(".sdx-activity-row").length;
		const newKey = `activity${Date.now()}`;

		const abilitiesCheckboxes = ABILITIES.map(ab => `
			<label class="sdx-ability-checkbox">
				<input type="checkbox" name="activities.${newIndex}.abilities" value="${ab}">
				${ab}
			</label>
		`).join("");

		const row = document.createElement("div");
		row.className = "sdx-activity-row";
		row.dataset.index = String(newIndex);
		row.innerHTML = `
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
		`;
		list.appendChild(row);
		this.setPosition({ height: "auto" });
	}

	_removeActivity(ev) {
		ev.target.closest(".sdx-activity-row")?.remove();
		this._reindexRows();
		this.setPosition({ height: "auto" });
		this.element?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
	}

	_moveActivity(ev, direction) {
		const html = this.element;
		const row = ev.target.closest(".sdx-activity-row");
		const rows = Array.from(html.querySelectorAll(".sdx-activity-row"));
		const currentIndex = rows.indexOf(row);
		const newIndex = currentIndex + direction;

		if (newIndex < 0 || newIndex >= rows.length) return;

		if (direction < 0) rows[newIndex].before(row);
		else rows[newIndex].after(row);

		this._reindexRows();
		html?.dispatchEvent(new SubmitEvent("submit", { cancelable: true }));
	}

	_reindexRows() {
		const html = this.element;
		if (!html) return;
		html.querySelectorAll(".sdx-activity-row").forEach((row, i) => {
			row.dataset.index = String(i);
			row.querySelectorAll("input, select").forEach(input => {
				const oldName = input.getAttribute("name");
				if (oldName && oldName.startsWith("activities.")) {
					const parts = oldName.split(".");
					parts[1] = String(i);
					input.setAttribute("name", parts.join("."));
				}
			});
			row.querySelector(".sdx-file-picker")?.setAttribute("data-index", String(i));
		});
	}

	static async formHandler(event, form, formData) {
		const flat = formData.object;
		const activitiesData = {};

		for (const [key, value] of Object.entries(flat)) {
			if (key.startsWith("activities.")) {
				const parts = key.split(".");
				const index = parseInt(parts[1]);
				const field = parts[2];

				if (!activitiesData[index]) activitiesData[index] = { abilities: [] };

				if (field === "abilities") {
					if (typeof value === "string") {
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

		const activities = [];
		const indices = Object.keys(activitiesData).map(Number).sort((a, b) => a - b);

		for (const index of indices) {
			const data = activitiesData[index];
			if (data.name && data.name.trim()) {
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

		for (const app of foundry.applications.instances.values()) {
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
