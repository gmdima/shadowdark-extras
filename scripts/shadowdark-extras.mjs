/**
 * Shadowdark Extras Module
 * Adds Renown tracking, additional light sources, NPC inventory, and Party management to Shadowdark RPG
 */

import PartySheetSD from "./PartySheetSD.mjs";
import TradeWindowSD, { initializeTradeSocket, showTradeDialog, ensureTradeJournal } from "./TradeWindowSD.mjs";
import { CombatSettingsApp, registerCombatSettings, injectDamageCard, setupCombatSocket } from "./CombatSettingsSD.mjs";
import { generateSpellConfig, generatePotionConfig, generateScrollConfig, generateWandConfig } from "./templates/ItemTypeConfigs.mjs";
import { 
	injectWeaponBonusTab, 
	getWeaponBonuses, 
	getWeaponEffectsToApply, 
	evaluateRequirements,
	calculateWeaponBonusDamage,
	injectWeaponBonusDisplay
} from "./WeaponBonusConfig.mjs";

const MODULE_ID = "shadowdark-extras";
const TRADE_JOURNAL_NAME = "__sdx_trade_sync__"; // Must match TradeWindowSD.mjs

// ============================================
// INVENTORY STYLES APP
// ============================================

/**
 * Default inventory style configuration
 */
const DEFAULT_INVENTORY_STYLES = {
	enabled: false,
	categories: {
		magical: {
			enabled: true,
			label: "Magical Items",
			priority: 10, // Higher priority = applied first (can be overridden)
			backgroundColor: "#4a1a7a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#e0b0ff",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #9b59b6",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		unidentified: {
			enabled: true,
			label: "Unidentified Items",
			priority: 20,
			backgroundColor: "#5a3a1a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#ffd700",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #f39c12",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		container: {
			enabled: true,
			label: "Containers",
			priority: 5,
			backgroundColor: "#1a4a3a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#98d8c8",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #27ae60",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Weapon: {
			enabled: false,
			label: "Weapons",
			priority: 1,
			backgroundColor: "#4a1a1a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#ff9999",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #c0392b",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Armor: {
			enabled: false,
			label: "Armor",
			priority: 1,
			backgroundColor: "#1a3a5a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#99ccff",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #2980b9",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Scroll: {
			enabled: false,
			label: "Scrolls",
			priority: 1,
			backgroundColor: "#5a4a1a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#ffe4b5",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #d4a574",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Potion: {
			enabled: false,
			label: "Potions",
			priority: 1,
			backgroundColor: "#1a5a4a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#98ff98",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #2ecc71",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Wand: {
			enabled: false,
			label: "Wands",
			priority: 1,
			backgroundColor: "#4a1a5a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#dda0dd",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #8e44ad",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		},
		Basic: {
			enabled: false,
			label: "Basic Items",
			priority: 0,
			backgroundColor: "#3a3a3a",
			useGradient: true,
			gradientEndColor: "transparent",
			textColor: "#cccccc",
			textShadow: "1px 1px 2px #000",
			borderLeft: "3px solid #666666",
			descriptionTextColor: "",
			descriptionTextShadow: ""
		}
	}
};

/**
 * Application for editing inventory item styles
 */
class InventoryStylesApp extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "sdx-inventory-styles",
			title: game.i18n.localize("SHADOWDARK_EXTRAS.inventory_styles.title"),
			template: `modules/${MODULE_ID}/templates/inventory-styles.hbs`,
			classes: ["shadowdark", "shadowdark-extras", "inventory-styles-app"],
			width: 900,
			height: 750,
			resizable: true,
			closeOnSubmit: false,
			submitOnChange: true
		});
	}

	static _instance = null;

	static show() {
		if (!this._instance) {
			this._instance = new InventoryStylesApp();
		}
		this._instance.render(true);
		return this._instance;
	}

	getData(options = {}) {
		// Get saved settings and merge with defaults to ensure all properties exist
		const savedStyles = game.settings.get(MODULE_ID, "inventoryStyles");
		const styles = foundry.utils.mergeObject(
			foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES), 
			savedStyles || {},
			{inplace: false, recursive: true}
		);
		
		const containersEnabled = game.settings.get(MODULE_ID, "enableContainers");
		const unidentifiedEnabled = game.settings.get(MODULE_ID, "enableUnidentified");

		// Build category list with visibility flags
		const categories = Object.entries(styles.categories).map(([key, config]) => {
			// Hide container category if containers not enabled
			if (key === "container" && !containersEnabled) return null;
			// Hide unidentified category if unidentified not enabled
			if (key === "unidentified" && !unidentifiedEnabled) return null;

			// Convert "transparent" to a usable color picker value
			const gradientEndColorPicker = (!config.gradientEndColor || config.gradientEndColor === "transparent") 
				? "#ffffff" 
				: config.gradientEndColor;

			return {
				key,
				...config,
				gradientEndColorPicker,
				isSpecial: ["magical", "unidentified", "container"].includes(key)
			};
		}).filter(Boolean);

		// Sort by priority (descending) then by label
		categories.sort((a, b) => {
			if (b.priority !== a.priority) return b.priority - a.priority;
			return a.label.localeCompare(b.label);
		});

		return {
			enabled: styles.enabled,
			categories,
			MODULE_ID
		};
	}

	activateListeners(html) {
		super.activateListeners(html);

		// ---- Tab Navigation ----
		html.find(".sdx-tab").on("click", (ev) => {
			const $tab = $(ev.currentTarget);
			const categoryKey = $tab.data("category");
			
			// Update tab states
			html.find(".sdx-tab").removeClass("active");
			$tab.addClass("active");
			
			// Update panel states
			html.find(".sdx-panel").removeClass("active");
			html.find(`.sdx-panel[data-category="${categoryKey}"]`).addClass("active");
		});

		// ---- Color Pickers ----
		html.find('input[type="color"]').on("input", (ev) => {
			const input = ev.currentTarget;
			const fieldName = input.dataset.edit;
			if (fieldName) {
				const textInput = html.find(`input[type="text"][name="${fieldName}"]`);
				if (textInput.length) {
					textInput.val(input.value);
				}
			}
			this._updateLivePreview(html);
		});

		// Text input change for colors - sync back to color picker
		html.find('.sdx-color-text').on("input", (ev) => {
			const input = ev.currentTarget;
			const fieldName = input.name;
			const colorInput = html.find(`input[type="color"][data-edit="${fieldName}"]`);
			if (colorInput.length && this._isValidColor(input.value)) {
				colorInput.val(this._normalizeColor(input.value));
			}
			this._updateLivePreview(html);
		});

		// ---- Range Sliders ----
		html.find('input[type="range"]').on("input", (ev) => {
			const $input = $(ev.currentTarget);
			const $valueDisplay = $input.siblings(".sdx-range-value");
			const value = $input.val();
			
			// Update display value
			if ($input.hasClass("sdx-border-width")) {
				$valueDisplay.text(`${value}px`);
				this._updateBorderValue($input.closest(".sdx-border-builder"));
			} else if ($input.hasClass("sdx-shadow-x") || $input.hasClass("sdx-shadow-y") || $input.hasClass("sdx-shadow-blur")) {
				$valueDisplay.text(`${value}px`);
				this._updateShadowValue($input.closest(".sdx-shadow-popup"));
			} else if ($input.attr("name")?.includes("priority")) {
				$valueDisplay.text(value);
			}
			
			this._updateLivePreview(html);
		});

		// ---- Checkbox changes ----
		html.find('input[type="checkbox"]').on("change", (ev) => {
			const $checkbox = $(ev.currentTarget);
			const $panel = $checkbox.closest(".sdx-panel");
			
			// Update tab indicator when enabled state changes
			if ($checkbox.attr("name")?.includes(".enabled")) {
				const categoryKey = $panel.data("category");
				const $tab = html.find(`.sdx-tab[data-category="${categoryKey}"]`);
				const isEnabled = $checkbox.is(":checked");
				$tab.find(".sdx-tab-enabled").toggle(isEnabled);
			}
			
			this._updateLivePreview(html);
		});

		// ---- Shadow Builder Toggle ----
		html.find(".sdx-shadow-toggle").on("click", (ev) => {
			ev.preventDefault();
			const $btn = $(ev.currentTarget);
			const shadowType = $btn.data("target");
			const $section = $btn.closest(".sdx-control-section");
			const $popup = $section.find(`.sdx-shadow-popup[data-shadow-type="${shadowType}"]`);
			
			// Parse existing shadow value and populate controls
			const $valueInput = $section.find(`.sdx-shadow-value[data-shadow-type="${shadowType}"]`);
			const shadowValue = $valueInput.val() || "";
			this._parseShadowToControls($popup, shadowValue);
			
			$popup.slideToggle(200);
		});

		// ---- Shadow Control Updates ----
		html.find(".sdx-shadow-popup input").on("input", (ev) => {
			const $popup = $(ev.currentTarget).closest(".sdx-shadow-popup");
			this._updateShadowValue($popup);
			this._updateShadowPreview($popup);
			this._updateLivePreview(html);
		});

		// ---- Remove Shadow Button ----
		html.find(".sdx-shadow-remove").on("click", (ev) => {
			ev.preventDefault();
			const $popup = $(ev.currentTarget).closest(".sdx-shadow-popup");
			const shadowType = $popup.data("shadow-type");
			const $section = $popup.closest(".sdx-control-section");
			
			// Set shadow value to empty string (no shadow)
			$section.find(`.sdx-shadow-value[data-shadow-type="${shadowType}"]`).val("").trigger("change");
			
			// Reset preview
			$popup.find(".sdx-shadow-preview-text").css("text-shadow", "none");
			
			// Close the popup
			$popup.slideUp(200);
			
			// Update live preview
			this._updateLivePreview(html);
		});

		// ---- Border Builder Controls ----
		html.find(".sdx-border-builder input, .sdx-border-builder select").on("input change", (ev) => {
			const $builder = $(ev.currentTarget).closest(".sdx-border-builder");
			this._updateBorderValue($builder);
			this._updateLivePreview(html);
		});

		// ---- Initialize Border Controls from Values ----
		html.find(".sdx-border-builder").each((i, builder) => {
			this._parseBorderToControls($(builder));
		});

		// ---- Presets Panel Toggle ----
		html.find(".sdx-presets-btn").on("click", (ev) => {
			ev.preventDefault();
			html.find(".sdx-presets-panel").slideToggle(200);
		});

		// ---- Preset Selection ----
		html.find(".sdx-preset-card").on("click", async (ev) => {
			ev.preventDefault();
			const preset = $(ev.currentTarget).data("preset");
			await this._applyPreset(preset);
		});

		// ---- Export Theme ----
		html.find(".sdx-export-btn").on("click", async (ev) => {
			ev.preventDefault();
			await this._exportTheme();
		});

		// ---- Import Theme ----
		html.find(".sdx-import-btn").on("click", (ev) => {
			ev.preventDefault();
			this._importTheme();
		});

		// ---- Reset Button ----
		html.find(".sdx-reset-styles").on("click", async (ev) => {
			ev.preventDefault();
			const confirm = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.inventory_styles.reset_confirm_title"),
				content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.inventory_styles.reset_confirm_content")}</p>`,
				yes: () => true,
				no: () => false
			});
			if (confirm) {
				await game.settings.set(MODULE_ID, "inventoryStyles", foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES));
				applyInventoryStyles();
				this.render();
			}
		});

		// Initialize live previews
		this._updateLivePreview(html);
	}

	// ---- Helper Methods ----

	_isValidColor(color) {
		if (!color) return false;
		if (color === "transparent") return true;
		const s = new Option().style;
		s.color = color;
		return s.color !== "";
	}

	_normalizeColor(color) {
		if (!color || color === "transparent") return color;
		const ctx = document.createElement("canvas").getContext("2d");
		ctx.fillStyle = color;
		return ctx.fillStyle;
	}

	_parseShadowToControls($popup, shadowValue) {
		// Parse shadow string like "1px 2px 3px #000"
		const match = shadowValue.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px\s+(#[0-9a-fA-F]{3,8}|[a-z]+)/);
		if (match) {
			$popup.find(".sdx-shadow-x").val(match[1]).siblings(".sdx-range-value").text(`${match[1]}px`);
			$popup.find(".sdx-shadow-y").val(match[2]).siblings(".sdx-range-value").text(`${match[2]}px`);
			$popup.find(".sdx-shadow-blur").val(match[3]).siblings(".sdx-range-value").text(`${match[3]}px`);
			$popup.find(".sdx-shadow-color").val(this._normalizeColor(match[4]) || "#000000");
		}
		this._updateShadowPreview($popup);
	}

	_updateShadowValue($popup) {
		const x = $popup.find(".sdx-shadow-x").val();
		const y = $popup.find(".sdx-shadow-y").val();
		const blur = $popup.find(".sdx-shadow-blur").val();
		const color = $popup.find(".sdx-shadow-color").val();
		const shadowType = $popup.data("shadow-type");
		const shadowValue = `${x}px ${y}px ${blur}px ${color}`;
		
		const $section = $popup.closest(".sdx-control-section");
		$section.find(`.sdx-shadow-value[data-shadow-type="${shadowType}"]`).val(shadowValue).trigger("change");
	}

	_updateShadowPreview($popup) {
		const x = $popup.find(".sdx-shadow-x").val();
		const y = $popup.find(".sdx-shadow-y").val();
		const blur = $popup.find(".sdx-shadow-blur").val();
		const color = $popup.find(".sdx-shadow-color").val();
		$popup.find(".sdx-shadow-preview-text").css("text-shadow", `${x}px ${y}px ${blur}px ${color}`);
	}

	_parseBorderToControls($builder) {
		const borderValue = $builder.find(".sdx-border-value").val() || "3px solid #9b59b6";
		const match = borderValue.match(/(\d+)px\s+(\w+)\s+(#[0-9a-fA-F]{3,8}|[a-z]+)/);
		if (match) {
			$builder.find(".sdx-border-width").val(match[1]).siblings(".sdx-range-value").text(`${match[1]}px`);
			$builder.find(".sdx-border-style").val(match[2]);
			$builder.find(".sdx-border-color").val(this._normalizeColor(match[3]) || "#9b59b6");
		}
	}

	_updateBorderValue($builder) {
		const width = $builder.find(".sdx-border-width").val();
		const style = $builder.find(".sdx-border-style").val();
		const color = $builder.find(".sdx-border-color").val();
		const borderValue = `${width}px ${style} ${color}`;
		$builder.find(".sdx-border-value").val(borderValue).trigger("change");
	}

	_updateLivePreview(html) {
		html.find(".sdx-live-preview").each((i, preview) => {
			const $preview = $(preview);
			const categoryKey = $preview.data("category");
			const $panel = $preview.closest(".sdx-panel");

			const enabled = $panel.find(`input[name="categories.${categoryKey}.enabled"]`).is(":checked");
			if (!enabled) {
				$preview.css({
					background: "#1a1a1a",
					borderLeft: "none"
				});
				$preview.find(".sdx-preview-name, .sdx-preview-qty, .sdx-preview-slots").css({
					color: "#e0e0e0",
					textShadow: "none"
				});
				$preview.find(".sdx-preview-details, .sdx-preview-details *").css({
					color: "#a0a0a0",
					textShadow: "none"
				});
				return;
			}

			const bgColor = $panel.find(`input[type="text"][name="categories.${categoryKey}.backgroundColor"]`).val();
			const useGradient = $panel.find(`input[name="categories.${categoryKey}.useGradient"]`).is(":checked");
			const gradientEnd = $panel.find(`input[type="text"][name="categories.${categoryKey}.gradientEndColor"]`).val();
			const textColor = $panel.find(`input[type="text"][name="categories.${categoryKey}.textColor"]`).val();
			const textShadow = $panel.find(`input[name="categories.${categoryKey}.textShadow"]`).val();
			const borderLeft = $panel.find(`input[name="categories.${categoryKey}.borderLeft"]`).val();
			const descColor = $panel.find(`input[type="text"][name="categories.${categoryKey}.descriptionTextColor"]`).val();
			const descShadow = $panel.find(`input[name="categories.${categoryKey}.descriptionTextShadow"]`).val();

			let background;
			if (useGradient) {
				const endColor = gradientEnd || "transparent";
				background = `linear-gradient(to right, ${bgColor}, ${endColor})`;
			} else {
				background = bgColor;
			}

			$preview.css({
				background: background,
				borderLeft: borderLeft,
				borderRadius: "10px"
			});

			$preview.find(".sdx-preview-name, .sdx-preview-qty, .sdx-preview-slots").css({
				color: textColor,
				textShadow: textShadow
			});

			// Apply description styles
			const finalDescColor = descColor || "#a0a0a0";
			const finalDescShadow = descShadow || "none";
			$preview.find(".sdx-preview-details, .sdx-preview-details p, .sdx-preview-details b, .sdx-preview-details em").css({
				color: finalDescColor,
				textShadow: finalDescShadow
			});
			$preview.find(".sdx-preview-tag").css({
				color: finalDescColor,
				textShadow: finalDescShadow,
				background: `${bgColor}66`
			});
		});

		// Update tab indicators
		html.find(".sdx-tab").each((i, tab) => {
			const $tab = $(tab);
			const categoryKey = $tab.data("category");
			const $panel = html.find(`.sdx-panel[data-category="${categoryKey}"]`);
			const bgColor = $panel.find(`input[type="text"][name="categories.${categoryKey}.backgroundColor"]`).val();
			$tab.find(".sdx-tab-indicator").css("background", bgColor);
		});
	}

	// ---- Preset Definitions ----
	_getPresets() {
		return {
			default: DEFAULT_INVENTORY_STYLES,
			dark: {
				enabled: true,
				categories: {
					magical: { enabled: true, backgroundColor: "#1a1a2e", useGradient: true, gradientEndColor: "transparent", textColor: "#a78bfa", textShadow: "0px 0px 8px #8b5cf6", borderLeft: "3px solid #8b5cf6", descriptionTextColor: "#9ca3af", descriptionTextShadow: "" },
					unidentified: { enabled: true, backgroundColor: "#1f1a0a", useGradient: true, gradientEndColor: "transparent", textColor: "#fbbf24", textShadow: "0px 0px 6px #f59e0b", borderLeft: "3px solid #f59e0b", descriptionTextColor: "#9ca3af", descriptionTextShadow: "" },
					container: { enabled: true, backgroundColor: "#0a1f1a", useGradient: true, gradientEndColor: "transparent", textColor: "#34d399", textShadow: "0px 0px 6px #10b981", borderLeft: "3px solid #10b981", descriptionTextColor: "#9ca3af", descriptionTextShadow: "" }
				}
			},
			vibrant: {
				enabled: true,
				categories: {
					magical: { enabled: true, backgroundColor: "#7c3aed", useGradient: true, gradientEndColor: "#4c1d95", textColor: "#ffffff", textShadow: "2px 2px 4px #000", borderLeft: "4px solid #fbbf24", descriptionTextColor: "#e0e7ff", descriptionTextShadow: "" },
					unidentified: { enabled: true, backgroundColor: "#dc2626", useGradient: true, gradientEndColor: "#7f1d1d", textColor: "#fef2f2", textShadow: "2px 2px 4px #000", borderLeft: "4px solid #fbbf24", descriptionTextColor: "#fee2e2", descriptionTextShadow: "" },
					container: { enabled: true, backgroundColor: "#059669", useGradient: true, gradientEndColor: "#064e3b", textColor: "#ecfdf5", textShadow: "2px 2px 4px #000", borderLeft: "4px solid #fbbf24", descriptionTextColor: "#d1fae5", descriptionTextShadow: "" }
				}
			},
			parchment: {
				enabled: true,
				categories: {
					magical: { enabled: true, backgroundColor: "#92702c", useGradient: true, gradientEndColor: "#d4a574", textColor: "#1a0f00", textShadow: "none", borderLeft: "3px solid #5a3e1b", descriptionTextColor: "#3d2914", descriptionTextShadow: "" },
					unidentified: { enabled: true, backgroundColor: "#8b4513", useGradient: true, gradientEndColor: "#d2691e", textColor: "#fff8dc", textShadow: "1px 1px 1px #000", borderLeft: "3px solid #654321", descriptionTextColor: "#f5deb3", descriptionTextShadow: "" },
					container: { enabled: true, backgroundColor: "#6b5344", useGradient: true, gradientEndColor: "#a08679", textColor: "#f5f5dc", textShadow: "none", borderLeft: "3px solid #463830", descriptionTextColor: "#d2b48c", descriptionTextShadow: "" }
				}
			},
			neon: {
				enabled: true,
				categories: {
					magical: { enabled: true, backgroundColor: "#0a0a1a", useGradient: false, gradientEndColor: "transparent", textColor: "#00ffff", textShadow: "0px 0px 10px #00ffff, 0px 0px 20px #00ffff", borderLeft: "3px solid #00ffff", descriptionTextColor: "#00ff88", descriptionTextShadow: "0px 0px 5px #00ff88" },
					unidentified: { enabled: true, backgroundColor: "#0a0a1a", useGradient: false, gradientEndColor: "transparent", textColor: "#ff00ff", textShadow: "0px 0px 10px #ff00ff, 0px 0px 20px #ff00ff", borderLeft: "3px solid #ff00ff", descriptionTextColor: "#ff6b6b", descriptionTextShadow: "0px 0px 5px #ff6b6b" },
					container: { enabled: true, backgroundColor: "#0a0a1a", useGradient: false, gradientEndColor: "transparent", textColor: "#00ff00", textShadow: "0px 0px 10px #00ff00, 0px 0px 20px #00ff00", borderLeft: "3px solid #00ff00", descriptionTextColor: "#ffff00", descriptionTextShadow: "0px 0px 5px #ffff00" }
				}
			},
			minimal: {
				enabled: true,
				categories: {
					magical: { enabled: true, backgroundColor: "transparent", useGradient: false, gradientEndColor: "transparent", textColor: "#a78bfa", textShadow: "none", borderLeft: "2px solid #a78bfa", descriptionTextColor: "", descriptionTextShadow: "" },
					unidentified: { enabled: true, backgroundColor: "transparent", useGradient: false, gradientEndColor: "transparent", textColor: "#fbbf24", textShadow: "none", borderLeft: "2px solid #fbbf24", descriptionTextColor: "", descriptionTextShadow: "" },
					container: { enabled: true, backgroundColor: "transparent", useGradient: false, gradientEndColor: "transparent", textColor: "#34d399", textShadow: "none", borderLeft: "2px solid #34d399", descriptionTextColor: "", descriptionTextShadow: "" }
				}
			}
		};
	}

	async _applyPreset(presetName) {
		const presets = this._getPresets();
		const preset = presets[presetName];
		if (!preset) return;

		// Get current settings and merge preset
		const currentStyles = game.settings.get(MODULE_ID, "inventoryStyles") || foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES);
		
		currentStyles.enabled = preset.enabled;
		for (const [key, config] of Object.entries(preset.categories)) {
			if (currentStyles.categories[key]) {
				Object.assign(currentStyles.categories[key], config);
			}
		}

		await game.settings.set(MODULE_ID, "inventoryStyles", currentStyles);
		applyInventoryStyles();
		this.render();
		
		ui.notifications.info(`Applied "${presetName}" theme preset`);
	}

	async _exportTheme() {
		const styles = game.settings.get(MODULE_ID, "inventoryStyles");
		const data = JSON.stringify(styles, null, 2);
		const blob = new Blob([data], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		
		const a = document.createElement("a");
		a.href = url;
		a.download = "shadowdark-inventory-theme.json";
		a.click();
		URL.revokeObjectURL(url);
		
		ui.notifications.info("Theme exported successfully!");
	}

	_importTheme() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async (e) => {
			const file = e.target.files[0];
			if (!file) return;
			
			try {
				const text = await file.text();
				const theme = JSON.parse(text);
				
				// Validate basic structure
				if (!theme.categories) {
					throw new Error("Invalid theme file");
				}
				
				// Merge with defaults to ensure all fields exist
				const mergedTheme = foundry.utils.mergeObject(
					foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES),
					theme,
					{ inplace: false, recursive: true }
				);
				
				await game.settings.set(MODULE_ID, "inventoryStyles", mergedTheme);
				applyInventoryStyles();
				this.render();
				
				ui.notifications.info("Theme imported successfully!");
			} catch (err) {
				ui.notifications.error("Failed to import theme: " + err.message);
			}
		};
		input.click();
	}

	_updatePreview(html) {
		// Legacy method - redirect to new one
		this._updateLivePreview(html);
	}

	async _updateObject(event, formData) {
		const expandedData = foundry.utils.expandObject(formData);
		
		// Get current settings and merge
		const currentStyles = game.settings.get(MODULE_ID, "inventoryStyles") || foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES);
		
		// Update enabled state (checkbox: absent means false)
		currentStyles.enabled = expandedData.enabled === true;

		// Update categories
		if (expandedData.categories) {
			for (const [key, updates] of Object.entries(expandedData.categories)) {
				if (currentStyles.categories[key]) {
					// Handle checkbox fields - absent means false
					updates.enabled = updates.enabled === true;
					updates.useGradient = updates.useGradient === true;
					
					Object.assign(currentStyles.categories[key], updates);
				}
			}
		}

		await game.settings.set(MODULE_ID, "inventoryStyles", currentStyles);
		applyInventoryStyles();
	}
}

/**
 * Apply inventory styles to all rendered sheets
 */
function applyInventoryStyles() {
	// Remove existing dynamic style element
	const existingStyle = document.getElementById("sdx-inventory-dynamic-styles");
	if (existingStyle) {
		existingStyle.remove();
	}

	// Apply styles directly to all open actor sheets without re-rendering
	// This preserves expanded items and allows live preview
	for (const app of Object.values(ui.windows)) {
		if (app.actor && (app.actor.type === "Player" || app.actor.type === "NPC" || isPartyActor(app.actor))) {
			const html = app.element;
			if (html?.length) {
				applyInventoryStylesToSheet(html, app.actor);
			}
		}
	}
}

/**
 * Apply inventory styles to items in a sheet
 * @param {jQuery} html - The sheet HTML
 * @param {Actor} actor - The actor
 */
function applyInventoryStylesToSheet(html, actor) {
	const styles = game.settings.get(MODULE_ID, "inventoryStyles");
	
	// Find all item rows
	const itemRows = html.find(".item-list .item[data-item-id], .item-list .item[data-uuid]");

	// If styles are disabled, clear any existing inline styles and return
	if (!styles?.enabled) {
		itemRows.each((i, row) => {
			const rowEl = row;
			rowEl.style.removeProperty("background");
			rowEl.style.removeProperty("text-shadow");
			rowEl.style.removeProperty("border-left");
			$(row).find(".item-name, .effect-name, .quantity, .slots").each((j, el) => {
				el.style.removeProperty("color");
			});
			$(row).find(".item-details").each((j, el) => {
				el.style.removeProperty("color");
				el.style.removeProperty("text-shadow");
				$(el).find("p, b, em, span, .tag, .details-description, .details-footer, a").each((k, child) => {
					child.style.removeProperty("color");
					child.style.removeProperty("text-shadow");
				});
			});
		});
		return;
	}

	const containersEnabled = game.settings.get(MODULE_ID, "enableContainers");
	const unidentifiedEnabled = game.settings.get(MODULE_ID, "enableUnidentified");

	// Set up click handler to re-apply styles when items are expanded
	// Use event delegation and only attach once
	if (!html.data("sdx-expand-handler-attached")) {
		html.data("sdx-expand-handler-attached", true);
		html.on("click", ".item-name[data-action='show-details'], [data-action='show-details']", (event) => {
			const $row = $(event.target).closest(".item[data-item-id], .item[data-uuid]");
			if ($row.length) {
				// Delay slightly to allow the details to be rendered
				setTimeout(() => {
					applyStylesToSingleItem($row, actor, styles, containersEnabled, unidentifiedEnabled);
				}, 50);
			}
		});
	}

	itemRows.each((i, row) => {
		const $row = $(row);
		applyStylesToSingleItem($row, actor, styles, containersEnabled, unidentifiedEnabled);
	});
}

/**
 * Apply styles to a single item row
 * @param {jQuery} $row - The item row element
 * @param {Actor} actor - The actor
 * @param {Object} styles - The inventory styles settings
 * @param {boolean} containersEnabled - Whether containers feature is enabled
 * @param {boolean} unidentifiedEnabled - Whether unidentified feature is enabled
 */
function applyStylesToSingleItem($row, actor, styles, containersEnabled, unidentifiedEnabled) {
	const itemId = $row.data("item-id") || $row.data("itemId");
	const item = actor.items.get(itemId);
	if (!item) return;

	// Determine which style category applies (by priority)
	let appliedStyle = null;
	let highestPriority = -1;

	// Check special categories first (they have higher priority by default)
	// Unidentified
	if (unidentifiedEnabled && styles.categories.unidentified?.enabled) {
		if (isUnidentified(item) && styles.categories.unidentified.priority > highestPriority) {
			appliedStyle = styles.categories.unidentified;
			highestPriority = styles.categories.unidentified.priority;
		}
	}

	// Magical
	if (styles.categories.magical?.enabled) {
		if (item.system?.magicItem && styles.categories.magical.priority > highestPriority) {
			appliedStyle = styles.categories.magical;
			highestPriority = styles.categories.magical.priority;
		}
	}

	// Container
	if (containersEnabled && styles.categories.container?.enabled) {
		if (isContainerItem(item) && styles.categories.container.priority > highestPriority) {
			appliedStyle = styles.categories.container;
			highestPriority = styles.categories.container.priority;
		}
	}

	// Item type categories
	const typeConfig = styles.categories[item.type];
	if (typeConfig?.enabled && typeConfig.priority > highestPriority) {
		appliedStyle = typeConfig;
		highestPriority = typeConfig.priority;
	}

	// Apply the style or clear it
	if (appliedStyle) {
		let background;
		if (appliedStyle.useGradient) {
			const endColor = appliedStyle.gradientEndColor || "transparent";
			background = `linear-gradient(to right, ${appliedStyle.backgroundColor}, ${endColor})`;
		} else {
			background = appliedStyle.backgroundColor;
		}

		// Apply row styles
		const rowEl = $row[0];
		rowEl.style.setProperty("background", background, "important");
		rowEl.style.setProperty("text-shadow", appliedStyle.textShadow, "important");
		rowEl.style.setProperty("border-left", appliedStyle.borderLeft, "important");

		// Style text elements - use setProperty with !important to override system CSS
		$row.find(".item-name, .effect-name").each((i, el) => {
			el.style.setProperty("color", appliedStyle.textColor, "important");
		});
		$row.find(".quantity, .slots").each((i, el) => {
			el.style.setProperty("color", appliedStyle.textColor, "important");
		});
		// Style the item details/description area - only if specific description colors are set
		$row.find(".item-details").each((i, el) => {
			const $details = $(el);
			if (appliedStyle.descriptionTextColor) {
				// Apply to container and all child elements to override their specific colors
				el.style.setProperty("color", appliedStyle.descriptionTextColor, "important");
				$details.find("p, b, em, span, .tag, .details-description, .details-footer, a").each((j, child) => {
					child.style.setProperty("color", appliedStyle.descriptionTextColor, "important");
				});
			} else {
				el.style.removeProperty("color");
				$details.find("p, b, em, span, .tag, .details-description, .details-footer, a").each((j, child) => {
					child.style.removeProperty("color");
				});
			}
			if (appliedStyle.descriptionTextShadow) {
				el.style.setProperty("text-shadow", appliedStyle.descriptionTextShadow, "important");
				$details.find("p, b, em, span, .tag, .details-description, .details-footer, a").each((j, child) => {
					child.style.setProperty("text-shadow", appliedStyle.descriptionTextShadow, "important");
				});
			} else {
				el.style.removeProperty("text-shadow");
				$details.find("p, b, em, span, .tag, .details-description, .details-footer, a").each((j, child) => {
					child.style.removeProperty("text-shadow");
				});
			}
		});
	} else {
		// Clear any existing styles if no category applies
		const rowEl = $row[0];
		rowEl.style.removeProperty("background");
		rowEl.style.removeProperty("text-shadow");
		rowEl.style.removeProperty("border-left");
		$row.find(".item-name, .effect-name, .quantity, .slots").each((i, el) => {
			el.style.removeProperty("color");
		});
		$row.find(".item-details").each((i, el) => {
			el.style.removeProperty("color");
			el.style.removeProperty("text-shadow");
			$(el).find("p, b, em, span, .tag, .details-description, .details-footer, a").each((j, child) => {
				child.style.removeProperty("color");
				child.style.removeProperty("text-shadow");
			});
		});
	}
}

// ============================================
// UNIDENTIFIED ITEMS
// ============================================

function isUnidentified(item) {
	return Boolean(item?.getFlag?.(MODULE_ID, "unidentified"));
}

/**
 * Get the masked name for an unidentified item
 * Returns custom unidentified name if set, otherwise the default "Unidentified Item" label
 * @param {Item} item - The item to get masked name for
 * @returns {string} - The masked name to display
 */
function getUnidentifiedName(item) {
	const customName = item?.getFlag?.(MODULE_ID, "unidentifiedName");
	if (customName && customName.trim()) {
		return customName.trim();
	}
	return game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
}

/**
 * Get the masked name from item data (for packed items, etc.)
 * @param {Object} itemData - The item data object
 * @returns {string} - The masked name to display
 */
function getUnidentifiedNameFromData(itemData) {
	const customName = itemData?.flags?.[MODULE_ID]?.unidentifiedName;
	if (customName && customName.trim()) {
		return customName.trim();
	}
	return game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
}

/**
 * Check if the current user can see the true name of an item
 * GMs can always see true names
 * @param {Item} item - The item to check
 * @param {User} user - The user viewing the item (defaults to current user)
 * @returns {boolean} - True if the user can see the real name
 */
function canSeeTrueName(item, user = game.user) {
	if (!item) return true;
	if (user?.isGM) return true;
	if (!isUnidentified(item)) return true;
	return false;
}

/**
 * Setup wrapper to intercept item name for unidentified items
 * This makes unidentified items show "Unidentified Item" in item-piles and other modules
 */
function setupUnidentifiedItemNameWrapper() {
	// Only setup if unidentified feature is enabled (with guard)
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return; // Setting not registered yet
	}
	
	console.log(`${MODULE_ID} | Setting up unidentified item name wrapper`);
	
	// Get the Item class
	const ItemClass = CONFIG.Item.documentClass;
	
	// Store the original name descriptor
	const originalDescriptor = Object.getOwnPropertyDescriptor(ItemClass.prototype, "name") 
		|| Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ItemClass.prototype), "name");
	
	if (!originalDescriptor || !originalDescriptor.get) {
		console.warn(`${MODULE_ID} | Could not find Item.name getter to wrap`);
		return;
	}
	
	const originalGetter = originalDescriptor.get;
	
	// Define new getter that checks unidentified status
	Object.defineProperty(ItemClass.prototype, "name", {
		get: function() {
			const realName = originalGetter.call(this);
			
			// If this item is unidentified and user is not GM, return the custom or default unidentified name
			if (isUnidentified(this) && !game.user?.isGM) {
				return getUnidentifiedName(this);
			}
			
			return realName;
		},
		set: originalDescriptor.set,
		configurable: true,
		enumerable: originalDescriptor.enumerable
	});
}

/**
 * Wrap buildWeaponDisplay to ensure unidentified items show in bold
 */
function wrapBuildWeaponDisplayForUnidentified() {
	// Only setup if unidentified feature is enabled (with guard)
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return; // Setting not registered yet
	}
	
	console.log(`${MODULE_ID} | Wrapping ActorSD.buildWeaponDisplay for unidentified items`);
	
	if (!globalThis.shadowdark?.documents?.ActorSD) {
		console.warn(`${MODULE_ID} | ActorSD not found, cannot wrap buildWeaponDisplay`);
		return;
	}
	
	const ActorSD = globalThis.shadowdark.documents.ActorSD;
	const original = ActorSD.prototype.buildWeaponDisplay;
	
	ActorSD.prototype.buildWeaponDisplay = async function(options) {
		// Call the original function
		const result = await original.call(this, options);
		
		// Check if the weapon is unidentified by looking up the item
		// The weaponName might be a custom unidentified name or the default
		if (options.item && isUnidentified(options.item) && !game.user?.isGM) {
			const maskedName = getUnidentifiedName(options.item);
			// Check if the bold tag is missing or if it's just plain text
			const escapedName = maskedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const boldPattern = new RegExp(`<b[^>]*>${escapedName}<\\/b>`);
			if (!boldPattern.test(result)) {
				// Replace any occurrence of plain masked name with bolded version
				return result.replace(
					new RegExp(escapedName, 'g'),
					`<b style="font-size:16px">${maskedName}</b>`
				);
			}
		}
		
		return result;
	};
}

/**
 * Setup hooks to mask unidentified item names in item-piles UI
 * Item-piles reads item names from source data, bypassing our getter override
 */
