/**
 * NPC Attack Item Sheet - AppV2
 * Modern redesigned NPC Attack sheet with damage types and multiple damage sources
 */

const MODULE_ID = "shadowdark-extras";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AppV2-based Item Sheet for NPC Attack items
 */
export default class NPCAttackSheetSD extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["shadowdark-extras", "npc-attack-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            icon: "fas fa-crossed-swords",
            resizable: true,
            contentClasses: ["standard-form"]
        },
        position: {
            width: 550,
            height: 650
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        },
        actions: {
            addExtraDamage: NPCAttackSheetSD.#onAddExtraDamage,
            removeExtraDamage: NPCAttackSheetSD.#onRemoveExtraDamage
        }
    };

    static PARTS = {
        header: {
            template: `modules/${MODULE_ID}/templates/npc-attack-sheet/header.hbs`
        },
        tabs: {
            template: `modules/${MODULE_ID}/templates/npc-attack-sheet/tabs.hbs`
        },
        details: {
            template: `modules/${MODULE_ID}/templates/npc-attack-sheet/details.hbs`
        },
        description: {
            template: `modules/${MODULE_ID}/templates/npc-attack-sheet/description.hbs`
        },
        source: {
            template: `modules/${MODULE_ID}/templates/npc-attack-sheet/source.hbs`
        }
    };

    /**
     * Available tabs for the sheet
     */
    static TABS = {
        details: { id: "details", group: "primary", label: "Details", icon: "fas fa-list" },
        description: { id: "description", group: "primary", label: "Description", icon: "fas fa-book" },
        source: { id: "source", group: "primary", label: "Source", icon: "fas fa-book-open" }
    };

    /**
     * Track active tab
     */
    tabGroups = {
        primary: "details"
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    get title() {
        return `[NPC Attack] ${this.document.name}`;
    }

    get item() {
        return this.document;
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

        // Sources for dropdown
        context.sources = await shadowdark.compendiums.sources();

        // SDX flags with defaults
        context.sdxFlags = this._getSDXFlags();

        // Damage types (matching the ones used for resistance/immunity/vulnerability)
        context.damageTypes = [
            { value: "", label: "— Select Type —" },
            { value: "bludgeoning", label: "Bludgeoning" },
            { value: "slashing", label: "Slashing" },
            { value: "piercing", label: "Piercing" },
            { value: "physical", label: "Physical (Generic)" },
            { value: "fire", label: "Fire" },
            { value: "cold", label: "Cold" },
            { value: "lightning", label: "Lightning" },
            { value: "acid", label: "Acid" },
            { value: "poison", label: "Poison" },
            { value: "necrotic", label: "Necrotic" },
            { value: "radiant", label: "Radiant" },
            { value: "psychic", label: "Psychic" },
            { value: "force", label: "Force" }
        ];

        // Attack ranges - prepare with checked state
        const rangesConfig = CONFIG.SHADOWDARK?.RANGES || {
            "close": "SHADOWDARK.ranges.close",
            "near": "SHADOWDARK.ranges.near",
            "far": "SHADOWDARK.ranges.far",
            "nearLine": "SHADOWDARK.ranges.nearLine"
        };

        const selectedRanges = item.system.ranges || [];
        context.rangesList = [];

        for (const [key, label] of Object.entries(rangesConfig)) {
            context.rangesList.push({
                key: key,
                label: label,
                checked: selectedRanges.includes(key)
            });
        }

        // Extra damage entries
        context.extraDamages = context.sdxFlags.extraDamages || [];

        // Enrich description
        context.enrichedDescription = await TextEditor.enrichHTML(item.system.description, {
            secrets: item.isOwner,
            async: true,
            relativeTo: item
        });

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
            // Base damage type for the attack
            baseDamageType: flags.baseDamageType || "physical",
            // Extra damage sources (array of {formula, damageType})
            extraDamages: flags.extraDamages || []
        };
    }

    /**
     * Prepare tabs configuration
     */
    _prepareTabs() {
        const tabs = {};
        for (const [key, config] of Object.entries(NPCAttackSheetSD.TABS)) {
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
        context.tab = context.tabs?.[partId];
        return context;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        // Setup tab click handlers
        const tabLinks = html.querySelectorAll(".sheet-tabs .item");
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

        // Setup name input blur handler to save changes
        const nameInput = html.querySelector("input[name='name']");
        if (nameInput) {
            nameInput.addEventListener("blur", async () => {
                const newName = nameInput.value.trim();
                if (newName && newName !== this.item.name) {
                    await this.item.update({ name: newName });
                }
            });
        }

        // Setup special abilities blur handler
        const specialInput = html.querySelector("textarea[name='system.damage.special']");
        if (specialInput) {
            specialInput.addEventListener("change", async () => {
                await this.item.update({ "system.damage.special": specialInput.value });
            });
        }

        // Setup change handlers for extra damage fields
        this._setupExtraDamageHandlers(html);

        // Setup change handlers for range checkboxes
        this._setupRangeHandlers(html);

        // Setup change handlers for attack stats, base damage, and critical fields
        this._setupStatFieldHandlers(html);

        // Setup ProseMirror save handler
        this._setupProseMirrorSaveHandler(html);
    }

    /**
     * Setup change handlers for stat fields that need explicit saving
     */
    _setupStatFieldHandlers(html) {
        // Attack stats fields
        const statFields = [
            { selector: "input[name='system.attack.num']", path: "system.attack.num" },
            { selector: "input[name='system.bonuses.attackBonus']", path: "system.bonuses.attackBonus", isNumber: true },
            { selector: "input[name='system.bonuses.damageBonus']", path: "system.bonuses.damageBonus", isNumber: true },
            { selector: "input[name='system.damage.value']", path: "system.damage.value" },
            { selector: "input[name='system.bonuses.critical.multiplier']", path: "system.bonuses.critical.multiplier", isNumber: true },
            { selector: "input[name='system.bonuses.critical.successThreshold']", path: "system.bonuses.critical.successThreshold", isNumber: true },
            { selector: "input[name='system.bonuses.critical.failureThreshold']", path: "system.bonuses.critical.failureThreshold", isNumber: true }
        ];

        for (const field of statFields) {
            const input = html.querySelector(field.selector);
            if (input) {
                input.addEventListener("change", async (event) => {
                    let value = event.target.value;
                    if (field.isNumber) {
                        value = parseInt(value) || 0;
                    }
                    await this.item.update({ [field.path]: value });
                });
            }
        }

        // Base damage type dropdown
        const baseDamageTypeSelect = html.querySelector("select[name='flags.shadowdark-extras.baseDamageType']");
        if (baseDamageTypeSelect) {
            baseDamageTypeSelect.addEventListener("change", async (event) => {
                await this.item.setFlag(MODULE_ID, "baseDamageType", event.target.value);
            });
        }

        // Source select dropdown
        const sourceSelect = html.querySelector("select[name='system.source.title']");
        if (sourceSelect) {
            sourceSelect.addEventListener("change", async (event) => {
                await this.item.update({ "system.source.title": event.target.value });
            });
        }
    }

    /**
     * Setup ProseMirror save handler to manually save description changes
     */
    _setupProseMirrorSaveHandler(html) {
        // Listen for ProseMirror save button clicks
        const proseMirrorEditor = html.querySelector("prose-mirror[name='system.description']");
        if (!proseMirrorEditor) return;

        // Observer to wait for the ProseMirror toolbar to be ready
        const observer = new MutationObserver(() => {
            const saveButton = proseMirrorEditor.querySelector(".editor-save, button[data-action='save']");
            if (saveButton && !saveButton.dataset.sdxHandled) {
                saveButton.dataset.sdxHandled = "true";
                saveButton.addEventListener("click", async (event) => {
                    // Get the ProseMirror content
                    const editorContent = proseMirrorEditor.querySelector(".ProseMirror");
                    if (editorContent) {
                        const htmlContent = editorContent.innerHTML;
                        await this.item.update({ "system.description": htmlContent });
                        ui.notifications.info("Description saved");
                    }
                });
            }
        });

        observer.observe(proseMirrorEditor, { childList: true, subtree: true });

        // Also check if it's already rendered
        setTimeout(() => {
            const saveButton = proseMirrorEditor.querySelector(".editor-save, button[data-action='save']");
            if (saveButton && !saveButton.dataset.sdxHandled) {
                saveButton.dataset.sdxHandled = "true";
                saveButton.addEventListener("click", async (event) => {
                    const editorContent = proseMirrorEditor.querySelector(".ProseMirror");
                    if (editorContent) {
                        const htmlContent = editorContent.innerHTML;
                        await this.item.update({ "system.description": htmlContent });
                        ui.notifications.info("Description saved");
                    }
                });
            }
        }, 100);
    }

    /**
     * Setup change handlers for extra damage fields
     */
    _setupExtraDamageHandlers(html) {
        const extraDamageInputs = html.querySelectorAll("input[name^='flags.shadowdark-extras.extraDamages'], select[name^='flags.shadowdark-extras.extraDamages']");

        extraDamageInputs.forEach(input => {
            input.addEventListener("change", async (event) => {
                // Parse the field name to get index and field
                const match = event.target.name.match(/flags\.shadowdark-extras\.extraDamages\.(\d+)\.(formula|damageType)/);
                if (!match) return;

                const index = parseInt(match[1]);
                const field = match[2];
                const value = event.target.value;

                // Get current extra damages - ensure it's a proper array
                // Foundry can return flag arrays as objects with numeric keys
                let extraDamages = this.item.getFlag(MODULE_ID, "extraDamages") || [];
                if (!Array.isArray(extraDamages)) {
                    extraDamages = Object.values(extraDamages);
                }

                // Ensure the entry exists
                if (!extraDamages[index]) {
                    extraDamages[index] = { formula: "", damageType: "" };
                }

                // Update the field
                extraDamages[index][field] = value;

                // Save
                await this.item.setFlag(MODULE_ID, "extraDamages", extraDamages);
            });
        });
    }

    /**
     * Setup change handlers for range checkboxes
     */
    _setupRangeHandlers(html) {
        const rangeCheckboxes = html.querySelectorAll("input[name='system.ranges']");

        rangeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener("change", async (event) => {
                // Get all checked ranges
                const checked = Array.from(rangeCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                // Update the item without triggering a render
                await this.item.update({ "system.ranges": checked }, { render: false });
            });
        });
    }

    /**
     * Handle tab change
     */
    _onChangeTab(tabId) {
        this.tabGroups.primary = tabId;
        this.render();
    }

    /**
     * Add extra damage entry
     */
    static async #onAddExtraDamage(event, target) {
        const item = this.item;
        // Ensure it's a proper array - Foundry can return flag arrays as objects
        let extraDamages = item.getFlag(MODULE_ID, "extraDamages") || [];
        if (!Array.isArray(extraDamages)) {
            extraDamages = Object.values(extraDamages);
        }

        extraDamages.push({
            formula: "",
            damageType: ""
        });

        await item.setFlag(MODULE_ID, "extraDamages", extraDamages);
    }

    /**
     * Remove extra damage entry
     */
    static async #onRemoveExtraDamage(event, target) {
        const item = this.item;
        const index = parseInt(target.dataset.index);
        // Ensure it's a proper array - Foundry can return flag arrays as objects
        let extraDamages = item.getFlag(MODULE_ID, "extraDamages") || [];
        if (!Array.isArray(extraDamages)) {
            extraDamages = Object.values(extraDamages);
        }

        extraDamages.splice(index, 1);

        await item.setFlag(MODULE_ID, "extraDamages", extraDamages);
    }

    /* -------------------------------------------- */
    /*  Form Submission                             */
    /* -------------------------------------------- */

    /**
     * Prepare update data for form submission
     */
    async _prepareSubmitData(event, form, formData) {
        const submitData = await super._prepareSubmitData(event, form, formData);

        // Remove extra damage fields - we handle these with direct event listeners
        for (const key in submitData) {
            if (key.startsWith(`flags.${MODULE_ID}.extraDamages.`)) {
                delete submitData[key];
            }
        }

        // Remove ranges - we handle these with direct event listeners
        // This prevents unchecked checkboxes from being submitted as null
        if ("system.ranges" in submitData) {
            delete submitData["system.ranges"];
        }

        return submitData;
    }

    /**
     * Process the form submission and update the document
     * @override
     */
    async _processSubmitData(event, form, submitData) {
        // The parent class may not always call document.update() properly
        // Explicitly update the document with the prepared submit data
        if (submitData && Object.keys(submitData).length > 0) {
            await this.document.update(submitData);
        }
    }

}
