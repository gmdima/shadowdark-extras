/**
 * Shadowdark Extras Module
 * Adds Renown tracking, additional light sources, NPC inventory, and Party management to Shadowdark RPG
 */

import PartySheetSD, { syncPartyTokenLight, getPartiesContainingActor } from "./PartySheetSD.mjs";
import TradeWindowSD, { initializeTradeSocket, showTradeDialog, ensureTradeJournal } from "./TradeWindowSD.mjs";
import { CombatSettingsApp, registerCombatSettings, injectDamageCard, setupCombatSocket, setupScrollingCombatText, setupSummonExpiryHook, trackSummonedTokensForExpiry, spawnSummonedCreatures } from "./CombatSettingsSD.mjs";
import { EffectsSettingsApp, registerEffectsSettings } from "./EffectsSettingsSD.mjs";
import { HpWavesSettingsApp, registerHpWavesSettings, getHpWaveColor, isHpWavesEnabled } from "./HpWavesSettingsSD.mjs";
import { TravelActivitiesSettingsApp, registerTravelActivitiesSettings, getTravelActivities } from "./TravelActivitiesSettingsSD.mjs";
import { TravelSpeedsSettingsApp, registerTravelSpeedsSettings, getTravelSpeeds } from "./TravelSpeedsSettingsSD.mjs";
import { generateSpellConfig, generatePotionConfig, generateScrollConfig, generateWandConfig } from "./templates/ItemTypeConfigs.mjs";
import { activateTemplateTargetingListeners } from "./templates/TemplateTargetingConfig.mjs";
import {
	injectWeaponBonusTab,
	getWeaponBonuses,
	getWeaponHitBonuses,
	getWeaponEffectsToApply,
	evaluateRequirements,
	calculateWeaponBonusDamage,
	injectWeaponBonusDisplay,
	getWeaponItemMacroConfig,
	injectWeaponAnimationButton,
	getPromptableHitBonuses,
	getPromptableDamageBonuses
} from "./WeaponBonusConfig.mjs";

import { initAutoAnimationsIntegration } from "./AutoAnimationsSD.mjs";
import { initTorchAnimations } from "./TorchAnimationSD.mjs";
import { initWeaponAnimations } from "./WeaponAnimationSD.mjs";
import { initLevelUpAnimations } from "./LevelUpAnimationSD.mjs";
import { openWeaponAnimationConfig } from "./WeaponAnimationConfig.mjs";
import { initSDXROLLS, setupSDXROLLSSockets, injectSdxRollButton } from "./sdx-rolls/SdxRollsSD.mjs";
import { initFocusSpellTracker, endFocusSpell, linkEffectToFocusSpell, getActiveFocusSpells, isFocusingOnSpell, startDurationSpell, endDurationSpell, registerSpellModification } from "./FocusSpellTrackerSD.mjs";
import { initCarousing, injectCarousingButton, ensureCarousingJournal, ensureCarousingTablesJournal, initCarousingSocket, getCustomCarousingTables, getCarousingTableById, setCarousingTable } from "./CarousingSD.mjs";
import { openCarousingOverlay, refreshCarousingOverlay } from "./CarousingOverlaySD.mjs";
import { openCarousingTablesEditor } from "./CarousingTablesApp.mjs";
import { openExpandedCarousingTablesEditor } from "./ExpandedCarousingTablesApp.mjs";
import { initTemplateEffects, processTemplateTurnEffects, setupTemplateEffectFlags } from "./TemplateEffectsSD.mjs";
import { initAuraEffects, createAuraOnActor, getActiveAuras, getTokensInAura } from "./AuraEffectsSD.mjs";
import { registerDisplayNpcEnricher } from "./DisplayNpc.mjs";
import { registerDisplayTableEnricher } from "./DisplayTable.mjs";
import { registerDisplayItemEnricher } from "./DisplayItem.mjs";
import { initEasyReferenceMenu, registerEasyReferenceSettings } from "./easy-reference/EasyReferenceMenu.mjs";
import { CreatureTypesApp, getCreatureTypes } from "./CreatureTypesApp.mjs";
import SheetEditorConfig from "./SheetEditorConfig.mjs";
import PotionSheetSD from "./PotionSheetSD.mjs";
import BackgroundSheetSD from "./BackgroundSheetSD.mjs";
import NPCAttackSheetSD from "./NPCAttackSheetSD.mjs";
import NPCFeatureSheetSD from "./NPCFeatureSheetSD.mjs";
import { initTokenToolbar, registerTokenToolbarSettings } from "./TokenToolbarSD.mjs";
import { initAppearanceSettings } from "./AppearanceSettingsSD.mjs";
import AmmunitionSelector from "./AmmunitionSelector.mjs";
import StaffSpellManager from "./StaffSpellManager.mjs";
import { initJournalNarration } from "./JournalNarrationSD.mjs";
import { initMedkit } from "./MedkitSD.mjs";
import { initMarchingMode } from "./MarchingModeSD.mjs";
import { SceneExporter } from "./SceneExporter.mjs";
import { SceneImporter } from "./SceneImporter.mjs";
import "./SpellMacrosSD.mjs";

const MODULE_ID = "shadowdark-extras";
const TRADE_JOURNAL_NAME = "__sdx_trade_sync__"; // Must match TradeWindowSD.mjs
const CAROUSING_JOURNAL_NAME = "__sdx_carousing_sync__"; // Must match CarousingSD.mjs
const CAROUSING_TABLES_JOURNAL_NAME = "__sdx_carousing_tables__"; // Must match CarousingSD.mjs

// All internal journals that should be hidden from the sidebar
const HIDDEN_JOURNAL_NAMES = [
	TRADE_JOURNAL_NAME,
	CAROUSING_JOURNAL_NAME,
	CAROUSING_TABLES_JOURNAL_NAME
];

// ============================================
// JOURNAL NARRATION INITIALIZATION
// ============================================
initJournalNarration();
initMedkit();

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
			{ inplace: false, recursive: true }
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

		// ---- Save Button - close after submit ----
		html.find('button[name="submit"]').on("click", () => {
			setTimeout(() => this.close(), 100);
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

	//console.log(`${MODULE_ID} | Setting up unidentified item name wrapper`);

	// Get the Item class
	const ItemClass = CONFIG.Item.documentClass;

	// Search the entire prototype chain for the name descriptor
	let originalDescriptor = null;
	let proto = ItemClass.prototype;
	while (proto && !originalDescriptor) {
		originalDescriptor = Object.getOwnPropertyDescriptor(proto, "name");
		if (originalDescriptor) break;
		proto = Object.getPrototypeOf(proto);
	}

	// In Foundry v13, name might be defined as a getter that reads from _source
	// or may not exist as a property descriptor at all (uses DataModel pattern)
	if (originalDescriptor && originalDescriptor.get) {
		// Traditional getter pattern - wrap it
		const originalGetter = originalDescriptor.get;

		Object.defineProperty(ItemClass.prototype, "name", {
			get: function () {
				const realName = originalGetter.call(this);
				if (isUnidentified(this) && !game.user?.isGM) {
					return getUnidentifiedName(this);
				}
				return realName;
			},
			set: originalDescriptor.set,
			configurable: true,
			enumerable: originalDescriptor.enumerable
		});

		//console.log(`${MODULE_ID} | Successfully wrapped Item.name getter`);
	} else {
		// Foundry v13 DataModel pattern - define a new getter
		// The name is typically accessed via this._source.name or this.system.name
		Object.defineProperty(ItemClass.prototype, "name", {
			get: function () {
				// Get the real name from source data
				const realName = this._source?.name ?? this._name ?? "";
				if (isUnidentified(this) && !game.user?.isGM) {
					return getUnidentifiedName(this);
				}
				return realName;
			},
			set: function (value) {
				// Allow setting the name normally
				if (this._source) {
					this._source.name = value;
				}
			},
			configurable: true,
			enumerable: true
		});

		//console.log(`${MODULE_ID} | Successfully defined Item.name getter (DataModel pattern)`);
	}
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

	//console.log(`${MODULE_ID} | Wrapping ActorSD.buildWeaponDisplay for unidentified items`);

	if (!globalThis.shadowdark?.documents?.ActorSD) {
		console.warn(`${MODULE_ID} | ActorSD not found, cannot wrap buildWeaponDisplay`);
		return;
	}

	const ActorSD = globalThis.shadowdark.documents.ActorSD;
	const original = ActorSD.prototype.buildWeaponDisplay;

	ActorSD.prototype.buildWeaponDisplay = async function (options) {
		// --- SDX Enhancement: Inject Extra Damage/Types ---
		const item = this.items.get(options.weaponId);
		if (item) {
			const sdxFlags = item.flags?.[MODULE_ID] || {};
			const itemUnidentified = isUnidentified(item);
			const showDetails = !itemUnidentified || game.user?.isGM;

			if (showDetails) {
				// 1. Base Damage Type
				const baseDamageType = sdxFlags.baseDamageType;
				if (baseDamageType && baseDamageType !== "physical") {
					const typeLabel = game.i18n.localize(`SHADOWDARK_EXTRAS.damage_type.${baseDamageType}`);
					options.baseDamage += ` [${typeLabel}]`;
				}

				// 2. Extra Damages (from Item Details)
				const extraDamages = sdxFlags.extraDamages || [];
				const extraParts = (Array.isArray(extraDamages) ? extraDamages : Object.values(extraDamages))
					.filter(d => d.formula)
					.map(d => {
						const label = game.i18n.localize(`SHADOWDARK_EXTRAS.damage_type.${d.damageType}`);
						return `${d.formula} [${label}]`;
					});

				// 3. Special Bonuses (from Bonuses tab)
				const weaponBonusConfig = sdxFlags.weaponBonus;
				const hitParts = [];
				if (weaponBonusConfig?.enabled) {
					// Damage Bonuses
					if (weaponBonusConfig.damageBonuses) {
						for (const bonus of weaponBonusConfig.damageBonuses) {
							// Show if no requirements OR if it has a label (Phase 2)
							const hasRequirements = bonus.requirements && bonus.requirements.length > 0;
							if (bonus.formula && (!hasRequirements || bonus.label)) {
								const typeLabel = bonus.damageType ? game.i18n.localize(`SHADOWDARK_EXTRAS.damage_type.${bonus.damageType}`) : "";
								const typeSuffix = typeLabel ? ` [${typeLabel}]` : "";
								const labelSuffix = bonus.label ? ` (${bonus.label})` : "";
								extraParts.push(`${bonus.formula}${typeSuffix}${labelSuffix}`);
							}
						}
					}

					// Hit Bonuses (Phase 2 & 3)
					if (weaponBonusConfig.hitBonuses) {
						for (const bonus of weaponBonusConfig.hitBonuses) {
							const hasRequirements = bonus.requirements && bonus.requirements.length > 0;
							// Only show if labeled and has formula
							if (bonus.formula && bonus.label) {
								hitParts.push(`${bonus.formula} ${bonus.label}`);
							}
						}
					}
				}

				// Final Layout Assembly (Phase 3)
				if (hitParts.length > 0) {
					const hitString = hitParts.join(", ");
					options.baseDamage = `${hitString} | DMG: ${options.baseDamage}`;
				}

				if (extraParts.length > 0) {
					const extraText = extraParts.join(" + ");
					if (options.extraDamageDice) {
						options.extraDamageDice += ` + ${extraText}`;
					} else {
						options.extraDamageDice = extraText;
					}
				}
			}
		}
		// --------------------------------------------------

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

	//console.log(`${MODULE_ID} | Setting up item-piles unidentified item hooks`);

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

		// Get the REAL name from source data (bypasses our wrapper)
		const realName = item._source?.name;
		if (!realName || realName === maskedName) return; // Already masked or no real name

		// Escape special regex characters in the real name
		const escapedRealName = realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const realNameRegex = new RegExp(escapedRealName, 'g');

		// Replace tooltip/title attributes that might show the real name
		if ($el.attr("data-tooltip")?.includes(realName)) {
			$el.attr("data-tooltip", $el.attr("data-tooltip").replace(realNameRegex, maskedName));
		}
		if ($el.attr("title")?.includes(realName)) {
			$el.attr("title", $el.attr("title").replace(realNameRegex, maskedName));
		}
		// Also check child elements with tooltips
		$el.find("[data-tooltip], [title]").each((i, tooltipEl) => {
			const $tooltip = $(tooltipEl);
			if ($tooltip.attr("data-tooltip")?.includes(realName)) {
				$tooltip.attr("data-tooltip", $tooltip.attr("data-tooltip").replace(realNameRegex, maskedName));
			}
			if ($tooltip.attr("title")?.includes(realName)) {
				$tooltip.attr("title", $tooltip.attr("title").replace(realNameRegex, maskedName));
			}
		});

		// Find name elements and replace text - item-piles uses various structures
		// For pile items and merchant items
		$el.find(".item-piles-name, .item-piles-item-name, [class*='item-name'], [class*='name'], label, span").each((i, nameEl) => {
			const $name = $(nameEl);
			// Don't replace if it's a container element with child elements that have the name class
			if ($name.children().length > 0 && $name.find("[class*='name']").length > 0) return;

			const currentText = $name.text().trim();
			if (!currentText) return;

			// Check if the text contains the real name
			if (currentText.includes(realName)) {
				// Check if it contains quantity suffix like "(x1)" or "x 2"
				const qtyMatch = currentText.match(/\s*(\(x?\d+\)|x\s*\d+)$/i);
				if (qtyMatch) {
					$name.text(maskedName + qtyMatch[0]);
				} else {
					$name.text(currentText.replace(realNameRegex, maskedName));
				}
			}
		});

		// Also check direct text content for simple elements
		if ($el.hasClass("item-piles-item-row") || $el.hasClass("item-piles-item") || $el.hasClass("item-piles-flexrow")) {
			const textNodes = $el.contents().filter(function () {
				return this.nodeType === 3 && this.textContent.trim();
			});
			textNodes.each((i, node) => {
				const text = node.textContent;
				if (text.includes(realName)) {
					node.textContent = text.replace(realNameRegex, maskedName);
				}
			});
		}

		// Also walk all descendant text nodes to catch any we might have missed
		$el.find("*").addBack().contents().filter(function () {
			return this.nodeType === 3 && this.textContent.includes(realName);
		}).each((i, node) => {
			node.textContent = node.textContent.replace(realNameRegex, maskedName);
		});
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
				//console.log(`${MODULE_ID} | Added unidentified flag to item-piles similarities`);
			}
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not add unidentified flag to item-piles similarities`, err);
		}

		// Monkey patch item-piles internal PileItem class to intercept name store values
		// This is more reliable than DOM manipulation since it affects the source of truth
		if (!game.user?.isGM) {
			try {
				// Hook into PileItem name store setter by wrapping the setupProperties method
				// or intercepting the name.set calls via Svelte store subscription
				const patchPileItemName = (pileItem) => {
					if (!pileItem?.item || !pileItem?.name) return;

					// Check if item is unidentified
					const item = pileItem.item;
					if (!isUnidentified(item)) return;

					const maskedName = getUnidentifiedName(item);

					// Override the name store value
					if (typeof pileItem.name?.set === "function") {
						pileItem.name.set(maskedName);

						// Also wrap the original set to intercept future updates
						const originalSet = pileItem.name.set.bind(pileItem.name);
						pileItem.name.set = (value) => {
							// Always use masked name for unidentified items
							if (isUnidentified(item)) {
								originalSet(maskedName);
							} else {
								originalSet(value);
							}
						};
					}
				};

				// Hook into render hooks to patch PileItem instances
				// These hooks pass the element and the actual Item document
				// We need to find the corresponding PileItem store
				const patchFromRenderHook = (element, item) => {
					if (!item || !isUnidentified(item)) return;

					const maskedName = getUnidentifiedName(item);

					// The element contains Svelte component data
					// Try to find and patch the name store
					const $el = $(element);

					// Also directly manipulate visible name elements as fallback
					$el.find("[class*='name']").each((i, nameEl) => {
						const $name = $(nameEl);
						const text = $name.text().trim();
						const realName = item._source?.name || item.name;
						if (text && text.includes(realName)) {
							$name.text(text.replace(realName, maskedName));
						}
					});

					// Handle direct text that might show the real name
					const realName = item._source?.name;
					if (realName) {
						$el.contents().filter(function () {
							return this.nodeType === 3;
						}).each((i, node) => {
							if (node.textContent.includes(realName)) {
								node.textContent = node.textContent.replace(new RegExp(realName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), maskedName);
							}
						});
					}
				};

				// Re-register hooks with enhanced patching
				Hooks.on("item-piles-renderPileItem", patchFromRenderHook);
				Hooks.on("item-piles-renderMerchantItem", patchFromRenderHook);
				Hooks.on("item-piles-renderVaultGridItem", patchFromRenderHook);

				//console.log(`${MODULE_ID} | Enhanced item-piles name patching installed`);
			} catch (err) {
				console.warn(`${MODULE_ID} | Could not install enhanced item-piles name patching`, err);
			}
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
		const appName = app.constructor?.name || "";
		const isItemPiles = appName.includes("ItemPile") ||
			appName.includes("Trading") ||
			appName.includes("Merchant") ||
			appName.includes("TradeMerchantItem") ||
			app.options?.classes?.some(c => c.includes("item-piles")) ||
			app.id?.includes?.("item-pile") ||
			html.find(".item-piles").length > 0 ||
			html.find("[class*='item-piles']").length > 0;

		if (isItemPiles) {
			// Apply immediately
			maskUnidentifiedNamesInElement(html, getDefaultMaskedName);

			// Svelte components render asynchronously, so apply again after delays
			setTimeout(() => {
				maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
			}, 50);
			setTimeout(() => {
				maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
			}, 150);
			setTimeout(() => {
				maskUnidentifiedNamesInElement(html, getDefaultMaskedName);
			}, 300);
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

					// Check if this is an item-piles trading dialog (by ID pattern)
					const nodeId = node.id || "";
					const isTradeDialog = nodeId.includes("item-pile-buy-item-dialog") ||
						nodeId.includes("item-pile-trade-dialog");

					// Check if this is an item-piles element
					const isItemPilesElement = $node.hasClass("item-piles") ||
						$node.find(".item-piles").length > 0 ||
						$node.closest(".item-piles").length > 0 ||
						$node.hasClass("item-piles-flexrow") ||
						$node.find("[class*='item-piles']").length > 0 ||
						node.className?.includes?.("item-piles") ||
						$node.hasClass("item-piles-app");

					if (isTradeDialog || isItemPilesElement) {
						maskUnidentifiedNamesInElement($node, getDefaultMaskedName);

						// For Svelte dialogs, content might render after the initial mount
						// so we apply masking again after a brief delay
						setTimeout(() => {
							maskUnidentifiedNamesInElement($node, getDefaultMaskedName);
						}, 50);
						setTimeout(() => {
							maskUnidentifiedNamesInElement($node, getDefaultMaskedName);
						}, 200);
					}

					// Also check window titles 
					if ($node.hasClass("window-title") || $node.find(".window-title").length > 0) {
						maskUnidentifiedNamesInElement($node, getDefaultMaskedName);
					}

					// Check for any element whose parent has item-piles in the ID
					if ($node.closest("[id*='item-pile']").length > 0) {
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

	// Helper to add items from an actor
	const addItemsFromActor = (actor) => {
		if (!actor?.items) return;
		for (const item of actor.items) {
			if (isUnidentified(item)) {
				const realName = item._source?.name;
				if (realName) {
					const maskedName = getUnidentifiedName(item);
					unidentifiedNameMap.set(realName, maskedName);
				}
			}
		}
	};

	// Check all world actors
	for (const actor of game.actors) {
		addItemsFromActor(actor);
	}

	// Check token actors on the current scene (merchants are often synthetic token actors)
	if (canvas?.tokens?.placeables) {
		for (const token of canvas.tokens.placeables) {
			if (token.actor) {
				addItemsFromActor(token.actor);
			}
		}
	}

	// Check ALL scenes for unlinked token actors (not just currently viewed scene)
	for (const scene of game.scenes) {
		for (const tokenDoc of scene.tokens) {
			// Unlinked tokens have their own delta actor
			if (tokenDoc.actor) {
				addItemsFromActor(tokenDoc.actor);
			}
			// Also check actorData for older Foundry versions
			if (tokenDoc.delta?.items) {
				for (const itemData of tokenDoc.delta.items) {
					if (itemData.flags?.[MODULE_ID]?.unidentified) {
						const realName = itemData.name;
						if (realName) {
							const maskedName = getUnidentifiedNameFromData(itemData);
							unidentifiedNameMap.set(realName, maskedName);
						}
					}
				}
			}
		}
	}

	// Also check world items (standalone items)
	if (game.items) {
		for (const item of game.items) {
			if (isUnidentified(item)) {
				const realName = item._source?.name;
				if (realName) {
					const maskedName = getUnidentifiedName(item);
					unidentifiedNameMap.set(realName, maskedName);
				}
			}
		}
	}

	if (unidentifiedNameMap.size === 0) return;

	// Replace item names in text nodes
	html.find("*").addBack().contents().filter(function () {
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

// Track pending hit bonus info for display in chat messages
// Maps "actorId-itemId" to { formula, result, parts, timestamp }
const _pendingHitBonusInfo = new Map();

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
		const totalCoins = gp + sp + cp;
		const coinSlots = Math.floor(totalCoins / 100);
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
		const totalCoins = gp + sp + cp;
		const coinSlots = Math.floor(totalCoins / 100);
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

		// Add coin weight: 1 slot per 100 coins (regardless of denomination)
		const coins = containerItem.getFlag(MODULE_ID, "containerCoins") || {};
		const gp = Number(coins.gp ?? 0);
		const sp = Number(coins.sp ?? 0);
		const cp = Number(coins.cp ?? 0);
		const totalCoins = gp + sp + cp;
		const coinSlots = Math.floor(totalCoins / 100);
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
		const header = $(box).find('.header label').first().text().trim();
		const expectedHeader = game.i18n.localize('SHADOWDARK.item.properties.label');
		return header === expectedHeader;
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
	detailsTab.find(".SD-box").each(function () {
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

		// Check if trying to make this a container while it's inside another container
		if (enabled) {
			const allowNestedContainers = game.settings.get(MODULE_ID, "enableNestedContainers");
			const containerId = item.getFlag(MODULE_ID, "containerId");
			if (!allowNestedContainers && containerId) {
				ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.item.container.nested_not_allowed"));
				ev.currentTarget.checked = false;
				return;
			}
		}

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
			const freeCarryLabel = freeCarryInput.closest('.SD-grid').find('h3').filter(function () {
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
				await item.update({ "system.slots.free_carry": checked ? 1 : 0 });
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

	// Calculate coin slots (1 slot per 100 coins, regardless of denomination)
	const totalCoins = coinGP + coinSP + coinCP;
	const coinSlots = Math.floor(totalCoins / 100);

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

			// Check if nested containers are allowed
			const allowNestedContainers = game.settings.get(MODULE_ID, "enableNestedContainers");
			if (!allowNestedContainers && isContainerItem(dropped)) {
				ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.item.container.nested_not_allowed"));
				return;
			}

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

	//console.log(`${MODULE_ID} | Masking unidentified item sheet for: ${item.name}`);

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
	proto._onDropItem = async function (event, data) {
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
 * NOTE: This only handles items that Shadowdark doesn't natively handle.
 * Shadowdark's PlayerSheetSD already has _onItemChatClick which calls displayCard()
 * for all items via .item-image click. We only need to handle NPC items.
 */
function enableItemChatIcon(app, html) {
	const actor = app?.actor;
	if (!actor) return;

	// Skip for player sheets - Shadowdark handles these natively via _onItemChatClick
	// This prevents duplicate chat messages when clicking item images
	if (actor.type === "Player") return;

	// Handle click on item image (when it has the chat icon)
	html.find('.item-image').off('click.sdxChat').on('click.sdxChat', async function (ev) {
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

		// Show item in chat - Shadowdark uses displayCard()
		await item.displayCard();
	});
}

/**
 * Register module settings
 * 
 * Settings are registered in order to match the section headers:
 * 1. Configuration Menus (Combat, Effects, HP Waves, Inventory Styles)
 * 2. Combat & Spells (Focus Tracker, Enhance Spells)
 * 3. Character Sheet (Enhanced Header, Renown, Journal Notes, Add Coins, Conditions Theme)
 * 4. Inventory (Containers, Trading, Unidentified, Multi-select)
 * 5. Carousing (Enable, Mode, Tables)
 * 6. NPC Features (NPC Inventory, Creature Type)
 * 7. Visual & Animation (Torch Animations)
 */

/**
 * Apply sheet decoration styles dynamically based on settings
 * Injects CSS custom properties for border and panel images
 */
function applySheetDecorationStyles() {
	// Remove existing style if any
	const existingStyle = document.getElementById('sdx-decoration-styles');
	if (existingStyle) existingStyle.remove();

	// Get settings - with fallback defaults for when settings aren't registered yet
	let sheetBorder, abilityPanel, acPanel, statPanel;
	let borderImageWidth, borderImageSlice, borderTransparencyWidth;
	let borderImageOutset, borderImageRepeat, borderBackgroundColor;
	let boxBorder, boxBorderImageWidth, boxBorderImageSlice, boxBorderTransparencyWidth;
	let journalBorder, journalBorderImageWidth, journalBorderImageSlice, journalBorderImageOutset, journalBorderImageRepeat;
	let abilityModColor, levelValueColor, acValueColor, initModColor, luckValueColor;
	let tabGradientStart, tabGradientEnd;
	try {
		sheetBorder = game.settings.get(MODULE_ID, "sheetBorderStyle") || "panel-border-004.png";
		abilityPanel = game.settings.get(MODULE_ID, "abilityPanelStyle") || "panel-013.png";
		acPanel = game.settings.get(MODULE_ID, "acPanelStyle") || "panel-transparent-center-004.png";
		statPanel = game.settings.get(MODULE_ID, "statPanelStyle") || "panel-transparent-center-015.png";
		borderImageWidth = game.settings.get(MODULE_ID, "borderImageWidth") ?? 16;
		borderImageSlice = game.settings.get(MODULE_ID, "borderImageSlice") ?? 12;
		borderImageOutset = game.settings.get(MODULE_ID, "borderImageOutset") ?? 0;
		borderImageRepeat = game.settings.get(MODULE_ID, "borderImageRepeat") || "stretch";
		borderBackgroundColor = game.settings.get(MODULE_ID, "borderBackgroundColor") || "";
		borderTransparencyWidth = game.settings.get(MODULE_ID, "borderWidth") ?? 10;
		boxBorder = game.settings.get(MODULE_ID, "sdBoxBorderStyle") || "panel-border-001.png";
		boxBorderImageWidth = game.settings.get(MODULE_ID, "sdBoxBorderWidth") ?? 16;
		boxBorderImageSlice = game.settings.get(MODULE_ID, "sdBoxBorderSlice") ?? 12;
		boxBorderTransparencyWidth = game.settings.get(MODULE_ID, "sdBoxBorderTransparencyWidth") ?? 10;
		journalBorder = game.settings.get(MODULE_ID, "journalBorderStyle") || "panel-border-004.png";
		journalBorderImageWidth = game.settings.get(MODULE_ID, "journalBorderImageWidth") ?? 16;
		journalBorderImageSlice = game.settings.get(MODULE_ID, "journalBorderImageSlice") ?? 12;
		journalBorderImageOutset = game.settings.get(MODULE_ID, "journalBorderImageOutset") ?? 0;
		journalBorderImageRepeat = game.settings.get(MODULE_ID, "journalBorderImageRepeat") || "repeat";
		abilityModColor = game.settings.get(MODULE_ID, "abilityModColor") || "#000000";
		levelValueColor = game.settings.get(MODULE_ID, "levelValueColor") || "#000000";
		acValueColor = game.settings.get(MODULE_ID, "acValueColor") || "#000000";
		initModColor = game.settings.get(MODULE_ID, "initModColor") || "#000000";
		luckValueColor = game.settings.get(MODULE_ID, "luckValueColor") || "#000000";
		tabGradientStart = game.settings.get(MODULE_ID, "tabGradientStart") || "#000000";
		tabGradientEnd = game.settings.get(MODULE_ID, "tabGradientEnd") || "#2f2b2b";
	} catch {
		// Settings not registered yet, use defaults
		sheetBorder = "panel-border-004.png";
		abilityPanel = "panel-013.png";
		acPanel = "panel-transparent-center-004.png";
		statPanel = "panel-transparent-center-015.png";
		borderImageWidth = 16;
		borderImageSlice = 12;
		borderImageOutset = 0;
		borderImageRepeat = "stretch";
		borderBackgroundColor = "";
		borderTransparencyWidth = 10;
		boxBorder = "panel-border-001.png";
		boxBorderImageWidth = 16;
		boxBorderImageSlice = 12;
		boxBorderTransparencyWidth = 10;
		journalBorder = "panel-border-004.png";
		journalBorderImageWidth = 16;
		journalBorderImageSlice = 12;
		journalBorderImageOutset = 0;
		journalBorderImageRepeat = "repeat";
		abilityModColor = "#000000";
		levelValueColor = "#000000";
		acValueColor = "#000000";
		initModColor = "#000000";
		luckValueColor = "#000000";
		tabGradientStart = "#000000";
		tabGradientEnd = "#2f2b2b";
	}

	// Build paths - use absolute paths from Foundry root to avoid relative path issues
	const borderPath = `/modules/${MODULE_ID}/art/PNG/Default/Border/${sheetBorder}`;
	const abilityPanelPath = `/modules/${MODULE_ID}/art/PNG/Default/Panel/${abilityPanel}`;
	const acPanelPath = `/modules/${MODULE_ID}/art/PNG/Default/Transparent center/${acPanel}`;
	const statPanelPath = `/modules/${MODULE_ID}/art/PNG/Default/Transparent center/${statPanel}`;
	const boxBorderPath = `/modules/${MODULE_ID}/art/PNG/Default/Border/${boxBorder}`;
	const journalBorderPath = `/modules/${MODULE_ID}/art/PNG/Default/Border/${journalBorder}`;

	// Create style element with CSS custom properties
	const style = document.createElement('style');
	style.id = 'sdx-decoration-styles';
	style.textContent = `
		:root {
			--sdx-sheet-border: url('${borderPath}');
			--sdx-ability-panel: url('${abilityPanelPath}');
			--sdx-ac-panel: url('${acPanelPath}');
			--sdx-stat-panel: url('${statPanelPath}');
			--sdx-border-image-width: ${borderImageWidth}px;
			--sdx-border-image-slice: ${borderImageSlice};
			--sdx-border-image-outset: ${borderImageOutset}px;
			--sdx-border-image-repeat: ${borderImageRepeat};
			--sdx-border-background-color: ${borderBackgroundColor || 'transparent'};
			--sdx-border-width: ${borderTransparencyWidth}px;
			--sdx-box-border: url('${boxBorderPath}');
			--sdx-box-border-image-width: ${boxBorderImageWidth}px;
			--sdx-box-border-image-slice: ${boxBorderImageSlice};
			--sdx-box-border-width: ${boxBorderTransparencyWidth}px;
			--sdx-journal-border: url('${journalBorderPath}');
			--sdx-journal-border-image-width: ${journalBorderImageWidth}px;
			--sdx-journal-border-image-slice: ${journalBorderImageSlice};
			--sdx-journal-border-image-outset: ${journalBorderImageOutset}px;
			--sdx-journal-border-image-repeat: ${journalBorderImageRepeat};
			--sdx-ability-mod-color: ${abilityModColor};
			--sdx-level-value-color: ${levelValueColor};
			--sdx-ac-value-color: ${acValueColor};
			--sdx-init-mod-color: ${initModColor};
			--sdx-luck-value-color: ${luckValueColor};
			--sdx-tab-gradient-start: ${tabGradientStart};
			--sdx-tab-gradient-end: ${tabGradientEnd};
		}
	`;

	document.head.appendChild(style);

	//console.log(`${MODULE_ID} | Applied sheet decoration styles`);
}

function registerSettings() {
	// ═══════════════════════════════════════════════════════════════
	// 1. CONFIGURATION MENUS
	// ═══════════════════════════════════════════════════════════════

	// Combat Settings Menu (registered via registerCombatSettings)
	registerCombatSettings();

	// Effects Settings Menu (registered via registerEffectsSettings)
	registerEffectsSettings();

	// HP Waves Settings Menu (registered via registerHpWavesSettings)
	registerHpWavesSettings();

	// Travel Activities Settings Menu (registered via registerTravelActivitiesSettings)
	registerTravelActivitiesSettings();

	// Travel Speeds Settings Menu (registered via registerTravelSpeedsSettings)
	registerTravelSpeedsSettings();

	// Inventory Styles data setting (hidden)
	game.settings.register(MODULE_ID, "inventoryStyles", {
		name: "Inventory Styles Configuration",
		scope: "world",
		config: false,
		type: Object,
		default: foundry.utils.deepClone(DEFAULT_INVENTORY_STYLES)
	});

	// Inventory Styles Menu
	game.settings.registerMenu(MODULE_ID, "inventoryStylesMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.label"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.inventory_styles.hint"),
		icon: "fas fa-palette",
		type: InventoryStylesApp,
		restricted: true
	});

	// Sheet Style Editor Menu
	game.settings.registerMenu(MODULE_ID, "sheetEditorMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.menuName"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.menuLabel"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.sheetEditor.menuHint"),
		icon: "fas fa-paint-brush",
		type: SheetEditorConfig,
		restricted: true
	});

	// ═══════════════════════════════════════════════════════════════
	// 2. COMBAT & SPELLS
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableFocusTracker", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_focus_tracker.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_focus_tracker.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enhanceSpells", {
		name: "Enhance Spells",
		hint: "Add damage/heal configuration to spell items for automatic spell damage application similar to weapon attacks.",
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
	});

	game.settings.register(MODULE_ID, "enableWandUses", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_wand_uses.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_wand_uses.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
	});

	// ═══════════════════════════════════════════════════════════════
	// 3. CHARACTER SHEET
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableEnhancedHeader", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_enhanced_header.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_enhanced_header.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableDefaultHeaderBg", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_default_header_bg.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_default_header_bg.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});

	game.settings.register(MODULE_ID, "defaultHeaderBgPath", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.default_header_bg_path.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.default_header_bg_path.hint"),
		scope: "world",
		config: true,
		default: "",
		type: String,
		filePicker: "imagevideo",
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

	// Sheet Decoration Settings - Border and Panel Styles
	const borderChoices = {};
	for (let i = 0; i <= 31; i++) {
		const num = String(i).padStart(3, '0');
		borderChoices[`panel-border-${num}.png`] = `Border Style ${i}`;
	}

	const panelChoices = {};
	for (let i = 0; i <= 31; i++) {
		const num = String(i).padStart(3, '0');
		panelChoices[`panel-${num}.png`] = `Panel Style ${i}`;
	}

	const transparentCenterChoices = {};
	for (let i = 0; i <= 31; i++) {
		const num = String(i).padStart(3, '0');
		transparentCenterChoices[`panel-transparent-center-${num}.png`] = `Panel Style ${i}`;
	}

	game.settings.register(MODULE_ID, "sheetBorderStyle", {
		name: "Sheet Border Style",
		hint: "Choose the decorative border frame around the player character sheet.",
		scope: "world",
		config: false,
		default: "panel-border-004.png",
		type: String,
		choices: borderChoices,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "abilityPanelStyle", {
		name: "Ability Panel Style",
		hint: "Choose the panel background for ability stat boxes (STR, DEX, etc.).",
		scope: "world",
		config: false,
		default: "panel-013.png",
		type: String,
		choices: panelChoices,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "acPanelStyle", {
		name: "AC Panel Style",
		hint: "Choose the panel background for the Armor Class box.",
		scope: "world",
		config: false,
		default: "panel-transparent-center-004.png",
		type: String,
		choices: transparentCenterChoices,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "statPanelStyle", {
		name: "Init/Level/Luck Panel Style",
		hint: "Choose the panel background for Initiative, Level, and Luck boxes.",
		scope: "world",
		config: false,
		default: "panel-transparent-center-015.png",
		type: String,
		choices: transparentCenterChoices,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderImageWidth", {
		name: "Border Image Width",
		scope: "world",
		config: false,
		default: 16,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderImageSlice", {
		name: "Border Image Slice",
		scope: "world",
		config: false,
		default: 12,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderImageOutset", {
		name: "Border Image Outset",
		scope: "world",
		config: false,
		default: 0,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderImageRepeat", {
		name: "Border Image Repeat",
		scope: "world",
		config: false,
		default: "stretch",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderBackgroundColor", {
		name: "Border Background Color",
		scope: "world",
		config: false,
		default: "",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "borderWidth", {
		name: "Border Width",
		scope: "world",
		config: false,
		default: 10,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "sdBoxBorderStyle", {
		name: "SD-Box Border Style",
		scope: "world",
		config: false,
		default: "panel-border-001.png",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "sdBoxBorderWidth", {
		name: "SD-Box Border Image Width",
		scope: "world",
		config: false,
		default: 16,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "sdBoxBorderSlice", {
		name: "SD-Box Border Image Slice",
		scope: "world",
		config: false,
		default: 12,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "sdBoxBorderTransparencyWidth", {
		name: "SD-Box Border Width",
		scope: "world",
		config: false,
		default: 10,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	// Journal Border Settings
	game.settings.register(MODULE_ID, "journalBorderStyle", {
		name: "Journal Border Style",
		scope: "world",
		config: false,
		default: "panel-border-004.png",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "journalBorderImageWidth", {
		name: "Journal Border Image Width",
		scope: "world",
		config: false,
		default: 16,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "journalBorderImageSlice", {
		name: "Journal Border Image Slice",
		scope: "world",
		config: false,
		default: 12,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "journalBorderImageOutset", {
		name: "Journal Border Image Outset",
		scope: "world",
		config: false,
		default: 0,
		type: Number,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "journalBorderImageRepeat", {
		name: "Journal Border Image Repeat",
		scope: "world",
		config: false,
		default: "repeat",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "abilityModColor", {
		name: "Ability Modifier Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "levelValueColor", {
		name: "Level Value Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "acValueColor", {
		name: "AC Value Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "initModColor", {
		name: "Initiative Modifier Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "luckValueColor", {
		name: "Luck Value Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	// Tab background gradient settings
	game.settings.register(MODULE_ID, "tabGradientStart", {
		name: "Tab Gradient Start Color",
		scope: "world",
		config: false,
		default: "#000000",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "tabGradientEnd", {
		name: "Tab Gradient End Color",
		scope: "world",
		config: false,
		default: "#2f2b2b",
		type: String,
		onChange: () => applySheetDecorationStyles()
	});

	game.settings.register(MODULE_ID, "enableJournalNotes", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_notes.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_journal_notes.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
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

	game.settings.register(MODULE_ID, "conditionsTheme", {
		name: "Conditions theme",
		hint: "Choose a visual theme for the quick conditions toggles",
		scope: "world",
		config: true,
		default: "shadowdark",
		type: String,
		choices: {
			"shadowdark": "Shadowdark",
			"5e": "5e",
			parchment: "Parchment (Default)",
			stone: "Stone Tablet",
			leather: "Leather Bound",
			iron: "Iron & Rust",
			moss: "Moss & Decay",
			blood: "Blood & Shadow"
		},
		onChange: () => {
			// Re-render all open player sheets
			const PlayerSheetClass = globalThis.shadowdark?.apps?.PlayerSheetSD;
			if (PlayerSheetClass) {
				Object.values(ui.windows).filter(app => app instanceof PlayerSheetClass).forEach(app => app.render());
			}
		}
	});

	// ═══════════════════════════════════════════════════════════════
	// 4. INVENTORY
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableContainers", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_containers.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_containers.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableNestedContainers", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_nested_containers.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_nested_containers.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
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

	// ═══════════════════════════════════════════════════════════════
	// 5. CAROUSING
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableCarousing", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_carousing.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_carousing.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true
	});

	game.settings.register(MODULE_ID, "carousingMode", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_mode.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_mode.hint"),
		scope: "world",
		config: true,
		default: "original",
		type: String,
		choices: {
			"original": game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_mode.original"),
			"expanded": game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_mode.expanded")
		},
		onChange: () => {
			// Re-render all open player sheets to update carousing tab
			Object.values(ui.windows).forEach(app => {
				if (app.actor?.type === "Player") app.render();
			});
		}
	});

	// Carousing - Show benefit descriptions to players
	game.settings.register(MODULE_ID, "carousingShowBenefitsToPlayers", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_show_benefits.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_show_benefits.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});

	// Carousing - Show mishap descriptions to players
	game.settings.register(MODULE_ID, "carousingShowMishapsToPlayers", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_show_mishaps.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.carousing_show_mishaps.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean
	});

	// Carousing Tables Editor Menu Button
	game.settings.registerMenu(MODULE_ID, "carousingTablesMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_tables"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_tables"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_tables_hint"),
		icon: "fas fa-beer",
		type: class extends FormApplication {
			render() { openCarousingTablesEditor(); }
		},
		restricted: true
	});

	// Expanded Carousing Tables Editor Menu Button
	game.settings.registerMenu(MODULE_ID, "expandedCarousingTablesMenu", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_expanded_tables") || "Edit Expanded Carousing Tables",
		label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_expanded_tables") || "Edit Expanded Tables",
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.manage_expanded_tables_hint") || "Edit the Expanded Carousing mode tables (tiers, outcomes, benefits, mishaps)",
		icon: "fas fa-dice-d20",
		type: class extends FormApplication {
			render() { openExpandedCarousingTablesEditor(); }
		},
		restricted: true
	});

	// Expanded Carousing Data Storage (hidden setting)
	game.settings.register(MODULE_ID, "expandedCarousingData", {
		name: "Expanded Carousing Data",
		scope: "world",
		config: false,
		default: null,
		type: Object
	});

	// ═══════════════════════════════════════════════════════════════
	// 6. NPC FEATURES
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableNpcInventory", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_inventory.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_inventory.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableNpcCreatureType", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_creature_type.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_npc_creature_type.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: false,
	});

	// Custom creature types storage
	game.settings.register(MODULE_ID, "customCreatureTypes", {
		scope: "world",
		config: false,
		default: [],
		type: Array,
	});

	// Menu button to open creature types editor
	game.settings.registerMenu(MODULE_ID, "manageCreatureTypes", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.manage_creature_types.name"),
		label: game.i18n.localize("SHADOWDARK_EXTRAS.settings.manage_creature_types.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.manage_creature_types.hint"),
		icon: "fas fa-dragon",
		type: CreatureTypesApp,
		restricted: true,
	});

	// ═══════════════════════════════════════════════════════════════
	// 7. VISUAL & ANIMATION
	// ═══════════════════════════════════════════════════════════════

	game.settings.register(MODULE_ID, "enableTorchAnimations", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_torch_animations.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_torch_animations.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	game.settings.register(MODULE_ID, "enableLevelUpAnimation", {
		name: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_level_up_animation.name"),
		hint: game.i18n.localize("SHADOWDARK_EXTRAS.settings.enable_level_up_animation.hint"),
		scope: "world",
		config: true,
		default: true,
		type: Boolean,
		requiresReload: true,
	});

	// ═══════════════════════════════════════════════════════════════
	// 9. EASY REFERENCE MENU
	// ═══════════════════════════════════════════════════════════════

	// Easy Reference ProseMirror menu settings
	registerEasyReferenceSettings();

	// 10. TOKEN TOOLBAR
	// ═══════════════════════════════════════════════════════════════

	// Token Toolbar settings
	registerTokenToolbarSettings();
}

/**
 * Setup the renderSettingsConfig hook to organize settings with section headers
 * 
 * Settings are organized into these groups:
 * 1. Configuration Menus: Combat, Effects, HP Waves, Inventory Styles menus
 * 2. Combat & Spells: Focus Tracker, Enhance Spells
 * 3. Character Sheet: Enhanced Header, backgrounds, Renown, Journal Notes, Add Coins, Conditions Theme
 * 4. Inventory: Containers, Nested Containers, Trading, Unidentified, Multi-select
 * 5. Carousing: Enable Carousing, Mode, Table menus
 * 6. NPC Features: NPC Inventory, Creature Type
 * 7. Visual & Animation: Torch Animations
 * 8. SDX Rolls: All SDX Rolls settings
 */
function setupSettingsOrganization() {
	Hooks.on("renderSettingsConfig", (app, html, data) => {
		// In Foundry v13, html may be a native HTMLElement instead of jQuery
		const $html = html instanceof jQuery ? html : $(html);

		// Only process if we're looking at our module's settings section
		const sdxSection = $html.find(`[data-category="${MODULE_ID}"]`);
		if (sdxSection.length === 0) return;

		// Helper function to create a group header
		const createHeader = (text, icon = null) => {
			const iconHtml = icon ? `<i class="${icon}"></i> ` : '';
			return $('<div>').addClass('form-group group-header sdx-settings-header').html(`${iconHtml}${text}`);
		};

		// Helper to insert header before first found element
		const insertHeaderBefore = (selector, headerText, headerIcon) => {
			const element = sdxSection.find(selector);
			if (element.length) {
				const formGroup = element.closest('.form-group');
				if (formGroup.length && !formGroup.prev().hasClass('sdx-settings-header')) {
					createHeader(headerText, headerIcon).insertBefore(formGroup);
				}
			}
		};

		// ═══════════════════════════════════════════════════════════════
		// Insert section headers before specific settings
		// The setting listed is the FIRST setting in that group
		// ═══════════════════════════════════════════════════════════════

		// 1. CONFIGURATION MENUS - First is Combat Settings Menu
		insertHeaderBefore(
			'[data-key="shadowdark-extras.combatSettingsMenu"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.configuration_menus"),
			"fas fa-cogs"
		);

		// 2. COMBAT & SPELLS - First is Focus Tracker
		insertHeaderBefore(
			'[name="shadowdark-extras.enableFocusTracker"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.combat_spells"),
			"fas fa-magic"
		);

		// 3. CHARACTER SHEET - First is Enhanced Header
		insertHeaderBefore(
			'[name="shadowdark-extras.enableEnhancedHeader"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.character_sheet"),
			"fas fa-user"
		);

		// 4. INVENTORY - First is Containers
		insertHeaderBefore(
			'[name="shadowdark-extras.enableContainers"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.inventory"),
			"fas fa-box-open"
		);

		// 5. CAROUSING - First is Enable Carousing
		insertHeaderBefore(
			'[name="shadowdark-extras.enableCarousing"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.carousing"),
			"fas fa-beer-mug-empty"
		);

		// 6. NPC FEATURES - First is NPC Inventory
		insertHeaderBefore(
			'[name="shadowdark-extras.enableNpcInventory"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.npc_features"),
			"fas fa-skull"
		);

		// 7. VISUAL & ANIMATION - First is Torch Animations
		insertHeaderBefore(
			'[name="shadowdark-extras.enableTorchAnimations"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.visual_features"),
			"fas fa-sparkles"
		);

		// 8. SDX ROLLS - First is Recap Message
		insertHeaderBefore(
			'[name="shadowdark-extras.SDXROLLSRecapMessage"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.sdx_rolls"),
			"fas fa-dice-d20"
		);

		// 9. TOKEN TOOLBAR - First is Enable Token Toolbar
		insertHeaderBefore(
			'[name="shadowdark-extras.tokenToolbar.enabled"]',
			game.i18n.localize("SHADOWDARK_EXTRAS.settings.headers.token_toolbar"),
			"fas fa-id-badge"
		);
	});
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
		//console.log("SDX Journal: Sheet element not found");
		return;
	}

	// Find the notes tab - it's a section with class "tab-notes" and data-tab="tab-notes"
	const notesTab = sheetElement.find('section.tab-notes[data-tab="tab-notes"]');
	if (notesTab.length === 0) {
		//console.log("SDX Journal: Notes tab section not found");
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
	targetTab.children().each(function () {
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

		activateListeners(html) {
			super.activateListeners(html);

			const form = html[0] ?? html;

			// HTML snippets for quick-insert
			const snippets = {
				'callout-info': '<div class="sdx-callout sdx-callout-info"><p>Information text here...</p></div>',
				'callout-warning': '<div class="sdx-callout sdx-callout-warning"><p>Warning text here...</p></div>',
				'callout-danger': '<div class="sdx-callout sdx-callout-danger"><p>Danger text here...</p></div>',
				'callout-success': '<div class="sdx-callout sdx-callout-success"><p>Success text here...</p></div>',
				'callout-quest': '<div class="sdx-callout sdx-callout-quest"><p><strong>Quest:</strong> Quest details here...</p></div>',
				'callout-loot': '<div class="sdx-callout sdx-callout-loot"><p><strong>Loot:</strong> Treasure description here...</p></div>',
				'callout-npc': '<div class="sdx-callout sdx-callout-npc"><p>"NPC dialogue or quote here..."</p></div>',
				'divider-swords': '<div class="sdx-divider sdx-divider-swords"></div>',
				'divider-stars': '<div class="sdx-divider sdx-divider-stars"></div>',
				'divider-skulls': '<div class="sdx-divider sdx-divider-skulls"></div>',
				'divider-crowns': '<div class="sdx-divider sdx-divider-crowns"></div>',
				'divider-simple': '<div class="sdx-divider sdx-divider-simple"></div>'
			};

			// Store reference to 'this' for use in event handlers
			const editorApp = this;

			// Quick-insert button handlers
			form.querySelectorAll('.sdx-quick-insert-btn[data-insert]').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					const insertType = btn.dataset.insert;
					const snippet = snippets[insertType];
					if (!snippet) return;

					// Try to access ProseMirror through Foundry's editor reference
					// The editors are stored in this.editors by target name
					const contentEditor = editorApp.editors?.content;

					if (contentEditor?.instance) {
						// Foundry v12+ stores the ProseMirror instance
						const pm = contentEditor.instance;
						if (pm.view) {
							const view = pm.view;
							const state = view.state;
							const schema = state.schema;

							// Parse the HTML snippet into ProseMirror nodes
							const domParser = pm.constructor.DOMParser || ProseMirror?.DOMParser;
							if (domParser) {
								try {
									const parser = domParser.fromSchema(schema);
									const tempDiv = document.createElement('div');
									tempDiv.innerHTML = snippet;
									const doc = parser.parse(tempDiv);

									// Create transaction to insert at end of document
									const tr = state.tr;
									const endPos = state.doc.content.size;
									tr.insert(endPos, doc.content);
									view.dispatch(tr);
									view.focus();

									//console.log("SDX Journal: Inserted via ProseMirror transaction");
									return;
								} catch (err) {
									console.warn("SDX Journal: ProseMirror insertion failed:", err);
								}
							}
						}
					}

					// Simply append to the end of the HTML content
					const sourceBtn = form.querySelector('button[data-action="source-code"]');
					if (sourceBtn) {
						//console.log("SDX Journal: Inserting snippet at end");
						sourceBtn.click();

						// Wait for source mode to activate, then insert at end
						setTimeout(() => {
							const textarea = form.querySelector('.editor-content textarea');
							if (textarea) {
								textarea.value = textarea.value + snippet;
								textarea.dispatchEvent(new Event('input', { bubbles: true }));

								// Switch back to rich text mode
								setTimeout(() => sourceBtn.click(), 100);
							}
						}, 100);
					}
				});
			});

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

	CONFIG.Actor.documentClass.prototype.turnLightOn = async function (itemId) {
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

		boxes.each(function () {
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
	renownInput.on('input change blur', function () {
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

	$items.each(function () {
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
				<button type="button" class="sdx-effect-delete" data-tooltip="Delete" title="Delete">
					<i class="fas fa-trash"></i>
				</button>
			</div>
		`);

		// Add controls to the item
		$item.append($controls);

		// Disable right-click context menu
		$item.on('contextmenu', (e) => {
			e.preventDefault();
			e.stopPropagation();
			return false;
		});

		// Edit button
		$controls.find('.sdx-effect-edit').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (item) item.sheet.render(true);
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
	if (actor.type !== "Player" && actor.type !== "NPC") return;

	// Find the active effects section
	const $effectsTab = html.find('.tab[data-tab="tab-effects"]');
	if (!$effectsTab.length) return;

	// Check if we've already injected (avoid duplicates on re-render)
	if ($effectsTab.find('.sdx-conditions-toggles').length) return;

	// Add inline control buttons to existing effects/conditions
	addInlineEffectControls($effectsTab, actor);

	// Fetch all conditions from the compendium
	// First check shadowdark-extras, then shadowdark
	let conditions = [];

	// Try shadowdark-extras first
	const sdxItemsPack = game.packs.get("shadowdark-extras.pack-sdxitems");
	if (sdxItemsPack) {
		const sdxDocs = await sdxItemsPack.getDocuments();
		const sdxConditions = sdxDocs.filter(doc =>
			doc.type === "Effect" &&
			(doc.name.startsWith("Condition:") || doc.name.startsWith("Absorption:"))
		);
		conditions.push(...sdxConditions);
		//console.log(`${MODULE_ID} | Loaded ${sdxConditions.length} conditions from shadowdark-extras`);
	}

	// Then add shadowdark conditions (but don't duplicate)
	const conditionsPack = game.packs.get("shadowdark.conditions");
	if (conditionsPack) {
		const shadowdarkConditions = await conditionsPack.getDocuments();
		// Only add conditions that aren't already in our list (by name)
		const existingNames = new Set(conditions.map(c => c.name));
		const uniqueShadowdarkConditions = shadowdarkConditions.filter(c => !existingNames.has(c.name));
		conditions.push(...uniqueShadowdarkConditions);
		//console.log(`${MODULE_ID} | Loaded ${uniqueShadowdarkConditions.length} unique conditions from shadowdark (${shadowdarkConditions.length} total)`);
	}

	if (!conditions || conditions.length === 0) {
		console.warn(`${MODULE_ID} | No conditions found in either compendium`);
		return;
	}

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

	// Get currently active condition items on the actor
	const conditionItems = actor.items.filter(item =>
		item.type === "Effect" &&
		(item.name.startsWith("Condition:") || item.name.startsWith("Absorption:"))
	);

	// Get the selected theme
	const theme = game.settings.get(MODULE_ID, "conditionsTheme") || "parchment";

	// Build the button HTML
	let togglesHtml = `<div class="sdx-conditions-toggles sdx-theme-${theme}">`;
	togglesHtml += '<h3 class="sdx-conditions-header">Quick Conditions</h3>';
	togglesHtml += '<button class="sdx-add-condition-btn" type="button">';
	togglesHtml += '<i class="fas fa-plus"></i> Add Condition';
	togglesHtml += '</button>';
	togglesHtml += '</div>';

	// Insert after the active effects section
	const $activeEffects = $effectsTab.find('.active-effects, .effects-list').last();
	if ($activeEffects.length) {
		$activeEffects.after(togglesHtml);
	} else {
		// Fallback: append to the tab
		$effectsTab.append(togglesHtml);
	}

	// Attach event handler to the Add Condition button
	const $addConditionBtn = $effectsTab.find('.sdx-add-condition-btn');
	$addConditionBtn.on('click', function (e) {
		e.preventDefault();
		e.stopPropagation();

		if (!actor.isOwner) return;

		showConditionsModal(actor, conditionDataMap, theme);
	});
}

/**
 * Show the conditions modal for selecting/toggling conditions
 */
function showConditionsModal(actor, conditionDataMap, theme) {
	// Remove any existing modal
	$('.sdx-conditions-modal').remove();

	// Get currently active condition items on the actor
	const conditionItems = actor.items.filter(item =>
		item.type === "Effect" &&
		(item.name.startsWith("Condition:") || item.name.startsWith("Absorption:"))
	);

	// Build the modal HTML
	let modalHtml = `
		<div class="sdx-conditions-modal">
			<div class="sdx-conditions-modal-backdrop"></div>
			<div class="sdx-conditions-modal-content sdx-theme-${theme}">
				<div class="sdx-conditions-modal-header">
					<h2>Select Condition</h2>
					<button class="sdx-conditions-modal-close" type="button">
						<i class="fas fa-times"></i>
					</button>
				</div>
				<div class="sdx-conditions-modal-search">
					<input type="text" class="sdx-conditions-search-input" placeholder="Search conditions..." />
				</div>
				<div class="sdx-conditions-modal-grid-container">
					<div class="sdx-conditions-modal-grid">
	`;

	// Flatten all conditions (no grouping)
	const allConditions = [];
	for (const [baseName, conditionGroup] of Object.entries(conditionDataMap)) {
		for (const condition of conditionGroup) {
			// Check if this specific condition is active
			const isActive = conditionItems.some(item =>
				item.name === condition.name ||
				(item._stats?.compendiumSource === condition.uuid) ||
				(item.flags?.core?.sourceId === condition.uuid)
			);

			allConditions.push({
				condition,
				isActive
			});
		}
	}

	// Separate active and inactive
	const activeConditions = allConditions.filter(c => c.isActive);
	const inactiveConditions = allConditions.filter(c => !c.isActive);

	// Sort each group alphabetically by name
	const sortByName = (a, b) => a.condition.name.localeCompare(b.condition.name);
	activeConditions.sort(sortByName);
	inactiveConditions.sort(sortByName);

	// Render active conditions first, then inactive
	const sortedConditions = [...activeConditions, ...inactiveConditions];

	for (const { condition, isActive } of sortedConditions) {
		const displayName = condition.name.replace('Condition: ', '');
		const rawDescription = condition.description || '';
		const processedDescription = rawDescription.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

		modalHtml += `
			<div class="sdx-condition-toggle ${isActive ? 'active' : ''}"
				 data-condition-uuid="${condition.uuid}"
				 data-condition-name="${condition.name}"
				 data-display-name="${displayName}"
				 data-condition-description="${processedDescription}">
				<img src="${condition.img}" alt="${displayName}" />
				<span class="sdx-condition-name">${displayName}</span>
			</div>
		`;
	}

	modalHtml += `
					</div>
				</div>
			</div>
		</div>
	`;

	// Append modal to body
	const $modal = $(modalHtml);
	$('body').append($modal);

	// Get references to modal elements
	const $modalContent = $modal.find('.sdx-conditions-modal-content');
	const $searchInput = $modal.find('.sdx-conditions-search-input');
	const $grid = $modal.find('.sdx-conditions-modal-grid');
	const $toggles = $grid.find('.sdx-condition-toggle');

	// Focus search input
	setTimeout(() => $searchInput.focus(), 100);

	// Close button handler
	$modal.find('.sdx-conditions-modal-close').on('click', () => {
		$modal.remove();
	});

	// Backdrop click handler
	$modal.find('.sdx-conditions-modal-backdrop').on('click', () => {
		$modal.remove();
	});

	// ESC key handler
	$(document).on('keydown.sdx-conditions-modal', (e) => {
		if (e.key === 'Escape') {
			$modal.remove();
			$(document).off('keydown.sdx-conditions-modal');
		}
	});

	// Remove ESC handler when modal is removed
	$modal.on('remove', () => {
		$(document).off('keydown.sdx-conditions-modal');
	});

	// Search/filter handler
	$searchInput.on('input', function () {
		const searchTerm = $(this).val().toLowerCase().trim();

		$grid.find('.sdx-condition-toggle').each(function () {
			const $toggle = $(this);
			const displayName = $toggle.data('display-name') || $toggle.data('condition-name') || '';
			const conditionName = displayName.toString().toLowerCase();

			if (conditionName.includes(searchTerm)) {
				$toggle.show();
			} else {
				$toggle.hide();
			}
		});
	});

	// Condition toggle click handler - use event delegation so it works after re-sorting
	$grid.on('click', '.sdx-condition-toggle', async function (e) {
		e.preventDefault();
		e.stopPropagation();

		if (!actor.isOwner) return;

		const $toggle = $(this);
		const conditionUuid = $toggle.data('condition-uuid');
		const conditionName = $toggle.data('condition-name');
		const isActive = $toggle.hasClass('active');

		if (isActive) {
			await removeConditionFromActor(actor, conditionName, conditionUuid);
			$toggle.removeClass('active');
		} else {
			await addConditionToActor(actor, conditionUuid);
			$toggle.addClass('active');
		}

		// Re-sort conditions: move to top if now active, or to inactive section if now inactive
		refreshModalConditionOrder($grid, actor);
	});
}

/**
 * Refresh the order of conditions in the modal (active ones at top)
 */
function refreshModalConditionOrder($grid, actor) {
	// Get currently active condition items on the actor
	const conditionItems = actor.items.filter(item =>
		item.type === "Effect" &&
		(item.name.startsWith("Condition:") || item.name.startsWith("Absorption:"))
	);

	// Get all toggles from the grid
	const $toggles = $grid.find('.sdx-condition-toggle');

	// Separate toggles into active and inactive
	const activeToggles = [];
	const inactiveToggles = [];

	$toggles.each(function () {
		const $toggle = $(this);
		const conditionUuid = $toggle.data('condition-uuid');
		const conditionName = $toggle.data('condition-name');

		// Update active class based on current actor state
		const isActive = conditionItems.some(item =>
			item.name === conditionName ||
			(item._stats?.compendiumSource === conditionUuid) ||
			(item.flags?.core?.sourceId === conditionUuid)
		);

		// Update the active class
		if (isActive) {
			$toggle.addClass('active');
			activeToggles.push($toggle);
		} else {
			$toggle.removeClass('active');
			inactiveToggles.push($toggle);
		}
	});

	// Sort each group alphabetically by condition name
	const sortByName = (a, b) => {
		const nameA = (a.data('condition-name') || '').toString().toLowerCase();
		const nameB = (b.data('condition-name') || '').toString().toLowerCase();
		return nameA.localeCompare(nameB);
	};

	activeToggles.sort(sortByName);
	inactiveToggles.sort(sortByName);

	// Re-append in order: active first, then inactive
	$grid.empty();
	activeToggles.forEach($toggle => $grid.append($toggle));
	inactiveToggles.forEach($toggle => $grid.append($toggle));
}

/**
 * Show a submenu to select condition variant inside the modal
 */
function showConditionSubmenuInModal($toggle, variants, actor, conditionItems, $grid) {
	// Remove any existing submenu
	$('.sdx-condition-submenu').remove();

	// Get theme for styling
	const theme = game.settings.get(MODULE_ID, "conditionsTheme") || "parchment";

	// Build submenu HTML with theme class
	let submenuHtml = `<div class="sdx-condition-submenu sdx-theme-${theme}">`;

	for (const variant of variants) {
		const isActive = conditionItems.some(item =>
			item.name === variant.name ||
			(item._stats?.compendiumSource === variant.uuid) ||
			(item.flags?.core?.sourceId === variant.uuid)
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

	// Append submenu to body for proper positioning (avoid overflow clipping)
	const $submenu = $(submenuHtml);
	$('body').append($submenu);

	// Get the toggle's position and calculate submenu placement
	const rect = $toggle[0].getBoundingClientRect();
	const submenuHeight = $submenu.outerHeight();
	const spaceBelow = window.innerHeight - rect.bottom;

	// Position the submenu
	$submenu.css({
		'position': 'fixed',
		'left': rect.left + 'px',
		'width': rect.width + 'px',
		'min-width': '120px'
	});

	if (spaceBelow < submenuHeight && rect.top > submenuHeight) {
		// Position above if not enough space below
		$submenu.css('top', (rect.top - submenuHeight) + 'px');
	} else {
		// Position below
		$submenu.css('top', rect.bottom + 'px');
	}

	// Handle submenu item clicks
	$submenu.find('.sdx-submenu-item').on('click', async function (e) {
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

		// Close the submenu
		$submenu.remove();

		// Refresh the modal to update active states and resort
		refreshModalConditionOrder($grid, actor);
	});

	// Close submenu when clicking outside
	setTimeout(() => {
		$(document).one('click', () => {
			$submenu.remove();
		});
	}, 10);
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
function showConditionSubmenu($toggle, variants, actor, conditionItems) {
	/**console.log(`${MODULE_ID} | showConditionSubmenu called`, {
		toggle: $toggle[0],
		variants: variants,
		variantsLength: variants?.length,
		actor: actor?.name
	});*/

	// Check if variants is valid
	if (!variants || variants.length === 0) {
		console.error(`${MODULE_ID} | No variants provided to showConditionSubmenu!`);
		return;
	}

	// Remove any existing submenu
	$('.sdx-condition-submenu').remove();

	// Get theme for styling
	const theme = game.settings.get(MODULE_ID, "conditionsTheme") || "parchment";

	// Build submenu HTML with theme class
	let submenuHtml = `<div class="sdx-condition-submenu sdx-theme-${theme}">`;

	for (const variant of variants) {
		const isActive = conditionItems.some(item =>
			item.name === variant.name ||
			(item._stats?.compendiumSource === variant.uuid) ||
			(item.flags?.core?.sourceId === variant.uuid)
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

	// Append submenu to body for proper positioning (avoid overflow clipping)
	const $submenu = $(submenuHtml);
	$('body').append($submenu);

	// Get the toggle's position and calculate submenu placement
	const rect = $toggle[0].getBoundingClientRect();
	const submenuHeight = $submenu.outerHeight();
	const spaceBelow = window.innerHeight - rect.bottom;

	// Position the submenu
	$submenu.css({
		'position': 'fixed',
		'left': rect.left + 'px',
		'width': rect.width + 'px',
		'min-width': '120px'
	});

	if (spaceBelow < submenuHeight && rect.top > submenuHeight) {
		// Position above if not enough space below
		$submenu.css('top', (rect.top - submenuHeight) + 'px');
	} else {
		// Position below
		$submenu.css('top', rect.bottom + 'px');
	}

	// Handle submenu item clicks
	$submenu.find('.sdx-submenu-item').on('click', async function (e) {
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

		// Check if condition item already exists on actor
		const existingItem = actor.items.find(item => {
			// Check by name
			if (item.name === condition.name) return true;
			// Check by source UUID
			if (item.flags?.core?.sourceId === conditionUuid) return true;
			if (item._stats?.compendiumSource === conditionUuid) return true;
			return false;
		});

		if (existingItem) {
			//console.log(`${MODULE_ID} | Condition ${condition.name} already exists as item`);
			return;
		}

		// Create the condition item on the actor
		const itemData = condition.toObject();
		// Set source tracking
		itemData.flags = itemData.flags || {};
		itemData.flags.core = itemData.flags.core || {};
		itemData.flags.core.sourceId = conditionUuid;
		itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};
		itemData.flags[MODULE_ID].conditionToggle = true;

		await actor.createEmbeddedDocuments("Item", [itemData]);
		ui.notifications.info(`Applied: ${condition.name}`);
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
		// Find the condition item(s) matching this condition
		const itemsToRemove = actor.items.filter(item =>
			item.name === conditionName ||
			(item.flags?.core?.sourceId === conditionUuid) ||
			(item._stats?.compendiumSource === conditionUuid) ||
			(item.getFlag(MODULE_ID, "conditionToggle") && item.name === conditionName)
		);

		if (itemsToRemove.length > 0) {
			const ids = itemsToRemove.map(item => item.id);
			await actor.deleteEmbeddedDocuments("Item", ids);
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

	// Get condition items instead of effects
	const conditionItems = actor.items.filter(item =>
		item.type === "Effect" &&
		(item.name.startsWith("Condition:") || item.name.startsWith("Absorption:"))
	);

	$toggles.each(function () {
		const $toggle = $(this);
		const conditionUuid = $toggle.data('condition-uuid');
		const conditionName = $toggle.data('condition-name');

		// Check multiple ways to match the condition (now checking items)
		const isActive = conditionItems.some(item => {
			// Direct name match
			if (item.name === conditionName) return true;

			// Source ID match (prefer new _stats.compendiumSource)
			if (item._stats?.compendiumSource === conditionUuid) return true;
			if (item.flags?.core?.sourceId === conditionUuid) return true;

			// Case-insensitive name match
			if (item.name?.toLowerCase() === conditionName?.toLowerCase()) return true;

			// Check if the item name contains the condition name
			if (item.name?.toLowerCase().includes(conditionName?.toLowerCase())) return true;

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
	$abilitiesTab.find('.attack .rollable').each(function () {
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
	html.find('.attack .rollable').each(function () {
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

	$items.each(function () {
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

	// Find the "Spells From Items" banner to detect which items should NOT have action buttons
	const $spellsFromItemsBanner = $spellsTab.find('.SD-banner').filter(function () {
		return $(this).text().trim().includes('Spells From Items');
	});

	// Get all elements after the "Spells From Items" banner (these should not have action buttons)
	const itemsFromWandsScrolls = new Set();
	if ($spellsFromItemsBanner.length > 0) {
		$spellsFromItemsBanner.nextAll().find('.item[data-item-id]').each(function () {
			itemsFromWandsScrolls.add($(this).data('item-id'));
		});
	}

	// Add action buttons to spell items
	$spellsTab.find('.item[data-item-id]').each((i, item) => {
		const $item = $(item);
		const itemId = $item.data('item-id');

		// Skip if buttons already added
		if ($item.find('.sdx-spell-actions').length) return;

		// Skip if this item is from a wand/scroll (comes after "Spells From Items" banner)
		if (itemsFromWandsScrolls.has(itemId)) {
			return;
		}

		// Find the item-name element
		const $itemName = $item.find('.item-name');
		if (!$itemName.length) return;

		// Create action buttons container
		const $actions = $(`
			<div class="sdx-spell-actions">
				<a class="sdx-spell-btn sdx-edit-spell" data-tooltip="Edit" title="Edit">
					<i class="fas fa-edit"></i>
				</a>
				<a class="sdx-spell-btn sdx-create-macro" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.macro.create_tooltip")}" title="${game.i18n.localize("SHADOWDARK_EXTRAS.macro.create_tooltip")}">
					<i class="fas fa-scroll"></i>
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

		// Create Macro button handler
		$actions.find('.sdx-create-macro').on('click', async (e) => {
			e.preventDefault();
			e.stopPropagation();
			const item = actor.items.get(itemId);
			if (!item) return;
			await createItemMacro(actor, item);
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
				content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.inventory.delete_spell_text", { name: item.name })}</p>`
			});

			if (confirmed) {
				await item.delete();
			}
		});
	});
}

/**
 * Create a macro for a spell, wand, or scroll item
 * For focus spells, asks the user if they want a Cast or Focus macro
 * @param {Actor} actor - The actor that owns the item
 * @param {Item} item - The spell/wand/scroll item
 */
async function createItemMacro(actor, item) {
	const itemType = item.type;
	const isFocusSpell = item.system?.duration?.type === "focus";
	const actorId = actor.id;
	const itemId = item.id;
	const itemName = item.name;
	const itemImg = item.img;

	// Determine the action type based on item type
	let actionType = "cast"; // default for Spell
	if (itemType === "Wand") {
		actionType = "wand";
	} else if (itemType === "Scroll") {
		actionType = "scroll";
	}

	// For focus spells, ask if they want Cast or Focus macro
	if (isFocusSpell && itemType === "Spell") {
		const choice = await new Promise((resolve) => {
			new Dialog({
				title: game.i18n.localize("SHADOWDARK_EXTRAS.macro.focus_choice_title"),
				content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.macro.focus_choice_content", { name: itemName })}</p>`,
				buttons: {
					cast: {
						icon: '<i class="fas fa-magic"></i>',
						label: game.i18n.localize("SHADOWDARK_EXTRAS.macro.cast_spell"),
						callback: () => resolve("cast")
					},
					focus: {
						icon: '<i class="fas fa-brain"></i>',
						label: game.i18n.localize("SHADOWDARK_EXTRAS.macro.focus_roll"),
						callback: () => resolve("focus")
					},
					cancel: {
						icon: '<i class="fas fa-times"></i>',
						label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.cancel"),
						callback: () => resolve(null)
					}
				},
				default: "cast"
			}).render(true);
		});

		if (!choice) return; // User cancelled
		actionType = choice;
	}

	// Build the macro command based on action type
	let command;
	let macroName;

	switch (actionType) {
		case "cast":
			command = `// Cast ${itemName}
const actor = game.actors.get("${actorId}");
if (!actor) {
	ui.notifications.error("Actor not found!");
	return;
}
const item = actor.items.get("${itemId}");
if (!item) {
	ui.notifications.error("Spell not found on actor!");
	return;
}
actor.castSpell("${itemId}");`;
			macroName = `${game.i18n.localize("SHADOWDARK_EXTRAS.macro.cast_prefix")} ${itemName}`;
			break;

		case "focus":
			command = `// Focus Roll for ${itemName}
const actor = game.actors.get("${actorId}");
if (!actor) {
	ui.notifications.error("Actor not found!");
	return;
}
const item = actor.items.get("${itemId}");
if (!item) {
	ui.notifications.error("Spell not found on actor!");
	return;
}
actor.castSpell("${itemId}", { isFocusRoll: true });`;
			macroName = `${game.i18n.localize("SHADOWDARK_EXTRAS.macro.focus_prefix")} ${itemName}`;
			break;

		case "wand":
			command = `// Use Wand: ${itemName}
const actor = game.actors.get("${actorId}");
if (!actor) {
	ui.notifications.error("Actor not found!");
	return;
}
const item = actor.items.get("${itemId}");
if (!item) {
	ui.notifications.error("Wand not found on actor!");
	return;
}
actor.useWand("${itemId}");`;
			macroName = `${game.i18n.localize("SHADOWDARK_EXTRAS.macro.wand_prefix")} ${itemName}`;
			break;

		case "scroll":
			command = `// Use Scroll: ${itemName}
const actor = game.actors.get("${actorId}");
if (!actor) {
	ui.notifications.error("Actor not found!");
	return;
}
const item = actor.items.get("${itemId}");
if (!item) {
	ui.notifications.error("Scroll not found on actor!");
	return;
}
actor.useScroll("${itemId}");`;
			macroName = `${game.i18n.localize("SHADOWDARK_EXTRAS.macro.scroll_prefix")} ${itemName}`;
			break;

		default:
			return;
	}

	// Create the macro
	const macro = await Macro.create({
		name: macroName,
		type: "script",
		scope: "global",
		img: itemImg,
		command: command,
		flags: {
			"shadowdark-extras": {
				itemMacro: true,
				actorId: actorId,
				itemId: itemId,
				itemType: itemType,
				actionType: actionType
			}
		}
	});

	ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.macro.created", { name: macroName }));
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

	// Style light toggle icons based on active state
	html.find('[data-action="toggle-light"]').each(function () {
		const $toggle = $(this);
		const itemId = $toggle.data('item-id');
		const item = actor.items.get(itemId);

		if (item?.system?.light?.active) {
			// Light is active - add glow effect
			$toggle.find('i').addClass('sdx-light-active');
			$toggle.addClass('sdx-light-toggle-active');
		} else {
			// Light is not active - ensure classes are removed
			$toggle.find('i').removeClass('sdx-light-active');
			$toggle.removeClass('sdx-light-toggle-active');
		}
	});
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
	// Wave translate: at 100% HP waves are hidden (translateY 85%), at 0% HP fully visible (translateY 0%)
	const hpWaveTranslate = Math.max(0, Math.round(hpPercent) - 15);
	const hpWaveClass = hpPercent >= 100 ? 'hp-full' : (hpPercent <= 0 ? 'hp-dead' : '');
	// Get wave color based on ancestry settings (pass resolved ancestryName)
	const hpWaveColor = getHpWaveColor(actor, ancestryName);
	const hpWavesEnabled = isHpWavesEnabled();

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
			</div>
		`;
	}

	// Calculate initiative modifier with proper sign
	const initMod = abilities.dex?.mod ?? 0;
	const initModSign = initMod >= 0 ? '+' : '';

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

	// Build HP waves HTML if enabled
	const hpWavesHtml = hpWavesEnabled ? `
				<div class="hp-wave-container ${hpWaveClass}" style="--hp-translate: ${hpWaveTranslate}%; --hp-wave-color: ${hpWaveColor}; border-radius: 0;">
					<svg class="hp-waves" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 100" preserveAspectRatio="none">
						<path class="wave-path" d="M0 5 C 100 0, 200 10, 300 5 C 400 0, 500 10, 600 5 V 100 H 0 Z"/>
						<path class="wave-path" d="M0 10 C 100 15, 200 5, 300 10 C 400 15, 500 5, 600 10 V 100 H 0 Z"/>
						<path class="wave-path" d="M0 15 C 100 10, 200 20, 300 15 C 400 10, 500 20, 600 15 V 100 H 0 Z"/>
						<path class="wave-path" d="M0 20 C 100 25, 200 15, 300 20 C 400 25, 500 15, 600 20 V 100 H 0 Z"/>
					</svg>
				</div>` : '';

	// Build the enhanced header content
	const enhancedContent = `
		<div class="sdx-enhanced-content">
			<div class="sdx-portrait-container">
				<img class="sdx-portrait" src="${actor.img}" data-edit="img" data-tooltip="${actor.name}" />
				${hpWavesHtml}
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
						<div class="sdx-ac-label">AC</div>
						<div class="sdx-ac-value">${ac}</div>
					</div>
					
					<div class="sdx-abilities-container">
						${abilitiesHtml}
					</div>
					
					<div class="sdx-right-stats">
						<div class="sdx-init-container" data-tooltip="Initiative" data-ability="dex">
							<div class="sdx-init-mod">${initModSign}${initMod}</div>
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

		// If ctrl is held, open ImagePopout (Show to Players)
		if (e.ctrlKey) {
			new ImagePopout(actor.img, {
				title: actor.name,
				uuid: actor.uuid
			}).render(true);
			return;
		}

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
					//console.log("shadowdark-extras | Tokenizer response:", response);
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
			// Don't create input if it already exists
			if ($luckContainer.find('.sdx-luck-input').length > 0) return;

			const currentLuck = sys.luck?.remaining ?? 0;

			// Create inline input
			const $input = $(`<input type="number" class="sdx-luck-input" value="${currentLuck}" min="0" />`);
			$luckValue.replaceWith($input);
			$input.focus().select();

			const saveLuck = async () => {
				const newLuck = Math.max(0, parseInt($input.val()) || 0);
				// Restore the luck value display with panel background
				const $newLuckValue = $(`<div class="sdx-luck-value">${newLuck}</div>`);
				$input.replaceWith($newLuckValue);
				// Update the actor data
				await actor.update({ "system.luck.remaining": newLuck });
			};

			$input.on('blur', saveLuck);
			$input.on('keydown', (e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					$input.blur();
				} else if (e.key === 'Escape') {
					// Restore original value display without saving
					const $newLuckValue = $(`<div class="sdx-luck-value">${currentLuck}</div>`);
					$input.replaceWith($newLuckValue);
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
	$enhancedContent.find('.sdx-actor-name').on('change', async function () {
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
	$enhancedContent.find('.sdx-ability').on('click', async function () {
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
				await game.combat.rollInitiative(combatant.id, { updateTurn: false });
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
	// Get actor-specific background first
	let headerBg = actor.getFlag(MODULE_ID, "headerBackground");
	let isDefaultBg = false;

	// If no actor-specific background, check for default background
	if (!headerBg) {
		const enableDefaultBg = game.settings.get(MODULE_ID, "enableDefaultHeaderBg");
		const defaultBgPath = game.settings.get(MODULE_ID, "defaultHeaderBgPath");
		if (enableDefaultBg && defaultBgPath) {
			headerBg = defaultBgPath;
			isDefaultBg = true;
		}
	}
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
		const totalHeight = (navRect.bottom - formRect.top) + 30;
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
					//console.log("shadowdark-extras | Tokenizer response:", response);
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
	// Get party-specific background first
	let headerBg = actor.getFlag(MODULE_ID, "partyHeaderBackground");
	let isDefaultBg = false;

	// If no party-specific background, check for default background
	if (!headerBg) {
		const enableDefaultBg = game.settings.get(MODULE_ID, "enableDefaultHeaderBg");
		const defaultBgPath = game.settings.get(MODULE_ID, "defaultHeaderBgPath");
		if (enableDefaultBg && defaultBgPath) {
			headerBg = defaultBgPath;
			isDefaultBg = true;
		}
	}

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
		const hasCoinsInput = $(el).find('input[name*="coins"]').length > 0;
		return hasCoinsInput;
	});

	if (coinsBox.length === 0) return;

	// Find the empty span in the header and add the buttons
	const headerSpan = coinsBox.find('.header span').first();
	if (headerSpan.length === 0) return;

	// Check if there are other players/Party to transfer to
	const hasTransferTargets = game.actors.some(a => {
		if (a.id === actor.id) return false;
		const isParty = a.type === "NPC" && a.getFlag(MODULE_ID, "isParty");
		if (a.type !== "Player" && !isParty) return false;
		if (!isParty) {
			return game.users.some(u => a.testUserPermission(u, "OWNER"));
		}
		return true;
	});

	// Build buttons HTML - Add + Transfer
	let buttonsHtml = `<a class="sdx-add-coins-btn" data-action="add-coins" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.party.add_coins_title")}"><i class="fas fa-plus"></i></a>`;

	// Only add transfer button if there are targets
	if (hasTransferTargets) {
		buttonsHtml += `<a class="sdx-transfer-coins-btn" data-action="transfer-coins" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_coins_title")}" style="margin-left: 6px;"><i class="fas fa-share"></i></a>`;
	}

	headerSpan.html(buttonsHtml);

	// Attach click handler for add coins
	coinsBox.find('[data-action="add-coins"]').on("click", async (event) => {
		event.preventDefault();
		await showAddCoinsDialog(actor);
	});

	// Attach click handler for transfer coins
	coinsBox.find('[data-action="transfer-coins"]').on("click", async (event) => {
		event.preventDefault();
		const result = await showCoinTransferDialog(actor);
		if (result) {
			await transferCoinsToPlayer(actor, result.coins, result.targetActorId);
		}
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
 * Get NPC coins from system data
 */
function getNpcCoins(actor) {
	return {
		gp: actor.system?.coins?.gp ?? 0,
		sp: actor.system?.coins?.sp ?? 0,
		cp: actor.system?.coins?.cp ?? 0
	};
}

function calculateNpcCoinSlots(coins) {
	const gp = Number(coins?.gp ?? 0) || 0;
	const sp = Number(coins?.sp ?? 0) || 0;
	const cp = Number(coins?.cp ?? 0) || 0;
	const totalGpValue = gp + sp / 10 + cp / 100;
	return Math.max(0, Math.floor(totalGpValue / 100));
}

// ============================================
// NPC CREATURE TYPE DROPDOWN
// ============================================

// Note: Creature types are now managed dynamically via getCreatureTypes() from CreatureTypesApp.mjs

/**
 * Inject the creature type dropdown into NPC sheets
 * @param {Application} app - The NPC sheet application
 * @param {jQuery|HTMLElement} html - The rendered HTML
 * @param {Actor} actor - The NPC actor
 */
function injectNpcCreatureType(app, html, actor) {
	//console.log(`${MODULE_ID} | injectNpcCreatureType called for ${actor.name}`);

	// Check if feature is enabled
	try {
		const enabled = game.settings.get(MODULE_ID, "enableNpcCreatureType");
		//console.log(`${MODULE_ID} | enableNpcCreatureType setting: ${enabled}`);
		if (!enabled) return;
	} catch (e) {
		console.warn(`${MODULE_ID} | Setting enableNpcCreatureType not registered or failed`, e);
		return;
	}

	// Only for GM
	if (!game.user?.isGM) return;

	// Handle both plain DOM element and jQuery object (for V13 compatibility)
	const $html = html instanceof HTMLElement ? $(html) : html;
	const currentType = actor.getFlag(MODULE_ID, "creatureType") || "";

	//console.log(`${MODULE_ID} | Current creature type: "${currentType}"`);

	// Build the options HTML using dynamic creature types
	const creatureTypes = getCreatureTypes();
	const optionsHtml = creatureTypes.map(type => {
		const selected = type === currentType ? "selected" : "";
		const label = type || game.i18n.localize("SHADOWDARK_EXTRAS.npc.creature_type.none");
		return `<option value="${type}" ${selected}>${label}</option>`;
	}).join("");

	// Create the creature type box HTML
	const creatureTypeHtml = `
		<div class="SD-box sdx-creature-type-box">
			<div class="header">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.npc.creature_type.label")}</label>
			</div>
			<div class="content">
				<select class="sdx-creature-type-select" name="flags.${MODULE_ID}.creatureType">
					${optionsHtml}
				</select>
			</div>
		</div>
	`;

	// Find the attacks box (first SD-box in grid-1-columns on the right side)
	const $gridRight = $html.find('.grid-1-columns');
	//console.log(`${MODULE_ID} | Found ${$gridRight.length} elements with .grid-1-columns`);

	const $attacksBox = $gridRight.find('.SD-box').first();
	//console.log(`${MODULE_ID} | Found ${$attacksBox.length} potential attack boxes`);

	if ($attacksBox.length) {
		// Insert before the attacks box
		$attacksBox.before(creatureTypeHtml);
		//console.log(`${MODULE_ID} | Injected creature type box`);

		// Attach change handler
		$html.find('.sdx-creature-type-select').on('change', async function (e) {
			const newType = $(this).val();
			//console.log(`${MODULE_ID} | Changing creature type to: ${newType}`);
			await actor.setFlag(MODULE_ID, "creatureType", newType);
			ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.npc.creature_type.updated", {
				name: actor.name,
				type: newType || game.i18n.localize("SHADOWDARK_EXTRAS.npc.creature_type.none")
			}));
		});
	} else {
		console.warn(`${MODULE_ID} | Could not find attacks box to insert creature type box`);
		// Fallback: try to find any SD-box in the main content
		const $anyBox = $html.find('.SD-box').first();
		if ($anyBox.length) {
			$anyBox.before(creatureTypeHtml);
			//console.log(`${MODULE_ID} | Injected creature type box using fallback`);
		}
	}
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
			await item.update({ "system.quantity": newQty });
		}
	});

	// Decrement item quantity
	html.find('[data-action="npc-item-decrement"]').click(async (event) => {
		event.preventDefault();
		const itemId = event.currentTarget.dataset.itemId;
		const item = actor.items.get(itemId);
		if (item && item.system.quantity > 1) {
			const newQty = item.system.quantity - 1;
			await item.update({ "system.quantity": newQty });
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

	shadowdark.utils.toggleItemDetails = async function (target) {
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

	//console.log(`${MODULE_ID} | Patched toggleItemDetails for unidentified items`);
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
	tracker._gatherLightSources = async function () {
		// Call the original method first
		await originalGatherLightSources();

		// Track if we added anything
		let addedPartyActors = false;

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
				addedPartyActors = true;
			}
		}

		// Only re-sort if we actually added party actors
		if (addedPartyActors) {
			this.monitoredLightSources.sort((a, b) => {
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
				return 0;
			});
		}
	};

	//console.log(`${MODULE_ID} | Patched Light Source Tracker to include Party actors`);
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
	CONFIG.Actor.documentClass.prototype._getSheetClass = function () {
		// Check if this is a party actor
		if (isPartyActor(this)) {
			return PartySheetSD;
		}
		return originalGetSheetClass.call(this);
	};

	//console.log(`${MODULE_ID} | Party sheet registered`);
}

/**
 * Register the AppV2 Potion item sheet
 */
function registerPotionSheet() {
	// Register the Potion sheet for Potion type items
	Items.registerSheet(MODULE_ID, PotionSheetSD, {
		types: ["Potion"],
		makeDefault: true,
		label: "Shadowdark Extras: Potion Sheet"
	});

	//console.log(`${MODULE_ID} | Potion sheet registered`);
}

/**
 * Register the AppV2 Background item sheet
 */
function registerBackgroundSheet() {
	// Register the Background sheet for Background type items
	Items.registerSheet(MODULE_ID, BackgroundSheetSD, {
		types: ["Background"],
		makeDefault: true,
		label: "Shadowdark Extras: Background Sheet"
	});

	//console.log(`${MODULE_ID} | Background sheet registered`);
}

/**
 * Register the AppV2 NPC Attack item sheet
 */
function registerNPCAttackSheet() {
	// Register the NPC Attack sheet for NPC Attack type items
	Items.registerSheet(MODULE_ID, NPCAttackSheetSD, {
		types: ["NPC Attack"],
		makeDefault: true,
		label: "Shadowdark Extras: NPC Attack Sheet"
	});

	//console.log(`${MODULE_ID} | NPC Attack sheet registered`);
}

/**
 * Register the AppV2 NPC Feature item sheet
 */
function registerNPCFeatureSheet() {
	// Register the NPC Feature sheet for NPC Feature and NPC Spell type items
	Items.registerSheet(MODULE_ID, NPCFeatureSheetSD, {
		types: ["NPC Feature", "NPC Spell"],
		makeDefault: true,
		label: "Shadowdark Extras: NPC Feature/Spell Sheet"
	});

	//console.log(`${MODULE_ID} | NPC Feature sheet registered`);
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
		//console.log(`${MODULE_ID} | Added Party option to actor type select`);
	} else {
		// Fallback: append to the end
		typeSelect.append(`<option value="Party">${game.i18n.localize("SHADOWDARK_EXTRAS.party.name")}</option>`);
		//console.log(`${MODULE_ID} | Added Party option to actor type select (appended)`);
	}

	// Also intercept form submission to convert Party to NPC before it's sent
	const form = typeSelect.closest('form');
	if (form.length > 0 && !form.data('party-intercepted')) {
		form.data('party-intercepted', true);
		form.on('submit', function (e) {
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

	CONFIG.Actor.documentClass.create = async function (data, options = {}) {
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

	//console.log(`${MODULE_ID} | Wrapped Actor.create to handle Party type`);
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
	app._onDrop = async function (event) {
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
		//console.log(`${MODULE_ID} | Transferring ${item.name} from ${sourceActor.name} to ${targetActor.name}`);

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
 * Transfer coins to another player's character using Item Piles API
 */
async function transferCoinsToPlayer(sourceActor, coins, targetActorId) {
	if (!sourceActor || !coins) return;

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

	// Validate source has enough coins
	const sourceCoins = sourceActor.system?.coins || {};
	if ((coins.gp || 0) > (sourceCoins.gp || 0) ||
		(coins.sp || 0) > (sourceCoins.sp || 0) ||
		(coins.cp || 0) > (sourceCoins.cp || 0)) {
		ui.notifications.error(
			game.i18n.localize("SHADOWDARK_EXTRAS.notifications.not_enough_coins_transfer")
		);
		return;
	}

	try {
		//console.log(`${MODULE_ID} | Transferring coins from ${sourceActor.name} to ${targetActor.name}:`, coins);

		// Build attributes for Item Piles transferAttributes API
		const attributes = {};
		if (coins.gp > 0) attributes["system.coins.gp"] = coins.gp;
		if (coins.sp > 0) attributes["system.coins.sp"] = coins.sp;
		if (coins.cp > 0) attributes["system.coins.cp"] = coins.cp;

		// Use Item Piles API to transfer the currency
		const result = await game.itempiles.API.transferAttributes(
			sourceActor,
			targetActor,
			attributes,
			{ interactionId: false }
		);

		if (result) {
			// Build a human-readable coins string
			const coinParts = [];
			if (coins.gp > 0) coinParts.push(`${coins.gp} GP`);
			if (coins.sp > 0) coinParts.push(`${coins.sp} SP`);
			if (coins.cp > 0) coinParts.push(`${coins.cp} CP`);
			const coinsStr = coinParts.join(", ");

			ui.notifications.info(
				game.i18n.format("SHADOWDARK_EXTRAS.notifications.coins_transferred", {
					coins: coinsStr,
					target: targetActor.name
				})
			);
		} else {
			console.warn(`${MODULE_ID} | Coin transfer returned no results`);
			ui.notifications.warn("Transfer may not have completed successfully.");
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error during coin transfer:`, error);
		ui.notifications.error(
			game.i18n.localize("SHADOWDARK_EXTRAS.notifications.transfer_failed")
		);
	}
}

/**
 * Show dialog to select target player and coin amounts for transfer
 * Similar to showTransferDialog but for coins instead of items
 */
async function showCoinTransferDialog(sourceActor) {
	// Get all player characters that are not the source actor and have an owner
	const allPlayers = game.actors.filter(a => {
		if (a.id === sourceActor.id) return false;
		// Include Player type actors and Party type actors (NPC type with party flag)
		const isParty = a.type === "NPC" && a.getFlag(MODULE_ID, "isParty");
		if (a.type !== "Player" && !isParty) return false;
		// For players, check if the actor has any owner who can receive the coins
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

	// Get source actor's coins for validation
	const sourceCoins = {
		gp: sourceActor.system?.coins?.gp ?? 0,
		sp: sourceActor.system?.coins?.sp ?? 0,
		cp: sourceActor.system?.coins?.cp ?? 0
	};

	// Categorize actors and build searchable data
	const partyActors = allPlayers.filter(a => a.type === "NPC" && a.getFlag(MODULE_ID, "isParty"));
	const connectedAssigned = allPlayers.filter(a => {
		if (a.type !== "Player") return false;
		return game.users.some(u => u.active && u.character?.id === a.id);
	});
	const otherPlayers = allPlayers.filter(a => {
		if (a.type !== "Player") return false;
		return !game.users.some(u => u.active && u.character?.id === a.id);
	});

	// Build options HTML
	let optionsHtml = '';

	if (partyActors.length > 0) {
		optionsHtml += `<optgroup label="📦 Party Storage" data-group="party">`;
		for (const p of partyActors) {
			optionsHtml += `<option value="${p.id}" data-search="${p.name.toLowerCase()}">🎒 ${p.name}</option>`;
		}
		optionsHtml += `</optgroup>`;
	}

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

	if (otherPlayers.length > 0) {
		optionsHtml += `<optgroup label="⚪ Other Characters" data-group="other">`;
		for (const p of otherPlayers) {
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
					${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.filter_connected")}
				</label>
			</div>
			<div class="form-group" style="margin-bottom: 8px;">
				<label>Search:</label>
				<input type="text" id="sdx-transfer-search" placeholder="Type to filter by name..." 
				       style="width: 100%;" autocomplete="off" />
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.select_recipient")}</label>
				<select name="targetActorId" id="sdx-transfer-target" style="width: 100%; min-height: 150px;" size="8">
					${optionsHtml}
				</select>
			</div>
			<hr style="margin: 12px 0;" />
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_coins_amount")}</label>
				<div style="display: flex; gap: 12px; margin-top: 4px;">
					<div style="flex: 1; text-align: center;">
						<input type="number" name="gp" id="sdx-coin-gp" value="0" min="0" max="${sourceCoins.gp}" 
						       style="width: 100%; text-align: center;" />
						<label style="font-size: 0.85em; color: #c9a227;">GP (${sourceCoins.gp})</label>
					</div>
					<div style="flex: 1; text-align: center;">
						<input type="number" name="sp" id="sdx-coin-sp" value="0" min="0" max="${sourceCoins.sp}" 
						       style="width: 100%; text-align: center;" />
						<label style="font-size: 0.85em; color: #aaa;">SP (${sourceCoins.sp})</label>
					</div>
					<div style="flex: 1; text-align: center;">
						<input type="number" name="cp" id="sdx-coin-cp" value="0" min="0" max="${sourceCoins.cp}" 
						       style="width: 100%; text-align: center;" />
						<label style="font-size: 0.85em; color: #b87333;">CP (${sourceCoins.cp})</label>
					</div>
				</div>
			</div>
			<p style="font-size: 0.9em; opacity: 0.8; margin-top: 12px;">
				${game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_coins_warning")}
			</p>
		</form>
	`;

	return new Promise((resolve) => {
		const dialog = new Dialog({
			title: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer_coins_title"),
			content: content,
			buttons: {
				transfer: {
					icon: '<i class="fas fa-coins"></i>',
					label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.transfer"),
					callback: (html) => {
						const targetActorId = html.find('[name="targetActorId"]').val();
						const gp = parseInt(html.find('#sdx-coin-gp').val()) || 0;
						const sp = parseInt(html.find('#sdx-coin-sp').val()) || 0;
						const cp = parseInt(html.find('#sdx-coin-cp').val()) || 0;

						// Validate at least some coins are being transferred
						if (gp <= 0 && sp <= 0 && cp <= 0) {
							ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.dialog.no_coins_selected"));
							resolve(null);
							return;
						}

						resolve({ targetActorId, coins: { gp, sp, cp } });
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

				const updateFilter = () => {
					const showOnlyConnected = $filterCheckbox.is(':checked');
					const searchText = $searchInput.val().toLowerCase().trim();

					$select.find('optgroup').each(function () {
						const $group = $(this);
						const groupType = $group.data('group');

						if (groupType === 'other' && showOnlyConnected) {
							$group.hide();
							return;
						}

						let visibleCount = 0;
						$group.find('option').each(function () {
							const $option = $(this);
							const optionSearch = $option.data('search') || '';

							if (searchText === '' || optionSearch.includes(searchText)) {
								$option.show();
								visibleCount++;
							} else {
								$option.hide();
							}
						});

						$group.toggle(visibleCount > 0);
					});

					const $selectedOption = $select.find('option:selected');
					if (!$selectedOption.is(':visible') || $selectedOption.parent('optgroup').is(':hidden')) {
						$select.find('option:visible').first().prop('selected', true);
					}
				};

				updateFilter();
				$filterCheckbox.on('change', updateFilter);
				$searchInput.on('input', updateFilter);

				// Validate coin inputs don't exceed available
				html.find('#sdx-coin-gp, #sdx-coin-sp, #sdx-coin-cp').on('change', function () {
					const max = parseInt(this.max) || 0;
					let val = parseInt(this.value) || 0;
					if (val < 0) val = 0;
					if (val > max) val = max;
					this.value = val;
				});

				setTimeout(() => $searchInput.focus(), 100);
			}
		}).render(true);
	});
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
			<p>${game.i18n.format("SHADOWDARK_EXTRAS.dialog.transfer_item_warning", { item: item.name })}</p>
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

					$select.find('optgroup').each(function () {
						const $group = $(this);
						const groupType = $group.data('group');

						// First, apply connected filter to groups
						if (groupType === 'other' && showOnlyConnected) {
							$group.hide();
							return;
						}

						// Then apply search filter to options within visible groups
						let visibleCount = 0;
						$group.find('option').each(function () {
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
	PlayerSheetSD.prototype._getItemContextOptions = function () {
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
// CHARACTER GENERATOR ROLL PATCH
// ============================================

/**
 * Patch CharacterGeneratorSD to show dice rolls in chat
 * So all players can see character generation results
 */
function patchCharacterGeneratorRolls() {
	// Get the CharacterGeneratorSD class from the shadowdark namespace
	const CharacterGeneratorSD = CONFIG.SHADOWDARK?.applications?.CharacterGeneratorSD
		|| globalThis.shadowdark?.apps?.CharacterGeneratorSD
		|| game.shadowdark?.apps?.CharacterGeneratorSD;

	if (!CharacterGeneratorSD) {
		console.warn(`${MODULE_ID} | CharacterGeneratorSD not found, skipping roll patch`);
		return;
	}

	// Correct ability order: STR, DEX, CON, INT, WIS, CHA
	const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];
	const ABILITY_NAMES = {
		str: "Strength",
		dex: "Dexterity",
		con: "Constitution",
		int: "Intelligence",
		wis: "Wisdom",
		cha: "Charisma"
	};

	// Override _randomizeStats to use correct order and show per-ability rolls
	// If no ability reaches 14+, all results are colored red
	CharacterGeneratorSD.prototype._randomizeStats = async function () {
		// Roll all abilities first (silently)
		const rolls = {};
		let hasHighStat = false;

		for (const key of ABILITY_ORDER) {
			const roll = await new Roll("3d6").evaluate();
			rolls[key] = roll;
			if (roll._total >= 14) hasHighStat = true;
		}

		// Collect message IDs if we need to update them
		const messageIds = [];

		// Send messages one at a time - ChatMessage with rolls array triggers DSN automatically
		for (const key of ABILITY_ORDER) {
			const roll = rolls[key];

			// Create chat message - DSN hooks into this automatically
			const messageData = {
				speaker: ChatMessage.getSpeaker({ user: game.user }),
				flavor: `<b>Character Generator</b> - ${ABILITY_NAMES[key]}`,
				type: CONST.CHAT_MESSAGE_TYPES.ROLL,
				rolls: [roll]
			};

			const message = await ChatMessage.create(messageData);
			if (message) {
				messageIds.push(message.id);
			}

			this.formData.actor.system.abilities[key].base = roll._total;
		}

		// If no high stat, update all messages to show red totals
		if (!hasHighStat) {
			// Small delay to let messages render
			setTimeout(() => {
				for (const msgId of messageIds) {
					const msgElement = document.querySelector(`[data-message-id="${msgId}"] .dice-total`);
					if (msgElement) {
						msgElement.style.color = "#cc0000";
						msgElement.style.fontWeight = "bold";
					}
				}
			}, 100);
		}

		this._calculateModifiers();
	};

	// Override _randomizeGold to show gold roll
	CharacterGeneratorSD.prototype._randomizeGold = async function () {
		const roll = await new Roll("2d6").evaluate();
		const startingGold = roll._total * 5;

		// roll.toMessage triggers DSN automatically via Foundry hooks
		await roll.toMessage({
			speaker: ChatMessage.getSpeaker({ user: game.user }),
			flavor: `<b>Character Generator</b> - Starting Gold (×5 = ${startingGold} GP)`
		});

		this.formData.actor.system.coins.gp = startingGold;
	};

	// Override _randomizeAlignment to show alignment roll
	CharacterGeneratorSD.prototype._randomizeAlignment = async function () {
		const roll = await new Roll("d6").evaluate();
		let alignment;

		switch (roll._total) {
			case 1:
			case 2:
			case 3:
				alignment = "lawful";
				break;
			case 4:
			case 5:
				alignment = "neutral";
				break;
			default:
				alignment = "chaotic";
		}

		// roll.toMessage triggers DSN automatically via Foundry hooks
		await roll.toMessage({
			speaker: ChatMessage.getSpeaker({ user: game.user }),
			flavor: `<b>Character Generator</b> - Alignment (${alignment.charAt(0).toUpperCase() + alignment.slice(1)})`
		});

		this.formData.actor.system.alignment = alignment;
	};

	console.log(`${MODULE_ID} | Patched CharacterGeneratorSD to show rolls in chat`);
}

// ============================================
// HOOKS
// ============================================

// Initialize when Foundry is ready
Hooks.once("init", () => {
	//console.log(`${MODULE_ID} | Initializing Shadowdark Extras`);

	// Initialize Automated Animations integration
	initAutoAnimationsIntegration();

	// Patch CharacterGeneratorSD to show rolls in chat
	patchCharacterGeneratorRolls();

	// Initialize SDX Rolls
	initSDXROLLS();

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
		`modules/${MODULE_ID}/templates/journal-editor.hbs`,
		`modules/${MODULE_ID}/templates/potion-sheet/header.hbs`,
		`modules/${MODULE_ID}/templates/potion-sheet/tabs.hbs`,
		`modules/${MODULE_ID}/templates/potion-sheet/details.hbs`,
		`modules/${MODULE_ID}/templates/potion-sheet/activity.hbs`,
		`modules/${MODULE_ID}/templates/potion-sheet/description.hbs`,
		`modules/${MODULE_ID}/templates/background-sheet/header.hbs`,
		`modules/${MODULE_ID}/templates/background-sheet/tabs.hbs`,
		`modules/${MODULE_ID}/templates/background-sheet/description.hbs`,
		`modules/${MODULE_ID}/templates/background-sheet/advancement.hbs`,
		`modules/${MODULE_ID}/templates/npc-attack-sheet/header.hbs`,
		`modules/${MODULE_ID}/templates/npc-attack-sheet/tabs.hbs`,
		`modules/${MODULE_ID}/templates/npc-attack-sheet/details.hbs`,
		`modules/${MODULE_ID}/templates/npc-attack-sheet/description.hbs`,
		`modules/${MODULE_ID}/templates/npc-attack-sheet/source.hbs`,
		`modules/${MODULE_ID}/templates/staff-spell-config.hbs`
	]);

	// Register the Party sheet early
	registerPartySheet();

	// Register the Potion sheet
	registerPotionSheet();

	// Register the Background sheet
	registerBackgroundSheet();

	// Register the NPC Attack sheet
	registerNPCAttackSheet();

	// Register the NPC Feature sheet
	registerNPCFeatureSheet();

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
			if (journal && HIDDEN_JOURNAL_NAMES.includes(journal.name)) {
				entry.remove();
				return;
			}
		}
		// Also check by name in the entry text as fallback
		const nameEl = entry.querySelector(".entry-name, .document-name");
		const entryName = nameEl?.textContent?.trim();
		if (entryName && HIDDEN_JOURNAL_NAMES.includes(entryName)) {
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

	//console.log(`${MODULE_ID} | Setting up Shadowdark Extras`);

	registerSettings();
	applySheetDecorationStyles();
	setupSettingsOrganization();
	extendLightSources();
	patchLightSourceMappings();
	extendActorCreationDialog();
	patchCtrlMoveOnActorSheetDrops();
	patchPlayerSheetForTransfers();
	initializeTradeSocket();
	patchCanUseMagicItems();

	// Setup SDX Rolls sockets
	setupSDXROLLSSockets();

	// Setup combat socket for damage application (requires socketlib)
	if (typeof socketlib !== "undefined") {
		setupCombatSocket();
		//console.log(`${MODULE_ID} | Combat socket initialized`);
	} else {
		console.warn(`${MODULE_ID} | socketlib not found, damage application may not work for non-GMs`);
	}

	// Initialize Focus Spell Tracker if enabled
	if (game.settings.get(MODULE_ID, "enableFocusTracker")) {
		initFocusSpellTracker();
		//console.log(`${MODULE_ID} | Focus Spell Tracker initialized`);
	}

	// Setup wand uses blocking (prevent casting depleted wands)
	if (game.settings.get(MODULE_ID, "enableWandUses")) {
		setupWandUsesBlocker();
		//console.log(`${MODULE_ID} | Wand Uses Blocker initialized`);
	}

	// Setup scrolling combat text (floating damage/healing numbers)
	setupScrollingCombatText();

	// Setup torch animations (requires Sequencer and JB2A)
	initTorchAnimations();

	// Setup weapon animations (requires Sequencer)
	initWeaponAnimations();

	// Setup level-up token animations (requires Sequencer)
	initLevelUpAnimations();

	// Initialize Template Effects System (damage/effects for tokens in templates)
	initTemplateEffects();
	//console.log(`${MODULE_ID} | Template Effects System initialized`);

	// Initialize Aura Effects System (token-attached effects that follow bearer)
	initAuraEffects();
	//console.log(`${MODULE_ID} | Aura Effects System initialized`);

	// Initialize Marching Mode (GM-only token following system)
	initMarchingMode();
	//console.log(`${MODULE_ID} | Marching Mode initialized`);

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
			NpcSheetSD.prototype._toggleLightSource = async function (item, options = {}) {
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
			//console.log(`${MODULE_ID} | Patched NpcSheetSD with _toggleLightSource method`);
		}
	}

	// Wrap ActorSD._learnSpell to preserve spell damage flags from scrolls
	if (globalThis.shadowdark?.documents?.ActorSD) {
		const ActorSD = globalThis.shadowdark.documents.ActorSD;
		const RollSD = CONFIG.DiceSD;
		//console.log(`${MODULE_ID} | Monkey-patching ActorSD methods and DiceSD`);
		const original_learnSpell = ActorSD.prototype._learnSpell;

		ActorSD.prototype._learnSpell = async function (item) {
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

		//console.log(`${MODULE_ID} | Wrapped ActorSD._learnSpell to preserve spell damage flags`);
	}

	// Wrap ItemSD.rollItem to inject weapon hit bonuses
	if (globalThis.shadowdark?.documents?.ItemSD) {
		const ItemSD = globalThis.shadowdark.documents.ItemSD;
		const original_rollItem = ItemSD.prototype.rollItem;

		ItemSD.prototype.rollItem = async function (parts, data, options = {}) {
			// Only process weapon attacks
			if (this.type === "Weapon" && data?.actor && data?.item) {
				try {
					// Get the target (if any)
					const targetToken = options.targetToken || game.user.targets.first();
					const targetActor = targetToken?.actor || null;

					// Get weapon hit bonuses
					const hitBonusResult = getWeaponHitBonuses(this, data.actor, targetActor);

					if (hitBonusResult.hitBonus) {
						let h = hitBonusResult.hitBonus.trim();
						if (h.startsWith("+")) h = h.substring(1).trim();
						if (h) {
							// Normalize d... to 1d... for parseInt check in _digestParts
							if (h.toLowerCase().startsWith("d")) h = "1" + h;

							if (!parts.includes("@sdxHitBonus")) {
								parts.push("@sdxHitBonus");
								data.sdxHitBonus = h;
							}

							// Store hit bonus info for chat message display (will evaluate during message creation)
							const actorId = data.actor._id || data.actor.id;
							const itemId = this.id;
							_pendingHitBonusInfo.set(`${actorId}-${itemId}`, {
								formula: h,
								parts: hitBonusResult.hitBonusParts,
								timestamp: Date.now()
							});

							//console.log(`${MODULE_ID} | Injected weapon hit bonus formula: ${h}`, hitBonusResult.hitBonusParts);
						}
					}
				} catch (err) {
					console.error(`${MODULE_ID} | Error applying weapon hit bonus:`, err);
				}
			}

			// Call original method
			return original_rollItem.call(this, parts, data, options);
		};

		//console.log(`${MODULE_ID} | Wrapped ItemSD.rollItem to inject weapon hit bonuses`);
	}

	// Ensure trade journal exists (GM only creates it)
	await ensureTradeJournal();

	// Ensure carousing journal exists and initialize sync (GM only creates it)
	await ensureCarousingJournal();
	await ensureCarousingTablesJournal();
	initCarousingSocket();

	// Register global callback for carousing overlay refresh
	window.sdxCarousingOverlayRefresh = refreshCarousingOverlay;
	window.sdxOpenCarousingOverlay = openCarousingOverlay;
});

// Preserve flags when items are created (covers item-piles transfers, compendium drops, etc.)
Hooks.on("preCreateItem", (item, data, options, userId) => {
	// Note: This hook handles flag preservation for items created directly

	// Preserve unidentified flags (if feature is enabled)
	try {
		if (game.settings.get(MODULE_ID, "enableUnidentified")) {
			if (data.flags?.[MODULE_ID]?.unidentified) {
				item.updateSource({
					[`flags.${MODULE_ID}.unidentified`]: true,
					[`flags.${MODULE_ID}.unidentifiedName`]: data.flags[MODULE_ID].unidentifiedName || "",
					[`flags.${MODULE_ID}.unidentifiedDescription`]: data.flags[MODULE_ID].unidentifiedDescription || ""
				});
			}
		}
	} catch {
		// Setting may not exist yet
	}

	// Preserve spell damage flags when learning a spell from a scroll
	// This handles the "Learn Spell" button functionality
	if (item.type === "Spell" && item.parent) {
		// Check if there's a scroll being learned from (stored in temporary flag)
		const sourceScrollId = item.parent.getFlag(MODULE_ID, "_learningFromScroll");
		if (sourceScrollId) {
			const sourceScroll = item.parent.items.get(sourceScrollId);
			if (sourceScroll) {
				// Preserve the spell damage configuration from the scroll
				if (sourceScroll.flags?.[MODULE_ID]?.spellDamage) {
					item.updateSource({
						[`flags.${MODULE_ID}.spellDamage`]: foundry.utils.duplicate(sourceScroll.flags[MODULE_ID].spellDamage)
					});
					//console.log(`${MODULE_ID} | Preserved spell damage flags when learning from scroll:`, sourceScroll.name);
				}
				// Preserve targeting configuration from the scroll
				if (sourceScroll.flags?.[MODULE_ID]?.targeting) {
					item.updateSource({
						[`flags.${MODULE_ID}.targeting`]: foundry.utils.duplicate(sourceScroll.flags[MODULE_ID].targeting)
					});
					//console.log(`${MODULE_ID} | Preserved targeting flags when learning from scroll:`, sourceScroll.name);
				}
				// Preserve template effects configuration from the scroll
				if (sourceScroll.flags?.[MODULE_ID]?.templateEffects) {
					item.updateSource({
						[`flags.${MODULE_ID}.templateEffects`]: foundry.utils.duplicate(sourceScroll.flags[MODULE_ID].templateEffects)
					});
					//console.log(`${MODULE_ID} | Preserved templateEffects flags when learning from scroll:`, sourceScroll.name);
				}
				// Preserve aura effects configuration from the scroll
				if (sourceScroll.flags?.[MODULE_ID]?.auraEffects) {
					item.updateSource({
						[`flags.${MODULE_ID}.auraEffects`]: foundry.utils.duplicate(sourceScroll.flags[MODULE_ID].auraEffects)
					});
					//console.log(`${MODULE_ID} | Preserved auraEffects flags when learning from scroll:`, sourceScroll.name);
				}
			}
		}
	}

	// Preserve Item Macro trigger configuration flags
	if (data.flags?.[MODULE_ID]?.itemMacro) {
		item.updateSource({
			[`flags.${MODULE_ID}.itemMacro`]: foundry.utils.duplicate(data.flags[MODULE_ID].itemMacro)
		});
		//console.log(`${MODULE_ID} | Preserved itemMacro flags on item creation:`, item.name);
	}

	// Preserve Targeting configuration flags
	if (data.flags?.[MODULE_ID]?.targeting) {
		item.updateSource({
			[`flags.${MODULE_ID}.targeting`]: foundry.utils.duplicate(data.flags[MODULE_ID].targeting)
		});
		//console.log(`${MODULE_ID} | Preserved targeting flags on item creation:`, item.name);
	}

	// Preserve Template Effects configuration flags
	if (data.flags?.[MODULE_ID]?.templateEffects) {
		item.updateSource({
			[`flags.${MODULE_ID}.templateEffects`]: foundry.utils.duplicate(data.flags[MODULE_ID].templateEffects)
		});
		//console.log(`${MODULE_ID} | Preserved templateEffects flags on item creation:`, item.name);
	}

	// Preserve Aura Effects configuration flags
	if (data.flags?.[MODULE_ID]?.auraEffects) {
		item.updateSource({
			[`flags.${MODULE_ID}.auraEffects`]: foundry.utils.duplicate(data.flags[MODULE_ID].auraEffects)
		});
		//console.log(`${MODULE_ID} | Preserved auraEffects flags on item creation:`, item.name);
	}

	// Preserve Item Macro module's macro data (itemacro module)
	if (data.flags?.itemacro?.macro) {
		item.updateSource({
			"flags.itemacro.macro": foundry.utils.duplicate(data.flags.itemacro.macro)
		});
		//console.log(`${MODULE_ID} | Preserved itemacro macro on item creation:`, item.name);
	}
});

// Inject SDX Rolls button into chat controls
Hooks.on("renderChatLog", (app, html) => {
	injectSdxRollButton();
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
	await injectStaffSpellsUI(app, html, data);
	enhanceTalentsTab(app, html, app.actor);
	enhanceInventoryTab(app, html, app.actor);
	injectWeaponSpellRechargeButtons(app, html, app.actor);
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
	await injectCarousingButton(app, html, app.actor);
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
	await injectConditionsToggles(app, html, app.actor);
});

// Inject Creature Type dropdown into NPC sheets
Hooks.on("renderNpcSheetSD", (app, html, data) => {
	if (app.actor?.type !== "NPC") return;

	// Don't inject into Party actors
	if (isPartyActor(app.actor)) return;

	// Inject the creature type dropdown (before ATTACKS section)
	injectNpcCreatureType(app, html, app.actor);
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
	html.find('.sdx-spell-damage-toggle').off('change').on('change', function (e) {
		e.stopPropagation();
		e.preventDefault();
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

	// Track Duration toggle
	html.find('.sdx-track-duration-toggle').off('change').on('change', function (e) {
		e.stopPropagation();
		const isEnabled = $(this).is(':checked');
		const $content = $(this).closest('.sdx-spell-damage-content').find('.sdx-duration-content');

		if (isEnabled) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}

		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.trackDuration`] = isEnabled;
		item.update(updateData, { render: false });
	});

	// Summoning toggle
	html.find('.sdx-summoning-toggle').off('change').on('change', function (e) {
		e.stopPropagation();
		e.preventDefault();
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
	html.find('.sdx-item-give-toggle').off('change').on('change', function (e) {
		e.stopPropagation();
		e.preventDefault();
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
 * Inject alignment select field into spell item sheets
 */
function injectSpellAlignmentField(app, html) {
	// Only for Spell items
	const item = app.item;
	if (!item || item.type !== "Spell") return;

	// Check if already injected
	if (html.find('.sdx-spell-alignment-select').length > 0) return;

	// Find the Caster Classes box by looking for the header with "Caster Classes" text
	const $casterClassesBox = html.find('.SD-box').filter(function () {
		const headerText = $(this).find('.header label').text().trim();
		return headerText === 'Caster Classes';
	});

	if (!$casterClassesBox.length) {
		//console.log(`${MODULE_ID} | Could not find Caster Classes box in spell sheet`);
		return;
	}

	// Get current alignment from flags
	const currentAlignment = item.getFlag(MODULE_ID, 'alignment') || '';

	// Build alignment options using Shadowdark's config
	const alignments = CONFIG.SHADOWDARK.ALIGNMENTS || {
		lawful: "SHADOWDARK.alignment.lawful",
		neutral: "SHADOWDARK.alignment.neutral",
		chaotic: "SHADOWDARK.alignment.chaotic"
	};

	const optionsHtml = Object.entries(alignments).map(([key, label]) => {
		const localizedLabel = game.i18n.localize(label);
		return `<option value="${key}" ${currentAlignment === key ? 'selected' : ''}>${localizedLabel}</option>`;
	}).join('');

	// Create the alignment field HTML matching the existing style
	const alignmentHtml = `
		<h3>Alignment</h3>
		<select class="sdx-spell-alignment-select" name="flags.${MODULE_ID}.alignment">
			<option value="">—</option>
			${optionsHtml}
		</select>
	`;

	// Find the content area of the Caster Classes box
	const $content = $casterClassesBox.find('.content');
	if ($content.length) {
		// Find the grid-1-columns div and append to it
		const $grid = $content.find('.grid-1-columns');
		if ($grid.length) {
			// Append to the grid
			$grid.append(alignmentHtml);
		} else {
			// Fallback: append directly to content
			$content.append(alignmentHtml);
		}
	} else {
		//console.log(`${MODULE_ID} | Could not find content area in Caster Classes box`);
		return;
	}

	// Handle change event
	html.find('.sdx-spell-alignment-select').on('change', async function (e) {
		e.stopPropagation();
		const newAlignment = $(this).val();
		await item.setFlag(MODULE_ID, 'alignment', newAlignment);
		//console.log(`${MODULE_ID} | Set spell alignment to: ${newAlignment}`);
	});

	//console.log(`${MODULE_ID} | Injected alignment field for spell: ${item.name}`);
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

	//console.log(`${MODULE_ID} | Enhancing spell sheet for`, item.name);

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

	// Initialize item macro flags
	const itemMacroFlags = item.flags?.[MODULE_ID]?.itemMacro || {
		runAsGm: false,
		triggers: []
	};

	// Initialize targeting flags
	const targetingFlags = item.flags?.[MODULE_ID]?.targeting || {
		mode: 'targeted',
		template: {
			type: 'circle',
			size: 30,
			placement: 'choose',
			fillColor: '#4e9a06',
			deleteMode: 'none',
			deleteDuration: 3,
			hideOutline: false
		}
	};

	// Initialize template effects flags
	const templateEffectsFlags = item.flags?.[MODULE_ID]?.templateEffects || {
		enabled: false,
		triggers: {
			onEnter: false,
			onTurnStart: false,
			onTurnEnd: false,
			onLeave: false
		},
		damage: {
			formula: '',
			type: ''
		},
		save: {
			enabled: false,
			dc: 12,
			ability: 'dex',
			halfOnSuccess: true
		},
		applyConfiguredEffects: false
	};

	// Initialize aura effects flags
	const auraEffectsFlags = item.flags?.[MODULE_ID]?.auraEffects || {
		enabled: false,
		attachTo: 'caster',
		radius: 30,
		triggers: {
			onEnter: false,
			onLeave: false,
			onSourceTurnStart: false,
			onSourceTurnEnd: false,
			onTargetTurnStart: false,
			onTargetTurnEnd: false
		},
		damage: { formula: '', type: '' },
		damageTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		save: { enabled: false, dc: 12, ability: 'con', halfOnSave: false },
		animation: { enabled: true, style: 'circle', tint: '#4488ff', opacity: 0.6, scaleMultiplier: 1.0 },
		tokenFilters: { enabled: false, preset: '' },
		disposition: 'all',
		includeSelf: false,
		includeAuraBearer: false,
		applyToOriginator: true,
		checkVisibility: false,
		applyConfiguredEffects: false,
		effectsTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		runItemMacro: false,
		macroTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false }
	};

	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags,
		itemMacro: itemMacroFlags,
		targeting: targetingFlags,
		templateEffects: templateEffectsFlags,
		auraEffects: auraEffectsFlags
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
			//console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}

		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			//console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}

		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function () {
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

	//console.log(`${MODULE_ID} | Activity tab found/created`);

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
		//console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);

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

		//console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
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

	// Build list of current critical effects from stored UUIDs
	let criticalEffectsListHtml = '';

	// Handle case where critical effects might be a string instead of an array
	let criticalEffectsArray = flags.criticalEffects || [];
	if (typeof criticalEffectsArray === 'string') {
		try {
			criticalEffectsArray = JSON.parse(criticalEffectsArray);
		} catch (err) {
			console.warn(`${MODULE_ID} | Could not parse critical effects string:`, criticalEffectsArray, err);
			criticalEffectsArray = [];
		}
	}

	// Normalize critical effects array
	criticalEffectsArray = criticalEffectsArray.map(effect => {
		if (typeof effect === 'string') {
			return { uuid: effect, duration: {} };
		}
		return effect;
	});

	if (criticalEffectsArray && criticalEffectsArray.length > 0) {
		//console.log(`${MODULE_ID} | Loading ${criticalEffectsArray.length} critical effects from UUIDs:`, criticalEffectsArray);

		const critEffectPromises = criticalEffectsArray.map(effect => fromUuid(effect.uuid || effect));
		const critEffectDocs = await Promise.all(critEffectPromises);

		for (let i = 0; i < critEffectDocs.length; i++) {
			const doc = critEffectDocs[i];
			const effectData = criticalEffectsArray[i];
			const uuid = effectData.uuid || effectData;
			const duration = effectData.duration || {};

			if (doc) {
				criticalEffectsListHtml += `
					<div class="sdx-spell-effect-item sdx-critical-effect-item" data-uuid="${uuid}" data-effect-index="${i}">
						<div class="sdx-effect-header">
							<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
							<span class="sdx-effect-name">${doc.name}</span>
							<a class="sdx-remove-critical-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
						</div>
					</div>
				`;
			} else {
				console.warn(`${MODULE_ID} | Could not load critical effect from UUID:`, uuid);
			}
		}

		//console.log(`${MODULE_ID} | Loaded critical effects HTML, length:`, criticalEffectsListHtml.length);
	}

	// Build the damage/heal UI HTML using template (now includes summoning)
	const damageHealHtml = generateSpellConfig(MODULE_ID, flags, effectsListHtml, effectsArray, effectsApplyToTarget, summonsList, summonProfilesArray, itemGiveList, itemGiveProfilesArray, criticalEffectsListHtml, criticalEffectsArray);

	// Insert into Activity tab
	$activityTab.append(damageHealHtml);
	//console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function (e) {
		// Skip Item Macro inputs - they have their own handlers
		if ($(this).hasClass('sdx-spell-macro-run-as-gm') ||
			$(this).hasClass('sdx-spell-macro-trigger-checkbox')) {
			return; // Let the event propagate to the Item Macro handlers
		}

		e.stopPropagation(); // Prevent event from bubbling up to form auto-submit
		e.preventDefault(); // Prevent default form submission

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
				//console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function () {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Targeting mode toggle listener - show/hide template settings
	html.find('.sdx-targeting-mode-radio').on('change', function () {
		const $templateSettings = $(this).closest('.sdx-targeting-content').find('.sdx-template-settings');
		if ($(this).val() === 'template') {
			$templateSettings.slideDown(200);
		} else {
			$templateSettings.slideUp(200);
		}
	});

	// Delete mode toggle listener - enable/disable duration input
	html.find('.sdx-delete-mode-radio').on('change', function () {
		const $container = $(this).closest('.sdx-delete-options');
		$container.find('.sdx-duration-input').prop('disabled', true);
		$(this).siblings('.sdx-duration-input').prop('disabled', false);
	});

	// Color picker sync with text input
	html.find('.sdx-targeting-box .sdx-color-picker').on('input', function () {
		$(this).siblings('.sdx-color-text').val($(this).val());
	});
	html.find('.sdx-targeting-box .sdx-color-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-color-picker').val(colorVal);
		}
	});

	// TokenMagic texture file picker
	html.find('.sdx-tm-texture-picker').on('click', async function (e) {
		e.preventDefault();
		const $input = $(this).siblings('.sdx-tm-texture-input');
		const fp = new FilePicker({
			type: 'image',
			current: $input.val(),
			callback: path => {
				$input.val(path).trigger('change');
			}
		});
		fp.browse();
	});

	// TokenMagic opacity slider value display
	html.find('.sdx-tm-opacity-slider').on('input', function () {
		$(this).siblings('.sdx-tm-opacity-value').text($(this).val());
	});

	// TokenMagic preset dropdown - enable/disable tint inputs
	html.find('.sdx-tm-preset-select').on('change', function () {
		const preset = $(this).val();
		const $tintGroup = $(this).closest('.sdx-tokenmagic-section').find('.sdx-tint-input-group');
		const isNoFx = preset === 'NOFX';
		$tintGroup.find('input').prop('disabled', isNoFx);
	});

	// TokenMagic tint color picker sync
	html.find('.sdx-tm-tint-picker').on('input', function () {
		$(this).siblings('.sdx-tm-tint-text').val($(this).val());
	});
	html.find('.sdx-tm-tint-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-tm-tint-picker').val(colorVal);
		}
	});

	// Template Effects: Enable/disable config section based on checkbox
	html.find('.sdx-template-effects-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-effects-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Template Effects: Enable/disable save config section based on checkbox
	html.find('.sdx-template-save-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-save-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function () {
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
	const $dropArea = html.find('.sdx-spell-effects-drop-area:not(.sdx-critical-effects-drop-area)');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	// Update the hidden input when effects change
	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function () {
			const $item = $(this);
			const uuid = $item.data('uuid');

			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function () {
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
			//console.log(`${MODULE_ID} | Saved spell effects:`, effects);
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
	$dropArea.on('dragover', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	// Handle drag leave
	$dropArea.on('dragleave', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	// Handle drop
	$dropArea.on('drop', async function (event) {
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
	html.on('click', '.sdx-remove-effect', function (event) {
		event.preventDefault();
		event.stopPropagation();

		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	// Handle duration input changes
	html.on('change', '.sdx-duration-input', function () {
		updateEffectsData();
	});

	// ===== CRITICAL EFFECTS HANDLERS =====
	const $critDropArea = html.find('.sdx-critical-effects-drop-area');
	const $critEffectsList = html.find('.sdx-spell-critical-effects-list');
	const $critEffectsData = html.find('.sdx-critical-effects-data');

	// Update the hidden input when critical effects change
	function updateCriticalEffectsData() {
		const effects = [];
		$critEffectsList.find('.sdx-critical-effect-item').each(function () {
			const $item = $(this);
			const uuid = $item.data('uuid');

			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function () {
				const field = $(this).data('field');
				const value = $(this).val();
				if (value !== '') {
					duration[field] = parseFloat(value);
				}
			});

			effects.push({ uuid, duration });
		});
		$critEffectsData.val(JSON.stringify(effects));

		// Save immediately to the item without re-rendering
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.criticalEffects`] = effects;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved spell critical effects:`, effects);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save spell critical effects:`, err);
		});

		// Remove "no effects" placeholder if we have effects
		if (effects.length > 0) {
			$critEffectsList.find('.sdx-no-effects').remove();
		} else if ($critEffectsList.find('.sdx-critical-effect-item').length === 0) {
			$critEffectsList.html('<div class="sdx-no-effects"><i class="fas fa-star-exclamation"></i> Optional</div>');
		}
	}

	// Handle drag over for critical effects
	$critDropArea.on('dragover', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	// Handle drag leave for critical effects
	$critDropArea.on('dragleave', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	// Handle drop for critical effects
	$critDropArea.on('drop', async function (event) {
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
			if ($critEffectsList.find(`[data-uuid="${uuid}"]`).length > 0) {
				ui.notifications.info(`${doc.name} is already in the critical effects list`);
				return;
			}

			// Add the effect to the list (simplified without duration override)
			const effectIndex = $critEffectsList.find('.sdx-critical-effect-item').length;
			const effectHtml = `
				<div class="sdx-spell-effect-item sdx-critical-effect-item" data-uuid="${uuid}" data-effect-index="${effectIndex}">
					<div class="sdx-effect-header">
						<img src="${doc.img || 'icons/svg/mystery-man.svg'}" alt="${doc.name}" />
						<span class="sdx-effect-name">${doc.name}</span>
						<a class="sdx-remove-critical-effect" data-tooltip="Remove"><i class="fas fa-times"></i></a>
					</div>
				</div>
			`;

			$critEffectsList.find('.sdx-no-effects').remove();
			$critEffectsList.append(effectHtml);
			updateCriticalEffectsData();

			ui.notifications.info(`Added ${doc.name} to critical effects`);
		} catch (err) {
			console.error(`${MODULE_ID} | Error handling critical effect drop:`, err);
			ui.notifications.error('Failed to add critical effect');
		}
	});

	// Handle remove critical effect button
	html.on('click', '.sdx-remove-critical-effect', function (event) {
		event.preventDefault();
		event.stopPropagation();

		$(this).closest('.sdx-critical-effect-item').remove();
		updateCriticalEffectsData();
	});

	// Also save applyToTarget when radio buttons change
	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.applyToTarget"]', function () {
		const applyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.applyToTarget`] = applyToTargetValue;

		item.update(updateData).then(() => {
			//console.log(`${MODULE_ID} | Saved applyToTarget:`, applyToTargetValue);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save applyToTarget:`, err);
		});
	});

	// ===== SUMMONING HANDLERS =====

	// Toggle summoning section - acts like radio button (only one activity can be enabled)
	html.on('change', '.sdx-summoning-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).prop('checked');

		//console.log(`${MODULE_ID} | Summoning toggle changed to:`, enabled);

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
	html.on('click', '.sdx-add-summon-btn', async function (e) {
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
		$summonsList.append(profileHtml);

		updateSummonsData();
	});

	// Remove summon profile
	html.on('click', '.sdx-remove-summon-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();

		$(this).closest('.sdx-summon-profile').remove();

		// Re-index remaining profiles
		const $summonsList = $(this).closest('.sdx-summons-list');
		$summonsList.find('.sdx-summon-profile').each(function (idx) {
			$(this).attr('data-index', idx);
			$(this).find('.sdx-remove-summon-btn').attr('data-index', idx);
		});

		updateSummonsData();
	});

	// Handle summon profile input changes
	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function (e) {
		e.stopPropagation(); // Prevent form auto-submit
		updateSummonsData();
	});

	// Handle drop on creature drop zone
	html.on('dragover', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-summon-creature-drop', async function (event) {
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
		html.find('.sdx-summon-profile').each(function () {
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
			//console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function (e) {
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
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function (e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function (event) {
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
		html.find('.sdx-item-give-profile').each(function (idx) {
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
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// ===== ITEM MACRO HANDLERS =====

	// Handle spell macro GM toggle
	html.on('change', '.sdx-spell-macro-run-as-gm', function (e) {
		e.stopPropagation();
		const runAsGm = $(this).prop('checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.runAsGm`] = runAsGm;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.runAsGm:`, runAsGm);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.runAsGm:`, err);
		});
	});

	// Handle spell macro trigger checkboxes
	html.on('change', '.sdx-spell-macro-trigger-checkbox', function (e) {
		e.stopPropagation();
		// Collect all checked triggers
		const triggers = [];
		html.find('.sdx-spell-macro-trigger-checkbox:checked').each(function () {
			triggers.push($(this).data('trigger'));
		});
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.triggers`] = triggers;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.triggers:`, triggers);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.triggers:`, err);
		});
	});

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	// Setup UI listeners for targeting and aura effects
	activateTemplateTargetingListeners(html[0], MODULE_ID);

	//console.log(`${MODULE_ID} | Spell sheet enhanced for`, item.name);
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

	//console.log(`${MODULE_ID} | Enhancing potion sheet for`, item.name);

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

	// Initialize item macro flags
	const itemMacroFlags = item.flags?.[MODULE_ID]?.itemMacro || {
		runAsGm: false,
		triggers: []
	};

	// Initialize aura effects flags
	const auraEffectsFlags = item.flags?.[MODULE_ID]?.auraEffects || {
		enabled: false,
		attachTo: 'caster',
		radius: 30,
		triggers: {
			onEnter: false,
			onLeave: false,
			onSourceTurnStart: false,
			onSourceTurnEnd: false,
			onTargetTurnStart: false,
			onTargetTurnEnd: false
		},
		damage: { formula: '', type: '' },
		damageTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		save: { enabled: false, dc: 12, ability: 'con', halfOnSave: false },
		animation: { enabled: true, style: 'circle', tint: '#4488ff', opacity: 0.6, scaleMultiplier: 1.0 },
		tokenFilters: { enabled: false, preset: '' },
		disposition: 'all',
		includeSelf: false,
		includeAuraBearer: false,
		applyToOriginator: true,
		checkVisibility: false,
		applyConfiguredEffects: false,
		effectsTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		runItemMacro: false,
		macroTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false }
	};

	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags,
		itemMacro: itemMacroFlags,
		auraEffects: auraEffectsFlags
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
			//console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}

		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			//console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}

		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function () {
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

	//console.log(`${MODULE_ID} | Activity tab found/created`);

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
		//console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);

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

		//console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
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
	//console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function (e) {
		// Skip Item Macro inputs - they have their own handlers
		if ($(this).hasClass('sdx-spell-macro-run-as-gm') ||
			$(this).hasClass('sdx-spell-macro-trigger-checkbox')) {
			return; // Let the event propagate to the Item Macro handlers
		}

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
				//console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function () {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function () {
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
	const $dropArea = html.find('.sdx-spell-effects-drop-area:not(.sdx-critical-effects-drop-area)');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	// Update the hidden input when effects change
	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function () {
			const $item = $(this);
			const uuid = $item.data('uuid');

			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function () {
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
			//console.log(`${MODULE_ID} | Saved potion effects:`, effects);
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
	$dropArea.on('dragover', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	// Handle drag leave
	$dropArea.on('dragleave', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	// Handle drop
	$dropArea.on('drop', async function (event) {
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
	html.on('click', '.sdx-remove-effect', function (event) {
		event.preventDefault();
		event.stopPropagation();

		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	// Also save effectsApplyToTarget when radio buttons change
	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function () {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;

		item.update(updateData).then(() => {
			//console.log(`${MODULE_ID} | Saved effectsApplyToTarget:`, effectsApplyToTargetValue);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save effectsApplyToTarget:`, err);
		});
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summons-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function (e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-summon-creature-drop', async function (event) {
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
		html.find('.sdx-summon-profile').each(function () {
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
			//console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function (e) {
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
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function (e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function (event) {
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
		html.find('.sdx-item-give-profile').each(function (idx) {
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
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// ===== ITEM MACRO HANDLERS =====

	// Handle spell macro GM toggle
	html.on('change', '.sdx-spell-macro-run-as-gm', function (e) {
		e.stopPropagation();
		const runAsGm = $(this).prop('checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.runAsGm`] = runAsGm;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.runAsGm:`, runAsGm);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.runAsGm:`, err);
		});
	});

	// Handle spell macro trigger checkboxes
	html.on('change', '.sdx-spell-macro-trigger-checkbox', function (e) {
		e.stopPropagation();
		const triggers = [];
		html.find('.sdx-spell-macro-trigger-checkbox:checked').each(function () {
			triggers.push($(this).data('trigger'));
		});
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.triggers`] = triggers;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.triggers:`, triggers);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.triggers:`, err);
		});
	});

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	// Setup UI listeners for targeting and aura effects
	activateTemplateTargetingListeners(html[0], MODULE_ID);

	//console.log(`${MODULE_ID} | Potion sheet enhanced for`, item.name);
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

	//console.log(`${MODULE_ID} | Enhancing scroll sheet for`, item.name);

	// Debug: Log all flags
	//console.log(`${MODULE_ID} | Scroll flags:`, item.flags?.[MODULE_ID]);

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

	// Initialize item macro flags
	const itemMacroFlags = item.flags?.[MODULE_ID]?.itemMacro || {
		runAsGm: false,
		triggers: []
	};

	// Initialize targeting flags
	const targetingFlags = item.flags?.[MODULE_ID]?.targeting || {
		mode: 'targeted',
		template: {
			type: 'circle',
			size: 30,
			placement: 'choose',
			fillColor: '#4e9a06',
			deleteMode: 'none',
			deleteDuration: 3,
			hideOutline: false
		}
	};

	// Initialize template effects flags
	const templateEffectsFlags = item.flags?.[MODULE_ID]?.templateEffects || {
		enabled: false,
		triggers: {
			onEnter: false,
			onTurnStart: false,
			onTurnEnd: false,
			onLeave: false
		},
		damage: {
			formula: '',
			type: ''
		},
		save: {
			enabled: false,
			dc: 12,
			ability: 'dex',
			halfOnSuccess: true
		},
		applyConfiguredEffects: false
	};

	// Initialize aura effects flags
	const auraEffectsFlags = item.flags?.[MODULE_ID]?.auraEffects || {
		enabled: false,
		attachTo: 'caster',
		radius: 30,
		triggers: {
			onEnter: false,
			onLeave: false,
			onSourceTurnStart: false,
			onSourceTurnEnd: false,
			onTargetTurnStart: false,
			onTargetTurnEnd: false
		},
		damage: { formula: '', type: '' },
		damageTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		save: { enabled: false, dc: 12, ability: 'con', halfOnSave: false },
		animation: { enabled: true, style: 'circle', tint: '#4488ff', opacity: 0.6, scaleMultiplier: 1.0 },
		tokenFilters: { enabled: false, preset: '' },
		disposition: 'all',
		includeSelf: false,
		includeAuraBearer: false,
		applyToOriginator: true,
		checkVisibility: false,
		applyConfiguredEffects: false,
		effectsTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		runItemMacro: false,
		macroTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false }
	};

	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags,
		itemMacro: itemMacroFlags,
		targeting: targetingFlags,
		templateEffects: templateEffectsFlags,
		auraEffects: auraEffectsFlags
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
			//console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}

		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			//console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}

		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function () {
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

	//console.log(`${MODULE_ID} | Activity tab found/created`);

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
		//console.log(`${MODULE_ID} | Loading ${effectsArray.length} effects from UUIDs:`, effectsArray);

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

		//console.log(`${MODULE_ID} | Loaded effects HTML, length:`, effectsListHtml.length);
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
	//console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function (e) {
		// Skip Item Macro inputs - they have their own handlers
		if ($(this).hasClass('sdx-spell-macro-run-as-gm') ||
			$(this).hasClass('sdx-spell-macro-trigger-checkbox')) {
			return; // Let the event propagate to the Item Macro handlers
		}

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
				//console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	// Attach toggle listener
	html.find('.sdx-spell-damage-toggle').on('change', function () {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Targeting mode toggle listener - show/hide template settings
	html.find('.sdx-targeting-mode-radio').on('change', function () {
		const $templateSettings = $(this).closest('.sdx-targeting-content').find('.sdx-template-settings');
		if ($(this).val() === 'template') {
			$templateSettings.slideDown(200);
		} else {
			$templateSettings.slideUp(200);
		}
	});

	// Delete mode toggle listener - enable/disable duration input
	html.find('.sdx-delete-mode-radio').on('change', function () {
		const $container = $(this).closest('.sdx-delete-options');
		$container.find('.sdx-duration-input').prop('disabled', true);
		$(this).siblings('.sdx-duration-input').prop('disabled', false);
	});

	// Color picker sync with text input
	html.find('.sdx-targeting-box .sdx-color-picker').on('input', function () {
		$(this).siblings('.sdx-color-text').val($(this).val());
	});
	html.find('.sdx-targeting-box .sdx-color-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-color-picker').val(colorVal);
		}
	});

	// TokenMagic texture file picker
	html.find('.sdx-tm-texture-picker').on('click', async function (e) {
		e.preventDefault();
		const $input = $(this).siblings('.sdx-tm-texture-input');
		const fp = new FilePicker({
			type: 'image',
			current: $input.val(),
			callback: path => {
				$input.val(path).trigger('change');
			}
		});
		fp.browse();
	});

	// TokenMagic opacity slider value display
	html.find('.sdx-tm-opacity-slider').on('input', function () {
		$(this).siblings('.sdx-tm-opacity-value').text($(this).val());
	});

	// TokenMagic preset dropdown - enable/disable tint inputs
	html.find('.sdx-tm-preset-select').on('change', function () {
		const preset = $(this).val();
		const $tintGroup = $(this).closest('.sdx-tokenmagic-section').find('.sdx-tint-input-group');
		const isNoFx = preset === 'NOFX';
		$tintGroup.find('input').prop('disabled', isNoFx);
	});

	// TokenMagic tint color picker sync
	html.find('.sdx-tm-tint-picker').on('input', function () {
		$(this).siblings('.sdx-tm-tint-text').val($(this).val());
	});
	html.find('.sdx-tm-tint-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-tm-tint-picker').val(colorVal);
		}
	});

	// Template Effects: Enable/disable config section based on checkbox
	html.find('.sdx-template-effects-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-effects-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Template Effects: Enable/disable save config section based on checkbox
	html.find('.sdx-template-save-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-save-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function () {
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
	const $dropArea = html.find('.sdx-spell-effects-drop-area:not(.sdx-critical-effects-drop-area)');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function () {
			const $item = $(this);
			const uuid = $item.data('uuid');

			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function () {
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

	$dropArea.on('dragover', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	$dropArea.on('dragleave', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	$dropArea.on('drop', async function (event) {
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

	html.on('click', '.sdx-remove-effect', function (event) {
		event.preventDefault();
		event.stopPropagation();

		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function () {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;
		item.update(updateData);
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summons-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function (e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-summon-creature-drop', async function (event) {
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
		html.find('.sdx-summon-profile').each(function () {
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
			//console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function (e) {
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
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function (e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function (event) {
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
		html.find('.sdx-item-give-profile').each(function (idx) {
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
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// ===== ITEM MACRO HANDLERS =====

	// Handle spell macro GM toggle
	html.on('change', '.sdx-spell-macro-run-as-gm', function (e) {
		e.stopPropagation();
		const runAsGm = $(this).prop('checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.runAsGm`] = runAsGm;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.runAsGm:`, runAsGm);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.runAsGm:`, err);
		});
	});

	// Handle spell macro trigger checkboxes
	html.on('change', '.sdx-spell-macro-trigger-checkbox', function (e) {
		e.stopPropagation();
		const triggers = [];
		html.find('.sdx-spell-macro-trigger-checkbox:checked').each(function () {
			triggers.push($(this).data('trigger'));
		});
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.triggers`] = triggers;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.triggers:`, triggers);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.triggers:`, err);
		});
	});

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	// Setup UI listeners for targeting and aura effects
	activateTemplateTargetingListeners(html[0], MODULE_ID);

	//console.log(`${MODULE_ID} | Scroll sheet enhanced for`, item.name);
}

/**
 * Inject wand uses tracking UI into wand item sheet
 * Adds Enable Uses checkbox and Current/Max uses inputs after the Range field
 */
function injectWandUsesUI(html, item) {
	// Remove any existing wand uses UI to prevent duplicates
	html.find('.sdx-wand-uses-row').remove();

	// Get current flags
	const wandUsesFlags = item.flags?.[MODULE_ID]?.wandUses || {
		enabled: false,
		current: 0,
		max: 0
	};

	// Find the Range field in the SPELL box (it's a select with name="system.range")
	const $rangeSelect = html.find('select[name="system.range"]');
	if (!$rangeSelect.length) {
		console.warn(`${MODULE_ID} | Could not find Range field in wand sheet`);
		return;
	}

	// Get the parent row (h3 + select)
	const $rangeRow = $rangeSelect.parent();

	// Create the wand uses UI HTML
	const usesEnabled = wandUsesFlags.enabled;
	const usesCurrent = wandUsesFlags.current ?? 0;
	const usesMax = wandUsesFlags.max ?? 0;

	const wandUsesHTML = `
		<h3 class="sdx-wand-uses-row">${game.i18n.localize("SHADOWDARK_EXTRAS.wand.enable_uses")}</h3>
		<div class="sdx-wand-uses-row sdx-wand-uses-checkbox">
			<input type="checkbox" 
				name="flags.${MODULE_ID}.wandUses.enabled" 
				${usesEnabled ? 'checked' : ''}
				data-dtype="Boolean"
			/>
		</div>
		${usesEnabled ? `
			<h3 class="sdx-wand-uses-row">${game.i18n.localize("SHADOWDARK_EXTRAS.wand.uses")}</h3>
			<div class="sdx-wand-uses-row sdx-wand-uses-inputs">
				<input type="number" 
					name="flags.${MODULE_ID}.wandUses.current" 
					value="${usesCurrent}"
					min="0"
					style="width: 40px; text-align: center;"
					data-dtype="Number"
				/>
				<span style="margin: 0 4px;">/</span>
				<input type="number" 
					name="flags.${MODULE_ID}.wandUses.max" 
					value="${usesMax}"
					min="0"
					style="width: 40px; text-align: center;"
					data-dtype="Number"
				/>
			</div>
		` : ''}
	`;

	// Insert after the range field's row
	$rangeRow.after(wandUsesHTML);

	// Wire up the checkbox to trigger a re-render when changed
	const $enableCheckbox = html.find(`input[name="flags.${MODULE_ID}.wandUses.enabled"]`);
	$enableCheckbox.on('change', async function () {
		const enabled = this.checked;
		await item.update({
			[`flags.${MODULE_ID}.wandUses.enabled`]: enabled,
			// Initialize current/max to reasonable defaults if enabling for first time
			[`flags.${MODULE_ID}.wandUses.current`]: enabled && usesMax === 0 ? 5 : usesCurrent,
			[`flags.${MODULE_ID}.wandUses.max`]: enabled && usesMax === 0 ? 5 : usesMax
		});
	});

	//console.log(`${MODULE_ID} | Wand uses UI injected for`, item.name);
}

/**
 * Setup a wrapper to prevent casting depleted wands
 * Wraps the Actor.castSpell method to check wand uses before casting
 */
function setupWandUsesBlocker() {
	const ActorClass = CONFIG.Actor.documentClass;
	const originalCastSpell = ActorClass.prototype.castSpell;

	if (!originalCastSpell) {
		console.warn(`${MODULE_ID} | Could not find castSpell method on Actor prototype`);
		return;
	}

	ActorClass.prototype.castSpell = async function (itemId, options = {}) {
		const item = this.items.get(itemId);

		// Check if this is a wand with uses tracking enabled
		if (item?.type === "Wand") {
			const wandUsesFlags = item.flags?.[MODULE_ID]?.wandUses;
			if (wandUsesFlags?.enabled) {
				const currentUses = wandUsesFlags.current ?? 0;

				if (currentUses <= 0) {
					ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.wand.no_uses_remaining", { name: item.name }));
					return null;
				}
			}
		}

		// Call the original method
		return originalCastSpell.call(this, itemId, options);
	};

	//console.log(`${MODULE_ID} | Wrapped castSpell for wand uses blocking`);
}

/**
 * Enhance Wand item sheets with damage/heal and conditions UI
 */
async function enhanceWandSheet(app, html) {
	// Only enhance Wand items
	const item = app.item;
	if (!item || item.type !== "Wand") return;

	//console.log(`${MODULE_ID} | Enhancing wand sheet for`, item.name);

	// ═══════════════════════════════════════════════════════════════
	// WAND USES TRACKING UI
	// ═══════════════════════════════════════════════════════════════
	try {
		if (game.settings.get(MODULE_ID, "enableWandUses")) {
			// Inject wand uses UI after the Range field
			injectWandUsesUI(html, item);
		}
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject wand uses UI`, err);
	}

	// ═══════════════════════════════════════════════════════════════
	// SPELL ENHANCEMENT (Activity Tab, Damage, etc.)
	// ═══════════════════════════════════════════════════════════════
	// Check if spell enhancement is enabled
	try {
		if (!game.settings.get(MODULE_ID, "enhanceSpells")) return;
	} catch {
		return;
	}

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

	// Initialize item macro flags
	const itemMacroFlags = item.flags?.[MODULE_ID]?.itemMacro || {
		runAsGm: false,
		triggers: []
	};

	// Initialize targeting flags
	const targetingFlags = item.flags?.[MODULE_ID]?.targeting || {
		mode: 'targeted',
		template: {
			type: 'circle',
			size: 30,
			placement: 'choose',
			fillColor: '#4e9a06',
			deleteMode: 'none',
			deleteDuration: 3,
			hideOutline: false
		}
	};

	// Initialize template effects flags
	const templateEffectsFlags = item.flags?.[MODULE_ID]?.templateEffects || {
		enabled: false,
		triggers: {
			onEnter: false,
			onTurnStart: false,
			onTurnEnd: false,
			onLeave: false
		},
		damage: {
			formula: '',
			type: ''
		},
		save: {
			enabled: false,
			dc: 12,
			ability: 'dex',
			halfOnSuccess: true
		},
		applyConfiguredEffects: false
	};

	// Initialize aura effects flags
	const auraEffectsFlags = item.flags?.[MODULE_ID]?.auraEffects || {
		enabled: false,
		attachTo: 'caster',
		radius: 30,
		triggers: {
			onEnter: false,
			onLeave: false,
			onSourceTurnStart: false,
			onSourceTurnEnd: false,
			onTargetTurnStart: false,
			onTargetTurnEnd: false
		},
		damage: { formula: '', type: '' },
		damageTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		save: { enabled: false, dc: 12, ability: 'con', halfOnSave: false },
		animation: { enabled: true, style: 'circle', tint: '#4488ff', opacity: 0.6, scaleMultiplier: 1.0 },
		tokenFilters: { enabled: false, preset: '' },
		disposition: 'all',
		includeSelf: false,
		includeAuraBearer: false,
		applyToOriginator: true,
		checkVisibility: false,
		applyConfiguredEffects: false,
		effectsTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false },
		runItemMacro: false,
		macroTriggers: { onEnter: false, onLeave: false, onSourceTurnStart: false, onSourceTurnEnd: false, onTargetTurnStart: false, onTargetTurnEnd: false }
	};

	// Combine all flags for template
	const flags = {
		...spellDamageFlags,
		summoning: summoningFlags,
		itemGive: itemGiveFlags,
		itemMacro: itemMacroFlags,
		targeting: targetingFlags,
		templateEffects: templateEffectsFlags,
		auraEffects: auraEffectsFlags
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
			//console.log(`${MODULE_ID} | Activity tab link added to navigation`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab link`);
		}

		// Create Activity tab content container with correct structure
		const activityTabContent = `<section class="tab tab-activity" data-group="primary" data-tab="tab-activity"></section>`;
		const $detailsTab = html.find('section.tab-details[data-tab="tab-details"]');
		if ($detailsTab.length) {
			$detailsTab.after(activityTabContent);
			//console.log(`${MODULE_ID} | Activity tab content created`);
		} else {
			console.warn(`${MODULE_ID} | Could not find Details tab content`);
		}

		// Add click handler to track tab changes
		$tabs.find('a.navigation-tab').on('click', function () {
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

	//console.log(`${MODULE_ID} | Activity tab found/created`);

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
	//console.log(`${MODULE_ID} | Damage/Heal box inserted into Activity tab`);

	// Prevent auto-submission of form inputs in Activity tab to avoid unwanted re-renders
	$activityTab.find('input, select, textarea').on('change', function (e) {
		// Skip Item Macro inputs - they have their own handlers
		if ($(this).hasClass('sdx-spell-macro-run-as-gm') ||
			$(this).hasClass('sdx-spell-macro-trigger-checkbox')) {
			return; // Let the event propagate to the Item Macro handlers
		}

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
				//console.log(`${MODULE_ID} | Updated ${fieldName}:`, value);
			}).catch(err => {
				console.error(`${MODULE_ID} | Failed to update ${fieldName}:`, err);
			});
		}
	});

	html.find('.sdx-spell-damage-toggle').on('change', function () {
		const $content = $(this).closest('.sdx-spell-damage-box').find('.sdx-spell-damage-content');
		if ($(this).is(':checked')) {
			$content.slideDown(200);
		} else {
			$content.slideUp(200);
		}
	});

	// Targeting mode toggle listener - show/hide template settings
	html.find('.sdx-targeting-mode-radio').on('change', function () {
		const $templateSettings = $(this).closest('.sdx-targeting-content').find('.sdx-template-settings');
		if ($(this).val() === 'template') {
			$templateSettings.slideDown(200);
		} else {
			$templateSettings.slideUp(200);
		}
	});

	// Delete mode toggle listener - enable/disable duration input
	html.find('.sdx-delete-mode-radio').on('change', function () {
		const $container = $(this).closest('.sdx-delete-options');
		$container.find('.sdx-duration-input').prop('disabled', true);
		$(this).siblings('.sdx-duration-input').prop('disabled', false);
	});

	// Color picker sync with text input
	html.find('.sdx-targeting-box .sdx-color-picker').on('input', function () {
		$(this).siblings('.sdx-color-text').val($(this).val());
	});
	html.find('.sdx-targeting-box .sdx-color-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-color-picker').val(colorVal);
		}
	});

	// TokenMagic texture file picker
	html.find('.sdx-tm-texture-picker').on('click', async function (e) {
		e.preventDefault();
		const $input = $(this).siblings('.sdx-tm-texture-input');
		const fp = new FilePicker({
			type: 'image',
			current: $input.val(),
			callback: path => {
				$input.val(path).trigger('change');
			}
		});
		fp.browse();
	});

	// TokenMagic opacity slider value display
	html.find('.sdx-tm-opacity-slider').on('input', function () {
		$(this).siblings('.sdx-tm-opacity-value').text($(this).val());
	});

	// TokenMagic preset dropdown - enable/disable tint inputs
	html.find('.sdx-tm-preset-select').on('change', function () {
		const preset = $(this).val();
		const $tintGroup = $(this).closest('.sdx-tokenmagic-section').find('.sdx-tint-input-group');
		const isNoFx = preset === 'NOFX';
		$tintGroup.find('input').prop('disabled', isNoFx);
	});

	// TokenMagic tint color picker sync
	html.find('.sdx-tm-tint-picker').on('input', function () {
		$(this).siblings('.sdx-tm-tint-text').val($(this).val());
	});
	html.find('.sdx-tm-tint-text').on('input', function () {
		const colorVal = $(this).val();
		if (/^#[0-9A-Fa-f]{6}$/.test(colorVal)) {
			$(this).siblings('.sdx-tm-tint-picker').val(colorVal);
		}
	});

	// Template Effects: Enable/disable config section based on checkbox
	html.find('.sdx-template-effects-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-effects-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Template Effects: Enable/disable save config section based on checkbox
	html.find('.sdx-template-save-enabled').on('change', function () {
		const $config = $(this).closest('.sdx-template-effects-section').find('.sdx-template-save-config');
		if ($(this).is(':checked')) {
			$config.css({ opacity: '', pointerEvents: '' });
		} else {
			$config.css({ opacity: '0.5', pointerEvents: 'none' });
		}
	});

	// Handle formula type radio buttons
	html.find('.sdx-formula-type-radio').on('change', function () {
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

	const $dropArea = html.find('.sdx-spell-effects-drop-area:not(.sdx-critical-effects-drop-area)');
	const $effectsList = html.find('.sdx-spell-effects-list');
	const $effectsData = html.find('.sdx-effects-data');

	function updateEffectsData() {
		const effects = [];
		$effectsList.find('.sdx-spell-effect-item').each(function () {
			const $item = $(this);
			const uuid = $item.data('uuid');

			// Collect duration overrides
			const duration = {};
			$item.find('.sdx-duration-input').each(function () {
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

	$dropArea.on('dragover', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	$dropArea.on('dragleave', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	$dropArea.on('drop', async function (event) {
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

	html.on('click', '.sdx-remove-effect', function (event) {
		event.preventDefault();
		event.stopPropagation();

		$(this).closest('.sdx-spell-effect-item').remove();
		updateEffectsData();
	});

	html.on('change', 'input[name="flags.shadowdark-extras.spellDamage.effectsApplyToTarget"]', function () {
		const effectsApplyToTargetValue = $(this).val() === 'true';
		const updateData = {};
		updateData[`flags.${MODULE_ID}.spellDamage.effectsApplyToTarget`] = effectsApplyToTargetValue;
		item.update(updateData);
	});

	// ---- Summoning handlers ----
	html.on('change', '.sdx-summoning-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.summoning.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Summoning enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-summon-btn', async function (e) {
		e.preventDefault();
		e.stopPropagation();
		const { generateSummonProfileHTML } = await import(`./templates/SummoningConfig.mjs`);
		const $list = $(this).closest('.sdx-summoning-content').find('.sdx-summons-list');
		const index = $list.find('.sdx-summon-profile').length;
		const newProfile = {
			creatureUuid: '',
			creatureName: '',
			creatureImg: '',
			count: '1',
			displayName: ''
		};
		$list.append(generateSummonProfileHTML(newProfile, index));
		updateSummonsData();
	});

	html.on('click', '.sdx-remove-summon-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-summon-profile').remove();
		updateSummonsData();
	});

	html.on('change input', '.sdx-summon-count, .sdx-summon-display-name', function (e) {
		e.stopPropagation();
		updateSummonsData();
	});

	html.on('dragover', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-summon-creature-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-summon-creature-drop', async function (event) {
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
		html.find('.sdx-summon-profile').each(function () {
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
			//console.log(`${MODULE_ID} | Saved summon profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save summon profiles:`, err);
		});
	}

	// ---- Item give handlers ----
	html.on('change', '.sdx-item-give-toggle', function (e) {
		e.stopPropagation();
		const enabled = $(this).is(':checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.enabled`] = enabled;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Item give enabled state saved:`, enabled);
		});
	});

	html.on('click', '.sdx-add-item-give-btn', async function (e) {
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
		$list.append(generateItemGiveProfileHTML(newProfile, index));
		updateItemGiveData();
	});

	html.on('click', '.sdx-remove-item-give-btn', function (e) {
		e.preventDefault();
		e.stopPropagation();
		$(this).closest('.sdx-item-give-profile').remove();
		updateItemGiveData();
	});

	html.on('change input', '.sdx-item-give-quantity', function (e) {
		e.stopPropagation();
		updateItemGiveData();
	});

	html.on('dragover', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).addClass('sdx-drag-over');
	});

	html.on('dragleave', '.sdx-item-give-drop', function (event) {
		event.preventDefault();
		event.stopPropagation();
		$(this).removeClass('sdx-drag-over');
	});

	html.on('drop', '.sdx-item-give-drop', async function (event) {
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
		html.find('.sdx-item-give-profile').each(function (idx) {
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
		html.find('.sdx-item-give-data').val(JSON.stringify(profiles));
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemGive.profiles`] = profiles;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved item give profiles:`, profiles);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save item give profiles:`, err);
		});
	}

	// ===== ITEM MACRO HANDLERS =====

	// Handle spell macro GM toggle
	html.on('change', '.sdx-spell-macro-run-as-gm', function (e) {
		e.stopPropagation();
		const runAsGm = $(this).prop('checked');
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.runAsGm`] = runAsGm;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.runAsGm:`, runAsGm);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.runAsGm:`, err);
		});
	});

	// Handle spell macro trigger checkboxes
	html.on('change', '.sdx-spell-macro-trigger-checkbox', function (e) {
		e.stopPropagation();
		const triggers = [];
		html.find('.sdx-spell-macro-trigger-checkbox:checked').each(function () {
			triggers.push($(this).data('trigger'));
		});
		const updateData = {};
		updateData[`flags.${MODULE_ID}.itemMacro.triggers`] = triggers;
		item.update(updateData, { render: false }).then(() => {
			//console.log(`${MODULE_ID} | Saved itemMacro.triggers:`, triggers);
		}).catch(err => {
			console.error(`${MODULE_ID} | Failed to save itemMacro.triggers:`, err);
		});
	});

	// Setup activity toggles as radio buttons (only one can be active at a time)
	setupActivityRadioToggles(html, item);

	// Setup UI listeners for targeting and aura effects
	activateTemplateTargetingListeners(html[0], MODULE_ID);

	//console.log(`${MODULE_ID} | Wand sheet enhanced for`, item.name);
}

/**
 * Inject a damage type dropdown into the weapon item sheet's Details tab
 */
function injectWeaponDamageTypeDropdown(app, html, item) {
	// Only for Weapon type items
	if (item.type !== "Weapon") return;

	// Check if already injected
	if (html.find('.sdx-weapon-damage-type-select').length > 0) return;

	// Find the SD-grid content area within the Weapon box
	const $weaponGrid = html.find('.SD-box .content.SD-grid').first();
	if (!$weaponGrid.length) {
		//console.log(`${MODULE_ID} | Could not find SD-grid in weapon sheet`);
		return;
	}

	// Find the Type select to insert after it
	const $typeSelect = $weaponGrid.find('select[name="system.type"]');
	if (!$typeSelect.length) {
		//console.log(`${MODULE_ID} | Could not find Type select in weapon sheet`);
		return;
	}

	// Get current damage type from flags
	const currentDamageType = item.getFlag(MODULE_ID, 'baseDamageType') || 'standard';

	// Build damage type options
	const damageTypes = [
		{ id: "standard", name: "Standard Damage" },
		{ id: "bludgeoning", name: "Bludgeoning" },
		{ id: "slashing", name: "Slashing" },
		{ id: "piercing", name: "Piercing" },
		{ id: "physical", name: "Physical" },
		{ id: "fire", name: "Fire" },
		{ id: "cold", name: "Cold" },
		{ id: "lightning", name: "Lightning" },
		{ id: "acid", name: "Acid" },
		{ id: "poison", name: "Poison" },
		{ id: "necrotic", name: "Necrotic" },
		{ id: "radiant", name: "Radiant" },
		{ id: "psychic", name: "Psychic" },
		{ id: "force", name: "Force" }
	];

	const optionsHtml = damageTypes.map(type =>
		`<option value="${type.id}" ${currentDamageType === type.id ? 'selected' : ''}>${type.name}</option>`
	).join('');

	// Create the h3 label and select matching the existing style
	const $damageLabel = $('<h3>Damage Type</h3>');
	const $damageSelect = $(`<select class="sdx-weapon-damage-type-select" name="flags.${MODULE_ID}.baseDamageType">${optionsHtml}</select>`);

	// Insert after the Type select (h3 + select pair)
	$typeSelect.after($damageSelect);
	$damageSelect.before($damageLabel);

	// Handle change event
	$damageSelect.on('change', async function () {
		const newType = $(this).val();
		await item.setFlag(MODULE_ID, 'baseDamageType', newType);
		//console.log(`${MODULE_ID} | Set weapon base damage type to: ${newType}`);
	});

	//console.log(`${MODULE_ID} | Injected damage type dropdown for weapon: ${item.name}`);
}

/**
 * Inject a weapon spell configuration button after the header light
 */
function injectStaffSpellButton(app, html, item) {
	// Only for Weapon type items
	if (item.type !== "Weapon") return;

	// Check if already injected
	if (html.find('.sdx-staff-spell-button').length > 0) return;

	// Find the header with class "light" (ITEM PROPERTIES header)
	const $headerLight = html.find('.SD-box .header.light').first();
	if (!$headerLight.length) {
		//console.log(`${MODULE_ID} | Could not find header.light in weapon sheet`);
		return;
	}

	// Get the number of attached spells
	const staffSpells = item.getFlag(MODULE_ID, "staffSpells") || [];
	const spellCount = staffSpells.length;
	const countText = spellCount > 0 ? ` (${spellCount})` : "";

	// Create a settings button
	const $button = $(`
		<button type="button" class="sdx-staff-spell-button" title="Configure Weapon Spells">
			<i class="fas fa-wand-magic-sparkles"></i> Configure Weapon Spells${countText}
		</button>
	`);

	// Handle button click
	$button.on('click', async function (e) {
		e.preventDefault();
		const manager = new StaffSpellManager(item);
		manager.render(true);
	});

	// Insert button after the header light
	$headerLight.after($button);

	//console.log(`${MODULE_ID} | Injected weapon spell button for weapon: ${item.name}`);
}

/**
 * Get all equipped weapons and their attached spells
 */
async function getEquippedStaffSpells(actor) {
	const staffSpells = [];

	// Find all equipped weapon items
	const equippedWeapons = actor.items.filter(item =>
		item.type === "Weapon" &&
		item.system?.equipped === true
	);

	// Load spells from each weapon
	for (const staff of equippedWeapons) {
		const spellRefs = staff.getFlag(MODULE_ID, "staffSpells") || [];

		for (const spellRef of spellRefs) {
			try {
				const spell = await fromUuid(spellRef.uuid);
				if (spell && spell.type === "Spell") {
					staffSpells.push({
						staffId: staff.id,
						staffName: staff.name,
						spell: spell,
						spellId: spell.id,
						spellName: spell.name,
						spellImg: spell.img,
						spellData: spell,
						maxUses: spellRef.maxUses,
						currentUses: spellRef.currentUses
					});
				}
			} catch (err) {
				console.warn(`${MODULE_ID} | Could not load spell ${spellRef.uuid} from weapon ${staff.name}:`, err);
			}
		}
	}

	return staffSpells;
}

/**
 * Build HTML for weapon spells section
 */
function buildStaffSpellsHtml(staffSpells) {
	let spellsHtml = "";

	for (const { staffName, staffId, spell, spellName, spellImg, currentUses, maxUses, spellData } of staffSpells) {
		// Get spell duration and range
		const durationType = spellData?.system?.duration?.type || "";
		const durationValue = spellData?.system?.duration?.value || "";
		const rangeKey = spellData?.system?.range || "";

		// Format duration display
		let durationDisplay = "";
		if (durationType === "focus") {
			durationDisplay = "Focus";
		} else if (durationType === "instant") {
			durationDisplay = "Instant";
		} else if (durationType === "rounds") {
			durationDisplay = `${durationValue} rounds`;
		} else if (durationType === "minutes") {
			durationDisplay = `${durationValue} minutes`;
		} else if (durationType === "hours") {
			durationDisplay = `${durationValue} hours`;
		} else if (durationDisplay) {
			durationDisplay = durationType;
		}

		// Check if depleted
		const isDepleted = maxUses !== null && currentUses === 0;

		// Build uses display for actions section
		let usesHtml = "";
		if (maxUses !== null && maxUses !== undefined) {
			const current = currentUses ?? maxUses;
			const usesClass = current === 0 ? "sdx-staff-spell-uses-depleted" : "sdx-staff-spell-uses";
			usesHtml = `<span class="${usesClass}" data-tooltip="Uses remaining">${current}/${maxUses}</span>`;
		}

		// Create a clickable spell entry similar to regular spells
		spellsHtml += `
			<li class="item sdx-staff-spell" data-spell-uuid="${spell.uuid}" data-staff-id="${staffId}" data-item-type="Spell">
				<div class="item-image" style="background-image: url(${spellImg})">
					<i class="fas fa-comment fa-lg"></i>
				</div>
				<a class="item-name sdx-staff-spell-name" data-action="show-details" title="From ${staffName}">${spellName}</a>
				<div class="duration">${durationDisplay}</div>
				<div class="range">${rangeKey ? CONFIG.SHADOWDARK?.spellRanges?.[rangeKey] || rangeKey : ""}</div>
				<div class="actions">
					${usesHtml}
					${durationType === "focus" ? `
						<a
							data-action="focus-staff-spell"
							data-spell-uuid="${spell.uuid}"
							data-staff-id="${staffId}"
							data-tooltip="Focus on this spell"
							${isDepleted ? 'style="opacity: 0.3; pointer-events: none;"' : ''}
						>
							<i class="fa-solid fa-brain"></i>
						</a>
					` : ''}
					${!isDepleted ? `
						<a
							data-action="cast-staff-spell"
							data-spell-uuid="${spell.uuid}"
							data-staff-id="${staffId}"
							data-tooltip="Cast spell from weapon"
						>
							<i class="fa-solid fa-wand-magic-sparkles"></i>
						</a>
					` : `
						<a style="opacity: 0.3; pointer-events: none;" data-tooltip="No uses remaining">
							<i class="fa-solid fa-wand-magic-sparkles"></i>
						</a>
					`}
				</div>
			</li>
		`;
	}

	return `
		<div class="SD-box sdx-staff-spells-section">
			<div class="header">
				<label>
					<i class="fas fa-wand-magic-sparkles"></i>
					Spells From Equipped Weapons
				</label>
			</div>
			<div class="content">
				<ol class="SD-list sdx-staff-spells-list">
					<li class="header">
						<div class="item-name">Weapon Spell</div>
						<div class="duration">Duration</div>
						<div class="range">Range</div>
						<div class="actions"></div>
					</li>
					${spellsHtml}
				</ol>
			</div>
		</div>
	`;
}

/**
 * Inject weapon spells UI into the player sheet's spell tab
 */
async function injectStaffSpellsUI(sheet, html, data) {
	const actor = sheet.actor;
	if (!actor) return;

	// Get equipped weapon spells
	const staffSpells = await getEquippedStaffSpells(actor);
	if (staffSpells.length === 0) return;

	// Find the spells tab
	const spellsTab = html.find(".tab-spells, section[data-tab='tab-spells']");
	if (spellsTab.length === 0) return;

	// Build and inject weapon spells section
	const staffSpellsHtml = buildStaffSpellsHtml(staffSpells);
	spellsTab.prepend(staffSpellsHtml);

	// Attach click handler to show spell details
	spellsTab.find("[data-action='show-details']").on("click", async (event) => {
		event.preventDefault();
		const $spell = $(event.currentTarget).closest(".sdx-staff-spell");
		const spellUuid = $spell.data("spell-uuid");

		if (!spellUuid) return;

		try {
			const spell = await fromUuid(spellUuid);
			if (spell && spell.sheet) {
				spell.sheet.render(true);
			}
		} catch (err) {
			console.error(`${MODULE_ID} | Error opening staff spell sheet:`, err);
		}
	});

	// Attach click handler to cast staff spells
	spellsTab.find("[data-action='cast-staff-spell']").on("click", async (event) => {
		event.preventDefault();
		const $link = $(event.currentTarget);
		const spellUuid = $link.data("spell-uuid");
		const staffId = $link.data("staff-id");

		if (!spellUuid || !staffId) return;

		try {
			// Get the staff weapon
			const staff = actor.items.get(staffId);
			if (!staff) {
				ui.notifications.error("Staff weapon not found");
				return;
			}

			// Get spell reference
			const staffSpells = staff.getFlag(MODULE_ID, "staffSpells") || [];
			const spellRef = staffSpells.find(s => s.uuid === spellUuid);

			if (!spellRef) {
				ui.notifications.error("Spell not found on staff");
				return;
			}

			// Check if has uses remaining
			if (spellRef.maxUses !== null && spellRef.currentUses === 0) {
				ui.notifications.warn("This spell has no uses remaining");
				return;
			}

			// Load the spell from UUID
			const spellDoc = await fromUuid(spellUuid);
			if (!spellDoc) {
				ui.notifications.error("Could not load spell");
				return;
			}

			// Create a temporary wand item (so it bypasses class restrictions)
			const spellData = spellDoc.toObject();

			// Determine spellcasting ability (use actor's primary if available, otherwise INT)
			let spellAbility = "int";
			const characterClass = await actor.getClass();
			if (characterClass?.system?.spellcasting?.ability) {
				spellAbility = characterClass.system.spellcasting.ability;
			}

			// Get the spell image - use staff image as fallback
			const spellImage = spellData.img || staff.img || "icons/svg/mystery-man.svg";

			// Copy all spell data to wand, including flags for damage/effects/etc
			const wandData = {
				name: `${staff.name} - ${spellData.name}`,
				type: "Wand",
				img: spellImage,
				system: {
					spellName: spellData.name,
					description: spellData.system.description,
					duration: spellData.system.duration,
					range: spellData.system.range,
					tier: spellData.system.tier,
					ability: spellAbility,
					cost: { gp: 0, sp: 0, cp: 0 },
					slots: { slots_used: 0 },
					equipped: true,
					lost: false,
					stashed: false
				},
				// Copy all flags from the spell (includes spellDamage, effects, etc.)
				flags: spellData.flags || {},
				// Copy effects from the spell
				effects: spellData.effects || []
			};

			const [tempWand] = await actor.createEmbeddedDocuments("Item", [wandData]);

			// Build options for skip prompt (like shift-click)
			const options = actor.buildOptionsForSkipPrompt(event, {});

			// Get ability bonus for the spell
			const abilityId = spellAbility;
			const abilityBonus = actor.abilityModifier(abilityId);

			// Get base difficulty (use 10 + tier as default if no class)
			let baseDifficulty = 10 + (wandData.system.tier || 1);
			if (characterClass?.system?.spellcasting?.baseDifficulty) {
				baseDifficulty = characterClass.system.spellcasting.baseDifficulty;
			}

			// Build roll data
			const rollType = wandData.system.spellName.slugify();
			const data = {
				rollType,
				item: tempWand,
				actor: actor,
				abilityBonus: abilityBonus,
				baseDifficulty: baseDifficulty,
				talentBonus: actor.system.bonuses.spellcastingCheckBonus || 0,
			};

			const parts = ["1d20", "@abilityBonus", "@talentBonus"];

			// Call rollSpell directly on the wand item, bypassing class checks
			await tempWand.rollSpell(parts, data, options);

			// Delay deletion to allow damage cards and automation to complete
			// Delete after 1 second to ensure all chat messages and automation finish
			setTimeout(async () => {
				try {
					await tempWand.delete();
				} catch (err) {
					// Item may already be deleted, ignore error
				}
			}, 1000);

			// Consume a use if limited
			if (spellRef.maxUses !== null && spellRef.maxUses > 0) {
				spellRef.currentUses = Math.max(0, (spellRef.currentUses ?? spellRef.maxUses) - 1);
				await staff.setFlag(MODULE_ID, "staffSpells", staffSpells);

				// Notify if depleted
				if (spellRef.currentUses === 0) {
					ui.notifications.warn(`${spellDoc.name} on ${staff.name} has no uses remaining`);

					// Check if weapon should be destroyed when all spells depleted
					const destroyAtZero = staff.getFlag(MODULE_ID, "destroyAtZero");
					if (destroyAtZero) {
						// Check if ALL spells are at 0 uses
						const allDepleted = staffSpells.every(s => {
							// Spell is depleted if it has maxUses set and currentUses is 0
							if (s.maxUses === null || s.maxUses === undefined) {
								return false; // Unlimited uses, never depleted
							}
							return (s.currentUses ?? s.maxUses) === 0;
						});

						if (allDepleted) {
							ui.notifications.warn(`${staff.name} has been destroyed - all spells depleted!`);
							await staff.delete();
							return; // Exit early since weapon is deleted
						}
					}
				}

				// Re-render the sheet to update the uses display
				sheet.render(false);
			}
		} catch (err) {
			console.error(`${MODULE_ID} | Error casting staff spell:`, err);
			ui.notifications.error("Failed to cast spell from staff");
		}
	});

	// Attach click handler to focus on staff spells
	spellsTab.find("[data-action='focus-staff-spell']").on("click", async (event) => {
		event.preventDefault();
		const $link = $(event.currentTarget);
		const spellUuid = $link.data("spell-uuid");
		const staffId = $link.data("staff-id");

		if (!spellUuid || !staffId) return;

		try {
			// Get the staff weapon
			const staff = actor.items.get(staffId);
			if (!staff) {
				ui.notifications.error("Staff weapon not found");
				return;
			}

			// Get spell reference
			const staffSpells = staff.getFlag(MODULE_ID, "staffSpells") || [];
			const spellRef = staffSpells.find(s => s.uuid === spellUuid);

			if (!spellRef) {
				ui.notifications.error("Spell not found on staff");
				return;
			}

			// Check if has uses remaining
			if (spellRef.maxUses !== null && spellRef.currentUses === 0) {
				ui.notifications.warn("This spell has no uses remaining");
				return;
			}

			// Load the spell from UUID
			const spellDoc = await fromUuid(spellUuid);
			if (!spellDoc) {
				ui.notifications.error("Could not load spell");
				return;
			}

			// Create a temporary wand item (so it bypasses class restrictions)
			const spellData = spellDoc.toObject();

			// Determine spellcasting ability (use actor's primary if available, otherwise INT)
			let spellAbility = "int";
			const characterClass = await actor.getClass();
			if (characterClass?.system?.spellcasting?.ability) {
				spellAbility = characterClass.system.spellcasting.ability;
			}

			// Get the spell image - use staff image as fallback
			const spellImage = spellData.img || staff.img || "icons/svg/mystery-man.svg";

			// Copy all spell data to wand, including flags for damage/effects/etc
			const wandData = {
				name: `${staff.name} - ${spellData.name}`,
				type: "Wand",
				img: spellImage,
				system: {
					spellName: spellData.name,
					description: spellData.system.description,
					duration: spellData.system.duration,
					range: spellData.system.range,
					tier: spellData.system.tier,
					ability: spellAbility,
					cost: { gp: 0, sp: 0, cp: 0 },
					slots: { slots_used: 0 },
					equipped: true,
					lost: false,
					stashed: false
				},
				// Copy all flags from the spell (includes spellDamage, effects, etc.)
				flags: spellData.flags || {},
				// Copy effects from the spell
				effects: spellData.effects || []
			};

			const [tempWand] = await actor.createEmbeddedDocuments("Item", [wandData]);

			// Build options for skip prompt (like shift-click)
			const options = actor.buildOptionsForSkipPrompt(event, {});

			// Get ability bonus for the spell
			const abilityId = spellAbility;
			const abilityBonus = actor.abilityModifier(abilityId);

			// Get base difficulty (use 10 + tier as default if no class)
			let baseDifficulty = 10 + (wandData.system.tier || 1);
			if (characterClass?.system?.spellcasting?.baseDifficulty) {
				baseDifficulty = characterClass.system.spellcasting.baseDifficulty;
			}

			// Build roll data
			const rollType = wandData.system.spellName.slugify();
			const data = {
				rollType,
				item: tempWand,
				actor: actor,
				abilityBonus: abilityBonus,
				baseDifficulty: baseDifficulty,
				talentBonus: actor.system.bonuses.spellcastingCheckBonus || 0,
			};

			const parts = ["1d20", "@abilityBonus", "@talentBonus"];

			// Call rollSpell directly on the wand item, bypassing class checks
			await tempWand.rollSpell(parts, data, options);

			// Delay deletion to allow damage cards and automation to complete
			// Delete after 1 second to ensure all chat messages and automation finish
			setTimeout(async () => {
				try {
					await tempWand.delete();
				} catch (err) {
					// Item may already be deleted, ignore error
				}
			}, 1000);

			// Consume a use if limited
			if (spellRef.maxUses !== null && spellRef.maxUses > 0) {
				spellRef.currentUses = Math.max(0, (spellRef.currentUses ?? spellRef.maxUses) - 1);
				await staff.setFlag(MODULE_ID, "staffSpells", staffSpells);

				// Notify if depleted
				if (spellRef.currentUses === 0) {
					ui.notifications.warn(`${spellDoc.name} on ${staff.name} has no uses remaining`);
				}

				// Re-render the sheet to update the uses display
				sheet.render(false);
			}
		} catch (err) {
			console.error(`${MODULE_ID} | Error focusing on staff spell:`, err);
			ui.notifications.error("Failed to focus on spell from staff");
		}
	});

	//console.log(`${MODULE_ID} | Injected ${staffSpells.length} weapon spells for actor: ${actor.name}`);
}

/**
 * Inject recharge buttons for equipped weapons with spells in the inventory tab
 */
function injectWeaponSpellRechargeButtons(app, html, actor) {
	if (!actor || actor.type !== "Player") return;

	// Find the inventory tab
	const $inventoryTab = html.find('.tab[data-tab="tab-inventory"]');
	if (!$inventoryTab.length) return;

	// Find all equipped weapon items and check if they have spells
	actor.items.forEach(item => {
		if (item.type !== "Weapon") return;
		if (!item.system?.equipped) return;

		const staffSpells = item.getFlag(MODULE_ID, "staffSpells") || [];
		if (staffSpells.length === 0) return;

		// Find this item's row in the inventory
		const $itemRow = $inventoryTab.find(`[data-item-id="${item.id}"]`).closest('.item');
		if (!$itemRow.length) return;

		// Find the actions div for this item
		const $actions = $itemRow.find('.actions');
		if (!$actions.length) return;

		// Check if recharge button already exists
		if ($actions.find('.sdx-recharge-weapon-spells').length > 0) return;

		// Create recharge button
		const $rechargeBtn = $(`
			<a class="sdx-recharge-weapon-spells"
			   data-item-id="${item.id}"
			   data-tooltip="Recharge all weapon spells"
			   style="color: #4ade80;">
				<i class="fas fa-arrows-rotate"></i>
			</a>
		`);

		// Add click handler
		$rechargeBtn.on('click', async (event) => {
			event.preventDefault();
			const itemId = $(event.currentTarget).data('item-id');
			const weapon = actor.items.get(itemId);
			if (!weapon) return;

			const spells = weapon.getFlag(MODULE_ID, "staffSpells") || [];
			if (spells.length === 0) return;

			// Restore all spell uses to maximum
			let recharged = false;
			spells.forEach(spell => {
				if (spell.maxUses !== null && spell.maxUses !== undefined) {
					if ((spell.currentUses ?? spell.maxUses) < spell.maxUses) {
						spell.currentUses = spell.maxUses;
						recharged = true;
					}
				}
			});

			if (recharged) {
				await weapon.setFlag(MODULE_ID, "staffSpells", spells);
				ui.notifications.info(`Recharged all spells on ${weapon.name}`);
				// Re-render the sheet to update displays
				app.render(false);
			} else {
				ui.notifications.info(`All spells on ${weapon.name} are already fully charged`);
			}
		});

		// Prepend the button to actions (so it appears first)
		$actions.prepend($rechargeBtn);
	});
}

/**
 * Patch the canUseMagicItems() method to also check for wands, scrolls, and equipped weapons with spells
 */
function patchCanUseMagicItems() {
	libWrapper.register(MODULE_ID, "CONFIG.Actor.documentClass.prototype.canUseMagicItems", async function (wrapped, ...args) {
		// Call the original method
		const originalResult = await wrapped(...args);

		// If already true, no need to check further
		if (originalResult) return true;

		// Check if actor has any wands, scrolls, or equipped weapons with spells
		const hasWands = this.items.some(item => item.type === "Wand" && !item.system?.stashed);
		const hasScrolls = this.items.some(item => item.type === "Scroll" && !item.system?.stashed);

		// Check for equipped weapons with spells
		const equippedWeapons = this.items.filter(item =>
			item.type === "Weapon" &&
			item.system?.equipped === true
		);

		const hasWeaponSpells = equippedWeapons.some(weapon => {
			const spellRefs = weapon.getFlag(MODULE_ID, "staffSpells") || [];
			return spellRefs.length > 0;
		});

		// Return true if any magic items are present
		return hasWands || hasScrolls || hasWeaponSpells;
	}, "WRAPPER");

	//console.log(`${MODULE_ID} | Patched canUseMagicItems() to detect wands, scrolls, and weapon spells`);
}

// Re-render weapon sheet when staff spells are updated
Hooks.on("updateItem", (item, changes, options, userId) => {
	// Check if staffSpells flag was updated
	if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.staffSpells`)) {
		// Re-render any open item sheets for this weapon
		Object.values(item.apps).forEach(app => {
			if (app.rendered) {
				app.render(false);
			}
		});
	}
});


// Inject container UI into Basic item sheets
Hooks.on("renderItemSheet", (app, html, data) => {
	try {
		injectBasicContainerUI(app, html);
		injectAmmunitionBonuses(app, html);
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
		injectSpellAlignmentField(app, html);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to inject spell alignment field`, err);
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
			injectWeaponDamageTypeDropdown(app, html, item);
			injectStaffSpellButton(app, html, item);
		} else if (item?.type === "Armor") {
			// For shields (Armor), just inject the animation button
			injectWeaponAnimationButton(html, item);
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
				$el.contents().each(function () {
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
			//console.log(`${MODULE_ID} | Stored ${targetIds.length} targets in message flags:`, targetIds);

			// Mirror Image Automation
			// If this is an attack roll targeting someone with Mirror Image duplicates
			const isAttack = message.rolls?.some(r => r.terms?.some(t => t.faces === 20));
			if (isAttack) {
				for (const targetToken of targets) {
					const targetActor = targetToken.actor;
					if (!targetActor) continue;

					const mirrorImages = targetActor.getFlag(MODULE_ID, "mirrorImages");
					if (mirrorImages > 0) {
						// Decrement duplicates
						const newCount = mirrorImages - 1;

						// Update actor flag and effect (async but we don't await blocking the message)
						(async () => {
							await targetActor.setFlag(MODULE_ID, "mirrorImages", newCount);

							// Update visual effect and duration tracker
							const mirrorEffect = targetActor.effects.find(e => e.getFlag(MODULE_ID, "isMirrorImage"));
							if (mirrorEffect) {
								if (newCount <= 0) {
									await mirrorEffect.delete();

									// If duration tracking is active, end it
									// If duration tracking is active, end it
									if (typeof endDurationSpell === 'function') {
										const activeSpells = getActiveDurationSpells(targetActor);
										const mirrorSpell = activeSpells.find(s => s.spellName === "Mirror Image");
										if (mirrorSpell) {
											await endDurationSpell(targetActor.id, mirrorSpell.instanceId || mirrorSpell.spellId, "expired");
										}
									}
								} else {
									await mirrorEffect.update({
										"flags.shadowdark-extras.duplicates": newCount,
										"name": `Mirror Image (${newCount})`
									});
								}
							}
						})();

						// Notify in chat (modifying the message source)
						const interceptHtml = `
							<div class="shadowdark mirror-image-intercept" style="margin-top: 5px; padding: 5px; border: 1px solid #7a7a7a; border-radius: 3px; background: rgba(0, 0, 0, 0.1);">
								<p><i class="fas fa-clone"></i> <strong>Mirror Image Intercepted!</strong></p>
								<p>An illusory duplicate evaporates, causing the attack to miss <strong>${targetActor.name}</strong>.</p>
								<p style="font-size: 0.9em; font-style: italic;">Remaining duplicates: ${newCount}</p>
							</div>
						`;

						message.updateSource({
							content: (message.content || "") + interceptHtml,
							flavor: (message.flavor || "") + ` [Intercepted: ${targetActor.name}]`
						});

						// Only consume one duplicate per attack message even if multiple targets?
						// Usually attacks only target one person in SD, so this is fine.
						break;
					}
				}
			}
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

			if (item && ["Spell", "NPC Spell", "Scroll", "Potion", "Wand"].includes(item.type)) {
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

				// Store auraEffects config if it exists
				if (item.flags?.[MODULE_ID]?.auraEffects) {
					itemConfig.auraEffects = foundry.utils.duplicate(item.flags[MODULE_ID].auraEffects);
				}

				// Store spellDamage config if it exists
				if (item.flags?.[MODULE_ID]?.spellDamage) {
					itemConfig.spellDamage = foundry.utils.duplicate(item.flags[MODULE_ID].spellDamage);
				}

				// Store coatingPoison config if it exists
				if (item.flags?.[MODULE_ID]?.coatingPoison) {
					itemConfig.coatingPoison = foundry.utils.duplicate(item.flags[MODULE_ID].coatingPoison);
				}

				message.updateSource({
					"flags.shadowdark-extras.itemConfig": itemConfig
				});

				//console.log(`${MODULE_ID} | Stored item config for ${item.name}:`, itemConfig);
			}
		}

		// Check for pending hit bonus info and store it in the message flags
		// This allows us to display the hit bonus formula and result in the chat card
		// Try multiple sources for actor/item IDs since they may not all be available at this point
		const sdFlags = message.flags?.shadowdark;
		const speakerActorId = message.speaker?.actor;

		// Debug: log the regex matches
		//console.log(`${MODULE_ID} | preCreateChatMessage regex matches:`, {
		//actorIdMatch: actorIdMatch ? actorIdMatch[1] : null,
		//itemIdMatch: itemIdMatch ? itemIdMatch[1] : null
		//});

		// Try to get itemId from multiple sources:
		// 1. message.flags.shadowdark.itemId (may not be set yet)
		// 2. HTML data attributes - use itemIdMatch from earlier
		let sdItemId = sdFlags?.itemId;
		if (!sdItemId && itemIdMatch) {
			sdItemId = itemIdMatch[1];
		}

		// Debug: log the content to see what attributes are used
		//console.log(`${MODULE_ID} | preCreateChatMessage content snippet:`, content.substring(0, 500));

		// Debug: log what we have
		/*//console.log(`${MODULE_ID} | preCreateChatMessage - checking for hit bonus:`, {
			speakerActorId,
			sdItemId,
			pendingKeys: Array.from(_pendingHitBonusInfo.keys())
		});*/

		if (speakerActorId && sdItemId) {
			const hitBonusKey = `${speakerActorId}-${sdItemId}`;
			//console.log(`${MODULE_ID} | Looking for hit bonus key: ${hitBonusKey}`);
			const hitBonusInfo = _pendingHitBonusInfo.get(hitBonusKey);

			if (hitBonusInfo) {
				// Store the hit bonus info in the message flags
				// No timestamp check needed - we clean up after use anyway
				// The hit bonus is stored before the roll dialog opens, so it can be
				// quite old by the time the user clicks roll
				message.updateSource({
					"flags.shadowdark-extras.hitBonus": {
						formula: hitBonusInfo.formula,
						result: hitBonusInfo.result,
						parts: hitBonusInfo.parts
					}
				});
				//console.log(`${MODULE_ID} | Stored hit bonus info in message:`, hitBonusInfo);

				// Clean up the pending info
				_pendingHitBonusInfo.delete(hitBonusKey);
			}
		} else if (actorIdMatch && itemIdMatch) {
			// Fallback: try HTML data attributes (for item cards)
			const actorId = actorIdMatch[1];
			const itemId = itemIdMatch[1];
			const hitBonusKey = `${actorId}-${itemId}`;
			const hitBonusInfo = _pendingHitBonusInfo.get(hitBonusKey);

			if (hitBonusInfo) {
				const isRecent = (Date.now() - hitBonusInfo.timestamp) < 5000;
				if (isRecent) {
					message.updateSource({
						"flags.shadowdark-extras.hitBonus": {
							formula: hitBonusInfo.formula,
							result: hitBonusInfo.result,
							parts: hitBonusInfo.parts
						}
					});
					//console.log(`${MODULE_ID} | Stored hit bonus info in message (from HTML):`, hitBonusInfo);
				}
				_pendingHitBonusInfo.delete(hitBonusKey);
			}
		}

		// Store current targets in flags for Item Macro use
		if (game.user.targets.size > 0 && !message.flags[MODULE_ID]?.targetIds) {
			const targetIds = Array.from(game.user.targets).map(t => t.id);
			foundry.utils.setProperty(message._source, `flags.${MODULE_ID}.targetIds`, targetIds);
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

	// Hide item description if setting is enabled
	try {
		const combatSettings = game.settings.get(MODULE_ID, "combatSettings");
		if (combatSettings?.hideItemDescription) {
			// Hide the card-content which contains weapon/spell descriptions
			const $html = $(html);
			$html.find('.card-content').hide();
		}
	} catch (err) {
		// Settings may not be registered yet, ignore
	}
});

/**
 * Process weapon bonuses for a chat message
 */
async function processWeaponBonuses(message, html) {
	// First, check if we have hit bonus info to display - this should happen
	// regardless of other conditions since it was pre-calculated
	const hitBonusInfo = message.flags?.[MODULE_ID]?.hitBonus;
	//console.log(`${MODULE_ID} | processWeaponBonuses - hitBonusInfo:`, hitBonusInfo);
	if (hitBonusInfo) {
		await injectHitBonusDisplay(html, hitBonusInfo);
	}

	// Check if this is a weapon attack roll (for damage bonus display)
	const flags = message.flags?.shadowdark;
	if (!flags?.itemId) return;

	// Get the actor and item
	const actor = game.actors.get(message.speaker?.actor) || canvas.tokens?.get(message.speaker?.token)?.actor;
	if (!actor) return;

	const item = actor.items.get(flags.itemId);
	if (!item || item.type !== "Weapon") return;

	// Check if weapon has damage bonuses configured
	const bonusFlags = item.flags?.[MODULE_ID]?.weaponBonus;
	if (!bonusFlags?.enabled) return;

	// Check if this was a critical hit
	const isCritical = message.rolls?.some(r => {
		const d20Roll = r.terms?.find(t => t.faces === 20);
		return d20Roll?.total === 20;
	});

	// Try to get the target
	const targetToken = message.flags?.shadowdark?.targetToken
		? canvas.tokens?.get(message.flags.shadowdark.targetToken)
		: game.user.targets.first();
	const target = targetToken?.actor;

	// Inject the weapon damage bonus display
	await injectWeaponBonusDisplay(message, html, item, actor, target, isCritical);
}

/**
 * Inject hit bonus information into the chat card
 * @param {jQuery} html - The message HTML
 * @param {Object} hitBonusInfo - { formula, result, parts }
 */
async function injectHitBonusDisplay(html, hitBonusInfo) {
	if (!hitBonusInfo || hitBonusInfo.result === 0) return;

	// Build tooltip from labels
	let tooltip = "";
	if (hitBonusInfo.parts && hitBonusInfo.parts.length > 0) {
		const labels = hitBonusInfo.parts
			.filter(p => p.label)
			.map(p => p.label);
		if (labels.length > 0) {
			tooltip = labels.join(", ");
		}
	}

	const sign = hitBonusInfo.result > 0 ? "+" : "";
	const tooltipAttr = tooltip ? `data-tooltip="${tooltip}"` : "";

	// Always show formula = result format
	let bonusHtml = `<div class="sdx-hit-bonus-display" ${tooltipAttr}>`;
	bonusHtml += `<span class="sdx-hit-bonus-label">Hit Bonus:</span>`;
	bonusHtml += `<span class="sdx-hit-bonus-formula">${hitBonusInfo.formula}</span>`;
	bonusHtml += `<span class="sdx-hit-bonus-equals">=</span>`;
	bonusHtml += `<span class="sdx-hit-bonus-result">${sign}${hitBonusInfo.result}</span>`;
	bonusHtml += `</div>`;

	// Find where to inject (after the roll result but before damage sections)
	const $attackRoll = html.find('.card-attack-roll');
	if ($attackRoll.length) {
		// Insert after the attack roll section
		$attackRoll.after(bonusHtml);
	} else {
		// Fallback: insert after the dice roll
		const $diceRoll = html.find('.dice-roll').first();
		if ($diceRoll.length) {
			$diceRoll.after(bonusHtml);
		}
	}
}

// Wrap ItemSheet getData to modify context before rendering
Hooks.once("ready", () => {
	if (!globalThis.ItemSheet?.prototype?.getData) return;

	const originalGetData = globalThis.ItemSheet.prototype.getData;
	globalThis.ItemSheet.prototype.getData = async function (options = {}) {
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

		globalThis.shadowdark.utils.createItemFromSpell = async function (type, spell) {
			// Call the original function to get the base item data
			const itemData = await originalCreateItemFromSpell.call(this, type, spell);

			// Initialize flags object if needed
			itemData.flags = itemData.flags || {};
			itemData.flags[MODULE_ID] = itemData.flags[MODULE_ID] || {};

			// Preserve spell damage configuration flags
			if (spell.flags?.[MODULE_ID]?.spellDamage) {
				itemData.flags[MODULE_ID].spellDamage = foundry.utils.duplicate(spell.flags[MODULE_ID].spellDamage);
				//console.log(`${MODULE_ID} | Preserved spell damage flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].spellDamage);
			}

			// Preserve Targeting configuration flags
			if (spell.flags?.[MODULE_ID]?.targeting) {
				itemData.flags[MODULE_ID].targeting = foundry.utils.duplicate(spell.flags[MODULE_ID].targeting);
				//console.log(`${MODULE_ID} | Preserved targeting flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].targeting);
			}

			// Preserve summoning configuration flags
			if (spell.flags?.[MODULE_ID]?.summoning) {
				itemData.flags[MODULE_ID].summoning = foundry.utils.duplicate(spell.flags[MODULE_ID].summoning);
				//console.log(`${MODULE_ID} | Preserved summoning flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].summoning);
			}

			// Preserve item give configuration flags
			if (spell.flags?.[MODULE_ID]?.itemGive) {
				itemData.flags[MODULE_ID].itemGive = foundry.utils.duplicate(spell.flags[MODULE_ID].itemGive);
				//console.log(`${MODULE_ID} | Preserved item give flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].itemGive);
			}

			// Preserve unidentified flags
			if (spell.flags?.[MODULE_ID]?.unidentified) {
				itemData.flags[MODULE_ID].unidentified = spell.flags[MODULE_ID].unidentified;
				itemData.flags[MODULE_ID].unidentifiedDescription = spell.flags[MODULE_ID].unidentifiedDescription || "";
			}

			// Preserve Item Macro trigger configuration flags
			if (spell.flags?.[MODULE_ID]?.itemMacro) {
				itemData.flags[MODULE_ID].itemMacro = foundry.utils.duplicate(spell.flags[MODULE_ID].itemMacro);
				//console.log(`${MODULE_ID} | Preserved itemMacro flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].itemMacro);
			}

			// Preserve Template Effects configuration flags
			if (spell.flags?.[MODULE_ID]?.templateEffects) {
				itemData.flags[MODULE_ID].templateEffects = foundry.utils.duplicate(spell.flags[MODULE_ID].templateEffects);
				//console.log(`${MODULE_ID} | Preserved templateEffects flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].templateEffects);
			}

			// Preserve Aura Effects configuration flags
			if (spell.flags?.[MODULE_ID]?.auraEffects) {
				itemData.flags[MODULE_ID].auraEffects = foundry.utils.duplicate(spell.flags[MODULE_ID].auraEffects);
				//console.log(`${MODULE_ID} | Preserved auraEffects flags for ${spell.name} -> ${itemData.name}`, itemData.flags[MODULE_ID].auraEffects);
			}

			// Preserve Item Macro module's macro data (itemacro module)
			if (spell.flags?.itemacro?.macro) {
				itemData.flags.itemacro = itemData.flags.itemacro || {};
				itemData.flags.itemacro.macro = foundry.utils.duplicate(spell.flags.itemacro.macro);
				//console.log(`${MODULE_ID} | Preserved itemacro macro for ${spell.name} -> ${itemData.name}`);
			}

			return itemData;
		};

		//console.log(`${MODULE_ID} | Wrapped shadowdark.utils.createItemFromSpell to preserve spell flags`);
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
		const totalCoins = (Number(coins.gp ?? 0)) + (Number(coins.sp ?? 0)) + (Number(coins.cp ?? 0));
		containedSlots += Math.floor(totalCoins / 100);
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

/* ============================================================================
 * Background Advancement System
 * ============================================================================ */

/**
 * Grant items from an advancement entry to an actor
 * @param {Actor} actor - The actor to grant items to
 * @param {Item} background - The background item
 * @param {Object} entry - The advancement entry
 */
async function grantAdvancementItems(actor, background, entry) {
	// Check if already granted
	const granted = actor.getFlag(MODULE_ID, "grantedAdvancements") || {};
	const backgroundGrants = granted[background.id] || [];

	if (backgroundGrants.includes(entry.id)) {
		//console.log(`${MODULE_ID} | Advancement ${entry.id} already granted to ${actor.name}, skipping`);
		return;
	}

	// Load items from UUIDs (skip invalid silently with console.warn)
	const itemsToCreate = [];
	for (const itemRef of entry.items || []) {
		try {
			const doc = await fromUuid(itemRef.uuid);
			if (!doc) {
				console.warn(`${MODULE_ID} | Could not load item ${itemRef.uuid}, skipping`);
				continue;
			}
			itemsToCreate.push(doc.toObject());
		} catch (err) {
			console.warn(`${MODULE_ID} | Error loading item ${itemRef.uuid}:`, err);
			// Continue with other items
		}
	}

	// Create items on actor
	if (itemsToCreate.length > 0) {
		await actor.createEmbeddedDocuments("Item", itemsToCreate);
		const itemNames = itemsToCreate.map(i => i.name).join(", ");
		ui.notifications.info(`${actor.name} gained: ${itemNames}`);
		//console.log(`${MODULE_ID} | Granted ${itemsToCreate.length} items to ${actor.name} from advancement ${entry.id}`);
	} else {
		//console.log(`${MODULE_ID} | No valid items to grant from advancement ${entry.id}`);
	}

	// Mark as granted
	backgroundGrants.push(entry.id);
	granted[background.id] = backgroundGrants;
	await actor.setFlag(MODULE_ID, "grantedAdvancements", granted);
}

/**
 * Hook: Grant advancement items when Background is set on actor (Level 0)
 * Shadowdark stores background as a UUID reference in system.background, not as an embedded item
 */
Hooks.on("updateActor", async (actor, changes, options, userId) => {
	// Only process for the updating user
	if (userId !== game.user.id) return;

	// Check if background was set
	if (!foundry.utils.hasProperty(changes, "system.background")) return;

	const backgroundUuid = changes.system.background;
	if (!backgroundUuid) return; // Background was removed

	//console.log(`${MODULE_ID} | Background set on actor "${actor.name}": ${backgroundUuid}`);

	// Load the background item from UUID
	const background = await fromUuid(backgroundUuid);
	if (!background) {
		console.warn(`${MODULE_ID} | Could not load background from UUID: ${backgroundUuid}`);
		return;
	}

	//console.log(`${MODULE_ID} | Loaded background: ${background.name}`);

	const advancement = background.getFlag(MODULE_ID, "advancement") || [];
	//console.log(`${MODULE_ID} | Advancement data:`, advancement);

	const immediateEntries = advancement.filter(e => e.level === 0);
	//console.log(`${MODULE_ID} | Found ${immediateEntries.length} level 0 advancement entries`);

	if (immediateEntries.length === 0) {
		//console.log(`${MODULE_ID} | No level 0 entries to grant`);
		return;
	}

	//console.log(`${MODULE_ID} | Granting ${immediateEntries.length} immediate advancement entries from ${background.name} to ${actor.name}`);

	// Grant items from all level 0 entries
	for (const entry of immediateEntries) {
		await grantAdvancementItems(actor, background, entry);
	}
});

/**
 * Hook: Grant advancement items when actor levels up
 * This is a SEPARATE updateActor hook that handles level changes (not background changes)
 */
Hooks.on("updateActor", async (actor, changes, options, userId) => {
	// Only the user who made the change should process this
	if (userId !== game.user.id) return;

	// Check if level changed (not background - that's handled by the other hook)
	if (!foundry.utils.hasProperty(changes, "system.level.value")) return;

	const newLevel = changes.system.level.value;
	//console.log(`${MODULE_ID} | Actor ${actor.name} level updated to ${newLevel}`);

	// Get the actor's background UUID from system.background
	const backgroundUuid = actor.system.background;
	if (!backgroundUuid) {
		//console.log(`${MODULE_ID} | No background set for ${actor.name}, skipping advancement`);
		return;
	}

	//console.log(`${MODULE_ID} | Loading background from UUID: ${backgroundUuid}`);

	// Load the background item from UUID
	const background = await fromUuid(backgroundUuid);
	if (!background) {
		console.warn(`${MODULE_ID} | Could not load background from UUID: ${backgroundUuid}`);
		return;
	}

	//console.log(`${MODULE_ID} | Found Background: ${background.name}`);

	// Get advancement entries for this level
	const advancement = background.getFlag(MODULE_ID, "advancement") || [];
	//console.log(`${MODULE_ID} | Background has ${advancement.length} total advancement entries`);

	const levelEntries = advancement.filter(e => e.level === newLevel);

	if (levelEntries.length === 0) {
		//console.log(`${MODULE_ID} | No advancement entries for level ${newLevel} in ${background.name}`);
		return;
	}

	//console.log(`${MODULE_ID} | Found ${levelEntries.length} advancement entries for level ${newLevel}`);

	// Grant items from all matching entries
	// The grantAdvancementItems function has its own duplicate checking
	for (const entry of levelEntries) {
		await grantAdvancementItems(actor, background, entry);
	}
});

// Inject Freya's Omen reroll button
Hooks.on("renderChatMessage", (message, html, data) => {
	const flags = message.flags?.shadowdark;
	//console.log(`${MODULE_ID} | Checking Freya's Omen for message ${message.id}`, flags);
	if (!flags?.isRoll) return;

	// Check if it's a critical failure on a spell
	const isCriticalFailure = flags.critical === "failure";
	//console.log(`${MODULE_ID} | isCriticalFailure: ${isCriticalFailure}`);

	if (isCriticalFailure) {
		// Check if it looks like a spell
		// We can check item type in flags.rolls.main.item (if available) or infer from roll data
		// But relying on "system.lost" logic implies it's a spell.
		// However, chat card doesn't show "system.lost".
		// Use message content or title?
		const flavor = message.flavor || "";
		// But safest is to check actor flag first.

		let actor = message.author?.character; // Default to user character
		if (message.speaker.actor) actor = game.actors.get(message.speaker.actor);
		if (message.speaker.token && canvas.tokens) {
			const token = canvas.tokens.get(message.speaker.token);
			if (token) actor = token.actor;
		}

		// Shadowdark system helper?
		// Let's use standard Foundry method if available, or manual lookup
		if (!actor && message.actor) actor = message.actor;

		if (!actor) {
			//console.log(`${MODULE_ID} | No actor found for Freya's Omen check`);
			return;
		}

		const hasFreyasOmen = actor.getFlag(MODULE_ID, "freyasOmen");
		//console.log(`${MODULE_ID} | Actor ${actor.name} has Freya's Omen: ${hasFreyasOmen}`);

		if (hasFreyasOmen) {
			// Check if item was a spell. 
			// We can try to get the item from data-item-id
			const itemId = html.find(".item-card").data("item-id");
			//console.log(`${MODULE_ID} | Item ID from card: ${itemId}`);

			if (!itemId) return;
			const item = actor.items.get(itemId);
			if (!item || !item.isSpell()) return;

			const $diceRoll = html.find(".dice-roll");
			const btn = $(`<button class="sdx-freyas-omen-reroll" style="margin-top: 5px;">
				<i class="fas fa-redo"></i> ${game.i18n.localize("SHADOWDARK.chat_card.button.freyas_omen_reroll")}
			</button>`);

			btn.click(async (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				// Reroll the item
				if (item) {
					//console.log(`${MODULE_ID} | Rerrolling spell: ${item.name}`);

					// Reconstruct roll data for a spell roll
					// Based on system logic (which isn't exposed directly for us to reuse easily)
					let abilityId = item.system.ability;

					// Fallback: Try to find ability from Class if not on item
					if (!abilityId) {
						// Check if item has spellAttribute
						if (item.system.spellAttribute) {
							abilityId = item.system.spellAttribute;
						} else {
							// Find spellcasting class
							const classes = actor.items.filter(i => i.type === "Class");
							for (const cls of classes) {
								// shadowdark system structure for class spellcasting
								if (cls.system.spellcasting?.ability) {
									abilityId = cls.system.spellcasting.ability;
									break;
								}
							}
						}
					}

					// Final fallback
					if (!abilityId) {
						console.warn(`${MODULE_ID} | Could not determine spellcasting ability for ${item.name}. Defaulting to INT.`);
						abilityId = "int";
					}

					if (!abilityId) {
						console.error(`${MODULE_ID} | Cannot reroll spell without associated ability.`);
						return;
					}

					const parts = ["1d20", "@abilityBonus"];

					// Calculate bonuses
					const abilityBonus = actor.abilityModifier(abilityId);
					// Use system config if available, otherwise fallback map or Title Case
					const abilityName = CONFIG.SHADOWDARK?.ABILITIES_LONG?.[abilityId] || abilityId.charAt(0).toUpperCase() + abilityId.slice(1);

					const data = {
						rollType: "ability",
						abilityBonus,
						ability: abilityName,
						actor: actor,
						item: item,
						baseDifficulty: 10 // Spell DC is 10 + Tier
					};

					const options = {
						title: game.i18n.format("SHADOWDARK.dialog.ability_check.header", { ability: abilityName }),
						flavor: game.i18n.format("SHADOWDARK.chat_card.button.freyas_omen_reroll") + ": " + item.name,
						speaker: ChatMessage.getSpeaker({ actor: actor }),
						// Trigger Freya's Omen specific behavior if we wanted, but standard roll is fine
					};

					item.rollSpell(parts, data, options);
				}
			});

			$diceRoll.after(btn);
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

// ============================================
// SIDEBAR & COMPENDIUM UNIDENTIFIED INDICATORS
// ============================================

/**
 * Mark unidentified items in the sidebar or compendium directory with a visual indicator (GM only)
 * Adds a red border around the thumbnail and a small question mark icon
 * @param {HTMLElement} html - The rendered HTML of the directory (plain DOM element in V13)
 * @param {Collection|Map|Array} items - The items to check for unidentified status
 */
function markUnidentifiedItemsInDirectory(html, items) {
	//console.log(`${MODULE_ID} | markUnidentifiedItemsInDirectory START`, {
	//		isGM: game.user?.isGM,
	//		html,
	//		items,
	//	itemsType: items?.constructor?.name
	//});

	// Only show for GM
	if (!game.user?.isGM) {
		//console.log(`${MODULE_ID} | Skipping - not GM`);
		return;
	}

	// Check if unidentified items feature is enabled
	// Note: The setting may not be registered yet if this hook fires early
	try {
		const settingKey = `${MODULE_ID}.enableUnidentified`;
		// Check if the setting exists first
		if (game.settings.settings.has(settingKey)) {
			const unidentifiedEnabled = game.settings.get(MODULE_ID, "enableUnidentified");
			//console.log(`${MODULE_ID} | enableUnidentified setting:`, unidentifiedEnabled);
			if (!unidentifiedEnabled) {
				//console.log(`${MODULE_ID} | Skipping - unidentified items not enabled`);
				return;
			}
		} else {
			// Setting not registered yet - we'll allow it since we know it will be enabled
			// (if not enabled, it will be fixed on next re-render after settings load)
			//console.log(`${MODULE_ID} | Setting not registered yet, proceeding anyway`);
		}
	} catch (e) {
		// If any error, log but proceed anyway
		//console.log(`${MODULE_ID} | Error checking setting, proceeding anyway`, e);
	}

	// Handle both plain DOM element and jQuery object (for compatibility)
	const element = html instanceof HTMLElement ? html : html[0] || html;

	//console.log(`${MODULE_ID} | markUnidentifiedItemsInDirectory called`, {
	//htmlType: typeof html,
	//	isHTMLElement: html instanceof HTMLElement,
	//	element,
	//	elementTag: element?.tagName,
	//	itemsType: items?.constructor?.name,
	//	itemsSize: items?.size || items?.length || items?.contents?.length || "unknown"
	//});

	if (!element?.querySelectorAll) {
		console.warn(`${MODULE_ID} | markUnidentifiedItemsInDirectory: html is not a valid element`, html);
		return;
	}

	// Iterate through all directory-item entries
	// V13 uses various selectors for directory items - try multiple patterns
	let directoryItems = element.querySelectorAll("li.directory-item");
	if (!directoryItems.length) {
		directoryItems = element.querySelectorAll("li.entry");
	}
	if (!directoryItems.length) {
		directoryItems = element.querySelectorAll(".directory-item.entry");
	}
	if (!directoryItems.length) {
		directoryItems = element.querySelectorAll("[data-entry-id]");
	}

	//console.log(`${MODULE_ID} | Found ${directoryItems.length} directory items`);

	let unidentifiedCount = 0;
	directoryItems.forEach(li => {
		// Get the entry ID from data attributes (V13 uses data-entry-id)
		const entryId = li.dataset?.entryId || li.dataset?.documentId || li.getAttribute("data-entry-id") || li.getAttribute("data-document-id");
		if (!entryId) {
			//console.log(`${MODULE_ID} | li has no entry ID:`, li.outerHTML?.substring(0, 200));
			return;
		}

		// Find the item in the collection
		let item;
		if (items instanceof Map) {
			item = items.get(entryId);
		} else if (items instanceof foundry.utils.Collection || Array.isArray(items)) {
			item = items.find?.(i => i.id === entryId || i._id === entryId) ?? items.get?.(entryId);
		} else if (items?.contents) {
			item = items.contents.find(i => i.id === entryId || i._id === entryId);
		} else if (typeof items?.get === "function") {
			// Try game.items style collection
			item = items.get(entryId);
		}

		if (!item) {
			//console.log(`${MODULE_ID} | Item not found for ID: ${entryId}`);
			return;
		}

		// Check if this item is unidentified
		const itemIsUnidentified = item?.flags?.[MODULE_ID]?.unidentified === true ||
			(typeof item?.getFlag === "function" && item.getFlag(MODULE_ID, "unidentified") === true);

		if (!itemIsUnidentified) return;

		//console.log(`${MODULE_ID} | Found unidentified item: ${item.name || item._id}`);
		unidentifiedCount++;

		// Add the unidentified class to the list item
		li.classList.add("sdx-sidebar-unidentified");

		// Add indicator icon to the list item if it doesn't already exist
		if (!li.querySelector(".sdx-sidebar-unidentified-icon")) {
			const tooltipText = game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.sidebar_indicator");
			const icon = document.createElement("i");
			icon.className = "fas fa-question-circle sdx-sidebar-unidentified-icon";
			icon.title = tooltipText;
			// Insert the icon at the beginning of the list item
			li.insertBefore(icon, li.firstChild);
		}
	});

	//console.log(`${MODULE_ID} | Marked ${unidentifiedCount} unidentified items`);
}

// Hook into the Items sidebar directory rendering - try multiple hook names for V13 compatibility
Hooks.on("renderItemDirectory", (app, html, data) => {
	try {
		//console.log(`${MODULE_ID} | renderItemDirectory hook fired`, { app, html });
		// Get items from the directory - in v13, app.collection contains the documents
		const items = app.collection || app.documents || game.items;
		markUnidentifiedItemsInDirectory(html, items);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to mark unidentified items in sidebar (renderItemDirectory)`, err);
	}
});

// V13 might use renderDocumentDirectory for sidebar tabs
Hooks.on("renderDocumentDirectory", (app, html, data) => {
	try {
		// Only process if this is an Item directory
		if (app.constructor?.documentName !== "Item" && app.collection?.documentName !== "Item") return;
		//console.log(`${MODULE_ID} | renderDocumentDirectory hook fired for Items`, { app, html });
		const items = app.collection || app.documents || game.items;
		markUnidentifiedItemsInDirectory(html, items);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to mark unidentified items in sidebar (renderDocumentDirectory)`, err);
	}
});

// V13 ApplicationV2 might use a different hook pattern
Hooks.on("renderSidebarTab", (app, html, data) => {
	try {
		// Only process if this is the items tab
		const tabName = app.tabName || app.options?.id || app.id;
		if (tabName !== "items" && app.constructor?.name !== "ItemDirectory") return;
		//console.log(`${MODULE_ID} | renderSidebarTab hook fired for items`, { app, html, tabName });
		const items = app.collection || app.documents || game.items;
		markUnidentifiedItemsInDirectory(html, items);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to mark unidentified items in sidebar (renderSidebarTab)`, err);
	}
});

// Hook into compendium rendering for Item compendiums
Hooks.on("renderCompendium", async (app, html, data) => {
	try {
		//console.log(`${MODULE_ID} | renderCompendium hook fired for`, app.collection?.documentName);
		// Only process Item compendiums
		if (app.collection?.documentName !== "Item") return;

		// Get the items from the compendium index with the unidentified flag field
		const index = await app.collection.getIndex({ fields: [`flags.${MODULE_ID}.unidentified`] });
		if (!index) return;

		markUnidentifiedItemsInDirectory(html, index);
	} catch (err) {
		console.error(`${MODULE_ID} | Failed to mark unidentified items in compendium`, err);
	}
});

// Also re-mark when an item is updated (in case unidentified status changed)
Hooks.on("updateItem", (item, changes, options, userId) => {
	// Only care about unidentified flag changes
	if (!changes?.flags?.[MODULE_ID]?.hasOwnProperty("unidentified")) return;

	// Re-render the Items sidebar if it's open - V13 structure
	try {
		const itemsTab = ui.sidebar?.tabs?.items || ui.items;
		if (itemsTab?.rendered) {
			itemsTab.render();
		}
	} catch (err) {
		console.warn(`${MODULE_ID} | Could not re-render items sidebar`, err);
	}
});


// ============================================
// FLEXIBLE AMMUNITION SELECTION
// ============================================
Hooks.once("init", () => {
	const originalRollAttack = shadowdark.documents.ActorSD.prototype.rollAttack;
	shadowdark.documents.ActorSD.prototype.rollAttack = async function (itemId, options = {}) {
		if (options?._sdxAmmoSelected) return originalRollAttack.call(this, itemId, options);

		const item = this.items.get(itemId);
		if (item && item.type === "Weapon" && item.system.type === "ranged" && item.usesAmmunition) {
			const ammoItem = await AmmunitionSelector.select(this, item);

			if (ammoItem) {
				options._sdxAmmoSelected = true;
				// Temporarily override availableAmmunition to return the selected item
				const originalAvailableAmmunition = item.availableAmmunition;
				item.availableAmmunition = function () {
					return [ammoItem];
				};

				try {
					// Temporarily monkeypatch item.rollItem to inject bonuses
					const originalRollItem = item.rollItem;
					item.rollItem = function (parts, data, options) {
						if (!data._sdxAmmoBonusesApplied) {
							const ammoHitBonus = String(ammoItem.getFlag(MODULE_ID, "ammoHitBonus") || "").trim();
							const ammoDamageBonus = String(ammoItem.getFlag(MODULE_ID, "ammoDamageBonus") || "").trim();

							const damageMultiplier = Math.max(
								parseInt(data.item?.system?.bonuses?.damageMultiplier || 0, 10),
								parseInt(data.actor?.system?.bonuses?.damageMultiplier || 0, 10),
								1
							);

							// Inject hit bonus formula
							if (ammoHitBonus) {
								let h = ammoHitBonus;
								if (h.startsWith("+")) h = h.substring(1).trim();
								if (h) {
									// Normalize d... to 1d... for parseInt check in _digestParts
									if (h.toLowerCase().startsWith("d")) h = "1" + h;

									if (!parts.includes("@ammoHitBonus")) {
										parts.push("@ammoHitBonus");
										data.ammoHitBonus = h;
									}
								}
							}

							// Inject damage bonus formula
							if (ammoDamageBonus) {
								let d = ammoDamageBonus;
								if (d.startsWith("+")) d = d.substring(1).trim();
								if (d) {
									// Normalize d... to 1d...
									if (d.toLowerCase().startsWith("d")) d = "1" + d;

									let bonusValue = d;
									if (!d.toLowerCase().includes("d")) {
										// It's a number, apply multiplier
										bonusValue = parseInt(d, 10) * damageMultiplier;
									} else if (damageMultiplier > 1) {
										// It's a formula, wrap and multiply
										bonusValue = `(${d}) * ${damageMultiplier}`;
									}

									if (!data.damageParts.includes("@ammoDamageBonus")) {
										data.damageParts.push("@ammoDamageBonus");
										data.ammoDamageBonus = bonusValue;
									}
								}
							}
							data._sdxAmmoBonusesApplied = true;
						}
						return originalRollItem.call(this, parts, data, options);
					};

					// Call original rollAttack - it will follow the chain and call our patched rollItem
					return await originalRollAttack.call(this, itemId, options);
				} finally {
					// CLEANUP: Restore original methods after the roll sequence
					item.availableAmmunition = originalAvailableAmmunition;
					if (typeof originalRollItem === 'function') {
						item.rollItem = originalRollItem;
					}
				}
			} else {
				// User cancelled or no ammo available
				return ui.notifications.warn(game.i18n.localize("SHADOWDARK.item.errors.no_available_ammunition"));
			}
		}

		return originalRollAttack.call(this, itemId, options);
	};

	// Also patch ammunitionItems to return all ammunition when key is provided, 
	// but prioritized by key match. This helps the weapon sheet dropdown.
	const originalAmmunitionItems = shadowdark.documents.ActorSD.prototype.ammunitionItems;
	shadowdark.documents.ActorSD.prototype.ammunitionItems = function (key) {
		const allAmmo = this.items.filter(i => i.system.isAmmunition && i.system.quantity > 0);

		if (key) {
			allAmmo.sort((a, b) => {
				const aIsPreferred = a.name.slugify() === key;
				const bIsPreferred = b.name.slugify() === key;
				if (aIsPreferred && !bIsPreferred) return -1;
				if (!aIsPreferred && bIsPreferred) return 1;
				return a.name.localeCompare(b.name);
			});
		}

		return allAmmo;
	};

	// Simplify usesAmmunition to include all ranged weapons
	Object.defineProperty(shadowdark.documents.ItemSD.prototype, "usesAmmunition", {
		get: function () {
			return (game.settings.get("shadowdark", "autoConsumeAmmunition")
				&& this.isOwned
				&& this.actor.type === "Player"
				&& this.type === "Weapon"
				&& this.system.type === "ranged"
			);
		},
		configurable: true
	});



	// Enhance weapon sheet to include actor's inventory ammunition in the dropdown
	const originalGetWeaponSheetData = shadowdark.sheets.ItemSheetSD.prototype.getSheetDataForWeaponItem;
	shadowdark.sheets.ItemSheetSD.prototype.getSheetDataForWeaponItem = async function (context) {
		await originalGetWeaponSheetData.call(this, context);

		const actor = context.item.actor;
		if (actor) {
			const actorAmmo = actor.items.filter(i => i.system.isAmmunition && i.system.quantity > 0);
			for (const ammo of actorAmmo) {
				const slug = ammo.name.slugify();
				if (!context.ammunition[slug]) {
					context.ammunition[slug] = ammo.name;
				}
			}
		}
	};
});

// ============================================
// AMMUNITION BONUS UI INJECTION
// ============================================
function injectAmmunitionBonuses(app, html) {
	const item = app?.item;
	if (item?.type !== "Basic") return;
	if (!item.system.isAmmunition) return;

	// De-dupe on re-render
	html.find(".sdx-ammunition-bonuses").remove();

	const hitBonus = item.getFlag(MODULE_ID, "ammoHitBonus") || "";
	const damageBonus = item.getFlag(MODULE_ID, "ammoDamageBonus") || "";

	const bonusesHtml = `
		<div class="sdx-ammunition-bonuses">
			<div class="SD-box">
				<div class="header light">
					<label>${game.i18n.localize("SHADOWDARK_EXTRAS.ammunition.bonuses.label")}</label>
				</div>
				<div class="content">
					<div class="SD-grid center">
						<div class="sdx-bonus-field">
							<label class="sdx-field-label">${game.i18n.localize("SHADOWDARK_EXTRAS.ammunition.bonuses.hit")}</label>
							<input type="text" name="flags.${MODULE_ID}.ammoHitBonus" value="${hitBonus}" placeholder="+0">
						</div>
						<div class="sdx-bonus-field">
							<label class="sdx-field-label">${game.i18n.localize("SHADOWDARK_EXTRAS.ammunition.bonuses.damage")}</label>
							<input type="text" name="flags.${MODULE_ID}.ammoDamageBonus" value="${damageBonus}" placeholder="+0">
						</div>
					</div>
				</div>
			</div>
		</div>
	`;

	// Inject at the bottom of the Details tab
	const detailsTab = html.find('.tab[data-tab="tab-details"]');
	if (detailsTab.length) {
		detailsTab.append(bonusesHtml);
	}
}

// ============================================
// ABILITY ADVANTAGE PREDEFINED EFFECTS
// ============================================
// Extend the Shadowdark system's predefined effects to include
// ability check advantages (e.g., advantage on STR checks)

Hooks.once("init", () => {
	// Only extend if CONFIG.SHADOWDARK exists (system is loaded)
	if (!CONFIG.SHADOWDARK?.PREDEFINED_EFFECTS) {
		console.warn(`${MODULE_ID} | CONFIG.SHADOWDARK.PREDEFINED_EFFECTS not found, skipping ability advantage effects`);
		return;
	}

	//console.log(`${MODULE_ID} | Adding ability advantage predefined effects`);

	// Define ability advantage effects for each ability score
	const abilityAdvantageEffects = {
		abilityAdvantageStr: {
			defaultValue: "str",
			effectKey: "system.bonuses.advantage",
			img: "icons/skills/melee/hand-grip-staff-yellow-brown.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageStr",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityAdvantageDex: {
			defaultValue: "dex",
			effectKey: "system.bonuses.advantage",
			img: "icons/skills/movement/feet-winged-boots-glowing-yellow.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageDex",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityAdvantageCon: {
			defaultValue: "con",
			effectKey: "system.bonuses.advantage",
			img: "icons/magic/life/heart-area-circle-red-green.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageCon",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityAdvantageInt: {
			defaultValue: "int",
			effectKey: "system.bonuses.advantage",
			img: "icons/commodities/gems/gem-faceted-navette-blue.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageInt",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityAdvantageWis: {
			defaultValue: "wis",
			effectKey: "system.bonuses.advantage",
			img: "icons/magic/perception/eye-ringed-glow-angry-large-teal.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageWis",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityAdvantageCha: {
			defaultValue: "cha",
			effectKey: "system.bonuses.advantage",
			img: "icons/magic/light/orbs-hand-sparkle-yellow.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityAdvantageCha",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageStr: {
			defaultValue: "str",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/skills/wounds/bone-broken-hand.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageStr",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageDex: {
			defaultValue: "dex",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/skills/movement/feet-winged-boots-glowing-yellow.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageDex",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageCon: {
			defaultValue: "con",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/magic/life/heart-black-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageCon",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageInt: {
			defaultValue: "int",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/commodities/gems/gem-broken-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageInt",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageWis: {
			defaultValue: "wis",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/magic/perception/eye-ringed-glow-angry-small-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageWis",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		abilityDisadvantageCha: {
			defaultValue: "cha",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/magic/light/hand-sparks-smoke-teal.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.abilityDisadvantageCha",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		meleeAdvantage: {
			defaultValue: "melee",
			effectKey: "system.bonuses.advantage",
			img: "icons/skills/melee/weapons-crossed-swords-yellow.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.meleeAdvantage",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		rangedAdvantage: {
			defaultValue: "ranged",
			effectKey: "system.bonuses.advantage",
			img: "icons/skills/ranged/bow-arrow-shooting-gray.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.rangedAdvantage",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		meleeDamageDice: {
			defaultValue: "d=1d4",
			effectKey: `flags.${MODULE_ID}.meleeDamageDice`,
			img: "icons/skills/melee/blade-tip-chipped-blood-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.meleeDamageDice",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		rangedDamageDice: {
			defaultValue: "d=1d4",
			effectKey: `flags.${MODULE_ID}.rangedDamageDice`,
			img: "icons/skills/ranged/arrow-flying-spiral-blue.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.rangedDamageDice",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		freyasOmen: {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.freyasOmen`,
			img: "icons/magic/light/hand-sparks-smoke-teal.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.freyasOmen",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		macroExecute: {
			defaultValue: "",
			effectKey: `flags.${MODULE_ID}.macroExecute`,
			img: "icons/sundries/scrolls/scroll-worn-tan-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.macroExecute",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		silenced: {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.silenced`,
			img: "icons/magic/death/skull-horned-goat-pentagram-red.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.silenced",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		glassbones: {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.glassbones`,
			img: "icons/skills/wounds/bone-broken-knee-beam.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.glassbones",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		invisibility: {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.invisibility`,
			img: "icons/magic/perception/shadow-stealth-eyes-purple.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.invisibility",
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE",
		},
		spellAdvantageAll: {
			defaultValue: "spellcasting",
			effectKey: "system.bonuses.advantage",
			img: "icons/magic/symbols/chevron-elipse-circle-blue.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.spellAdvantageAll",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		spellDisadvantageAll: {
			defaultValue: "spellcasting",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/magic/unholy/hand-light-pink.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.spellDisadvantageAll",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
		spellDisadvantage: {
			defaultValue: "REPLACEME",
			effectKey: "system.bonuses.disadvantage",
			img: "icons/magic/unholy/hand-light-pink.webp",
			name: "SHADOWDARK.item.effect.predefined_effect.spellDisadvantage",
			mode: "CONST.ACTIVE_EFFECT_MODES.ADD",
		},
	};

	// Define all custom damage types with proper icons for resistance, immunity, and vulnerability
	const sdxDamageTypes = [
		{
			id: "bludgeoning",
			name: "Bludgeoning",
			resistanceImg: "icons/skills/melee/shield-block-bash-blue.webp",
			immunityImg: "icons/skills/melee/shield-block-gray-yellow.webp",
			vulnerabilityImg: "icons/skills/melee/strike-hammer-destructive-orange.webp",
			absorptionImg: "icons/magic/life/heart-cross-blue.webp"
		},
		{
			id: "slashing",
			name: "Slashing",
			resistanceImg: "icons/skills/melee/shield-damaged-broken-blue.webp",
			immunityImg: "icons/skills/melee/shield-damaged-broken-gold.webp",
			vulnerabilityImg: "icons/skills/melee/strike-blade-blood-red.webp",
			absorptionImg: "icons/magic/life/heart-cross-green.webp"
		},
		{
			id: "piercing",
			name: "Piercing",
			resistanceImg: "icons/skills/melee/shield-block-bash-yellow.webp",
			immunityImg: "icons/skills/melee/shield-block-gray-orange.webp",
			vulnerabilityImg: "icons/skills/melee/strike-spear-red.webp",
			absorptionImg: "icons/magic/life/heart-cross-red.webp"
		},
		{
			id: "physical",
			name: "Physical",
			resistanceImg: "icons/skills/melee/shield-damaged-broken-brown.webp",
			immunityImg: "icons/skills/melee/shield-damaged-broken-orange.webp",
			vulnerabilityImg: "icons/skills/wounds/blood-drip-droplet-red.webp",
			absorptionImg: "icons/magic/life/heart-cross-purple-orange.webp"
		},
		{
			id: "fire",
			name: "Fire",
			resistanceImg: "icons/magic/fire/barrier-wall-flame-ring-yellow.webp",
			immunityImg: "icons/magic/fire/orb-vortex.webp",
			vulnerabilityImg: "icons/magic/fire/explosion-fireball-medium-orange.webp",
			absorptionImg: "icons/magic/fire/flame-burning-hand-orange.webp"
		},
		{
			id: "cold",
			name: "Cold",
			resistanceImg: "icons/magic/water/barrier-ice-crystal-wall-jagged-blue.webp",
			immunityImg: "icons/magic/water/snowflake-ice-blue-white.webp",
			vulnerabilityImg: "icons/magic/water/ice-crystal-white.webp",
			absorptionImg: "icons/magic/water/heart-ice-cold.webp"
		},
		{
			id: "lightning",
			name: "Lightning",
			resistanceImg: "icons/magic/lightning/bolt-forked-blue.webp",
			immunityImg: "icons/magic/lightning/orb-ball-blue.webp",
			vulnerabilityImg: "icons/magic/lightning/bolt-strike-blue.webp",
			absorptionImg: "icons/magic/lightning/bolt-blue.webp"
		},
		{
			id: "acid",
			name: "Acid",
			resistanceImg: "icons/magic/acid/projectile-faceted-glob.webp",
			immunityImg: "icons/magic/acid/orb-bubble-smoke-drip.webp",
			vulnerabilityImg: "icons/magic/acid/dissolve-arm-flesh.webp",
			absorptionImg: "icons/magic/acid/orb-bubble-green.webp"
		},
		{
			id: "poison",
			name: "Poison",
			resistanceImg: "icons/skills/toxins/poison-bottle-corked-fire-green.webp",
			immunityImg: "icons/consumables/potions/flask-ornate-skull-green.webp",
			vulnerabilityImg: "icons/skills/toxins/symbol-poison-drop-skull-green.webp",
			absorptionImg: "icons/consumables/potions/potion-tube-corked-teal.webp"
		},
		{
			id: "necrotic",
			name: "Necrotic",
			resistanceImg: "icons/magic/death/skull-humanoid-crown-white-blue.webp",
			immunityImg: "icons/magic/death/skull-energy-light-purple.webp",
			vulnerabilityImg: "icons/magic/death/hand-withered-gray.webp",
			absorptionImg: "icons/magic/death/undead-skeleton-rags-green.webp"
		},
		{
			id: "radiant",
			name: "Radiant",
			resistanceImg: "icons/magic/holy/angel-wings-gray.webp",
			immunityImg: "icons/magic/holy/barrier-shield-winged-cross.webp",
			vulnerabilityImg: "icons/magic/light/explosion-star-glow-yellow.webp",
			absorptionImg: "icons/magic/holy/angel-winged-humanoid-yellow.webp"
		},
		{
			id: "psychic",
			name: "Psychic",
			resistanceImg: "icons/magic/control/silhouette-hold-beam-blue.webp",
			immunityImg: "icons/magic/control/fear-fright-monster-grin-red-orange.webp",
			vulnerabilityImg: "icons/commodities/biological/organ-brain-pink-purple.webp",
			absorptionImg: "icons/magic/control/telepathy-psychic-mind.webp"
		},
		{
			id: "force",
			name: "Force",
			resistanceImg: "icons/magic/sonic/explosion-shock-wave-teal.webp",
			immunityImg: "icons/magic/defensive/barrier-shield-dome-blue-purple.webp",
			vulnerabilityImg: "icons/magic/sonic/explosion-impact-shock-wave.webp",
			absorptionImg: "icons/magic/sonic/barrier-shock-wave-blue.webp"
		}
	];


	// Register Resistance, Immunity, and Vulnerability effects for each type
	for (const type of sdxDamageTypes) {
		const capId = type.id.charAt(0).toUpperCase() + type.id.slice(1);

		// Resistance
		abilityAdvantageEffects[`resistance${capId}`] = {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.resistance.${type.id}`,
			img: type.resistanceImg || "icons/equipment/shield/buckler-wooden-boss-brass.webp",
			name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.resistance${capId}`,
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
		};

		// Immunity
		abilityAdvantageEffects[`immunity${capId}`] = {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.immunity.${type.id}`,
			img: type.immunityImg || "icons/magic/defensive/shield-barrier-blue.webp",
			name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.immunity${capId}`,
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
		};

		// Vulnerability (double damage)
		abilityAdvantageEffects[`vulnerability${capId}`] = {
			defaultValue: true,
			effectKey: `flags.${MODULE_ID}.vulnerability.${type.id}`,
			img: type.vulnerabilityImg || "icons/skills/wounds/injury-pain-body-orange.webp",
			name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.vulnerability${capId}`,
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
		};

		// Absorption (value -1 = heal from damage, value 1 = double damage)
		abilityAdvantageEffects[`absorption${capId}`] = {
			defaultValue: -1,
			effectKey: `flags.${MODULE_ID}.absorption.${type.id}`,
			img: type.absorptionImg || "icons/magic/life/heart-cross-purple-orange.webp",
			name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.absorption${capId}`,
			mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
		};
	}

	// Resistance and Immunity to Non-Magical Weapon attacks
	abilityAdvantageEffects.resistanceNonMagic = {
		defaultValue: true,
		effectKey: `flags.${MODULE_ID}.resistance.nonmagic`,
		img: "icons/magic/defensive/shield-barrier-glowing-triangle-blue.webp",
		name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.resistanceNonMagic`,
		mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
	};

	abilityAdvantageEffects.immunityNonMagic = {
		defaultValue: true,
		effectKey: `flags.${MODULE_ID}.immunity.nonmagic`,
		img: "icons/magic/defensive/shield-barrier-glowing-triangle-orange.webp",
		name: `SHADOWDARK_EXTRAS.item.effect.predefined_effect.immunityNonMagic`,
		mode: "CONST.ACTIVE_EFFECT_MODES.OVERRIDE"
	};

	// Merge ability advantage effects into the system's predefined effects
	Object.assign(CONFIG.SHADOWDARK.PREDEFINED_EFFECTS, abilityAdvantageEffects);

	//console.log(`${MODULE_ID} | Added ${Object.keys(abilityAdvantageEffects).length} extra advantage, resistance/immunity/vulnerability effects`);

	// ============================================
	// SPELL DISADVANTAGE HANDLER PATCH
	// ============================================
	// Add disadvantage to EFFECT_ASK_INPUT so the system knows to prompt for selection
	if (!CONFIG.SHADOWDARK.EFFECT_ASK_INPUT.includes("system.bonuses.disadvantage")) {
		CONFIG.SHADOWDARK.EFFECT_ASK_INPUT.push("system.bonuses.disadvantage");
	}

	// Patch handlePredefinedEffect to support spellDisadvantage (like spellAdvantage)
	const originalHandlePredefinedEffect = shadowdark.effects.handlePredefinedEffect;
	shadowdark.effects.handlePredefinedEffect = async function (key, value, name = null) {
		// Handle spellDisadvantage the same way as spellAdvantage
		if (key === "spellDisadvantage") {
			const type = "spell";
			const options = await shadowdark.utils.getSlugifiedItemList(
				await shadowdark.compendiums.spells()
			);
			const chosen = await this.askEffectInput({ name, type, options });
			return chosen[type] ?? [value];
		}
		// Fall back to original for all other keys
		return originalHandlePredefinedEffect.call(this, key, value, name);
	};

	// Patch modifyEffectChangesWithInput to map disadvantage -> spellDisadvantage
	// This ensures that Talents with system.bonuses.disadvantage = REPLACEME
	// trigger the spell selection choice.
	const originalModifyEffectChangesWithInput = shadowdark.effects.modifyEffectChangesWithInput;
	shadowdark.effects.modifyEffectChangesWithInput = async function (item, effect, key = false) {
		if (!key && effect.changes?.some(c => c.key === "system.bonuses.disadvantage" && c.value === "REPLACEME")) {
			key = "spellDisadvantage";
		}
		return originalModifyEffectChangesWithInput.call(this, item, effect, key);
	};

	//console.log(`${MODULE_ID} | Patched effects system for spellDisadvantage support`);
});

// ============================================
// SILENCED EFFECT - PREVENT SPELL CASTING
// ============================================

// Monkey-patch ActorSD.castSpell to prevent spell casting when silenced
Hooks.once("ready", () => {
	// Get the ActorSD and RollSD class references
	const ActorSD = globalThis.shadowdark?.documents?.ActorSD;
	const RollSD = CONFIG.DiceSD;

	if (!ActorSD) {
		console.error(`${MODULE_ID} | ActorSD not found, cannot apply system patches`);
		return;
	}

	//console.log(`${MODULE_ID} | Applying consolidated ActorSD and RollSD patches`);

	// ============================================
	// SILENCED EFFECT - PREVENT SPELL CASTING
	// ============================================
	if (ActorSD.prototype.castSpell) {
		const _originalCastSpell = ActorSD.prototype.castSpell;
		ActorSD.prototype.castSpell = async function (itemId, options = {}) {
			const isSilenced = this.getFlag(MODULE_ID, "silenced");
			if (isSilenced) {
				const item = this.items.get(itemId);
				if (item) {
					const effectsSettings = game.settings.get(MODULE_ID, "effectsSettings");
					let shouldBlock = false;
					let blockedType = "";

					if (item.type === "Spell" || item.type === "NPC Spell") {
						shouldBlock = effectsSettings.silenced.blocksSpells;
						blockedType = "spells";
					} else if (item.type === "Scroll") {
						shouldBlock = effectsSettings.silenced.blocksScrolls;
						blockedType = "scrolls";
					} else if (item.type === "Wand") {
						shouldBlock = effectsSettings.silenced.blocksWands;
						blockedType = "wands";
					}

					if (shouldBlock) {
						ui.notifications.warn(`You are silenced and cannot cast ${blockedType}!`);
						return null;
					}
				}
			}
			return _originalCastSpell.call(this, itemId, options);
		};
	}

	// ============================================
	// EXTRA DAMAGE DICE SUPPORT
	// ============================================
	if (ActorSD.prototype.getExtraDamageDiceForWeapon) {
		const _originalGetExtraDamageDiceForWeapon = ActorSD.prototype.getExtraDamageDiceForWeapon;
		ActorSD.prototype.getExtraDamageDiceForWeapon = async function (item, data) {
			await _originalGetExtraDamageDiceForWeapon.call(this, item, data);

			if (this.type === "Player") {
				if (item.system.type === "melee") {
					let bonus = this.getFlag(MODULE_ID, "meleeDamageDice");
					if (bonus) {
						if (typeof bonus === "string" && bonus.startsWith("d=")) bonus = bonus.substring(2);
						data.sdxMeleeDamageDice = bonus;
						if (data.damageParts) data.damageParts.push("@sdxMeleeDamageDice");
					}
				} else if (item.system.type === "ranged") {
					let bonus = this.getFlag(MODULE_ID, "rangedDamageDice");
					if (bonus) {
						if (typeof bonus === "string" && bonus.startsWith("d=")) bonus = bonus.substring(2);
						data.sdxRangedDamageDice = bonus;
						if (data.damageParts) data.damageParts.push("@sdxRangedDamageDice");
					}
				}
			}
		};
	}

	// ============================================
	// EDGE-TO-EDGE DISTANCE HELPER
	// ============================================
	/**
	 * Calculate the edge-to-edge distance between two tokens.
	 * Unlike center-to-center, this properly handles different token sizes.
	 * @param {Token} token1 - First token
	 * @param {Token} token2 - Second token
	 * @returns {number} Distance in grid units (feet)
	 */
	function getEdgeToEdgeDistance(token1, token2) {
		const gridSize = canvas.grid.size;

		// Get token bounds in pixels
		const t1 = {
			left: token1.x,
			right: token1.x + (token1.document.width * gridSize),
			top: token1.y,
			bottom: token1.y + (token1.document.height * gridSize)
		};
		const t2 = {
			left: token2.x,
			right: token2.x + (token2.document.width * gridSize),
			top: token2.y,
			bottom: token2.y + (token2.document.height * gridSize)
		};

		// Find the closest edge points between the two bounding boxes
		// For X: clamp t2's center to t1's horizontal range, and vice versa
		const t1CenterX = (t1.left + t1.right) / 2;
		const t1CenterY = (t1.top + t1.bottom) / 2;
		const t2CenterX = (t2.left + t2.right) / 2;
		const t2CenterY = (t2.top + t2.bottom) / 2;

		// Find the nearest point on t1's edge to t2
		const p1x = Math.max(t1.left, Math.min(t2CenterX, t1.right));
		const p1y = Math.max(t1.top, Math.min(t2CenterY, t1.bottom));

		// Find the nearest point on t2's edge to t1
		const p2x = Math.max(t2.left, Math.min(t1CenterX, t2.right));
		const p2y = Math.max(t2.top, Math.min(t1CenterY, t2.bottom));

		// Check if tokens are overlapping/adjacent (distance would be 0)
		const overlapsX = !(t2.left > t1.right || t1.left > t2.right);
		const overlapsY = !(t2.top > t1.bottom || t1.top > t2.bottom);

		if (overlapsX && overlapsY) {
			// Tokens are overlapping or adjacent
			//console.log(`${MODULE_ID} | Edge distance calc: tokens overlap/adjacent, distance = 0`);
			return 0;
		}

		// Use Foundry's measurePath for proper grid-based distance (respects 5-10-5 rule)
		const path = canvas.grid.measurePath([{ x: p1x, y: p1y }, { x: p2x, y: p2y }]);
		const result = path.distance;

		//console.log(`${MODULE_ID} | Edge distance calc:`, {
		//	token1: token1.name,
		//	token2: token2.name,
		//	p1: { x: p1x, y: p1y },
		//	p2: { x: p2x, y: p2y },
		//	measurePathDistance: result
		//});

		return result;
	}

	// ============================================
	// REQUIRE TARGET FOR ATTACK + RANGE CHECK
	// ============================================
	if (ActorSD.prototype.rollAttack) {
		const _originalRollAttack = ActorSD.prototype.rollAttack;
		ActorSD.prototype.rollAttack = async function (itemId, options = {}) {
			// Prevent double-checking when Shadowdark recurses for multiple targets
			if (options._sdxChecked) return _originalRollAttack.call(this, itemId, options);
			options._sdxChecked = true;

			const item = this.items.get(itemId);
			const itemName = item?.name || "weapon";

			try {
				const combatSettings = game.settings.get(MODULE_ID, "combatSettings");
				const requireTarget = combatSettings?.requireTargetForAttack || "none";
				const checkRange = combatSettings?.checkWeaponRange || "none";

				// Check if user has targets
				const hasTargets = game.user.targets && game.user.targets.size > 0;

				// Feature 2: Check if target is required
				if (requireTarget !== "none" && !hasTargets) {
					if (requireTarget === "block") {
						ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.combat.require_target.blocked", {
							itemName: itemName
						}) || `You must target a token before attacking with ${itemName}!`);
						return null;
					} else if (requireTarget === "warn") {
						ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.combat.require_target.warning", {
							itemName: itemName
						}) || `No target selected for ${itemName} attack.`);
					}
				}

				// Feature 3: Check weapon range vs target distance
				if (checkRange !== "none" && hasTargets && item) {
					// Get the attacker's token
					const attackerToken = this.getActiveTokens()[0] || canvas.tokens?.placeables?.find(t => t.actor?.id === this.id);

					if (attackerToken) {
						const targets = Array.from(game.user.targets);

						// Determine weapon range type
						const weaponType = item.system?.type || "melee"; // melee or ranged
						const isThrown = await item.isThrownWeapon?.() || false;

						// Edge-to-edge distance (in feet based on Shadowdark distances)
						// Close = adjacent (0 ft edge-to-edge), Near = ~25 ft edge, Far = beyond
						let maxRange;
						let rangeLabel;
						if (weaponType === "melee" && !isThrown) {
							maxRange = 0; // Close range = must be adjacent (edge-to-edge 0)
							rangeLabel = "Close (Adjacent)";
						} else if (isThrown) {
							maxRange = 25; // Near range for thrown (5 squares edge-to-edge)
							rangeLabel = "Near (30 ft)";
						} else {
							maxRange = Infinity; // Ranged weapons have no limit
							rangeLabel = "Far";
						}

						// Check distance to each target  
						for (const targetToken of targets) {
							// Calculate edge-to-edge distance (properly handles different token sizes)
							const distance = getEdgeToEdgeDistance(attackerToken, targetToken);
							// Convert to traditional D&D distance for display (add 5 ft for target's space)
							const displayDistance = distance + 5;

							//console.log(`${MODULE_ID} | Range check: ${itemName} (${rangeLabel}) vs target at ${distance.toFixed(1)} ft edge-to-edge (${displayDistance.toFixed(0)} ft display)`);

							if (distance > maxRange) {
								if (checkRange === "block") {
									ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.combat.range_check.blocked", {
										itemName: itemName,
										range: rangeLabel,
										distance: displayDistance.toFixed(0)
									}) || `${itemName} cannot reach target at ${displayDistance.toFixed(0)} ft! Max range: ${rangeLabel}`);
									return null;
								} else if (checkRange === "warn") {
									ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.combat.range_check.warning", {
										itemName: itemName,
										range: rangeLabel,
										distance: displayDistance.toFixed(0)
									}) || `Target is at ${displayDistance.toFixed(0)} ft, beyond ${itemName}'s ${rangeLabel} range.`);
								}
							}
						}
					}
				}
			} catch (err) {
				//console.log(`${MODULE_ID} | Range check error:`, err);
				// Settings not available yet, continue normally
			}

			return _originalRollAttack.call(this, itemId, options);
		};
	}

	// ============================================
	// ABILITY ADVANTAGE SUPPORT
	// ============================================

	// 1. Patch rollAbility to include abilityId in the data object
	if (ActorSD.prototype.rollAbility) {
		ActorSD.prototype.rollAbility = async function (abilityId, options = {}) {
			const parts = ["1d20", "@abilityBonus"];
			const abilityBonus = this.abilityModifier(abilityId);
			const ability = CONFIG.SHADOWDARK.ABILITIES_LONG[abilityId];

			const data = {
				rollType: "ability",
				abilityId: abilityId, // ← Inject abilityId
				abilityBonus,
				ability,
				actor: this,
			};

			options.title = game.i18n.localize(`SHADOWDARK.dialog.ability_check.${abilityId}`);
			options.flavor = options.title;
			options.speaker = ChatMessage.getSpeaker({ actor: this });
			options.dialogTemplate = "systems/shadowdark/templates/dialog/roll-ability-check-dialog.hbs";
			options.chatCardTemplate = "systems/shadowdark/templates/chat/ability-card.hbs";

			return await CONFIG.DiceSD.RollDialog(parts, data, options);
		};
	}

	// 2. Patch hasAdvantage to check for custom advantages
	const _originalHasAdvantage = ActorSD.prototype.hasAdvantage;
	ActorSD.prototype.hasAdvantage = function (data) {
		if (this.type === "Player") {
			const bonuses = this.system.bonuses || {};
			const adv = bonuses.advantage || [];

			// Spellcasting advantage
			if (data.item?.isSpell?.() && adv.includes("spellcasting")) {
				return true;
			}

			// Ability-specific advantage
			if (data.rollType === "ability" && data.abilityId) {
				if (adv.includes(data.abilityId)) return true;
			}

			// Attack type (melee/ranged/slugified weapon) advantage
			if (data.rollType && adv.includes(data.rollType)) {
				return true;
			}

			// Additional attack type check for flexibility
			if (data.attackType && adv.includes(data.attackType)) {
				return true;
			}
		}

		return _originalHasAdvantage.call(this, data);
	};

	// 3. Implement hasDisadvantage
	ActorSD.prototype.hasDisadvantage = function (data) {
		if (this.type === "Player") {
			const bonuses = this.system.bonuses || {};
			const dis = bonuses.disadvantage || [];

			// Spellcasting disadvantage
			if (data.item?.isSpell?.() && dis.includes("spellcasting")) {
				return true;
			}

			// Ability-specific disadvantage
			if (data.rollType === "ability" && data.abilityId) {
				if (dis.includes(data.abilityId)) return true;
			}

			// Attack type disadvantage
			if (data.rollType && dis.includes(data.rollType)) {
				return true;
			}

			if (data.attackType && dis.includes(data.attackType)) {
				return true;
			}

			// Standard rollType check (for cases not handled above)
			if (dis.includes(data.rollType)) {
				return true;
			}
		}

		return false;
	};

	// 4. Override RollDialog to add disadvantage highlights and promptable bonuses
	if (CONFIG.DiceSD?.RollDialog) {
		//console.log(`${MODULE_ID} | Overriding CONFIG.DiceSD.RollDialog for highlights and promptable bonuses`);
		CONFIG.DiceSD.RollDialog = async function (parts, data, options = {}) {
			if (options.skipPrompt) {
				return await this.Roll(parts, data, false, options.adv ?? 0, options);
			}

			if (!options.title) {
				options.title = game.i18n.localize("SHADOWDARK.dialog.roll");
			}

			// Render the HTML for the dialog
			let content = await this._getRollDialogContent(parts, data, options);

			// Check for promptable bonuses if this is a weapon attack
			let promptableHitBonuses = [];
			let promptableDamageBonuses = [];

			// The weapon item could be in data.item or we need to find it from options
			const weaponItem = data.item || options.item;
			const actor = data.actor;

			//console.log(`${MODULE_ID} | RollDialog - checking for prompt bonuses:`, {
			//	hasWeaponItem: !!weaponItem,
			//	weaponType: weaponItem?.type,
			//	hasActor: !!actor,
			//	dataKeys: Object.keys(data),
			//	optionsKeys: Object.keys(options)
			//});

			if (weaponItem?.type === "Weapon" && actor) {
				const targetToken = game.user.targets.first();
				const targetActor = targetToken?.actor || null;

				promptableHitBonuses = getPromptableHitBonuses(weaponItem, actor, targetActor);
				promptableDamageBonuses = getPromptableDamageBonuses(weaponItem, actor, targetActor);

				//console.log(`${MODULE_ID} | Promptable bonuses found:`, {
				//	hitBonuses: promptableHitBonuses,
				//		damageBonuses: promptableDamageBonuses
				//	});

				// Note: Checkbox injection moved to render callback to bypass HTML sanitization
			}


			// Store promptable bonuses in data for later access
			data._sdxPromptableHitBonuses = promptableHitBonuses;
			data._sdxPromptableDamageBonuses = promptableDamageBonuses;

			const dialogData = {
				title: options.title,
				content,
				classes: ["shadowdark-dialog"],
				buttons: {
					advantage: {
						label: game.i18n.localize("SHADOWDARK.roll.advantage"),
						callback: async html => {
							// Process selected promptable bonuses
							await this._processPromptableBonuses(html, data, parts);
							return this.Roll(parts, data, html, 1, options);
						},
					},
					normal: {
						label: game.i18n.localize("SHADOWDARK.roll.normal"),
						callback: async html => {
							// Process selected promptable bonuses
							await this._processPromptableBonuses(html, data, parts);
							return this.Roll(parts, data, html, 0, options);
						},
					},
					disadvantage: {
						label: game.i18n.localize("SHADOWDARK.roll.disadvantage"),
						callback: async html => {
							// Process selected promptable bonuses
							await this._processPromptableBonuses(html, data, parts);
							return this.Roll(parts, data, html, -1, options);
						},
					},
				},
				close: () => null,
				default: "normal",
				render: html => {
					// Check if the actor has advantage, and add highlight if that
					// is the case (Standard System Logic)
					if (data.actor?.hasAdvantage(data)) {
						html.find("button.advantage")
							.attr("title", game.i18n.localize(
								"SHADOWDARK.dialog.tooltip.talent_advantage"
							))
							.addClass("talent-highlight");
					}

					// Custom Disadvantage Highlight Logic (Shadowdark Extras)
					if (data.actor?.hasDisadvantage?.(data)) {
						html.find("button.disadvantage")
							.attr("title", game.i18n.localize(
								"SHADOWDARK.dialog.tooltip.talent_advantage"
							))
							.addClass("talent-highlight");
					}

					// Inject promptable bonus checkboxes directly into DOM (bypasses sanitization)
					if (promptableHitBonuses.length > 0 || promptableDamageBonuses.length > 0) {
						const dialogContent = html.find('.shadowdark-dialog')[0];
						if (dialogContent) {
							// Create container for prompt bonuses using native DOM
							const promptContainer = document.createElement('div');
							promptContainer.className = 'sdx-prompt-bonuses';
							const hr = document.createElement('hr');
							promptContainer.appendChild(hr);

							// Add hit bonus checkboxes (using custom div toggles)
							if (promptableHitBonuses.length > 0) {
								const hitSection = document.createElement('div');
								hitSection.className = 'sdx-prompt-section';
								hitSection.innerHTML = '<label class="sdx-prompt-section-label"><i class="fas fa-bullseye"></i> Optional To Hit Bonuses</label>';

								promptableHitBonuses.forEach((bonus, i) => {
									const displayLabel = bonus.label ? `${bonus.formula} (${bonus.label})` : bonus.formula;
									const row = document.createElement('div');
									row.className = 'sdx-prompt-bonus-row sdx-bonus-checked';
									row.setAttribute('data-bonus-type', 'hit');
									row.setAttribute('data-bonus-index', i);
									row.setAttribute('data-formula', bonus.formula);
									row.setAttribute('data-original-index', bonus.index);

									// Create custom checkbox icon
									const checkIcon = document.createElement('i');
									checkIcon.className = 'fas fa-check-square sdx-toggle-icon';

									const span = document.createElement('span');
									span.className = 'sdx-prompt-bonus-label';
									span.textContent = `+${displayLabel}`;

									row.appendChild(checkIcon);
									row.appendChild(span);

									// Add click handler to toggle
									row.addEventListener('click', function () {
										this.classList.toggle('sdx-bonus-checked');
										const icon = this.querySelector('.sdx-toggle-icon');
										if (this.classList.contains('sdx-bonus-checked')) {
											icon.className = 'fas fa-check-square sdx-toggle-icon';
										} else {
											icon.className = 'far fa-square sdx-toggle-icon';
										}
									});

									hitSection.appendChild(row);
								});
								promptContainer.appendChild(hitSection);
							}

							// Add damage bonus checkboxes (using custom div toggles)
							if (promptableDamageBonuses.length > 0) {
								const damageSection = document.createElement('div');
								damageSection.className = 'sdx-prompt-section';
								damageSection.innerHTML = '<label class="sdx-prompt-section-label"><i class="fas fa-burst"></i> Optional Damage Bonuses</label>';

								promptableDamageBonuses.forEach((bonus, i) => {
									let displayLabel = bonus.label ? `${bonus.formula} (${bonus.label})` : bonus.formula;
									if (bonus.damageType) {
										displayLabel += ` [${bonus.damageType}]`;
									}
									const row = document.createElement('div');
									row.className = 'sdx-prompt-bonus-row sdx-bonus-checked';
									row.setAttribute('data-bonus-type', 'damage');
									row.setAttribute('data-bonus-index', i);
									row.setAttribute('data-formula', bonus.formula);
									row.setAttribute('data-original-index', bonus.index);
									row.setAttribute('data-damage-type', bonus.damageType || '');

									// Create custom checkbox icon
									const checkIcon = document.createElement('i');
									checkIcon.className = 'fas fa-check-square sdx-toggle-icon';

									const span = document.createElement('span');
									span.className = 'sdx-prompt-bonus-label';
									span.textContent = `+${displayLabel}`;

									row.appendChild(checkIcon);
									row.appendChild(span);

									// Add click handler to toggle
									row.addEventListener('click', function () {
										this.classList.toggle('sdx-bonus-checked');
										const icon = this.querySelector('.sdx-toggle-icon');
										if (this.classList.contains('sdx-bonus-checked')) {
											icon.className = 'fas fa-check-square sdx-toggle-icon';
										} else {
											icon.className = 'far fa-square sdx-toggle-icon';
										}
									});

									damageSection.appendChild(row);
								});
								promptContainer.appendChild(damageSection);
							}

							// Insert before the last hr (before the buttons)
							const lastHr = dialogContent.querySelectorAll('hr');
							if (lastHr.length > 0) {
								lastHr[lastHr.length - 1].before(promptContainer);
							} else {
								dialogContent.appendChild(promptContainer);
							}

							//console.log(`${MODULE_ID} | Injected prompt bonuses via custom toggles`);
						}
					}
				},

			};

			return Dialog.wait(dialogData, options.dialogOptions);
		};

		// Add helper function to process promptable bonuses from dialog
		CONFIG.DiceSD._processPromptableBonuses = async function (html, data, parts) {

			if (!data._sdxPromptableHitBonuses?.length && !data._sdxPromptableDamageBonuses?.length) {
				return;
			}

			// Process selected hit bonuses (from custom div toggles)
			if (data._sdxPromptableHitBonuses?.length) {
				const selectedHitBonuses = [];
				html.find('.sdx-prompt-bonus-row.sdx-bonus-checked[data-bonus-type="hit"]').each(function () {
					const formula = $(this).attr('data-formula');
					if (formula) {
						selectedHitBonuses.push(String(formula));
					}
				});

				if (selectedHitBonuses.length > 0) {
					// Add to the roll - evaluate dice and add to data
					const combinedFormula = selectedHitBonuses.join(' + ');
					try {
						const roll = new Roll(combinedFormula);
						await roll.evaluate();

						// Show Dice So Nice animation with gold appearance if available
						if (game.dice3d) {
							// Set gold appearance for prompt hit bonus dice
							roll.options.appearance = {
								colorset: "custom",
								foreground: "#000000",
								background: "#FFD700",
								outline: "#B8860B",
								edge: "#B8860B",
								material: "metal"
							};
							await game.dice3d.showForRoll(roll, game.user, true);
						}

						data.sdxPromptHitBonus = roll.total;
						if (!parts.includes("@sdxPromptHitBonus")) {
							parts.push("@sdxPromptHitBonus");
						}
						//console.log(`${MODULE_ID} | Applied prompted hit bonuses: ${combinedFormula} = ${roll.total}`);
					} catch (err) {
						console.warn(`${MODULE_ID} | Failed to evaluate prompted hit bonus: ${combinedFormula}`, err);
					}
				}

			}


			// Store selected damage bonuses for later application (from custom div toggles)
			if (data._sdxPromptableDamageBonuses?.length) {
				const selectedDamageBonuses = [];
				html.find('.sdx-prompt-bonus-row.sdx-bonus-checked[data-bonus-type="damage"]').each(function () {
					const formula = String($(this).attr('data-formula'));
					const damageType = $(this).attr('data-damage-type') || "";
					const index = parseInt($(this).attr('data-original-index'));
					if (formula) {
						selectedDamageBonuses.push({ formula, damageType, index });
					}
				});

				// Store in global map keyed by weapon ID for access by calculateWeaponBonusDamage
				const weaponItem = data.item;
				if (weaponItem?.id) {
					if (!window._sdxSelectedPromptDamageBonuses) {
						window._sdxSelectedPromptDamageBonuses = new Map();
					}
					window._sdxSelectedPromptDamageBonuses.set(weaponItem.id, selectedDamageBonuses);
					//console.log(`${MODULE_ID} | Stored prompted damage bonuses for weapon ${weaponItem.id}:`, selectedDamageBonuses);
				}
			}

		};

	}

	// ============================================
	// FREYA'S OMEN - PREVENT SPELL LOSS
	// ============================================
	if (RollSD?.Roll) {
		const _originalRoll = RollSD.Roll;
		RollSD.Roll = async function (parts, data, $form, adv = 0, options = {}) {
			const hasFreyasOmen = data.actor?.getFlag && data.actor.getFlag(MODULE_ID, "freyasOmen");

			if (data.item?.isSpell() && hasFreyasOmen) {
				const originalUpdate = data.item.update;
				data.item.update = async function (updates, options = {}) {
					if (updates["system.lost"]) {
						//console.log(`${MODULE_ID} | Freya's Omen prevented spell loss for ${data.item.name}`);
						delete updates["system.lost"];
						if (foundry.utils.isEmpty(updates)) return;
					}
					return originalUpdate.call(this, updates, options);
				};
			}

			return _originalRoll.call(this, parts, data, $form, adv, options);
		};
	}

	//console.log(`${MODULE_ID} | Consolidated ActorSD and RollSD patches applied`);
});

// ============================================
// INVISIBILITY EFFECT - MAKE TOKEN INVISIBLE
// ============================================

// Apply invisibility visual effect to tokens using Foundry's built-in hidden property
Hooks.on("refreshToken", (token) => {
	const hasInvisibility = token.actor?.getFlag(MODULE_ID, "invisibility");

	if (hasInvisibility) {
		// Use Foundry's hidden property (same as token HUD invisible button)
		if (!token.document.hidden) {
			token.document.update({ hidden: true });
		}
	}
});

// Auto-disable invisibility when attacking or casting spells
Hooks.on("preCreateChatMessage", async (message) => {
	const speaker = message.speaker;
	if (!speaker?.actor) return;

	const actor = game.actors.get(speaker.actor);
	if (!actor) return;

	// Check if actor has invisibility
	const hasInvisibility = actor.getFlag(MODULE_ID, "invisibility");
	if (!hasInvisibility) return;

	// Check if this is an attack or spell
	const shadowdarkFlags = message.flags?.shadowdark;
	const isAttack = shadowdarkFlags?.roll?.type === "attack";
	const isSpell = shadowdarkFlags?.spell || message.flags?.shadowdark?.itemId;

	// Also check if spell item is being cast
	let isSpellCast = false;
	if (message.flags?.shadowdark?.itemId) {
		const item = actor.items.get(message.flags.shadowdark.itemId);
		if (item && item.type === "Spell") {
			isSpellCast = true;
		}
	}

	if (isAttack || isSpell || isSpellCast) {
		//console.log(`${MODULE_ID} | ${actor.name} attacks/casts while invisible - breaking invisibility`);

		// Find and disable the invisibility effect
		const effect = actor.effects.find(e =>
			e.changes.some(c => c.key === `flags.${MODULE_ID}.invisibility`)
		);

		if (effect) {
			await effect.update({ disabled: true });

			// Notify about invisibility breaking
			ChatMessage.create({
				content: `<p>${actor.name}'s invisibility fades as they take offensive action!</p>`,
				speaker: ChatMessage.getSpeaker({ actor }),
				whisper: []
			});

			// Restore token visibility using Foundry's hidden property
			const tokens = actor.getActiveTokens();
			for (const token of tokens) {
				await token.document.update({ hidden: false });
			}
		}
	}
});

// Restore visibility when invisibility effect is disabled or deleted
Hooks.on("updateActiveEffect", async (effect, changes, options, userId) => {
	// Check if this is an invisibility effect being disabled
	const isInvisibilityEffect = effect.changes.some(c => c.key === `flags.${MODULE_ID}.invisibility`);
	if (!isInvisibilityEffect) return;

	//console.log(`${MODULE_ID} | Invisibility effect updated:`, { disabled: effect.disabled, changes });

	// If effect was disabled, restore visibility
	if (changes.disabled === true) {
		//console.log(`${MODULE_ID} | Restoring visibility (effect disabled)`);
		// Effect.parent is the Item (Condition), we need the Actor that owns the item
		const item = effect.parent;
		const actor = item?.parent; // Item's parent is the Actor
		if (actor) {
			//console.log(`${MODULE_ID} | Character Actor:`, { id: actor.id, name: actor.name, type: actor.type });
			// Find all token documents for this actor across all scenes
			const tokens = [];
			for (const scene of game.scenes) {
				//console.log(`${MODULE_ID} | Checking scene: ${scene.name}, tokens: ${scene.tokens.size}`);
				const sceneTokens = scene.tokens.filter(t => {
					const match = t.actorId === actor.id || t.actor?.id === actor.id;
					if (t.actor?.name === actor.name) {
						//console.log(`${MODULE_ID} | Token found:`, { tokenId: t.id, actorId: t.actorId, tokenActorId: t.actor?.id, match });
					}
					return match;
				});
				tokens.push(...sceneTokens);
			}
			//console.log(`${MODULE_ID} | Found ${tokens.length} token documents to restore visibility`);
			for (const tokenDoc of tokens) {
				await tokenDoc.update({ hidden: false });
			}
		}
	}
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
	// Check if this is an invisibility effect being deleted
	const isInvisibilityEffect = effect.changes.some(c => c.key === `flags.${MODULE_ID}.invisibility`);
	if (!isInvisibilityEffect) return;

	// Restore visibility when effect is deleted
	// Effect.parent is the Item (Condition), we need the Actor that owns the item
	const item = effect.parent;
	const actor = item?.parent; // Item's parent is the Actor
	if (actor) {
		//console.log(`${MODULE_ID} | Invisibility effect deleted, restoring visibility`);
		// Find all token documents for this actor across all scenes
		const tokens = [];
		for (const scene of game.scenes) {
			const sceneTokens = scene.tokens.filter(t => t.actorId === actor.id);
			tokens.push(...sceneTokens);
		}
		//console.log(`${MODULE_ID} | Found ${tokens.length} token documents to restore visibility`);
		for (const tokenDoc of tokens) {
			await tokenDoc.update({ hidden: false });
		}
	}
});

// Also restore visibility when the Condition item itself is deleted
Hooks.on("deleteItem", async (item, options, userId) => {
	// Check if this item has an invisibility effect
	const hasInvisibilityEffect = item.effects?.some(e =>
		e.changes.some(c => c.key === `flags.${MODULE_ID}.invisibility`)
	);
	if (!hasInvisibilityEffect) return;

	//console.log(`${MODULE_ID} | Condition with invisibility effect deleted, restoring visibility`);
	// Item's parent is the Actor
	const actor = item.parent;
	if (actor) {
		//console.log(`${MODULE_ID} | Character Actor:`, { id: actor.id, name: actor.name, type: actor.type });
		// Find all token documents for this actor across all scenes
		const tokens = [];
		for (const scene of game.scenes) {
			const sceneTokens = scene.tokens.filter(t => t.actorId === actor.id);
			tokens.push(...sceneTokens);
		}
		//console.log(`${MODULE_ID} | Found ${tokens.length} token documents to restore visibility`);
		for (const tokenDoc of tokens) {
			await tokenDoc.update({ hidden: false });
		}
	}
});

//console.log(`${MODULE_ID} | Invisibility effect enabled with auto-disable on attack/spell`);




// ============================================
// MACRO EXECUTE EFFECT HANDLERS
// ============================================

// Socket for executing macros as GM
let macroExecuteSocket;

// Register socketlib handler on ready hook
Hooks.once("ready", () => {
	// Register socketlib socket if available
	if (game.modules.get("socketlib")?.active) {
		macroExecuteSocket = socketlib.registerModule(MODULE_ID);
		// Expose socket to module
		const module = game.modules.get(MODULE_ID);
		if (module) module.socket = macroExecuteSocket;


		// Register the GM execution handler
		macroExecuteSocket.register("executeMacroAsGM", async (macroId, contextData) => {
			// This runs on the GM's client
			const macro = game.macros.get(macroId);
			if (!macro) {
				console.warn(`${MODULE_ID} | Macro with ID "${macroId}" not found`);
				return;
			}

			// Reconstruct the context from the serialized data
			const context = {
				actor: game.actors.get(contextData.actorId),
				token: contextData.tokenUuid ? (await fromUuid(contextData.tokenUuid))?.object : undefined,
				trigger: contextData.trigger,
				item: contextData.itemUuid ? await fromUuid(contextData.itemUuid) : undefined,
				effect: contextData.effectUuid ? await fromUuid(contextData.effectUuid) : undefined,
			};

			// Execute the macro as GM
			await macro.execute(context);
		});

		//console.log(`${MODULE_ID} | Socketlib integration enabled for macro execution`);
	}
});

/**
 * Parse macro value and execute the macro
 * @param {Actor} actor - The actor on which to execute the macro
 * @param {string} macroValue - The value in format "macroName|trigger" or just "macroName"
 * @param {string} currentTrigger - The trigger that is currently executing
 * @param {Object} options - Additional context options
 * @param {Item} options.item - The item that has the effect (if applicable)
 * @param {ActiveEffect} options.effect - The effect that triggered the macro (if applicable)
 */
async function executeMacroFromEffect(actor, macroValue, currentTrigger, options = {}) {
	if (!macroValue || macroValue === "REPLACEME") return;

	// Parse the value format: "macroName|trigger"
	let macroName, trigger;
	if (macroValue.includes("|")) {
		[macroName, trigger] = macroValue.split("|").map(s => s.trim());
	} else {
		// No trigger specified, default to effectCreated
		macroName = macroValue.trim();
		trigger = "effectCreated";
	}

	// Check if this trigger matches the current trigger
	if (trigger !== currentTrigger) return;

	// Find the macro by name
	const macro = game.macros.find(m => m.name === macroName);
	if (!macro) {
		console.warn(`${MODULE_ID} | Macro "${macroName}" not found for macro.execute effect`);
		return;
	}

	// Check permissions - only execute if user owns the actor or is GM
	if (!actor.isOwner && !game.user.isGM) {
		//console.log(`${MODULE_ID} | User does not have permission to execute macro for actor ${actor.name}`);
		return;
	}

	try {
		//console.log(`${MODULE_ID} | Executing macro "${macroName}" for actor ${actor.name} on trigger "${currentTrigger}"`);

		// Get the actor's token (if available on canvas)
		const token = actor.token || canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);

		// Build the context object to pass to the macro
		const context = {
			actor,           // The actor that has the effect
			token,           // The token representing the actor (if on canvas)
			trigger: currentTrigger,  // The trigger type (roundStart, itemEquipped, etc.)
			item: options.item,       // The item that has the effect (if applicable)
			effect: options.effect,   // The active effect (if applicable)
		};

		// Use socketlib for GM execution if available, otherwise execute locally
		if (macroExecuteSocket && !game.user.isGM) {
			// Serialize context data for socket transmission
			const contextData = {
				actorId: actor.id,
				tokenId: token?.id,
				trigger: currentTrigger,
				itemId: options.item?.id,
				effectId: options.effect?.id,
			};

			// Execute macro as GM via socketlib
			//console.log(`${MODULE_ID} | Executing macro via GM (socketlib)`);
			await macroExecuteSocket.executeAsGM("executeMacroAsGM", macro.id, contextData);
		} else {
			// Execute locally (either user is GM or socketlib not available)
			await macro.execute(context);
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error executing macro "${macroName}":`, error);
		ui.notifications.error(`Failed to execute macro "${macroName}": ${error.message}`);
	}
}

/**
 * Check actor for macro execute effects and run them for the given trigger
 * @param {Actor} actor - The actor to check for macro execute effects
 * @param {string} trigger - The trigger type (roundStart, roundEnd, etc.)
 */
async function checkAndExecuteMacros(actor, trigger) {
	if (!actor) return;

	// Get the macro execute flag value
	const macroValue = actor.getFlag?.(MODULE_ID, "macroExecute");
	if (macroValue) {
		await executeMacroFromEffect(actor, macroValue, trigger);
	}

	// Also check all active effects for macro execute
	for (const effect of actor.effects || []) {
		const effectMacroValue = effect.flags?.[MODULE_ID]?.macroExecute;
		if (effectMacroValue) {
			await executeMacroFromEffect(actor, effectMacroValue, trigger, { effect });
		}
	}

	// Also check all items for macro execute effects
	for (const item of actor.items || []) {
		const itemMacroValue = item.getFlag?.(MODULE_ID, "macroExecute");
		if (itemMacroValue) {
			await executeMacroFromEffect(actor, itemMacroValue, trigger, { item });
		}

		// Check item's active effects
		for (const effect of item.effects || []) {
			const effectMacroValue = effect.flags?.[MODULE_ID]?.macroExecute;
			if (effectMacroValue) {
				await executeMacroFromEffect(actor, effectMacroValue, trigger, { item, effect });
			}
		}
	}
}

// Hook: Combat turn start (roundStart)
Hooks.on("combatTurn", async (combat, updateData, updateOptions) => {
	// Only execute for the active combatant at the start of their turn
	const combatant = combat.combatant;
	if (!combatant?.actor) return;

	// Only execute on the user who owns the combatant
	if (combatant.actor.isOwner) {
		await checkAndExecuteMacros(combatant.actor, "roundStart");
	}
});

// Hook: Combat turn end (roundEnd) - this fires before the next turn
Hooks.on("combatTurn", async (combat, updateData, updateOptions) => {
	// Get the previous combatant (whose turn just ended)
	const prevTurn = updateData.turn - 1;
	if (prevTurn >= 0 && prevTurn < combat.turns.length) {
		const prevCombatant = combat.turns[prevTurn];
		if (prevCombatant?.actor && prevCombatant.actor.isOwner) {
			await checkAndExecuteMacros(prevCombatant.actor, "roundEnd");
		}
	}
});

// Hook: Effect created (effectCreated)
Hooks.on("createActiveEffect", async (effect, options, userId) => {
	// Only execute for the user who created the effect
	if (userId !== game.user.id) return;

	const actor = effect.parent;
	if (!actor) return;

	// Check if this specific effect has macro execute
	const macroValue = effect.flags?.[MODULE_ID]?.macroExecute;
	if (macroValue) {
		await executeMacroFromEffect(actor, macroValue, "effectCreated", { effect });
	}
});

// Hook: Effect deleted (effectDeleted)
Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
	// Only execute for the user who deleted the effect
	if (userId !== game.user.id) return;

	const actor = effect.parent;
	if (!actor) return;

	// Check if this specific effect has macro execute
	const macroValue = effect.flags?.[MODULE_ID]?.macroExecute;
	if (macroValue) {
		await executeMacroFromEffect(actor, macroValue, "effectDeleted", { effect });
	}
});

// Hook: Item equipped/unequipped (itemEquipped, itemUnequipped)
Hooks.on("updateItem", async (item, changes, options, userId) => {
	// Only execute for the user who made the change
	if (userId !== game.user.id) return;

	const actor = item.parent;
	if (!actor) return;

	// Check if equipped status changed
	if (changes.system?.equipped !== undefined) {
		const nowEquipped = changes.system.equipped;
		const trigger = nowEquipped ? "itemEquipped" : "itemUnequipped";

		// Check if this item has macro execute
		const macroValue = item.getFlag?.(MODULE_ID, "macroExecute");
		if (macroValue) {
			await executeMacroFromEffect(actor, macroValue, trigger, { item });
		}

		// Also check item's effects
		for (const effect of item.effects || []) {
			const effectMacroValue = effect.flags?.[MODULE_ID]?.macroExecute;
			if (effectMacroValue) {
				await executeMacroFromEffect(actor, effectMacroValue, trigger, { item, effect });
			}
		}

		// Check for weapon item macro triggers (onEquip/onUnequip)
		if (item.type === "Weapon") {
			const macroConfig = getWeaponItemMacroConfig(item);
			if (macroConfig.enabled) {
				const weaponTrigger = nowEquipped ? "onEquip" : "onUnequip";
				if (macroConfig.triggers.includes(weaponTrigger)) {
					await executeWeaponItemMacro(item, actor, weaponTrigger, {});
				}
			}
		}

		// Check if any effects on this item require equipped status
		// Trigger requirement checks to enable/disable effects based on equipped status
		if (actor instanceof Actor) {
			//console.log(`${MODULE_ID} | Item "${item.name}" equipped status changed to ${nowEquipped}, checking effect requirements`);
			await checkEffectRequirements(actor);
		}
	}
});

// ============================================
// WEAPON ITEM MACRO EXECUTION SYSTEM
// ============================================

/**
 * Execute a weapon's Item Macro
 * @param {Item} weapon - The weapon item
 * @param {Actor} actor - The actor using the weapon
 * @param {string} trigger - The trigger type (beforeAttack, onHit, onCritical, onMiss, onCriticalMiss, onEquip, onUnequip)
 * @param {Object} context - Additional context for the macro
 */
async function executeWeaponItemMacro(weapon, actor, trigger, context = {}) {
	// Check if Item Macro module is available
	if (!game.modules.get("itemacro")?.active) {
		//console.log(`${MODULE_ID} | Item Macro module not active, skipping weapon macro execution`);
		return;
	}

	// Check if the weapon has a macro using Item Macro's API
	if (typeof weapon.hasMacro !== "function" || !weapon.hasMacro()) {
		//console.log(`${MODULE_ID} | No Item Macro attached to weapon ${weapon.name}`);
		return;
	}

	// Get the weapon item macro config
	const macroConfig = getWeaponItemMacroConfig(weapon);
	if (!macroConfig.enabled) return;

	// Verify the trigger is enabled
	if (!macroConfig.triggers.includes(trigger)) {
		//console.log(`${MODULE_ID} | Trigger ${trigger} not enabled for weapon ${weapon.name}`);
		return;
	}

	// Get the actor's token
	const token = actor.token || canvas.tokens?.placeables.find(t => t.actor?.id === actor.id);

	// Get targets
	const targets = Array.from(game.user.targets);
	const target = targets[0] || null;
	const targetActor = target?.actor || null;

	// Build the comprehensive scope object
	// Note: Item Macro expects certain properties to be available
	const scope = {
		actor,
		token,
		item: weapon,
		targets,
		target,
		targetActor,
		trigger,
		isHit: context.isHit ?? false,
		isMiss: context.isMiss ?? false,
		isCritical: context.isCritical ?? false,
		isCriticalMiss: context.isCriticalMiss ?? false,
		rollResult: context.rollResult ?? null,
		rollData: context.rollData ?? null,
		damageRoll: context.damageRoll ?? null,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: weapon.flags?.[MODULE_ID]?.weaponBonus || {},
		// Add SDX-specific properties that macros can use
		sdx: {
			trigger,
			isHit: context.isHit ?? false,
			isMiss: context.isMiss ?? false,
			isCritical: context.isCritical ?? false,
			isCriticalMiss: context.isCriticalMiss ?? false,
			rollResult: context.rollResult ?? null
		}
	};

	try {
		//console.log(`${MODULE_ID} | Executing weapon Item Macro for ${weapon.name} on trigger "${trigger}"`, scope);

		// Check if we need to run as GM
		if (macroConfig.runAsGm && !game.user.isGM && macroExecuteSocket) {
			// Serialize context for socket transmission
			const serializedContext = {
				actorId: actor.id,
				tokenId: token?.id,
				itemId: weapon.id,
				targetIds: targets.map(t => t.id),
				trigger,
				isHit: scope.isHit,
				isMiss: scope.isMiss,
				isCritical: scope.isCritical,
				isCriticalMiss: scope.isCriticalMiss,
				rollResult: scope.rollResult,
				rollDataJson: scope.rollData ? JSON.stringify(scope.rollData) : null
			};

			//console.log(`${MODULE_ID} | Executing weapon Item Macro via GM (socketlib)`);
			await macroExecuteSocket.executeAsGM("executeWeaponItemMacroAsGM", serializedContext);
		} else {
			// Execute the macro locally using Item Macro's API
			// The executeMacro method is added to Item.prototype by the itemacro module
			//console.log(`${MODULE_ID} | Executing weapon Item Macro locally using weapon.executeMacro()`);
			await weapon.executeMacro(scope);
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error executing weapon Item Macro for ${weapon.name}:`, error);
		ui.notifications.error(`Failed to execute macro for ${weapon.name}: ${error.message}`);
	}
}

// Register additional socketlib handler for weapon item macro GM execution
Hooks.once("ready", () => {
	if (macroExecuteSocket) {
		macroExecuteSocket.register("executeWeaponItemMacroAsGM", async (serializedContext) => {
			// This runs on the GM's client
			const actor = game.actors.get(serializedContext.actorId);
			if (!actor) return;

			const weapon = actor.items.get(serializedContext.itemId);
			if (!weapon) return;

			const token = serializedContext.tokenId ? canvas.tokens?.get(serializedContext.tokenId) : null;
			const targets = serializedContext.targetIds?.map(id => canvas.tokens?.get(id)).filter(Boolean) || [];

			const scope = {
				actor,
				token,
				item: weapon,
				targets,
				target: targets[0] || null,
				targetActor: targets[0]?.actor || null,
				trigger: serializedContext.trigger,
				isHit: serializedContext.isHit,
				isMiss: serializedContext.isMiss,
				isCritical: serializedContext.isCritical,
				isCriticalMiss: serializedContext.isCriticalMiss,
				rollResult: serializedContext.rollResult,
				rollData: serializedContext.rollDataJson ? JSON.parse(serializedContext.rollDataJson) : null,
				damageRoll: null,
				speaker: ChatMessage.getSpeaker({ actor }),
				flags: weapon.flags?.[MODULE_ID]?.weaponBonus || {}
			};

			try {
				// Use Item Macro's API
				if (typeof weapon.executeMacro === "function") {
					//console.log(`${MODULE_ID} | GM executing weapon Item Macro using weapon.executeMacro()`);
					await weapon.executeMacro(scope);
				} else {
					console.error(`${MODULE_ID} | weapon.executeMacro is not available on GM client`);
				}
			} catch (error) {
				console.error(`${MODULE_ID} | GM execution of weapon Item Macro failed:`, error);
			}
		});

		//console.log(`${MODULE_ID} | Registered weapon Item Macro GM execution handler`);
	}
});

// ============================================
// SPELL ITEM MACRO EXECUTION SYSTEM
// ============================================

/**
 * Get the Item Macro configuration for a spell/wand/scroll/potion
 * @param {Item} item - The spell-type item
 * @returns {Object} - The macro configuration
 */
function getSpellItemMacroConfig(item) {
	const flags = item.flags?.[MODULE_ID]?.itemMacro || {};
	return {
		enabled: flags.triggers?.length > 0,
		runAsGm: flags.runAsGm || false,
		triggers: flags.triggers || []
	};
}

/**
 * Execute a spell's Item Macro
 * @param {Item} spellItem - The spell/wand/scroll/potion item
 * @param {Actor} actor - The actor casting the spell
 * @param {string} trigger - The trigger type (onCast, onSuccess, onFailure, onCritical, onCriticalFail)
 * @param {Object} context - Additional context for the macro
 */
async function executeSpellItemMacro(spellItem, actor, trigger, context = {}) {
	// Check if Item Macro module is active
	if (!game.modules.get("itemacro")?.active) {
		console.warn(`${MODULE_ID} | Item Macro module not active, cannot execute spell macro`);
		return;
	}

	// Check if the item has a macro attached
	if (typeof spellItem.hasMacro !== "function" || !spellItem.hasMacro()) {
		//console.log(`${MODULE_ID} | Spell ${spellItem.name} has triggers configured but no Item Macro attached`);
		return;
	}

	//console.log(`${MODULE_ID} | Executing spell Item Macro for ${spellItem.name}, trigger: ${trigger}`);

	// Get the caster's token
	const token = canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id) || null;

	// Get current targets
	const targets = context.targets || Array.from(game.user.targets || []);

	// Build the scope object to pass to the macro
	const scope = {
		actor,
		token,
		item: spellItem,
		targets,
		target: targets[0] || null,
		targetActor: targets[0]?.actor || null,
		trigger,
		isSuccess: context.isSuccess ?? false,
		isFailure: context.isFailure ?? false,
		isCritical: context.isCritical ?? false,
		isCriticalFail: context.isCriticalFail ?? false,
		rollResult: context.rollResult ?? null,
		rollData: context.rollData ?? null,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: spellItem.flags?.[MODULE_ID] || {}
	};

	const macroConfig = getSpellItemMacroConfig(spellItem);

	// If running as GM and we're not the GM, send via socket
	if (macroConfig.runAsGm && !game.user.isGM) {
		// Serialize context for socket transmission
		const serializedContext = {
			actorId: actor.id,
			itemId: spellItem.id,
			tokenUuid: token?.document?.uuid,
			targetUuids: targets.map(t => t.document.uuid),
			trigger,
			isSuccess: context.isSuccess,
			isFailure: context.isFailure,
			isCritical: context.isCritical,
			isCriticalFail: context.isCriticalFail,
			rollResult: context.rollResult,
			rollDataJson: context.rollData ? JSON.stringify(context.rollData) : null,
			originatingUserId: game.user.id  // Track who initiated the spell for dialog routing
		};

		//console.log(`${MODULE_ID} | Sending spell Item Macro to GM for execution`);
		if (macroExecuteSocket) {
			await macroExecuteSocket.executeAsGM("executeSpellItemMacroAsGM", serializedContext);
		}
		return;
	}

	// Execute locally using Item Macro's API
	try {
		if (typeof spellItem.executeMacro === "function") {
			await spellItem.executeMacro(scope);
			//console.log(`${MODULE_ID} | Spell Item Macro executed successfully`);
		} else {
			console.warn(`${MODULE_ID} | spellItem.executeMacro is not available`);
		}
	} catch (error) {
		console.error(`${MODULE_ID} | Error executing spell Item Macro:`, error);
		ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details");
	}
}

// Register socket handler for GM execution of spell Item Macros
Hooks.once("ready", () => {
	if (macroExecuteSocket) {
		macroExecuteSocket.register("executeSpellItemMacroAsGM", async (serializedContext) => {
			const actor = game.actors.get(serializedContext.actorId);
			if (!actor) return;

			const spellItem = actor.items.get(serializedContext.itemId);
			if (!spellItem) return;

			// Resolve token and targets from UUIDs to ensure cross-scene support
			const tokenDoc = serializedContext.tokenUuid ? await fromUuid(serializedContext.tokenUuid) : null;
			const token = tokenDoc?.object || null;

			const targets = [];
			if (serializedContext.targetUuids) {
				for (const uuid of serializedContext.targetUuids) {
					const tDoc = await fromUuid(uuid);
					if (tDoc?.object) targets.push(tDoc.object);
				}
			}

			const scope = {
				actor,
				token,
				item: spellItem,
				targets,
				target: targets[0] || null,
				targetActor: targets[0]?.actor || null,
				trigger: serializedContext.trigger,
				isSuccess: serializedContext.isSuccess,
				isFailure: serializedContext.isFailure,
				isCritical: serializedContext.isCritical,
				isCriticalFail: serializedContext.isCriticalFail,
				rollResult: serializedContext.rollResult,
				rollData: serializedContext.rollDataJson ? JSON.parse(serializedContext.rollDataJson) : null,
				speaker: ChatMessage.getSpeaker({ actor }),
				flags: spellItem.flags?.[MODULE_ID] || {},
				originatingUserId: serializedContext.originatingUserId  // For dialog routing back to player
			};

			try {
				if (typeof spellItem.executeMacro === "function") {
					// DEBUG: Log scope to find ReferenceError cause
					// console.log(`${MODULE_ID} | GM executing macro with scope:`, scope);
					await spellItem.executeMacro(scope);
				} else {
					console.error(`${MODULE_ID} | spellItem.executeMacro is not available on GM client`);
				}
			} catch (error) {
				console.error(`${MODULE_ID} | GM execution of spell Item Macro failed:`, error);
			}
		});

		//console.log(`${MODULE_ID} | Registered spell Item Macro GM execution handler`);
	}
});

// Register socket handlers for Spell API functions
Hooks.once("ready", () => {
	// Note: macroExecuteSocket is defined in the closure above, but we need to access it.
	// However, since it was defined in a previous ready hook, it might not be available here if this hook runs before that one completes?
	// Actually, hooks run sequentially. But macroExecuteSocket is let-scoped in the file, so it IS available.

	if (game.modules.get("socketlib")?.active && macroExecuteSocket) {
		macroExecuteSocket.register("applyHolyWeaponAsGM", async (weaponUuid, casterUuid, itemUuid, targetActorUuid, targetTokenUuid) => {
			// Items return the document directly from fromUuid, not a wrapper
			const weapon = await fromUuid(weaponUuid);
			const casterActor = await fromUuid(casterUuid);
			const casterItem = await fromUuid(itemUuid);
			const targetActor = await fromUuid(targetActorUuid);
			const targetTokenDoc = targetTokenUuid ? await fromUuid(targetTokenUuid) : null;
			const targetToken = targetTokenDoc?.object || null;

			if (weapon && casterActor && casterItem && targetActor) {
				const module = game.modules.get(MODULE_ID);
				if (module?.api?.applyHolyWeapon) {
					await module.api.applyHolyWeapon(weapon, casterActor, casterItem, targetActor, targetToken);
				}
			}
		});

		macroExecuteSocket.register("applyCleansingWeaponAsGM", async (weaponUuid, casterUuid, itemUuid, targetActorUuid, targetTokenUuid) => {
			// Items return the document directly from fromUuid, not a wrapper
			const weapon = await fromUuid(weaponUuid);
			const casterActor = await fromUuid(casterUuid);
			const casterItem = await fromUuid(itemUuid);
			const targetActor = await fromUuid(targetActorUuid);
			const targetTokenDoc = targetTokenUuid ? await fromUuid(targetTokenUuid) : null;
			const targetToken = targetTokenDoc?.object || null;

			if (weapon && casterActor && casterItem && targetActor) {
				const module = game.modules.get(MODULE_ID);
				if (module?.api?.applyCleansingWeapon) {
					await module.api.applyCleansingWeapon(weapon, casterActor, casterItem, targetActor, targetToken);
				}
			}
		});

		macroExecuteSocket.register("identifyItemAsGM", async (itemUuid, identifySpellUuid, maskedName, originatingUserId) => {
			const item = await fromUuid(itemUuid);
			if (!item) return;

			// Remove unidentified flags (GM has permission)
			await item.unsetFlag(MODULE_ID, "unidentified");
			await item.unsetFlag(MODULE_ID, "unidentifiedName");

			// Post chat message (visible to all)
			const chatContent = `
				<div class="shadowdark chat-card sdx-identify-chat">
					<header class="card-header flexrow">
						<img class="item-image" src="${item.img}" alt="${item.name}"/>
						<div class="header-text">
							<h3><i class="fas fa-sparkles"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.identify.revealed")}</h3>
						</div>
					</header>
					<div class="card-content">
						<p class="reveal-text">
							<em>${maskedName}</em> ${game.i18n.localize("SHADOWDARK_EXTRAS.identify.isActually")}
						</p>
						<p class="item-name"><strong>${item.name}</strong></p>
						${item.system?.description ? `<div class="item-description">${item.system.description}</div>` : ""}
					</div>
				</div>
			`;

			await ChatMessage.create({
				content: chatContent,
				speaker: ChatMessage.getSpeaker({ actor: item.actor }),
				type: CONST.CHAT_MESSAGE_STYLES.OTHER
			});

			// Route reveal dialog back to the originating player
			if (originatingUserId && originatingUserId !== game.user.id) {
				await macroExecuteSocket.executeAsUser("showItemRevealForUser", originatingUserId, {
					itemUuid: item.uuid,
					maskedName: maskedName
				});
			} else {
				// GM is casting, show locally
				const module = game.modules.get(MODULE_ID);
				if (module?.api?.showItemReveal) {
					await module.api.showItemReveal(item, maskedName);
				}
			}

			ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.identify.success", { name: item.name }));
		});

		// Handler: Show item reveal dialog on player's client
		macroExecuteSocket.register("showItemRevealForUser", async ({ itemUuid, maskedName }) => {
			const item = await fromUuid(itemUuid);
			if (!item) return;

			const module = game.modules.get(MODULE_ID);
			if (module?.api?.showItemReveal) {
				await module.api.showItemReveal(item, maskedName);
			}
		});
	}
});

/**
 * Hook into spell cast messages to trigger Item Macros
 */
Hooks.on("renderChatMessage", async (message, html, data) => {
	// Only process once per message
	if (message._sdxSpellMacroProcessed) return;
	message._sdxSpellMacroProcessed = true;

	// Only process for the user who created the message
	if (message.author?.id !== game.user.id) return;

	// Check if this is a spell-type item
	const cardData = html.find('.chat-card').data();
	if (!cardData?.itemId || !cardData?.actorId) return;

	const actor = game.actors.get(cardData.actorId);
	if (!actor) return;

	const item = actor.items.get(cardData.itemId);
	if (!item) return;

	// Only process spell-type items
	const spellTypes = ["Spell", "Scroll", "Wand", "Potion", "NPC Spell"];
	if (!spellTypes.includes(item.type)) return;

	// Get the macro config
	const macroConfig = getSpellItemMacroConfig(item);
	if (!macroConfig.enabled || macroConfig.triggers.length === 0) return;

	// Get roll result from Shadowdark's flags
	const shadowdarkRolls = message.flags?.shadowdark?.rolls;
	const mainRoll = shadowdarkRolls?.main;

	// Determine success/failure from roll data
	// Potions, Scrolls, Wands don't require a roll - they always succeed
	const noRollNeeded = ["Potion", "Scroll", "Wand"].includes(item.type);
	const isSuccess = noRollNeeded || (mainRoll?.success === true);
	const isFailure = !noRollNeeded && (mainRoll?.success === false);
	const isCritical = mainRoll?.critical === "success";
	const isCriticalFail = mainRoll?.critical === "failure";

	// Get stored targets
	const storedTargetIds = message.flags?.[MODULE_ID]?.targetIds || [];
	const targets = canvas?.tokens ? storedTargetIds.map(id => canvas.tokens.get(id)).filter(Boolean) : [];

	const context = {
		isSuccess,
		isFailure,
		isCritical,
		isCriticalFail,
		rollResult: mainRoll?.roll?.total ?? null,
		rollData: mainRoll?.roll ?? null,
		targets
	};

	// Trigger macros based on which triggers are enabled
	const triggersToFire = [];

	// onCast always fires when the spell is used
	if (macroConfig.triggers.includes("onCast")) {
		triggersToFire.push("onCast");
	}

	// Success-based triggers
	if (macroConfig.triggers.includes("onCritical") && isCritical) {
		triggersToFire.push("onCritical");
	} else if (macroConfig.triggers.includes("onSuccess") && isSuccess) {
		triggersToFire.push("onSuccess");
	}

	// Failure-based triggers
	if (macroConfig.triggers.includes("onCriticalFail") && isCriticalFail) {
		triggersToFire.push("onCriticalFail");
	} else if (macroConfig.triggers.includes("onFailure") && isFailure && !isCriticalFail) {
		triggersToFire.push("onFailure");
	}

	// Execute all applicable triggers
	for (const trigger of triggersToFire) {
		await executeSpellItemMacro(item, actor, trigger, context);
	}
});

/**
 * Hook into weapon attack rolls to trigger Item Macros
 * Use renderChatMessage instead of createChatMessage because rolls are populated later
 */
Hooks.on("renderChatMessage", async (message, html, data) => {
	// Only process once per message - use a flag to track
	if (message._sdxItemMacroProcessed) return;
	message._sdxItemMacroProcessed = true;

	// Only process for the user who created the message
	if (message.author?.id !== game.user.id) return;

	// Check for rolls using HTML elements (like CombatSettingsSD does)
	const hasDiceTotal = html.find('.dice-total').length > 0;
	const hasD20Roll = html.find('.d20-roll').length > 0;
	const flags = message.flags;

	// Debug logging for troubleshooting
	//console.log(`${MODULE_ID} | [DEBUG] Item Macro hook - checking message:`, {
	//	hasDiceTotal,
	//	hasD20Roll,
	//	shadowdarkRolls: flags?.shadowdark?.rolls,
	//	flavor: message.flavor?.substring(0, 50)
	//});

	// Get actor from speaker
	const actorId = message.speaker?.actor;
	if (!actorId) return;

	const actor = game.actors.get(actorId);
	if (!actor) return;

	// Get item from chat card data (like CombatSettingsSD does)
	const cardData = html.find('.chat-card').data();
	let item = null;

	if (cardData?.itemId) {
		item = actor.items.get(cardData.itemId);
	} else {
		// Fallback: Try to detect weapon from message content
		const content = message.content || "";
		for (const actorItem of actor.items) {
			if (actorItem.type === "Weapon" && content.includes(actorItem.name)) {
				const config = getWeaponItemMacroConfig(actorItem);
				if (config.enabled && config.triggers.length > 0) {
					item = actorItem;
					//console.log(`${MODULE_ID} | [DEBUG] Found weapon from content: ${item.name}`);
					break;
				}
			}
		}
	}

	if (!item || item.type !== "Weapon") return;

	// Get the macro config
	const macroConfig = getWeaponItemMacroConfig(item);
	if (!macroConfig.enabled || macroConfig.triggers.length === 0) {
		//console.log(`${MODULE_ID} | [DEBUG] Weapon ${item.name} has no enabled triggers`);
		return;
	}

	// Check if this is an attack roll using flavor
	const flavor = message.flavor?.toLowerCase() || "";
	const isAttackMessage = flavor.includes("attack roll");

	//console.log(`${MODULE_ID} | [DEBUG] Attack detection for ${item.name}:`, {
	//	isAttackMessage,
	//	hasDiceTotal,
	//	hasD20Roll,
	//	macroConfig
	//});

	// Skip if this doesn't look like an attack with dice
	if (!isAttackMessage && !hasDiceTotal && !hasD20Roll) {
		//console.log(`${MODULE_ID} | [DEBUG] Skipping - not an attack message with dice`);
		return;
	}

	// Get roll result from Shadowdark's flags (this is the reliable source)
	const shadowdarkRolls = flags?.shadowdark?.rolls;
	const mainRoll = shadowdarkRolls?.main;

	//console.log(`${MODULE_ID} | [DEBUG] Shadowdark roll data:`, {
	//	mainRoll,
	//	success: mainRoll?.success,
	//	critical: mainRoll?.critical
	//});

	if (!mainRoll) {
		//console.log(`${MODULE_ID} | [DEBUG] No main roll in shadowdark flags`);
		return;
	}

	// Determine hit/miss/critical from Shadowdark's roll data
	const isCritical = mainRoll.critical === "success";
	const isCriticalMiss = mainRoll.critical === "failure";
	const isHit = mainRoll.success === true && !isCriticalMiss;
	const isMiss = mainRoll.success === false || isCriticalMiss;

	//console.log(`${MODULE_ID} | [DEBUG] Roll analysis:`, {
	//	isCritical,
	//	isCriticalMiss,
	//	isHit,
	//	isMiss
	//});

	// Get roll result from the mainRoll data
	const rollResult = mainRoll.roll?.total ?? null;

	const context = {
		isHit: isHit && !isCriticalMiss,
		isMiss: isMiss || isCriticalMiss,
		isCritical,
		isCriticalMiss,
		rollResult: rollResult,
		rollData: mainRoll.roll
	};

	// Trigger macros based on which triggers are enabled
	const triggersToFire = [];

	if (macroConfig.triggers.includes("onCritical") && isCritical) {
		triggersToFire.push("onCritical");
	} else if (macroConfig.triggers.includes("onHit") && context.isHit) {
		triggersToFire.push("onHit");
	}

	if (macroConfig.triggers.includes("onCriticalMiss") && isCriticalMiss) {
		triggersToFire.push("onCriticalMiss");
	} else if (macroConfig.triggers.includes("onMiss") && context.isMiss && !isCriticalMiss) {
		triggersToFire.push("onMiss");
	}

	//console.log(`${MODULE_ID} | [DEBUG] Triggers to fire:`, triggersToFire);

	// Execute all applicable triggers
	for (const trigger of triggersToFire) {
		//console.log(`${MODULE_ID} | [DEBUG] Firing trigger: ${trigger}`);
		await executeWeaponItemMacro(item, actor, trigger, context);
	}
});

// ============================================
// NPC FEATURE ITEM MACRO EXECUTION
// ============================================

/**
 * Execute the item macro for an NPC Feature when used
 * @param {Item} item - The NPC Feature item
 * @param {Actor} actor - The actor using the item
 * @param {Object} context - Additional context
 */
async function executeNPCFeatureItemMacro(item, actor, context = {}) {
	// Check if Item Macro module is active
	if (!game.modules.get("itemacro")?.active) return;

	// Check if the item has a macro and if executeOnUse is enabled
	const macroConfig = item.getFlag(MODULE_ID, "itemMacro") || {};
	const executeOnUse = macroConfig.executeOnUse ?? true; // Default to true for backwards compatibility

	if (!executeOnUse) {
		//console.log(`${MODULE_ID} | NPC Feature macro execution disabled for ${item.name}`);
		return;
	}

	// Check if the item has a macro using Item Macro's API
	if (typeof item.hasMacro !== "function" || !item.hasMacro()) {
		//console.log(`${MODULE_ID} | NPC Feature ${item.name} has no macro`);
		return;
	}

	// Get selected token
	const selectedTokens = canvas.tokens?.controlled || [];
	const token = selectedTokens.find(t => t.actor?.id === actor.id) || null;

	// Get targeted tokens
	const targets = Array.from(game.user?.targets || []);

	// Build scope for the macro
	const scope = {
		actor,
		token,
		item,
		targets,
		target: targets[0] || null,
		targetActor: targets[0]?.actor || null,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: item.flags?.[MODULE_ID] || {},
		...context
	};

	// If running as GM and we're not the GM, send via socket
	if (macroConfig.runAsGm && !game.user.isGM) {
		const serializedContext = {
			actorId: actor.id,
			itemId: item.id,
			tokenUuid: token?.document?.uuid,
			targetUuids: targets.map(t => t.document.uuid),
			originatingUserId: game.user.id
		};

		//console.log(`${MODULE_ID} | Sending NPC Feature Item Macro to GM for execution`);
		if (macroExecuteSocket) {
			await macroExecuteSocket.executeAsGM("executeNPCFeatureMacroAsGM", serializedContext);
		}
		return;
	}

	// Execute the macro directly (bypassing Item Macro's validation which requires name)
	try {
		const macroCommand = item.getFlag("itemacro", "macro.command");
		if (!macroCommand) {
			console.warn(`${MODULE_ID} | NPC Feature ${item.name} has no macro command`);
			return;
		}

		// Create and execute an async function with the scope variables
		const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
		const macroFn = new AsyncFunction("actor", "token", "item", "targets", "target", "targetActor", "speaker", "flags",
			macroCommand);

		await macroFn.call(scope, scope.actor, scope.token, scope.item, scope.targets, scope.target, scope.targetActor, scope.speaker, scope.flags);
		//console.log(`${MODULE_ID} | NPC Feature Item Macro executed successfully`);
	} catch (error) {
		console.error(`${MODULE_ID} | Error executing NPC Feature Item Macro:`, error);
		ui.notifications.error("There was an error in your macro syntax. See the console (F12) for details");
	}


}

// Register socket handler for GM execution of NPC Feature Item Macros
Hooks.once("ready", () => {

	if (macroExecuteSocket) {
		macroExecuteSocket.register("executeNPCFeatureMacroAsGM", async (serializedContext) => {
			const actor = game.actors.get(serializedContext.actorId);
			if (!actor) return;

			const item = actor.items.get(serializedContext.itemId);
			if (!item) return;

			// Resolve token and targets from UUIDs
			const tokenDoc = serializedContext.tokenUuid ? await fromUuid(serializedContext.tokenUuid) : null;
			const token = tokenDoc?.object || null;

			const targets = [];
			if (serializedContext.targetUuids) {
				for (const uuid of serializedContext.targetUuids) {
					const tDoc = await fromUuid(uuid);
					if (tDoc?.object) targets.push(tDoc.object);
				}
			}

			const scope = {
				actor,
				token,
				item,
				targets,
				target: targets[0] || null,
				targetActor: targets[0]?.actor || null,
				speaker: ChatMessage.getSpeaker({ actor }),
				flags: item.flags?.[MODULE_ID] || {},
				originatingUserId: serializedContext.originatingUserId
			};

			try {
				if (typeof item.executeMacro === "function") {
					await item.executeMacro(scope);
				} else {
					console.error(`${MODULE_ID} | item.executeMacro is not available on GM client`);
				}
			} catch (error) {
				console.error(`${MODULE_ID} | GM execution of NPC Feature Item Macro failed:`, error);
			}
		});

		//console.log(`${MODULE_ID} | Registered NPC Feature Item Macro GM execution handler`);
	}
});

/**
 * Process NPC Feature activities (damage, effects, summoning, item give)
 * @param {Item} item - The NPC Feature item
 * @param {Actor} actor - The actor using the item  
 * @param {Token} token - The token using the item (optional)
 */
async function processNPCFeatureActivities(item, actor, token) {
	const flags = item.flags?.[MODULE_ID] || {};
	const spellDamage = flags.spellDamage || {};
	const summoning = flags.summoning || {};
	const itemGive = flags.itemGive || {};

	// Get targets
	const targets = Array.from(game.user?.targets || []);
	const targetToken = targets[0] || null;
	const targetActor = targetToken?.actor || null;

	// 1. Process Damage/Healing
	// 1. Process Damage/Healing
	// If automatic damage card is enabled (CombatSettingsSD), we SKIP manual processing here
	// to avoid double-rolling. injectDamageCard will pick up the Item Card and add the damage.
	// We only keep this for legacy or if the module setting is disabled?
	// For now, let's assume if it has spellDamage enabled, we rely on injectDamageCard
	// BUT wait, injectDamageCard needs the flags. The item has flags.
	// So we can just COMMENT OUT or conditionally skip this.

	// Check if this item type is handled by injectDamageCard (NPC Feature, NPC Spell)
	// And if damage is enabled.
	if (spellDamage.enabled) {
		// Only run legacy processing if it's NOT likely to be picked up by injectDamageCard
		// OR if we want to explicitly support the "Two Card" style (Description + Roll).
		// The user wants "Healing" to work. injectDamageCard logic is superior (Challenge Mode etc).
		// So we want injectDamageCard to win.
		// If we skip this, we get NO second card. injectDamageCard MUST pick up the first card.
		// The first card is the Item Card.

		// Let's check if we should skip.
		// For now, I will Comment it out for NPC Spell/Feature to rely on the new system.
		// await processNPCFeatureDamage(item, actor, token, targetToken, targetActor, spellDamage);
		console.log(`${MODULE_ID} | processNPCFeatureActivities | Skipping manual damage roll, relying on injectDamageCard`);
	}

	// 2. Process Effects - REMOVED
	// We now handle effects via the chat card logic (injectDamageCard) to support Challenge Mode
	/*
	const effects = spellDamage.effects || [];
	if (effects.length > 0) {
		await processNPCFeatureEffects(item, actor, token, targetToken, targetActor, spellDamage);
	}
	*/

	// 3. Process Summoning
	if (summoning.enabled && summoning.profiles?.length > 0) {
		await processNPCFeatureSummoning(item, actor, token, summoning);
	}

	// 4. Process Item Give
	if (itemGive.enabled && itemGive.profiles?.length > 0) {
		await processNPCFeatureItemGive(item, actor, token, targetToken, targetActor, itemGive);
	}
}

/**
 * Process damage/healing for NPC Feature
 */
async function processNPCFeatureDamage(item, actor, token, targetToken, targetActor, spellDamage) {
	// Note: We always roll and show the chat card
	// Target is only needed if auto-apply damage is enabled (handled elsewhere)

	// Build the damage formula
	let formula = "";
	const formulaType = spellDamage.formulaType || "basic";

	if (formulaType === "basic") {
		const numDice = spellDamage.numDice || 1;
		const dieType = spellDamage.dieType || "d6";
		const bonus = parseInt(spellDamage.bonus) || 0;
		formula = `${numDice}${dieType}`;
		if (bonus !== 0) {
			formula += bonus > 0 ? `+${bonus}` : `${bonus}`;
		}
	} else if (formulaType === "formula") {
		formula = spellDamage.formula || "1d6";
	} else if (formulaType === "tiered") {
		// Parse tiered formula like "1-3:1d6, 4-6:2d8, 7+:3d10"
		const level = actor.system?.level?.value || 1;
		const tieredFormula = spellDamage.tieredFormula || "";
		const tiers = tieredFormula.split(",").map(t => t.trim());

		for (const tier of tiers) {
			const [range, tierFormula] = tier.split(":").map(s => s.trim());
			if (range.includes("-")) {
				const [min, max] = range.split("-").map(n => parseInt(n));
				if (level >= min && level <= max) {
					formula = tierFormula;
					break;
				}
			} else if (range.includes("+")) {
				const min = parseInt(range.replace("+", ""));
				if (level >= min) {
					formula = tierFormula;
					break;
				}
			}
		}
		if (!formula) formula = "1d6"; // Fallback
	}

	// Roll the damage
	const roll = await new Roll(formula).evaluate();
	const damageType = spellDamage.damageType || "";
	const isHealing = damageType === "Healing";

	// Create chat message for the roll
	const flavor = isHealing
		? `${item.name} heals for`
		: `${item.name} deals${damageType ? " " + damageType : ""} damage`;

	// Create chat card HTML with the required data attributes for injectDamageCard
	const rollHtml = await roll.render();
	const content = `
		<div class="shadowdark chat-card item-card" data-actor-id="${actor.id}" data-item-id="${item.id}">
			<header class="card-header flexrow">
				<img src="${item.img}" data-tooltip="${item.name}"/>
				<h3 class="item-name">${item.name}</h3>
			</header>
			<div class="card-content">
				<h4 class="damage-roll-header">${flavor}</h4>
				${rollHtml}
			</div>
		</div>
	`;

	// Create the chat message with roll data
	await ChatMessage.create({
		content: content,
		speaker: ChatMessage.getSpeaker({ actor }),
		rolls: [roll],
		type: CONST.CHAT_MESSAGE_STYLES.OTHER,
		flags: {
			"shadowdark": {
				itemId: item.uuid,
				isHealing: isHealing,
				rollType: "damage"
			},
			[MODULE_ID]: {
				itemConfig: {
					name: item.name,
					type: item.type,
					spellDamage: item.flags?.[MODULE_ID]?.spellDamage
				}
			}
		}
	});

	// Note: Damage/healing is NOT auto-applied here

	// Users can use chat card buttons or auto-apply settings to apply damage
}


/**
 * Process effects for NPC Feature
 */
async function processNPCFeatureEffects(item, actor, token, targetToken, targetActor, spellDamage) {
	const effectsApplyToSelf = spellDamage.effectsApplyToTarget === false || spellDamage.effectsApplyToTarget === "false";
	const recipient = effectsApplyToSelf ? actor : targetActor;

	if (!recipient) {
		if (!effectsApplyToSelf) {
			ui.notifications.warn("No target selected for effects");
		}
		return;
	}

	const effects = spellDamage.effects || [];
	const selectionMode = spellDamage.effectSelectionMode || "all";

	// Determine which effects to apply
	let effectsToApply = [...effects];

	if (selectionMode === "random" && effectsToApply.length > 1) {
		const randomIndex = Math.floor(Math.random() * effectsToApply.length);
		effectsToApply = [effectsToApply[randomIndex]];
	} else if (selectionMode === "prompt" && effectsToApply.length > 1) {
		// For now, just apply all - prompt could be added later
		// effectsToApply = effectsToApply; 
	}

	// Apply each effect
	for (const effectData of effectsToApply) {
		const effectUuid = typeof effectData === "string" ? effectData : effectData.uuid;
		if (!effectUuid) continue;

		try {
			const effectDoc = await fromUuid(effectUuid);
			if (!effectDoc) continue;

			// Create a copy of the effect for the recipient
			const effectDataObj = effectDoc.toObject();
			delete effectDataObj._id;

			await recipient.createEmbeddedDocuments("Item", [effectDataObj]);
			ui.notifications.info(`Applied ${effectDoc.name} to ${recipient.name}`);
		} catch (err) {
			console.error(`${MODULE_ID} | Failed to apply effect ${effectUuid}:`, err);
		}
	}
}

/**
 * Process summoning for NPC Feature
 */
async function processNPCFeatureSummoning(item, actor, token, summoning) {
	const profiles = summoning.profiles || [];
	if (profiles.length === 0) return;

	// Use the same summoning logic as spells (Portal library)
	await spawnSummonedCreatures(actor, item, profiles, summoning, false);
}

/**
 * Process item give for NPC Feature
 */
async function processNPCFeatureItemGive(item, actor, token, targetToken, targetActor, itemGive) {
	const recipient = targetActor;

	if (!recipient) {
		ui.notifications.warn("No target selected to give items to");
		return;
	}

	const profiles = itemGive.profiles || [];

	for (const profile of profiles) {
		if (!profile.itemUuid) continue;

		try {
			const itemDoc = await fromUuid(profile.itemUuid);
			if (!itemDoc) continue;

			const quantity = parseInt(profile.quantity) || 1;

			// Create item data
			const itemData = itemDoc.toObject();
			delete itemData._id;

			// Set quantity if applicable
			if (itemData.system?.quantity !== undefined) {
				itemData.system.quantity = quantity;
			}

			await recipient.createEmbeddedDocuments("Item", [itemData]);
			ui.notifications.info(`Gave ${quantity}x ${itemDoc.name} to ${recipient.name}`);
		} catch (err) {
			console.error(`${MODULE_ID} | Failed to give item:`, err);
		}
	}
}

// Patch ItemSD.displayCard to execute macros and activities for NPC Features
Hooks.once("ready", () => {
	// Wait a short time to ensure the system is fully loaded
	setTimeout(() => {
		const itemDocClass = CONFIG.Item.documentClass;
		if (!itemDocClass?.prototype?.displayCard) {
			console.warn(`${MODULE_ID} | ItemSD.displayCard not found, cannot patch NPC Feature macro execution`);
			return;
		}

		const originalDisplayCard = itemDocClass.prototype.displayCard;

		itemDocClass.prototype.displayCard = async function (options = {}) {
			// Call original method first
			await originalDisplayCard.call(this, options);

			// Only process NPC Features and NPC Spells
			if (this.type !== "NPC Feature" && this.type !== "NPC Spell") return;

			// Get token for context
			const selectedTokens = canvas.tokens?.controlled || [];
			const token = selectedTokens.find(t => t.actor?.id === this.actor?.id) || null;

			// Execute the macro first
			await executeNPCFeatureItemMacro(this, this.actor, {});

			// Then process activities
			await processNPCFeatureActivities(this, this.actor, token);
		};

		console.log(`${MODULE_ID} | Patched ItemSD.displayCard for NPC Feature macro and activity execution`);

	}, 100);
});

//console.log(`${MODULE_ID} | Module loaded - NPC Feature item macro hooks registered`);



// ============================================
// SDX TEMPLATES API
// ============================================

/**
 * Fix for square template rotation
 * Override MeasuredTemplate.getRectShape to properly handle rotation
 * Based on df-templates by flamewave000
 */
const _originalGetRectShape = foundry.canvas.placeables.MeasuredTemplate.getRectShape;
foundry.canvas.placeables.MeasuredTemplate.getRectShape = function (distance, direction, adjustForRoundingError = false) {
	// Generate a rotation matrix to apply the rect against. The base rotation must be rotated
	// CCW by 45° before applying the real direction rotation.
	const matrix = PIXI.Matrix.IDENTITY.rotate(Math.toRadians(-45 + direction));
	// If the shape will be used for collision, shrink the rectangle by a fixed EPSILON amount to account for rounding errors
	const EPSILON = adjustForRoundingError ? 0.0001 : 0;
	// Use simple Pythagoras to calculate the square's size from the diagonal "distance".
	const size = (Math.sqrt((distance * distance) / 2) * canvas.dimensions.distancePixels) - EPSILON;
	// Create the square's 4 corners with origin being the Top-Left corner and apply the
	// rotation matrix against each.
	const topLeft = matrix.apply(new PIXI.Point(EPSILON, EPSILON));
	const topRight = matrix.apply(new PIXI.Point(size, EPSILON));
	const botLeft = matrix.apply(new PIXI.Point(EPSILON, size));
	const botRight = matrix.apply(new PIXI.Point(size, size));
	// Inject the vector data into a Polygon object to create a closed shape.
	const shape = new PIXI.Polygon([topLeft.x, topLeft.y, topRight.x, topRight.y, botRight.x, botRight.y, botLeft.x, botLeft.y, topLeft.x, topLeft.y]);
	// Add these fields so that the Sequencer mod doesn't have a stroke
	shape.x = topLeft.x;
	shape.y = topLeft.y;
	shape.width = size;
	shape.height = size;
	return shape;
};
//console.log(`${MODULE_ID} | Square template rotation fix applied`);

/**
 * SDX.templates - Template placement and targeting API
 * 
 * Usage:
 *   const template = await SDX.templates.place({ type: "rect", size: 30 });
 *   const tokens = SDX.templates.getTokensInTemplate(template);
 *   const { template, tokens } = await SDX.templates.placeAndTarget({ type: "rect", size: 30, autoDelete: 3000 });
 */
globalThis.SDX = globalThis.SDX || {};

SDX.templates = {
	/**
	 * Interactive template placement
	 * @param {Object} options - Template options
	 * @param {string} options.type - Template type: "rect", "circle", "cone", "ray"
	 * @param {number} options.size - Size in feet
	 * @param {number} [options.width] - Width for cones/rays (defaults to size)
	 * @param {number} [options.angle] - Angle for cones (defaults to 53.13)
	 * @param {string} [options.fillColor] - Fill color (defaults to "#4e9a06")
	 * @param {string} [options.borderColor] - Border color (defaults to "#000000")
	 * @param {number} [options.autoDelete] - Auto-delete template after X milliseconds (e.g., 3000 for 3 seconds)
	 * @param {Object} [options.originFromCaster] - Lock origin to caster position (for cones/rays)
	 * @param {number} options.originFromCaster.x - X coordinate of caster
	 * @param {number} options.originFromCaster.y - Y coordinate of caster
	 * @returns {Promise<MeasuredTemplateDocument|null>} - The placed template or null if cancelled
	 */
	async place(options = {}) {
		const {
			type = "rect",
			size = 30,
			width = null,
			angle = 53.13,
			fillColor = "#4e9a06",
			borderColor = "#000000",
			autoDelete = null,
			originFromCaster = null,
			texture = null,
			textureOpacity = 0.5,
			tmfxPreset = null,
			tmfxTint = null
		} = options;

		// Build template data based on type
		let templateData = {
			t: type,
			user: game.user.id,
			fillColor,
			borderColor,
			angle: 0,
			direction: 0
		};

		// Add texture if provided
		if (texture) {
			templateData.texture = texture;
		}

		// Add TokenMagic flags for effects (uses their template auto-apply system)
		// See: https://github.com/Feu-Secret/Tokenmagic
		if (texture || tmfxPreset) {
			templateData.flags = templateData.flags || {};
			templateData.flags.tokenmagic = templateData.flags.tokenmagic || {};
			templateData.flags.tokenmagic.options = {
				tmfxTextureAlpha: textureOpacity
			};

			// Add preset if specified
			if (tmfxPreset && tmfxPreset !== 'NOFX') {
				templateData.flags.tokenmagic.options.tmfxPreset = tmfxPreset;

				// Add tint if specified (must be a number, not hex string)
				if (tmfxTint) {
					const tintNum = typeof tmfxTint === 'string'
						? parseInt(tmfxTint.replace('#', ''), 16)
						: tmfxTint;
					templateData.flags.tokenmagic.options.tmfxTint = tintNum;
				}
			}
		}

		// Track current direction for rotation
		let currentDirection = 0;

		// Configure based on template type
		switch (type) {
			case "rect":
				// For axis-aligned squares, use diagonal distance at 45 degrees
				templateData.distance = size * Math.SQRT2;
				templateData.direction = 45;
				currentDirection = 45;
				templateData.width = 0;
				break;
			case "circle":
				templateData.distance = size;
				templateData.direction = 0;
				break;
			case "cone":
				templateData.distance = size;
				templateData.direction = 0;
				templateData.angle = angle;
				break;
			case "ray":
				templateData.distance = size;
				templateData.direction = 0;
				templateData.width = width || 5;
				break;
			default:
				templateData.distance = size;
				templateData.direction = 0;
		}

		return new Promise((resolve) => {
			let resolved = false;
			let highlightedTokens = new Set(); // Track highlighted tokens
			let currentElevation = originFromCaster?.elevation || 0; // Track template elevation

			// Create the template document
			const doc = new MeasuredTemplateDocument(templateData, { parent: canvas.scene });

			// Create the template object for preview
			const template = new CONFIG.MeasuredTemplate.objectClass(doc);

			// Add to preview layer and draw
			canvas.templates.preview.addChild(template);
			template.draw();

			// Initial position - use caster position if originFromCaster, otherwise mouse position
			let initialPos;
			if (originFromCaster) {
				initialPos = { x: originFromCaster.x, y: originFromCaster.y };
			} else {
				initialPos = canvas.app.renderer.events.pointer.getLocalPosition(canvas.stage);
			}
			template.document.updateSource({
				x: initialPos.x,
				y: initialPos.y
			});
			template.renderFlags.set({ refresh: true });

			// Throttle token highlighting to 15fps for performance
			let lastHighlightTime = 0;
			const HIGHLIGHT_THROTTLE = 1000 / 15; // 15fps

			// Function to highlight tokens inside the template preview
			const updateTokenHighlighting = () => {
				if (!template.shape) return;

				const tokensInTemplate = new Set();

				// Find all tokens inside the template
				for (const token of canvas.tokens.placeables) {
					// Skip tokens at different elevation
					const tokenElevation = token.document.elevation || 0;
					if (tokenElevation !== currentElevation) continue;

					// Test if token center is inside the template shape
					const localX = token.center.x - template.document.x;
					const localY = token.center.y - template.document.y;

					if (template.shape.contains(localX, localY)) {
						tokensInTemplate.add(token.id);

						// Highlight the token if not already highlighted
						if (!highlightedTokens.has(token.id)) {
							token.setTarget(true, { user: game.user, releaseOthers: false, groupSelection: true });
							highlightedTokens.add(token.id);
						}
					}
				}

				// Remove highlighting from tokens no longer in template
				for (const tokenId of highlightedTokens) {
					if (!tokensInTemplate.has(tokenId)) {
						const token = canvas.tokens.get(tokenId);
						if (token) {
							token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
						}
						highlightedTokens.delete(tokenId);
					}
				}
			};

			// Clear all token highlighting
			const clearTokenHighlighting = () => {
				for (const tokenId of highlightedTokens) {
					const token = canvas.tokens.get(tokenId);
					if (token) {
						token.setTarget(false, { user: game.user, releaseOthers: false, groupSelection: true });
					}
				}
				highlightedTokens.clear();
			};

			// Create elevation indicator text (add to stage, not template)
			const elevationText = new PIXI.Text(`Elevation: ${currentElevation}`, {
				fontFamily: 'Modesto Condensed, Old Newspaper, serif',
				fontSize: 36,
				fontWeight: 'bold',
				fill: 0x000000, // Black text
				stroke: 0xFFFFFF, // White outline
				strokeThickness: 6,
				align: 'center',
				dropShadow: true,
				dropShadowColor: 0x000000,
				dropShadowBlur: 4,
				dropShadowDistance: 2
			});
			elevationText.anchor.set(0.5, 1); // Anchor at bottom center
			elevationText.zIndex = 10000; // Very high z-index to be on top
			canvas.stage.addChild(elevationText);

			// Function to update elevation text position
			const updateElevationTextPosition = () => {
				elevationText.position.set(
					template.document.x,
					template.document.y - 80
				);
			};
			updateElevationTextPosition();

			// Cleanup function
			const cleanup = () => {
				if (resolved) return;
				resolved = true;
				canvas.stage.off("pointermove", onMouseMove);
				canvas.stage.off("pointerdown", onLeftClick);
				canvas.stage.off("rightdown", onRightClick);
				canvas.app.view.removeEventListener("wheel", onWheel);
				document.removeEventListener("keydown", onKeyDown);

				// Remove and destroy elevation text
				if (elevationText && elevationText.parent) {
					canvas.stage.removeChild(elevationText);
					elevationText.destroy({ children: true, texture: true, baseTexture: true });
				}

				if (template.parent) {
					canvas.templates.preview.removeChild(template);
				}
				template.destroy({ children: true });
			};

			// Mouse move handler - update template position (or direction if originFromCaster)
			const onMouseMove = (event) => {
				if (resolved) return;
				const pos = event.getLocalPosition(canvas.stage);

				if (originFromCaster) {
					// Origin is locked - calculate direction from origin to mouse
					const dx = pos.x - originFromCaster.x;
					const dy = pos.y - originFromCaster.y;
					const angle = Math.atan2(dy, dx);
					const degrees = Math.toDegrees(angle);
					currentDirection = degrees;
					template.document.updateSource({ direction: currentDirection });
				} else {
					// Normal mode - follow mouse
					const snapped = canvas.templates.getSnappedPoint(pos);
					template.document.updateSource({ x: snapped.x, y: snapped.y });
				}
				template.renderFlags.set({ refresh: true });

				// Update elevation text position to follow template
				updateElevationTextPosition();

				// Throttled token highlighting
				const now = Date.now();
				if (now - lastHighlightTime >= HIGHLIGHT_THROTTLE) {
					lastHighlightTime = now;
					updateTokenHighlighting();
				}
			};

			// Mouse wheel handler - rotate template when holding Shift, elevation when holding Alt
			// Ctrl = angle snap to 45° increments
			const onWheel = (event) => {
				if (resolved) return;

				// Alt key = elevation control
				if (event.altKey && !event.shiftKey) {
					event.preventDefault();
					event.stopPropagation();

					const sign = Math.sign(event.deltaY);
					currentElevation = Math.max(0, currentElevation - sign); // Invert scroll direction for intuitive up/down

					// Update elevation indicator
					elevationText.text = `Elevation: ${currentElevation}`;

					// Update token highlighting after elevation change
					updateTokenHighlighting();
					return;
				}

				// Shift key = rotation
				if (!event.shiftKey) return;

				event.preventDefault();
				event.stopPropagation();

				// Angle snap mode (Ctrl held) - snap to 45° increments
				// Normal mode - rotate by 5° (or 15° with both Shift+Ctrl)
				let snap;
				if (event.ctrlKey) {
					// Snap to 45° increments (8 positions around the circle)
					snap = 45;
				} else {
					// Fine rotation: 5° per tick
					snap = 5;
				}

				const sign = Math.sign(event.deltaY);

				if (event.ctrlKey) {
					// Angle snap mode - snap to nearest increment
					let direction = currentDirection;
					if (direction < 0) direction += 360;
					direction = direction - (direction % snap);
					if (currentDirection % snap !== 0 && sign < 0)
						direction += snap;
					currentDirection = (direction + (snap * sign)) % 360;
				} else {
					// Normal fine rotation
					currentDirection = (currentDirection + (snap * sign)) % 360;
				}

				if (currentDirection < 0) currentDirection += 360;

				template.document.updateSource({ direction: currentDirection });
				template.renderFlags.set({ refresh: true });

				// Update token highlighting after rotation
				updateTokenHighlighting();
			};

			// Left click handler - place the template
			const onLeftClick = async (event) => {
				if (resolved) return;

				// Only respond to left mouse button (button 0)
				if (event.button !== 0) return;

				// Get final position - use originFromCaster if set, otherwise click position
				let finalX, finalY;
				if (originFromCaster) {
					finalX = originFromCaster.x;
					finalY = originFromCaster.y;
				} else {
					const pos = event.getLocalPosition(canvas.stage);
					const snapped = canvas.templates.getSnappedPoint(pos);
					finalX = snapped.x;
					finalY = snapped.y;
				}

				// Get current direction from the preview template
				const finalDirection = template.document.direction;

				cleanup();

				// Create the actual template document in the scene
				const created = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [{
					...templateData,
					x: finalX,
					y: finalY,
					direction: finalDirection,
					elevation: currentElevation // Store elevation in template
				}]);

				const placedTemplate = created[0];

				// Auto-delete if specified
				if (autoDelete && autoDelete > 0) {
					setTimeout(async () => {
						try {
							if (placedTemplate && canvas.scene.templates.get(placedTemplate.id)) {
								await placedTemplate.delete();
							}
						} catch (e) {
							console.warn(`${MODULE_ID} | Failed to auto-delete template:`, e);
						}
					}, autoDelete);
				}

				resolve(placedTemplate);
			};

			// Right click handler - cancel placement
			const onRightClick = (event) => {
				if (resolved) return;
				event.preventDefault();
				event.stopPropagation();
				clearTokenHighlighting(); // Clear targeting when cancelled
				cleanup();
				ui.notifications.info("Template placement cancelled.");
				resolve(null);
			};

			// Escape key handler - cancel placement
			const onKeyDown = (event) => {
				if (resolved) return;

				if (event.key === "Escape") {
					clearTokenHighlighting(); // Clear targeting when cancelled
					cleanup();
					ui.notifications.info("Template placement cancelled.");
					resolve(null);
				}
			};

			// Key up handler - no longer needed
			const onKeyUp = (event) => {
				// Removed - Alt key is checked directly in wheel handler
			};

			// Attach event listeners
			canvas.stage.on("pointermove", onMouseMove);
			canvas.stage.on("pointerdown", onLeftClick);
			canvas.stage.on("rightdown", onRightClick);
			canvas.app.view.addEventListener("wheel", onWheel, { passive: false });
			document.addEventListener("keydown", onKeyDown);

			ui.notifications.info("Left-click to place | Right-click/Esc to cancel | Shift+Wheel to rotate | Alt+Wheel for elevation");
		});
	},

	/**
	 * Get all tokens inside a template
	 * @param {MeasuredTemplateDocument} templateDoc - The template document
	 * @returns {Token[]} - Array of Token objects inside the template
	 */
	getTokensInTemplate(templateDoc) {
		if (!templateDoc?.object) {
			console.warn(`${MODULE_ID} | getTokensInTemplate: Template object not found`);
			return [];
		}

		const templateObject = templateDoc.object;
		const templateElevation = templateDoc.elevation || 0;

		return canvas.tokens.placeables.filter(t => {
			// Check elevation match
			const tokenElevation = t.document.elevation || 0;
			if (tokenElevation !== templateElevation) return false;

			// Check if token is inside template shape
			return templateObject.testPoint(t.center);
		});
	},

	/**
	 * Place a template and return both the template and tokens inside it
	 * Also targets the tokens automatically
	 * @param {Object} options - Same options as place(), plus:
	 * @param {number} [options.autoDelete] - Auto-delete template after X ms (e.g., 3000)
	 * @returns {Promise<{template: MeasuredTemplateDocument|null, tokens: Token[]}>}
	 */
	async placeAndTarget(options = {}) {
		const template = await this.place(options);

		if (!template) {
			return { template: null, tokens: [] };
		}

		// Wait a tick for the template object to be ready
		await new Promise(r => setTimeout(r, 100));

		const tokens = this.getTokensInTemplate(template);

		// Target the tokens
		for (const token of tokens) {
			token.setTarget(true, { user: game.user, releaseOthers: false });
		}

		return { template, tokens };
	}
};

//console.log(`${MODULE_ID} | SDX.templates API loaded`);

// ============================================
// MODULE API
// Export functions for use in item macros
// ============================================

Hooks.on("setup", () => {
	const module = game.modules.get("shadowdark-extras");
	if (module) {
		module.api = {
			startDurationSpell: startDurationSpell,
			registerSpellModification: registerSpellModification
		};
		//console.log(`${MODULE_ID} | Module API registered`);
	}
});

// ============================================
// PARTY TOKEN LIGHT SYNCHRONIZATION HOOKS
// ============================================

// Sync party light when an item is updated (e.g., light toggled)
Hooks.on("updateItem", async (item, changes, options, userId) => {
	// Only care about light-related changes
	if (!foundry.utils.hasProperty(changes, "system.light")) return;

	// Get the owning actor
	const actor = item.actor;
	if (!actor) return;

	// Find all parties containing this actor
	const parties = getPartiesContainingActor(actor);

	// Sync each party's token lights
	for (const party of parties) {
		await syncPartyTokenLight(party);
	}
});

// Sync party light when party members change
Hooks.on("updateActor", async (actor, changes, options, userId) => {
	// Check if this actor has party members and they changed
	if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.members`)) {
		await syncPartyTokenLight(actor);
	}
});

// Sync party light when party sheet is rendered (delayed to ensure canvas is ready)
Hooks.on("renderActorSheet", async (app, html, data) => {
	// Check if this actor has party members (indicates it's a party)
	const hasMembers = app.actor.getFlag(MODULE_ID, "members");
	if (hasMembers) {
		// Delay sync briefly to ensure canvas is ready
		setTimeout(async () => {
			await syncPartyTokenLight(app.actor);
		}, 100);
	}
});

// Sync party light when party token is placed on scene
Hooks.on("createToken", async (tokenDoc, options, userId) => {
	const actor = tokenDoc.actor;
	if (!actor) return;

	// Check if this is a party token
	const hasMembers = actor.getFlag(MODULE_ID, "members");
	if (hasMembers) {
		// Delay briefly to ensure token is fully created
		setTimeout(async () => {
			await syncPartyTokenLight(actor);
		}, 100);
	}
});

// ============================================
// SPELLBOOK COMPENDIUM FILTER
// ============================================

/**
 * Inject a compendium filter dropdown into the SpellBookSD dialog
 * Allows users to filter spells by compendium
 */
function injectSpellbookCompendiumFilter(app, html) {
	const header = html.find(".SD-header");
	if (!header.length) return;

	// Get all compendiums that contain spells
	const spellPacks = [];
	for (const pack of game.packs) {
		if (pack.metadata.type !== "Item") continue;
		// Check if pack has any spells in its index
		const hasSpells = pack.index.some(i => i.type === "Spell");
		if (hasSpells) {
			spellPacks.push({
				id: pack.collection,
				name: pack.metadata.label
			});
		}
	}

	// Sort packs alphabetically
	spellPacks.sort((a, b) => a.name.localeCompare(b.name));

	// Build the dropdown options
	const allLabel = game.i18n.localize("SHADOWDARK_EXTRAS.spellbook.compendiumFilter.all");
	let optionsHtml = `<option value="">${allLabel}</option>`;
	for (const pack of spellPacks) {
		optionsHtml += `<option value="${pack.id}">${pack.name}</option>`;
	}

	// Create the filter dropdown
	const filterLabel = game.i18n.localize("SHADOWDARK_EXTRAS.spellbook.compendiumFilter.label");
	const filterHtml = `
		<div class="sdx-spellbook-filter">
			<label>${filterLabel}</label>
			<select class="sdx-spellbook-compendium-select">
				${optionsHtml}
			</select>
		</div>
	`;

	// Insert before navigation tabs
	const nav = html.find(".SD-nav");
	if (nav.length) {
		nav.before(filterHtml);
	} else {
		// Fallback: insert after header
		header.after(filterHtml);
	}

	// Add event listener
	const select = html.find(".sdx-spellbook-compendium-select");
	select.on("change", (event) => {
		const selectedCompendium = event.currentTarget.value;
		filterSpellsByCompendium(html, selectedCompendium);
	});
}

/**
 * Filter the spell list by hiding/showing items based on their compendium
 * @param {jQuery} html - The dialog HTML
 * @param {string} compendiumId - The compendium ID to filter by, or empty for all
 */
function filterSpellsByCompendium(html, compendiumId) {
	const spellItems = html.find(".SD-list .item[data-uuid]");

	spellItems.each((index, element) => {
		const $item = $(element);
		const uuid = $item.data("uuid");

		if (!compendiumId) {
			// Show all
			$item.show();
		} else {
			// Check if the UUID starts with the compendium ID
			// UUID format: Compendium.module.pack.itemId
			if (uuid && uuid.startsWith(`Compendium.${compendiumId}`)) {
				$item.show();
			} else {
				$item.hide();
			}
		}
	});

	// Update the count display if needed (future enhancement)
}

// Hook into the SpellBookSD rendering
Hooks.on("renderApplication", (app, html, data) => {
	// Check if this is the SpellBookSD app
	if (app.constructor.name === "SpellBookSD") {
		injectSpellbookCompendiumFilter(app, html);
	}
});

// ============================================
// NPC CARD ENRICHER
// ============================================

// Register the DisplayNpcCard enricher
Hooks.once("ready", () => {
	initAppearanceSettings();
	registerDisplayNpcEnricher();
	registerDisplayTableEnricher();
	registerDisplayItemEnricher();

	// Initialize Easy Reference ProseMirror menu
	initEasyReferenceMenu();

	// Initialize Token Toolbar
	initTokenToolbar();

	// Global listener for @DisplayTable roll buttons
	$(document).on("click", ".sdx-table-roll-btn", async (event) => {
		event.preventDefault();
		const container = $(event.currentTarget).closest(".sdx-display-table-container");
		const uuid = container.data("table-uuid");
		if (!uuid) return;

		const table = fromUuidSync(uuid) || await fromUuid(uuid);
		if (table) {
			table.draw();
		}
	});


	// ============================================
	// ALIGNMENT-BASED SPELL FILTERING
	// ============================================

	// We can't replace the class due to read-only property, so we'll use a different approach:
	// Store alignment in a WeakMap and use hooks to set it
	const spellbookAlignments = new WeakMap();

	// Hook to capture when SpellBookSD is rendered and store alignment
	Hooks.on("renderSpellBookSD", (app, html, data) => {
		// The alignment should already be stored via our custom openSpellBook
		const alignment = spellbookAlignments.get(app);
		if (alignment) {
			app.alignment = alignment;
		}
	});

	// Patch SpellBookSD.getData() to filter spells by alignment
	const originalGetData = shadowdark.apps.SpellBookSD.prototype.getData;

	shadowdark.apps.SpellBookSD.prototype.getData = async function () {
		const data = await originalGetData.call(this);

		//console.log(`${MODULE_ID} | SpellBook getData called`);
		//console.log(`${MODULE_ID} | Actor alignment:`, this.alignment);
		//console.log(`${MODULE_ID} | Has spellList:`, !!data.spellList);

		// Filter spells by alignment if alignment is set
		if (this.alignment && data.spellList) {
			//console.log(`${MODULE_ID} | Filtering spells by alignment: ${this.alignment}`);

			for (const tier in data.spellList) {
				const originalCount = data.spellList[tier].length;
				//console.log(`${MODULE_ID} | Tier ${tier} - Original spell count:`, originalCount);

				// We need to load full spell documents to get flags
				// Compendium index doesn't include flags
				const spellsWithFlags = await Promise.all(
					data.spellList[tier].map(async (spell) => {
						// Load full document to get flags
						const fullSpell = await fromUuid(spell.uuid);
						return fullSpell || spell; // Fallback to original if load fails
					})
				);

				// Log first spell to see structure
				if (spellsWithFlags.length > 0) {
					const sample = spellsWithFlags[0];
					//console.log(`${MODULE_ID} | Sample spell from tier ${tier} (after loading):`, {
					//	name: sample.name,
					//	uuid: sample.uuid,
					//	hasFlags: !!sample.flags,
					//	flagKeys: sample.flags ? Object.keys(sample.flags) : 'no flags',
					//	sdxFlags: sample.flags?.[MODULE_ID],
					//	alignment: sample.flags?.[MODULE_ID]?.alignment
					//});
				}

				// Filter spells based on alignment
				data.spellList[tier] = spellsWithFlags.filter(spell => {
					const spellAlignment = spell.flags?.[MODULE_ID]?.alignment;
					const shouldShow = !spellAlignment || spellAlignment === this.alignment;

					// Log filtering decisions for spells with alignment
					if (spellAlignment) {
						//console.log(`${MODULE_ID} | Spell "${spell.name}" has alignment "${spellAlignment}", actor is "${this.alignment}" - ${shouldShow ? 'SHOW' : 'HIDE'}`);
					}

					return shouldShow;
				});

				const filteredCount = data.spellList[tier].length;
				//console.log(`${MODULE_ID} | Tier ${tier} - Filtered spell count:`, filteredCount, `(removed ${originalCount - filteredCount})`);
			}
		} else {
			//console.log(`${MODULE_ID} | No filtering applied - alignment: "${this.alignment}", has spellList: ${!!data.spellList}`);
		}

		return data;
	};

	// Patch ActorSD.openSpellBook() to pass alignment to SpellBookSD
	const originalOpenSpellBook = CONFIG.Actor.documentClass.prototype.openSpellBook;

	CONFIG.Actor.documentClass.prototype.openSpellBook = async function () {
		const playerSpellcasterClasses = await this.getSpellcasterClasses();
		const actorAlignment = this.system.alignment || '';


		//console.log(`${MODULE_ID} | Opening spellbook for actor: ${this.name}`);
		//console.log(`${MODULE_ID} | Actor alignment: "${actorAlignment}"`);
		//console.log(`${MODULE_ID} | Spellcaster classes:`, playerSpellcasterClasses.map(c => c.name));

		const openChosenSpellbook = classUuid => {
			//console.log(`${MODULE_ID} | Creating SpellBookSD with alignment: "${actorAlignment}"`);
			const app = new shadowdark.apps.SpellBookSD(
				classUuid,
				this.id
			);
			// Store alignment directly on the app instance
			app.alignment = actorAlignment;
			// Also store in WeakMap as backup
			spellbookAlignments.set(app, actorAlignment);
			app.render(true);
		};

		if (playerSpellcasterClasses.length <= 0) {
			return ui.notifications.error(
				game.i18n.localize("SHADOWDARK.item.errors.no_spellcasting_classes"),
				{ permanent: false }
			);
		}
		else if (playerSpellcasterClasses.length === 1) {
			return openChosenSpellbook(playerSpellcasterClasses[0].uuid);
		}
		else {
			return foundry.applications.handlebars.renderTemplate(
				"systems/shadowdark/templates/dialog/choose-spellbook.hbs",
				{ classes: playerSpellcasterClasses }
			).then(html => {
				const dialog = new Dialog({
					title: game.i18n.localize("SHADOWDARK.dialog.spellbook.open_which_class.title"),
					content: html,
					buttons: {},
					render: html => {
						html.find("[data-action='open-class-spellbook']").click(
							event => {
								event.preventDefault();
								openChosenSpellbook(event.currentTarget.dataset.uuid);
								dialog.close();
							}
						);
					},
				}).render(true);
			});
		}
	};

	//console.log(`${MODULE_ID} | Alignment-based spell filtering initialized`);
});

// ===================================================================
// SOURCE REQUIREMENTS FOR ACTIVE EFFECTS
// ===================================================================

/**
 * Safely evaluates a source requirement expression
 * @param {string} requirement - JavaScript expression to evaluate
 * @param {Actor} actor - The actor being evaluated
 * @param {Token} token - The token being evaluated (if available)
 * @returns {Promise<boolean>} - Whether the requirement is met
 */
async function evaluateSourceRequirement(requirement, actor, token = null, sourceEffect = null) {
	// Check if the effect requires the parent item to be equipped
	if (sourceEffect) {
		const requireEquipped = sourceEffect.getFlag(MODULE_ID, "requireEquipped");
		if (requireEquipped) {
			// Check if the effect's parent is an Item
			const parentItem = sourceEffect.parent;
			if (parentItem && parentItem instanceof Item) {
				// Check if the item has an equipped property
				const isEquipped = parentItem.system?.equipped;
				//console.log(`${MODULE_ID} | Effect "${sourceEffect.name}" requires equipped. Item "${parentItem.name}" equipped: ${isEquipped}`);

				// If not equipped, the requirement is not met
				if (!isEquipped) {
					//console.log(`${MODULE_ID} | Effect "${sourceEffect.name}" requirement NOT MET - item not equipped`);
					return false;
				}
			}
		}
	}

	if (!requirement || requirement.trim() === "") return true;

	try {
		// Resolve Compendium UUIDs to get actual names/keys
		let ancestryName = "";
		let className = "";
		let backgroundName = "";

		// Resolve ancestry
		if (actor?.system?.ancestry) {
			try {
				const ancestryDoc = await fromUuid(actor.system.ancestry);
				if (ancestryDoc) {
					ancestryName = ancestryDoc.name?.toLowerCase() ?? "";
				}
			} catch (e) {
				console.warn(`${MODULE_ID} | Could not resolve ancestry UUID`);
			}
		}

		// Resolve class
		if (actor?.system?.class) {
			try {
				const classDoc = await fromUuid(actor.system.class);
				if (classDoc) {
					className = classDoc.name?.toLowerCase() ?? "";
				}
			} catch (e) {
				console.warn(`${MODULE_ID} | Could not resolve class UUID`);
			}
		}

		// Resolve background
		if (actor?.system?.background) {
			try {
				const backgroundDoc = await fromUuid(actor.system.background);
				if (backgroundDoc) {
					backgroundName = backgroundDoc.name?.toLowerCase() ?? "";
				}
			} catch (e) {
				console.warn(`${MODULE_ID} | Could not resolve background UUID`);
			}
		}

		// Create a safe evaluation context
		const context = {
			actor: actor,
			token: token,
			// Add commonly used shortcuts
			level: actor?.system?.level?.value ?? 0,
			attributes: actor?.system?.attributes ?? {},
			abilities: actor?.system?.abilities ?? {},
			// Add shortcuts with resolved names (lowercase for easy matching)
			ancestry: ancestryName,
			charClass: className,
			background: backgroundName,
			alignment: (actor?.system?.alignment ?? "").toLowerCase(),
		};

		//console.log(`${MODULE_ID} | Evaluating requirement: "${requirement}"`);
		//console.log(`${MODULE_ID} | Actor: ${actor.name} (Level ${context.level})`);
		//console.log(`${MODULE_ID} | Resolved names - ancestry: "${context.ancestry}", class: "${context.charClass}", background: "${context.background}", alignment: "${context.alignment}"`);

		// Use Function constructor for safer evaluation than eval
		const fn = new Function(...Object.keys(context), `return ${requirement};`);
		const result = fn(...Object.values(context));

		//console.log(`${MODULE_ID} | Requirement "${requirement}" evaluated to: ${result}`);

		return Boolean(result);
	} catch (error) {
		console.error(`${MODULE_ID} | Error evaluating source requirement "${requirement}":`, error);
		return false;
	}
}

/**
 * Hook to add Source Requirement field to Active Effect config
 */
Hooks.on("renderActiveEffectConfig", (app, html, data) => {
	// Try multiple ways to get the effect - app.object might be undefined for new effects
	const effect = app.object || app.document || data.effect;

	// Guard: ensure effect exists
	if (!effect) {
		console.warn(`${MODULE_ID} | renderActiveEffectConfig: Could not find effect document`);
		return;
	}

	const currentRequirement = effect.getFlag?.(MODULE_ID, "sourceRequirement") || "";
	// Escape HTML entities for safe insertion into HTML attribute
	const escapedRequirement = currentRequirement.replace(/"/g, '&quot;').replace(/'/g, '&#39;');

	// Get the requireEquipped flag
	const requireEquipped = effect.getFlag?.(MODULE_ID, "requireEquipped") || false;

	// Ensure html is a jQuery object
	const $html = html instanceof jQuery ? html : $(html);

	// Find the Status Conditions section - it's a div.form-group.statuses
	const statusConditions = $html.find('.form-group.statuses');

	// Build the HTML for the require equipped checkbox
	const requireEquippedHtml = `
		<div class="form-group sdx-require-equipped">
			<label>Must be Equipped</label>
			<input type="checkbox" name="flags.${MODULE_ID}.requireEquipped" ${requireEquipped ? 'checked' : ''}/>
			<p class="hint">If checked, this Effect will be applied to any Actor that owns this Effect's parent Item only if the Item is equipped.</p>
		</div>
	`;

	// Build the HTML for the source requirement field
	const fieldHtml = `
		<div class="form-group sdx-source-requirement">
			<label>${game.i18n.localize("SHADOWDARK_EXTRAS.effects.sourceRequirement")}</label>
			<div class="form-fields">
				<input type="text" name="flags.${MODULE_ID}.sourceRequirement" value="${escapedRequirement}"
					placeholder="e.g., level > 3"
					title="${game.i18n.localize("SHADOWDARK_EXTRAS.effects.sourceRequirementHint")}"/>
			</div>
			<p class="hint">${game.i18n.localize("SHADOWDARK_EXTRAS.effects.sourceRequirementHint")}</p>
			<details class="sdx-requirement-examples">
				<summary><i class="fas fa-info-circle"></i> Valid Requirement Examples</summary>
				<div class="examples-content">
					<p><strong>Level Requirements:</strong></p>
					<ul>
						<li><code>level > 3</code> - Character level greater than 3</li>
						<li><code>level >= 5</code> - Character level 5 or higher</li>
						<li><code>level === 1</code> - Exactly level 1</li>
					</ul>

					<p><strong>Hit Points Requirements:</strong></p>
					<ul>
						<li><code>actor.system.attributes.hp.value > 10</code> - Current HP greater than 10</li>
						<li><code>actor.system.attributes.hp.value >= actor.system.attributes.hp.max / 2</code> - At least half HP</li>
						<li><code>actor.system.attributes.hp.value < 5</code> - Bloodied (less than 5 HP)</li>
						<li><code>actor.system.attributes.hp.max >= 20</code> - Maximum HP 20 or higher</li>
					</ul>

					<p><strong>Attribute Requirements:</strong></p>
					<ul>
						<li><code>attributes.str.value >= 14</code> - Strength 14 or higher</li>
						<li><code>attributes.dex.value > 12</code> - Dexterity greater than 12</li>
						<li><code>attributes.con.value >= 16</code> - Constitution 16 or higher</li>
					</ul>

					<p><strong>Ability Modifier Requirements:</strong></p>
					<ul>
						<li><code>abilities.str.mod >= 2</code> - Strength modifier +2 or higher</li>
						<li><code>abilities.dex.mod > 0</code> - Positive Dexterity modifier</li>
						<li><code>abilities.int.mod >= 3</code> - Intelligence modifier +3 or higher</li>
					</ul>

					<p><strong>Ancestry Requirements:</strong></p>
					<ul>
						<li><code>ancestry === "elf"</code> - Is an elf</li>
						<li><code>ancestry === "dwarf"</code> - Is a dwarf</li>
						<li><code>ancestry === "halfling"</code> - Is a halfling</li>
						<li><code>ancestry === "human"</code> - Is a human</li>
						<li><code>ancestry.includes("goblin")</code> - Name includes "goblin" (for variations)</li>
					</ul>

					<p><strong>Class Requirements:</strong></p>
					<ul>
						<li><code>charClass === "fighter"</code> - Is a fighter</li>
						<li><code>charClass === "wizard"</code> - Is a wizard</li>
						<li><code>charClass === "cleric"</code> - Is a cleric</li>
						<li><code>charClass === "thief"</code> - Is a thief</li>
						<li><code>charClass.includes("ranger")</code> - Class name includes "ranger" (for variations)</li>
					</ul>

					<p><strong>Background Requirements:</strong></p>
					<ul>
						<li><code>background === "urchin"</code> - Urchin background</li>
						<li><code>background === "merchant"</code> - Merchant background</li>
						<li><code>background.includes("soldier")</code> - Background includes "soldier"</li>
					</ul>

					<p><strong>Alignment Requirements:</strong></p>
					<ul>
						<li><code>alignment === "lawful"</code> - Lawful alignment</li>
						<li><code>alignment === "neutral"</code> - Neutral alignment</li>
						<li><code>alignment === "chaotic"</code> - Chaotic alignment</li>
					</ul>

					<p><strong>Item Ownership Requirements:</strong></p>
					<ul>
						<li><code>actor.items.some(i => i.name === "Sword of Light")</code> - Has "Sword of Light"</li>
						<li><code>actor.items.some(i => i.name.includes("Sword"))</code> - Has any item with "Sword" in name</li>
						<li><code>actor.items.some(i => i.type === "Weapon" && i.name.includes("Magic"))</code> - Has magic weapon</li>
						<li><code>actor.items.some(i => i.type === "Armor" && i.system.equipped)</code> - Has equipped armor</li>
						<li><code>actor.items.filter(i => i.type === "Spell").length >= 3</code> - Has 3 or more spells</li>
					</ul>

					<p><strong>Combined Requirements (AND/OR):</strong></p>
					<ul>
						<li><code>level >= 5 && abilities.str.mod >= 2</code> - Level 5+ AND Str +2+</li>
						<li><code>attributes.str.value >= 16 || attributes.dex.value >= 16</code> - Str 16+ OR Dex 16+</li>
						<li><code>level > 3 && charClass === "wizard"</code> - Level 3+ wizard</li>
						<li><code>actor.items.some(i => i.name === "Holy Symbol") && charClass === "cleric"</code> - Cleric with holy symbol</li>
						<li><code>ancestry === "elf" && abilities.int.mod > 0</code> - Elf with positive Int modifier</li>
						<li><code>alignment === "lawful" && charClass === "cleric"</code> - Lawful cleric</li>
					</ul>

					<p><strong>Token Requirements (if token exists):</strong></p>
					<ul>
						<li><code>token?.elevation > 0</code> - Token is elevated</li>
						<li><code>token?.disposition === 1</code> - Friendly token</li>
					</ul>

					<p class="notes"><strong>Available Variables:</strong> <code>actor</code>, <code>token</code>, <code>level</code>, <code>attributes</code>, <code>abilities</code>, <code>ancestry</code>, <code>charClass</code>, <code>background</code>, <code>alignment</code><br><br><strong>Note:</strong> <code>ancestry</code>, <code>charClass</code>, <code>background</code>, and <code>alignment</code> are automatically resolved from Compendium UUIDs to lowercase names (e.g., "wizard", "elf", "chaotic").</p>
				</div>
			</details>
		</div>
	`;

	// Insert after Status Conditions if found, otherwise at the end of the details tab
	if (statusConditions.length > 0) {
		statusConditions.after(requireEquippedHtml + fieldHtml);
	} else {
		// Fallback: insert at the end of the details tab
		const detailsTab = $html.find('section[data-tab="details"]');
		if (detailsTab.length > 0) {
			detailsTab.append(requireEquippedHtml + fieldHtml);
		}
	}

	// Intercept form submission to save the source requirement
	const form = $html.closest('form');
	if (form.length > 0) {
		// Store the original submit method
		const originalSubmit = form[0].onsubmit;

		form.on('submit', async (event) => {
			// Get the requirement value
			const requirementInput = $html.find(`input[name="flags.${MODULE_ID}.sourceRequirement"]`);
			if (requirementInput.length > 0) {
				const newRequirement = requirementInput.val()?.trim() || "";
				//console.log(`${MODULE_ID} | Form submitting, will save requirement: "${newRequirement}"`);

				// Store it in a temp variable on the effect to be picked up by preUpdate hook
				effect._pendingSourceRequirement = newRequirement;
			}

			// Get the requireEquipped checkbox value
			const requireEquippedInput = $html.find(`input[name="flags.${MODULE_ID}.requireEquipped"]`);
			if (requireEquippedInput.length > 0) {
				const newRequireEquipped = requireEquippedInput.is(':checked');
				//console.log(`${MODULE_ID} | Form submitting, will save requireEquipped: ${newRequireEquipped}`);

				// Store it in a temp variable on the effect to be picked up by preUpdate hook
				effect._pendingRequireEquipped = newRequireEquipped;
			}
		});
	}

	// Adjust app height to accommodate new field
	app.setPosition({ height: "auto" });
});

/**
 * Hook to save the source requirement when effect is updated
 */
Hooks.on("preUpdateActiveEffect", (effect, changes, options, userId) => {
	//console.log(`${MODULE_ID} | preUpdateActiveEffect fired for effect: ${effect.name}`);

	// Check if there's a pending source requirement from the form
	if (effect._pendingSourceRequirement !== undefined) {
		//console.log(`${MODULE_ID} | Found pending requirement: "${effect._pendingSourceRequirement}"`);

		// Merge the requirement into the changes
		if (!changes.flags) changes.flags = {};
		if (!changes.flags[MODULE_ID]) changes.flags[MODULE_ID] = {};
		changes.flags[MODULE_ID].sourceRequirement = effect._pendingSourceRequirement;

		// Clean up the temp variable
		delete effect._pendingSourceRequirement;

		//console.log(`${MODULE_ID} | Merged requirement into update: "${changes.flags[MODULE_ID].sourceRequirement}"`);
	}

	// Check if there's a pending requireEquipped from the form
	if (effect._pendingRequireEquipped !== undefined) {
		//console.log(`${MODULE_ID} | Found pending requireEquipped: ${effect._pendingRequireEquipped}`);

		// Merge the requireEquipped into the changes
		if (!changes.flags) changes.flags = {};
		if (!changes.flags[MODULE_ID]) changes.flags[MODULE_ID] = {};
		changes.flags[MODULE_ID].requireEquipped = effect._pendingRequireEquipped;

		// Clean up the temp variable
		delete effect._pendingRequireEquipped;

		//console.log(`${MODULE_ID} | Merged requireEquipped into update: ${changes.flags[MODULE_ID].requireEquipped}`);
	}

	// Check if there's a flags update with our source requirement
	if (changes.flags?.[MODULE_ID]?.sourceRequirement !== undefined) {
		//console.log(`${MODULE_ID} | preUpdateActiveEffect: Saving requirement "${changes.flags[MODULE_ID].sourceRequirement}"`);
	}

	// Check if there's a flags update with our requireEquipped
	if (changes.flags?.[MODULE_ID]?.requireEquipped !== undefined) {
		//console.log(`${MODULE_ID} | preUpdateActiveEffect: Saving requireEquipped ${changes.flags[MODULE_ID].requireEquipped}`);
	}
});

/**
 * Hook to check requirements after effect is updated
 */
Hooks.on("updateActiveEffect", async (effect, changes, options, userId) => {
	//console.log(`${MODULE_ID} | updateActiveEffect hook fired for effect: ${effect.name}`);
	//console.log(`${MODULE_ID} | Effect parent type: ${effect.parent?.constructor?.name}`);
	//console.log(`${MODULE_ID} | Effect saved requirement: "${effect.getFlag(MODULE_ID, "sourceRequirement")}"`);

	if (userId !== game.user.id) return;

	// If user manually toggled the disabled state, handle one-directional override
	if (changes.disabled !== undefined && !options.byRequirementSystem) {
		const requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
		if (requirement && requirement.trim() !== "") {
			// Get the actor to evaluate requirements
			const parent = effect.parent;
			const actor = (parent instanceof Item) ? parent.parent : parent;

			if (actor && actor instanceof Actor) {
				const token = actor.token?.object || actor.getActiveTokens()[0];
				const requirementMet = await evaluateSourceRequirement(requirement, actor, token, effect);

				// Only allow manual override when DISABLING an effect that meets requirements
				if (requirementMet && changes.disabled === true) {
					//console.log(`${MODULE_ID} | User manually disabled effect "${effect.name}" (requirements met), setting manual override`);
					await effect.setFlag(MODULE_ID, "manualOverride", true);
				} else if (!requirementMet && changes.disabled === false) {
					// Requirements not met, user trying to enable - block it
					//console.log(`${MODULE_ID} | Cannot enable effect "${effect.name}" - requirements not met: ${requirement}`);
					ui.notifications.warn(game.i18n.format("SHADOWDARK_EXTRAS.effects.requirementNotMet", {
						name: effect.name,
						requirement: requirement
					}));
					// Prevent the enable by re-disabling
					setTimeout(() => {
						effect.update({ disabled: true }, { byRequirementSystem: true });
					}, 0);
				}
			}
		}
	}

	// If the source requirement was updated, check it immediately
	if (changes.flags?.[MODULE_ID]?.sourceRequirement !== undefined) {
		const parent = effect.parent;
		//console.log(`${MODULE_ID} | Source requirement was updated to: "${changes.flags[MODULE_ID].sourceRequirement}"`);

		// Clear manual override when requirement changes
		if (effect.getFlag(MODULE_ID, "manualOverride") !== undefined) {
			await effect.unsetFlag(MODULE_ID, "manualOverride");
		}

		// Check if parent is an item (meaning this is a transferred effect)
		if (parent && parent instanceof Item) {
			//console.log(`${MODULE_ID} | Effect is on an Item, checking the item's actor`);
			const actor = parent.parent;
			if (actor && actor instanceof Actor) {
				//console.log(`${MODULE_ID} | Checking requirements on actor: ${actor.name}`);

				// Add a delay to ensure transferred effects are updated
				setTimeout(async () => {
					await checkEffectRequirements(actor);
				}, 100);
			}
		} else if (parent && parent instanceof Actor) {
			//console.log(`${MODULE_ID} | Effect is directly on an Actor`);
			await checkEffectRequirements(parent);
		}
	}

	// If the requireEquipped flag was updated, check it immediately
	if (changes.flags?.[MODULE_ID]?.requireEquipped !== undefined) {
		const parent = effect.parent;
		//console.log(`${MODULE_ID} | requireEquipped was updated to: ${changes.flags[MODULE_ID].requireEquipped}`);

		// Clear manual override when requireEquipped changes
		if (effect.getFlag(MODULE_ID, "manualOverride") !== undefined) {
			await effect.unsetFlag(MODULE_ID, "manualOverride");
		}

		// Check if parent is an item (meaning this is a transferred effect)
		if (parent && parent instanceof Item) {
			//console.log(`${MODULE_ID} | Effect is on an Item, checking the item's actor`);
			const actor = parent.parent;
			if (actor && actor instanceof Actor) {
				//console.log(`${MODULE_ID} | Checking requirements on actor: ${actor.name}`);

				// Add a delay to ensure transferred effects are updated
				setTimeout(async () => {
					await checkEffectRequirements(actor);
				}, 100);
			}
		} else if (parent && parent instanceof Actor) {
			//console.log(`${MODULE_ID} | Effect is directly on an Actor`);
			await checkEffectRequirements(parent);
		}
	}
});

/**
 * Check and update effect disabled state based on requirements
 */
async function checkEffectRequirements(actor) {
	//console.log(`${MODULE_ID} | checkEffectRequirements called for actor: ${actor.name}`);
	//console.log(`${MODULE_ID} | Total effects on actor: ${actor.effects.size}`);
	//console.log(`${MODULE_ID} | Total items on actor: ${actor.items.size}`);

	// Debug: log all effects and their flags
	for (const effect of actor.effects) {
		const requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
		const origin = effect.origin || "Unknown";
		const isTransferred = effect.transfer;
		//console.log(`${MODULE_ID} | Effect "${effect.name}" (origin: ${origin}, transferred: ${isTransferred}) - requirement: "${requirement}" - flags:`, effect.flags);
	}

	const effectsToCheck = [];

	// Check effects directly on the actor
	for (const effect of actor.effects) {
		let requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
		let requireEquipped = effect.getFlag(MODULE_ID, "requireEquipped");
		let sourceEffect = effect;

		// If this is a transferred effect and it doesn't have a requirement, check the source item
		if ((!requirement && !requireEquipped) && effect.origin) {
			try {
				// Parse the origin to get the source document
				const originDoc = await fromUuid(effect.origin);
				if (originDoc && originDoc instanceof ActiveEffect) {
					requirement = originDoc.getFlag(MODULE_ID, "sourceRequirement");
					requireEquipped = originDoc.getFlag(MODULE_ID, "requireEquipped");
					sourceEffect = originDoc;
					//console.log(`${MODULE_ID} | Effect "${effect.name}" is transferred, checking source effect for requirement: "${requirement}", requireEquipped: ${requireEquipped}`);
				}
			} catch (err) {
				//console.log(`${MODULE_ID} | Could not resolve origin for effect "${effect.name}"`);
			}
		}

		// Add to check list if it has a requirement or requireEquipped
		if ((requirement && requirement.trim() !== "") || requireEquipped) {
			effectsToCheck.push({ effect, sourceEffect, requirement });
		}
	}

	// Also check effects on items owned by the actor
	//console.log(`${MODULE_ID} | Checking effects on actor's items...`);
	for (const item of actor.items) {
		for (const effect of item.effects) {
			const requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
			const requireEquipped = effect.getFlag(MODULE_ID, "requireEquipped");
			if ((requirement && requirement.trim() !== "") || requireEquipped) {
				//console.log(`${MODULE_ID} | Found effect "${effect.name}" on item "${item.name}" with requirement: "${requirement}", requireEquipped: ${requireEquipped}`);
				// For item effects, we need to check if they transfer
				if (effect.transfer) {
					effectsToCheck.push({ effect: effect, sourceEffect: effect, requirement });
				}
			}
		}
	}

	//console.log(`${MODULE_ID} | Found ${effectsToCheck.length} effects with requirements`);

	if (effectsToCheck.length === 0) return;

	const token = actor.token?.object || actor.getActiveTokens()[0];

	for (const { effect, sourceEffect, requirement } of effectsToCheck) {
		//console.log(`${MODULE_ID} | Checking effect "${effect.name}" (currently disabled: ${sourceEffect.disabled})`);

		// Check for manual override
		const manualOverride = sourceEffect.getFlag(MODULE_ID, "manualOverride");
		if (manualOverride !== undefined && manualOverride !== null) {
			//console.log(`${MODULE_ID} | Effect "${effect.name}" has manual override (disabled: ${manualOverride}), skipping automatic requirement check`);
			continue;
		}

		const requirementMet = await evaluateSourceRequirement(requirement, actor, token, sourceEffect);

		// Toggle the SOURCE effect's disabled state (this will propagate to transferred effects)
		// Use the byRequirementSystem option to distinguish from manual changes
		if (requirementMet && sourceEffect.disabled) {
			//console.log(`${MODULE_ID} | ENABLING effect "${effect.name}" - requirement met: ${requirement}`);
			await sourceEffect.update({ disabled: false }, { byRequirementSystem: true });
		} else if (!requirementMet && !sourceEffect.disabled) {
			//console.log(`${MODULE_ID} | DISABLING effect "${effect.name}" - requirement not met: ${requirement}`);
			await sourceEffect.update({ disabled: true }, { byRequirementSystem: true });
		} else {
			//console.log(`${MODULE_ID} | Effect "${effect.name}" already in correct state (disabled: ${sourceEffect.disabled}, requirement met: ${requirementMet})`);
		}
	}
}

/**
 * Hook to check requirements when effect is created
 */
Hooks.on("createActiveEffect", async (effect, options, userId) => {
	//console.log(`${MODULE_ID} | createActiveEffect hook fired for effect: ${effect.name}`);

	if (userId !== game.user.id) {
		//console.log(`${MODULE_ID} | Skipping - not our user (userId: ${userId}, game.user.id: ${game.user.id})`);
		return;
	}

	const requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
	const requireEquipped = effect.getFlag(MODULE_ID, "requireEquipped");
	//console.log(`${MODULE_ID} | Effect requirement: "${requirement}", requireEquipped: ${requireEquipped}`);

	if ((!requirement || requirement.trim() === "") && !requireEquipped) {
		//console.log(`${MODULE_ID} | No requirement or requireEquipped set for this effect`);
		return;
	}

	const actor = effect.parent;
	if (!actor || !(actor instanceof Actor)) {
		//console.log(`${MODULE_ID} | No valid actor parent found`);
		return;
	}

	const token = actor.token?.object || actor.getActiveTokens()[0];
	const requirementMet = await evaluateSourceRequirement(requirement, actor, token, effect);

	if (!requirementMet && !effect.disabled) {
		//console.log(`${MODULE_ID} | DISABLING newly created effect "${effect.name}" - requirement not met: ${requirement}`);
		await effect.update({ disabled: true }, { byRequirementSystem: true });
	} else {
		//console.log(`${MODULE_ID} | Effect "${effect.name}" - requirementMet: ${requirementMet}, already disabled: ${effect.disabled}`);
	}
});

/**
 * Hook to check requirements when actor is prepared
 */
Hooks.on("prepareActorData", async (actor) => {
	// Check requirements synchronously by just checking the disabled state
	const effectsWithRequirements = actor.effects.filter(e =>
		e.getFlag(MODULE_ID, "sourceRequirement") || e.getFlag(MODULE_ID, "requireEquipped")
	);

	if (effectsWithRequirements.length === 0) return;

	//console.log(`${MODULE_ID} | prepareActorData hook - Actor: ${actor.name}, Effects with requirements or requireEquipped: ${effectsWithRequirements.length}`);

	const token = actor.token?.object || actor.getActiveTokens()[0];

	for (const effect of effectsWithRequirements) {
		const requirement = effect.getFlag(MODULE_ID, "sourceRequirement");
		const requirementMet = await evaluateSourceRequirement(requirement, actor, token, effect);

		// If requirement not met and effect is not disabled, we need to update it
		// But we can't do async updates here, so we'll just log it
		// Check for manual override
		const manualOverride = effect.getFlag(MODULE_ID, "manualOverride");
		if (manualOverride !== undefined && manualOverride !== null) {
			//console.log(`${MODULE_ID} | [prepareActorData] Effect "${effect.name}" has manual override, skipping`);
			continue;
		}

		if (!requirementMet && !effect.disabled) {
			//console.log(`${MODULE_ID} | [prepareActorData] Effect "${effect.name}" should be disabled - requirement not met: ${requirement}`);
			// Queue an update for next tick
			setTimeout(() => {
				if (!effect.disabled) {
					//console.log(`${MODULE_ID} | [setTimeout] DISABLING effect "${effect.name}"`);
					effect.update({ disabled: true }, { byRequirementSystem: true });
				}
			}, 0);
		} else if (requirementMet && effect.disabled) {
			//console.log(`${MODULE_ID} | [prepareActorData] Effect "${effect.name}" should be enabled - requirement met: ${requirement}`);
			// Queue an update for next tick
			setTimeout(() => {
				if (effect.disabled) {
					//console.log(`${MODULE_ID} | [setTimeout] ENABLING effect "${effect.name}"`);
					effect.update({ disabled: false }, { byRequirementSystem: true });
				}
			}, 0);
		} else {
			//console.log(`${MODULE_ID} | [prepareActorData] Effect "${effect.name}" already in correct state (disabled: ${effect.disabled}, req met: ${requirementMet})`);
		}
	}
});

/**
 * Hook to update effects when actor data changes (e.g., level up)
 * This re-evaluates effects to see if requirements are now met or unmet
 */
Hooks.on("updateActor", async (actor, changes, options, userId) => {
	//console.log(`${MODULE_ID} | updateActor hook fired for actor: ${actor.name}`);

	// Only process on the user who made the update
	if (userId !== game.user.id) {
		//console.log(`${MODULE_ID} | Skipping - not our user`);
		return;
	}

	await checkEffectRequirements(actor);
});

/**
 * Hook to check requirements when actor sheet is rendered
 * This ensures requirements are enforced when viewing the sheet
 */
Hooks.on("renderActorSheet", async (app, html, data) => {
	const actor = app.actor;
	//console.log(`${MODULE_ID} | renderActorSheet hook fired for actor: ${actor?.name}`);

	if (!actor) return;

	// Check requirements after a short delay to ensure data is fully prepared
	setTimeout(async () => {
		//console.log(`${MODULE_ID} | [renderActorSheet setTimeout] Checking requirements for ${actor.name}`);
		await checkEffectRequirements(actor);
	}, 100);
});

/**
 * Hook to check requirements when an item is added to an actor
 * This ensures transferred items have their effect requirements checked on the new actor
 */
Hooks.on("createItem", async (item, options, userId) => {
	//console.log(`${MODULE_ID} | createItem hook fired for item: ${item.name}`);

	if (userId !== game.user.id) return;

	// Check if this item belongs to an actor
	const actor = item.parent;
	if (!actor || !(actor instanceof Actor)) {
		//console.log(`${MODULE_ID} | Item not owned by an actor, skipping`);
		return;
	}

	// Check if this item has any effects with requirements
	const effectsWithRequirements = item.effects.filter(e => {
		const requirement = e.getFlag(MODULE_ID, "sourceRequirement");
		return requirement && requirement.trim() !== "";
	});

	if (effectsWithRequirements.length === 0) {
		//console.log(`${MODULE_ID} | Item has no effects with requirements, skipping`);
		return;
	}

	//console.log(`${MODULE_ID} | Item "${item.name}" has ${effectsWithRequirements.length} effect(s) with requirements, checking requirements for new owner: ${actor.name}`);

	// Clear manual override flags on transferred item effects
	// The override was for the previous actor, not this new owner
	for (const effect of effectsWithRequirements) {
		const hasOverride = effect.getFlag(MODULE_ID, "manualOverride");
		if (hasOverride !== undefined && hasOverride !== null) {
			//console.log(`${MODULE_ID} | Clearing manual override flag on transferred effect "${effect.name}"`);
			await effect.unsetFlag(MODULE_ID, "manualOverride");
		}
	}

	// Check requirements after a delay to ensure transferred effects are fully created
	setTimeout(async () => {
		await checkEffectRequirements(actor);
	}, 100);
});

//console.log(`${MODULE_ID} | Source Requirements for Active Effects initialized`);

/* ------------------------------------------------ */
/*  NPC Attack Display Patch                        */
/* ------------------------------------------------ */
Hooks.once('ready', () => {
	// Monkey Patch ActorSD.prototype.buildNpcAttackDisplays to include SDX extra damage info and item image
	// This allows the NPC Sheet "Abilities" tab and "Attacks" list to show typed damage and extra components
	const ActorSD = CONFIG.Actor.documentClass;

	// Guard against re-patching or missing class
	if (!ActorSD || !ActorSD.prototype.buildNpcAttackDisplays) {
		console.warn("shadowdark-extras | Could not patch ActorSD.prototype.buildNpcAttackDisplays");
		return;
	}

	const originalBuildNpcAttackDisplays = ActorSD.prototype.buildNpcAttackDisplays;

	ActorSD.prototype.buildNpcAttackDisplays = async function (itemId) {
		const item = this.getEmbeddedDocument("Item", itemId);

		// If getting item fails, fallback to original ensuring failure consistency
		if (!item) return originalBuildNpcAttackDisplays.call(this, itemId);

		const attackOptions = {
			attackType: item.system.attackType,
			attackName: item.name,
			// numAttacks: item.system.attack.num,
			attackBonus: parseInt(item.system.bonuses.attackBonus, 10),
			baseDamage: item.system.damage.value,
			bonusDamage: parseInt(item.system.bonuses.damageBonus, 10),
			itemId,
			special: item.system.damage.special || "", // Default to empty string
			ranges: item.system.ranges.map(s => game.i18n.localize(
				CONFIG.SHADOWDARK.RANGES[s])).join("/"),
		};

		attackOptions.numAttacks =
			await foundry.applications.ux.TextEditor.implementation.enrichHTML(
				item.system.attack.num,
				{
					async: true,
				}
			);

		// --- SDX Extra Damage Logic ---
		const MODULE_ID = "shadowdark-extras";
		const sdxFlags = item.flags?.[MODULE_ID] || {};

		let extraText = "";

		// Base Damage Type
		if (sdxFlags.baseDamageType && sdxFlags.baseDamageType !== "physical") {
			const typeLabel = game.i18n.localize(`SHADOWDARK_EXTRAS.damage_type.${sdxFlags.baseDamageType}`);
			extraText += ` [${typeLabel}]`;
		}

		// Extra Damages
		const extraDamagesFlag = sdxFlags.extraDamages || [];
		const extraDamages = Array.isArray(extraDamagesFlag) ? extraDamagesFlag : Object.values(extraDamagesFlag);

		if (extraDamages.length > 0) {
			const parts = extraDamages
				.filter(d => d.formula)
				.map(d => {
					const label = game.i18n.localize(`SHADOWDARK_EXTRAS.damage_type.${d.damageType}`);
					return `${d.formula} [${label}]`;
				});
			if (parts.length > 0) {
				extraText += ` + ${parts.join(" + ")}`;
			}
		}

		if (extraText) {
			// Append to special
			if (attackOptions.special) {
				attackOptions.special += extraText;
			} else {
				attackOptions.special = extraText;
			}
		}
		// ------------------------------

		const baseHtml = await foundry.applications.handlebars.renderTemplate(
			"systems/shadowdark/templates/_partials/npc-attack.hbs",
			attackOptions
		);

		// Add item image if available and not the default
		const defaultIcon = "icons/svg/sword.svg";
		if (item.img && item.img !== defaultIcon) {
			const imgHtml = `<img src="${item.img}" alt="${item.name}" class="sdx-npc-item-img" style="width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 2px; border: none; border-radius: 2px;" />`;
			// Insert image inside the anchor, right after the icon <i> tag
			return baseHtml.replace(/<i class="fas fa-dice-d20"><\/i>/, `<i class="fas fa-dice-d20"></i>${imgHtml}`);
		}

		return baseHtml;
	};

	console.log("shadowdark-extras | Patched ActorSD.prototype.buildNpcAttackDisplays");

	// Also patch buildNpcSpecialDisplays to include item images
	if (ActorSD.prototype.buildNpcSpecialDisplays) {
		const originalBuildNpcSpecialDisplays = ActorSD.prototype.buildNpcSpecialDisplays;

		ActorSD.prototype.buildNpcSpecialDisplays = async function (itemId) {
			const item = this.getEmbeddedDocument("Item", itemId);

			// If getting item fails, fallback to original
			if (!item) return originalBuildNpcSpecialDisplays.call(this, itemId);

			const baseHtml = await originalBuildNpcSpecialDisplays.call(this, itemId);

			// Add item image if available and not the default
			const defaultIcon = "icons/svg/explosion.svg";
			if (item.img && item.img !== defaultIcon) {
				const imgHtml = `<img src="${item.img}" alt="${item.name}" class="sdx-npc-item-img" style="width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 2px; border: none; border-radius: 2px;" />`;
				// Insert image inside the anchor, right after the icon <i> tag (could be dice-d20 or comment)
				return baseHtml.replace(/<i class="fas (fa-dice-d20|fa-comment)"><\/i>/, `<i class="fas $1"></i>${imgHtml}`);
			}

			return baseHtml;
		};

		console.log("shadowdark-extras | Patched ActorSD.prototype.buildNpcSpecialDisplays");
	}

	// Also patch buildWeaponDisplay for player sheet weapon images
	if (ActorSD.prototype.buildWeaponDisplay) {
		const originalBuildWeaponDisplay = ActorSD.prototype.buildWeaponDisplay;

		ActorSD.prototype.buildWeaponDisplay = async function (options) {
			const baseHtml = await originalBuildWeaponDisplay.call(this, options);

			// Get the weapon item to access its image
			const item = this.getEmbeddedDocument("Item", options.weaponId);
			if (!item) return baseHtml;

			// Add item image if available and not the default
			const defaultIcon = "icons/svg/sword.svg";
			if (item.img && item.img !== defaultIcon) {
				const imgHtml = `<img src="${item.img}" alt="${item.name}" class="sdx-player-weapon-img" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 3px; border: none; border-radius: 2px;" />`;
				// Prepend image to the weapon display
				return imgHtml + baseHtml;
			}

			return baseHtml;
		};

		console.log("shadowdark-extras | Patched ActorSD.prototype.buildWeaponDisplay");
	}
});

/**
 * Hook to add item images to NPC Features on the Abilities tab
 */
Hooks.on("renderNpcSheetSD", (app, html, data) => {
	const $html = html instanceof jQuery ? html : $(html);

	// Find all feature items and add images
	const featureItems = $html.find('.SD-box .content .item.attack[data-item-id]');
	featureItems.each((_, el) => {
		const $el = $(el);
		const itemId = $el.data('item-id');
		const item = app.actor.items.get(itemId);

		if (!item) return;

		// Check if this is actually a feature (not attack or special)
		if (item.type !== "NPC Feature") return;

		// Check if image is not the default
		const defaultIcon = "icons/svg/book.svg";
		if (item.img && item.img !== defaultIcon) {
			// Find the anchor element and insert image after the icon
			const anchor = $el.find('a.rollable');
			if (anchor.length && !anchor.find('.sdx-npc-item-img').length) {
				const imgHtml = `<img src="${item.img}" alt="${item.name}" class="sdx-npc-item-img" style="width: 18px; height: 18px; vertical-align: text-bottom; margin-right: 2px; border: none; border-radius: 2px;" />`;
				anchor.find('i.fas').after(imgHtml);
			}
		}
	});
});

// ============================================
// SCENE EXPORT CONTEXT MENU
// ============================================

/**
 * Add "Export Scene as ZIP" option to scene context menu
 */
Hooks.on("getSceneContextOptions", (document, menuItems) => {
	menuItems.push({
		name: "Export Scene as ZIP",
		icon: '<i class="fas fa-file-archive"></i>',
		condition: () => game.user.isGM,
		callback: async (li) => {
			// In Foundry v13, li is an HTMLElement, not jQuery
			const element = li instanceof HTMLElement ? li : li[0];
			const sceneId = element?.dataset?.documentId || element?.dataset?.entryId;
			if (!sceneId) {
				ui.notifications.error("Could not determine scene ID");
				return;
			}

			// Get the scene document
			const scene = game.scenes.get(sceneId);
			if (!scene) {
				ui.notifications.error("Could not find scene");
				return;
			}

			// Export the scene
			await SceneExporter.exportScene(scene);
		}
	});

	menuItems.push({
		name: "Import Scene from ZIP",
		icon: '<i class="fas fa-file-import"></i>',
		condition: () => game.user.isGM,
		callback: async () => {
			await SceneImporter.promptImport();
		}
	});
});

console.log(`${MODULE_ID} | Scene export context menu registered`);

// ============================================
// LIGHTS-OUT CAROUSEL DRAG FUNCTIONALITY
// ============================================

/**
 * Make the lights-out-carousel from shadowdark-crawl-helper draggable
 * Uses a dedicated drag handle icon
 */
function initCarouselDrag() {
	const STORAGE_KEY = "sdx-carousel-position";
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let carouselStartX = 0;
	let carouselStartY = 0;
	let hasMoved = false;

	// Create and inject the drag handle button
	function injectDragHandle(carousel) {
		// Check if already injected
		if (carousel.querySelector(".sdx-carousel-drag-btn")) return;

		// Find the first side-buttons container (top one with roll-all button)
		const sideButtons = carousel.querySelector(".side-buttons");
		if (!sideButtons) return;

		// Find the roll-all button to insert before it
		const rollAllBtn = sideButtons.querySelector("#rollAllInit");
		if (!rollAllBtn) return;

		// Create drag handle button
		const dragBtn = document.createElement("button");
		dragBtn.className = "ui-control icon fas fa-grip-vertical sdx-carousel-drag-btn";
		dragBtn.dataset.tooltip = "Drag to move carousel";
		dragBtn.type = "button";

		// Insert before roll-all button
		rollAllBtn.parentNode.insertBefore(dragBtn, rollAllBtn);

		// Attach drag handler
		dragBtn.addEventListener("mousedown", (e) => {
			if (e.button !== 0) return;

			isDragging = true;
			hasMoved = false;
			dragStartX = e.clientX;
			dragStartY = e.clientY;

			const currentCarousel = document.querySelector("#actorCarousel.lights-out-carousel");
			if (currentCarousel) {
				const rect = currentCarousel.getBoundingClientRect();
				carouselStartX = rect.left;
				carouselStartY = rect.top;
			}

			dragBtn.classList.add("sdx-carousel-dragging");
			document.body.style.userSelect = "none";
			e.preventDefault();
		});
	}

	// Setup drag on the carousel
	function setupCarouselDrag(carousel) {
		if (!carousel) return;

		// Don't restore position if actively dragging
		if (!isDragging) {
			// Always restore saved position (carousel may have been re-positioned by the app)
			const savedPos = localStorage.getItem(STORAGE_KEY);
			if (savedPos) {
				try {
					const { left, top } = JSON.parse(savedPos);
					// Only apply if position differs (avoid unnecessary style changes)
					const currentLeft = parseInt(carousel.style.left) || 0;
					const currentTop = parseInt(carousel.style.top) || 0;
					if (Math.abs(currentLeft - left) > 5 || Math.abs(currentTop - top) > 5) {
						carousel.style.left = `${left}px`;
						carousel.style.top = `${top}px`;
					}
				} catch (e) {
					console.warn("shadowdark-extras | Failed to restore carousel position:", e);
				}
			}
		}

		// Inject drag handle if not present
		injectDragHandle(carousel);
	}

	// Global mouse move handler
	document.addEventListener("mousemove", (e) => {
		if (!isDragging) return;

		const dx = e.clientX - dragStartX;
		const dy = e.clientY - dragStartY;

		// Only start moving after a small threshold to allow clicks
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			hasMoved = true;

			const carousel = document.querySelector("#actorCarousel.lights-out-carousel");
			if (carousel) {
				const newLeft = carouselStartX + dx;
				const newTop = carouselStartY + dy;
				carousel.style.left = `${newLeft}px`;
				carousel.style.top = `${newTop}px`;
			}
		}
	});

	// Global mouse up handler
	document.addEventListener("mouseup", () => {
		if (!isDragging) return;

		isDragging = false;
		document.body.style.userSelect = "";

		// Remove dragging class from all portraits
		document.querySelectorAll(".sdx-carousel-dragging").forEach(el => {
			el.classList.remove("sdx-carousel-dragging");
		});

		// Save position if moved
		if (hasMoved) {
			const carousel = document.querySelector("#actorCarousel.lights-out-carousel");
			if (carousel) {
				const rect = carousel.getBoundingClientRect();
				localStorage.setItem(STORAGE_KEY, JSON.stringify({
					left: rect.left,
					top: rect.top
				}));
			}
		}
	});

	// Watch for carousel to appear using MutationObserver
	const observer = new MutationObserver((mutations) => {
		// Check for carousel and setup any new portraits
		const carousel = document.querySelector("#actorCarousel.lights-out-carousel");
		if (carousel) {
			setupCarouselDrag(carousel);
		}
	});

	// Observe the scene-controls area where the carousel is inserted
	Hooks.once("ready", () => {
		// Check if shadowdark-crawl-helper is enabled
		if (!game.modules.get("shadowdark-crawl-helper")?.active) return;

		// Start observing
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});

		// Also try to setup on any existing carousel
		const carousel = document.querySelector("#actorCarousel.lights-out-carousel");
		if (carousel) {
			setupCarouselDrag(carousel);
		}

		console.log(`${MODULE_ID} | Carousel drag functionality initialized`);
	});
}

// Initialize carousel drag
initCarouselDrag();



