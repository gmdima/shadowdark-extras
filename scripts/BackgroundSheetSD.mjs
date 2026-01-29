/**
 * Background Item Sheet - AppV2
 * Modern Background sheet with Description and Advancement tabs
 */

const MODULE_ID = "shadowdark-extras";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AppV2-based Item Sheet for Background items
 */
export default class BackgroundSheetSD extends HandlebarsApplicationMixin(DocumentSheetV2) {
    static DEFAULT_OPTIONS = {
        classes: ["shadowdark-extras", "background-sheet"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            icon: "fas fa-user",
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
            addAdvancementEntry: BackgroundSheetSD.#onAddAdvancementEntry,
            removeAdvancementEntry: BackgroundSheetSD.#onRemoveAdvancementEntry,
            removeAdvancementItem: BackgroundSheetSD.#onRemoveAdvancementItem
        }
    };

    static PARTS = {
        header: {
            template: `modules/${MODULE_ID}/templates/background-sheet/header.hbs`
        },
        tabs: {
            template: `modules/${MODULE_ID}/templates/background-sheet/tabs.hbs`
        },
        description: {
            template: `modules/${MODULE_ID}/templates/background-sheet/description.hbs`
        },
        advancement: {
            template: `modules/${MODULE_ID}/templates/background-sheet/advancement.hbs`
        }
    };

    /**
     * Available tabs for the sheet
     */
    static TABS = {
        description: { id: "description", group: "primary", label: "Description", icon: "fas fa-book" },
        advancement: { id: "advancement", group: "primary", label: "Advancement", icon: "fas fa-gift" }
    };

    /**
     * Track active tab
     */
    tabGroups = {
        primary: "description"
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    get title() {
        return `[Background] ${this.document.name}`;
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

        // Level options for advancement (0 = immediate, 1-10 = at that level)
        context.levelOptions = [
            { value: 0, label: game.i18n.localize("SHADOWDARK_EXTRAS.backgroundSheet.level.immediate") },
            ...Array.from({ length: 10 }, (_, i) => ({
                value: i + 1,
                label: game.i18n.format("SHADOWDARK_EXTRAS.backgroundSheet.level.atLevel", { level: i + 1 })
            }))
        ];

        // Advancement entries with loaded items
        context.advancementEntries = await this._prepareAdvancementEntries(context.sdxFlags.advancement || []);

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
            // Advancement data
            advancement: flags.advancement ?? []
        };
    }

    /**
     * Prepare advancement entries with loaded item data
     */
    async _prepareAdvancementEntries(entries) {
        const prepared = [];

        for (const entry of entries) {
            const loadedItems = [];

            // Load each item from UUID
            for (const itemRef of entry.items || []) {
                try {
                    const doc = await fromUuid(itemRef.uuid);
                    loadedItems.push({
                        uuid: itemRef.uuid,
                        name: doc?.name || itemRef.name || "Unknown Item",
                        img: doc?.img || itemRef.img || "icons/svg/mystery-man.svg"
                    });
                } catch (err) {
                    console.warn(`${MODULE_ID} | Failed to load item ${itemRef.uuid}:`, err);
                    // Include it anyway with stored data
                    loadedItems.push({
                        uuid: itemRef.uuid,
                        name: itemRef.name || "Unknown Item",
                        img: itemRef.img || "icons/svg/mystery-man.svg"
                    });
                }
            }

            prepared.push({
                id: entry.id,
                level: entry.level,
                items: loadedItems
            });
        }

        return prepared;
    }

