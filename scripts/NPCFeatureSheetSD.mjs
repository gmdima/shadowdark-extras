/**
 * NPC Feature Item Sheet - AppV2
 * Modern redesigned NPC Feature sheet with Activity, Description, and Macro tabs
 */

const MODULE_ID = "shadowdark-extras";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AppV2-based Item Sheet for NPC Feature items
 */
export default class NPCFeatureSheetSD extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["shadowdark-extras", "potion-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            icon: "fas fa-dragon",
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
            removeEffect: NPCFeatureSheetSD.#onRemoveEffect,
            removeCriticalEffect: NPCFeatureSheetSD.#onRemoveCriticalEffect,
            addSummonProfile: NPCFeatureSheetSD.#onAddSummonProfile,
            removeSummonProfile: NPCFeatureSheetSD.#onRemoveSummonProfile,
            addItemGiveProfile: NPCFeatureSheetSD.#onAddItemGiveProfile,
            removeItemGiveProfile: NPCFeatureSheetSD.#onRemoveItemGiveProfile,
            itemMacro: NPCFeatureSheetSD.#onItemMacro
        }
    };

    static PARTS = {
        header: {
            template: `modules/${MODULE_ID}/templates/npc-feature-sheet/header.hbs`
        },
        tabs: {
            template: `modules/${MODULE_ID}/templates/npc-feature-sheet/tabs.hbs`
        },
        activity: {
            template: `modules/${MODULE_ID}/templates/npc-feature-sheet/activity.hbs`
        },
        description: {
            template: `modules/${MODULE_ID}/templates/npc-feature-sheet/description.hbs`
        },
        macro: {
            template: `modules/${MODULE_ID}/templates/npc-feature-sheet/macro.hbs`
        }
    };

    /**
     * Available tabs for the sheet
     */
    static TABS = {
        activity: { id: "activity", group: "primary", label: "Activity", icon: "fas fa-bolt" },
        description: { id: "description", group: "primary", label: "Description", icon: "fas fa-book" },
        macro: { id: "macro", group: "primary", label: "Macro", icon: "fas fa-code" }
    };

    /**
     * Track active tab
     */
    tabGroups = {
        primary: "activity"
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    get title() {
        return `[NPC Feature] ${this.document.name}`;
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

        // Add Item Macro button if the module is active
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

        // Sources for dropdown
        context.sources = await shadowdark.compendiums.sources();

        // SDX flags with defaults
        context.sdxFlags = this._getSDXFlags();

        // Damage types
        context.damageTypes = [
            { value: "", label: "Select Type" },
            { value: "Fire", label: "Fire" },
            { value: "Cold", label: "Cold" },
            { value: "Lightning", label: "Lightning" },
            { value: "Acid", label: "Acid" },
            { value: "Poison", label: "Poison" },
            { value: "Necrotic", label: "Necrotic" },
            { value: "Radiant", label: "Radiant" },
            { value: "Force", label: "Force" },
            { value: "Psychic", label: "Psychic" },
            { value: "Healing", label: "Healing" }
        ];

        context.dieTypes = [
            { value: "d4", label: "d4" },
            { value: "d6", label: "d6" },
            { value: "d8", label: "d8" },
            { value: "d10", label: "d10" },
            { value: "d12", label: "d12" },
            { value: "d20", label: "d20" }
        ];

        context.scalingOptions = [
            { value: "none", label: "No Scaling" },
            { value: "every-level", label: "Every Level" },
            { value: "every-other-level", label: "Every Other Level" }
        ];

        // Load effects from UUIDs
        context.effectsList = await this._loadEffects(context.sdxFlags.effects || []);
        context.criticalEffectsList = await this._loadEffects(context.sdxFlags.criticalEffects || []);

        // Load summon profiles
        context.summonProfiles = context.sdxFlags.summoning?.profiles || [];

        // Load item give profiles
        context.itemGiveProfiles = context.sdxFlags.itemGive?.profiles || [];

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
            // Spell damage/healing
            enabled: flags.spellDamage?.enabled ?? false,
            damageType: flags.spellDamage?.damageType ?? "",
            formulaType: flags.spellDamage?.formulaType ?? "basic",
            numDice: flags.spellDamage?.numDice ?? 1,
            dieType: flags.spellDamage?.dieType ?? "d6",
            bonus: flags.spellDamage?.bonus ?? 0,
            scaling: flags.spellDamage?.scaling ?? "none",
            scalingDice: flags.spellDamage?.scalingDice ?? 0,
            formula: flags.spellDamage?.formula ?? "",
            tieredFormula: flags.spellDamage?.tieredFormula ?? "",
            damageRequirement: flags.spellDamage?.damageRequirement ?? "",
            damageRequirementFailAction: flags.spellDamage?.damageRequirementFailAction ?? "zero",
            effectsRequirement: flags.spellDamage?.effectsRequirement ?? "",
            effectsApplyToTarget: flags.spellDamage?.effectsApplyToTarget ?? false,
            effectSelectionMode: flags.spellDamage?.effectSelectionMode ?? "all",
            effects: flags.spellDamage?.effects ?? [],
            criticalEffects: flags.spellDamage?.criticalEffects ?? [],

            // Duration tracking
            trackDuration: flags.spellDamage?.trackDuration ?? false,
            perTurnTrigger: flags.spellDamage?.perTurnTrigger ?? "start",
            perTurnDamage: flags.spellDamage?.perTurnDamage ?? "",
            reapplyEffects: flags.spellDamage?.reapplyEffects ?? false,

            // Summoning
            summoning: {
                enabled: flags.summoning?.enabled ?? false,
                profiles: flags.summoning?.profiles ?? [],
                deleteAtExpiry: flags.summoning?.deleteAtExpiry ?? false
            },

            // Item give
            itemGive: {
                enabled: flags.itemGive?.enabled ?? false,
                profiles: flags.itemGive?.profiles ?? []
            },

            // Item macro
            itemMacro: {
                runAsGm: flags.itemMacro?.runAsGm ?? false,
                executeOnUse: flags.itemMacro?.executeOnUse ?? (flags.itemMacro?.triggers?.includes?.("onCast") ?? true)
            }
        };
    }

    /**
     * Load effect documents from UUIDs
     */
    async _loadEffects(effectsArray) {
        if (!effectsArray?.length) return [];

        const loaded = [];
        for (const effect of effectsArray) {
            const uuid = typeof effect === 'string' ? effect : effect.uuid;
            const duration = typeof effect === 'object' ? effect.duration : {};

            try {
                const doc = await fromUuid(uuid);
                if (doc) {
                    loaded.push({
                        uuid,
                        name: doc.name,
                        img: doc.img || "icons/svg/mystery-man.svg",
                        duration
                    });
                }
            } catch (err) {
                console.warn(`${MODULE_ID} | Failed to load effect ${uuid}:`, err);
            }
        }
        return loaded;
    }

    /**
     * Prepare tabs configuration
     */
    _prepareTabs() {
        const tabs = {};
        for (const [key, config] of Object.entries(NPCFeatureSheetSD.TABS)) {
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

        // Setup drag-drop for effects
        this._setupEffectsDragDrop(html);

        // Setup drag-drop for summon creatures
        this._setupSummonDragDrop(html);

        // Setup drag-drop for item give
        this._setupItemGiveDragDrop(html);

        // Toggle visibility of damage content based on checkbox
        this._setupToggleSections(html);

        // Setup formula type radio buttons
        this._setupFormulaTypeRadios(html);
    }

    /**
     * Handle tab change
     */
    _onChangeTab(tabId) {
        this.tabGroups.primary = tabId;
        this.render();
    }

    /**
     * Setup drag-drop for effects
     */
    _setupEffectsDragDrop(html) {
        const dropAreas = html.querySelectorAll(".effects-drop-area");

        dropAreas.forEach(area => {
            area.addEventListener("dragover", (event) => {
                event.preventDefault();
                area.classList.add("drag-over");
            });

            area.addEventListener("dragleave", () => {
                area.classList.remove("drag-over");
            });

            area.addEventListener("drop", async (event) => {
                event.preventDefault();
                area.classList.remove("drag-over");

                const isCritical = area.classList.contains("critical-effects");
                await this._onDropEffect(event, isCritical);
            });
        });
    }

    /**
     * Handle effect drop
     */
    async _onDropEffect(event, isCritical = false) {
        try {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            let doc = null;

            if (data.uuid) {
                doc = await fromUuid(data.uuid);
            } else if (data.type === "Item" && data.id) {
                if (data.pack) {
                    const pack = game.packs.get(data.pack);
                    doc = await pack.getDocument(data.id);
                } else {
                    doc = game.items.get(data.id);
                }
            }

            if (!doc) {
                ui.notifications.warn("Could not load dropped item");
                return;
            }

            // Check valid type
            const validTypes = ["Effect", "Condition", "NPC Feature"];
            if (!validTypes.includes(doc.type)) {
                ui.notifications.warn("Only Effect, Condition, or NPC Feature items can be dropped here");
                return;
            }

            const flagKey = isCritical ? "criticalEffects" : "effects";
            const rawEffects = this.item.getFlag(MODULE_ID, `spellDamage.${flagKey}`);
            const currentEffects = Array.isArray(rawEffects) ? rawEffects : [];

            // Check for duplicates
            const exists = currentEffects.some(e => (e.uuid || e) === doc.uuid);
            if (exists) {
                ui.notifications.info(`${doc.name} is already in the effects list`);
                return;
            }

            // Add new effect
            const newEffects = [...currentEffects, { uuid: doc.uuid, duration: {} }];
            await this.item.setFlag(MODULE_ID, `spellDamage.${flagKey}`, newEffects);

            ui.notifications.info(`Added ${doc.name} to ${isCritical ? "critical " : ""}effects`);
        } catch (err) {
            console.error(`${MODULE_ID} | Error handling effect drop:`, err);
        }
    }

    /**
     * Setup drag-drop for summon creatures
     */
    _setupSummonDragDrop(html) {
        const dropZones = html.querySelectorAll(".summon-creature-drop");

        dropZones.forEach(zone => {
            zone.addEventListener("dragover", (event) => {
                event.preventDefault();
                zone.classList.add("drag-over");
            });

            zone.addEventListener("dragleave", () => {
                zone.classList.remove("drag-over");
            });

            zone.addEventListener("drop", async (event) => {
                event.preventDefault();
                zone.classList.remove("drag-over");

                const index = parseInt(zone.dataset.index);
                await this._onDropSummonCreature(event, index);
            });
        });
    }

    /**
     * Handle summon creature drop
     */
    async _onDropSummonCreature(event, index) {
        try {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            let doc = null;

            if (data.uuid) {
                doc = await fromUuid(data.uuid);
            } else if (data.type === "Actor" && data.id) {
                if (data.pack) {
                    const pack = game.packs.get(data.pack);
                    doc = await pack.getDocument(data.id);
                } else {
                    doc = game.actors.get(data.id);
                }
            }

            if (!doc || !(doc instanceof Actor)) {
                ui.notifications.warn("Only actors can be dropped here");
                return;
            }

            const profiles = this.item.getFlag(MODULE_ID, "summoning.profiles") || [];
            if (profiles[index]) {
                profiles[index] = {
                    ...profiles[index],
                    creatureUuid: doc.uuid,
                    creatureName: doc.name,
                    creatureImg: doc.img || doc.prototypeToken?.texture?.src || "icons/svg/mystery-man.svg"
                };
                await this.item.setFlag(MODULE_ID, "summoning.profiles", profiles);
                ui.notifications.info(`Added ${doc.name} to summon profile`);
            }
        } catch (err) {
            console.error(`${MODULE_ID} | Error handling summon drop:`, err);
        }
    }

    /**
     * Setup drag-drop for item give
     */
    _setupItemGiveDragDrop(html) {
        const dropZones = html.querySelectorAll(".item-give-drop");

        dropZones.forEach(zone => {
            zone.addEventListener("dragover", (event) => {
                event.preventDefault();
                zone.classList.add("drag-over");
            });

            zone.addEventListener("dragleave", () => {
                zone.classList.remove("drag-over");
            });

            zone.addEventListener("drop", async (event) => {
                event.preventDefault();
                zone.classList.remove("drag-over");

                const index = parseInt(zone.dataset.index);
                await this._onDropGiveItem(event, index);
            });
        });
    }

    /**
     * Handle item give drop
     */
    async _onDropGiveItem(event, index) {
        try {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            let doc = null;

            if (data.uuid) {
                doc = await fromUuid(data.uuid);
            } else if (data.type === "Item" && data.id) {
                if (data.pack) {
                    const pack = game.packs.get(data.pack);
                    doc = await pack.getDocument(data.id);
                } else {
                    doc = game.items.get(data.id);
                }
            }

            if (!doc || !(doc instanceof Item)) {
                ui.notifications.warn("Only items can be dropped here");
                return;
            }

            const profiles = this.item.getFlag(MODULE_ID, "itemGive.profiles") || [];
            if (profiles[index]) {
                profiles[index] = {
                    ...profiles[index],
                    itemUuid: doc.uuid,
                    itemName: doc.name,
                    itemImg: doc.img || "icons/svg/mystery-man.svg"
                };
                await this.item.setFlag(MODULE_ID, "itemGive.profiles", profiles);
                ui.notifications.info(`Added ${doc.name} to give list`);
            }
        } catch (err) {
            console.error(`${MODULE_ID} | Error handling item give drop:`, err);
        }
    }

    /**
     * Setup toggle sections (collapsible)
     */
    _setupToggleSections(html) {
        const toggles = html.querySelectorAll(".section-toggle");
        toggles.forEach(toggle => {
            const section = toggle.closest(".collapsible-section");
            const content = section?.querySelector(".section-content");
            if (content) {
                content.style.display = toggle.checked ? "block" : "none";
            }

            toggle.addEventListener("change", () => {
                if (content) {
                    content.style.display = toggle.checked ? "block" : "none";
                }
            });
        });
    }

    /**
     * Setup formula type radio buttons
     */
    _setupFormulaTypeRadios(html) {
        // Spell Damage formula type radios
        const radios = html.querySelectorAll('input[name="flags.shadowdark-extras.spellDamage.formulaType"]');
        const sections = {
            basic: html.querySelector(".formula-basic"),
            formula: html.querySelector(".formula-custom"),
            tiered: html.querySelector(".formula-tiered")
        };

        const updateVisibility = (selected) => {
            Object.entries(sections).forEach(([key, section]) => {
                if (section) {
                    section.style.display = key === selected ? "block" : "none";
                }
            });
        };

        // Initial state
        const checked = html.querySelector('input[name="flags.shadowdark-extras.spellDamage.formulaType"]:checked');
        if (checked) {
            updateVisibility(checked.value);
        }

        // Change handler
        radios.forEach(radio => {
            radio.addEventListener("change", () => {
                updateVisibility(radio.value);
            });
        });
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    static async #onItemMacro(event, target) {
        this._onChangeTab("macro");
    }

    static async #onRemoveEffect(event, target) {
        const uuid = target.dataset.uuid;
        const rawEffects = this.item.getFlag(MODULE_ID, "spellDamage.effects");
        const currentEffects = Array.isArray(rawEffects) ? rawEffects : [];
        const newEffects = currentEffects.filter(e => (e.uuid || e) !== uuid);
        await this.item.setFlag(MODULE_ID, "spellDamage.effects", newEffects);
    }

    static async #onRemoveCriticalEffect(event, target) {
        const uuid = target.dataset.uuid;
        const rawEffects = this.item.getFlag(MODULE_ID, "spellDamage.criticalEffects");
        const currentEffects = Array.isArray(rawEffects) ? rawEffects : [];
        const newEffects = currentEffects.filter(e => (e.uuid || e) !== uuid);
        await this.item.setFlag(MODULE_ID, "spellDamage.criticalEffects", newEffects);
    }

    static async #onAddSummonProfile(event, target) {
        const rawProfiles = this.item.getFlag(MODULE_ID, "summoning.profiles");
        const profiles = Array.isArray(rawProfiles) ? [...rawProfiles] : [];
        profiles.push({
            creatureUuid: "",
            creatureName: "",
            creatureImg: "",
            count: "1",
            displayName: ""
        });
        await this.item.setFlag(MODULE_ID, "summoning.profiles", profiles);
    }

    static async #onRemoveSummonProfile(event, target) {
        const index = parseInt(target.dataset.index);
        const rawProfiles = this.item.getFlag(MODULE_ID, "summoning.profiles");
        const profiles = Array.isArray(rawProfiles) ? [...rawProfiles] : [];
        profiles.splice(index, 1);
        await this.item.setFlag(MODULE_ID, "summoning.profiles", profiles);
    }

    static async #onAddItemGiveProfile(event, target) {
        const rawProfiles = this.item.getFlag(MODULE_ID, "itemGive.profiles");
        const profiles = Array.isArray(rawProfiles) ? [...rawProfiles] : [];
        profiles.push({
            itemUuid: "",
            itemName: "",
            itemImg: "",
            quantity: "1"
        });
        await this.item.setFlag(MODULE_ID, "itemGive.profiles", profiles);
    }

    static async #onRemoveItemGiveProfile(event, target) {
        const index = parseInt(target.dataset.index);
        const rawProfiles = this.item.getFlag(MODULE_ID, "itemGive.profiles");
        const profiles = Array.isArray(rawProfiles) ? [...rawProfiles] : [];
        profiles.splice(index, 1);
        await this.item.setFlag(MODULE_ID, "itemGive.profiles", profiles);
    }

    /* -------------------------------------------- */
    /*  Form Handling                               */
    /* -------------------------------------------- */

    _processFormData(event, form, formData) {
        // Default processing handles item data updates
        return super._processFormData(event, form, formData);
    }
}
