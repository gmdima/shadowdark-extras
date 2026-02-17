/**
 * Class Ability Item Sheet - AppV2
 * Details, Description, and Macro tabs
 */

const MODULE_ID = "shadowdark-extras";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class ClassAbilitySheetSD extends HandlebarsApplicationMixin(DocumentSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ["shadowdark-extras", "potion-sheet"],
		tag: "form",
		window: {
			frame: true,
			positioned: true,
			icon: "fas fa-star",
			resizable: true,
			contentClasses: ["standard-form"]
		},
		position: {
			width: 550,
			height: 600
		},
		form: {
			submitOnChange: true,
			closeOnSubmit: false
		},
		actions: {
			itemMacro: ClassAbilitySheetSD.#onItemMacro
		}
	};

	static PARTS = {
		header: {
			template: `modules/${MODULE_ID}/templates/class-ability-sheet/header.hbs`
		},
		tabs: {
			template: `modules/${MODULE_ID}/templates/class-ability-sheet/tabs.hbs`
		},
		details: {
			template: `modules/${MODULE_ID}/templates/class-ability-sheet/details.hbs`
		},
		description: {
			template: `modules/${MODULE_ID}/templates/class-ability-sheet/description.hbs`
		},
		macro: {
			template: `modules/${MODULE_ID}/templates/class-ability-sheet/macro.hbs`
		}
	};

	static TABS = {
		details: { id: "details", group: "primary", label: "Details", icon: "fas fa-list" },
		description: { id: "description", group: "primary", label: "Description", icon: "fas fa-book" },
		macro: { id: "macro", group: "primary", label: "Macro", icon: "fas fa-code" }
	};

	tabGroups = {
		primary: "details"
	};

	/* -------------------------------------------- */
	/*  Properties                                  */
	/* -------------------------------------------- */

	get title() {
		return `[Class Ability] ${this.document.name}`;
	}

	get item() {
		return this.document;
	}

	/* -------------------------------------------- */
	/*  Header Buttons                              */
	/* -------------------------------------------- */

	/** @override */
	_getHeaderControls() {
		const controls = super._getHeaderControls();

		if (game.modules.get("itemacro")?.active) {
			controls.unshift({
				icon: "fas fa-code",
				label: "Item Macro",
				action: "itemMacro",
				class: "item-macro-header-btn"
			});
		}

		return controls;
	}

	/* -------------------------------------------- */
	/*  Context Preparation                         */
	/* -------------------------------------------- */

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const item = this.item;
		const source = item.toObject();

		// Core data
		context.item = item;
		context.source = source;
		context.system = item.system;
		context.flags = item.flags;
		context.isEditable = this.isEditable;
		context.isGM = game.user.isGM;

		// Config
		context.config = CONFIG.SHADOWDARK;

		// Abilities for dropdown
		context.abilities = CONFIG.SHADOWDARK.ABILITIES_LONG;

		// Sources for dropdown
		context.sources = await shadowdark.compendiums.sources();

		// SDX flags with defaults
		context.sdxFlags = this._getSDXFlags();

		// Enrich description
		context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
			secrets: item.isOwner,
			async: true,
			relativeTo: item
		});

		// Item Macro content
		context.macroId = item.id;
		context.macroCommand = item.getFlag("itemacro", "macro.command") || "";
		context.macroName = item.getFlag("itemacro", "macro.name") || item.name;

		// Tabs
		context.tabs = this._prepareTabs();

		return context;
	}

	/**
	 * Get SDX flags with defaults
	 */
	_getSDXFlags() {
		const item = this.item;
		const flags = item.flags?.[MODULE_ID] || {};

		return {
			itemMacro: {
				runAsGm: flags.itemMacro?.runAsGm ?? false,
				macroTrigger: flags.itemMacro?.macroTrigger ?? "all"
			}
		};
	}

	/**
	 * Prepare tabs configuration
	 */
	_prepareTabs() {
		const tabs = {};
		for (const [key, config] of Object.entries(ClassAbilitySheetSD.TABS)) {
			tabs[key] = {
				...config,
				active: this.tabGroups.primary === key,
				cssClass: this.tabGroups.primary === key ? "active" : ""
			};
		}
		return tabs;
	}

	/* -------------------------------------------- */
	/*  Part Preparation                            */
	/* -------------------------------------------- */

	async _preparePartContext(partId, context, options) {
		context.partId = `${this.id}-${partId}`;
		context.tab = context.tabs[partId];
		return context;
	}

	/* -------------------------------------------- */
	/*  Rendering                                   */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options);
		const html = this.element;

		// Setup tab click handlers
		const tabLinks = html.querySelectorAll(".potion-sheet-tabs .tab-item");
		tabLinks.forEach(link => {
			link.addEventListener("click", (event) => {
				event.preventDefault();
				const tab = event.currentTarget.dataset.tab;
				this._onChangeTab(tab);
			});
		});

		// Setup image click handler for FilePicker
		const itemImage = html.querySelector(".item-image[data-edit='img']");
		if (itemImage) {
			itemImage.style.cursor = "pointer";
			itemImage.addEventListener("click", (event) => {
				event.preventDefault();
				const fp = new FilePicker({
					type: "image",
					current: this.item.img,
					callback: async (path) => {
						await this.item.update({ img: path });
					}
				});
				fp.browse();
			});
		}

		// Toggle visibility of limited uses fields based on checkbox
		this._setupLimitedUsesToggle(html);
	}

	/**
	 * Handle tab change
	 */
	_onChangeTab(tabId) {
		this.tabGroups.primary = tabId;
		this.render();
	}

	/**
	 * Setup limited uses toggle visibility
	 */
	_setupLimitedUsesToggle(html) {
		const toggle = html.querySelector('input[name="system.limitedUses"]');
		const usesFields = html.querySelector(".uses-fields");
		if (toggle && usesFields) {
			usesFields.style.display = toggle.checked ? "flex" : "none";
			toggle.addEventListener("change", () => {
				usesFields.style.display = toggle.checked ? "flex" : "none";
			});
		}
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	static async #onItemMacro(event, target) {
		this._onChangeTab("macro");
	}
}