function setupItemPilesUnidentifiedHooks() {
	// Only setup if unidentified feature is enabled (with guard)
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return; // Setting not registered yet
	}
	
	// Check if item-piles is active
	if (!game.modules.get("item-piles")?.active) {
		return;
	}
	
	console.log(`${MODULE_ID} | Setting up item-piles unidentified item hooks`);
	
	// Default masked name fallback
	const getDefaultMaskedName = () => game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
	
	/**
	 * Mask the item name in an HTML element if the item is unidentified
	 * @param {HTMLElement} element - The item element
	 * @param {Item} item - The item document
	 */
	function maskItemNameIfUnidentified(element, item) {
		if (game.user?.isGM) return; // GM sees real names
		if (!item || !isUnidentified(item)) return;
		
		// Get the item-specific masked name
		const maskedName = getUnidentifiedName(item);
		const $el = $(element);
		
		// Replace tooltip/title attributes that might show the real name
		const realName = item._source?.name || item.name;
		if ($el.attr("data-tooltip")?.includes(realName)) {
			$el.attr("data-tooltip", $el.attr("data-tooltip").replace(realName, maskedName));
		}
		if ($el.attr("title")?.includes(realName)) {
			$el.attr("title", $el.attr("title").replace(realName, maskedName));
		}
		// Also check child elements with tooltips
		$el.find("[data-tooltip], [title]").each((i, tooltipEl) => {
			const $tooltip = $(tooltipEl);
			if ($tooltip.attr("data-tooltip")?.includes(realName)) {
				$tooltip.attr("data-tooltip", $tooltip.attr("data-tooltip").replace(realName, maskedName));
			}
			if ($tooltip.attr("title")?.includes(realName)) {
				$tooltip.attr("title", $tooltip.attr("title").replace(realName, maskedName));
			}
		});
		
		// Find name elements and replace text - item-piles uses various structures
		// For pile items and merchant items
		$el.find(".item-piles-name, .item-piles-item-name, [class*='item-name'], [class*='name']").each((i, nameEl) => {
			const $name = $(nameEl);
			// Don't replace if it's a container element with child elements that have the name
			if ($name.children().length > 0 && $name.find("[class*='name']").length > 0) return;
			
			const currentText = $name.text().trim();
			// Check if it contains quantity suffix like "(x1)"
			const qtyMatch = currentText.match(/\s*\(x?\d+\)$/i);
			if (qtyMatch) {
				$name.text(maskedName + qtyMatch[0]);
			} else if (currentText && currentText !== maskedName) {
				$name.text(maskedName);
			}
		});
		
		// Also check direct text content for simple elements
		if ($el.hasClass("item-piles-item-row") || $el.hasClass("item-piles-item")) {
			const textNodes = $el.contents().filter(function() { 
				return this.nodeType === 3 && this.textContent.trim(); 
			});
			textNodes.each((i, node) => {
				const text = node.textContent.trim();
				if (text && text !== maskedName) {
					const qtyMatch = text.match(/\s*\(x?\d+\)$/i);
					node.textContent = qtyMatch ? maskedName + qtyMatch[0] : maskedName;
				}
			});
		}
	}
	
	// Hook into item-piles render hooks for each interface type
	Hooks.on("item-piles-renderPileItem", (element, item) => {
		maskItemNameIfUnidentified(element, item);
	});
	
	Hooks.on("item-piles-renderMerchantItem", (element, item) => {
		maskItemNameIfUnidentified(element, item);
	});
	
	Hooks.on("item-piles-renderVaultGridItem", (element, item) => {
		maskItemNameIfUnidentified(element, item);
	});
	
	// Hook into vault mouse hover to mask tooltip
	Hooks.on("item-piles-mouseHoverVaultGridItem", (element, item) => {
		if (game.user?.isGM) return;
		if (!item || !isUnidentified(item)) return;
		
		const maskedName = getUnidentifiedName(item);
		const realName = item._source?.name || item.name;
		const $el = $(element);
		
		// The tooltip might be set dynamically, check and replace
		if ($el.attr("data-tooltip")?.includes(realName)) {
			$el.attr("data-tooltip", $el.attr("data-tooltip").replace(realName, maskedName));
		}
		
		// Also try to intercept the tooltip element if it exists
		setTimeout(() => {
			const tooltip = document.querySelector(".tooltip, #tooltip, .item-piles-tooltip");
			if (tooltip && tooltip.textContent.includes(realName)) {
				tooltip.textContent = tooltip.textContent.replace(realName, maskedName);
			}
		}, 10);
	});
	
	// Hook into item transfers to preserve unidentified flags
	// This ensures the unidentified flag is not lost when items are moved between actors
	Hooks.on("item-piles-preTransferItems", (source, sourceUpdates, target, targetUpdates, interactionId) => {
		// Ensure our flags are preserved in the target updates
		if (targetUpdates?.itemsToCreate) {
			for (const itemData of targetUpdates.itemsToCreate) {
				// Find the source item
				const sourceItem = source.items?.find(i => i.id === itemData._id || i.name === itemData.name);
				if (sourceItem && isUnidentified(sourceItem)) {
					// Ensure the flag is preserved
					itemData.flags = itemData.flags || {};
					itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};
					itemData.flags[MODULE_ID].unidentified = true;
					// Also copy the unidentified name if present
					const unidentifiedName = sourceItem.getFlag(MODULE_ID, "unidentifiedName");
					if (unidentifiedName) {
						itemData.flags[MODULE_ID].unidentifiedName = unidentifiedName;
					}
					// Also copy the unidentified description if present
					const unidentifiedDesc = sourceItem.getFlag(MODULE_ID, "unidentifiedDescription");
					if (unidentifiedDesc) {
						itemData.flags[MODULE_ID].unidentifiedDescription = unidentifiedDesc;
					}
				}
			}
		}
	});
	
	// Also hook into preAddItems to ensure flags are preserved when items are added
	Hooks.on("item-piles-preAddItems", (target, itemsToCreate, itemQuantitiesToUpdate, interactionId) => {
		// itemsToCreate contains {item, quantity} objects
		// We need to ensure our flags are on the item data
		for (const entry of itemsToCreate) {
			const itemData = entry.item;
			if (!itemData) continue;
			
			// Check if the original item data has our unidentified flag
			if (itemData.flags?.[MODULE_ID]?.unidentified) {
				// Flag is already there, good
				continue;
			}
			
			// If the item is being created from an existing item with the flag, preserve it
			if (itemData._id) {
				// Try to find the source item
				const sourceItem = game.items?.get(itemData._id);
				if (sourceItem && isUnidentified(sourceItem)) {
					itemData.flags = itemData.flags || {};
					itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};
					itemData.flags[MODULE_ID].unidentified = true;
					const unidentifiedName = sourceItem.getFlag(MODULE_ID, "unidentifiedName");
					if (unidentifiedName) {
						itemData.flags[MODULE_ID].unidentifiedName = unidentifiedName;
					}
					const unidentifiedDesc = sourceItem.getFlag(MODULE_ID, "unidentifiedDescription");
					if (unidentifiedDesc) {
						itemData.flags[MODULE_ID].unidentifiedDescription = unidentifiedDesc;
					}
				}
			}
		}
	});
	
	// Use ITEM_SIMILARITIES to include our flags in item comparison
	// This ensures item-piles treats items with different unidentified states as different
	Hooks.once("item-piles-ready", () => {
		try {
			const currentSimilarities = game.itempiles?.API?.ITEM_SIMILARITIES || [];
			if (!currentSimilarities.includes(`flags.${MODULE_ID}.unidentified`)) {
				// Add our flag to similarities so unidentified items don't stack with identified ones
				game.itempiles.API.setItemSimilarities([
					...currentSimilarities,
					`flags.${MODULE_ID}.unidentified`
				]);
				console.log(`${MODULE_ID} | Added unidentified flag to item-piles similarities`);
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not add unidentified flag to item-piles similarities`, err);
		}
	});
	
	// Hook into item-piles item drops to preserve flags
	Hooks.on("item-piles-preDropItem", (source, target, itemData, position, quantity) => {
		// itemData should have our flags if they exist on the source item
		// This hook runs before the item is created
		const sourceActor = source?.actor || source;
		if (!sourceActor?.items) return;
		
		// Find the original item being dropped
		const originalItem = sourceActor.items.find(i => 
			i.id === itemData._id || 
			(i.name === itemData.name && i.type === itemData.type)
		);
		
		if (originalItem && isUnidentified(originalItem)) {
			// Ensure the flags are on itemData
			itemData.flags = itemData.flags || {};
			itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};
			itemData.flags[MODULE_ID].unidentified = true;
			const unidentifiedDesc = originalItem.getFlag(MODULE_ID, "unidentifiedDescription");
			if (unidentifiedDesc) {
				itemData.flags[MODULE_ID].unidentifiedDescription = unidentifiedDesc;
			}
		}
	});
	
	// Hook into Dialog rendering to mask item names in drop dialogs
	Hooks.on("renderDialog", (app, html, data) => {
		if (game.user?.isGM) return;
		maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
	});
	
	// Hook into Application rendering to catch item-piles Svelte apps
	Hooks.on("renderApplication", (app, html, data) => {
		if (game.user?.isGM) return;
		
		// Check if this might be an item-piles application
		const isItemPiles = app.constructor?.name?.includes("ItemPile") ||
		                    app.constructor?.name?.includes("Trading") ||
		                    app.constructor?.name?.includes("Merchant") ||
		                    app.options?.classes?.some(c => c.includes("item-piles")) ||
		                    html.find(".item-piles").length > 0 ||
		                    html.find("[class*='item-piles']").length > 0;
		
		if (isItemPiles) {
			maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
		}
	});
	
	// Also use MutationObserver to catch dynamically rendered content
	Hooks.once("ready", () => {
		if (game.user?.isGM) return;
		
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) {
					if (node.nodeType !== 1) continue; // Element nodes only
					
					const $node = $(node);
					// Check if this is an item-piles element
					if ($node.hasClass("item-piles") || 
					    $node.find(".item-piles").length > 0 ||
					    $node.closest(".item-piles").length > 0 ||
					    $node.hasClass("item-piles-flexrow") ||
					    $node.find("[class*='item-piles']").length > 0 ||
					    node.className?.includes?.("item-piles")) {
						maskUnidentifiedNamesInElement($node, getDefaultMaskedName);
					}
					
					// Also check window titles
					if ($node.hasClass("window-title") || $node.find(".window-title").length > 0) {
						maskUnidentifiedNamesInElement($node, getDefaultMaskedName);
					}
				}
			}
		});
		
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
	});
	
	// Hook into chat message rendering to mask item names from item-piles
	Hooks.on("renderChatMessage", (message, html, data) => {
		if (game.user?.isGM) return;
		
		// Check if this is an item-piles message
		const isItemPilesMessage = message.flags?.["item-piles"] || 
		                           html.find(".item-piles").length > 0 ||
		                           html.find("[class*='item-piles']").length > 0;
		
		if (!isItemPilesMessage) return;
		
		maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
	});
}

/**
 * Mask all unidentified item names in an HTML element
 * @param {jQuery} html - The HTML element to process
 * @param {Function} getDefaultMaskedName - Function to get the default masked name string
 */
function maskUnidentifiedNamesInElement(html, getDefaultMaskedName) {
	const defaultMaskedName = getDefaultMaskedName();
	
	// Build map of unidentified item real names to their masked names
	const unidentifiedNameMap = new Map();
	for (const actor of game.actors) {
		for (const item of actor.items) {
			if (isUnidentified(item)) {
				const realName = item._source?.name;
				if (realName) {
					// Use custom unidentified name if set, otherwise default
					const maskedName = getUnidentifiedName(item);
					unidentifiedNameMap.set(realName, maskedName);
				}
			}
		}
	}
	
	if (unidentifiedNameMap.size === 0) return;
	
	// Replace item names in text nodes
	html.find("*").addBack().contents().filter(function() {
		return this.nodeType === 3; // Text nodes only
	}).each((i, node) => {
		let text = node.textContent;
		let changed = false;
		for (const [realName, maskedName] of unidentifiedNameMap) {
			if (text.includes(realName)) {
				text = text.replace(new RegExp(realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskedName);
				changed = true;
			}
		}
		if (changed) {
			node.textContent = text;
		}
	});
	
	// Also check and replace in title attributes and data-tooltip
	html.find("[title], [data-tooltip]").each((i, el) => {
		const $el = $(el);
		for (const [realName, maskedName] of unidentifiedNameMap) {
			if ($el.attr("title")?.includes(realName)) {
				$el.attr("title", $el.attr("title").replace(new RegExp(realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskedName));
			}
			if ($el.attr("data-tooltip")?.includes(realName)) {
				$el.attr("data-tooltip", $el.attr("data-tooltip").replace(new RegExp(realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskedName));
			}
		}
	});
}

function getDisplayName(item, user = game.user) {
	if (!item) return "";
	if (isUnidentified(item) && !user?.isGM) {
		return getUnidentifiedName(item);
	}
	return item.name ?? "";
}

function getDisplayDescription(item, user = game.user) {
	if (!item) return "";
	if (isUnidentified(item) && !user?.isGM) {
		// Return the unidentified description if set, otherwise empty
		return item.getFlag?.(MODULE_ID, "unidentifiedDescription") ?? "";
	}
	return item.system?.description ?? "";
}

function getDisplayNameFromData(itemData, user = game.user) {
	if (!itemData) return "";
	const unidentified = Boolean(itemData?.flags?.[MODULE_ID]?.unidentified);
	if (unidentified && !user?.isGM) {
		return getUnidentifiedNameFromData(itemData);
	}
	return itemData.name ?? "";
}

// ============================================
// BASIC ITEM CONTAINERS (non-invasive)
// ============================================

// Track containers currently being unpacked to prevent race conditions
const _containersBeingUnpacked = new Set();

// Track containers currently being recomputed to prevent recursion
const _containersBeingRecomputed = new Set();

function isBasicItem(item) {
	return item?.type === "Basic";
}

function isContainerItem(item) {
	return Boolean(item?.getFlag(MODULE_ID, "isContainer"));
}

function getContainedItems(containerItem) {
	const actor = containerItem?.parent;
	if (!actor) return [];
	return actor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === containerItem.id);
}

function getParentContainer(item) {
	const containerId = item?.getFlag(MODULE_ID, "containerId");
	if (!containerId) return null;
	const actor = item?.parent;
	if (!actor) return null;
	return actor.items.get(containerId);
}

function getPackedContainedItemData(containerItem) {
	const packed = containerItem?.getFlag?.(MODULE_ID, "containerPackedItems");
	return Array.isArray(packed) ? packed : [];
}

function getPackedKeyFromItemData(itemData) {
	return itemData?.flags?.[MODULE_ID]?.packedKey ?? null;
}

function ensurePackedKeyOnItemData(itemData) {
	itemData.flags = itemData.flags ?? {};
	itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] ?? {};
	if (!itemData.flags[MODULE_ID].packedKey) itemData.flags[MODULE_ID].packedKey = foundry.utils.randomID();
	return itemData.flags[MODULE_ID].packedKey;
}

async function packItemToContainerData(sourceItem) {
	if (!sourceItem || !(sourceItem instanceof Item)) return null;
	// If the source is a container owned by a normal actor, ensure its packed snapshot is current before copying.
	try {
		if (isContainerItem(sourceItem) && sourceItem.parent && !isItemPilesEnabledActor(sourceItem.parent)) {
			await syncContainerPackedItems(sourceItem);
		}
	} catch {
		// Ignore snapshot refresh errors
	}

	const data = foundry.utils.duplicate(sourceItem.toObject());
	delete data._id;
	// Remove relationships that don't make sense outside ownership contexts
	data.flags = data.flags ?? {};
	data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
	// ContainerId will be rewritten on unpack/contain
	data.flags[MODULE_ID].containerId = null;
	// Clear the unpacked flag so the container can be unpacked on the new actor
	delete data.flags[MODULE_ID].containerUnpacked;
	// Clear the "unpacked on actor" flag so it can be unpacked on a different actor
	delete data.flags[MODULE_ID].containerUnpackedOnActor;
	// Ensure packed entries have a stable key for UI removal
	ensurePackedKeyOnItemData(data);
	return data;
}

function isItemPilesEnabledActor(actor) {
	try {
		return Boolean(actor?.getFlag?.("item-piles", "data")?.enabled);
	} catch {
		return false;
	}
}

function calculateSlotsCostForItem(item, { ignoreIsPhysical = false } = {}) {
	// Mirror the simple Shadowdark slot math used elsewhere in this module:
	// cost = ceil(qty / per_slot) * slots_used
	const system = item?.system ?? {};
	if (!ignoreIsPhysical && !system.isPhysical) return 0;
	if (item?.type === "Gem") return 0;
	if (system.stashed) return 0;

	const qty = Math.max(0, Number(system.quantity ?? 1) || 0);
	const perSlot = Math.max(1, Number(system.slots?.per_slot ?? 1) || 1);
	const slotsUsed = Math.max(0, Number(system.slots?.slots_used ?? 1) || 0);
	return Math.ceil(qty / perSlot) * slotsUsed;
}

function calculateSlotsCostForItemData(itemData, { recursive = false } = {}) {
	const system = itemData?.system ?? {};
	// Packed items are stored as hidden/non-physical; assume they were meant to count unless explicitly marked otherwise.
	const originallyPhysical = itemData?.flags?.[MODULE_ID]?.containerOrigIsPhysical;
	if (originallyPhysical === false) return 0;
	if (itemData?.type === "Gem") return 0;
	if (system.stashed) return 0;

	const qty = Math.max(0, Number(system.quantity ?? 1) || 0);
	const perSlot = Math.max(1, Number(system.slots?.per_slot ?? 1) || 1);
	const freeCarry = Math.max(0, Number(system.slots?.free_carry ?? 0) || 0);
	
	// For containers, use base slots when recursive to avoid double-counting
	const isContainer = Boolean(itemData?.flags?.[MODULE_ID]?.isContainer);
	let slotsUsed;
	if (recursive && isContainer) {
		// Use base slots for nested containers
		const baseSlots = itemData?.flags?.[MODULE_ID]?.containerBaseSlots;
		slotsUsed = baseSlots?.slots_used ?? (Number(system.slots?.slots_used ?? 1) || 1);
	} else {
		slotsUsed = Math.max(0, Number(system.slots?.slots_used ?? 1) || 0);
	}
	
	// Calculate base slot cost for this item
	let baseSlotCost = Math.ceil(qty / perSlot) * slotsUsed;
	// Apply free carry to the item itself (but not contents)
	// Free carry of 1 means the container itself is free (0 slots)
	if (freeCarry > 0) {
		baseSlotCost = 0;
	}
	let slots = baseSlotCost;
	
	// If recursive and this is a container, add its nested contents
	if (recursive && isContainer) {
		const packedItems = itemData?.flags?.[MODULE_ID]?.containerPackedItems;
		if (Array.isArray(packedItems)) {
			for (const nestedData of packedItems) {
				slots += calculateSlotsCostForItemData(nestedData, { recursive: true });
			}
		}
		
		// Add coin weight from nested container
		const coins = itemData?.flags?.[MODULE_ID]?.containerCoins || {};
		const gp = Number(coins.gp ?? 0);
		const sp = Number(coins.sp ?? 0);
		const cp = Number(coins.cp ?? 0);
		const totalGPValue = gp + (sp / 10) + (cp / 100);
		const coinSlots = Math.floor(totalGPValue / 100);
		slots += coinSlots;
	}
	
	return slots;
}

function calculateContainedItemSlots(item) {
	// Contained items are forcibly set to non-physical to hide them; for container math we
	// treat them as physical only if they originally were.
	const originallyPhysical = item?.getFlag?.(MODULE_ID, "containerOrigIsPhysical");
	if (originallyPhysical === false) return 0;
	
	// For containers, use base slots to avoid double-counting
	let slots;
	if (isContainerItem(item)) {
		// Use base slots for nested containers
		const baseSlots = item.getFlag(MODULE_ID, "containerBaseSlots");
		if (baseSlots) {
			const qty = Math.max(0, Number(item.system?.quantity ?? 1) || 0);
			const perSlot = Math.max(1, Number(baseSlots.per_slot ?? 1) || 1);
			const baseSlotsUsed = Math.max(0, Number(baseSlots.slots_used ?? 1) || 0);
			const freeCarry = Math.max(0, Number(item.system?.slots?.free_carry ?? 0) || 0);
			let baseSlotCost = Math.ceil(qty / perSlot) * baseSlotsUsed;
			// Apply free carry to the container itself (but not contents)
			// Free carry of 1 means the container itself is free (0 slots)
			if (freeCarry > 0) {
				baseSlotCost = 0;
			}
			slots = baseSlotCost;
		} else {
			slots = calculateSlotsCostForItem(item, { ignoreIsPhysical: true });
		}
	} else {
		slots = calculateSlotsCostForItem(item, { ignoreIsPhysical: true });
	}
	
	// If this item is itself a container, recursively add its contained items' slots
	if (isContainerItem(item)) {
		const actor = item.parent;
		const packedOnly = !actor || isItemPilesEnabledActor(actor);
		
		if (packedOnly) {
			// Use packed data for actorless or Item Piles containers
			for (const data of getPackedContainedItemData(item)) {
				slots += calculateSlotsCostForItemData(data, { recursive: true });
			}
		} else {
			// Use embedded items for normal actors
			const contained = getContainedItems(item);
			for (const nestedItem of contained) {
				slots += calculateContainedItemSlots(nestedItem);
			}
		}
		
		// Add coin weight from nested container
		const coins = item.getFlag(MODULE_ID, "containerCoins") || {};
		const gp = Number(coins.gp ?? 0);
		const sp = Number(coins.sp ?? 0);
		const cp = Number(coins.cp ?? 0);
		const totalGPValue = gp + (sp / 10) + (cp / 100);
		const coinSlots = Math.floor(totalGPValue / 100);
		slots += coinSlots;
	}
	
	return slots;
}

async function ensureContainerBaseSlots(containerItem) {
	if (!containerItem) return;
	const existing = containerItem.getFlag(MODULE_ID, "containerBaseSlots");
	if (existing && typeof existing === "object") return;
	const base = {
		slots_used: Number(containerItem.system?.slots?.slots_used ?? 1) || 1,
		per_slot: Number(containerItem.system?.slots?.per_slot ?? 1) || 1,
		max: Number(containerItem.system?.slots?.max ?? 1) || 1,
	};
	await containerItem.setFlag(MODULE_ID, "containerBaseSlots", base);
}

async function restoreContainerBaseSlots(containerItem) {
	if (!containerItem) return;
	const base = containerItem.getFlag(MODULE_ID, "containerBaseSlots");
	if (!base || typeof base !== "object") return;
	await containerItem.update({
		"system.slots.slots_used": Number(base.slots_used ?? 1) || 1,
		"system.slots.per_slot": Number(base.per_slot ?? 1) || 1,
		"system.slots.max": Number(base.max ?? 1) || 1,
	}, { sdxInternal: true });
}

async function recomputeContainerSlots(containerItem, { skipSync = false } = {}) {
	if (!containerItem || !isContainerItem(containerItem)) return;
	
	// Prevent recursive recomputation
	const recomputeKey = containerItem.uuid;
	if (_containersBeingRecomputed.has(recomputeKey)) return;
	_containersBeingRecomputed.add(recomputeKey);
	
	try {
		await ensureContainerBaseSlots(containerItem);
		const base = containerItem.getFlag(MODULE_ID, "containerBaseSlots") || {};
		const baseSlotsUsed = Number(base.slots_used ?? 1) || 1;

		const packedOnly = !containerItem.parent || isItemPilesEnabledActor(containerItem.parent);
		let containedSlots = 0;
		if (packedOnly) {
			// Actorless containers and Item Piles actors shouldn't rely on embedded contained items.
			// Use recursive calculation to handle nested containers
			for (const data of getPackedContainedItemData(containerItem)) containedSlots += calculateSlotsCostForItemData(data, { recursive: true });
		} else {
			const contained = getContainedItems(containerItem);
			// calculateContainedItemSlots now handles recursion automatically
			for (const item of contained) containedSlots += calculateContainedItemSlots(item);
		}

		// Add coin weight: 1 slot per 100gp worth of coins
		const coins = containerItem.getFlag(MODULE_ID, "containerCoins") || {};
		const gp = Number(coins.gp ?? 0);
		const sp = Number(coins.sp ?? 0);
		const cp = Number(coins.cp ?? 0);
		const totalGPValue = gp + (sp / 10) + (cp / 100);
		const coinSlots = Math.floor(totalGPValue / 100);
		containedSlots += coinSlots;

		const nextSlotsUsed = Math.max(baseSlotsUsed, containedSlots);
		const current = Number(containerItem.system?.slots?.slots_used ?? 1) || 1;
		if (current !== nextSlotsUsed) {
			await containerItem.update({
				"system.slots.slots_used": nextSlotsUsed,
			}, { sdxInternal: true });
		}

		// Keep a packed snapshot so copies/transfers can recreate contents.
		// For packed-only containers we preserve the existing snapshot.
		// Skip syncing when unpacking to prevent doubling items.
		if (!packedOnly && !skipSync) await syncContainerPackedItems(containerItem);
		
		// If this container is itself inside another container, update the parent container too
		const parentContainer = getParentContainer(containerItem);
		if (parentContainer && !_containersBeingRecomputed.has(parentContainer.uuid)) {
			await recomputeContainerSlots(parentContainer, { skipSync });
		}
	} finally {
		_containersBeingRecomputed.delete(recomputeKey);
	}
}

async function syncContainerPackedItems(containerItem) {
	if (!containerItem || !isContainerItem(containerItem) || !containerItem.parent) return;
	if (isItemPilesEnabledActor(containerItem.parent)) return;
	const contained = getContainedItems(containerItem);
	const packed = contained.map(i => {
		const data = i.toObject();
		// Store as a template for recreation on another actor
		delete data._id;
		data.flags = data.flags ?? {};
		data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
		// ContainerId will be rewritten on unpack
		data.flags[MODULE_ID].containerId = null;
		// Clear the unpacked flag so it can be unpacked when copied to another actor
		delete data.flags[MODULE_ID].containerUnpacked;
		// Clear the actor-specific unpack flag
		delete data.flags[MODULE_ID].containerUnpackedOnActor;
		// Ensure it stays hidden when recreated
		data.system = data.system ?? {};
		data.system.isPhysical = false;
		return data;
	});
	// Use update with sdxInternal to prevent hook recursion
	await containerItem.update({
		[`flags.${MODULE_ID}.containerPackedItems`]: packed,
	}, { sdxInternal: true });
	// Clear the unpacked flag on the current container since we just synced
	if (containerItem.getFlag(MODULE_ID, "containerUnpacked")) {
		await containerItem.update({
			[`flags.${MODULE_ID}.-=containerUnpacked`]: null,
		}, { sdxInternal: true });
	}
}

async function setContainedState(item, containerId) {
	if (!item) return;
	const makeContained = Boolean(containerId);
	const actor = item.parent;
	const previousContainerId = item.getFlag(MODULE_ID, "containerId");
	const isItemPilesActor = isItemPilesEnabledActor(actor);

	if (makeContained) {
		// Preserve original isPhysical so we can restore.
		const origPhysical = item.getFlag(MODULE_ID, "containerOrigIsPhysical");
		if (origPhysical === undefined) {
			await item.setFlag(MODULE_ID, "containerOrigIsPhysical", Boolean(item.system?.isPhysical));
		}
		await item.update({
			"system.isPhysical": false,
			[`flags.${MODULE_ID}.containerId`]: containerId,
			// If the item is on an Item Piles actor, also hide it from the Item Piles UI
			...(isItemPilesActor ? { "flags.item-piles.item.hidden": true } : {}),
		}, { sdxInternal: true });
		const container = actor?.items?.get(containerId);
		if (container) {
			// Mark container as unpacked on this actor to prevent duplicate unpack attempts
			if (actor && !container.getFlag(MODULE_ID, "containerUnpackedOnActor")) {
				await container.setFlag(MODULE_ID, "containerUnpackedOnActor", actor.id);
			}
			await recomputeContainerSlots(container);
		}
		return;
	}

	// Remove from container: restore physical state
	const restorePhysical = item.getFlag(MODULE_ID, "containerOrigIsPhysical");
	await item.update({
		"system.isPhysical": (restorePhysical === undefined) ? true : Boolean(restorePhysical),
		[`flags.${MODULE_ID}.containerId`]: null,
		[`flags.${MODULE_ID}.containerOrigIsPhysical`]: null,
		...(isItemPilesActor ? { "flags.item-piles.item.hidden": false } : {}),
	}, { sdxInternal: true });
	await item.unsetFlag(MODULE_ID, "containerId");
	await item.unsetFlag(MODULE_ID, "containerOrigIsPhysical");
	// Refresh the container we removed it from
	if (actor && previousContainerId) {
		const container = actor.items.get(previousContainerId);
		if (container) await recomputeContainerSlots(container);
	}
}

async function setItemContainerId(item, containerId) {
	if (!item) return;
	if (containerId) return item.setFlag(MODULE_ID, "containerId", containerId);
	return item.unsetFlag(MODULE_ID, "containerId");
}

function injectUnidentifiedCheckbox(app, html) {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	const item = app?.item;
	if (!item) return;

	// Only for Shadowdark system
	if (game.system.id !== "shadowdark") return;

	// Only show to GM
	if (!game.user?.isGM) return;

	// De-dupe on re-render
	html.find(".sdx-unidentified-property").remove();
	html.find(".sdx-unidentified-description-box").remove();
	html.find(".sdx-unidentified-box").remove();

	const detailsTab = html.find('.tab[data-tab="details"], .tab[data-tab="tab-details"], .tab.details').first();
	if (!detailsTab.length) return;

	const isEditable = Boolean(app.isEditable);
	const label = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.checkbox_label");
	const hint = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.checkbox_hint");
	const nameLabel = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.name_label");
	const nameHint = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.name_hint");
	const currentUnidentifiedName = item.getFlag(MODULE_ID, "unidentifiedName") ?? "";

	// Find the ITEM PROPERTIES box and add the checkbox there
	const itemPropertiesBox = detailsTab.find('.SD-box').filter((_, box) => {
		const header = $(box).find('.header label').first().text().trim().toUpperCase();
		return header === 'ITEM PROPERTIES';
	}).first();

	const toggleHtml = `
		<h3>${foundry.utils.escapeHTML(label)}</h3>
		<input type="checkbox" ${isUnidentified(item) ? "checked" : ""} ${isEditable ? "" : "disabled"} title="${foundry.utils.escapeHTML(hint)}" class="sdx-unidentified-property" />
	`;

	const nameInputHtml = `
		<h3>${foundry.utils.escapeHTML(nameLabel)}</h3>
		<input type="text" value="${foundry.utils.escapeHTML(currentUnidentifiedName)}" ${isEditable ? "" : "disabled"} title="${foundry.utils.escapeHTML(nameHint)}" placeholder="${foundry.utils.escapeHTML(game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label"))}" class="sdx-unidentified-name" style="grid-column: span 2; width: 100%;" />
	`;

	if (itemPropertiesBox.length) {
		// Insert the checkbox at the end of the ITEM PROPERTIES content (inside the SD-grid)
		const grid = itemPropertiesBox.find('.content .SD-grid').first();
		if (grid.length) {
			grid.append(toggleHtml);
			grid.append(nameInputHtml);
		} else {
			itemPropertiesBox.find('.content').first().append(toggleHtml);
			itemPropertiesBox.find('.content').first().append(nameInputHtml);
		}
	} else {
		// For item types without ITEM PROPERTIES box (Potion, Scroll, Spell, Wand, etc.)
		// Create a new SD-box for the Unidentified property
		const itemTypesWithoutPropertiesBox = ["Potion", "Scroll", "Spell", "Wand"];
		if (itemTypesWithoutPropertiesBox.includes(item.type)) {
			const boxLabel = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.box_label") || "Item Properties";
			const newBoxHtml = `
				<div class="SD-box sdx-unidentified-box">
					<div class="header light">
						<label>${foundry.utils.escapeHTML(boxLabel)}</label>
						<span></span>
					</div>
					<div class="content">
						<div class="SD-grid right">
							${toggleHtml}
							${nameInputHtml}
						</div>
					</div>
				</div>
			`;
			
			// Find the grid container and append the new box
			const gridContainer = detailsTab.find('.grid-3-columns, .grid-2-columns').first();
			if (gridContainer.length) {
				gridContainer.append(newBoxHtml);
			} else {
				detailsTab.append(newBoxHtml);
			}
		} else {
			// No suitable place to add the checkbox for this item type
			return;
		}
	}

	// Bind toggle
	const toggle = html.find("input.sdx-unidentified-property[type=checkbox]").first();
	toggle.on("change", async (ev) => {
		if (!isEditable) return;
		const enabled = Boolean(ev.currentTarget.checked);
		await item.setFlag(MODULE_ID, "unidentified", enabled);
		app.render();
	});

	// Bind name input
	const nameInput = html.find("input.sdx-unidentified-name").first();
	nameInput.on("change", async (ev) => {
		if (!isEditable) return;
		const newName = ev.currentTarget.value.trim();
		if (newName) {
			await item.setFlag(MODULE_ID, "unidentifiedName", newName);
		} else {
			await item.unsetFlag(MODULE_ID, "unidentifiedName");
		}
	});

	// Add unidentified description editor on the Description tab
	injectUnidentifiedDescriptionEditor(app, html, item, isEditable);
}

/**
 * Inject the unidentified description editor into the item sheet's Description tab
 */
function injectUnidentifiedDescriptionEditor(app, html, item, isEditable) {
	// Find the Description tab
	const descTab = html.find('.tab[data-tab="description"], .tab[data-tab="tab-description"]').first();
	if (!descTab.length) return;

	// Get current unidentified description
	const unidentifiedDesc = item.getFlag(MODULE_ID, "unidentifiedDescription") ?? "";
	
	const sectionLabel = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.description_label");
	const sectionHint = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.description_hint");
	const editLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.edit_description");

	// Create the unidentified description box
	const boxHtml = `
		<div class="SD-box sdx-unidentified-description-box">
			<div class="header">
				<label>${foundry.utils.escapeHTML(sectionLabel)}</label>
				${isEditable ? `<a class="sdx-edit-unidentified-desc" data-tooltip="${foundry.utils.escapeHTML(editLabel)}"><i class="fas fa-edit"></i></a>` : ""}
			</div>
			<div class="content">
				<p class="hint" style="font-style: italic; opacity: 0.7; margin-bottom: 8px;">${foundry.utils.escapeHTML(sectionHint)}</p>
				<div class="sdx-unidentified-desc-content">${unidentifiedDesc || '<em style="opacity: 0.5;">(empty)</em>'}</div>
			</div>
		</div>
	`;

	// Find the existing description box and insert after it
	const existingDescBox = descTab.find('.SD-box').first();
	if (existingDescBox.length) {
		existingDescBox.after(boxHtml);
	} else {
		descTab.append(boxHtml);
	}

	// Bind edit button
	if (isEditable) {
		html.find(".sdx-edit-unidentified-desc").on("click", async (ev) => {
			ev.preventDefault();
			await editUnidentifiedDescription(item, app);
		});
	}
}

/**
 * Open a dialog to edit the unidentified description
 */
async function editUnidentifiedDescription(item, app) {
	const currentDesc = item.getFlag(MODULE_ID, "unidentifiedDescription") ?? "";
	const title = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.edit_description_title");
	const label = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.description_label");

	new Dialog({
		title: `${title}: ${item.name}`,
		content: `
			<form>
				<div class="form-group stacked">
					<label>${label}</label>
					<textarea name="unidentifiedDescription" rows="8" style="width: 100%; min-height: 150px;">${foundry.utils.escapeHTML(currentDesc)}</textarea>
				</div>
			</form>
		`,
		buttons: {
			save: {
				icon: '<i class="fas fa-save"></i>',
				label: game.i18n.localize("SHADOWDARK_EXTRAS.party.save"),
				callback: async (html) => {
					const newDesc = html.find('textarea[name="unidentifiedDescription"]').val();
					await item.setFlag(MODULE_ID, "unidentifiedDescription", newDesc);
					app.render();
				}
			},
			cancel: {
				icon: '<i class="fas fa-times"></i>',
				label: game.i18n.localize("SHADOWDARK_EXTRAS.party.cancel")
			}
		},
		default: "save"
	}).render(true);
}

function injectBasicContainerUI(app, html) {
	// Check if containers are enabled
	if (!game.settings.get(MODULE_ID, "enableContainers")) return;

	const item = app?.item;
	if (!isBasicItem(item)) return;

	// Only for Shadowdark system
	if (game.system.id !== "shadowdark") return;

	// De-dupe on re-render
	html.find(".sdx-container-toggle").remove();
	html.find(".sdx-container-box").remove();

	const detailsTab = html.find('.tab[data-tab="details"], .tab[data-tab="tab-details"], .tab.details').first();
	if (!detailsTab.length) return;

	const isOwned = Boolean(item.parent);
	const isEditable = Boolean(app.isEditable);
	const labelSlots = (game.i18n.localize("SHADOWDARK.inventory.slots") || "Slots").toLowerCase();
	let slotsBox = null;

	// Try to find the SLOTS box to add the toggle under it
	detailsTab.find(".SD-box").each(function() {
		const label = $(this).find('.header label').first().text().trim().toLowerCase();
		if (label && (label === labelSlots || label.includes(labelSlots))) {
			slotsBox = $(this);
			return false;
		}
	});

	const containerLabel = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.is_container");
	const containerHint = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.is_container_hint");
	const toggleHtml = `
		<div class="sdx-container-toggle">
			<label title="${foundry.utils.escapeHTML(containerHint)}">${foundry.utils.escapeHTML(containerLabel)}</label>
			<input type="checkbox" ${isContainerItem(item) ? "checked" : ""} ${isEditable ? "" : "disabled"} />
		</div>
	`;

	if (slotsBox?.length) {
		slotsBox.find('.content').first().append(toggleHtml);
	} else {
		// Fallback: append to the top of Details
		detailsTab.prepend(toggleHtml);
	}

	// Bind toggle
	const toggle = html.find(".sdx-container-toggle input[type=checkbox]").first();
	toggle.on("change", async (ev) => {
		if (!isEditable) return;
		const enabled = Boolean(ev.currentTarget.checked);
		await item.setFlag(MODULE_ID, "isContainer", enabled);

		// If disabling, release contained items and restore base slots
		if (!enabled && item.parent) {
			const contained = getContainedItems(item);
			for (const child of contained) {
				await setContainedState(child, null);
			}
			await restoreContainerBaseSlots(item);
		}

		app.render();
	});

	// Handle container-specific slot field modifications
	if (isContainerItem(item)) {
		// Disable per_slot input for containers (always 1)
		const perSlotInput = html.find('input[name="system.slots.per_slot"]');
		if (perSlotInput.length) {
			perSlotInput.prop('disabled', true);
			perSlotInput.css('opacity', '0.5');
			perSlotInput.attr('title', 'Cannot edit for containers');
		}

		// Replace free_carry number input with checkbox
		const freeCarryInput = html.find('input[name="system.slots.free_carry"]');
		if (freeCarryInput.length) {
			const currentValue = Number(item.system?.slots?.free_carry ?? 0);
			const isChecked = currentValue > 0;
			const freeCarryLabel = freeCarryInput.closest('.SD-grid').find('h3').filter(function() {
				return $(this).text().trim().toLowerCase().includes('free');
			});
			
			const checkboxHtml = `
				<input type="checkbox" 
					data-sdx-free-carry 
					${isChecked ? 'checked' : ''} 
					${isEditable ? '' : 'disabled'}
					style="width: auto; height: auto;"
				/>
			`;
			
			freeCarryInput.replaceWith(checkboxHtml);
			
			// Bind checkbox change event
			html.find('[data-sdx-free-carry]').on('change', async (ev) => {
				if (!isEditable) return;
				const checked = ev.currentTarget.checked;
				// Set to 1 if checked, 0 if unchecked
				await item.update({"system.slots.free_carry": checked ? 1 : 0});
			});
		}
	}

	// Only render contents area when enabled
	if (!isContainerItem(item)) return;

	const title = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.contents_title");
	const dropHint = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.drop_hint");
	const removeTip = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.remove_tooltip");
	const slotsLabel = game.i18n.localize("SHADOWDARK.inventory.slots") || "Slots";

	const onItemPilesActor = isItemPilesEnabledActor(item.parent);
	const packedOnly = !isOwned || onItemPilesActor;
	const contained = packedOnly ? [] : getContainedItems(item);
	const packed = packedOnly ? getPackedContainedItemData(item) : [];
	
	// Track totals for GP, CP, SP
	let totalGP = 0;
	let totalCP = 0;
	let totalSP = 0;
	
	const rows = (packedOnly ? packed : contained).map((entry, index) => {
		const isData = !(entry instanceof Item);
		// Check if this individual item is unidentified and mask accordingly
		const isItemUnidentified = isData 
			? (entry.flags?.[MODULE_ID]?.unidentified === true)
			: isUnidentified(entry);
		const name = isItemUnidentified && !game.user?.isGM
			? (isData ? getUnidentifiedNameFromData(entry) : getUnidentifiedName(entry))
			: (isData ? (entry.name ?? "") : entry.name);
		const img = isData ? (entry.img ?? "") : entry.img;
		const qty = Number(entry.system?.quantity ?? 1);
		// Use recursive calculation to show total slots including nested container contents
		const slots = isData ? calculateSlotsCostForItemData(entry, { recursive: true }) : calculateContainedItemSlots(entry);
		const packedKey = isData ? (getPackedKeyFromItemData(entry) ?? String(index)) : null;
		
		// Extract cost values
		const costGP = Number(entry.system?.cost?.gp ?? 0);
		const costCP = Number(entry.system?.cost?.cp ?? 0);
		const costSP = Number(entry.system?.cost?.sp ?? 0);
		
		// Add to totals (multiplied by quantity)
		totalGP += costGP * qty;
		totalCP += costCP * qty;
		totalSP += costSP * qty;
		
		const liAttrs = isData
			? `data-packed-key="${foundry.utils.escapeHTML(String(packedKey))}"`
			: `data-item-id="${entry.id}"`;
		const canRemove = isEditable && !onItemPilesActor;
		const removeAction = canRemove ? `<a class=\"fa-solid fa-xmark\" data-action=\"remove-from-container\" title=\"${foundry.utils.escapeHTML(removeTip)}\"></a>` : "";
		return `
			<li class="item" ${liAttrs}>
				<div class="item-image" style="background-image: url(${img})" data-action="open-item"></div>
				<a class="item-name" data-action="open-item">${foundry.utils.escapeHTML(name)}</a>
				<div class="quantity">${Number.isFinite(qty) ? qty : ""}</div>
				<div class="cost-gp">${costGP > 0 ? costGP : ""}</div>
				<div class="cost-sp">${costSP > 0 ? costSP : ""}</div>
				<div class="cost-cp">${costCP > 0 ? costCP : ""}</div>
				<div class="slots">${Number.isFinite(slots) ? slots : ""}</div>
				<div class="actions">${removeAction}</div>
			</li>
		`;
	}).join("");

	// Build total row if there are items
	const totalRow = (packedOnly ? packed.length : contained.length) > 0 ? `
		<li class="item sdx-container-total">
			<div class="item-image"></div>
			<div class="item-name" style="font-weight: bold;">${foundry.utils.escapeHTML(game.i18n.localize("SHADOWDARK_EXTRAS.item.container.total") || "Total")}</div>
			<div class="quantity"></div>
			<div class="cost-gp" style="font-weight: bold;">${totalGP > 0 ? totalGP : ""}</div>
			<div class="cost-sp" style="font-weight: bold;">${totalSP > 0 ? totalSP : ""}</div>
			<div class="cost-cp" style="font-weight: bold;">${totalCP > 0 ? totalCP : ""}</div>
			<div class="slots"></div>
			<div class="actions"></div>
		</li>
	` : "";
	
	// Get container coins
	const containerCoins = item.getFlag(MODULE_ID, "containerCoins") || {};
	const coinGP = Number(containerCoins.gp ?? 0);
	const coinSP = Number(containerCoins.sp ?? 0);
	const coinCP = Number(containerCoins.cp ?? 0);

	// Calculate coin slots (1 slot per 100gp worth)
	const totalGPValue = coinGP + (coinSP / 10) + (coinCP / 100);
	const coinSlots = Math.floor(totalGPValue / 100);

	// Build coin row for container's own coins
	const coinRow = `
		<li class="sdx-container-coins-row">
			<div class="item-image"><i class="fas fa-coins"></i></div>
			<div class="item-name">${foundry.utils.escapeHTML(game.i18n.localize("SHADOWDARK_EXTRAS.item.container.coins") || "Coins")}</div>
			<div class="quantity"></div>
			<div class="cost-gp">
				<input type="number" class="sdx-container-coin-input" data-coin-type="gp" value="${coinGP}" min="0" ${isEditable ? "" : "disabled"} />
			</div>
			<div class="cost-sp">
				<input type="number" class="sdx-container-coin-input" data-coin-type="sp" value="${coinSP}" min="0" ${isEditable ? "" : "disabled"} />
			</div>
			<div class="cost-cp">
				<input type="number" class="sdx-container-coin-input" data-coin-type="cp" value="${coinCP}" min="0" ${isEditable ? "" : "disabled"} />
			</div>
			<div class="slots">${coinSlots > 0 ? coinSlots : ""}</div>
			<div class="actions"></div>
		</li>
	`;

	let contentsHtml = `
		<div class="sdx-container-dropzone ${isEditable ? "editable" : ""}" data-sdx-dropzone="1">
			${(packedOnly ? packed.length : contained.length) ? "" : `<p class="sdx-container-hint">${foundry.utils.escapeHTML(dropHint)}</p>`}
			<ol class="SD-list item-list sdx-container-list">
				<li class="header">
					<div class="item-name">${foundry.utils.escapeHTML(game.i18n.localize("SHADOWDARK_EXTRAS.party.item_name"))}</div>
					<div class="quantity">${foundry.utils.escapeHTML(game.i18n.localize("SHADOWDARK_EXTRAS.party.qty"))}</div>
					<div class="cost-gp">GP</div>
					<div class="cost-sp">SP</div>
					<div class="cost-cp">CP</div>
					<div class="slots">${foundry.utils.escapeHTML(slotsLabel)}</div>
					<div class="actions"></div>
				</li>
				${coinRow}
				${rows}
				${totalRow}
			</ol>
		</div>
	`;

	const boxHtml = `
		<div class="SD-box sdx-container-box">
			<div class="header"><label>${foundry.utils.escapeHTML(title)}</label><span></span></div>
			<div class="content">${contentsHtml}</div>
		</div>
	`;

	// Insert after the top grid of the Details tab, if present
	const topGrid = detailsTab.find('.grid-3-columns, .grid-3, .grid-3col, .grid-3columms, .grid-3-columns').first();
	if (topGrid.length) topGrid.after(boxHtml);
	else detailsTab.append(boxHtml);

	async function openPackedItemSheet(packedItemData, { containerItem, packedKey } = {}) {
		if (!packedItemData) return;
		// Foundry v13: safest is constructing an in-memory document (no DB/world creation).
		try {
			const data = foundry.utils.duplicate(packedItemData);
			if (!data._id) data._id = foundry.utils.randomID();
			const DocClass = CONFIG?.Item?.documentClass ?? Item?.implementation ?? Item;
			const temp = new DocClass(data, { temporary: true });

			// If this packed entry belongs to a container item (sidebar/compendium), persist edits back into the container's packed array.
			if (containerItem && packedKey) {
				const originalUpdate = temp.update?.bind(temp);
				temp.update = async (changes = {}, options = {}) => {
					// Update the in-memory doc source so the sheet reflects changes.
					try {
						temp.updateSource(changes);
					} catch {
						// If updateSource isn't available for some reason, fall back to default update.
						return originalUpdate ? originalUpdate(changes, options) : temp;
					}

					// Write back to the container's packed list.
					const current = getPackedContainedItemData(containerItem);
					const idx = current.findIndex(d => String(getPackedKeyFromItemData(d)) === String(packedKey));
					if (idx < 0) return temp;

					const nextEntry = temp.toObject();
					delete nextEntry._id;
					nextEntry.flags = nextEntry.flags ?? {};
					nextEntry.flags[MODULE_ID] = nextEntry.flags[MODULE_ID] ?? {};
					nextEntry.flags[MODULE_ID].containerId = null;
					nextEntry.flags[MODULE_ID].packedKey = packedKey;
					nextEntry.system = nextEntry.system ?? {};
					// Packed entries should remain hidden from normal inventory listings.
					nextEntry.system.isPhysical = false;

					const next = current.slice();
					next[idx] = nextEntry;
					await containerItem.setFlag(MODULE_ID, "containerPackedItems", next);
					await recomputeContainerSlots(containerItem);
					return temp;
				};
			}

			temp?.sheet?.render(true);
		} catch {
			// Give up silently
		}
	}

	// Wire up actions
	html.find('.sdx-container-box [data-action="open-item"]').on('click', async (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		const li = ev.currentTarget.closest('li.item');
		const actor = item.parent;

		// Owned container contents: open the real embedded item.
		const itemId = li?.dataset?.itemId;
		if (actor && itemId) {
			const target = actor.items?.get(itemId);
			target?.sheet?.render(true);
			return;
		}

		// Packed-only contents (sidebar/compendium/Item Piles): open a temporary sheet.
		const packedKey = li?.dataset?.packedKey;
		if (!packedKey) return;
		const packedItems = getPackedContainedItemData(item);
		const packedEntry = packedItems.find(d => String(getPackedKeyFromItemData(d)) === String(packedKey));
		await openPackedItemSheet(packedEntry, { containerItem: item, packedKey });
	});

	html.find('.sdx-container-box [data-action="remove-from-container"]').on('click', async (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		if (!isEditable) return;
		const li = ev.currentTarget.closest('li.item');
		const packedKey = li?.dataset?.packedKey;
		if (packedKey) {
			const current = getPackedContainedItemData(item);
			const next = current.filter(d => getPackedKeyFromItemData(d) !== packedKey);
			await item.setFlag(MODULE_ID, "containerPackedItems", next);
			await recomputeContainerSlots(item);
			app.render();
			return;
		}

		const itemId = li?.dataset?.itemId;
		const actor = item.parent;
		const target = actor?.items?.get(itemId);
		if (!target) return;
		await setContainedState(target, null);
		await recomputeContainerSlots(item);
		app.render();
	});

	// Bind coin input changes
	html.find('.sdx-container-box .sdx-container-coin-input').on('change', async (ev) => {
		if (!isEditable) return;
		const coinType = ev.currentTarget.dataset.coinType;
		const value = Math.max(0, parseInt(ev.currentTarget.value) || 0);
		const currentCoins = item.getFlag(MODULE_ID, "containerCoins") || {};
		const nextCoins = { ...currentCoins, [coinType]: value };
		await item.setFlag(MODULE_ID, "containerCoins", nextCoins);
		await recomputeContainerSlots(item);
	});

	// Drag/drop assignment (actor-owned or packed-only)
	const dropzone = html.find('.sdx-container-box .sdx-container-dropzone').first();
	if (dropzone.length) {
		dropzone.on('dragover', (ev) => {
			if (!isEditable) return;
			ev.preventDefault();
		});
		dropzone.on('drop', async (ev) => {
			if (!isEditable) return;
			ev.preventDefault();
			const originalEvent = ev.originalEvent ?? ev;
			const ctrlMove = Boolean(originalEvent?.ctrlKey);
			const getDragEventData = foundry?.applications?.ux?.TextEditor?.implementation?.getDragEventData ?? TextEditor.getDragEventData;
			const data = getDragEventData(originalEvent);
			if (!data || data.type !== 'Item') return;
			const dropped = await fromUuid(data.uuid);
			if (!dropped || !(dropped instanceof Item)) return;
			if (dropped.id === item.id && dropped.parent === item.parent) return;

			// Actor-owned container: ensure the dropped item becomes owned by the same actor, then contain it.
			if (item.parent) {
				if (dropped.parent && dropped.parent === item.parent) {
					await setContainedState(dropped, item.id);
					await recomputeContainerSlots(item);
					app.render();
					return;
				}

				const packedData = await packItemToContainerData(dropped);
				if (!packedData) return;
				// Create an owned copy on this actor, then contain that copy.
				const created = await item.parent.createEmbeddedDocuments("Item", [packedData], { sdxInternal: true });
				const createdItem = created?.[0];
				if (createdItem) {
					await setContainedState(createdItem, item.id);
					await recomputeContainerSlots(item);
				}

				// Optional move: delete the source if CTRL is held and the user can.
				if (ctrlMove && dropped.parent && dropped.parent !== item.parent) {
					try {
						await dropped.delete({ sdxInternal: true });
					} catch {
						// Ignore delete failures
					}
				}

				app.render();
				return;
			}

			// Packed-only container (sidebar/compendium or Item Piles): store dropped item as packed data.
			const packedData = await packItemToContainerData(dropped);
			if (!packedData) return;
			const current = getPackedContainedItemData(item);
			current.push(packedData);
			await item.setFlag(MODULE_ID, "containerPackedItems", current);
			await recomputeContainerSlots(item);

			// Optional move: delete the source if CTRL is held and the user can.
			if (ctrlMove && dropped.parent) {
				try {
					await dropped.delete({ sdxInternal: true });
				} catch {
					// Ignore delete failures
				}
			}

			app.render();
		});
	}
}