    /**
     * Prepare tabs configuration
     */
    _prepareTabs() {
        const tabs = {};
        for (const [key, config] of Object.entries(BackgroundSheetSD.TABS)) {
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
        const tabLinks = html.querySelectorAll(".background-sheet-tabs .tab-item");
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

        // Setup ProseMirror save handler
        this._setupProseMirrorSaveHandler(html);

        // Setup drag-drop for advancement items
        this._setupAdvancementDragDrop(html);

        // Setup level change handlers
        this._setupLevelChangeHandlers(html);
    }

    /**
     * Handle tab change
     */
    _onChangeTab(tabId) {
        this.tabGroups.primary = tabId;
        this.render();
    }

    /**
     * Setup drag-drop for advancement items
     */
    _setupAdvancementDragDrop(html) {
        const dropZones = html.querySelectorAll(".advancement-item-drop");

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

                const advancementId = zone.dataset.advancementId;
                await this._onDropAdvancementItem(event, advancementId);
            });
        });
    }

    /**
     * Setup level change handlers for advancement entries
     */
    _setupLevelChangeHandlers(html) {
        const levelSelects = html.querySelectorAll("select[name^='advancement.']");

        levelSelects.forEach(select => {
            select.addEventListener("change", async (event) => {
                const advancementId = event.target.dataset.advancementId;
                const newLevel = parseInt(event.target.value);

                // Get current advancement array
                const advancement = this.item.getFlag(MODULE_ID, "advancement") || [];
                const entry = advancement.find(e => e.id === advancementId);

                if (entry) {
                    entry.level = newLevel;
                    await this.item.setFlag(MODULE_ID, "advancement", advancement);
                    console.log(`${MODULE_ID} | Updated advancement entry ${advancementId} to level ${newLevel}`);
                }
            });
        });
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
     * Handle item drop onto advancement entry
     */
    async _onDropAdvancementItem(event, advancementId) {
        try {
            const data = JSON.parse(event.dataTransfer.getData("text/plain"));
            let doc = null;

            // Handle UUID or pack references
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
                ui.notifications.warn("Only items can be added to advancement");
                return;
            }

            // Get current advancement array
            const advancement = this.item.getFlag(MODULE_ID, "advancement") || [];
            const entry = advancement.find(e => e.id === advancementId);

            if (!entry) {
                console.error(`${MODULE_ID} | Advancement entry ${advancementId} not found`);
                return;
            }

            // Check for duplicates
            const exists = entry.items.some(i => i.uuid === doc.uuid);
            if (exists) {
                ui.notifications.info(`${doc.name} is already in this advancement entry`);
                return;
            }

            // Add item to entry
            entry.items.push({
                uuid: doc.uuid,
                name: doc.name,
                img: doc.img || "icons/svg/mystery-man.svg"
            });

            await this.item.setFlag(MODULE_ID, "advancement", advancement);
            ui.notifications.info(`Added ${doc.name} to advancement`);

        } catch (err) {
            console.error(`${MODULE_ID} | Error handling advancement item drop:`, err);
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Add new advancement entry
     */
    static async #onAddAdvancementEntry(event, target) {
        const advancement = this.item.getFlag(MODULE_ID, "advancement") || [];

        advancement.push({
            id: foundry.utils.randomID(),
            level: 0,
            items: []
        });

        await this.item.setFlag(MODULE_ID, "advancement", advancement);
        console.log(`${MODULE_ID} | Added new advancement entry`);
    }

    /**
     * Remove advancement entry
     */
    static async #onRemoveAdvancementEntry(event, target) {
        const entryId = target.dataset.advancementId;
        const advancement = this.item.getFlag(MODULE_ID, "advancement") || [];

        const filtered = advancement.filter(e => e.id !== entryId);
        await this.item.setFlag(MODULE_ID, "advancement", filtered);

        console.log(`${MODULE_ID} | Removed advancement entry ${entryId}`);
    }

    /**
     * Remove item from advancement entry
     */
    static async #onRemoveAdvancementItem(event, target) {
        const entryId = target.dataset.advancementId;
        const itemUuid = target.dataset.itemUuid;

        const advancement = this.item.getFlag(MODULE_ID, "advancement") || [];
        const entry = advancement.find(e => e.id === entryId);

        if (entry) {
            entry.items = entry.items.filter(i => i.uuid !== itemUuid);
            await this.item.setFlag(MODULE_ID, "advancement", advancement);
            console.log(`${MODULE_ID} | Removed item ${itemUuid} from advancement entry ${entryId}`);
        }
    }

    /* -------------------------------------------- */
    /*  Form Submission                             */
    /* -------------------------------------------- */
    async _prepareSubmitData(event, form, formData) {
        const submitData = await super._prepareSubmitData(event, form, formData);

        // Remove advancement level fields - we handle these with direct event listeners
        // This prevents them from interfering with normal form submission
        for (const key in submitData) {
            if (key.startsWith("advancement.")) {
                delete submitData[key];
            }
        }

        return submitData;
    }

}
