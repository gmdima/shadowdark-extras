const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Medkit Application for Shadowdark
 * Scans actor items and compares them with the Shadowdark Extras compendium
 * allowing users to update their items to the enhanced versions.
 */
export function initMedkit() {
    Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
        // Only show for actor owners
        if (!sheet.actor.isOwner) return;

        buttons.unshift({
            label: "Medkit",
            class: "sdx-medkit",
            icon: "fas fa-kit-medical",
            onclick: () => new MedkitApp({ document: sheet.actor }).render(true)
        });
    });
}

export class MedkitApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.actor = options.document;
        this.packId = "shadowdark-extras.pack-sdxitems";
    }

    static DEFAULT_OPTIONS = {
        tag: "form",
        id: "sdx-medkit",
        window: {
            title: "Shadowdark Extras Medkit",
            icon: "fas fa-kit-medical",
            resizable: true,
            controls: [],
            classes: ["shadowdark", "sdx-medkit-window"]
        },
        position: {
            width: 550,
            height: "auto"
        },
        form: {
            handler: MedkitApp.formHandler,
            submitOnChange: false,
            closeOnSubmit: false
        },
        actions: {
            updateItem: MedkitApp.onUpdateItem,
            updateAll: MedkitApp.onUpdateAll
        }
    };

    static PARTS = {
        form: {
            template: "modules/shadowdark-extras/templates/medkit.hbs",
            scrollable: [".sdx-medkit-list"]
        }
    };

    /** @override */
    async _prepareContext(options) {
        const pack = game.packs.get(this.packId);
        if (!pack) {
            return { error: `Compendium ${this.packId} not found.` };
        }

        // Get index with UUID
        const index = await pack.getIndex();

        const updatesAvailable = [];
        const upToDate = [];

        // Filter actor items that have matches in the compendium
        for (const item of this.actor.items) {
            // Restrict to Spells only per user request
            if (item.type !== "Spell") continue;

            // Find match by name and type
            // We strip whitespace and ignore case for broader matching
            const match = index.find(i =>
                i.name.trim().toLowerCase() === item.name.trim().toLowerCase() &&
                i.type === item.type
            );

            if (match) {
                const sourceId = item.getFlag("shadowdark-extras", "sourceId") || item.getFlag("core", "sourceId");
                const compendiumUuid = match.uuid;

                // Check if already linked to this compendium item
                const isLinked = sourceId === compendiumUuid || (sourceId && sourceId.endsWith(match._id));

                let isDiff = false;

                // If linked, check if data is different
                if (isLinked) {
                    // We must fetch the full document to compare data
                    const compendiumItem = await pack.getDocument(match._id);
                    if (compendiumItem) {
                        isDiff = this._isItemDifferent(item, compendiumItem);
                    }
                }

                // It is an update if it's NOT linked, OR if it IS linked but has different data
                const isUpdate = !isLinked || isDiff;

                console.log(`Medkit Debug: ${item.name} | Linked: ${isLinked} | Diff: ${isDiff}`);

                const itemData = {
                    name: item.name,
                    img: item.img,
                    id: item.id,
                    compendiumUuid: compendiumUuid,
                    currentSource: sourceId || "Unknown/Vanilla",
                    statusLabel: isDiff ? "New Version" : (isLinked ? "Up to Date" : "Update Available")
                };

                if (isUpdate) {
                    updatesAvailable.push(itemData);
                } else {
                    upToDate.push(itemData);
                }
            }
        }

        // Sort items by name
        updatesAvailable.sort((a, b) => a.name.localeCompare(b.name));
        upToDate.sort((a, b) => a.name.localeCompare(b.name));

        return {
            actor: this.actor,
            updatesAvailable,
            upToDate,
            hasUpdates: updatesAvailable.length > 0,
            hasUpToDate: upToDate.length > 0,
            updateCount: updatesAvailable.length
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async onUpdateItem(event, target) {
        const itemId = target.dataset.itemId;
        const compendiumUuid = target.dataset.uuid;
        await this._updateItem(itemId, compendiumUuid);
    }

    static async onUpdateAll(event, target) {
        await this._updateAll();
    }

    static async formHandler(event, form, formData) {
        // No default submission handling needed
    }


    /* -------------------------------------------- */
    /*  Comparison Logic                            */
    /* -------------------------------------------- */

    _isItemDifferent(actorItem, compendiumItem) {
        // Prepare clean objects
        const cleanActor = this._cleanData(actorItem.toObject());
        const cleanComp = this._cleanData(compendiumItem.toObject());

        const isDiff = !foundry.utils.objectsEqual(cleanActor, cleanComp);

        if (isDiff) {
            const diff = foundry.utils.diffObject(cleanActor, cleanComp);
            // Ignore if diff is empty (means equal)
            if (!foundry.utils.isEmpty(diff)) {
                console.log(`Medkit Diff [${actorItem.name}]:`, diff);
                console.log("Clean Actor:", cleanActor);
                console.log("Clean Comp:", cleanComp);
                return true;
            }
            return false;
        }
        return false;
    }

    _cleanData(data) {
        // Remove standard foundry junk
        delete data._id;
        delete data.folder;
        delete data.sort;
        delete data.ownership;
        delete data._stats;

        // Remove dynamic tracking fields
        if (data.system) {
            delete data.system.quantity;
            delete data.system.equipped;
            delete data.system.stashed;
            delete data.system.lost; // Spell lost status
            delete data.system.uses; // Item uses
        }

        // Clean Active Effects
        if (data.effects) {
            data.effects.forEach(e => {
                delete e._id;
                delete e.origin; // Origin usually points to actor uuid or item uuid
                delete e.duration?.startTime;
                delete e._stats;
                delete e.disabled; // Maybe enabled state changes?
                // We typically want to update the effect structure, but maybe not enabled state?
                // If the user disabled an effect, we don't want to flag an update just for that.
                // But if the compendium has it enabled/disabled differently?
                // For now, let's ignore 'disabled' state to avoid noise.
                delete e.disabled;
            });
        }

        // Remove tracking flags
        if (data.flags) {
            if (data.flags.core) delete data.flags.core.sourceId;
            if (data.flags["shadowdark-extras"]) delete data.flags["shadowdark-extras"].sourceId;

            // Clean empty flag containers
            if (foundry.utils.isEmpty(data.flags.core)) delete data.flags.core;
            if (foundry.utils.isEmpty(data.flags["shadowdark-extras"])) delete data.flags["shadowdark-extras"];
            if (foundry.utils.isEmpty(data.flags)) delete data.flags;
        }

        return data;
    }

    /* -------------------------------------------- */
    /*  Update Logic                                */

    async _updateItem(itemId, compendiumUuid) {
        await this._performUpdate(itemId, compendiumUuid);
        // Re-render to show updated state (item moves to "Up to Date" list)
        this.render();
    }

    async _performUpdate(itemId, compendiumUuid) {
        const item = this.actor.items.get(itemId);
        const compendiumItem = await fromUuid(compendiumUuid);

        if (!item || !compendiumItem) return;

        // Prepare update data
        const updateData = compendiumItem.toObject();

        // Preserve specific properties that shouldn't change
        delete updateData._id; // Keep original ID
        delete updateData.folder;
        delete updateData.sort;
        delete updateData.ownership;

        // Ensure flags are merged properly, but we want to overwrite mostly
        // We use a custom flag to ensure it persists reliably, as core.sourceId can be finicky
        foundry.utils.setProperty(updateData, "flags.shadowdark-extras.sourceId", compendiumUuid);
        // Also try to set core sourceId for compatibility
        foundry.utils.setProperty(updateData, "flags.core.sourceId", compendiumUuid);

        // Notify user (optional, maybe too spammy for batch? kept for single)
        // For batch, we'll notify once at start/end.
        // But since this is shared, we might suppress notification in batch?
        // Let's just keep it simple.

        await item.update(updateData);
    }

    async _updateAll() {
        // We need to re-scan or just get the data from context. 
        // Since actions don't pass context, we can query DOM or re-calculate.
        // Querying DOM is easier for listed items.
        const buttons = this.element.querySelectorAll("[data-action='updateItem']");

        if (buttons.length === 0) return;

        const confirm = await Dialog.confirm({
            title: "Update All Items?",
            content: `<p>Are you sure you want to update ${buttons.length} items from the Shadowdark Extras compendium? This will overwrite their data.</p>`,
            yes: () => true,
            no: () => false
        });

        if (!confirm) return;

        ui.notifications.info(`Starting batch update of ${buttons.length} items...`);

        for (const btn of buttons) {
            const itemId = btn.dataset.itemId;
            const uuid = btn.dataset.uuid;
            await this._performUpdate(itemId, uuid);
        }

        ui.notifications.info("Batch update complete!");
        this.close();
    }
}