function buildContainerTooltip(containerItem) {
	const actor = containerItem?.parent;
	if (!actor) return null;
	const packed = getPackedContainedItemData(containerItem);
	const isItemPiles = isItemPilesEnabledActor(actor);
	const contained = isItemPiles ? [] : actor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === containerItem.id);
	const label = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.contains_label");

	// Prefer embedded contents on normal actors, but fall back to packed snapshot when needed.
	const hasEmbedded = contained.length > 0;
	const entries = hasEmbedded ? contained : packed;
	if (!entries.length) {
		const empty = game.i18n.localize("SHADOWDARK_EXTRAS.item.container.contains_empty");
		return `${label} ${empty}`;
	}

	// Build a plain text list for tooltip
	const items = entries
		.slice(0, 50)
		.map(entry => {
			const isOwnedItem = entry instanceof Item;
			const name = isOwnedItem ? getDisplayName(entry) : getDisplayNameFromData(entry);
			const qty = Number(entry?.system?.quantity ?? 1);
			const qtySuffix = Number.isFinite(qty) && qty > 1 ? ` x${qty}` : "";
			return `• ${name}${qtySuffix}`;
		})
		.join('\n');
	
	const more = entries.length > 50 ? `\n• ... and ${entries.length - 50} more` : "";
	return `${label}\n${items}${more}`;
}

function attachContainerContentsToActorSheet(app, html) {
	// Check if containers are enabled
	if (!game.settings.get(MODULE_ID, "enableContainers")) return;

	const actor = app?.actor;
	if (!actor) return;

	// Add tooltips to container items in inventory
	html.find('.item[data-item-id]').each((_, el) => {
		const $el = $(el);
		const itemId = $el.data('itemId') ?? $el.attr('data-item-id');
		if (!itemId) return;
		const item = actor.items?.get?.(itemId);
		if (!item) return;
		if (!(item.type === "Basic" && Boolean(item.getFlag(MODULE_ID, "isContainer")))) return;

		// Build tooltip content
		const tooltip = buildContainerTooltip(item);
		if (!tooltip) return;

		// Add tooltip to the item row
		$el.attr('title', tooltip);
		$el.addClass('sdx-has-container-tooltip');
	});
}

function addUnidentifiedIndicatorForGM(app, html) {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	const actor = app?.actor;
	if (!actor) return;
	if (!game.user?.isGM) return; // Only GMs see the indicator

	// Add visual indicator to unidentified items in inventory
	html.find('.item[data-item-id]').each((_, el) => {
		const $el = $(el);
		const itemId = $el.data('itemId') ?? $el.attr('data-item-id');
		if (!itemId) return;
		const item = actor.items?.get?.(itemId);
		if (!item || !isUnidentified(item)) return;

		// Add an icon indicator next to the item name
		const $nameLink = $el.find('.item-name');
		if ($nameLink.length && !$nameLink.find('.sdx-unidentified-indicator').length) {
			$nameLink.prepend('<i class="fas fa-question-circle sdx-unidentified-indicator" title="Unidentified Item (GM Only)" style="color: #ff6b6b; margin-right: 4px;"></i>');
		}
	});
}

function maskUnidentifiedItemsOnSheet(app, html) {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	const actor = app?.actor;
	if (!actor) return;
	if (game.user?.isGM) return; // GM sees real names

	// Mask item names in the inventory list
	html.find('.item[data-item-id]').each((_, el) => {
		const $el = $(el);
		const itemId = $el.data('itemId') ?? $el.attr('data-item-id');
		if (!itemId) return;
		const item = actor.items?.get?.(itemId);
		if (!item || !isUnidentified(item)) return;

		const maskedName = getUnidentifiedName(item);

		// Mark item image as unidentified to hide chat icon
		const $itemImage = $el.find('.item-image');
		if ($itemImage.length) {
			$itemImage.addClass('sdx-unidentified');
		}

		// Mask the item name
		const $nameLink = $el.find('.item-name');
		if ($nameLink.length) {
			$nameLink.text(maskedName);
		}
	});

	// Mask item descriptions in expanded details
	html.find('.item-details').each((_, el) => {
		const $details = $(el);
		const $row = $details.closest('[data-item-id]');
		const itemId = $row?.data?.('itemId') ?? $row?.attr?.('data-item-id');
		if (!itemId) return;
		const item = actor.items?.get?.(itemId);
		if (!item || !isUnidentified(item)) return;

		// Mask description
		$details.find('.item-description, .description').text('');
	});

	// Mask weapon names in attacks section (Abilities tab)
	// Attacks have data-item-id attribute and contain the weapon name in the display
	html.find('.attack a[data-item-id]').each((_, el) => {
		const $el = $(el);
		const itemId = $el.data('itemId') ?? $el.attr('data-item-id');
		if (!itemId) return;
		const item = actor.items?.get?.(itemId);
		if (!item || !isUnidentified(item)) return;

		const maskedName = getUnidentifiedName(item);

		// The attack display format is: "WeaponName (handedness), modifier, damage, properties"
		// We need to replace the weapon name while keeping the rest
		const currentHtml = $el.html();
		// Find the weapon name (everything after the dice icon and before the first parenthesis or comma)
		const match = currentHtml.match(/(<i[^>]*><\/i>\s*)([^(,]+)(.*)/);
		if (match) {
			// Replace weapon name with masked name
			$el.html(match[1] + maskedName + match[3]);
		}
	});
}

function maskUnidentifiedItemSheet(app, html) {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	const item = app?.item;
	if (!item) return;
	if (game.user?.isGM) return; // GM sees real names
	if (!isUnidentified(item)) return;

	console.log(`${MODULE_ID} | Masking unidentified item sheet for: ${item.name}`);

	const maskedName = getUnidentifiedName(item);

	// Make the sheet non-editable to prevent form submission
	app.options.editable = false;

	// Disable form submission to prevent data corruption
	const form = html.find('form').first();
	if (form.length) {
		form.on('submit', (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
			return false;
		});
		// Disable all form inputs
		form.find('input, textarea, select').prop('disabled', true);
	}

	// Mask the window title
	app.element?.find('.window-title')?.text?.(maskedName);

	// Mask the header title in the sheet content (non-input elements only)
	html.find('.window-header h1:not(input), .window-header .window-title:not(input)').each((_, el) => {
		const $el = $(el);
		if ($el.text().trim()) $el.text(maskedName);
	});

	// Replace name input field value with masked name
	html.find('input.item-name, input[name="name"]').each((_, el) => {
		const $el = $(el);
		$el.val(maskedName);
	});

	// Mask the image tooltip which also shows the name
	html.find('img[data-tooltip]').each((_, el) => {
		const $el = $(el);
		$el.attr('data-tooltip', maskedName);
	});

	// Replace name display elements with masked name (avoid modifying inputs and container contents)
	html.find('h1.item-name, .item-name:not(input)').each((_, el) => {
		const $el = $(el);
		// Skip if this is inside a container list (contained items should show real names)
		if ($el.closest('.sdx-container-list').length > 0) return;
		if ($el.text().trim()) $el.text(maskedName);
	});

	// Hide the Effects tab link and content (try multiple selectors)
	html.find('a[data-tab="effects"], nav a[data-tab="effects"], .tabs a[data-tab="effects"], .sheet-tabs a[data-tab="effects"]').hide();
	html.find('.tab[data-tab="effects"], div[data-tab="effects"]').hide();
	
	// Also hide by looking for text content
	html.find('a.item, nav .item, .tabs .item').each((_, el) => {
		const $el = $(el);
		if ($el.text().trim().toLowerCase().includes('effect')) {
			$el.hide();
		}
	});

	// Replace description with unidentified description
	const unidentifiedDesc = item.getFlag?.(MODULE_ID, "unidentifiedDescription") ?? "";
	const noDescText = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.no_description");
	
	// Create the "not identified" notice HTML
	const notIdentifiedHtml = `
		<div class="sdx-unidentified-notice">
			<i class="fas fa-question-circle"></i>
			<p>${noDescText}</p>
		</div>
	`;
	
	// Find the description tab and replace its content entirely (after the banner)
	const descTab = html.find('.tab[data-tab="tab-description"], .tab[data-tab="description"]').first();
	if (descTab.length) {
		// Save the banner if it exists
		const banner = descTab.find('.SD-banner').first();
		const bannerHtml = banner.length ? banner[0].outerHTML : '';
		
		// Build new content
		let newContent = bannerHtml;
		if (unidentifiedDesc) {
			// Enrich and display the unidentified description
			const enrichHTML = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? TextEditor.enrichHTML;
			enrichHTML(unidentifiedDesc, { async: true }).then(enriched => {
				newContent += `<div class="editor-content" style="padding: 10px;">${enriched}</div>`;
				descTab.html(newContent);
			});
		} else {
			newContent += notIdentifiedHtml;
			descTab.html(newContent);
		}
	}

	// Hide the unidentified description box since players shouldn't see the GM section
	html.find('.sdx-unidentified-description-box').remove();

	// Hide the Details tab content for players (shows item type, properties, etc.)
	html.find('.tab[data-tab="details"], .tab[data-tab="tab-details"]').each((_, el) => {
		const $el = $(el);
		$el.html(notIdentifiedHtml);
	});
}

/**
 * Mask unidentified item names in dialogs (attack rolls, spell rolls, etc.)
 * Since the original item data is not accessible in renderDialog hook,
 * we scan the DOM for names that match unidentified items owned by the current player's actors.
 */
function maskUnidentifiedItemInDialog(app, html, data) {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	if (game.user?.isGM) return; // GM sees real names

	// Build a map of real names to masked names from unidentified items the player can see
	const unidentifiedNameMap = new Map();
	for (const actor of game.actors) {
		if (!actor.testUserPermission(game.user, "OBSERVER")) continue;
		for (const item of actor.items) {
			if (isUnidentified(item)) {
				// Map real name to custom masked name
				unidentifiedNameMap.set(item.name, getUnidentifiedName(item));
			}
		}
	}
	
	if (unidentifiedNameMap.size === 0) return;

	// Mask the window title
	const $title = app.element?.find('.window-title');
	if ($title?.length) {
		let titleText = $title.text();
		for (const [realName, maskedName] of unidentifiedNameMap) {
			if (titleText.includes(realName)) {
				titleText = titleText.replaceAll(realName, maskedName);
			}
		}
		$title.text(titleText);
	}

	// Mask the h2 title inside the dialog (e.g., "Roll Attack with Dagger")
	html.find('h2').each((_, el) => {
		const $el = $(el);
		let text = $el.text();
		for (const [realName, maskedName] of unidentifiedNameMap) {
			if (text.includes(realName)) {
				text = text.replaceAll(realName, maskedName);
			}
		}
		$el.text(text);
	});

	// Mask any other visible instances of the item name in the dialog
	html.find('label, span, p').each((_, el) => {
		const $el = $(el);
		let text = $el.text();
		for (const [realName, maskedName] of unidentifiedNameMap) {
			if (text.includes(realName)) {
				text = text.replaceAll(realName, maskedName);
			}
		}
		$el.text(text);
	});
}

// ============================================
// INVENTORY ENHANCEMENTS (delete button, multi-select)
// ============================================

// Track selected items per actor sheet
const _selectedItems = new WeakMap();

function getSelectedItems(app) {
	return _selectedItems.get(app) || new Set();
}

function setSelectedItems(app, items) {
	_selectedItems.set(app, items);
}

function clearSelectedItems(app) {
	_selectedItems.set(app, new Set());
}

/**
 * Add delete buttons and multi-select functionality to actor sheet inventory
 */
function enhanceInventoryWithDeleteAndMultiSelect(app, html) {
	// Check if multi-select is enabled
	if (!game.settings.get(MODULE_ID, "enableMultiselect")) return;

	const actor = app?.actor;
	if (!actor?.isOwner) return;

	// Initialize selected items set for this app
	if (!_selectedItems.has(app)) {
		clearSelectedItems(app);
	}

	// Add CSS for selection and delete button
	if (!document.getElementById('sdx-inventory-enhance-styles')) {
		const style = document.createElement('style');
		style.id = 'sdx-inventory-enhance-styles';
		style.textContent = `
			.sdx-item-selected {
				background-color: rgba(100, 149, 237, 0.3) !important;
				outline: 1px solid cornflowerblue;
			}
			.sdx-item-buttons {
				display: inline-flex;
				align-items: center;
				gap: 3px;
				margin-left: 6px;
				position: absolute;
				right: 27px;
				top: 50%;
				transform: translateY(-50%);
			}
			.item[data-item-id] {
				position: relative;
				cursor: pointer;
			}
			.sdx-item-btn {
				cursor: pointer;
				opacity: 0.5;
				font-size: 13px;
				line-height: 1;
			}
			.sdx-item-btn:hover {
				opacity: 1;
			}
			.sdx-edit-btn:hover {
				color: #000;
			}
		`;
		document.head.appendChild(style);
	}

	// Find all item rows in the inventory
	const itemRows = html.find('.item[data-item-id]');
	
	itemRows.each((_, el) => {
		const $row = $(el);
		const itemId = $row.data('itemId');
		if (!itemId) return;

		const item = actor.items.get(itemId);
		const isContainer = item?.type === "Basic" && Boolean(item.getFlag?.(MODULE_ID, "isContainer"));

		// Add edit button for containers if not already present
		if (isContainer && !$row.find('.sdx-item-buttons').length) {
			const $btnContainer = $('<span class="sdx-item-buttons"></span>');
			const editBtn = $(`<a class="sdx-item-btn sdx-edit-btn" data-item-id="${itemId}" title="${game.i18n.localize("SHADOWDARK_EXTRAS.inventory.edit_container")}"><i class="fas fa-box-open"></i></a>`);
			$btnContainer.append(editBtn);
			$row.append($btnContainer);
		}

		// Update selection visual state
		const selected = getSelectedItems(app);
		if (selected.has(itemId)) {
			$row.addClass('sdx-item-selected');
		} else {
			$row.removeClass('sdx-item-selected');
		}
	});

	// Handle click for multi-select (Shift+Click to add to selection, Click to single select)
	html.find('.item[data-item-id]').off('click.sdxSelect').on('click.sdxSelect', (ev) => {
		// Don't handle if clicking on a link, button, input, or the item name (which opens the sheet)
		const target = ev.target;
		if ($(target).closest('a:not(.sdx-edit-btn), button, input, .item-name, .item-image').length) {
			return;
		}

		ev.preventDefault();
		ev.stopPropagation();

		const $row = $(ev.currentTarget);
		const itemId = $row.data('itemId');
		if (!itemId) return;

		const selected = getSelectedItems(app);

		if (ev.shiftKey) {
			// Toggle selection with Shift
			if (selected.has(itemId)) {
				selected.delete(itemId);
				$row.removeClass('sdx-item-selected');
			} else {
				selected.add(itemId);
				$row.addClass('sdx-item-selected');
			}
		} else if (ev.ctrlKey || ev.metaKey) {
			// Toggle selection with Ctrl/Cmd
			if (selected.has(itemId)) {
				selected.delete(itemId);
				$row.removeClass('sdx-item-selected');
			} else {
				selected.add(itemId);
				$row.addClass('sdx-item-selected');
			}
		} else {
			// Single click without modifier: clear selection and select just this one
			html.find('.item[data-item-id]').removeClass('sdx-item-selected');
			selected.clear();
			selected.add(itemId);
			$row.addClass('sdx-item-selected');
		}

		setSelectedItems(app, selected);
	});

	// Handle edit button click (for containers)
	html.find('.sdx-edit-btn').off('click.sdxEdit').on('click.sdxEdit', async (ev) => {
		ev.preventDefault();
		ev.stopPropagation();

		const itemId = $(ev.currentTarget).data('itemId');
		const item = actor.items.get(itemId);
		if (!item) return;

		item.sheet.render(true);
	});

	// Patch the context menu to add "Delete Selected" option
	patchContextMenuForMultiDelete(app, html);
}

/**
 * Delete an item and its contained items if it's a container
 */
async function deleteItemWithContents(actor, item) {
	const isContainer = item.type === "Basic" && Boolean(item.getFlag?.(MODULE_ID, "isContainer"));
	
	if (isContainer) {
		// Delete contained items first
		const containedItems = actor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === item.id);
		for (const contained of containedItems) {
			await contained.delete({ sdxInternal: true });
		}
	}
	
	await item.delete({ sdxInternal: true });
}

/**
 * Patch the context menu to include a "Delete Selected" option when multiple items are selected
 */
function patchContextMenuForMultiDelete(app, html) {
	const actor = app?.actor;
	if (!actor) return;

	// We need to intercept the context menu creation
	// Shadowdark uses foundry.applications.ux.ContextMenu.implementation
	// We'll add our own context menu handler for selected items

	html.find('.item[data-item-id]').off('contextmenu.sdxMulti').on('contextmenu.sdxMulti', async (ev) => {
		const selected = getSelectedItems(app);
		
		// If multiple items selected and right-clicking on a selected item, show multi-delete menu
		if (selected.size > 1) {
			const $row = $(ev.currentTarget);
			const itemId = $row.data('itemId');
			
			if (selected.has(itemId)) {
				ev.preventDefault();
				ev.stopPropagation();

				// Build context menu options
				const menuItems = [
					{
						name: game.i18n.format("SHADOWDARK_EXTRAS.inventory.delete_selected", { count: selected.size }),
						icon: '<i class="fas fa-trash"></i>',
						callback: async () => {
							const confirmed = await Dialog.confirm({
								title: game.i18n.localize("SHADOWDARK_EXTRAS.inventory.delete_confirm_title"),
								content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.inventory.delete_confirm_multiple", { count: selected.size })}</p>`,
								yes: () => true,
								no: () => false,
								defaultYes: false
							});

							if (confirmed) {
								const itemIds = Array.from(selected);
								for (const id of itemIds) {
									const item = actor.items.get(id);
									if (item) {
										await deleteItemWithContents(actor, item);
									}
								}
								clearSelectedItems(app);
								app.render();
							}
						}
					},
					{
						name: game.i18n.localize("SHADOWDARK_EXTRAS.inventory.clear_selection"),
						icon: '<i class="fas fa-times"></i>',
						callback: () => {
							clearSelectedItems(app);
							html.find('.item[data-item-id]').removeClass('sdx-item-selected');
						}
					}
				];

				// Create and show context menu
				const menu = new foundry.applications.ux.ContextMenu.implementation(
					html.get(0),
					'.item[data-item-id]',
					menuItems,
					{ jQuery: false, eventName: 'sdx-contextmenu' }
				);

				// Position and render the menu manually
				menu.render(ev.currentTarget, { event: ev.originalEvent });
			}
		}
	});
}

// ============================================
// DEFAULT-MOVE ITEM DROPS (non-invasive)
// Normal drag = move, Ctrl+drag = copy
// ============================================

function patchCtrlMoveOnActorSheetDrops() {
	// Only relevant for Shadowdark in this module
	if (game.system.id !== "shadowdark") return;
	if (!globalThis.ActorSheet?.prototype?._onDropItem) return;
	const proto = globalThis.ActorSheet.prototype;
	if (proto._sdxCtrlMovePatched) return;
	proto._sdxCtrlMovePatched = true;

	const original = proto._onDropItem;
	proto._onDropItem = async function(event, data) {
		const targetActor = this.actor;
		const ctrlCopy = Boolean(event?.ctrlKey); // Ctrl = copy, normal = move
		const sourceUuid = data?.uuid;
		let sourceItem = null;
		try {
			if (!ctrlCopy && sourceUuid) sourceItem = await fromUuid(sourceUuid);
		} catch (e) {
			// Ignore uuid resolution failures
		}

		const result = await original.call(this, event, data);

		// Default move: delete the source unless CTRL is held (copy mode).
		if (ctrlCopy) return result; // Ctrl held = copy, don't delete
		if (result === false) return result;
		if (!sourceItem || !(sourceItem instanceof Item)) return result;
		const sourceActor = sourceItem.parent;
		if (!sourceActor || !targetActor) return result;
		if (sourceActor === targetActor || sourceActor.id === targetActor.id) return result;
		// Permission safety: only owners/GM can delete
		if (!(game.user.isGM || sourceActor.isOwner || sourceItem.isOwner)) return result;

		try {
			const isContainer = sourceItem.type === "Basic" && Boolean(sourceItem.getFlag?.(MODULE_ID, "isContainer"));
			if (isContainer) {
				const children = sourceActor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === sourceItem.id);
				for (const child of children) {
					await child.delete({ sdxInternal: true });
				}
				await sourceItem.delete({ sdxInternal: true });
			} else {
				await sourceItem.delete();
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Ctrl-move delete failed`, err);
		}

		return result;
	};
}

// Additional light sources to add to the system
const EXTRA_LIGHT_SOURCES = {
	candle: {
		lang: "SHADOWDARK_EXTRAS.light_source.candle",
		light: {
			alpha: 0.2,
			angle: 360,
			animation: {
				speed: 1,
				intensity: 1,
				reverse: false,
				type: "torch"
			},
			attenuation: 0.5,
			bright: 5,
			color: "#d1c846",
			coloration: 1,
			contrast: 0,
			darkness: {
				min: 0,
				max: 1
			},
			dim: 5,
			luminosity: 0.5,
			saturation: 0,
			shadows: 0
		}
	}
};

// Item types that count as physical inventory for NPCs
const NPC_INVENTORY_TYPES = [
	"Armor",
	"Basic", 
	"Gem",
	"Potion",
	"Scroll",
	"Wand",
	"Weapon"
];

// Track active tab per NPC sheet (by actor ID)
const npcActiveTabTracker = new Map();

/**
 * Enable chat icon on item images to show item in chat
 */
function enableItemChatIcon(app, html) {
	const actor = app?.actor;
	if (!actor) return;

	// Handle click on item image (when it has the chat icon)
	html.find('.item-image').off('click.sdxChat').on('click.sdxChat', async function(ev) {
		// Only handle if this item-image has a comment icon
		if (!$(this).find('.fa-comment').length) return;
		
		ev.preventDefault();
		ev.stopPropagation();

		const $itemRow = $(this).closest('.item[data-item-id]');
		const itemId = $itemRow.data('itemId') ?? $itemRow.attr('data-item-id');
		if (!itemId) return;

		const item = actor.items.get(itemId);
		if (!item) return;

		// Check if unidentified (and user is not GM)
		if (!game.user?.isGM && isUnidentified(item)) {
			ui.notifications.warn("Cannot show unidentified item in chat");
			return;
		}

		// Show item in chat
		await item.sendToChat();
	});
}

/**
 * Register module settings
 */
function registerSettings() {
	// === FEATURE TOGGLES ===
	
	game.settings.register(MODULE_ID, "enableEnhancedHeader", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_enhanced_header.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_enhanced_header.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	// Internal setting - always enabled, not shown in UI
	game.settings.register(MODULE_ID, "enableEnhancedDetails", {
		name: "Enable Player Sheet Tabs Theme Enhancement",
		hint: "Enhances the Details tab with improved styling and organization to match the enhanced header theme.",
		scope: "world",
		config: false,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableRenown", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_renown.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_renown.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "renownMaximum", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.renown_maximum.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.renown_maximum.hint"),
		scope: "world",
		config: true,
		default: 20,
		type: Number,
		range: {
			min: 1,
			max: 100,
			step: 1,
		},
	});

	game.settings.register(MODULE_ID, "enableTrading", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_trading.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_trading.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableContainers", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_containers.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_containers.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableUnidentified", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_unidentified.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_unidentified.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableMultiselect", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_multiselect.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_multiselect.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableAddCoinsButton", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_add_coins_button.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_add_coins_button.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableNpcInventory", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_inventory.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_inventory.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	// === INVENTORY STYLES ===
	
	// Register the inventory styles data setting (not shown in config)
	game.settings.register(MODULE_ID, "inventoryStyles", {
		name: "Inventory Styles Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES)
	});

	// Register a menu button to open the Inventory Styles app
	game.settings.registerMenu(MODULE_ID, "inventoryStylesMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.label"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.hint"),
		icon: "fas fa-palette",
		type: InventoryStylesApp,
		restricted: true
	});

	// === JOURNAL NOTES ===
	game.settings.register(MODULE_ID, "enableJournalNotes", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_notes.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_notes.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
	});

	// === ENHANCE SPELLS ===
	game.settings.register(MODULE_ID, "enhanceSpells", {
		name: "Enhance Spells",
		hint: "Add damage/heal configuration to spell items for automatic spell damage application similar to weapon attacks.",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
	});

	// === CONDITIONS THEME ===
	game.settings.register(MODULE_ID, "conditionsTheme", {
		name: "Conditions Theme",
		hint: "Choose a visual theme for the quick conditions toggles",
		scope: "world",
		config: true,
		default: "parchment",
		type: String,
		choices: {
			parchment: "Parchment (Default)",
			stone: "Stone Tablet",
			leather: "Leather Bound",
			iron: "Iron & Rust",
			moss: "Moss & Decay",
			blood: "Blood & Shadow"
		},
		onChange: () => {
			// Re-render all open player sheets
			for (const app of Object.values(ui.windows)) {
				if (app.actor?.type === "Player") {
					app.render();
				}
			}
		}
	});

	// === COMBAT SETTINGS ===
	registerCombatSettings();
}

// ============================================
// JOURNAL NOTES SYSTEM
// ============================================

/**
 * Default structure for journal pages
 */
const DEFAULT_JOURNAL_PAGE = {
	id: "",
	name: "New Page",
	content: ""
};

/**
 * Generate a unique ID for journal pages
 */
function generateJournalPageId() {
	return foundry.utils.randomID(16);
}

/**
 * Get journal pages for an actor
 */
function getJournalPages(actor) {
	return actor.getFlag(MODULE_ID, "journalPages") ?? [];
}

/**
 * Get the active page ID for an actor (or first page if none set)
 */
function getActiveJournalPageId(actor) {
	const activeId = actor.getFlag(MODULE_ID, "activeJournalPage");
	const pages = getJournalPages(actor);
	if (activeId && pages.find(p => p.id === activeId)) {
		return activeId;
	}
	return pages[0]?.id ?? null;
}

/**
 * Set the active journal page
 */
async function setActiveJournalPage(actor, pageId) {
	await actor.setFlag(MODULE_ID, "activeJournalPage", pageId);
}

/**
 * Add a new journal page
 */
async function addJournalPage(actor, name = null) {
	const pages = getJournalPages(actor);
	const newPage = {
		id: generateJournalPageId(),
		name: name || game.i18n.format("SHADOWDARK_EXTRAS.journal.default_page_name", { num: pages.length + 1 }),
		content: ""
	};
	pages.push(newPage);
	await actor.setFlag(MODULE_ID, "journalPages", pages);
	await setActiveJournalPage(actor, newPage.id);
	return newPage;
}

/**
 * Update a journal page
 */
async function updateJournalPage(actor, pageId, updates) {
	const pages = getJournalPages(actor);
	const pageIndex = pages.findIndex(p => p.id === pageId);
	if (pageIndex === -1) return null;
	
	pages[pageIndex] = foundry.utils.mergeObject(pages[pageIndex], updates);
	await actor.setFlag(MODULE_ID, "journalPages", pages);
	return pages[pageIndex];
}

/**
 * Delete a journal page
 */
async function deleteJournalPage(actor, pageId) {
	let pages = getJournalPages(actor);
	pages = pages.filter(p => p.id !== pageId);
	await actor.setFlag(MODULE_ID, "journalPages", pages);
	
	// If we deleted the active page, switch to first page
	const activeId = getActiveJournalPageId(actor);
	if (activeId === pageId || !activeId) {
		await setActiveJournalPage(actor, pages[0]?.id ?? null);
	}
	return pages;
}

/**
 * Inject the Journal Notes system into the player sheet Notes tab
 */
async function injectJournalNotes(app, html, actor) {
	// Check if journal notes is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableJournalNotes")) return;
	} catch {
		return;
	}

	// Use the app's element directly - more reliable than the html parameter
	const sheetElement = app.element;
	if (!sheetElement || sheetElement.length === 0) {
		console.log("SDX Journal: Sheet element not found");
		return;
	}
	
	// Find the notes tab - it's a section with class "tab-notes" and data-tab="tab-notes"
	const notesTab = sheetElement.find('section.tab-notes[data-tab="tab-notes"]');
	if (notesTab.length === 0) {
		console.log("SDX Journal: Notes tab section not found");
		return;
	}
	
	// Prevent duplicate injection - check inside the notes tab specifically
	if (notesTab.find('.sdx-journal-notes').length > 0) {
		return;
	}
	
	const targetTab = notesTab.first();

	// Get journal pages data
	let pages = getJournalPages(actor);
	
	// If no pages exist yet and there's existing notes content, migrate it
	if (pages.length === 0) {
		const existingNotes = actor.system?.notes || "";
		const firstPage = {
			id: generateJournalPageId(),
			name: game.i18n.localize("SHADOWDARK_EXTRAS.journal.default_first_page"),
			content: existingNotes
		};
		pages = [firstPage];
		await actor.setFlag(MODULE_ID, "journalPages", pages);
		await setActiveJournalPage(actor, firstPage.id);
	}

	// Get active page
	const activePageId = getActiveJournalPageId(actor);
	const activePage = pages.find(p => p.id === activePageId) || pages[0];

	// Mark pages as active/inactive
	const pagesWithActive = pages.map(p => ({
		...p,
		active: p.id === activePage?.id
	}));

	// Enrich the active page content
	let activePageContent = "";
	if (activePage) {
		const enrichHTMLImpl = foundry?.applications?.ux?.TextEditor?.implementation?.enrichHTML ?? TextEditor.enrichHTML;
		activePageContent = await enrichHTMLImpl(
			activePage.content || "",
			{
				secrets: actor.isOwner,
				async: true,
				relativeTo: actor,
			}
		);
	}

	// Render the journal template
	const templatePath = `modules/${MODULE_ID}/templates/journal-notes.hbs`;
	const renderTpl = foundry?.applications?.handlebars?.renderTemplate ?? renderTemplate;
	const journalHtml = await renderTpl(templatePath, {
		pages: pagesWithActive,
		activePage: activePage,
		activePageContent: activePageContent,
		editable: app.isEditable,
		actorId: actor.id
	});

	// Remove any existing journal notes first
	targetTab.find('.sdx-journal-notes').remove();
	
	// Hide ALL original content in the notes tab (the SD-hideable-section with the editor)
	targetTab.children().each(function() {
		if (!$(this).hasClass('sdx-journal-notes')) {
			$(this).hide();
		}
	});
	
	// Mark tab as having journal active
	targetTab.addClass("sdx-journal-active");
	
	// Append the journal inside the target tab only
	targetTab.append(journalHtml);

	// Activate event listeners
	activateJournalListeners(app, html, actor);
}

/**
 * Activate event listeners for the journal notes system
 */
function activateJournalListeners(app, html, actor) {
	// Find the journal section specifically within the notes tab
	const notesTab = app.element.find('section.tab-notes[data-tab="tab-notes"]');
	const journalSection = notesTab.find('.sdx-journal-notes');
	if (journalSection.length === 0) return;

	// Page selection
	journalSection.find('.sdx-journal-page-item').on('click', async (ev) => {
		// Don't trigger if clicking delete button
		if ($(ev.target).closest('.sdx-page-delete').length) return;
		
		const pageId = $(ev.currentTarget).data('page-id');
		await setActiveJournalPage(actor, pageId);
		app.render(false);
	});

	// Add page button
	journalSection.find('[data-action="add-page"]').on('click', async (ev) => {
		ev.preventDefault();
		await addJournalPage(actor);
		app.render(false);
	});

	// Delete page button
	journalSection.find('[data-action="delete-page"]').on('click', async (ev) => {
		ev.preventDefault();
		ev.stopPropagation();
		
		const pageId = $(ev.currentTarget).data('page-id');
		const pages = getJournalPages(actor);
		const page = pages.find(p => p.id === pageId);
		
		// Confirm deletion
		const confirmed = await Dialog.confirm({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.journal.delete_page_title"),
			content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.journal.delete_page_confirm", { name: page?.name || "Page" })}</p>`,
			yes: () => true,
			no: () => false
		});
		
		if (confirmed) {
			await deleteJournalPage(actor, pageId);
			app.render(false);
		}
	});

	// Page title editing
	journalSection.find('.sdx-page-title-input').on('change', async (ev) => {
		const pageId = $(ev.currentTarget).data('page-id');
		const newName = $(ev.currentTarget).val().trim() || game.i18n.localize("SHADOWDARK_EXTRAS.journal.untitled");
		await updateJournalPage(actor, pageId, { name: newName });
		app.render(false);
	});

	// Edit page content button
	journalSection.find('[data-action="edit-page"]').on('click', async (ev) => {
		ev.preventDefault();
		const pageId = $(ev.currentTarget).data('page-id');
		await openJournalPageEditor(actor, pageId, app);
	});
}

