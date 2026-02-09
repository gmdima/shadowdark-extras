/**
 * NPC Special Attack Item Sheet - AppV2
 * Combines NPC Attack features (Attacks, Damage) with NPC Feature V2 features (Effects, Summoning)
 */

const MODULE_ID = "shadowdark-extras";

import NPCFeatureSheetSD from "./NPCFeatureSheetSD.mjs";

/**
 * AppV2-based Item Sheet for NPC Special Attack items
 */
export default class NPCSpecialAttackSheetSD extends NPCFeatureSheetSD {
    static DEFAULT_OPTIONS = {
        classes: ["shadowdark-extras", "npc-special-attack-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            icon: "fas fa-bolt", // Distinct icon
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
            addExtraDamage: NPCSpecialAttackSheetSD.#onAddExtraDamage,
            removeExtraDamage: NPCSpecialAttackSheetSD.#onRemoveExtraDamage,
            // Inherit actions from NPCFeatureSheetSD
            addEffect: NPCFeatureSheetSD._onAddEffect,
            removeEffect: NPCFeatureSheetSD._onRemoveEffect,
            addCriticalEffect: NPCFeatureSheetSD._onAddCriticalEffect,
            removeCriticalEffect: NPCFeatureSheetSD._onRemoveCriticalEffect,
            addSummonProfile: NPCFeatureSheetSD._onAddSummonProfile,
            removeSummonProfile: NPCFeatureSheetSD._onRemoveSummonProfile,
            addItemGiveProfile: NPCFeatureSheetSD._onAddItemGiveProfile,
            removeItemGiveProfile: NPCFeatureSheetSD._onRemoveItemGiveProfile
        }
    };

    static PARTS = {
        header: {
            template: `modules/${MODULE_ID}/templates/npc-special-attack-sheet/header.hbs`
        },
        tabs: {
            template: `modules/${MODULE_ID}/templates/npc-special-attack-sheet/tabs.hbs`
        },
        activity: { // Replaces 'details' from Feature sheet, but conceptually similar
            template: `modules/${MODULE_ID}/templates/npc-special-attack-sheet/activity.hbs`
        },
        description: {
            template: `modules/${MODULE_ID}/templates/npc-special-attack-sheet/description.hbs`
        },
        macro: {
            template: `modules/${MODULE_ID}/templates/npc-special-attack-sheet/macro.hbs`
        }
    };

    /**
     * Available tabs for the sheet - inherit but rename/reorder if needed
     */
    static TABS = {
        activity: { id: "activity", group: "primary", label: "Activity", icon: "fas fa-list" },
        description: { id: "description", group: "primary", label: "Description", icon: "fas fa-book" },
        macro: { id: "macro", group: "primary", label: "Macro", icon: "fas fa-code" }
    };

    get title() {
        return `[NPC Special Attack] ${this.document.name}`;
    }

    async _prepareContext(options) {
        // Inherit base context from NPCFeatureSheetSD
        const context = await super._prepareContext(options);
        const item = this.item;

        // Add NPC Attack specific data

        // Damage types (matching NPCAttackSheetSD)
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

        // Extra damage entries (using flags like NPCAttackSheetSD)
        // Ensure "extraDamages" are pulled from flags correctly
        const extraDamagesFlag = item.getFlag(MODULE_ID, "extraDamages") || [];
        // Handle case where it might be an object instead of array
        context.extraDamages = Array.isArray(extraDamagesFlag) ? extraDamagesFlag : Object.values(extraDamagesFlag);

        // Base Damage Type (flag)
        context.baseDamageType = item.getFlag(MODULE_ID, "baseDamageType") || "physical";

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const html = this.element;

        // Setup attack-specific handlers (copied from NPCAttackSheetSD)

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

        // Base damage type dropdown
        const baseDamageTypeSelect = html.querySelector("select[name='flags.shadowdark-extras.baseDamageType']");
        if (baseDamageTypeSelect) {
            baseDamageTypeSelect.addEventListener("change", async (event) => {
                await this.item.setFlag(MODULE_ID, "baseDamageType", event.target.value);
            });
        }

        // Setup change handlers for attack stats, base damage, and critical fields
        this._setupStatFieldHandlers(html);

        // Extra damage fields
        this._setupExtraDamageHandlers(html);

        // Range checkboxes
        this._setupRangeHandlers(html);

        // Setup ProseMirror save handler for description
        this._setupProseMirrorSaveHandler(html);
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
    }

    /**
     * Setup change handlers for extra damage fields
     */
    _setupExtraDamageHandlers(html) {
        const extraDamageInputs = html.querySelectorAll("input[name^='flags.shadowdark-extras.extraDamages'], select[name^='flags.shadowdark-extras.extraDamages']");

        extraDamageInputs.forEach(input => {
            input.addEventListener("change", async (event) => {
                const match = event.target.name.match(/flags\.shadowdark-extras\.extraDamages\.(\d+)\.(formula|damageType)/);
                if (!match) return;

                const index = parseInt(match[1]);
                const field = match[2];
                const value = event.target.value;

                let extraDamages = this.item.getFlag(MODULE_ID, "extraDamages") || [];
                if (!Array.isArray(extraDamages)) {
                    extraDamages = Object.values(extraDamages);
                }

                if (!extraDamages[index]) {
                    extraDamages[index] = { formula: "", damageType: "" };
                }

                extraDamages[index][field] = value;
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
                const checked = Array.from(rangeCheckboxes)
                    .filter(cb => cb.checked)
                    .map(cb => cb.value);

                await this.item.update({ "system.ranges": checked }, { render: false });
            });
        });
    }

    /**
     * Add extra damage entry
     */
    static async #onAddExtraDamage(event, target) {
        const item = this.item;
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
        let extraDamages = item.getFlag(MODULE_ID, "extraDamages") || [];
        if (!Array.isArray(extraDamages)) {
            extraDamages = Object.values(extraDamages);
        }

        extraDamages.splice(index, 1);

        await item.setFlag(MODULE_ID, "extraDamages", extraDamages);
    }

    /**
     * Prepare update data for form submission
     */
    async _prepareSubmitData(event, form, formData) {
        const submitData = await super._prepareSubmitData(event, form, formData);

        // Clean up managed fields to avoid array index issues
        for (const key in submitData) {
            if (key.startsWith(`flags.${MODULE_ID}.extraDamages.`)) {
                delete submitData[key];
            }
        }
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
        // Explicitly update the document with the prepared submit data
        if (submitData && Object.keys(submitData).length > 0) {
            await this.document.update(submitData);
        }
    }
}
