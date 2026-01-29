/**
 * Staff Spell Manager - AppV2
 * Dialog for managing spells attached to staff weapons
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * AppV2-based dialog for managing spells on staff weapons
 */
export default class StaffSpellManager extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        classes: ["shadowdark-extras", "staff-spell-manager"],
        tag: "form",
        window: {
            frame: true,
            positioned: true,
            title: "Staff Spells Configuration",
            icon: "fas fa-wand-magic-sparkles",
            resizable: false,
            contentClasses: ["standard-form"]
        },
        position: {
            width: 450,
            height: "auto"
        },
        actions: {
            removeSpell: StaffSpellManager.#onRemoveSpell,
            restoreUses: StaffSpellManager.#onRestoreUses
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/staff-spell-config.hbs`
        }
    };

    /**
     * Constructor
     * @param {Item} weapon - The staff weapon item
     */
    constructor(weapon, options = {}) {
        super(options);
        this.weapon = weapon;
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    get title() {
        return `Staff Spells: ${this.weapon.name}`;
    }

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Get stored spells from flags
        const staffSpells = this.weapon.getFlag(MODULE_ID, "staffSpells") || [];
        const destroyAtZero = this.weapon.getFlag(MODULE_ID, "destroyAtZero") ?? false;

        context.weapon = this.weapon;
        context.spells = staffSpells;
        context.hasSpells = staffSpells.length > 0;
        context.destroyAtZero = destroyAtZero;

        return context;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    _onRender(context, options) {
        super._onRender(context, options);
        this._setupDragDrop();
        this._setupMaxUsesInputs();
        this._setupDestroyAtZeroCheckbox(context);
    }

    /**
     * Setup max uses input change handlers
     */
    _setupMaxUsesInputs() {
        const inputs = this.element.querySelectorAll(".spell-max-uses");
        if (!inputs) return;

        inputs.forEach(input => {
            input.addEventListener("change", async (event) => {
                const spellUuid = event.target.dataset.spellUuid;
                const maxUses = event.target.value ? parseInt(event.target.value) : null;

                const staffSpells = this.weapon.getFlag(MODULE_ID, "staffSpells") || [];
                const spell = staffSpells.find(s => s.uuid === spellUuid);

                if (spell) {
                    spell.maxUses = maxUses;
                    // Initialize current uses to max uses when setting for the first time
                    if (maxUses !== null && (spell.currentUses === undefined || spell.currentUses === null)) {
                        spell.currentUses = maxUses;
                    }
                    // If max uses is cleared, reset current uses
                    if (maxUses === null) {
                        spell.currentUses = null;
                    }

                    await this.weapon.setFlag(MODULE_ID, "staffSpells", staffSpells);
                    console.log(`${MODULE_ID} | Updated max uses for ${spell.name} to ${maxUses ?? "unlimited"}`);
                }
            });
        });
    }

    /**
     * Setup destroy at zero checkbox handler
     */
    _setupDestroyAtZeroCheckbox(context) {
        const checkbox = this.element.querySelector("#destroy-at-zero");
        if (!checkbox) return;

        checkbox.addEventListener("change", async (event) => {
            const enabled = event.target.checked;
            await this.weapon.setFlag(MODULE_ID, "destroyAtZero", enabled);
            console.log(`${MODULE_ID} | Set destroyAtZero to ${enabled} for weapon: ${this.weapon.name}`);
        });
    }

    /**
     * Setup drag-and-drop functionality for spell items
     */
    _setupDragDrop() {
        const dropZone = this.element.querySelector(".staff-spell-drop");
        if (!dropZone) return;

        dropZone.addEventListener("dragover", (event) => {
            event.preventDefault();
            dropZone.classList.add("drag-over");
        });

        dropZone.addEventListener("dragleave", () => {
            dropZone.classList.remove("drag-over");
        });

        dropZone.addEventListener("drop", async (event) => {
            event.preventDefault();
            dropZone.classList.remove("drag-over");
            await this._onDropSpell(event);
        });
    }

    /**
     * Handle dropping a spell item
     */
    async _onDropSpell(event) {
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

            // Validate it's a spell item
            if (!doc || !(doc instanceof Item)) {
                ui.notifications.warn("Only items can be added to staff");
                return;
            }

            if (doc.type !== "Spell") {
                ui.notifications.warn("Only spell items can be added to staff");
                return;
            }

            // Get current spells
            const staffSpells = this.weapon.getFlag(MODULE_ID, "staffSpells") || [];

            // Check for duplicates
            const exists = staffSpells.some(s => s.uuid === doc.uuid);
            if (exists) {
                ui.notifications.info(`${doc.name} is already attached to this staff`);
                return;
            }

            // Add spell with uses tracking
            staffSpells.push({
                uuid: doc.uuid,
                name: doc.name,
                img: doc.img || "icons/svg/mystery-man.svg",
                maxUses: null,      // null = unlimited
                currentUses: null   // null = unlimited
            });

            await this.weapon.setFlag(MODULE_ID, "staffSpells", staffSpells);
            ui.notifications.info(`Added ${doc.name} to staff`);

            // Re-render to show the new spell
            this.render();

        } catch (err) {
            console.error(`${MODULE_ID} | Error handling spell drop:`, err);
            ui.notifications.error("Failed to add spell to staff");
        }
    }

    /**
     * Handle removing a spell from the staff
     */
    static async #onRemoveSpell(event, target) {
        const spellUuid = target.dataset.spellUuid;
        if (!spellUuid) return;

        const staffSpells = this.weapon.getFlag(MODULE_ID, "staffSpells") || [];
        const filtered = staffSpells.filter(s => s.uuid !== spellUuid);

        await this.weapon.setFlag(MODULE_ID, "staffSpells", filtered);
        ui.notifications.info("Spell removed from staff");

        // Re-render to update the list
        this.render();
    }

    /**
     * Handle restoring uses for a spell
     */
    static async #onRestoreUses(event, target) {
        const spellUuid = target.dataset.spellUuid;
        if (!spellUuid) return;

        const staffSpells = this.weapon.getFlag(MODULE_ID, "staffSpells") || [];
        const spell = staffSpells.find(s => s.uuid === spellUuid);

        if (spell && spell.maxUses !== null) {
            spell.currentUses = spell.maxUses;
            await this.weapon.setFlag(MODULE_ID, "staffSpells", staffSpells);
            ui.notifications.info(`Restored uses for ${spell.name}`);

            // Re-render to update the display
            this.render();
        }
    }
}