/**
 * Open the ProseMirror editor for a journal page
 * Uses a custom FormApplication to properly initialize the editor
 */
async function openJournalPageEditor(actor, pageId, sheetApp) {
	const pages = getJournalPages(actor);
	const page = pages.find(p => p.id === pageId);
	if (!page) return;

	// Create a custom FormApplication for the editor
	class JournalPageEditor extends FormApplication {
		constructor(actor, page, sheetApp) {
			// Pass the page content as the object data for the form
			super({ content: page.content || "" }, {
				title: game.i18n.format("SHADOWDARK_EXTRAS.journal.edit_page_title", { name: page.name }),
				width: 650,
				height: 500,
				resizable: true,
				classes: ["shadowdark", "shadowdark-extras", "sdx-journal-editor-dialog"]
			});
			this.actorDoc = actor;
			this.page = page;
			this.sheetApp = sheetApp;
		}

		static get defaultOptions() {
			return foundry.utils.mergeObject(super.defaultOptions, {
				template: `modules/${MODULE_ID}/templates/journal-editor.hbs`,
				closeOnSubmit: true,
				submitOnClose: false
			});
		}

		async getData() {
			// The object.content is passed from constructor, we return it for the template
			return {
				content: this.object.content || this.page.content || "",
				pageName: this.page.name
			};
		}

		async _updateObject(event, formData) {
			const content = formData.content || "";
			await updateJournalPage(this.actorDoc, this.page.id, { content: content });
			this.sheetApp.render(false);
		}
	}

	const editor = new JournalPageEditor(actor, page, sheetApp);
	editor.render(true);
}

/**
 * Add candle to the light source options
 */
function extendLightSources() {
	// Add to the config for dropdown options
	if (CONFIG.SHADOWDARK?.LIGHT_SETTING_NAMES) {
		// Add the localized string directly since setup has already run
		CONFIG.SHADOWDARK.LIGHT_SETTING_NAMES.candle = game.i18n.localize("SHADOWDARK_EXTRAS.light_source.candle");
	}
}

/**
 * Patch the light source mappings when they're loaded
 */
function patchLightSourceMappings() {
	// Store the original turnLightOn method
	const originalTurnLightOn = CONFIG.Actor.documentClass.prototype.turnLightOn;
	
	CONFIG.Actor.documentClass.prototype.turnLightOn = async function(itemId) {
		const item = this.items.get(itemId);
		
		// Check if this is one of our custom light sources
		if (item?.system?.light?.template && EXTRA_LIGHT_SOURCES[item.system.light.template]) {
			const lightData = EXTRA_LIGHT_SOURCES[item.system.light.template].light;
			await this.changeLightSettings(lightData);
			return;
		}
		
		// Otherwise use the original method
		return originalTurnLightOn.call(this, itemId);
	};
}

/**
 * Inject the Renown section into the player sheet
 */
function injectRenownSection(html, actor) {
	// Check if renown is enabled
	if (!game.settings.get(MODULE_ID, "enableRenown")) return;

	// Find the luck section to insert after it
	const luckSection = html.find('.SD-box:has(.header label:contains("Luck"))');
	
	if (luckSection.length === 0) {
		// Alternative: find by checking the content structure
		const boxes = html.find('.grid-2-columns .SD-box');
		let targetBox = null;
		
		boxes.each(function() {
			const label = $(this).find('.header label').text();
			if (label.toLowerCase().includes('luck')) {
				targetBox = $(this);
				return false;
			}
		});
		
		if (targetBox) {
			insertRenownAfter(targetBox, actor);
		}
	} else {
		insertRenownAfter(luckSection, actor);
	}
}

/**
 * Insert the renown HTML after the target element
 */
function insertRenownAfter(targetElement, actor) {
	const renownMax = game.settings.get(MODULE_ID, "renownMaximum");
	const renownValue = actor.getFlag(MODULE_ID, "renown") ?? 0;
	
	const renownHtml = `
		<div class="SD-box grid-colspan-2 shadowdark-extras-renown">
			<div class="header">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.sheet.player.renown")}</label>
				<span></span>
			</div>
			<div class="content larger">
				<div class="value-grid renown-display">
					<input type="number" 
						name="flags.${MODULE_ID}.renown" 
						value="${renownValue}" 
						min="0" 
						max="${renownMax}"
						data-dtype="Number"
						placeholder="0">
					<div>/</div>
					<div>${renownMax}</div>
				</div>
			</div>
		</div>
	`;
	
	targetElement.after(renownHtml);
	
	// Add event listener to enforce maximum only (allow negative values)
	const renownInput = targetElement.parent().find(`input[name="flags.${MODULE_ID}.renown"]`);
	renownInput.on('input change blur', function() {
		let val = parseFloat(this.value);
		const maxRenown = game.settings.get(MODULE_ID, "renownMaximum") ?? 20;
		
		// If invalid, set to 0
		if (isNaN(val)) {
			val = 0;
		}
		// Clamp to max only
		if (val > maxRenown) {
			val = maxRenown;
		}
		
		// Update the input if changed
		if (parseFloat(this.value) !== val) {
			this.value = val;
		}
	});
}

/**
 * Handle form submission to save renown value
 */
function handleRenownUpdate(actor, formData) {
	const renownKey = `flags.${MODULE_ID}.renown`;
	if (formData.hasOwnProperty(renownKey)) {
		const renownMax = game.settings.get(MODULE_ID, "renownMaximum");
		let value = parseInt(formData[renownKey]) || 0;
		// Only enforce maximum, allow negative values
		value = Math.min(value, renownMax);
		actor.setFlag(MODULE_ID, "renown", value);
	}
}

// ============================================
// CONDITIONS QUICK TOGGLES
// ============================================

/**
 * Add inline control buttons to effect/condition items
 */
function addInlineEffectControls($effectsTab, actor) {
	const $items = $effectsTab.find('.item.effect');
	
	$items.each(function() {
		const $item = $(this);
		
		// Skip if already has controls
		if ($item.find('.sdx-effect-controls').length) return;
		
		const itemId = $item.data('item-id');
		const itemUuid = $item.data('uuid');
		
		if (!itemId) return;
		
		// Create control buttons
		const $controls = $(`
			<div class="sdx-effect-controls">
				<button type="button" class="sdx-effect-edit" data-tooltip="Edit" title="Edit">
					<i class="fas fa-edit"></i>
				</button>
				<button type="button" class="sdx-effect-transfer" data-tooltip="Transfer to Player" title="Transfer to Player">
					<i class="fas fa-share"></i>
				</button>
				<button type="button" class="sdx-effect-delete" data-tooltip="Delete" title="Delete">
					<i class="fas fa-trash"></i>
				</button>
			</div>
		`);
		
		// Add controls to the item
		$item.append($controls);
		
		// Edit button
		$controls.find('.sdx-effect-edit').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) item.sheet.render(true);
		});
		
		// Transfer button
		$controls.find('.sdx-effect-transfer').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item && game.user.isGM) {
				const targetActorId = await showTransferDialog(actor, item);
				if (targetActorId) {
					await transferItemToPlayer(actor, item, targetActorId);
				}
			}
		});
		
		// Delete button
		$controls.find('.sdx-effect-delete').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) {
				const confirm = await Dialog.confirm({
					title: "Delete Effect",
					content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
					yes: () => true,
					no: () => false
				});
				
				if (confirm) {
					await item.delete();
					ui.notifications.info(`Deleted ${item.name}`);
				}
			}
		});
	});
}

/**
 * Inject conditions quick toggles into the Effects tab
 */
async function injectConditionsToggles(app, html, actor) {
	if (actor.type !== "Player") return;

	// Find the active effects section
	const $effectsTab = html.find('.tab[data-tab="tab-effects"]');
	if (!$effectsTab.length) return;

	// Check if we've already injected (avoid duplicates on re-render)
	if ($effectsTab.find('.sdx-conditions-toggles').length) return;
	
	// Add inline control buttons to existing effects/conditions
	addInlineEffectControls($effectsTab, actor);

	// Fetch all conditions from the compendium
	const conditionsPack = game.packs.get("shadowdark.conditions");
	if (!conditionsPack) {
		console.warn(`${MODULE_ID} | Conditions compendium not found`);
		return;
	}

	const conditions = await conditionsPack.getDocuments();
	if (!conditions || conditions.length === 0) return;

	// Group conditions by base name (store minimal data, not document references)
	const groupedConditions = groupConditionsByBaseName(conditions);
	
	// Convert grouped conditions to plain data objects to avoid holding document references
	const conditionDataMap = {};
	for (const [baseName, conditionGroup] of Object.entries(groupedConditions)) {
		conditionDataMap[baseName] = conditionGroup.map(cond => ({
			uuid: cond.uuid,
			name: cond.name,
			img: cond.img,
			description: cond.system?.description?.value || cond.system?.description || ''
		}));
	}

	// Get currently active effects on the actor
	const activeEffects = actor.effects.contents || [];

	// Get the selected theme
	const theme = game.settings.get(MODULE_ID, "conditionsTheme") || "parchment";

	// Build the toggles HTML
	let togglesHtml = `<div class="sdx-conditions-toggles sdx-theme-${theme}">`;
	togglesHtml += '<h3 class="sdx-conditions-header">Quick Conditions</h3>';
	togglesHtml += '<div class="sdx-conditions-grid">';

	for (const [baseName, conditionGroup] of Object.entries(conditionDataMap)) {
		const hasVariants = conditionGroup.length > 1;
		const firstCondition = conditionGroup[0];
		
		// Check if any variant is active
		const isActive = conditionGroup.some(condition => 
		    activeEffects.some(effect => 
			    effect.name === condition.name || 
			    (effect._stats?.compendiumSource === condition.uuid) ||
			    (effect.flags?.core?.sourceId === condition.uuid)
		    )
		);

		const displayName = baseName.replace('Condition: ', '');
		
		// Get description
		const rawDescription = firstCondition.description || '';
		// Keep HTML formatting but escape quotes for data attribute
		const processedDescription = rawDescription.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

		if (hasVariants) {
			// Has multiple variants - show with dropdown indicator
			togglesHtml += `
				<div class="sdx-condition-toggle has-variants ${isActive ? 'active' : ''}" 
					 data-condition-base="${baseName}"
					 data-condition-description="${processedDescription.replace(/"/g, '&quot;')}">
					<img src="${firstCondition.img}" alt="${displayName}" />
					<span class="sdx-condition-name">${displayName}</span>
					<i class="fas fa-caret-down"></i>
				</div>
			`;
		} else {
			// Single condition - direct toggle
			togglesHtml += `
				<div class="sdx-condition-toggle ${isActive ? 'active' : ''}" 
					 data-condition-uuid="${firstCondition.uuid}"
					 data-condition-name="${firstCondition.name}"
					 data-condition-description="${processedDescription.replace(/"/g, '&quot;')}">
					<img src="${firstCondition.img}" alt="${displayName}" />
					<span class="sdx-condition-name">${displayName}</span>
				</div>
			`;
		}
	}

	togglesHtml += '</div></div>';

	// Insert after the active effects section
	const $activeEffects = $effectsTab.find('.active-effects, .effects-list').last();
	if ($activeEffects.length) {
		$activeEffects.after(togglesHtml);
	} else {
		// Fallback: append to the tab
		$effectsTab.append(togglesHtml);
	}

	// Attach event handlers
	const $toggles = $effectsTab.find('.sdx-condition-toggle');
	$toggles.on('click', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		
		if (!actor.isOwner) return;

		const $toggle = $(this);
		
		if ($toggle.hasClass('has-variants')) {
			// Show submenu for variants
			const baseName = $toggle.data('condition-base');
			const variants = conditionDataMap[baseName];
			showConditionSubmenu($toggle, variants, actor, activeEffects);
		} else {
			// Direct toggle for single condition
			const conditionUuid = $toggle.data('condition-uuid');
			const conditionName = $toggle.data('condition-name');
			const isActive = $toggle.hasClass('active');

					if (isActive) {
						await removeConditionFromActor(actor, conditionName, conditionUuid);
					} else {
						await addConditionToActor(actor, conditionUuid);
					}
		}
	});
	
	// Tooltips removed per user request
}

/**
 * Convert @UUID[...]{text} links to clickable spans
 */
function convertUUIDLinksToClickable(text) {
	// Match @UUID[uuid]{label} or @UUID[uuid]
	return text.replace(/@UUID\[([^\]]+)\](?:\{([^\}]+)\})?/g, (match, uuid, label) => {
		const displayText = label || uuid.split('.').pop();
		return `<span class="sdx-uuid-link" data-uuid="${uuid}">${displayText}</span>`;
	});
}

/**
 * Group conditions by their base name (without variant specifier)
 */
function groupConditionsByBaseName(conditions) {
	const groups = {};
	
	for (const condition of conditions) {
		const name = condition.name;
		// Extract base name by removing variants like (1), (Cha), etc.
		const baseName = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
		
		if (!groups[baseName]) {
			groups[baseName] = [];
		}
		groups[baseName].push(condition);
	}
	
	// Sort groups alphabetically and sort variants within each group
	const sortedGroups = {};
	Object.keys(groups).sort().forEach(key => {
		sortedGroups[key] = groups[key].sort((a, b) => a.name.localeCompare(b.name));
	});
	
	return sortedGroups;
}

/**
 * Show a submenu to select condition variant
 */
function showConditionSubmenu($toggle, variants, actor, activeEffects) {
	// Remove any existing submenu
	$('.sdx-condition-submenu').remove();
	
	// Build submenu HTML
	let submenuHtml = '<div class="sdx-condition-submenu">';
	
	for (const variant of variants) {
		const isActive = activeEffects.some(effect => 
			effect.name === variant.name || 
			(effect._stats?.compendiumSource === variant.uuid) ||
			(effect.flags?.core?.sourceId === variant.uuid)
		);
		
		// Extract the variant part (e.g., "1", "Cha", etc.)
		const match = variant.name.match(/\(([^)]+)\)\s*$/);
		const variantLabel = match ? match[1] : variant.name.replace('Condition: ', '');
		
		submenuHtml += `
			<div class="sdx-submenu-item ${isActive ? 'active' : ''}"
				 data-condition-uuid="${variant.uuid}"
				 data-condition-name="${variant.name}">
				<span>${variantLabel}</span>
				${isActive ? '<i class="fas fa-check"></i>' : ''}
			</div>
		`;
	}
	
	submenuHtml += '</div>';
	
	// Append submenu
	const $submenu = $(submenuHtml);
	$toggle.append($submenu);
	
	// Position submenu
	const rect = $toggle[0].getBoundingClientRect();
	const submenuHeight = $submenu.outerHeight();
	const spaceBelow = window.innerHeight - rect.bottom;
	
	if (spaceBelow < submenuHeight) {
		$submenu.css('bottom', '100%').css('top', 'auto');
	}
	
	// Handle submenu item clicks
	$submenu.find('.sdx-submenu-item').on('click', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		
		const $item = $(this);
		const conditionUuid = $item.data('condition-uuid');
		const conditionName = $item.data('condition-name');
		const isActive = $item.hasClass('active');
		
		if (isActive) {
			await removeConditionFromActor(actor, conditionName, conditionUuid);
		} else {
			await addConditionToActor(actor, conditionUuid);
		}
		
		$submenu.remove();
	});
	
	// Close submenu when clicking outside
	setTimeout(() => {
		$(document).one('click', () => {
			$submenu.remove();
		});
	}, 10);
}

/**
 * Add a condition to an actor by creating an active effect from the condition item
 */
async function addConditionToActor(actor, conditionUuid) {
	try {
		const condition = await fromUuid(conditionUuid);
		if (!condition) {
			ui.notifications.error(`Condition not found: ${conditionUuid}`);
			return;
		}

		// Check if condition already exists with improved matching
		const existing = actor.effects.find(e => {
			// Direct name match
			if (e.name === condition.name) return true;
			
			// Source ID match (support new _stats.compendiumSource with fallback)
			if (e._stats?.compendiumSource === conditionUuid) return true;
			if (e.flags?.core?.sourceId === conditionUuid) return true;
			
			// Case-insensitive name match
			if (e.name?.toLowerCase() === condition.name?.toLowerCase()) return true;
			
			// Check if the effect name contains the condition name
			if (e.name?.toLowerCase().includes(condition.name?.toLowerCase())) return true;
			
			return false;
		});
		
		if (existing) {
			console.log(`${MODULE_ID} | Condition ${condition.name} already active`);
			return;
		}

		// Get the effects from the condition item
		const conditionEffects = condition.effects?.contents || [];
		
		if (conditionEffects.length > 0) {
			// Copy the first effect from the condition
			const sourceEffect = conditionEffects[0];
			const effectData = sourceEffect.toObject();
			
			// Set flags to track origin
			// Prefer the new _stats.compendiumSource property. Do not write the deprecated core.sourceId flag.
			effectData._stats = effectData._stats || {};
			effectData._stats.compendiumSource = conditionUuid;
			effectData.flags[MODULE_ID] = effectData.flags[MODULE_ID] || {};
			effectData.flags[MODULE_ID].conditionToggle = true;

			await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
			ui.notifications.info(`Applied: ${condition.name}`);
		} else {
			// If the condition has no effects, create a basic status effect
			const effectData = {
				name: condition.name,
				img: condition.img,
				_stats: { compendiumSource: conditionUuid },
				flags: {
					[MODULE_ID]: { conditionToggle: true }
				}
			};
			await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
			ui.notifications.info(`Applied: ${condition.name}`);
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error adding condition:`, error);
		ui.notifications.error(`Failed to apply condition`);
	}
}

/**
 * Remove a condition from an actor
 */
async function removeConditionFromActor(actor, conditionName, conditionUuid) {
	try {
		// Find the effect(s) matching this condition
		const effectsToRemove = actor.effects.filter(e => 
			e.name === conditionName || 
			(e._stats?.compendiumSource === conditionUuid) ||
			(e.flags?.core?.sourceId === conditionUuid) ||
			(e.getFlag(MODULE_ID, "conditionToggle") && e.name === conditionName)
		);

		if (effectsToRemove.length > 0) {
			const ids = effectsToRemove.map(e => e.id);
			await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
			ui.notifications.info(`Removed: ${conditionName}`);
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error removing condition:`, error);
		ui.notifications.error(`Failed to remove condition`);
	}
}

/**
 * Update condition toggles when effects change
 */
function updateConditionToggles(actor, html) {
	const $toggles = html.find('.sdx-condition-toggle');
	if (!$toggles.length) return;

	const activeEffects = actor.effects.contents || [];

	$toggles.each(function() {
		const $toggle = $(this);
		const conditionUuid = $toggle.data('condition-uuid');
		const conditionName = $toggle.data('condition-name');

		// Check multiple ways to match the condition
		const isActive = activeEffects.some(effect => {
			// Direct name match
			if (effect.name === conditionName) return true;
			
			// Source ID match (prefer new _stats.compendiumSource)
			if (effect._stats?.compendiumSource === conditionUuid) return true;
			if (effect.flags?.core?.sourceId === conditionUuid) return true;
			
			// Case-insensitive name match (sometimes names don't match exactly)
			if (effect.name?.toLowerCase() === conditionName?.toLowerCase()) return true;
			
			// Check if the effect name contains the condition name (e.g., "Condition: Blind" contains "Blind")
			if (effect.name?.toLowerCase().includes(conditionName?.toLowerCase())) return true;
			
			return false;
		});

		$toggle.toggleClass('active', isActive);
	});
}

// ============================================
// ENHANCED DETAILS TAB
// ============================================

/**
 * Enhance the Details tab with improved styling and organization
 */
function enhanceDetailsTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $detailsTab = html.find('.tab[data-tab="tab-details"]');
	if (!$detailsTab.length) return;

	// Add enhanced class to the details tab
	$detailsTab.addClass('sdx-enhanced-details');

	// Hide the level box (it's already in the enhanced header)
	$detailsTab.find('.SD-box').first().hide();
}

// ============================================
// ENHANCED ABILITIES TAB
// ============================================

/**
 * Enhance the Abilities tab with improved styling and organization
 */
function enhanceAbilitiesTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $abilitiesTab = html.find('.tab[data-tab="tab-abilities"]');
	if (!$abilitiesTab.length) return;

	// Add enhanced class to the abilities tab
	$abilitiesTab.addClass('sdx-enhanced-abilities');
	
	// Fix bold formatting for unidentified weapons in abilities section
	fixUnidentifiedWeaponBoldInAbilities($abilitiesTab);
}

/**
 * Fix bold formatting for unidentified weapons in the abilities section
 */
function fixUnidentifiedWeaponBoldInAbilities($abilitiesTab) {
	// Only fix if unidentified feature is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return;
	}
	
	// Find all attack displays that contain "Unidentified Item" text
	$abilitiesTab.find('.attack .rollable').each(function() {
		const $rollable = $(this);
		const html = $rollable.html();
		
		// Check if it contains "Unidentified Item" without proper bold formatting
		if (html && html.includes('Unidentified Item')) {
			// Replace plain text with bold version
			const fixedHtml = html.replace(
				/Unidentified Item/g,
				'<b style="font-size:16px">Unidentified Item</b>'
			);
			$rollable.html(fixedHtml);
		}
	});
}

/**
 * Fix bold formatting for unidentified weapons - runs for all users
 */
function fixUnidentifiedWeaponBoldForAllUsers(html) {
	// Only fix if unidentified feature is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return;
	}
	
	// Find all attack rollables that contain "Unidentified Item" text
	html.find('.attack .rollable').each(function() {
		const $rollable = $(this);
		const currentHtml = $rollable.html();
		
		// Check if it contains "Unidentified Item" without proper bold formatting
		if (currentHtml && currentHtml.includes('Unidentified Item') && !currentHtml.includes('<b')) {
			// Replace plain text with bold version
			const fixedHtml = currentHtml.replace(
				/Unidentified Item/g,
				'<b style="font-size:16px">Unidentified Item</b>'
			);
			$rollable.html(fixedHtml);
		}
	});
}

// ============================================
// ENHANCED TALENTS TAB
// ============================================

/**
 * Add inline control buttons to talent items
 */
function addInlineTalentControls($talentsTab, actor) {
	const $items = $talentsTab.find('.item');
	
	$items.each(function() {
		const $item = $(this);
		
		// Skip if already has controls
		if ($item.find('.sdx-talent-controls').length) return;
		
		const itemId = $item.data('item-id');
		
		if (!itemId) return;
		
		// Create control buttons
		const $controls = $(`
			<div class="sdx-talent-controls">
				<button type="button" class="sdx-talent-edit" data-tooltip="Edit" title="Edit">
					<i class="fas fa-edit"></i>
				</button>
				<button type="button" class="sdx-talent-transfer" data-tooltip="Transfer to Player" title="Transfer to Player">
					<i class="fas fa-share"></i>
				</button>
				<button type="button" class="sdx-talent-delete" data-tooltip="Delete" title="Delete">
					<i class="fas fa-trash"></i>
				</button>
			</div>
		`);
		
		// Add controls to the item
		$item.append($controls);
		
		// Edit button
		$controls.find('.sdx-talent-edit').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) item.sheet.render(true);
		});
		
		// Transfer button
		$controls.find('.sdx-talent-transfer').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item && game.user.isGM) {
				const targetActorId = await showTransferDialog(actor, item);
				if (targetActorId) {
					await transferItemToPlayer(actor, item, targetActorId);
				}
			}
		});
		
		// Delete button
		$controls.find('.sdx-talent-delete').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) {
				const confirm = await Dialog.confirm({
					title: "Delete Talent",
					content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
					yes: () => true,
					no: () => false
				});
				
				if (confirm) {
					await item.delete();
					ui.notifications.info(`Deleted ${item.name}`);
				}
			}
		});
	});
}

/**
 * Enhance the Talents tab with improved styling and organization
 */
function enhanceTalentsTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $talentsTab = html.find('.tab[data-tab="tab-talents"]');
	if (!$talentsTab.length) return;

	// Add enhanced class to the talents tab
	$talentsTab.addClass('sdx-enhanced-talents');
	
	// Add inline control buttons to talent items
	addInlineTalentControls($talentsTab, actor);
}

// ============================================
// ENHANCED SPELLS TAB
// ============================================

/**
 * Fix context menu positioning for enhanced tabs
 * The context menu needs to be positioned relative to the viewport when in fixed positioned tabs
 */
/**
 * Enhance the Spells tab with improved styling and organization
 */
function enhanceSpellsTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $spellsTab = html.find('.tab[data-tab="tab-spells"]');
	if (!$spellsTab.length) return;

	// Add enhanced class to the spells tab
	$spellsTab.addClass('sdx-enhanced-spells');

	// Add action buttons to spell items
	$spellsTab.find('.item[data-item-id]').each((i, item) => {
		const $item = $(item);
		const itemId = $item.data('item-id');
		
		// Skip if buttons already added
		if ($item.find('.sdx-spell-actions').length) return;
		
		// Find the item-name element
		const $itemName = $item.find('.item-name');
		if (!$itemName.length) return;
		
		// Create action buttons container
		const $actions = $(`
			<div class="sdx-spell-actions">
				<a class="sdx-spell-btn sdx-edit-spell" data-tooltip="Edit" title="Edit">
					<i class="fas fa-edit"></i>
				</a>
				<a class="sdx-spell-btn sdx-transfer-spell" data-tooltip="Transfer to Player" title="Transfer to Player">
					<i class="fas fa-share"></i>
				</a>
				<a class="sdx-spell-btn sdx-delete-spell" data-tooltip="Delete" title="Delete">
					<i class="fas fa-trash"></i>
				</a>
			</div>
		`);
		
		// Insert actions after the item-name
		$itemName.after($actions);
		
		// Edit button handler
		$actions.find('.sdx-edit-spell').on('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) item.sheet.render(true);
		});
		
		// Transfer button handler
		$actions.find('.sdx-transfer-spell').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item && game.user.isGM) {
				// Show player selection dialog
				const players = game.users.filter(u => !u.isGM && u.active);
				if (players.length === 0) {
					ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.notifications.no_active_players"));
					return;
				}
				
				const playerOptions = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
				const content = `
					<form>
						<div class="form-group">
							<label>${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.select_player")}</label>
							<select name="playerId">${playerOptions}</select>
						</div>
					</form>
				`;
				
				new Dialog({
					title: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_spell_title"),
					content: content,
					buttons: {
						transfer: {
							icon: '<i class="fas fa-share"></i>',
							label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer"),
							callback: async (html) => {
								const playerId = html.find('[name="playerId"]').val();
								const player = game.users.get(playerId);
								const targetActor = player?.character;
								
								if (!targetActor) {
									ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.notifications.no_character_assigned"));
									return;
								}
								
								const itemData = item.toObject();
								await targetActor.createEmbeddedDocuments("Item", [itemData]);
								await item.delete();
								ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.notifications.item_transferred", {
									item: item.name,
									target: targetActor.name
								}));
							}
						},
						cancel: {
							icon: '<i class="fas fa-times"></i>',
							label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.cancel")
						}
					},
					default: "transfer"
				}).render(true);
			}
		});
		
		// Delete button handler
		$actions.find('.sdx-delete-spell').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (!item) return;
			
			const confirmed = await Dialog.confirm({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.inventory.delete_spell_title"),
				content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.inventory.delete_spell_text", {name: item.name})}</p>`
			});
			
			if (confirmed) {
				await item.delete();
			}
		});
	});
}

// ============================================
// ENHANCED EFFECTS TAB
// ============================================

/**
 * Enhance the Effects tab with improved styling and organization
 */
function enhanceEffectsTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $effectsTab = html.find('.tab[data-tab="tab-effects"]');
	if (!$effectsTab.length) return;

	// Add enhanced class to the effects tab
	$effectsTab.addClass('sdx-enhanced-effects');
}

// ============================================
// ENHANCED INVENTORY TAB
// ============================================

/**
 * Enhance the Inventory tab with improved styling and organization
 */
function enhanceInventoryTab(app, html, actor) {
	if (actor.type !== "Player") return;

	const $inventoryTab = html.find('.tab[data-tab="tab-inventory"]');
	if (!$inventoryTab.length) return;

	// Add enhanced class to the inventory tab
	$inventoryTab.addClass('sdx-enhanced-inventory');
}

// ============================================
// ENHANCED HEADER
// ============================================

/**
 * Inject the enhanced interactive header into player sheets
 * Replaces the default header with HP bar, stats, AC, luck, XP, level display
 */
async function injectEnhancedHeader(app, html, actor) {
	// Check if enhanced header is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableEnhancedHeader")) return;
	} catch {
		return;
	}

	if (actor.type !== "Player") return;

	const $header = html.find('.SD-header').first();
	if (!$header.length) return;

	// Clean up any existing enhanced content first (in case of re-render)
	$header.find('.sdx-enhanced-content').remove();
	
	// Mark as enhanced
	$header.addClass('sdx-enhanced-header');

	// Get actor data
	const sys = actor.system;
	const hp = sys.attributes?.hp || { value: 0, max: 0 };
	const ac = sys.attributes?.ac?.value ?? 10;
	const level = sys.level?.value ?? 1;
	const xp = sys.level?.xp ?? 0;
	const xpForNextLevel = getXpForNextLevel(level);
	const xpPercent = xpForNextLevel > 0 ? Math.min(100, (xp / xpForNextLevel) * 100) : 0;
	const levelUp = xp >= xpForNextLevel;
	
	// Check if pulp mode is enabled
	const usePulpMode = game.settings.get("shadowdark", "usePulpMode");
	const luck = usePulpMode ? (sys.luck?.remaining ?? 0) : (sys.luck?.available ?? false);

	// Get character details - need to fetch actual item names from UUIDs
	let ancestryName = '';
	let className = '';
	let backgroundName = '';
	
	try {
		if (sys.ancestry) {
			const ancestryItem = await fromUuid(sys.ancestry);
			ancestryName = ancestryItem?.name || '';
		}
		if (sys.class) {
			const classItem = await fromUuid(sys.class);
			className = classItem?.name || '';
		}
		if (sys.background) {
			const backgroundItem = await fromUuid(sys.background);
			backgroundName = backgroundItem?.name || '';
		}
	} catch (e) {
		console.warn("shadowdark-extras | Error fetching character details:", e);
	}

	const abilities = sys.abilities || {};
	const abilityOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

	// Calculate HP percentage for bar
	const hpPercent = hp.max > 0 ? Math.min(100, Math.max(0, (hp.value / hp.max) * 100)) : 0;
	const hpColor = hpPercent > 50 ? '#4ade80' : hpPercent > 25 ? '#fbbf24' : '#ef4444';

	// Build abilities HTML
	let abilitiesHtml = '';
	for (const key of abilityOrder) {
		const ab = abilities[key] || {};
		const base = ab.base ?? 10;
		const bonus = ab.bonus ?? 0;
		const total = base + bonus;
		const mod = ab.mod ?? Math.floor((total - 10) / 2);
		const modSign = mod >= 0 ? '+' : '';
		
		abilitiesHtml += `
			<div class="sdx-ability" data-ability="${key}" data-tooltip="${key.toUpperCase()}">
				<div class="sdx-ability-label">${key.toUpperCase()}</div>
				<div class="sdx-ability-mod">${modSign}${mod}</div>
				<div class="sdx-ability-score">${total}</div>
			</div>
		`;
	}

	// Build the luck container HTML based on mode
	let luckHtml;
	if (usePulpMode) {
		// Pulp mode: show editable number
		luckHtml = `
			<div class="sdx-luck-container pulp-mode" data-tooltip="Luck Tokens: ${luck}">
				<div class="sdx-luck-value">${luck}</div>
				<div class="sdx-luck-label">LUCK</div>
			</div>
		`;
	} else {
		// Standard mode: show toggle icon
		const hasLuck = luck ? 'has-luck' : '';
		const luckStatus = luck ? 'Available' : 'Used';
		luckHtml = `
			<div class="sdx-luck-container standard-mode ${hasLuck}" data-tooltip="Luck (${luckStatus})">
				<i class="fa-solid fa-dice-d20"></i>
			</div>
		`;
	}

	// Build the enhanced header content
	const enhancedContent = `
		<div class="sdx-enhanced-content">
			<div class="sdx-portrait-container">
				<img class="sdx-portrait" src="${actor.img}" data-edit="img" data-tooltip="${actor.name}" />
				<div class="sdx-hp-bar-container" data-tooltip="HP: ${hp.value} / ${hp.max}">
					<div class="sdx-hp-bar" style="width: ${hpPercent}%; background-color: ${hpColor};"></div>
					<div class="sdx-hp-text">
						<span class="sdx-hp-value" data-field="hp-value">${hp.value}</span>
						<span class="sdx-hp-separator">/</span>
						<span class="sdx-hp-max">${hp.max}</span>
					</div>
				</div>
			</div>
			
			<div class="sdx-header-main">
				<div class="sdx-actor-name-row">
					<input class="sdx-actor-name" data-field="name" type="text" value="${actor.name}" placeholder="Character Name" />
				</div>
				
				<div class="sdx-char-details-row">
					${ancestryName ? `<span class="sdx-char-ancestry">${ancestryName}</span>` : ''}
					${className ? `<span class="sdx-char-class">${className}</span>` : ''}
					${backgroundName ? `<span class="sdx-char-background">${backgroundName}</span>` : ''}
				</div>
				
				<div class="sdx-xp-row" data-tooltip="XP: ${xp} / ${xpForNextLevel}">
					<span class="sdx-xp-label">XP</span>
					<span class="sdx-xp-value">${xp}</span>
					<span class="sdx-xp-separator">/</span>
					<span class="sdx-xp-max">${xpForNextLevel}</span>
					<div class="sdx-xp-bar">
						<div class="sdx-xp-bar-fill" style="width: ${xpPercent}%;"></div>
					</div>
				</div>
				
				<div class="sdx-stats-row">
					<div class="sdx-ac-container" data-tooltip="Armor Class">
						<i class="fas fa-shield-halved"></i>
						<div class="sdx-ac-value">${ac}</div>
					</div>
					
					<div class="sdx-abilities-container">
						${abilitiesHtml}
					</div>
					
					<div class="sdx-right-stats">
						<div class="sdx-init-container" data-tooltip="Initiative" data-ability="dex">
							<div class="sdx-init-mod">+${abilities.dex?.mod ?? 0}</div>
							<div class="sdx-init-label">INIT</div>
						</div>
					</div>
				</div>
			</div>
			
			<div class="sdx-header-right">
				${luckHtml}
				<div class="sdx-level-container ${levelUp ? 'can-level-up' : ''}" data-tooltip="${levelUp ? 'Ready to Level Up!' : 'Level'}">
					${levelUp 
						? '<i class="fas fa-arrow-up fa-beat"></i>' 
						: `<div class="sdx-level-value">${level}</div><div class="sdx-level-label">LVL</div>`
					}
				</div>
			</div>
		</div>
	`;

	// Clear the existing header content and inject enhanced version
	const $portrait = $header.find('.portrait');
	const $logo = $header.find('.shadowdark-logo');
	const $title = $header.find('.SD-title');
	
	// Hide original elements
	$portrait.hide();
	$logo.hide();
	$title.hide();

	// Append enhanced content
	$header.append(enhancedContent);

	// Wire up interactivity
	const $enhancedContent = $header.find('.sdx-enhanced-content');

	// Portrait click to launch tokenizer (if vtta-tokenizer module is active)
	// Hold Shift to open the default Foundry file picker instead
	$enhancedContent.find('.sdx-portrait').on('click', async (e) => {
		if (!actor.isOwner) return;
		e.stopPropagation();
		
		// If shift is held, open the default file picker
		if (e.shiftKey) {
			const fp = new FilePicker({
				type: "image",
				current: actor.img,
				callback: async (path) => {
					await actor.update({ img: path });
				}
			});
			return fp.browse();
		}
		
		// Check if vtta-tokenizer module is active and available
		if (!window.Tokenizer && !game.modules.get("vtta-tokenizer")?.active) {
			// No tokenizer available, fall back to file picker
			const fp = new FilePicker({
				type: "image",
				current: actor.img,
				callback: async (path) => {
					await actor.update({ img: path });
				}
			});
			return fp.browse();
		}
		
		try {
			// Use tokenizeActor for direct tokenization, or launch for UI
			if (window.Tokenizer?.tokenizeActor) {
				await window.Tokenizer.tokenizeActor(actor);
			} else if (window.Tokenizer?.launch) {
				// Launch with options
				const options = {
					name: actor.name,
					type: actor.type.toLowerCase(),
					avatarFilename: actor.img
				};
				window.Tokenizer.launch(options, (response) => {
					console.log("shadowdark-extras | Tokenizer response:", response);
					ui.notifications.success(`Tokenizer completed for ${actor.name}!`);
				});
			} else {
				// Fallback to file picker if Tokenizer API not found
				const fp = new FilePicker({
					type: "image",
					current: actor.img,
					callback: async (path) => {
						await actor.update({ img: path });
					}
				});
				return fp.browse();
			}
		} catch (error) {
			console.error("shadowdark-extras | Error launching tokenizer:", error);
			ui.notifications.error(`Failed to launch tokenizer: ${error.message}`);
		}
	});

	// HP click to edit
	$enhancedContent.find('.sdx-hp-bar-container').on('click', async (e) => {
		if (!actor.isOwner) return;
		e.stopPropagation();
		
		const $hpValue = $enhancedContent.find('.sdx-hp-value');
		const currentHp = hp.value;
		
		// Create inline input
		const $input = $(`<input type="number" class="sdx-hp-input" value="${currentHp}" min="0" max="${hp.max}" />`);
		$hpValue.replaceWith($input);
		$input.focus().select();
		
		const saveHp = async () => {
			const newHp = Math.max(0, Math.min(hp.max, parseInt($input.val()) || 0));
			await actor.update({ "system.attributes.hp.value": newHp });
		};
		
		$input.on('blur', saveHp);
		$input.on('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				$input.blur();
			} else if (e.key === 'Escape') {
				$input.val(currentHp);
				$input.blur();
			}
		});
	});

	// Luck interaction - toggle or edit based on mode
	const $luckContainer = $enhancedContent.find('.sdx-luck-container');
	
	if (usePulpMode) {
		// Pulp mode: click to edit the number
		$luckContainer.on('click', async (e) => {
			if (!actor.isOwner) return;
			e.stopPropagation();
			
			const $luckValue = $luckContainer.find('.sdx-luck-value');
			const currentLuck = sys.luck?.remaining ?? 0;
			
			// Create inline input
			const $input = $(`<input type="number" class="sdx-luck-input" value="${currentLuck}" min="0" />`);
			$luckValue.replaceWith($input);
			$input.focus().select();
			
			const saveLuck = async () => {
				const newLuck = Math.max(0, parseInt($input.val()) || 0);
				await actor.update({ "system.luck.remaining": newLuck });
			};
			
			$input.on('blur', saveLuck);
			$input.on('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					$input.blur();
				} else if (e.key === 'Escape') {
					$input.val(currentLuck);
					$input.blur();
				}
			});
		});
	} else {
		// Standard mode: toggle on/off
		$luckContainer.on('click', async () => {
			if (!actor.isOwner) return;
			await actor.update({ "system.luck.available": !luck });
		});
	}

	// Actor name change
	$enhancedContent.find('.sdx-actor-name').on('change', async function() {
		if (!actor.isOwner) return;
		const newName = $(this).val().trim();
		if (newName && newName !== actor.name) {
			await actor.update({ "name": newName });
		}
	});

	// Level-up interaction
	$enhancedContent.find('.sdx-level-container.can-level-up').on('click', async (e) => {
		if (!actor.isOwner) return;
		e.stopPropagation();
		e.preventDefault();
		
		// Check if this is level 0 advancing
		let actorClass = null;
		try {
			if (sys.class) {
				actorClass = await fromUuid(sys.class);
			}
		} catch (err) {
			console.warn("shadowdark-extras | Could not fetch actor class:", err);
		}
		
		// Level 0 -> Level 1 uses Character Generator
		if (level === 0 && actorClass?.name?.includes("Level 0")) {
			new shadowdark.apps.CharacterGeneratorSD(actor._id).render(true);
		} else {
			// Standard level up
			new shadowdark.apps.LevelUpSD(actor._id).render(true);
		}
	});

	// Ability rolls on click
	$enhancedContent.find('.sdx-ability').on('click', async function() {
		const ability = $(this).data('ability');
		if (actor.rollAbility) {
			actor.rollAbility(ability);
		}
	});

	// Initiative roll - if in combat, roll for combat initiative; otherwise just roll dex
	$enhancedContent.find('.sdx-init-container').on('click', async () => {
		// Check if there's an active combat and this actor has a combatant in it
		if (game.combat) {
			const combatant = game.combat.combatants.find(c => c.actorId === actor.id);
			if (combatant) {
				// Roll initiative for combat
				await game.combat.rollInitiative(combatant.id, {updateTurn: false});
				return;
			}
		}
		// Fallback: just roll a dex check if not in combat
		if (actor.rollAbility) {
			actor.rollAbility('dex');
		}
	});
}

/**
 * Get the XP required for the next level in Shadowdark
 */
function getXpForNextLevel(currentLevel) {
	// Shadowdark XP requirements per level (linear progression: level * 10)
	// Level 1 needs 10 XP to reach level 2
	// Level 2 needs 20 XP to reach level 3
	// Level 3 needs 30 XP to reach level 4, etc.
	return currentLevel * 10;
}

/**
 * Inject header background customization for player sheets
 * Allows GMs and sheet owners to set a custom background image for the header
 */
function injectHeaderCustomization(app, html, actor) {
	const $header = html.find('.SD-header').first();
	if (!$header.length) return;
	
	// Clean up any existing elements first (in case of re-render)
	$header.find('.sdx-header-settings-btn').remove();
	$header.find('.sdx-header-settings-menu').remove();
	
	// Apply any existing custom backgrounds
	applyHeaderBackground(html, actor);
	
	// Check if user can edit this actor (GM or owner)
	const canEdit = game.user.isGM || actor.isOwner;
	if (!canEdit) {
		return;
	}
	
	// Make header position relative for absolute positioned children
	$header.css('position', 'relative');
	
	// Create the settings button
	const $settingsBtn = $(`
		<button type="button" class="sdx-header-settings-btn" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.header.customize_tooltip") || "Customize Header"}">
			<i class="fas fa-cog"></i>
		</button>
	`);
	
	// Create the settings menu with header background option
	const $settingsMenu = $(`
		<div class="sdx-header-settings-menu">
			<div class="sdx-settings-section">
				<div class="sdx-settings-label">Header Background</div>
				<button type="button" class="sdx-header-select-image">
					<i class="fas fa-image"></i>
					<span>${game.i18n.localize("SHADOWDARK_EXTRAS.header.select_image") || "Select Image"}</span>
				</button>
				<button type="button" class="sdx-header-remove-image danger">
					<i class="fas fa-trash"></i>
					<span>${game.i18n.localize("SHADOWDARK_EXTRAS.header.remove_image") || "Remove"}</span>
				</button>
			</div>
		</div>
	`);
	
	$header.append($settingsBtn);
	$header.append($settingsMenu);
	
	// Use a unique namespace for this app instance to avoid conflicts
	const eventNS = `.sdxHeaderMenu${app.appId}`;
	
	// Clean up any existing handlers first (in case of re-render)
	$(document).off(eventNS);
	
	// Toggle menu visibility
	$settingsBtn.on('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		$settingsBtn.toggleClass('active');
		$settingsMenu.toggleClass('visible');
	});
	
	// Close menu when clicking outside
	$(document).on(`click${eventNS}`, (event) => {
		if (!$(event.target).closest('.sdx-header-settings-btn, .sdx-header-settings-menu').length) {
			$settingsBtn.removeClass('active');
			$settingsMenu.removeClass('visible');
		}
	});
	
	// Handle select image button
	$settingsMenu.find('.sdx-header-select-image').on('click', async (event) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Close the menu
		$settingsBtn.removeClass('active');
		$settingsMenu.removeClass('visible');
		
		// Open file picker - use imagevideo to allow webm files
		const currentImage = actor.getFlag(MODULE_ID, "headerBackground") || "";
		const fp = new FilePicker({
			type: "imagevideo",
			current: currentImage,
			callback: async (path) => {
				await actor.setFlag(MODULE_ID, "headerBackground", path);
				// Force sheet re-render to apply the background properly
				app.render(false);
			}
		});
		fp.render(true);
	});
	
	// Handle remove image button
	$settingsMenu.find('.sdx-header-remove-image').on('click', async (event) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Close the menu
		$settingsBtn.removeClass('active');
		$settingsMenu.removeClass('visible');
		
		// Remove the custom background
		await actor.unsetFlag(MODULE_ID, "headerBackground");
		
		// Force sheet re-render
		app.render(false);
	});
}

/**
 * Apply the custom header background if one is set
 * Supports both images and videos (mp4, webm)
 * Extends background to cover header and navigation tabs only
 */
function applyHeaderBackground(html, actor) {
	const headerBg = actor.getFlag(MODULE_ID, "headerBackground");
	
	// Find the form - html might BE the form or contain it
	let $form = html.is('form') ? html : html.find('form').first();
	if (!$form.length) $form = html.closest('form');
	if (!$form.length) return;
	
	const $header = $form.find('.SD-header').first();
	const $nav = $form.find('.SD-nav').first();
	
	if (!$header.length) return;
	
	// Remove any existing background extension
	$form.find('.sdx-header-bg-extension').remove();
	
	if (!headerBg) {
		$header.removeClass('sdx-custom-header');
		$header.css('background-image', '');
		return;
	}
	
	$header.addClass('sdx-custom-header');
	
	// Calculate the height needed to cover header + nav (including margins, padding, borders)
	const updateBgHeight = () => {
		const headerRect = $header[0]?.getBoundingClientRect();
		const navRect = $nav[0]?.getBoundingClientRect();
		const formRect = $form[0]?.getBoundingClientRect();
		
		if (!headerRect || !navRect || !formRect) return;
		
		// Calculate from the top of header to the bottom of nav, relative to form
		// Add extra padding to ensure it covers the full nav including border-bottom
		const totalHeight = (navRect.bottom - formRect.top) + 50;
		$form.find('.sdx-header-bg-extension').css('height', totalHeight + 'px');
	};
	
	// Check if it's a video file
	const isVideo = /\.(mp4|webm|ogg)$/i.test(headerBg);
	
	// Create the background extension element
	const $bgExtension = $('<div class="sdx-header-bg-extension"></div>');
	
	if (isVideo) {
		const videoType = headerBg.split('.').pop().toLowerCase();
		const $video = $(`
			<video autoplay loop muted playsinline>
				<source src="${headerBg}" type="video/${videoType}">
			</video>
		`);
		$bgExtension.append($video);
	} else {
		$bgExtension.css('background-image', `url("${headerBg}")`);
	}
	
	// Insert at the beginning of the form
	$form.prepend($bgExtension);
	
	// Update height now and after a short delay (for rendering)
	updateBgHeight();
	setTimeout(updateBgHeight, 100);
	setTimeout(updateBgHeight, 300);
}

/**
 * Inject header background customization for party sheets
 * Similar to player sheet customization but adapted for party layout
 */
function injectPartyHeaderCustomization(app, html, actor) {
	const $header = html.find('.party-header.SD-header').first();
	if (!$header.length) return;
	
	// Clean up any existing elements first (in case of re-render)
	$header.find('.sdx-header-settings-btn').remove();
	$header.find('.sdx-header-settings-menu').remove();
	
	// Apply any existing custom backgrounds
	applyPartyHeaderBackground(html, actor);
	
	// Check if user can edit this actor (GM or owner)
	const canEdit = game.user.isGM || actor.isOwner;
	if (!canEdit) {
		return;
	}
	
	// Make header position relative for absolute positioned children
	$header.css('position', 'relative');
	
	// Create the settings button
	const $settingsBtn = $(`
		<button type="button" class="sdx-header-settings-btn" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.header.customize_tooltip") || "Customize Header"}">
			<i class="fas fa-cog"></i>
		</button>
	`);
	
	// Create the settings menu with header background option
	const $settingsMenu = $(`
		<div class="sdx-header-settings-menu">
			<div class="sdx-settings-section">
				<div class="sdx-settings-label">Header Background</div>
				<button type="button" class="sdx-header-select-image">
					<i class="fas fa-image"></i>
					<span>${game.i18n.localize("SHADOWDARK_EXTRAS.header.select_image") || "Select Image"}</span>
				</button>
				<button type="button" class="sdx-header-remove-image danger">
					<i class="fas fa-trash"></i>
					<span>${game.i18n.localize("SHADOWDARK_EXTRAS.header.remove_image") || "Remove"}</span>
				</button>
			</div>
		</div>
	`);
	
	$header.append($settingsBtn);
	$header.append($settingsMenu);
	
	// Use a unique namespace for this app instance to avoid conflicts
	const eventNS = `.sdxPartyHeaderMenu${app.appId}`;
	
	// Clean up any existing handlers first (in case of re-render)
	$(document).off(eventNS);
	
	// Toggle menu visibility
	$settingsBtn.on('click', (event) => {
		event.preventDefault();
		event.stopPropagation();
		$settingsBtn.toggleClass('active');
		$settingsMenu.toggleClass('visible');
	});
	
	// Close menu when clicking outside
	$(document).on(`click${eventNS}`, (event) => {
		if (!$(event.target).closest('.sdx-header-settings-btn, .sdx-header-settings-menu').length) {
			$settingsBtn.removeClass('active');
			$settingsMenu.removeClass('visible');
		}
	});
	
	// Handle select image button
	$settingsMenu.find('.sdx-header-select-image').on('click', async (event) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Close the menu
		$settingsBtn.removeClass('active');
		$settingsMenu.removeClass('visible');
		
		// Open file picker - use imagevideo to allow webm files
		const currentImage = actor.getFlag(MODULE_ID, "partyHeaderBackground") || "";
		const fp = new FilePicker({
			type: "imagevideo",
			current: currentImage,
			callback: async (path) => {
				await actor.setFlag(MODULE_ID, "partyHeaderBackground", path);
				// Force sheet re-render to apply the background properly
				app.render(false);
			}
		});
		fp.render(true);
	});
	
	// Handle remove image button
	$settingsMenu.find('.sdx-header-remove-image').on('click', async (event) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Close the menu
		$settingsBtn.removeClass('active');
		$settingsMenu.removeClass('visible');
		
		// Remove the custom background
		await actor.unsetFlag(MODULE_ID, "partyHeaderBackground");
		
		// Force sheet re-render
		app.render(false);
	});
	
	// Portrait click to launch tokenizer (if vtta-tokenizer module is active)
	// Hold Shift to open the default Foundry file picker instead
	const $portrait = $header.find('.party-portrait');
	$portrait.off('click.sdxPartyPortrait').on('click.sdxPartyPortrait', async (e) => {
		if (!actor.isOwner && !game.user.isGM) return;
		e.preventDefault();
		e.stopPropagation();
		
		// If shift is held, open the default file picker
		if (e.shiftKey) {
			const fp = new FilePicker({
				type: "image",
				current: actor.img,
				callback: async (path) => {
					await actor.update({ img: path });
				}
			});
			return fp.browse();
		}
		
		// Check if vtta-tokenizer module is active and available
		if (!window.Tokenizer && !game.modules.get("vtta-tokenizer")?.active) {
			// No tokenizer available, fall back to file picker
			const fp = new FilePicker({
				type: "image",
				current: actor.img,
				callback: async (path) => {
					await actor.update({ img: path });
				}
			});
			return fp.browse();
		}
		
		try {
			// Use tokenizeActor for direct tokenization, or launch for UI
			if (window.Tokenizer?.tokenizeActor) {
				await window.Tokenizer.tokenizeActor(actor);
			} else if (window.Tokenizer?.launch) {
				// Launch with options
				const options = {
					name: actor.name,
					type: "npc", // Party actors are NPC type
					avatarFilename: actor.img
				};
				window.Tokenizer.launch(options, (response) => {
					console.log("shadowdark-extras | Tokenizer response:", response);
					ui.notifications.success(`Tokenizer completed for ${actor.name}!`);
				});
			} else {
				// Fallback to file picker if Tokenizer API not found
				const fp = new FilePicker({
					type: "image",
					current: actor.img,
					callback: async (path) => {
						await actor.update({ img: path });
					}
				});
				return fp.browse();
			}
		} catch (error) {
			console.error("shadowdark-extras | Error launching tokenizer:", error);
			ui.notifications.error(`Failed to launch tokenizer: ${error.message}`);
		}
	});
}

/**
 * Apply the custom header background for party sheets
 * Supports both images and videos (mp4, webm)
 */
function applyPartyHeaderBackground(html, actor) {
	const headerBg = actor.getFlag(MODULE_ID, "partyHeaderBackground");
	
	// Find the form - html might BE the form or contain it
	let $form = html.is('form') ? html : html.find('form').first();
	if (!$form.length) $form = html.closest('form');
	if (!$form.length) return;
	
	const $header = $form.find('.party-header.SD-header').first();
	const $nav = $form.find('.SD-nav').first();
	
	if (!$header.length) return;
	
	// Remove any existing background extension
	$form.find('.sdx-party-header-bg-extension').remove();
	
	if (!headerBg) {
		$header.removeClass('sdx-custom-party-header');
		return;
	}
	
	$header.addClass('sdx-custom-party-header');
	
	// Calculate the height needed to cover header + nav
	const updateBgHeight = () => {
		const headerRect = $header[0]?.getBoundingClientRect();
		const navRect = $nav[0]?.getBoundingClientRect();
		const formRect = $form[0]?.getBoundingClientRect();
		
		if (!headerRect || !navRect || !formRect) return;
		
		// Calculate from the top of header to the bottom of nav, relative to form
		// Add extra padding to ensure background covers full tab area
		const totalHeight = (navRect.bottom - formRect.top) + 30;
		$form.find('.sdx-party-header-bg-extension').css('height', totalHeight + 'px');
	};
	
	// Check if it's a video file
	const isVideo = /\.(mp4|webm|ogg)$/i.test(headerBg);
	
	// Create the background extension element
	const $bgExtension = $('<div class="sdx-party-header-bg-extension"></div>');
	
	if (isVideo) {
		const videoType = headerBg.split('.').pop().toLowerCase();
		const $video = $(`
			<video autoplay loop muted playsinline>
				<source src="${headerBg}" type="video/${videoType}">
			</video>
		`);
		$bgExtension.append($video);
	} else {
		$bgExtension.css('background-image', `url("${headerBg}")`);
	}
	
	// Insert at the beginning of the form
	$form.prepend($bgExtension);
	
	// Update height now and after a short delay (for rendering)
	updateBgHeight();
	setTimeout(updateBgHeight, 100);
	setTimeout(updateBgHeight, 300);
}

/**
 * Inject the Trade button into the player sheet under the Gems section
 */
/**
 * Inject Add Coins button into player sheet coins section
 * @param {jQuery} html - The sheet HTML
 * @param {Actor} actor - The player actor
 */
function injectAddCoinsButton(html, actor) {
	// Check if add coins button is enabled
	if (!game.settings.get(MODULE_ID, "enableAddCoinsButton")) return;

	// Only show if user owns the actor or is GM
	if (!actor.isOwner && !game.user?.isGM) return;
	
	// Find the coins box in the inventory sidebar
	// The coins box has a header with label "COINS" and an empty span
	const coinsBox = html.find('.tab-inventory .SD-box').filter((_, el) => {
		const label = $(el).find('.header label').text().trim().toLowerCase();
		return label.includes('coin');
	});
	
	if (coinsBox.length === 0) return;
	
	// Find the empty span in the header and add the + button
	const headerSpan = coinsBox.find('.header span').first();
	if (headerSpan.length === 0) return;
	
	// Add the + button
	const addBtnHtml = `<a class="sdx-add-coins-btn" data-action="add-coins" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_title")}"><i class="fas fa-plus"></i></a>`;
	headerSpan.html(addBtnHtml);
	
	// Attach click handler
	coinsBox.find('[data-action="add-coins"]').on("click", async (event) => {
		event.preventDefault();
		await showAddCoinsDialog(actor);
	});
}

/**
 * Show dialog to add/remove coins from an actor
 * @param {Actor} actor - The actor to modify coins for
 */
async function showAddCoinsDialog(actor) {
	const gpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_gp");
	const spLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_sp");
	const cpLabel = game.i18n.localize("SHADOWDARK_EXTRAS.party.coin_cp");
	
	const content = `
		<form class="add-coins-form">
			<p>${game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_prompt")}</p>
			<div class="form-group">
				<label>${gpLabel}</label>
				<input type="number" name="gp" value="0" />
			</div>
			<div class="form-group">
				<label>${spLabel}</label>
				<input type="number" name="sp" value="0" />
			</div>
			<div class="form-group">
				<label>${cpLabel}</label>
				<input type="number" name="cp" value="0" autofocus />
			</div>
		</form>
	`;
	
	const result = await Dialog.prompt({
		title: game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_title"),
		content: content,
		callback: (html) => {
			const form = html[0].querySelector("form");
			return {
				gp: parseInt(form.gp.value) || 0,
				sp: parseInt(form.sp.value) || 0,
				cp: parseInt(form.cp.value) || 0
			};
		},
		rejectClose: false
	});
	
	if (!result) return;
	
	const { gp, sp, cp } = result;
	if (gp === 0 && sp === 0 && cp === 0) return;
	
	// Get current coins and add the new amounts
	const currentCoins = actor.system.coins || { gp: 0, sp: 0, cp: 0 };
	const newGp = Math.max(0, (parseInt(currentCoins.gp) || 0) + gp);
	const newSp = Math.max(0, (parseInt(currentCoins.sp) || 0) + sp);
	const newCp = Math.max(0, (parseInt(currentCoins.cp) || 0) + cp);
	
	await actor.update({
		"system.coins.gp": newGp,
		"system.coins.sp": newSp,
		"system.coins.cp": newCp
	});
	
	// Build notification message
	const parts = [];
	if (gp !== 0) parts.push(`${gp > 0 ? '+' : ''}${gp} ${gpLabel}`);
	if (sp !== 0) parts.push(`${sp > 0 ? '+' : ''}${sp} ${spLabel}`);
	if (cp !== 0) parts.push(`${cp > 0 ? '+' : ''}${cp} ${cpLabel}`);
	
	ui.notifications.info(
		game.i18n.format("SHADOWDARK_EXTRAS.coins_updated", { coins: parts.join(", ") })
	);
}

function injectTradeButton(html, actor) {
	// Check if trading is enabled
	if (!game.settings.get(MODULE_ID, "enableTrading")) return;

	// Only show if user owns the actor
	if (!actor.isOwner) return;
	
	// Check if there are other player characters available with DIFFERENT online owners
	const otherPlayers = game.actors.filter(a => {
		if (a.type !== "Player" || a.id === actor.id) return false;
		return game.users.some(u => a.testUserPermission(u, "OWNER") && u.id !== game.user.id && u.active);
	});
	
	// Don't show button if no one to trade with
	if (otherPlayers.length === 0) return;
	
	// Find the Gems section in the inventory sidebar
	const gemsSection = html.find('.tab-inventory .SD-box:has([data-action="open-gem-bag"])');
	
	if (gemsSection.length === 0) return;
	
	// Create trade button HTML
	const tradeButtonHtml = `
		<div class="SD-box shadowdark-extras-trade-button">
			<button type="button" class="trade-btn" data-action="open-trade">
				<i class="fas fa-exchange-alt"></i>
				${game.i18n.localize("SHADOWDARK_EXTRAS.trade.title")}
			</button>
		</div>
	`;
	
	// Insert after Gems section
	gemsSection.after(tradeButtonHtml);
	
	// Attach click handler
	html.find('.trade-btn[data-action="open-trade"]').on("click", async (event) => {
		event.preventDefault();
		await showTradeDialog(actor);
	});
}

// ============================================
// NPC INVENTORY FUNCTIONS
// ============================================

/**
 * Prepare NPC inventory data for rendering
 */
function prepareNpcInventory(actor) {
	const inventory = [];
	const treasure = [];
	let slotsUsed = 0;
	
	for (const item of actor.items) {
		if (!NPC_INVENTORY_TYPES.includes(item.type)) continue;
		if (!item.system.isPhysical) continue;
		
		const itemData = item.toObject();
		itemData.uuid = `Actor.${actor._id}.Item.${item._id}`;
		const itemSlots = calculateSlotsCostForItemData(itemData);
		if (Number.isFinite(itemSlots)) {
			slotsUsed += Math.max(0, itemSlots);
		}
		
		// Check if item should show quantity
		itemData.showQuantity = item.system.isAmmunition || 
			(item.system.slots?.per_slot > 1) || 
			item.system.quantity > 1;
		
		// Sort treasure items separately
		if (item.system.treasure) {
			treasure.push(itemData);
		} else {
			inventory.push(itemData);
		}
	}
	
	// Sort alphabetically
	inventory.sort((a, b) => a.name.localeCompare(b.name));
	treasure.sort((a, b) => a.name.localeCompare(b.name));
	
	return { inventory, treasure, slotsUsed };
}

/**
 * Get NPC coins from flags
 */
function getNpcCoins(actor) {
	return {
		gp: actor.getFlag(MODULE_ID, "coins.gp") ?? 0,
		sp: actor.getFlag(MODULE_ID, "coins.sp") ?? 0,
		cp: actor.getFlag(MODULE_ID, "coins.cp") ?? 0
	};
}

function calculateNpcCoinSlots(coins) {
	const gp = Number(coins?.gp ?? 0) || 0;
	const sp = Number(coins?.sp ?? 0) || 0;
	const cp = Number(coins?.cp ?? 0) || 0;
	const totalGpValue = gp + sp / 10 + cp / 100;
	return Math.max(0, Math.floor(totalGpValue / 100));
}

/**
 * Inject the inventory tab into NPC sheets
 */
async function injectNpcInventoryTab(app, html, data) {
	const actor = app.actor;
	
	// Add the inventory tab to navigation (after Abilities)
	const nav = html.find('.SD-nav');
	const abilitiesTab = nav.find('a[data-tab="tab-abilities"]');
	
	const inventoryTabHtml = `<a class="navigation-tab" data-tab="tab-inventory">${game.i18n.localize("SHADOWDARK_EXTRAS.sheet.npc.tab.inventory")}</a>`;
	abilitiesTab.after(inventoryTabHtml);
	
	// Prepare inventory data
	const { inventory, treasure, slotsUsed } = prepareNpcInventory(actor);
	const coins = getNpcCoins(actor);
	const coinSlots = calculateNpcCoinSlots(coins);
	const safeItemSlots = Math.max(0, Number.isFinite(slotsUsed) ? slotsUsed : 0);
	const totalSlotsUsed = safeItemSlots + coinSlots;
	
	// Load and render the template
	const templatePath = `modules/${MODULE_ID}/templates/npc-inventory.hbs`;
	const templateData = {
		npcInventory: inventory,
		npcTreasure: treasure,
		npcCoins: coins,
		npcSlotsUsed: totalSlotsUsed,
		npcItemSlots: safeItemSlots,
		npcCoinSlots: coinSlots,
		owner: actor.isOwner
	};
	
	const inventoryHtml = await renderTemplate(templatePath, templateData);
	
	// Insert after the abilities tab content
	const contentBody = html.find('.SD-content-body');
	const abilitiesSection = contentBody.find('.tab[data-tab="tab-abilities"]');
	abilitiesSection.after(inventoryHtml);
	
	// Get the newly added inventory tab button
	const inventoryTabBtn = nav.find('.navigation-tab[data-tab="tab-inventory"]');
	const inventoryContent = contentBody.find('.tab[data-tab="tab-inventory"]');
	
	// Handle inventory tab click manually since it's not part of the system's tab handler
	inventoryTabBtn.click((event) => {
		event.preventDefault();
		event.stopPropagation();
		
		// Remove active from all tabs and content
		nav.find('.navigation-tab').removeClass('active');
		contentBody.find('.tab').removeClass('active');
		
		// Activate inventory tab
		inventoryTabBtn.addClass('active');
		inventoryContent.addClass('active');
		
		// Update the system's tab controller to know we're on a custom tab
		// This prevents it from thinking abilities is still active
		if (app._tabs?.[0]) {
			app._tabs[0].active = "tab-inventory";
		}
		
		// Track that inventory is active
		npcActiveTabTracker.set(actor.id, "tab-inventory");
	});
	
	// Track when OTHER tabs are clicked (to clear our inventory tracking)
	nav.find('.navigation-tab:not([data-tab="tab-inventory"])').click(() => {
		npcActiveTabTracker.set(actor.id, null);
	});
	
	// Restore the inventory tab if it was previously active
	const lastActiveTab = npcActiveTabTracker.get(actor.id);
	if (lastActiveTab === "tab-inventory") {
		// Activate inventory tab
		nav.find('.navigation-tab').removeClass('active');
		inventoryTabBtn.addClass('active');
		contentBody.find('.tab').removeClass('active');
		inventoryContent.addClass('active');
		
		// Update the system's tab controller
		if (app._tabs?.[0]) {
			app._tabs[0].active = "tab-inventory";
		}
	}
	
	// Activate inventory tab listeners
	activateNpcInventoryListeners(html, actor);
}

/**
 * Activate event listeners for NPC inventory
 */
function activateNpcInventoryListeners(html, actor) {
	// Create new item
	html.find('[data-action="npc-create-item"]').click(async (event) => {
		event.preventDefault();
		const itemData = {
			name: game.i18n.localize("SHADOWDARK_EXTRAS.sheet.npc.inventory.new_item"),
			type: "Basic",
			img: "icons/svg/item-bag.svg"
		};
		await actor.createEmbeddedDocuments("Item", [itemData]);
	});
	
	// Increment item quantity
	html.find('[data-action="npc-item-increment"]').click(async (event) => {
		event.preventDefault();
		const itemId = event.currentTarget.dataset.itemId;
		const item = actor.items.get(itemId);
		if (item) {
			const newQty = (item.system.quantity || 1) + 1;
			await item.update({"system.quantity": newQty});
		}
	});
	
	// Decrement item quantity
	html.find('[data-action="npc-item-decrement"]').click(async (event) => {
		event.preventDefault();
		const itemId = event.currentTarget.dataset.itemId;
		const item = actor.items.get(itemId);
		if (item && item.system.quantity > 1) {
			const newQty = item.system.quantity - 1;
			await item.update({"system.quantity": newQty});
		}
	});
	
	// Make items draggable
	html.find('.npc-item-list .item[draggable="true"]').each((i, li) => {
		li.addEventListener('dragstart', (event) => {
			const uuid = li.dataset.uuid;
			if (!uuid) return;
			
			const dragData = {
				type: "Item",
				uuid: uuid
			};
			
			event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
		});
	});
}

// ============================================
// PARTY FUNCTIONS
// ============================================

/**
 * Patch shadowdark.utils.toggleItemDetails to handle unidentified items
 * When a player expands an unidentified item, show the unidentified description instead
 */
function patchToggleItemDetailsForUnidentified() {
	// Check if unidentified items are enabled
	if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;

	if (!shadowdark?.utils?.toggleItemDetails) {
		console.warn(`${MODULE_ID} | toggleItemDetails not found, skipping patch`);
		return;
	}

	const originalToggleItemDetails = shadowdark.utils.toggleItemDetails.bind(shadowdark.utils);

	shadowdark.utils.toggleItemDetails = async function(target) {
		const listObj = $(target).parent();

		// If collapsing, just use original behavior
		if (listObj.hasClass("expanded")) {
			return originalToggleItemDetails(target);
		}

		// Get the item
		const itemId = listObj.data("uuid");
		const item = await fromUuid(itemId);

		// If not unidentified or user is GM, use original behavior
		if (!item || !isUnidentified(item) || game.user?.isGM) {
			return originalToggleItemDetails(target);
		}

		// For unidentified items viewed by non-GM, show masked content
		const unidentifiedDesc = item.getFlag?.(MODULE_ID, "unidentifiedDescription") ?? "";
		const maskedName = getUnidentifiedName(item);
		
		// Build minimal details content
		let details = "";
		if (unidentifiedDesc) {
			// Enrich the unidentified description for proper text rendering
			const enrichedDesc = await TextEditor.enrichHTML(unidentifiedDesc, { async: true });
			details = `<div class="item-description">${enrichedDesc}</div>`;
		} else {
			details = `<p><em>${game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.no_description")}</em></p>`;
		}

		const detailsDiv = document.createElement("div");
		detailsDiv.setAttribute("style", "display: none");
		detailsDiv.classList.add("item-details");
		detailsDiv.insertAdjacentHTML("afterbegin", details);
		listObj.append(detailsDiv);
		$(detailsDiv).slideDown(200);

		listObj.toggleClass("expanded");
	};

	console.log(`${MODULE_ID} | Patched toggleItemDetails for unidentified items`);
}

/**
 * Patch the Light Source Tracker to include Party actors with active lights
 */
function patchLightSourceTrackerForParty() {
	const tracker = game.shadowdark?.lightSourceTracker;
	if (!tracker) {
		console.warn(`${MODULE_ID} | Light Source Tracker not found, skipping patch`);
		return;
	}
	
	// Store the original _gatherLightSources method
	const originalGatherLightSources = tracker._gatherLightSources.bind(tracker);
	
	// Override _gatherLightSources to also include Party actors
	tracker._gatherLightSources = async function() {
		// Call the original method first
		await originalGatherLightSources();
		
		// Now add Party actors with active light sources
		const partyActors = game.actors.filter(actor => isPartyActor(actor));
		
		for (const actor of partyActors) {
			// Get active light sources for this party
			const activeLightSources = actor.items.filter(
				item => ["Basic", "Effect"].includes(item.type) && 
				        item.system.light?.isSource && 
				        item.system.light?.active
			);
			
			if (activeLightSources.length === 0) continue;
			
			const actorData = actor.toObject(false);
			actorData.lightSources = [];
			
			for (const item of activeLightSources) {
				actorData.lightSources.push(item.toObject(false));
			}
			
			// Only add if not already in the list
			if (!this.monitoredLightSources.some(a => a._id === actorData._id)) {
				this.monitoredLightSources.push(actorData);
			}
		}
		
		// Re-sort the list
		this.monitoredLightSources.sort((a, b) => {
			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		});
	};
	
	console.log(`${MODULE_ID} | Patched Light Source Tracker to include Party actors`);
}

/**
 * Check if an actor is a Party actor (flagged NPC)
 * @param {Actor} actor
 * @returns {boolean}
 */
function isPartyActor(actor) {
	return actor?.type === "NPC" && actor?.getFlag(MODULE_ID, "isParty") === true;
}

/**
 * Register the Party sheet
 */
function registerPartySheet() {
	// Register the Party sheet for NPC actors that are flagged as parties
	Actors.registerSheet(MODULE_ID, PartySheetSD, {
		types: ["NPC"],
		makeDefault: false,
		label: game.i18n.localize("SHADOWDARK_EXTRAS.party.name")
	});
	
	// Override the _getSheetClass method to force Party sheet for party actors
	const originalGetSheetClass = CONFIG.Actor.documentClass.prototype._getSheetClass;
	CONFIG.Actor.documentClass.prototype._getSheetClass = function() {
		// Check if this is a party actor
		if (isPartyActor(this)) {
			return PartySheetSD;
		}
		return originalGetSheetClass.call(this);
	};
	
	console.log(`${MODULE_ID} | Party sheet registered`);
}

/**
 * Add Party option to actor creation dialog
 */
function extendActorCreationDialog() {
	// Hook into various dialog rendering events to catch the Create Actor dialog
	
	// For Foundry v13+ with ApplicationV2
	Hooks.on("renderDocumentSheetConfig", (app, html, data) => {
		addPartyOptionToSelect(html);
	});
	
	// For standard Dialog
	Hooks.on("renderDialog", (app, html, data) => {
		addPartyOptionToSelect(html);
		maskUnidentifiedItemInDialog(app, html, data);
	});
	
	// For Application render
	Hooks.on("renderApplication", (app, html, data) => {
		addPartyOptionToSelect(html);
	});
	
	// For Foundry v13 - hook into the folder context or creation
	Hooks.on("renderActorDirectory", (app, html, data) => {
		// The create button opens a dialog - we need to intercept when it renders
	});
	
	// Use MutationObserver to catch dynamically created dialogs
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					const select = node.querySelector?.('select[name="type"]');
					if (select) {
						addPartyOptionToSelect($(node));
					}
				}
			}
		}
	});
	
	// Start observing the document body for dialog additions
	observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Add the Party option to a type select if it's in a Create Actor dialog
 */
function addPartyOptionToSelect(html) {
	// Convert to jQuery if needed
	const $html = html instanceof jQuery ? html : $(html);
	
	// Look for actor type select
	const typeSelect = $html.find('select[name="type"]');
	if (typeSelect.length === 0) return;
	
	// Check if this select has actor types (Light, NPC, Player)
	const hasActorTypes = typeSelect.find('option[value="NPC"]').length > 0 || 
	                      typeSelect.find('option[value="Player"]').length > 0;
	if (!hasActorTypes) return;
	
	// Check if Party option already exists
	if (typeSelect.find('option[value="Party"]').length > 0) return;
	
	// Add Party option
	const npcOption = typeSelect.find('option[value="NPC"]');
	if (npcOption.length > 0) {
		npcOption.after(`<option value="Party">${game.i18n.localize("SHADOWDARK_EXTRAS.party.name")}</option>`);
		console.log(`${MODULE_ID} | Added Party option to actor type select`);
	} else {
		// Fallback: append to the end
		typeSelect.append(`<option value="Party">${game.i18n.localize("SHADOWDARK_EXTRAS.party.name")}</option>`);
		console.log(`${MODULE_ID} | Added Party option to actor type select (appended)`);
	}
	
	// Also intercept form submission to convert Party to NPC before it's sent
	const form = typeSelect.closest('form');
	if (form.length > 0 && !form.data('party-intercepted')) {
		form.data('party-intercepted', true);
		form.on('submit', function(e) {
			const select = $(this).find('select[name="type"]');
			if (select.val() === 'Party') {
				select.val('NPC');
				// Store that this should be a party
				let hiddenInput = $(this).find('input[name="flags.shadowdark-extras.isParty"]');
				if (hiddenInput.length === 0) {
					$(this).append('<input type="hidden" name="flags.shadowdark-extras.isParty" value="true">');
				}
			}
		});
	}
}

/**
 * Wrap Actor.create to intercept Party type
 */
function wrapActorCreate() {
	const originalCreate = CONFIG.Actor.documentClass.create;
	
	CONFIG.Actor.documentClass.create = async function(data, options = {}) {
		// Handle single or array of data
		const createData = Array.isArray(data) ? data : [data];
		
		for (const d of createData) {
			if (d.type === "Party") {
				d.type = "NPC";
				d.img = d.img || "icons/environment/people/group.webp";
				foundry.utils.setProperty(d, "flags.shadowdark-extras.isParty", true);
				foundry.utils.setProperty(d, "prototypeToken.actorLink", true);
				
				// Set default prototype token settings (no vision/light like standard Shadowdark actors)
				foundry.utils.setProperty(d, "prototypeToken.sight", {
					enabled: true,
					range: 0,
					angle: 360,
					visionMode: "basic",
					color: null,
					attenuation: 0.1,
					brightness: 0,
					saturation: 0,
					contrast: 0
				});
				foundry.utils.setProperty(d, "prototypeToken.light", {
					negative: false,
					priority: 0,
					alpha: 0.2,
					angle: 360,
					bright: 0,
					color: "#d1c846",
					coloration: 1,
					dim: 0,
					attenuation: 0.5,
					luminosity: 0.5,
					saturation: 0,
					contrast: 0,
					shadows: 0,
					animation: {
						type: "torch",
						speed: 1,
						intensity: 1,
						reverse: false
					},
					darkness: {
						min: 0,
						max: 1
					}
				});
			}
		}
		
		return originalCreate.call(this, Array.isArray(data) ? createData : createData[0], options);
	};
	
	console.log(`${MODULE_ID} | Wrapped Actor.create to handle Party type`);
}

/**
 * Handle Party actor creation - convert to flagged NPC
 */
async function handlePartyCreation(actor, options, userId) {
	// This runs after the actor is created
	// We can't intercept the type change before creation in a clean way,
	// so we'll handle it via the preCreateActor hook
}

/**
 * Patch NPC sheet to handle item drops with move vs copy behavior
 */
function patchNpcSheetForItemDrops(app) {
	// Only patch once per sheet instance
	if (app._sdxDropPatched) return;
	app._sdxDropPatched = true;
	
	// Store the original _onDrop if it exists
	const originalOnDrop = app._onDrop?.bind(app);
	
	// Override the _onDrop method to intercept drops on the inventory tab
	app._onDrop = async function(event) {
		// Check if we're on the inventory tab
		const inventoryTab = event.target.closest('.shadowdark-extras-npc-inventory');
		if (!inventoryTab) {
			// Not on inventory tab, use original handler
			if (originalOnDrop) return originalOnDrop(event);
			return;
		}
		
		// Get the drag data
		let data;
		try {
			data = JSON.parse(event.dataTransfer.getData('text/plain'));
		} catch (err) {
			return;
		}
		
		if (data.type !== "Item") return;
		
		// Get the source item
		const sourceItem = await fromUuid(data.uuid);
		if (!sourceItem) return;
		
		const targetActor = this.actor;
		const sourceActor = sourceItem.parent;
		
		// Check if we're moving or copying (Ctrl = copy, default = move)
		const isCopy = event.ctrlKey;
		
		// Don't do anything if dropping on same actor
		if (sourceActor === targetActor && !isCopy) return;
		
		// Create the item on target actor
		const itemData = sourceItem.toObject();
		delete itemData._id; // Remove the ID so a new one is created
		
		await targetActor.createEmbeddedDocuments("Item", [itemData]);
		
		// If moving (not copying), delete from source
		if (!isCopy && sourceActor && sourceActor !== targetActor) {
			await sourceItem.delete();
			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.notifications.item_moved", {
					item: sourceItem.name,
					target: targetActor.name
				})
			);
		} else if (isCopy) {
			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.notifications.item_copied", {
					item: sourceItem.name,
					target: targetActor.name
				})
			);
		}
	};
}

// ============================================
// PLAYER-TO-PLAYER TRANSFERS (context menu + Item Piles API)
// ============================================

/**
 * Transfer an item to another player's character using Item Piles API
 */
async function transferItemToPlayer(sourceActor, item, targetActorId) {
	if (!sourceActor || !item) return;
	
	// Check if Item Piles is available
	if (!game.modules.get("item-piles")?.active || !game.itempiles?.API) {
		ui.notifications.error("Item Piles module is required for player-to-player transfers.");
		console.error(`${MODULE_ID} | Item Piles API not available`);
		return;
	}
	
	const targetActor = game.actors.get(targetActorId);
	if (!targetActor) {
		ui.notifications.error(
			game.i18n.localize("SHADOWDARK_EXTRAS.notifications.transfer_no_target")
		);
		return;
	}
	
	// Get the display name - mask if unidentified and user is not GM
	const itemName = (isUnidentified(item) && !game.user.isGM) 
		? getUnidentifiedName(item)
		: item.name;
	
	try {
		console.log(`${MODULE_ID} | Transferring ${item.name} from ${sourceActor.name} to ${targetActor.name}`);
		
		// Use Item Piles API to transfer the item
		const result = await game.itempiles.API.transferItems(
			sourceActor,
			targetActor,
			[{ _id: item.id, quantity: item.system.quantity || 1 }],
			{ interactionId: false }
		);
		
		if (result && result.length > 0) {
			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.notifications.item_transferred", {
					item: itemName,
					target: targetActor.name
				})
			);
		} else {
			console.warn(`${MODULE_ID} | Transfer returned no results`);
			ui.notifications.warn("Transfer may not have completed successfully.");
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error during transfer:`, error);
		ui.notifications.error(
			game.i18n.localize("SHADOWDARK_EXTRAS.notifications.transfer_failed")
		);
	}
}

/**
 * Show dialog to select target player for transfer
 * Enhanced with filtering for connected/assigned characters and Party actors
 */
async function showTransferDialog(sourceActor, item) {
	// Get all player characters that are not the source actor and have an owner
	const allPlayers = game.actors.filter(a => {
		if (a.id === sourceActor.id) return false;
		// Include Player type actors and Party type actors (NPC type with party flag)
		const isParty = a.type === "NPC" && a.getFlag(MODULE_ID, "isParty");
		if (a.type !== "Player" && !isParty) return false;
		// For players, check if the actor has any owner who can receive the item
		if (!isParty) {
			return game.users.some(u => a.testUserPermission(u, "OWNER"));
		}
		return true; // Party actors are always available
	});
	
	if (allPlayers.length === 0) {
		ui.notifications.warn(
			game.i18n.localize("SHADOWDARK_EXTRAS.notifications.no_players_available")
		);
		return;
	}
	
	// Categorize actors and build searchable data
	const partyActors = allPlayers.filter(a => a.type === "NPC" && a.getFlag(MODULE_ID, "isParty"));
	const connectedAssigned = allPlayers.filter(a => {
		if (a.type !== "Player") return false;
		// Check if any connected user has this as their assigned character
		return game.users.some(u => u.active && u.character?.id === a.id);
	});
	const otherPlayers = allPlayers.filter(a => {
		if (a.type !== "Player") return false;
		// Not connected/assigned
		return !game.users.some(u => u.active && u.character?.id === a.id);
	});
	
	// Build options HTML with optgroups and data attributes for searching
	let optionsHtml = '';
	
	// Party actors first
	if (partyActors.length > 0) {
		optionsHtml += `<optgroup label="📦 Party Storage" data-group="party">`;
		for (const p of partyActors) {
			optionsHtml += `<option value="${p.id}" data-search="${p.name.toLowerCase()}">🎒 ${p.name}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}
	
	// Connected & Assigned characters
	if (connectedAssigned.length > 0) {
		optionsHtml += `<optgroup label="🟢 Connected Players" data-group="connected">`;
		for (const p of connectedAssigned) {
			const user = game.users.find(u => u.active && u.character?.id === p.id);
			const userName = user ? user.name : '';
			const displayUserName = userName ? ` (${userName})` : '';
			const searchText = `${p.name} ${userName}`.toLowerCase();
			optionsHtml += `<option value="${p.id}" data-search="${searchText}">🟢 ${p.name}${displayUserName}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}
	
	// Other player characters
	if (otherPlayers.length > 0) {
		optionsHtml += `<optgroup label="⚪ Other Characters" data-group="other">`;
		for (const p of otherPlayers) {
			// Find any owner for search purposes
			const owners = game.users.filter(u => p.testUserPermission(u, "OWNER"));
			const ownerNames = owners.map(u => u.name).join(' ');
			const searchText = `${p.name} ${ownerNames}`.toLowerCase();
			optionsHtml += `<option value="${p.id}" data-search="${searchText}">⚪ ${p.name}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}
	
	const content = `
		<form>
			<div class="form-group" style="margin-bottom: 8px;">
				<label style="display: flex; align-items: center; gap: 8px;">
					<input type="checkbox" id="sdx-filter-connected" checked />
					Show only connected players
				</label>
			</div>
			<div class="form-group" style="margin-bottom: 8px;">
				<label>Search:</label>
				<input type="text" id="sdx-transfer-search" placeholder="Type to filter by name..." 
				       style="width: 100%;" autocomplete="off" />
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.select_recipient")}</label>
				<select name="targetActorId" id="sdx-transfer-target" style="width: 100%; min-height: 200px;" size="10">
					${optionsHtml}
				</select>
			</div>
			<p>${game.i18n.format("SHADOWDARK_EXTRAS.dialog.transfer_item_warning", {item: item.name})}</p>
		</form>
	`;
	
	return new Promise((resolve) => {
		const dialog = new Dialog({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_item_title"),
			content: content,
			buttons: {
				transfer: {
					icon: '<i class="fas fa-exchange-alt"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer"),
					callback: (html) => {
						const targetActorId = html.find('[name="targetActorId"]').val();
						resolve(targetActorId);
					}
				},
				cancel: {
					icon: '<i class="fas fa-times"></i>',
					label: game.i18n.localize("Cancel"),
					callback: () => resolve(null)
				}
			},
			default: "transfer",
			render: (html) => {
				const $select = html.find('#sdx-transfer-target');
				const $filterCheckbox = html.find('#sdx-filter-connected');
				const $searchInput = html.find('#sdx-transfer-search');
				
				// Combined filter function for both checkbox and search
				const updateFilter = () => {
					const showOnlyConnected = $filterCheckbox.is(':checked');
					const searchText = $searchInput.val().toLowerCase().trim();
					
					$select.find('optgroup').each(function() {
						const $group = $(this);
						const groupType = $group.data('group');
						
						// First, apply connected filter to groups
						if (groupType === 'other' && showOnlyConnected) {
							$group.hide();
							return;
						}
						
						// Then apply search filter to options within visible groups
						let visibleCount = 0;
						$group.find('option').each(function() {
							const $option = $(this);
							const optionSearch = $option.data('search') || '';
							
							if (searchText === '' || optionSearch.includes(searchText)) {
								$option.show();
								visibleCount++;
							} else {
								$option.hide();
							}
						});
						
						// Hide group if no visible options
						$group.toggle(visibleCount > 0);
					});
					
					// If current selection is now hidden, select first visible option
					const $selectedOption = $select.find('option:selected');
					if (!$selectedOption.is(':visible') || $selectedOption.parent('optgroup').is(':hidden')) {
						$select.find('option:visible').first().prop('selected', true);
					}
				};
				
				updateFilter();
				$filterCheckbox.on('change', updateFilter);
				$searchInput.on('input', updateFilter);
				
				// Focus search input for immediate typing
				setTimeout(() => $searchInput.focus(), 100);
			}
		}).render(true);
	});
}

/**
 * Patch PlayerSheetSD to add "Transfer to Player" option to inventory context menu
 */
function patchPlayerSheetForTransfers() {
	const PlayerSheetSD = CONFIG.Actor.sheetClasses.Player["shadowdark.PlayerSheetSD"]?.cls;
	if (!PlayerSheetSD) {
		console.warn(`${MODULE_ID} | Could not find PlayerSheetSD class to patch for transfers`);
		return;
	}
	
	// Store the original method
	const originalGetItemContextOptions = PlayerSheetSD.prototype._getItemContextOptions;
	
	// Replace with enhanced version
	PlayerSheetSD.prototype._getItemContextOptions = function() {
		const options = originalGetItemContextOptions.call(this);
		
		// Only add transfer option for Player actors
		if (this.actor?.type !== "Player") return options;
		
		// Add transfer option before delete
		options.splice(options.length - 1, 0, {
			name: game.i18n.localize("SHADOWDARK_EXTRAS.context_menu.transfer_to_player"),
			icon: '<i class="fas fa-share"></i>',
			condition: element => {
				// Only show if user owns the actor and there are other players
				if (!this.actor.isOwner) return false;
				const itemId = element.dataset.itemId;
				const item = this.actor.items.get(itemId);
				// Don't allow transfer of contained items (must be removed from container first)
				if (item?.getFlag(MODULE_ID, "containerId")) return false;
				// Don't allow transfer of containers (too complex to handle contents)
				if (item?.getFlag(MODULE_ID, "isContainer")) return false;
				// Check if there are other player characters or Party actors available
				const otherActors = game.actors.filter(a => {
					if (a.id === this.actor.id) return false;
					// Include Party actors (NPC type with party flag)
					const isParty = a.type === "NPC" && a.getFlag(MODULE_ID, "isParty");
					if (a.type !== "Player" && !isParty) return false;
					// For players, check if any user has owner permission
					if (!isParty) {
						return game.users.some(u => a.testUserPermission(u, "OWNER"));
					}
					return true; // Party actors always available
				});
				return otherActors.length > 0;
			},
			callback: async element => {
				const itemId = element.dataset.itemId;
				const item = this.actor.items.get(itemId);
				if (!item) return;
				
				const targetActorId = await showTransferDialog(this.actor, item);
				if (targetActorId) {
					await transferItemToPlayer(this.actor, item, targetActorId);
				}
			}
		});
		
		return options;
	};
}

// ============================================
// HOOKS
// ============================================

// Initialize when Foundry is ready
Hooks.once("init", () => {
	console.log(`${MODULE_ID} | Initializing Shadowdark Extras`);
	
	// Register Handlebars helpers
	Handlebars.registerHelper("numberSigned", (value) => {
		const num = parseInt(value) || 0;
		return num >= 0 ? `+${num}` : `${num}`;
	});

	// Helper for simple math operations in templates
	Handlebars.registerHelper("add", (a, b) => {
		return (parseInt(a) || 0) + (parseInt(b) || 0);
	});
	
	// Preload templates
	loadTemplates([
		`modules/${MODULE_ID}/templates/npc-inventory.hbs`,
		`modules/${MODULE_ID}/templates/party.hbs`,
		`modules/${MODULE_ID}/templates/trade-window.hbs`,
		`modules/${MODULE_ID}/templates/journal-notes.hbs`,
		`modules/${MODULE_ID}/templates/journal-editor.hbs`
	]);
	
	// Register the Party sheet early
	registerPartySheet();
	
	// Wrap Actor.create to handle Party type conversion
	wrapActorCreate();
});

// Hide internal trade journal from the sidebar (Foundry v13 compatible)
Hooks.on("renderJournalDirectory", (app, html, data) => {
	// In v13, html might be an HTMLElement or jQuery - handle both
	const element = html instanceof jQuery ? html[0] : html;
	
	// Find all journal entries in the directory list
	const entries = element.querySelectorAll("[data-entry-id], [data-document-id], .directory-item");
	entries.forEach(entry => {
		const entryId = entry.dataset?.entryId || entry.dataset?.documentId;
		if (entryId) {
			const journal = game.journal.get(entryId);
			if (journal?.name === TRADE_JOURNAL_NAME) {
				entry.remove();
				return;
			}
		}
		// Also check by name in the entry text as fallback
		const nameEl = entry.querySelector(".entry-name, .document-name");
		if (nameEl?.textContent?.trim() === TRADE_JOURNAL_NAME) {
			entry.remove();
		}
	});
});

// Setup after Shadowdark system is ready
Hooks.once("ready", async () => {
	// Only run if Shadowdark system is active
	if (game.system.id !== "shadowdark") {
		console.warn(`${MODULE_ID} | This module requires the Shadowdark RPG system`);
		return;
	}
	
	console.log(`${MODULE_ID} | Setting up Shadowdark Extras`);
	
	registerSettings();
	extendLightSources();
	patchLightSourceMappings();
	extendActorCreationDialog();
	patchCtrlMoveOnActorSheetDrops();
	patchPlayerSheetForTransfers();
	initializeTradeSocket();
	
	// Setup combat socket for damage application (requires socketlib)
	if (typeof socketlib !== "undefined") {
		setupCombatSocket();
		console.log(`${MODULE_ID} | Combat socket initialized`);
	} else {
		console.warn(`${MODULE_ID} | socketlib not found, damage application may not work for non-GMs`);
	}
	
	patchLightSourceTrackerForParty();
	patchToggleItemDetailsForUnidentified();
	setupUnidentifiedItemNameWrapper();
	setupItemPilesUnidentifiedHooks();
	wrapBuildWeaponDisplayForUnidentified();
	
	// Patch NPC sheets to add _toggleLightSource method
	// The Shadowdark system's ActorSheetSD._deleteItem tries to call this method,
	// but it only exists on PlayerSheetSD, causing errors when deleting torch items from NPCs
	if (globalThis.shadowdark?.sheets?.NpcSheetSD) {
		const NpcSheetSD = globalThis.shadowdark.sheets.NpcSheetSD;
		if (!NpcSheetSD.prototype._toggleLightSource) {
			NpcSheetSD.prototype._toggleLightSource = async function(item, options = {}) {
				// For NPCs, just toggle the light active state without the player-specific features
				const active = !item.system.light?.active;
				
				if (active) {
					// Turn off any currently active lights
					const activeLightSources = await this.actor.getActiveLightSources?.() || [];
					for (const lightSource of activeLightSources) {
						await this.actor.updateEmbeddedDocuments("Item", [{
							"_id": lightSource.id,
							"system.light.active": false,
						}]);
					}
				}
				
				const dataUpdate = {
					"_id": item.id,
					"system.light.active": active,
				};
				
				if (!item.system.light?.hasBeenUsed) {
					dataUpdate["system.light.hasBeenUsed"] = true;
				}
				
				await this.actor.updateEmbeddedDocuments("Item", [dataUpdate]);
				await this.actor.toggleLight?.(active, item.id);
			};
			console.log(`${MODULE_ID} | Patched NpcSheetSD with _toggleLightSource method`);
		}
	}
	
	// Wrap ActorSD._learnSpell to preserve spell damage flags from scrolls
	if (globalThis.shadowdark?.documents?.ActorSD) {
		const ActorSD = globalThis.shadowdark.documents.ActorSD;
		const original_learnSpell = ActorSD.prototype._learnSpell;
		
		ActorSD.prototype._learnSpell = async function(item) {
			// Store the scroll ID temporarily so preCreateItem can access it
			if (item && item.flags?.[MODULE_ID]?.spellDamage) {
				await this.setFlag(MODULE_ID, "_learningFromScroll", item._id);
			}
			
			// Call original method
			const result = await original_learnSpell.call(this, item);
			
			// Clean up the temporary flag
			await this.unsetFlag(MODULE_ID, "_learningFromScroll");
			
			return result;
		};
		
		console.log(`${MODULE_ID} | Wrapped ActorSD._learnSpell to preserve spell damage flags`);
	}
	
	// Ensure trade journal exists (GM only creates it)
	await ensureTradeJournal();
});

// Preserve unidentified flags when items are created (covers item-piles transfers)
Hooks.on("preCreateItem", (item, data, options, userId) => {
	// Note: This hook handles unidentified flags for items created directly,
	// but for spells converted via dialog, we wrap shadowdark.utils.createItemFromSpell instead
	
	// Check if unidentified feature is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return;
	}
	
	// If the item data already has our unidentified flag, ensure it's preserved
	if (data.flags?.[MODULE_ID]?.unidentified) {
		// Flag is present, make sure it's set on the item
		item.updateSource({
			[`flags.${MODULE_ID}.unidentified`]: true,
			[`flags.${MODULE_ID}.unidentifiedName`]: data.flags[MODULE_ID].unidentifiedName || "",
			[`flags.${MODULE_ID}.unidentifiedDescription`]: data.flags[MODULE_ID].unidentifiedDescription || ""
		});
	}
	
	// Preserve spell damage flags when learning a spell from a scroll
	// This handles the "Learn Spell" button functionality
	if (item.type === "Spell" && item.parent) {
		// Check if there's a scroll being learned from (stored in temporary flag)
		const sourceScrollId = item.parent.getFlag(MODULE_ID, "_learningFromScroll");
		if (sourceScrollId) {
			const sourceScroll = item.parent.items.get(sourceScrollId);
			if (sourceScroll && sourceScroll.flags?.[MODULE_ID]?.spellDamage) {
				// Preserve the spell damage configuration from the scroll
				item.updateSource({
					[`flags.${MODULE_ID}.spellDamage`]: foundry.utils.duplicate(sourceScroll.flags[MODULE_ID].spellDamage)
				});
				console.log(`${MODULE_ID} | Preserved spell damage flags when learning from scroll:`, sourceScroll.name);
			}
		}
	}
});

// Before party actor is created, ensure proper prototype token settings
Hooks.on("preCreateActor", (actor, data, options, userId) => {
	// Check if this is a party actor being created
	const isParty = data.flags?.[MODULE_ID]?.isParty === true || 
	                actor.getFlag(MODULE_ID, "isParty") === true;
	
	if (isParty) {
		// Force the correct prototype token settings for party actors
		actor.updateSource({
			"prototypeToken.actorLink": true,
			"prototypeToken.sight.enabled": true,
			"prototypeToken.sight.range": 0,
			"prototypeToken.sight.angle": 360,
			"prototypeToken.sight.visionMode": "basic",
			"prototypeToken.light.bright": 0,
			"prototypeToken.light.dim": 0
		});
	}
});

// After party actor is created, set the sheet
Hooks.on("createActor", async (actor, options, userId) => {
	if (game.user.id !== userId) return;
	
	// If this is a newly created party, set the party sheet as default
	if (isPartyActor(actor)) {
		// Set the Party sheet as the default for this actor
		await actor.setFlag("core", "sheetClass", `${MODULE_ID}.PartySheetSD`);
	}
});

// Inject Renown into player sheets
Hooks.on("renderPlayerSheetSD", async (app, html, data) => {
	if (app.actor?.type !== "Player") return;
	
	await injectEnhancedHeader(app, html, app.actor);
	enhanceDetailsTab(app, html, app.actor);
	enhanceAbilitiesTab(app, html, app.actor);
	enhanceSpellsTab(app, html, app.actor);
	enhanceTalentsTab(app, html, app.actor);
	enhanceInventoryTab(app, html, app.actor);
	enhanceEffectsTab(app, html, app.actor);
	injectRenownSection(html, app.actor);
	attachContainerContentsToActorSheet(app, html);
	addUnidentifiedIndicatorForGM(app, html);
	maskUnidentifiedItemsOnSheet(app, html);
	enhanceInventoryWithDeleteAndMultiSelect(app, html);
	injectTradeButton(html, app.actor);
	injectAddCoinsButton(html, app.actor);
	applyInventoryStylesToSheet(html, app.actor);
	injectHeaderCustomization(app, html, app.actor);
	await injectJournalNotes(app, html, app.actor);
	await injectConditionsToggles(app, html, app.actor);
	enableItemChatIcon(app, html);
	fixUnidentifiedWeaponBoldForAllUsers(html);
});

// Inject Inventory tab into NPC sheets (but not Party sheets)
Hooks.on("renderNpcSheetSD", async (app, html, data) => {
	if (app.actor?.type !== "NPC") return;
	
	// Don't inject into Party actors (they have their own inventory)
	if (isPartyActor(app.actor)) return;
	
	// Check if NPC inventory is enabled
	if (!game.settings.get(MODULE_ID, "enableNpcInventory")) return;
	
	await injectNpcInventoryTab(app, html, data);
	patchNpcSheetForItemDrops(app);
	attachContainerContentsToActorSheet(app, html);
	addUnidentifiedIndicatorForGM(app, html);
	maskUnidentifiedItemsOnSheet(app, html);
	applyInventoryStylesToSheet(html, app.actor);
	enableItemChatIcon(app, html);
});

// Apply inventory styles to Party sheets
Hooks.on("renderActorSheet", (app, html, data) => {
	// Only handle Party sheets
	if (!(app instanceof PartySheetSD)) return;
	if (!isPartyActor(app.actor)) return;
	
	applyInventoryStylesToSheet(html, app.actor);
	injectPartyHeaderCustomization(app, html, app.actor);
});

/**
 * Setup activity toggles to act like radio buttons - only one can be active at a time
 * @param {jQuery} html - The HTML element
 * @param {Item} item - The item being edited
 */
function setupActivityRadioToggles(html, item) {
	// Spell Damage toggle
	html.find('.sdx-spell-damage-toggle').off('change').on('change', function() {
		const isEnabled = $(this).is(':checked');
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		
		if (isEnabled) {
			$content.slideDown(200);
			// Disable other activities visually
			html.find('.sdx-summoning-toggle').prop('checked', false);
			html.find('.sdx-item-give-toggle').prop('checked', false);
			// Save all states at once
			const updateData = {};
			updateData[`flags.${MODULE_ID}.spellDamage.enabled`] = true;
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = false;
			updateData[`flags.${MODULE_ID}.itemGive.enabled`] = false;
			item.update(updateData, { render: false });
		} else {
			$content.slideUp(200);
			const updateData = {};
			updateData[`flags.${MODULE_ID}.spellDamage.enabled`] = false;
			item.update(updateData, { render: false });
		}
	});
	
	// Summoning toggle
	html.find('.sdx-summoning-toggle').off('change').on('change', function(e) {
		e.stopPropagation();
		const isEnabled = $(this).is(':checked');
		
		if (isEnabled) {
			// Disable other activities visually
			html.find('.sdx-spell-damage-toggle').prop('checked', false);
			html.find('.sdx-spell-damage-content').slideUp(200);
			html.find('.sdx-item-give-toggle').prop('checked', false);
			// Save all states at once
			const updateData = {};
			updateData[`flags.${MODULE_ID}.spellDamage.enabled`] = false;
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = true;
			updateData[`flags.${MODULE_ID}.itemGive.enabled`] = false;
			item.update(updateData, { render: false });
		} else {
			const updateData = {};
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = false;
			item.update(updateData, { render: false });
		}
	});
	
	// Item Give toggle
	html.find('.sdx-item-give-toggle').off('change').on('change', function(e) {
		e.stopPropagation();
		const isEnabled = $(this).is(':checked');
		
		if (isEnabled) {
			// Disable other activities visually
			html.find('.sdx-spell-damage-toggle').prop('checked', false);
			html.find('.sdx-spell-damage-content').slideUp(200);
			html.find('.sdx-summoning-toggle').prop('checked', false);
			// Save all states at once
			const updateData = {};
			updateData[`flags.${MODULE_ID}.spellDamage.enabled`] = false;
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = false;
			updateData[`flags.${MODULE_ID}.itemGive.enabled`] = true;
			item.update(updateData, { render: false });
		} else {
			const updateData = {};
			updateData[`flags.${MODULE_ID}.itemGive.enabled`] = false;
			item.update(updateData, { render: false });
		}
	});
}

/**
 * Enhance spell item sheets with damage/heal configuration
 */
async function enhanceSpellSheet(app, html) {
	// Check if spell enhancement is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enhanceSpells")) return;
	} catch {
		return;
	}

	// Only enhance Spell items
	const item = app.item;
	if (!item || item.type !== "Spell") return;

	console.log(`${MODULE_ID} | Enhancing spell sheet for`, item.name);

	// Remove any existing damage/heal boxes to prevent duplicates
	html.find('.sdx-spell-damage-box').remove();

	// Initialize flags if they don't exist
	const spellDamageFlags = item.flags?.[MODULE_ID]?.spellDamage || {
		enabled: false,
		isDamage: true, // true = damage, false = heal
		numDice: 1,
		dieType: "d6",
		bonus: 0,
		damageType: "",
		scaling: "every-level", // "none", "every-level", "every-other-level"
		scalingDice: 1,
		formula: "",
		damageRequirement: "", // Formula that must evaluate to true for damage to apply
		damageRequirementFailAction: "zero", // "zero" or "half" - what to do when requirement fails
		effectsRequirement: "", // Formula that must evaluate to true for effects to apply
		effects: [], // Array of effect document UUIDs
		applyToTarget: true, // true = apply damage/heal to target, false = apply to self
		effectsApplyToTarget: true // true = apply effects to target, false = apply to self
	};
	
	// Initialize summoning flags
	const summoningFlags = item.flags?.[MODULE_ID]?.summoning || {
		enabled: false,
		profiles: []
	};
	
	// Initialize item give flags
	const itemGiveFlags = item.flags?.[MODULE_ID]?.itemGive || {
		enabled: false,
		profiles: []
	};
	
	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags
	};
	
	// Convert applyToTarget to boolean (in case it was stored as string)
	const applyToTarget = spellDamageFlags.applyToTarget === "false" ? false : (spellDamageFlags.applyToTarget === false ? false : true);
	const effectsApplyToTarget = spellDamageFlags.effectsApplyToTarget === "false" ? false : (spellDamageFlags.effectsApplyToTarget === false ? false : true);

	// Preserve active tab across re-renders
	if (!app._shadowdarkExtrasActiveTab) {
		app._shadowdarkExtrasActiveTab = 'tab-details'; // Default to details
	}
	
	// Check which tab is currently active
	const $currentActiveTab = html.find('nav.SD-nav a.navigation-tab.active');
	if ($currentActiveTab.length) {
		const currentTab = $currentActiveTab.data('tab');
		if (currentTab) {
			app._shadowdarkExtrasActiveTab = currentTab;
		}
	}

	// Create a new "Activity" tab after Details tab
	const $tabs = html.find('nav.SD-nav');
	
	// Check if Activity tab already exists
	if (!html.find('section[data-tab="tab-activity"]').length) {
		// Add Activity tab to navigation (after Details)
		const activityTabLink = `<a class="navigation-tab" data-tab="tab-activity">Activity</a>`;
		const $detailsLink = $tabs.find('a[data-tab="tab-details"]');
		if ($detailsLink.length) {
			$detailsLink.after(activityTabLink);
			console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}
		
		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}
		
		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function() {
			const tabName = $(this).data('tab');
			if (tabName) {
				app._shadowdarkExtrasActiveTab = tabName;
			}
		});
	}
	
	// Restore the previously active tab
	setTimeout(() => {
		const $targetTab = $tabs.find(`a.navigation-tab[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		const $targetSection = html.find(`section[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		
		if ($targetTab.length && $targetSection.length) {
			// Remove active class from all tabs
			$tabs.find('a.navigation-tab').removeClass('active');
			html.find('section[data-group="primary"]').removeClass('active');
			
			// Add active class to target tab
			$targetTab.addClass('active');
			$targetSection.addClass('active');
		}
	}, 0);
	
	// Find the Activity tab content
	const $activityTab = html.find('section.tab-activity[data-tab="tab-activity"]');
	if (!$activityTab.length) {
		console.warn(`${MODULE_ID} | Activity tab not found in spell sheet`);
		return;
	}

	console.log(`${MODULE_ID} | Activity tab found/created`);

	// Build list of current effects from stored UUIDs
	let effectsListHtml = '';
	
	// Handle case where effects might be a string instead of an array (from form submission)
	let effectsArray = flags.effects || [];
	if (typeof effectsArray === 'string') {
		try {
			effectsArray = JSON.parse(effectsArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse effects string:`, effectsArray, err);
			effectsArray = [];
		}
	}
	
	// Normalize effects array - convert old UUID strings to new object format
	effectsArray = effectsArray.map(effect => {
		if (typeof effect === 'string') {
			return { uuid: effect, duration: {} };
		}
		return effect;
	});
	
	if (effectsArray && effectsArray.length > 0) {
		console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);
		
		// Load all effects in parallel and wait for them all
		const effectPromises = effectsArray.map(effect => fromUuid(effect.uuid || effect));
		const effectDocs = await Promise.all(effectPromises);
		
		for (let i = 0; i < effectDocs.length; i++) {
			const doc = effectDocs[i];
			const effectData = effectsArray[i];
			const uuid = effectData.uuid || effectData;
			const duration = effectData.duration || {};
			
			if (doc) {
				effectsListHtml += `
					<div class="sdx-spell-effect-item" data-uuid="${uuid}" data-effect-index="${i}">
						<div class="sdx-effect-header">
							<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
							<span class="sdx-effect-name">${doc.name}</span>
							<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
						</div>
						<div class="sdx-effect-duration-override">
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Seconds</label>
									<input type="number" class="sdx-duration-input" data-field="seconds" value="${duration.seconds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Time</label>
									<input type="number" class="sdx-duration-input" data-field="startTime" value="${duration.startTime || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Rounds</label>
									<input type="number" class="sdx-duration-input" data-field="rounds" value="${duration.rounds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Turns</label>
									<input type="number" class="sdx-duration-input" data-field="turns" value="${duration.turns || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Start Round</label>
									<input type="number" class="sdx-duration-input" data-field="startRound" value="${duration.startRound || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Turn</label>
									<input type="number" class="sdx-duration-input" data-field="startTurn" value="${duration.startTurn || ''}" placeholder="Default" />
								</div>
							</div>
						</div>
					</div>
				`;
			} else {
				console.warn(`${MODULE_ID} | Could not load effect from UUID:`, uuid);
			}
		}
		
		console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
	}

	// Build summons list HTML
	let summonsList = '';
	let summonProfilesArray = summoningFlags.profiles || [];
	
	// Handle case where profiles might be a string
	if (typeof summonProfilesArray === 'string') {
		try {
			summonProfilesArray = JSON.parse(summonProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse summon profiles string:`, summonProfilesArray, err);
			summonProfilesArray = [];
		}
	}
	
	if (summonProfilesArray && summonProfilesArray.length > 0) {
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		for (let i = 0; i < summonProfilesArray.length; i++) {
			const profile = summonProfilesArray[i];
			summonsList += generateSummonProfileHTML(profile, i);
		}
	}

	let itemGiveList = '';
	let itemGiveProfilesArray = itemGiveFlags.profiles || [];

	if (typeof itemGiveProfilesArray === 'string') {
		try {
			itemGiveProfilesArray = JSON.parse(itemGiveProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse item give profiles string:`, itemGiveProfilesArray, err);
			itemGiveProfilesArray = [];
		}
	}

	if (itemGiveProfilesArray && itemGiveProfilesArray.length > 0) {
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		for (let i = 0; i < itemGiveProfilesArray.length; i++) {
			const profile = itemGiveProfilesArray[i];
			itemGiveList += generateItemGiveProfileHTML(profile, i);
		}
	}

	// Build the damage/heal UI HTML using template (now includes summoning)
	const damageHealHtml = generateSpellConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray);

	// Insert into Activity tab
	$activityTab.append(damageHealHtml);
	console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function(e) {
		e.stopPropagation(); // Prevent event from bubbling up to form auto-submit
		
		// Manually update the item without re-rendering
		const fieldName = $(this).attr('name');
		if (fieldName) {
			let value = $(this).val();
			
			// Handle checkboxes
			if ($(this).attr('type') === 'checkbox') {
				value = $(this).is(':checked');
			}
			// Handle radio buttons
			else if ($(this).attr('type') === 'radio' && !$(this).is(':checked')) {
				return; // Don't update for unchecked radios
			}
			// Handle number inputs
			else if ($(this).attr('type') === 'number') {
				value = parseFloat(value) || 0;
			}
			
			const updateData = {};
			updateData[fieldName] = value;
			
			// Update without re-rendering
			item.update(updateData, { render: false }).then(() => {
				console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function() {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function() {
		const selectedType = $(this).val();
		const $box = $(this).closest('.sdx-spell-damage-box');
		
		// Hide all formula sections
		$box.find('.sdx-formula-section').hide();
		
		// Show the selected formula section
		if (selectedType === 'basic') {
			$box.find('.sdx-basic-formula').show();
		} else if (selectedType === 'formula') {
			$box.find('.sdx-custom-formula').show();
		} else if (selectedType === 'tiered') {
			$box.find('.sdx-tiered-formula').show();
		}
		
		// Save the formula type preference
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.formulaType`] = selectedType;
		item.update(updateData, { render: false });
	});

	// Attach drag and drop listeners for effects
	const $dropArea = html.find('.sdx-spell-effects-drop-area');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	// Update the hidden input when effects change
	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function() {
			const $item = $(this);
			const uuid = $item.data('uuid');
			
			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function() {
				const field = $(this).data('field');
				const value = $(this).val();
				if (value !== '') {
					duration[field] = parseFloat(value);
				}
			});
			
			effects.push({ uuid, duration });
		});
		$effectsData.val(JSON.stringify(effects));
		
		// Save immediately to the item without re-rendering
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effects`] = effects;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved spell effects:`, effects);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save spell effects:`, err);
		});
		
		// Remove "no effects" placeholder if we have effects
		if (effects.length > 0) {
			$effectsList.find('.sdx-no-effects').remove();
		} else if ($effectsList.find('.sdx-spell-effect-item').length === 0) {
			$effectsList.html('<div class="sdx-no-effects">Drag and drop conditions or effects here</div>');
		}
	}

	// Handle drag over
	$dropArea.on('dragover', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	// Handle drag leave
	$dropArea.on('dragleave', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	// Handle drop
	$dropArea.on('drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');

		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				// Handle items from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}

			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}

			// Check if it's an effect or condition type
			const validTypes = ['Effect', 'Condition', 'NPC Feature'];
			if (!validTypes.includes(doc.type)) {
				ui.notifications.warn(`Only Effect, Condition, or NPC Feature items can be dropped here`);
				return;
			}

			// Check if already added
			const uuid = doc.uuid;
			if ($effectsList.find(`[data-uuid="${uuid}"]`).length > 0) {
				ui.notifications.info(`${doc.name} is already in the effects list`);
				return;
			}

			// Add the effect to the list
			const effectIndex = $effectsList.find('.sdx-spell-effect-item').length;
			const effectHtml = `
				<div class="sdx-spell-effect-item" data-uuid="${uuid}" data-effect-index="${effectIndex}">
					<div class="sdx-effect-header">
						<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
						<span class="sdx-effect-name">${doc.name}</span>
						<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
					</div>
					<div class="sdx-effect-duration-override">
						<div class="sdx-duration-row">
							<div class="sdx-duration-field">
								<label>Seconds</label>
								<input type="number" class="sdx-duration-input" data-field="seconds" value="" placeholder="Default" />
							</div>
							<div class="sdx-duration-field">
								<label>Start Time</label>
								<input type="number" class="sdx-duration-input" data-field="startTime" value="" placeholder="Default" />
							</div>
						</div>
						<div class="sdx-duration-row">
							<div class="sdx-duration-field">
								<label>Rounds</label>
								<input type="number" class="sdx-duration-input" data-field="rounds" value="" placeholder="Default" />
							</div>
							<div class="sdx-duration-field">
								<label>Turns</label>
								<input type="number" class="sdx-duration-input" data-field="turns" value="" placeholder="Default" />
							</div>
						</div>
						<div class="sdx-duration-row">
							<div class="sdx-duration-field">
								<label>Start Round</label>
								<input type="number" class="sdx-duration-input" data-field="startRound" value="" placeholder="Default" />
							</div>
							<div class="sdx-duration-field">
								<label>Start Turn</label>
								<input type="number" class="sdx-duration-input" data-field="startTurn" value="" placeholder="Default" />
							</div>
						</div>
					</div>
				</div>
			`;
			
			$effectsList.find('.sdx-no-effects').remove();
			$effectsList.append(effectHtml);
			updateEffectsData();

			ui.notifications.info(`Added ${doc.name} to spell effects`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling drop:`, err);
			ui.notifications.error('Failed to add effect');
		}
	});

	// Handle remove effect button
	html.on('click', '.sdx-remove-effect', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	// Handle duration input changes
	html.on('change', '.sdx-duration-input', function() {
		updateEffectsData();
	});

	// Also save applyToTarget when radio buttons change
	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.applyToTarget"]', function() {
		const applyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.applyToTarget`] = applyToTargetValue;
		
		item.update(updateData).then(() => {
			console.log(`${MODULE_ID} | Saved applyToTarget:`, applyToTargetValue);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save applyToTarget:`, err);
		});
	});

	// ===== SUMMONING HANDLERS =====
	
	// Toggle summoning section - acts like radio button (only one activity can be enabled)
	html.on('change', '.sdx-summoning-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).prop('checked');
		
		console.log(`${MODULE_ID} | Summoning toggle changed to:`, enabled);
		
		if (enabled) {
			// Disable other activities
			html.find('.sdx-spell-damage-toggle').prop('checked', false);
			html.find('.sdx-spell-damage-content').slideUp(200);
			html.find('.sdx-item-give-toggle').prop('checked', false);
			// Save all states at once
			const updateData = {};
			updateData[`flags.${MODULE_ID}.spellDamage.enabled`] = false;
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = true;
			updateData[`flags.${MODULE_ID}.itemGive.enabled`] = false;
			item.update(updateData, { render: false });
		} else {
			// Just disable this one
			const updateData = {};
			updateData[`flags.${MODULE_ID}.summoning.enabled`] = false;
			item.update(updateData, { render: false });
		}
	});
	
	// Add summon profile button
	html.on('click', '.sdx-add-summon-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $summonsList = $(this).closest('.sdx-summoning-content').find('.sdx-summons-list');
		const index = $summonsList.find('.sdx-summon-profile').length;
		
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		
		const profileHtml = generateSummonProfileHTML(newProfile, index);
		$summonsList.find('.sdx-no-summons').remove();
		$summonsList.append(profileHtml);
		
		updateSummonsData();
	});
	
	// Remove summon profile
	html.on('click', '.sdx-remove-summon-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		
		$(this).closest('.sdx-summon-profile').remove();
		
		// Re-index remaining profiles
		const $summonsList = $(this).closest('.sdx-summons-list');
		$summonsList.find('.sdx-summon-profile').each(function(idx) {
			$(this).attr('data-index', idx);
			$(this).find('.sdx-remove-summon-btn').attr('data-index', idx);
		});
		
		updateSummonsData();
	});
	
	// Handle summon profile input changes
	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function(e) {
		e.stopPropagation(); // Prevent form auto-submit
		updateSummonsData();
	});
	
	// Handle drop on creature drop zone
	html.on('dragover', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});
	
	html.on('dragleave', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});
	
	html.on('drop', '.sdx-summon-creature-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Actor' && data.id) {
				// Handle actors from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.actors.get(data.id);
				}
			}
			
			if (!doc) {
				ui.notifications.warn('Could not load dropped actor');
				return;
			}
			
			// Must be an Actor
			if (!(doc instanceof Actor)) {
				ui.notifications.warn('Only actors can be dropped here');
				return;
			}
			
			// Update the profile display
			const $profile = $(this).closest('.sdx-summon-profile');
			const creatureName = doc.name;
			const creatureImg = doc.img || doc.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
			const creatureUuid = doc.uuid;
			
			// Update hidden inputs
			$profile.find('.sdx-creature-uuid').val(creatureUuid);
			$profile.find('.sdx-creature-name').val(creatureName);
			$profile.find('.sdx-creature-img').val(creatureImg);
			
			// Update display
			$(this).html(`
				<div class="sdx-summon-creature-display" data-uuid="${creatureUuid}">
					<img src="${creatureImg}" alt="${creatureName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${creatureName}</span>
				</div>
			`);
			
			updateSummonsData();
			ui.notifications.info(`Added ${creatureName} to summon profile`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling creature drop:`, err);
			ui.notifications.error('Failed to add creature');
		}
	});
	
	// Function to collect and save summons data
	function updateSummonsData() {
		const profiles = [];
		html.find('.sdx-summon-profile').each(function() {
			const $profile = $(this);
			profiles.push({
				creatureUuid: $profile.find('.sdx-creature-uuid').val(),
				creatureName: $profile.find('.sdx-creature-name').val(),
				creatureImg: $profile.find('.sdx-creature-img').val(),
				count: $profile.find('.sdx-summon-count').val() || '1',
				displayName: $profile.find('.sdx-summon-display-name').val() || ''
			});
		});
		
		// Update hidden input
		html.find('.sdx-summons-data').val(JSON.stringify(profiles));
		
		// Save to item
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		const $list = $(this).closest('.sdx-item-give-content').find('.sdx-item-give-list');
		const index = $list.find('.sdx-item-give-profile').length;
		const newProfile = {
			itemUuid: '',
			itemName: '',
			itemImg: '',
			quantity: '1'
		};
		$list.find('.sdx-no-items').remove();
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function(e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}
			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}
			if (!(doc instanceof Item)) {
				ui.notifications.warn('Only items can be dropped here');
				return;
			}
			const $profile = $(this).closest('.sdx-item-give-profile');
			const itemName = doc.name;
			const itemImg = doc.img || 'icons/svg/mystery-man.svg';
			const itemUuid = doc.uuid;
			$profile.find('.sdx-item-give-uuid').val(itemUuid);
			$profile.find('.sdx-item-give-name').val(itemName);
			$profile.find('.sdx-item-give-img').val(itemImg);
			$(this).html(`
				<div class="sdx-item-give-display" data-uuid="${itemUuid}">
					<img src="${itemImg}" alt="${itemName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${itemName}</span>
				</div>
			`);
			updateItemGiveData();
			ui.notifications.info(`Added ${itemName} to caster item list`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling item drop:`, err);
			ui.notifications.error('Failed to add item');
		}
	});

	function updateItemGiveData() {
		const profiles = [];
		html.find('.sdx-item-give-profile').each(function(idx) {
			const $profile = $(this);
			$profile.attr('data-index', idx);
			$profile.find('.sdx-remove-item-give-btn').attr('data-index', idx);
			profiles.push({
				itemUuid: $profile.find('.sdx-item-give-uuid').val(),
				itemName: $profile.find('.sdx-item-give-name').val(),
				itemImg: $profile.find('.sdx-item-give-img').val(),
				quantity: $profile.find('.sdx-item-give-quantity').val() || '1'
			});
		});
		const $list = html.find('.sdx-item-give-list');
		if (profiles.length === 0) {
			$list.html('<div class="sdx-no-items">Drop an item here to grant it to the caster on success</div>');
		} else {
			$list.find('.sdx-no-items').remove();
		}
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	console.log(`${MODULE_ID} | Spell sheet enhanced for`, item.name);
}

/**
 * Enhance Potion item sheets with damage/heal and conditions UI
 */
async function enhancePotionSheet(app, html) {
	// Check if spell enhancement is enabled (reuse spell enhancement setting)
	try {
		if (!game.settings.get(MODULE_ID, "enhanceSpells")) return;
	} catch {
		return;
	}

	// Only enhance Potion items
	const item = app.item;
	if (!item || item.type !== "Potion") return;

	console.log(`${MODULE_ID} | Enhancing potion sheet for`, item.name);

	// Remove any existing damage/heal boxes to prevent duplicates
	html.find('.sdx-spell-damage-box').remove();

	// Initialize flags if they don't exist
	const spellDamageFlags = item.flags?.[MODULE_ID]?.spellDamage || {
		enabled: false,
		isDamage: true, // true = damage, false = heal
		numDice: 1,
		dieType: "d6",
		bonus: 0,
		damageType: "",
		scaling: "none", // potions don't scale by level
		scalingDice: 0,
		formula: "",
		damageRequirement: "", // Formula that must evaluate to true for damage to apply
		damageRequirementFailAction: "zero", // "zero" or "half" - what to do when requirement fails
		effectsRequirement: "", // Formula that must evaluate to true for effects to apply
		effects: [], // Array of effect document UUIDs
		applyToTarget: false, // potions apply to self (drinker) by default
		effectsApplyToTarget: false // potions apply effects to self by default
	};
	
	// Initialize summoning flags
	const summoningFlags = item.flags?.[MODULE_ID]?.summoning || {
		enabled: false,
		profiles: []
	};
	
	// Initialize item give flags
	const itemGiveFlags = item.flags?.[MODULE_ID]?.itemGive || {
		enabled: false,
		profiles: []
	};
	
	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags
	};
	
	// Convert applyToTarget to boolean (in case it was stored as string)
	const applyToTarget = flags.applyToTarget === "true" ? true : (flags.applyToTarget === true ? true : false);
	const effectsApplyToTarget = flags.effectsApplyToTarget === "true" ? true : (flags.effectsApplyToTarget === true ? true : false);

	// Preserve active tab across re-renders
	if (!app._shadowdarkExtrasActiveTab) {
		app._shadowdarkExtrasActiveTab = 'tab-details'; // Default to details
	}
	
	// Check which tab is currently active
	const $currentActiveTab = html.find('nav.SD-nav a.navigation-tab.active');
	if ($currentActiveTab.length) {
		const currentTab = $currentActiveTab.data('tab');
		if (currentTab) {
			app._shadowdarkExtrasActiveTab = currentTab;
		}
	}

	// Create a new "Activity" tab after Details tab
	const $tabs = html.find('nav.SD-nav');
	
	// Check if Activity tab already exists
	if (!html.find('section[data-tab="tab-activity"]').length) {
		// Add Activity tab to navigation (after Details)
		const activityTabLink = `<a class="navigation-tab" data-tab="tab-activity">Activity</a>`;
		const $detailsLink = $tabs.find('a[data-tab="tab-details"]');
		if ($detailsLink.length) {
			$detailsLink.after(activityTabLink);
			console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}
		
		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}
		
		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function() {
			const tabName = $(this).data('tab');
			if (tabName) {
				app._shadowdarkExtrasActiveTab = tabName;
			}
		});
	}
	
	// Restore the previously active tab
	setTimeout(() => {
		const $targetTab = $tabs.find(`a.navigation-tab[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		const $targetSection = html.find(`section[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		
		if ($targetTab.length && $targetSection.length) {
			// Remove active class from all tabs
			$tabs.find('a.navigation-tab').removeClass('active');
			html.find('section[data-group="primary"]').removeClass('active');
			
			// Add active class to target tab
			$targetTab.addClass('active');
			$targetSection.addClass('active');
		}
	}, 0);
	
	// Find the Activity tab content
	const $activityTab = html.find('section.tab-activity[data-tab="tab-activity"]');
	if (!$activityTab.length) {
		console.warn(`${MODULE_ID} | Activity tab not found in potion sheet`);
		return;
	}

	console.log(`${MODULE_ID} | Activity tab found/created`);

	// Build list of current effects from stored UUIDs
	let effectsListHtml = '';
	
	// Handle case where effects might be a string instead of an array (from form submission)
	let effectsArray = flags.effects || [];
	if (typeof effectsArray === 'string') {
		try {
			effectsArray = JSON.parse(effectsArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse effects string:`, effectsArray, err);
			effectsArray = [];
		}
	}
	
	// Normalize effects array - convert old UUID strings to new object format
	effectsArray = effectsArray.map(effect => {
		if (typeof effect === 'string') {
			return { uuid: effect, duration: {} };
		}
		return effect;
	});
	
	if (effectsArray && effectsArray.length > 0) {
		console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);
		
		// Load all effects in parallel and wait for them all
		const effectPromises = effectsArray.map(effect => fromUuid(effect.uuid || effect));
		const effectDocs = await Promise.all(effectPromises);
		
		for (let i = 0; i < effectDocs.length; i++) {
			const doc = effectDocs[i];
			const effectData = effectsArray[i];
			const uuid = effectData.uuid || effectData;
			const duration = effectData.duration || {};
			
			if (doc) {
				effectsListHtml += `
					<div class="sdx-spell-effect-item" data-uuid="${uuid}" data-effect-index="${i}">
						<div class="sdx-effect-header">
							<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
							<span class="sdx-effect-name">${doc.name}</span>
							<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
						</div>
						<div class="sdx-effect-duration-override">
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Seconds</label>
									<input type="number" class="sdx-duration-input" data-field="seconds" value="${duration.seconds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Time</label>
									<input type="number" class="sdx-duration-input" data-field="startTime" value="${duration.startTime || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Rounds</label>
									<input type="number" class="sdx-duration-input" data-field="rounds" value="${duration.rounds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Turns</label>
									<input type="number" class="sdx-duration-input" data-field="turns" value="${duration.turns || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Start Round</label>
									<input type="number" class="sdx-duration-input" data-field="startRound" value="${duration.startRound || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Turn</label>
									<input type="number" class="sdx-duration-input" data-field="startTurn" value="${duration.startTurn || ''}" placeholder="Default" />
								</div>
							</div>
						</div>
					</div>
				`;
			} else {
				console.warn(`${MODULE_ID} | Could not load effect from UUID:`, uuid);
			}
		}
		
		console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
	}

	// Build summons list HTML
	let summonsList = '';
	let summonProfilesArray = summoningFlags.profiles || [];
	
	// Handle case where profiles might be a string
	if (typeof summonProfilesArray === 'string') {
		try {
			summonProfilesArray = JSON.parse(summonProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse summon profiles string:`, summonProfilesArray, err);
			summonProfilesArray = [];
		}
	}
	
	if (summonProfilesArray && summonProfilesArray.length > 0) {
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		for (let i = 0; i < summonProfilesArray.length; i++) {
			const profile = summonProfilesArray[i];
			summonsList += generateSummonProfileHTML(profile, i);
		}
	}

	let itemGiveList = '';
	let itemGiveProfilesArray = itemGiveFlags.profiles || [];

	if (typeof itemGiveProfilesArray === 'string') {
		try {
			itemGiveProfilesArray = JSON.parse(itemGiveProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse item give profiles string:`, itemGiveProfilesArray, err);
			itemGiveProfilesArray = [];
		}
	}

	if (itemGiveProfilesArray && itemGiveProfilesArray.length > 0) {
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		for (let i = 0; i < itemGiveProfilesArray.length; i++) {
			const profile = itemGiveProfilesArray[i];
			itemGiveList += generateItemGiveProfileHTML(profile, i);
		}
	}

	// Build the damage/heal UI HTML using template
	const damageHealHtml = generatePotionConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray);

	// Insert into Activity tab
	$activityTab.append(damageHealHtml);
	console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function(e) {
		e.stopPropagation(); // Prevent event from bubbling up to form auto-submit
		
		// Manually update the item without re-rendering
		const fieldName = $(this).attr('name');
		if (fieldName) {
			let value = $(this).val();
			
			// Handle checkboxes
			if ($(this).attr('type') === 'checkbox') {
				value = $(this).is(':checked');
			}
			// Handle radio buttons
			else if ($(this).attr('type') === 'radio' && !$(this).is(':checked')) {
				return; // Don't update for unchecked radios
			}
			// Handle number inputs
			else if ($(this).attr('type') === 'number') {
				value = parseFloat(value) || 0;
			}
			
			const updateData = {};
			updateData[fieldName] = value;
			
			// Update without re-rendering
			item.update(updateData, { render: false }).then(() => {
				console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function() {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function() {
		const selectedType = $(this).val();
		const $box = $(this).closest('.sdx-spell-damage-box');
		
		// Hide all formula sections
		$box.find('.sdx-formula-section').hide();
		
		// Show the selected formula section
		if (selectedType === 'basic') {
			$box.find('.sdx-basic-formula').show();
		} else if (selectedType === 'formula') {
			$box.find('.sdx-custom-formula').show();
		} else if (selectedType === 'tiered') {
			$box.find('.sdx-tiered-formula').show();
		}
		
		// Save the formula type preference
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.formulaType`] = selectedType;
		item.update(updateData, { render: false });
	});

	// Attach drag and drop listeners for effects
	const $dropArea = html.find('.sdx-spell-effects-drop-area');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	// Update the hidden input when effects change
	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function() {
			const $item = $(this);
			const uuid = $item.data('uuid');
			
			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function() {
				const field = $(this).data('field');
				const value = $(this).val();
				if (value && value.trim() !== '') {
					duration[field] = parseFloat(value);
				}
			});
			
			effects.push({ uuid, duration });
		});
		$effectsData.val(JSON.stringify(effects));
		
		// Save immediately to the item
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effects`] = effects;
		item.update(updateData).then(() => {
			console.log(`${MODULE_ID} | Saved potion effects:`, effects);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save potion effects:`, err);
		});
		
		// Remove "no effects" placeholder if we have effects
		if (effects.length > 0) {
			$effectsList.find('.sdx-no-effects').remove();
		} else if ($effectsList.find('.sdx-spell-effect-item').length === 0) {
			$effectsList.html('<div class="sdx-no-effects">Drag and drop conditions or effects here</div>');
		}
	}

	// Handle drag over
	$dropArea.on('dragover', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	// Handle drag leave
	$dropArea.on('dragleave', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	// Handle drop
	$dropArea.on('drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');

		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				// Handle items from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}

			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}

			// Check if it's an effect or condition type
			const validTypes = ['Effect', 'Condition', 'NPC Feature'];
			if (!validTypes.includes(doc.type)) {
				ui.notifications.warn(`Only Effect, Condition, or NPC Feature items can be dropped here`);
				return;
			}

			// Check if already added
			const uuid = doc.uuid;
			if ($effectsList.find(`[data-uuid="${uuid}"]`).length > 0) {
				ui.notifications.info(`${doc.name} is already in the effects list`);
				return;
			}

			// Add the effect to the list
			const effectHtml = `
				<div class="sdx-spell-effect-item" data-uuid="${uuid}">
					<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
					<span>${doc.name}</span>
					<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
				</div>
			`;
			
			$effectsList.find('.sdx-no-effects').remove();
			$effectsList.append(effectHtml);
			updateEffectsData();

			ui.notifications.info(`Added ${doc.name} to potion effects`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling drop:`, err);
			ui.notifications.error('Failed to add effect');
		}
	});

	// Handle remove effect button
	html.on('click', '.sdx-remove-effect', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	// Also save effectsApplyToTarget when radio buttons change
	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function() {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;
		
		item.update(updateData).then(() => {
			console.log(`${MODULE_ID} | Saved effectsApplyToTarget:`, effectsApplyToTargetValue);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save effectsApplyToTarget:`, err);
		});
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summon-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.find('.sdx-no-summons').remove();
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function(e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});
	
	html.on('dragleave', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});
	
	html.on('drop', '.sdx-summon-creature-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Actor' && data.id) {
				// Handle actors from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.actors.get(data.id);
				}
			}
			
			if (!doc) {
				ui.notifications.warn('Could not load dropped actor');
				return;
			}
			
			// Must be an Actor
			if (!(doc instanceof Actor)) {
				ui.notifications.warn('Only actors can be dropped here');
				return;
			}
			
			// Update the profile display
			const $profile = $(this).closest('.sdx-summon-profile');
			const creatureName = doc.name;
			const creatureImg = doc.img || doc.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
			const creatureUuid = doc.uuid;
			
			// Update hidden inputs
			$profile.find('.sdx-creature-uuid').val(creatureUuid);
			$profile.find('.sdx-creature-name').val(creatureName);
			$profile.find('.sdx-creature-img').val(creatureImg);
			
			// Update display
			$(this).html(`
				<div class="sdx-summon-creature-display" data-uuid="${creatureUuid}">
					<img src="${creatureImg}" alt="${creatureName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${creatureName}</span>
				</div>
			`);
			
			updateSummonsData();
			ui.notifications.info(`Added ${creatureName} to summon profile`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling creature drop:`, err);
			ui.notifications.error('Failed to add creature');
		}
	});
	
	// Function to collect and save summons data
	function updateSummonsData() {
		const profiles = [];
		html.find('.sdx-summon-profile').each(function() {
			const $profile = $(this);
			profiles.push({
				creatureUuid: $profile.find('.sdx-creature-uuid').val(),
				creatureName: $profile.find('.sdx-creature-name').val(),
				creatureImg: $profile.find('.sdx-creature-img').val(),
				count: $profile.find('.sdx-summon-count').val() || '1',
				displayName: $profile.find('.sdx-summon-display-name').val() || ''
			});
		});
		
		// Update hidden input
		html.find('.sdx-summons-data').val(JSON.stringify(profiles));
		
		// Save to item
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		const $list = $(this).closest('.sdx-item-give-content').find('.sdx-item-give-list');
		const index = $list.find('.sdx-item-give-profile').length;
		const newProfile = {
			itemUuid: '',
			itemName: '',
			itemImg: '',
			quantity: '1'
		};
		$list.find('.sdx-no-items').remove();
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function(e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}
			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}
			if (!(doc instanceof Item)) {
				ui.notifications.warn('Only items can be dropped here');
				return;
			}
			const $profile = $(this).closest('.sdx-item-give-profile');
			const itemName = doc.name;
			const itemImg = doc.img || 'icons/svg/mystery-man.svg';
			const itemUuid = doc.uuid;
			$profile.find('.sdx-item-give-uuid').val(itemUuid);
			$profile.find('.sdx-item-give-name').val(itemName);
			$profile.find('.sdx-item-give-img').val(itemImg);
			$(this).html(`
				<div class="sdx-item-give-display" data-uuid="${itemUuid}">
					<img src="${itemImg}" alt="${itemName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${itemName}</span>
				</div>
			`);
			updateItemGiveData();
			ui.notifications.info(`Added ${itemName} to caster item list`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling item drop:`, err);
			ui.notifications.error('Failed to add item');
		}
	});

	function updateItemGiveData() {
		const profiles = [];
		html.find('.sdx-item-give-profile').each(function(idx) {
			const $profile = $(this);
			$profile.attr('data-index', idx);
			$profile.find('.sdx-remove-item-give-btn').attr('data-index', idx);
			profiles.push({
				itemUuid: $profile.find('.sdx-item-give-uuid').val(),
				itemName: $profile.find('.sdx-item-give-name').val(),
				itemImg: $profile.find('.sdx-item-give-img').val(),
				quantity: $profile.find('.sdx-item-give-quantity').val() || '1'
			});
		});
		const $list = html.find('.sdx-item-give-list');
		if (profiles.length === 0) {
			$list.html('<div class="sdx-no-items">Drop an item here to grant it to the caster on success</div>');
		} else {
			$list.find('.sdx-no-items').remove();
		}
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	console.log(`${MODULE_ID} | Potion sheet enhanced for`, item.name);
}

/**
 * Enhance Scroll item sheets with damage/heal and conditions UI
 */
async function enhanceScrollSheet(app, html) {
	// Check if spell enhancement is enabled (reuse spell enhancement setting)
	try {
		if (!game.settings.get(MODULE_ID, "enhanceSpells")) return;
	} catch {
		return;
	}

	// Only enhance Scroll items
	const item = app.item;
	if (!item || item.type !== "Scroll") return;

	console.log(`${MODULE_ID} | Enhancing scroll sheet for`, item.name);

	// Debug: Log all flags
	console.log(`${MODULE_ID} | Scroll flags:`, item.flags?.[MODULE_ID]);

	// Remove any existing damage/heal boxes to prevent duplicates
	html.find('.sdx-spell-damage-box').remove();

	// Initialize flags if they don't exist
	const spellDamageFlags = item.flags?.[MODULE_ID]?.spellDamage || {
		enabled: false,
		isDamage: true, // true = damage, false = heal
		numDice: 1,
		dieType: "d6",
		bonus: 0,
		damageType: "",
		scaling: "none", // scrolls typically don't scale (fixed spell level)
		scalingDice: 0,
		formula: "",
		damageRequirement: "", // Formula that must evaluate to true for damage to apply
		damageRequirementFailAction: "zero", // "zero" or "half" - what to do when requirement fails
		effectsRequirement: "", // Formula that must evaluate to true for effects to apply
		effects: [], // Array of effect document UUIDs
		applyToTarget: true, // scrolls apply to target by default
		effectsApplyToTarget: true // scrolls apply effects to target by default
	};
	
	// Initialize summoning flags
	const summoningFlags = item.flags?.[MODULE_ID]?.summoning || {
		enabled: false,
		profiles: []
	};
	
	// Initialize item give flags
	const itemGiveFlags = item.flags?.[MODULE_ID]?.itemGive || {
		enabled: false,
		profiles: []
	};
	
	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags
	};
	
	// Convert applyToTarget to boolean (in case it was stored as string)
	const applyToTarget = flags.applyToTarget === "false" ? false : (flags.applyToTarget === false ? false : true);
	const effectsApplyToTarget = flags.effectsApplyToTarget === "false" ? false : (flags.effectsApplyToTarget === false ? false : true);

	// Preserve active tab across re-renders
	if (!app._shadowdarkExtrasActiveTab) {
		app._shadowdarkExtrasActiveTab = 'tab-details'; // Default to details
	}
	
	// Check which tab is currently active
	const $currentActiveTab = html.find('nav.SD-nav a.navigation-tab.active');
	if ($currentActiveTab.length) {
		const currentTab = $currentActiveTab.data('tab');
		if (currentTab) {
			app._shadowdarkExtrasActiveTab = currentTab;
		}
	}

	// Create a new "Activity" tab after Details tab
	const $tabs = html.find('nav.SD-nav');
	
	// Check if Activity tab already exists
	if (!html.find('section[data-tab="tab-activity"]').length) {
		// Add Activity tab to navigation (after Details)
		const activityTabLink = `<a class="navigation-tab" data-tab="tab-activity">Activity</a>`;
		const $detailsLink = $tabs.find('a[data-tab="tab-details"]');
		if ($detailsLink.length) {
			$detailsLink.after(activityTabLink);
			console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}
		
		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}
		
		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function() {
			const tabName = $(this).data('tab');
			if (tabName) {
				app._shadowdarkExtrasActiveTab = tabName;
			}
		});
	}
	
	// Restore the previously active tab
	setTimeout(() => {
		const $targetTab = $tabs.find(`a.navigation-tab[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		const $targetSection = html.find(`section[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		
		if ($targetTab.length && $targetSection.length) {
			// Remove active class from all tabs
			$tabs.find('a.navigation-tab').removeClass('active');
			html.find('section[data-group="primary"]').removeClass('active');
			
			// Add active class to target tab
			$targetTab.addClass('active');
			$targetSection.addClass('active');
		}
	}, 0);
	
	// Find the Activity tab content
	const $activityTab = html.find('section.tab-activity[data-tab="tab-activity"]');
	if (!$activityTab.length) {
		console.warn(`${MODULE_ID} | Activity tab not found in scroll sheet`);
		return;
	}

	console.log(`${MODULE_ID} | Activity tab found/created`);

	// Build list of current effects from stored UUIDs
	let effectsListHtml = '';
	
	// Handle case where effects might be a string instead of an array (from form submission)
	let effectsArray = flags.effects || [];
	if (typeof effectsArray === 'string') {
		try {
			effectsArray = JSON.parse(effectsArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse effects string:`, effectsArray, err);
			effectsArray = [];
		}
	}
	
	// Normalize effects array - convert old UUID strings to new object format
	effectsArray = effectsArray.map(effect => {
		if (typeof effect === 'string') {
			return { uuid: effect, duration: {} };
		}
		return effect;
	});
	
	if (effectsArray && effectsArray.length > 0) {
		console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);
		
		// Load all effects in parallel and wait for them all
		const effectPromises = effectsArray.map(effect => fromUuid(effect.uuid || effect));
		const effectDocs = await Promise.all(effectPromises);
		
		for (let i = 0; i < effectDocs.length; i++) {
			const doc = effectDocs[i];
			const effectData = effectsArray[i];
			const uuid = effectData.uuid || effectData;
			const duration = effectData.duration || {};
			
			if (doc) {
				effectsListHtml += `
					<div class="sdx-spell-effect-item" data-uuid="${uuid}" data-effect-index="${i}">
						<div class="sdx-effect-header">
							<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
							<span class="sdx-effect-name">${doc.name}</span>
							<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
						</div>
						<div class="sdx-effect-duration-override">
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Seconds</label>
									<input type="number" class="sdx-duration-input" data-field="seconds" value="${duration.seconds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Time</label>
									<input type="number" class="sdx-duration-input" data-field="startTime" value="${duration.startTime || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Rounds</label>
									<input type="number" class="sdx-duration-input" data-field="rounds" value="${duration.rounds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Turns</label>
									<input type="number" class="sdx-duration-input" data-field="turns" value="${duration.turns || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Start Round</label>
									<input type="number" class="sdx-duration-input" data-field="startRound" value="${duration.startRound || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Turn</label>
									<input type="number" class="sdx-duration-input" data-field="startTurn" value="${duration.startTurn || ''}" placeholder="Default" />
								</div>
							</div>
						</div>
					</div>
				`;
			} else {
				console.warn(`${MODULE_ID} | Could not load effect from UUID:`, uuid);
			}
		}
		
		console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
	}

	// Build summons list HTML
	let summonsList = '';
	let summonProfilesArray = summoningFlags.profiles || [];
	
	// Handle case where profiles might be a string
	if (typeof summonProfilesArray === 'string') {
		try {
			summonProfilesArray = JSON.parse(summonProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse summon profiles string:`, summonProfilesArray, err);
			summonProfilesArray = [];
		}
	}
	
	if (summonProfilesArray && summonProfilesArray.length > 0) {
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		for (let i = 0; i < summonProfilesArray.length; i++) {
			const profile = summonProfilesArray[i];
			summonsList += generateSummonProfileHTML(profile, i);
		}
	}

	let itemGiveList = '';
	let itemGiveProfilesArray = itemGiveFlags.profiles || [];

	if (typeof itemGiveProfilesArray === 'string') {
		try {
			itemGiveProfilesArray = JSON.parse(itemGiveProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse item give profiles string:`, itemGiveProfilesArray, err);
			itemGiveProfilesArray = [];
		}
	}

	if (itemGiveProfilesArray && itemGiveProfilesArray.length > 0) {
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		for (let i = 0; i < itemGiveProfilesArray.length; i++) {
			const profile = itemGiveProfilesArray[i];
			itemGiveList += generateItemGiveProfileHTML(profile, i);
		}
	}

	// Build the damage/heal UI HTML
	const damageHealHtml = generateScrollConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray);

	// Insert into Activity tab
	$activityTab.append(damageHealHtml);
	console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function(e) {
		e.stopPropagation(); // Prevent event from bubbling up to form auto-submit
		
		// Manually update the item without re-rendering
		const fieldName = $(this).attr('name');
		if (fieldName) {
			let value = $(this).val();
			
			// Handle checkboxes
			if ($(this).attr('type') === 'checkbox') {
				value = $(this).is(':checked');
			}
			// Handle radio buttons
			else if ($(this).attr('type') === 'radio' && !$(this).is(':checked')) {
				return; // Don't update for unchecked radios
			}
			// Handle number inputs
			else if ($(this).attr('type') === 'number') {
				value = parseFloat(value) || 0;
			}
			
			const updateData = {};
			updateData[fieldName] = value;
			
			// Update without re-rendering
			item.update(updateData, { render: false }).then(() => {
				console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function() {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function() {
		const selectedType = $(this).val();
		const $box = $(this).closest('.sdx-spell-damage-box');
		
		// Hide all formula sections
		$box.find('.sdx-formula-section').hide();
		
		// Show the selected formula section
		if (selectedType === 'basic') {
			$box.find('.sdx-basic-formula').show();
		} else if (selectedType === 'formula') {
			$box.find('.sdx-custom-formula').show();
		} else if (selectedType === 'tiered') {
			$box.find('.sdx-tiered-formula').show();
		}
		
		// Save the formula type preference
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.formulaType`] = selectedType;
		item.update(updateData, { render: false });
	});

	// Attach drag and drop listeners for effects
	const $dropArea = html.find('.sdx-spell-effects-drop-area');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function() {
			const $item = $(this);
			const uuid = $item.data('uuid');
			
			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function() {
				const field = $(this).data('field');
				const value = $(this).val();
				if (value && value.trim() !== '') {
					duration[field] = parseFloat(value);
				}
			});
			
			effects.push({ uuid, duration });
		});
		$effectsData.val(JSON.stringify(effects));
		
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effects`] = effects;
		item.update(updateData);
		
		if (effects.length > 0) {
			$effectsList.find('.sdx-no-effects').remove();
		} else if ($effectsList.find('.sdx-spell-effect-item').length === 0) {
			$effectsList.html('<div class="sdx-no-effects">Drag and drop conditions or effects here</div>');
		}
	}

	$dropArea.on('dragover', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	$dropArea.on('dragleave', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	$dropArea.on('drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');

		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}

			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}

			const validTypes = ['Effect', 'Condition', 'NPC Feature'];
			if (!validTypes.includes(doc.type)) {
				ui.notifications.warn(`Only Effect, Condition, or NPC Feature items can be dropped here`);
				return;
			}

			const uuid = doc.uuid;
			if ($effectsList.find(`[data-uuid="${uuid}"]`).length > 0) {
				ui.notifications.info(`${doc.name} is already in the effects list`);
				return;
			}

			const effectHtml = `
				<div class="sdx-spell-effect-item" data-uuid="${uuid}">
					<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
					<span>${doc.name}</span>
					<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
				</div>
			`;
			
			$effectsList.find('.sdx-no-effects').remove();
			$effectsList.append(effectHtml);
			updateEffectsData();

			ui.notifications.info(`Added ${doc.name} to scroll effects`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling drop:`, err);
			ui.notifications.error('Failed to add effect');
		}
	});

	html.on('click', '.sdx-remove-effect', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function() {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;
		item.update(updateData);
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summon-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.find('.sdx-no-summons').remove();
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function(e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});
	
	html.on('dragleave', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});
	
	html.on('drop', '.sdx-summon-creature-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Actor' && data.id) {
				// Handle actors from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.actors.get(data.id);
				}
			}
			
			if (!doc) {
				ui.notifications.warn('Could not load dropped actor');
				return;
			}
			
			// Must be an Actor
			if (!(doc instanceof Actor)) {
				ui.notifications.warn('Only actors can be dropped here');
				return;
			}
			
			// Update the profile display
			const $profile = $(this).closest('.sdx-summon-profile');
			const creatureName = doc.name;
			const creatureImg = doc.img || doc.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
			const creatureUuid = doc.uuid;
			
			// Update hidden inputs
			$profile.find('.sdx-creature-uuid').val(creatureUuid);
			$profile.find('.sdx-creature-name').val(creatureName);
			$profile.find('.sdx-creature-img').val(creatureImg);
			
			// Update display
			$(this).html(`
				<div class="sdx-summon-creature-display" data-uuid="${creatureUuid}">
					<img src="${creatureImg}" alt="${creatureName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${creatureName}</span>
				</div>
			`);
			
			updateSummonsData();
			ui.notifications.info(`Added ${creatureName} to summon profile`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling creature drop:`, err);
			ui.notifications.error('Failed to add creature');
		}
	});
	
	// Function to collect and save summons data
	function updateSummonsData() {
		const profiles = [];
		html.find('.sdx-summon-profile').each(function() {
			const $profile = $(this);
			profiles.push({
				creatureUuid: $profile.find('.sdx-creature-uuid').val(),
				creatureName: $profile.find('.sdx-creature-name').val(),
				creatureImg: $profile.find('.sdx-creature-img').val(),
				count: $profile.find('.sdx-summon-count').val() || '1',
				displayName: $profile.find('.sdx-summon-display-name').val() || ''
			});
		});
		
		// Update hidden input
		html.find('.sdx-summons-data').val(JSON.stringify(profiles));
		
		// Save to item
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		const $list = $(this).closest('.sdx-item-give-content').find('.sdx-item-give-list');
		const index = $list.find('.sdx-item-give-profile').length;
		const newProfile = {
			itemUuid: '',
			itemName: '',
			itemImg: '',
			quantity: '1'
		};
		$list.find('.sdx-no-items').remove();
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function(e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}
			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}
			if (!(doc instanceof Item)) {
				ui.notifications.warn('Only items can be dropped here');
				return;
			}
			const $profile = $(this).closest('.sdx-item-give-profile');
			const itemName = doc.name;
			const itemImg = doc.img || 'icons/svg/mystery-man.svg';
			const itemUuid = doc.uuid;
			$profile.find('.sdx-item-give-uuid').val(itemUuid);
			$profile.find('.sdx-item-give-name').val(itemName);
			$profile.find('.sdx-item-give-img').val(itemImg);
			$(this).html(`
				<div class="sdx-item-give-display" data-uuid="${itemUuid}">
					<img src="${itemImg}" alt="${itemName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${itemName}</span>
				</div>
			`);
			updateItemGiveData();
			ui.notifications.info(`Added ${itemName} to caster item list`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling item drop:`, err);
			ui.notifications.error('Failed to add item');
		}
	});

	function updateItemGiveData() {
		const profiles = [];
		html.find('.sdx-item-give-profile').each(function(idx) {
			const $profile = $(this);
			$profile.attr('data-index', idx);
			$profile.find('.sdx-remove-item-give-btn').attr('data-index', idx);
			profiles.push({
				itemUuid: $profile.find('.sdx-item-give-uuid').val(),
				itemName: $profile.find('.sdx-item-give-name').val(),
				itemImg: $profile.find('.sdx-item-give-img').val(),
				quantity: $profile.find('.sdx-item-give-quantity').val() || '1'
			});
		});
		const $list = html.find('.sdx-item-give-list');
		if (profiles.length === 0) {
			$list.html('<div class="sdx-no-items">Drop an item here to grant it to the caster on success</div>');
		} else {
			$list.find('.sdx-no-items').remove();
		}
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	console.log(`${MODULE_ID} | Scroll sheet enhanced for`, item.name);
}

/**
 * Enhance Wand item sheets with damage/heal and conditions UI
 */
async function enhanceWandSheet(app, html) {
	// Check if spell enhancement is enabled (reuse spell enhancement setting)
	try {
		if (!game.settings.get(MODULE_ID, "enhanceSpells")) return;
	} catch {
		return;
	}

	// Only enhance Wand items
	const item = app.item;
	if (!item || item.type !== "Wand") return;

	console.log(`${MODULE_ID} | Enhancing wand sheet for`, item.name);

	// Remove any existing damage/heal boxes to prevent duplicates
	html.find('.sdx-spell-damage-box').remove();

	// Initialize flags if they don't exist
	const spellDamageFlags = item.flags?.[MODULE_ID]?.spellDamage || {
		enabled: false,
		isDamage: true,
		numDice: 1,
		dieType: "d6",
		bonus: 0,
		damageType: "",
		scaling: "none",
		scalingDice: 0,
		formula: "",
		damageRequirement: "",
		damageRequirementFailAction: "zero",
		effectsRequirement: "",
		effects: [],
		applyToTarget: true,
		effectsApplyToTarget: true
	};
	
	// Initialize summoning flags
	const summoningFlags = item.flags?.[MODULE_ID]?.summoning || {
		enabled: false,
		profiles: []
	};
	
	// Initialize item give flags
	const itemGiveFlags = item.flags?.[MODULE_ID]?.itemGive || {
		enabled: false,
		profiles: []
	};
	
	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags
	};
	
	const applyToTarget = flags.applyToTarget === "false" ? false : (flags.applyToTarget === false ? false : true);
	const effectsApplyToTarget = flags.effectsApplyToTarget === "false" ? false : (flags.effectsApplyToTarget === false ? false : true);

	// Preserve active tab across re-renders
	if (!app._shadowdarkExtrasActiveTab) {
		app._shadowdarkExtrasActiveTab = 'tab-details'; // Default to details
	}
	
	// Check which tab is currently active
	const $currentActiveTab = html.find('nav.SD-nav a.navigation-tab.active');
	if ($currentActiveTab.length) {
		const currentTab = $currentActiveTab.data('tab');
		if (currentTab) {
			app._shadowdarkExtrasActiveTab = currentTab;
		}
	}

	// Create a new "Activity" tab after Details tab
	const $tabs = html.find('nav.SD-nav');
	
	// Check if Activity tab already exists
	if (!html.find('section[data-tab="tab-activity"]').length) {
		// Add Activity tab to navigation (after Details)
		const activityTabLink = `<a class="navigation-tab" data-tab="tab-activity">Activity</a>`;
		const $detailsLink = $tabs.find('a[data-tab="tab-details"]');
		if ($detailsLink.length) {
			$detailsLink.after(activityTabLink);
			console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}
		
		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}
		
		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function() {
			const tabName = $(this).data('tab');
			if (tabName) {
				app._shadowdarkExtrasActiveTab = tabName;
			}
		});
	}
	
	// Restore the previously active tab
	setTimeout(() => {
		const $targetTab = $tabs.find(`a.navigation-tab[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		const $targetSection = html.find(`section[data-tab="${app._shadowdarkExtrasActiveTab}"]`);
		
		if ($targetTab.length && $targetSection.length) {
			// Remove active class from all tabs
			$tabs.find('a.navigation-tab').removeClass('active');
			html.find('section[data-group="primary"]').removeClass('active');
			
			// Add active class to target tab
			$targetTab.addClass('active');
			$targetSection.addClass('active');
		}
	}, 0);
	
	// Find the Activity tab content
	const $activityTab = html.find('section.tab-activity[data-tab="tab-activity"]');
	if (!$activityTab.length) {
		console.warn(`${MODULE_ID} | Activity tab not found in wand sheet`);
		return;
	}

	console.log(`${MODULE_ID} | Activity tab found/created`);

	let effectsListHtml = '';
	let effectsArray = flags.effects || [];
	if (typeof effectsArray === 'string') {
		try {
			effectsArray = JSON.parse(effectsArray);
		} catch (err) {
			effectsArray = [];
		}
	}
	
	// Normalize effects array - convert old UUID strings to new object format
	effectsArray = effectsArray.map(effect => {
		if (typeof effect === 'string') {
			return { uuid: effect, duration: {} };
		}
		return effect;
	});
	
	if (effectsArray && effectsArray.length > 0) {
		const effectPromises = effectsArray.map(effect => fromUuid(effect.uuid || effect));
		const effectDocs = await Promise.all(effectPromises);
		
		for (let i = 0; i < effectDocs.length; i++) {
			const doc = effectDocs[i];
			const effectData = effectsArray[i];
			const uuid = effectData.uuid || effectData;
			const duration = effectData.duration || {};
			
			if (doc) {
				effectsListHtml += `
					<div class="sdx-spell-effect-item" data-uuid="${uuid}" data-effect-index="${i}">
						<div class="sdx-effect-header">
							<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
							<span class="sdx-effect-name">${doc.name}</span>
							<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
						</div>
						<div class="sdx-effect-duration-override">
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Seconds</label>
									<input type="number" class="sdx-duration-input" data-field="seconds" value="${duration.seconds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Time</label>
									<input type="number" class="sdx-duration-input" data-field="startTime" value="${duration.startTime || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Rounds</label>
									<input type="number" class="sdx-duration-input" data-field="rounds" value="${duration.rounds || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Turns</label>
									<input type="number" class="sdx-duration-input" data-field="turns" value="${duration.turns || ''}" placeholder="Default" />
								</div>
							</div>
							<div class="sdx-duration-row">
								<div class="sdx-duration-field">
									<label>Start Round</label>
									<input type="number" class="sdx-duration-input" data-field="startRound" value="${duration.startRound || ''}" placeholder="Default" />
								</div>
								<div class="sdx-duration-field">
									<label>Start Turn</label>
									<input type="number" class="sdx-duration-input" data-field="startTurn" value="${duration.startTurn || ''}" placeholder="Default" />
								</div>
							</div>
						</div>
					</div>
				`;
			}
		}
	}

	// Build summons list HTML
	let summonsList = '';
	let summonProfilesArray = summoningFlags.profiles || [];
	
	// Handle case where profiles might be a string
	if (typeof summonProfilesArray === 'string') {
		try {
			summonProfilesArray = JSON.parse(summonProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse summon profiles string:`, summonProfilesArray, err);
			summonProfilesArray = [];
		}
	}
	
	if (summonProfilesArray && summonProfilesArray.length > 0) {
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		for (let i = 0; i < summonProfilesArray.length; i++) {
			const profile = summonProfilesArray[i];
			summonsList += generateSummonProfileHTML(profile, i);
		}
	}

	let itemGiveList = '';
	let itemGiveProfilesArray = itemGiveFlags.profiles || [];

	if (typeof itemGiveProfilesArray === 'string') {
		try {
			itemGiveProfilesArray = JSON.parse(itemGiveProfilesArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse item give profiles string:`, itemGiveProfilesArray, err);
			itemGiveProfilesArray = [];
		}
	}

	if (itemGiveProfilesArray && itemGiveProfilesArray.length > 0) {
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		for (let i = 0; i < itemGiveProfilesArray.length; i++) {
			const profile = itemGiveProfilesArray[i];
			itemGiveList += generateItemGiveProfileHTML(profile, i);
		}
	}

	const damageHealHtml = generateWandConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray);

	// Insert into Activity tab
	$activityTab.append(damageHealHtml);
	console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function(e) {
		e.stopPropagation(); // Prevent event from bubbling up to form auto-submit
		
		// Manually update the item without re-rendering
		const fieldName = $(this).attr('name');
		if (fieldName) {
			let value = $(this).val();
			
			// Handle checkboxes
			if ($(this).attr('type') === 'checkbox') {
				value = $(this).is(':checked');
			}
			// Handle radio buttons
			else if ($(this).attr('type') === 'radio' && !$(this).is(':checked')) {
				return; // Don't update for unchecked radios
			}
			// Handle number inputs
			else if ($(this).attr('type') === 'number') {
				value = parseFloat(value) || 0;
			}
			
			const updateData = {};
			updateData[fieldName] = value;
			
			// Update without re-rendering
			item.update(updateData, { render: false }).then(() => {
				console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	html.find('.sdx-spell-damage-toggle').on('change', function() {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function() {
		const selectedType = $(this).val();
		const $box = $(this).closest('.sdx-spell-damage-box');
		
		// Hide all formula sections
		$box.find('.sdx-formula-section').hide();
		
		// Show the selected formula section
		if (selectedType === 'basic') {
			$box.find('.sdx-basic-formula').show();
		} else if (selectedType === 'formula') {
			$box.find('.sdx-custom-formula').show();
		} else if (selectedType === 'tiered') {
			$box.find('.sdx-tiered-formula').show();
		}
		
		// Save the formula type preference
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.formulaType`] = selectedType;
		item.update(updateData, { render: false });
	});

	const $dropArea = html.find('.sdx-spell-effects-drop-area');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function() {
			const $item = $(this);
			const uuid = $item.data('uuid');
			
			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function() {
				const field = $(this).data('field');
				const value = $(this).val();
				if (value && value.trim() !== '') {
					duration[field] = parseFloat(value);
				}
			});
			
			effects.push({ uuid, duration });
		});
		$effectsData.val(JSON.stringify(effects));
		
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effects`] = effects;
		item.update(updateData);
		
		if (effects.length > 0) {
			$effectsList.find('.sdx-no-effects').remove();
		} else if ($effectsList.find('.sdx-spell-effect-item').length === 0) {
			$effectsList.html('<div class="sdx-no-effects">Drag and drop conditions or effects here</div>');
		}
	}

	$dropArea.on('dragover', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	$dropArea.on('dragleave', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	$dropArea.on('drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');

		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}

			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}

			const validTypes = ['Effect', 'Condition', 'NPC Feature'];
			if (!validTypes.includes(doc.type)) {
				ui.notifications.warn(`Only Effect, Condition, or NPC Feature items can be dropped here`);
				return;
			}

			const uuid = doc.uuid;
			if ($effectsList.find(`[data-uuid="${uuid}"]`).length > 0) {
				ui.notifications.info(`${doc.name} is already in the effects list`);
				return;
			}

			const effectHtml = `
				<div class="sdx-spell-effect-item" data-uuid="${uuid}">
					<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
					<span>${doc.name}</span>
					<a class="sdx-remove-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
				</div>
			`;
			
			$effectsList.find('.sdx-no-effects').remove();
			$effectsList.append(effectHtml);
			updateEffectsData();

			ui.notifications.info(`Added ${doc.name} to wand effects`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling drop:`, err);
			ui.notifications.error('Failed to add effect');
		}
	});

	html.on('click', '.sdx-remove-effect', function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function() {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;
		item.update(updateData);
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summon-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.find('.sdx-no-summons').remove();
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function(e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});
	
	html.on('dragleave', '.sdx-summon-creature-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});
	
	html.on('drop', '.sdx-summon-creature-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			
			// Get the document from the dropped data
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Actor' && data.id) {
				// Handle actors from compendiums or world
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.actors.get(data.id);
				}
			}
			
			if (!doc) {
				ui.notifications.warn('Could not load dropped actor');
				return;
			}
			
			// Must be an Actor
			if (!(doc instanceof Actor)) {
				ui.notifications.warn('Only actors can be dropped here');
				return;
			}
			
			// Update the profile display
			const $profile = $(this).closest('.sdx-summon-profile');
			const creatureName = doc.name;
			const creatureImg = doc.img || doc.prototypeToken?.texture?.src || 'icons/svg/mystery-man.svg';
			const creatureUuid = doc.uuid;
			
			// Update hidden inputs
			$profile.find('.sdx-creature-uuid').val(creatureUuid);
			$profile.find('.sdx-creature-name').val(creatureName);
			$profile.find('.sdx-creature-img').val(creatureImg);
			
			// Update display
			$(this).html(`
				<div class="sdx-summon-creature-display" data-uuid="${creatureUuid}">
					<img src="${creatureImg}" alt="${creatureName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${creatureName}</span>
				</div>
			`);
			
			updateSummonsData();
			ui.notifications.info(`Added ${creatureName} to summon profile`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling creature drop:`, err);
			ui.notifications.error('Failed to add creature');
		}
	});
	
	// Function to collect and save summons data
	function updateSummonsData() {
		const profiles = [];
		html.find('.sdx-summon-profile').each(function() {
			const $profile = $(this);
			profiles.push({
				creatureUuid: $profile.find('.sdx-creature-uuid').val(),
				creatureName: $profile.find('.sdx-creature-name').val(),
				creatureImg: $profile.find('.sdx-creature-img').val(),
				count: $profile.find('.sdx-summon-count').val() || '1',
				displayName: $profile.find('.sdx-summon-display-name').val() || ''
			});
		});
		
		// Update hidden input
		html.find('.sdx-summons-data').val(JSON.stringify(profiles));
		
		// Save to item
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function(e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function(e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateItemGiveProfileHTML } = await import(`./templates/ItemGiveConfig.mjs`);
		const $list = $(this).closest('.sdx-item-give-content').find('.sdx-item-give-list');
		const index = $list.find('.sdx-item-give-profile').length;
		const newProfile = {
			itemUuid: '',
			itemName: '',
			itemImg: '',
			quantity: '1'
		};
		$list.find('.sdx-no-items').remove();
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function(e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function(e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function(event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
		try {
			const data = JSON.parse(event.originalEvent.dataTransfer.getData('text/plain'));
			let doc = null;
			if (data.uuid) {
				doc = await fromUuid(data.uuid);
			} else if (data.type === 'Item' && data.id) {
				if (data.pack) {
					const pack = game.packs.get(data.pack);
					doc = await pack.getDocument(data.id);
				} else {
					doc = game.items.get(data.id);
				}
			}
			if (!doc) {
				ui.notifications.warn('Could not load dropped item');
				return;
			}
			if (!(doc instanceof Item)) {
				ui.notifications.warn('Only items can be dropped here');
				return;
			}
			const $profile = $(this).closest('.sdx-item-give-profile');
			const itemName = doc.name;
			const itemImg = doc.img || 'icons/svg/mystery-man.svg';
			const itemUuid = doc.uuid;
			$profile.find('.sdx-item-give-uuid').val(itemUuid);
			$profile.find('.sdx-item-give-name').val(itemName);
			$profile.find('.sdx-item-give-img').val(itemImg);
			$(this).html(`
				<div class="sdx-item-give-display" data-uuid="${itemUuid}">
					<img src="${itemImg}" alt="${itemName}" style="width: 40px; height: 40px; border-radius: 4px;" />
					<span style="margin-left: 4px; font-size: 0.9em;">${itemName}</span>
				</div>
			`);
			updateItemGiveData();
			ui.notifications.info(`Added ${itemName} to caster item list`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling item drop:`, err);
			ui.notifications.error('Failed to add item');
		}
	});

	function updateItemGiveData() {
		const profiles = [];
		html.find('.sdx-item-give-profile').each(function(idx) {
			const $profile = $(this);
			$profile.attr('data-index', idx);
			$profile.find('.sdx-remove-item-give-btn').attr('data-index', idx);
			profiles.push({
				itemUuid: $profile.find('.sdx-item-give-uuid').val(),
				itemName: $profile.find('.sdx-item-give-name').val(),
				itemImg: $profile.find('.sdx-item-give-img').val(),
				quantity: $profile.find('.sdx-item-give-quantity').val() || '1'
			});
		});
		const $list = html.find('.sdx-item-give-list');
		if (profiles.length === 0) {
			$list.html('<div class="sdx-no-items">Drop an item here to grant it to the caster on success</div>');
		} else {
			$list.find('.sdx-no-items').remove();
		}
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	console.log(`${MODULE_ID} | Wand sheet enhanced for`, item.name);
}

// Inject container UI into Basic item sheets
Hooks.on("renderItemSheet", (app, html, data) => {
	try {
		injectBasicContainerUI(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject Basic item container UI`, err);
	}

	try {
		injectUnidentifiedCheckbox(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject unidentified checkbox`, err);
	}

	try {
		maskUnidentifiedItemSheet(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to mask unidentified item sheet`, err);
	}

	try {
		enhanceSpellSheet(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to enhance spell sheet`, err);
	}

	try {
		enhancePotionSheet(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to enhance potion sheet`, err);
	}

	try {
		enhanceScrollSheet(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to enhance scroll sheet`, err);
	}

	try {
		enhanceWandSheet(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to enhance wand sheet`, err);
	}

	// Inject weapon bonus tab
	try {
		const item = app.item || app.document;
		if (item?.type === "Weapon") {
			injectWeaponBonusTab(app, html, item);
		}
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject weapon bonus tab`, err);
	}

	// Hide already-rendered Effects tab elements for non-GM players viewing unidentified items
	try {
		const item = app?.item;
		if (item && isUnidentified(item) && !game.user?.isGM) {
			html.find('a[data-tab="tab-effects"]').remove();
			html.find('.tab[data-tab="tab-effects"]').remove();
		}
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to hide effects tab`, err);
	}
});

// Convert string values to booleans for spell damage flags
Hooks.on("preUpdateItem", (item, updateData, options, userId) => {
	// Check if we're updating spell damage applyToTarget
	const applyToTargetPath = `flags.${MODULE_ID}.spellDamage.applyToTarget`;
	if (foundry.utils.hasProperty(updateData, applyToTargetPath)) {
		const value = foundry.utils.getProperty(updateData, applyToTargetPath);
		// Convert string to boolean
		if (value === "true" || value === true) {
			foundry.utils.setProperty(updateData, applyToTargetPath, true);
		} else if (value === "false" || value === false) {
			foundry.utils.setProperty(updateData, applyToTargetPath, false);
		}
	}
	
	// Check if we're updating spell effectsApplyToTarget
	const effectsApplyToTargetPath = `flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`;
	if (foundry.utils.hasProperty(updateData, effectsApplyToTargetPath)) {
		const value = foundry.utils.getProperty(updateData, effectsApplyToTargetPath);
		// Convert string to boolean
		if (value === "true" || value === true) {
			foundry.utils.setProperty(updateData, effectsApplyToTargetPath, true);
		} else if (value === "false" || value === false) {
			foundry.utils.setProperty(updateData, effectsApplyToTargetPath, false);
		}
	}
});

// Mask unidentified item names in chat messages (attack rolls, item cards, etc.)
Hooks.on("renderChatMessage", (message, html, data) => {
	// Check if unidentified items are enabled (with guard for setting not yet registered)
	try {
		if (!game.settings.get(MODULE_ID, "enableUnidentified")) return;
	} catch {
		return; // Setting not registered yet
	}

	if (game.user?.isGM) return; // GM sees real names

	// Check if this is an item-related chat card
	const $card = html.find('.item-card, .chat-card');
	if (!$card.length) return;

	// Get the item from the message flags or data attributes
	const actorId = $card.data('actorId') ?? message.speaker?.actor;
	const itemId = $card.data('itemId');
	
	if (!actorId || !itemId) return;

	const actor = game.actors.get(actorId);
	if (!actor) return;

	const item = actor.items.get(itemId);
	if (!item || !isUnidentified(item)) return;

	const maskedName = getUnidentifiedName(item);
	const realName = item._source?.name || item.name;

	// Mask the message flavor text (appears above the card, e.g., "Attack roll with Boomerang")
	html.find('.flavor-text, .message-header .flavor, .message-content > p').each((_, el) => {
		const $el = $(el);
		let text = $el.text();
		if (text.includes(realName)) {
			$el.text(text.replaceAll(realName, maskedName));
		}
	});

	// Mask the item name in the header
	$card.find('.card-header h3.item-name, .card-header .item-name').text(maskedName);
	
	// Mask the item name in header tooltip
	$card.find('.card-header img[data-tooltip]').attr('data-tooltip', maskedName);

	// Mask any other references to the item name in the card content
	// The attack title shows the weapon name (comes from options.flavor which uses data.item.name)
	$card.find('.card-attack-roll h3').each((_, el) => {
		const $h3 = $(el);
		let text = $h3.text();
		// Replace the item's real name if it appears
		if (text.includes(realName)) {
			$h3.text(text.replaceAll(realName, maskedName));
		}
	});

	// Also mask in general text elements that might show the name
	$card.find('h3, span, p, li').each((_, el) => {
		const $el = $(el);
		// Skip if it's the main item name we already handled
		if ($el.hasClass('item-name')) return;
		let text = $el.text();
		if (text.includes(realName)) {
			// Check if this element has child elements - if so only modify text nodes
			if ($el.children().length > 0) {
				$el.contents().each(function() {
					if (this.nodeType === Node.TEXT_NODE && this.textContent.includes(realName)) {
						this.textContent = this.textContent.replaceAll(realName, maskedName);
					}
				});
			} else {
				$el.text(text.replaceAll(realName, maskedName));
			}
		}
	});

	// Hide the description for unidentified items
	$card.find('.card-content').html('');
});

// Store original user's targets in chat message flags (for damage cards)
Hooks.on("preCreateChatMessage", (message, data, options, userId) => {
	try {
		// Get current user's targets
		const targets = Array.from(game.user.targets || []);
		if (targets.length > 0) {
			// Store target token IDs in message flags
			const targetIds = targets.map(t => t.id);
			message.updateSource({
				"flags.shadowdark-extras.targetIds": targetIds
			});
			console.log(`${MODULE_ID} | Stored ${targetIds.length} targets in message flags:`, targetIds);
		}
		
		// Store item configuration for consumables (scrolls, potions, wands)
		// This is needed because these items are consumed and removed from the actor
		// before the chat message is processed
		const content = message.content || '';
		const actorIdMatch = content.match(/data-actor-id="([^"]+)"/);
		const itemIdMatch = content.match(/data-item-id="([^"]+)"/);
		
		if (actorIdMatch && itemIdMatch) {
			const actorId = actorIdMatch[1];
			const itemId = itemIdMatch[1];
			const actor = game.actors.get(actorId);
			const item = actor?.items.get(itemId);
			
			if (item && ["Scroll", "Potion", "Wand"].includes(item.type)) {
				// Store the item type and relevant configurations
				const itemConfig = {
					type: item.type,
					name: item.name
				};
				
				// Store summoning config if it exists
				if (item.flags?.[MODULE_ID]?.summoning) {
					itemConfig.summoning = foundry.utils.duplicate(item.flags[MODULE_ID].summoning);
				}
				
				// Store itemGive config if it exists
				if (item.flags?.[MODULE_ID]?.itemGive) {
					itemConfig.itemGive = foundry.utils.duplicate(item.flags[MODULE_ID].itemGive);
				}
				
				message.updateSource({
					"flags.shadowdark-extras.itemConfig": itemConfig
				});
				
				console.log(`${MODULE_ID} | Stored item config for ${item.name}:`, itemConfig);
			}
		}
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to store data in message`, err);
	}
});

// Inject damage card into chat messages
Hooks.on("renderChatMessage", (message, html, data) => {
	try {
		injectDamageCard(message, html, data);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject damage card`, err);
	}
	
	// Also process weapon bonuses for weapon attack messages
	try {
		processWeaponBonuses(message, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to process weapon bonuses`, err);
	}
});

/**
 * Process weapon bonuses for a chat message
 */
async function processWeaponBonuses(message, html) {
	// Check if this is a weapon attack roll
	const flags = message.flags?.shadowdark;
	if (!flags?.itemId) return;
	
	// Get the actor and item
	const actor = game.actors.get(message.speaker?.actor) || canvas.tokens.get(message.speaker?.token)?.actor;
	if (!actor) return;
	
	const item = actor.items.get(flags.itemId);
	if (!item || item.type !== "Weapon") return;
	
	// Check if weapon has bonuses configured
	const bonusFlags = item.flags?.[MODULE_ID]?.weaponBonus;
	if (!bonusFlags?.enabled) return;
	
	// Check if this was a critical hit
	const isCritical = message.rolls?.some(r => {
		const d20Roll = r.terms?.find(t => t.faces === 20);
		return d20Roll?.total === 20;
	});
	
	// Try to get the target
	const targetToken = message.flags?.shadowdark?.targetToken
		? canvas.tokens.get(message.flags.shadowdark.targetToken)
		: game.user.targets.first();
	const target = targetToken?.actor;
	
	// Inject the weapon bonus display
	await injectWeaponBonusDisplay(message, html, item, actor, target, isCritical);
}

// Wrap ItemSheet getData to modify context before rendering
Hooks.once("ready", () => {
	if (!globalThis.ItemSheet?.prototype?.getData) return;
	
	const originalGetData = globalThis.ItemSheet.prototype.getData;
	globalThis.ItemSheet.prototype.getData = async function(options = {}) {
		const data = await originalGetData.call(this, options);
		
		// Hide magicItem property for unidentified items for non-GM players
		const item = this?.item;
		if (item && isUnidentified(item) && !game.user?.isGM && data?.system) {
			// Deep clone the system data to avoid mutating the original
			data.system = foundry.utils.duplicate(data.system);
			data.system.magicItem = false;
		}
		
		return data;
	};
	
	// CRITICAL FIX: Wrap Shadowdark's createItemFromSpell to preserve our spell damage flags
	// The system's function only copies type/name/system/img, stripping all flags
	if (globalThis.shadowdark?.utils?.createItemFromSpell) {
		const originalCreateItemFromSpell = globalThis.shadowdark.utils.createItemFromSpell;
		
		globalThis.shadowdark.utils.createItemFromSpell = async function(type, spell) {
			// Call the original function to get the base item data
			const itemData = await originalCreateItemFromSpell.call(this, type, spell);
			
			// Initialize flags object if needed
			itemData.flags = itemData.flags || {};
			itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};
			
			// Preserve spell damage configuration flags
			if (spell.flags?.[MODULE_ID]?.spellDamage) {
				itemData.flags[MODULE_ID].spellDamage = foundry.utils.duplicate(spell.flags[MODULE_ID].spellDamage);
				console.log(`${MODULE_ID} | Preserved spell damage flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].spellDamage);
			}
			
			// Preserve summoning configuration flags
			if (spell.flags?.[MODULE_ID]?.summoning) {
				itemData.flags[MODULE_ID].summoning = foundry.utils.duplicate(spell.flags[MODULE_ID].summoning);
				console.log(`${MODULE_ID} | Preserved summoning flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].summoning);
			}
			
			// Preserve item give configuration flags
			if (spell.flags?.[MODULE_ID]?.itemGive) {
				itemData.flags[MODULE_ID].itemGive = foundry.utils.duplicate(spell.flags[MODULE_ID].itemGive);
				console.log(`${MODULE_ID} | Preserved item give flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].itemGive);
			}
			
			// Preserve unidentified flags
			if (spell.flags?.[MODULE_ID]?.unidentified) {
				itemData.flags[MODULE_ID].unidentified = spell.flags[MODULE_ID].unidentified;
				itemData.flags[MODULE_ID].unidentifiedDescription = spell.flags[MODULE_ID].unidentifiedDescription || "";
			}
			
			return itemData;
		};
		
		console.log(`${MODULE_ID} | Wrapped shadowdark.utils.createItemFromSpell to preserve spell flags`);
	}
});

// Keep container slot values in sync when contained items change
Hooks.on("updateItem", async (item, changes, options, userId) => {
	if (options?.sdxInternal) return;
	
	// Only the user who made the update should process it
	if (userId !== game.user.id) return;
	
	const actor = item?.parent;

	// If the unidentified flag changed, re-render the actor sheet
	if (changes?.flags?.[MODULE_ID]?.unidentified !== undefined && actor) {
		for (const app of Object.values(ui.windows)) {
			if (app.actor?.id === actor.id) {
				app.render();
			}
		}
	}

	if (!actor) return;

	// Skip recomputing if a container is currently being unpacked (prevents double-unpacking)
	const unpackKey = `${actor.id}-${item.id}`;
	if (_containersBeingUnpacked.has(unpackKey)) return;

	// If this item is inside a container, recompute that container (but skip sync during unpack)
	const containerId = item.getFlag(MODULE_ID, "containerId");
	if (containerId) {
		const containerUnpackKey = `${actor.id}-${containerId}`;
		const skipSync = _containersBeingUnpacked.has(containerUnpackKey);
		const container = actor.items.get(containerId);
		if (container) await recomputeContainerSlots(container, { skipSync });
		return;
	}

	// If the updated item is a container, recompute in case its contents changed.
	if (isContainerItem(item)) {
		await recomputeContainerSlots(item);
	}
});

// Unpack container contents when a container item is created on an actor (e.g., drag/drop transfer)
Hooks.on("createItem", async (item, options, userId) => {
	if (options?.sdxInternal) return;
	
	// CRITICAL: Only the user who created the item should unpack it.
	// This prevents multi-client duplication where all connected clients try to unpack.
	if (userId !== game.user.id) return;
	
	const actor = item?.parent;
	if (!actor) return;
	if (!isContainerItem(item)) return;

	// Item Piles actors should not have embedded contained items (they show up as separate loot).
	// Keep contents packed on the container item and only unpack when moved to a normal actor.
	if (isItemPilesEnabledActor(actor)) return;

	// Check if this container has already been unpacked (persisted flag on the item)
	// This is more reliable than checking embedded items which might not be synced yet
	if (item.getFlag(MODULE_ID, "containerUnpackedOnActor") === actor.id) return;

	// Use a unique key for this specific container instance to prevent race conditions
	const unpackKey = `${actor.id}-${item.id}`;
	if (_containersBeingUnpacked.has(unpackKey)) return;

	// Skip if contained items already exist for this container (e.g., from explicit transfer)
	const existing = actor.items.filter(i => i.getFlag(MODULE_ID, "containerId") === item.id);
	if (existing.length > 0) {
		// Items exist but containerUnpackedOnActor might not be set - set it now to prevent issues
		if (!item.getFlag(MODULE_ID, "containerUnpackedOnActor")) {
			await item.setFlag(MODULE_ID, "containerUnpackedOnActor", actor.id);
		}
		return;
	}

	const packed = item.getFlag(MODULE_ID, "containerPackedItems");
	if (!Array.isArray(packed) || packed.length === 0) {
		// No packed items, but ensure containerUnpackedOnActor is set to prevent future issues
		if (!item.getFlag(MODULE_ID, "containerUnpackedOnActor")) {
			await item.setFlag(MODULE_ID, "containerUnpackedOnActor", actor.id);
		}
		return;
	}

	// Mark as being unpacked SYNCHRONOUSLY before any async operations
	_containersBeingUnpacked.add(unpackKey);

	try {
		const toCreate = packed.map(d => {
			const data = foundry.utils.duplicate(d);
			delete data._id;
			data.flags = data.flags ?? {};
			data.flags[MODULE_ID] = data.flags[MODULE_ID] ?? {};
			data.flags[MODULE_ID].containerId = item.id;
			data.system = data.system ?? {};
			data.system.isPhysical = false;
			if (data.flags[MODULE_ID].containerOrigIsPhysical === undefined) data.flags[MODULE_ID].containerOrigIsPhysical = true;
			return data;
		});

		await actor.createEmbeddedDocuments("Item", toCreate, { sdxInternal: true });
		
		// Mark this container as unpacked on this actor (persisted to database)
		// This prevents any other client from trying to unpack it again
		await item.setFlag(MODULE_ID, "containerUnpackedOnActor", actor.id);
		
		// Update the slot count directly
		const base = item.getFlag(MODULE_ID, "containerBaseSlots") || {};
		const baseSlotsUsed = Number(base.slots_used ?? 1) || 1;
		let containedSlots = 0;
		for (const d of packed) containedSlots += calculateSlotsCostForItemData(d);
		const coins = item.getFlag(MODULE_ID, "containerCoins") || {};
		const totalGPValue = (Number(coins.gp ?? 0)) + (Number(coins.sp ?? 0) / 10) + (Number(coins.cp ?? 0) / 100);
		containedSlots += Math.floor(totalGPValue / 100);
		const nextSlotsUsed = Math.max(baseSlotsUsed, containedSlots);
		
		await item.update({
			"system.slots.slots_used": nextSlotsUsed,
		}, { sdxInternal: true });
	} finally {
		// Keep the lock active for a bit longer to let any triggered hooks complete
		// Then clear containerPackedItems to prevent any future sync from re-populating
		setTimeout(async () => {
			_containersBeingUnpacked.delete(unpackKey);
			// Clear packed items after everything has settled
			try {
				const currentItem = actor.items.get(item.id);
				if (currentItem) {
					await currentItem.setFlag(MODULE_ID, "containerPackedItems", []);
				}
			} catch (e) {
				// Ignore errors
			}
		}, 100);
	}
});

// Release contained items BEFORE a container is deleted
Hooks.on("preDeleteItem", async (item, options, userId) => {
	if (options?.sdxInternal) return;
	
	// Only the user who deleted the item should release contained items
	if (userId !== game.user.id) return;
	
	const actor = item?.parent;
	if (!actor) return;

	// If a container item is being deleted, release all items that were inside it
	// (make them visible again in inventory) BEFORE the container is gone
	if (item.getFlag(MODULE_ID, "isContainer")) {
		const containedIds = [];
		for (const i of actor.items) {
			if (i.getFlag(MODULE_ID, "containerId") === item.id) {
				containedIds.push(i.id);
			}
		}
		
		if (containedIds.length > 0) {
			// Batch update all contained items to release them
			const updates = containedIds.map(id => {
				const child = actor.items.get(id);
				if (!child) return null;
				const restorePhysical = child.getFlag(MODULE_ID, "containerOrigIsPhysical");
				return {
					_id: id,
					"system.isPhysical": (restorePhysical === undefined) ? true : Boolean(restorePhysical),
					[`flags.${MODULE_ID}.containerId`]: null,
					[`flags.${MODULE_ID}.containerOrigIsPhysical`]: null,
				};
			}).filter(u => u !== null);
			
			if (updates.length > 0) {
				try {
					await actor.updateEmbeddedDocuments("Item", updates, { sdxInternal: true });
				} catch (e) {
					console.warn(`${MODULE_ID} | Could not release contained items`, e);
				}
			}
		}
	}
});

Hooks.on("deleteItem", async (item, options, userId) => {
	if (options?.sdxInternal) return;
	
	// Only the user who deleted the item should update container slots
	if (userId !== game.user.id) return;
	
	const actor = item?.parent;
	if (!actor) return;

	// If a contained item was deleted, update its container slots.
	const containerId = item.getFlag(MODULE_ID, "containerId");
	if (containerId) {
		const container = actor.items.get(containerId);
		if (container) await recomputeContainerSlots(container);
	}
});

// Handle updates when the sheet is submitted
Hooks.on("preUpdateActor", (actor, changes, options, userId) => {
	// Check if renown flag is being updated via the sheet
	if (changes.flags?.[MODULE_ID]?.renown !== undefined) {
		const renownMax = game.settings.get(MODULE_ID, "renownMaximum");
		let value = parseInt(changes.flags[MODULE_ID].renown) || 0;
		// Only enforce maximum, allow negative values
		value = Math.min(value, renownMax);
		changes.flags[MODULE_ID].renown = value;
	}
	
	// Validate NPC coins
	if (changes.flags?.[MODULE_ID]?.coins) {
		const coins = changes.flags[MODULE_ID].coins;
		if (coins.gp !== undefined) coins.gp = Math.max(0, parseInt(coins.gp) || 0);
		if (coins.sp !== undefined) coins.sp = Math.max(0, parseInt(coins.sp) || 0);
		if (coins.cp !== undefined) coins.cp = Math.max(0, parseInt(coins.cp) || 0);
	}
});

// Re-render party sheets when a member actor is updated
Hooks.on("updateActor", (actor, changes, options, userId) => {
	// If a Player actor was updated, check if they're in any parties and re-render those sheets
	if (actor.type !== "Player") return;
	
	// Find all open party sheets that contain this actor as a member
	for (const app of Object.values(ui.windows)) {
		if (app instanceof PartySheetSD) {
			const memberIds = app.memberIds;
			if (memberIds.includes(actor.id)) {
				app.render();
			}
		}
	}
});

// Re-render party sheets when items are updated on member actors
Hooks.on("updateItem", (item, changes, options, userId) => {
	const actor = item.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Find all open party sheets that contain this actor as a member
	for (const app of Object.values(ui.windows)) {
		if (app instanceof PartySheetSD) {
			const memberIds = app.memberIds;
			if (memberIds.includes(actor.id)) {
				app.render();
			}
		}
	}
});

// Re-render party sheets when items are created on member actors
Hooks.on("createItem", (item, options, userId) => {
	const actor = item.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Find all open party sheets that contain this actor as a member
	for (const app of Object.values(ui.windows)) {
		if (app instanceof PartySheetSD) {
			const memberIds = app.memberIds;
			if (memberIds.includes(actor.id)) {
				app.render();
			}
		}
	}
});

// Re-render party sheets when items are deleted from member actors
Hooks.on("deleteItem", (item, options, userId) => {
	const actor = item.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Find all open party sheets that contain this actor as a member
	for (const app of Object.values(ui.windows)) {
		if (app instanceof PartySheetSD) {
			const memberIds = app.memberIds;
			if (memberIds.includes(actor.id)) {
				app.render();
			}
		}
	}
});

// Clean up deleted actors from parties
Hooks.on("deleteActor", (actor, options, userId) => {
	if (actor.type !== "Player") return;
	
	// Remove this actor from all parties
	game.actors.filter(a => isPartyActor(a)).forEach(async party => {
		const memberIds = party.getFlag(MODULE_ID, "members") ?? [];
		if (memberIds.includes(actor.id)) {
			const newMemberIds = memberIds.filter(id => id !== actor.id);
			await party.setFlag(MODULE_ID, "members", newMemberIds);
		}
	});
});

// Update condition toggles when effects are created
Hooks.on("createActiveEffect", (effect, options, userId) => {
	const actor = effect.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Update the sheet if it's rendered
	if (actor.sheet?.rendered) {
		const html = actor.sheet.element;
		updateConditionToggles(actor, html);
	}
});

// Update condition toggles when effects are deleted
Hooks.on("deleteActiveEffect", (effect, options, userId) => {
	const actor = effect.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Update the sheet if it's rendered
	if (actor.sheet?.rendered) {
		const html = actor.sheet.element;
		updateConditionToggles(actor, html);
	}
});

// Update condition toggles when effects are updated
Hooks.on("updateActiveEffect", (effect, changes, options, userId) => {
	const actor = effect.parent;
	if (!actor || actor.type !== "Player") return;
	
	// Update the sheet if it's rendered
	if (actor.sheet?.rendered) {
		const html = actor.sheet.element;
		updateConditionToggles(actor, html);
	}
});

console.log(`${MODULE_ID} | Module loaded`);
