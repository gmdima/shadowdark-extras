/**
 * Creature Types Editor Application
 * Allows GMs to create, edit, and delete custom NPC creature types/subtypes.
 */

import { CREATURE_TYPE_MAP } from "../data/creature-type-map.mjs";

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Default creature types (D&D standard types)
 */
export const DEFAULT_CREATURE_TYPES = [
    "",            // None/Unset
    "Aberration",
    "Animal",
    "Celestial",
    "Construct",
    "Dinosaur",
    "Dragon",
    "Elemental",
    "Fey",
    "Fiend",
    "Giant",
    "Golem",
    "Humanoid",
    "Insect",
    "Legendary",
    "Monstrosity",
    "Ooze",
    "Outsider",
    "Plant",
    "Swarm",
    "Undead"
];

/**
 * Get the current list of creature types
 * Returns custom types if defined, otherwise defaults
 * @returns {string[]}
 */
export function getCreatureTypes() {
    try {
        const customTypes = game.settings.get(MODULE_ID, "customCreatureTypes");
        if (customTypes && Array.isArray(customTypes) && customTypes.length > 0) {
            // Ensure empty string is first for "None" option
            if (!customTypes.includes("")) {
                return ["", ...customTypes];
            }
            return customTypes;
        }
    } catch (e) {
        console.warn(`${MODULE_ID} | Error reading customCreatureTypes setting:`, e);
    }
    return DEFAULT_CREATURE_TYPES;
}

/**
 * Save custom creature types
 * @param {string[]} types - Array of creature type strings
 */
export async function saveCreatureTypes(types) {
    // Ensure empty string is first and filter out duplicates
    const uniqueTypes = [...new Set(types.filter(t => t !== ""))];
    const finalTypes = ["", ...uniqueTypes];
    await game.settings.set(MODULE_ID, "customCreatureTypes", finalTypes);
}

/**
 * Normalize a monster/NPC name to a CREATURE_TYPE_MAP key
 * (uppercase, single-spaced, straight apostrophes).
 * @param {string} name
 * @returns {string}
 */
export function normalizeMonsterName(name) {
    return String(name ?? "").toUpperCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * Look up the mapped (default) creature type for a name, with fallbacks for
 * tiered/variant names. Returns "" if unknown.
 * @param {string} name
 * @returns {string}
 */
export function getMappedType(name) {
    const key = normalizeMonsterName(name);
    if (!key) return "";
    if (CREATURE_TYPE_MAP[key]) return CREATURE_TYPE_MAP[key];
    // Fallback: strip an Elemental-style tier suffix, e.g. "ELEMENTAL, FIRE (GREATER)"
    const noTier = key.replace(/\s*\((?:GREATER|LESSER)\)\s*$/g, "").trim();
    if (noTier !== key && CREATURE_TYPE_MAP[noTier]) return CREATURE_TYPE_MAP[noTier];
    // Fallback: strip variant qualifiers, e.g. "BASILISK HATCHLING" -> "BASILISK"
    const noVariant = key.replace(/\b(?:HATCHLING|ADULT|YOUNG|GREATER|LESSER)\b/g, "").replace(/\s+/g, " ").trim();
    if (noVariant !== key && CREATURE_TYPE_MAP[noVariant]) return CREATURE_TYPE_MAP[noVariant];
    return "";
}

/**
 * Effective creature type for an actor (or plain {name, flags} object):
 * manual flag override > bestiary map > "" (none).
 * @param {Actor|object} actor
 * @returns {string}
 */
export function getEffectiveCreatureType(actor) {
    if (!actor) return "";
    let flagVal = "";
    try {
        flagVal = typeof actor.getFlag === "function"
            ? (actor.getFlag(MODULE_ID, "creatureType") || "")
            : (actor.flags?.[MODULE_ID]?.creatureType || "");
    } catch (e) {
        flagVal = "";
    }
    if (flagVal) return flagVal;
    return getMappedType(actor.name);
}

/**
 * GM tool: write the mapped creature type onto world NPC actors that lack an
 * explicit creatureType flag. Does NOT touch compendiums.
 * @param {object} [opts]
 * @param {boolean} [opts.overwrite=false] - also overwrite actors with an existing flag
 * @returns {Promise<{updated:number, skipped:number, unmatched:number, failed:number, total:number}>}
 */
export async function bakeCreatureTypesToWorldActors({ overwrite = false } = {}) {
    if (!game.user?.isGM) {
        ui.notifications?.warn("Only a GM can bake creature types.");
        return { updated: 0, skipped: 0, unmatched: 0, failed: 0, total: 0 };
    }
    const npcs = game.actors.filter(a => a.type === "NPC");
    let updated = 0, skipped = 0, unmatched = 0, failed = 0;
    for (const actor of npcs) {
        const existing = actor.getFlag(MODULE_ID, "creatureType") || "";
        if (existing && !overwrite) { skipped++; continue; }
        const mapped = getMappedType(actor.name);
        if (!mapped) { unmatched++; continue; }
        if (existing === mapped) { skipped++; continue; }
        try {
            await actor.setFlag(MODULE_ID, "creatureType", mapped);
            updated++;
        } catch (e) {
            console.warn(`${MODULE_ID} | bake creature type failed for ${actor.name}:`, e);
            failed++;
        }
    }
    return { updated, skipped, unmatched, failed, total: npcs.length };
}

/**
 * Application for managing custom creature types
 */
export class CreatureTypesApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "creature-types-app",
        classes: ["shadowdark-extras", "creature-types-app"],
        window: {
            title: "SHADOWDARK_EXTRAS.creature_types.editor_title",
            resizable: true
        },
        position: {
            width: 400,
            height: 500
        }
    };

    static PARTS = {
        form: {
            template: "modules/shadowdark-extras/templates/creature-types-app.hbs",
            scrollable: [".types-list"]
        }
    };

    async _prepareContext(options) {
        const types = getCreatureTypes().filter(t => t !== "");
        return {
            types,
            hasTypes: types.length > 0
        };
    }

    _onRender(context, options) {
        const html = this.element;
        if (!html) return;

        // Add new type
        html.querySelector('[data-action="add-type"]')?.addEventListener("click", () => {
            const input = html.querySelector("#new-type-input");
            const newType = input?.value?.trim();
            if (newType) {
                this._addType(newType);
                if (input) input.value = "";
            }
        });

        // Allow Enter key to add
        html.querySelector("#new-type-input")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                html.querySelector('[data-action="add-type"]')?.click();
            }
        });

        // Delete type (event delegation)
        html.addEventListener("click", (event) => {
            const deleteBtn = event.target.closest('[data-action="delete-type"]');
            if (deleteBtn) {
                const typeToDelete = deleteBtn.dataset.type;
                this._deleteType(typeToDelete);
            }
        });

        // Reset to defaults
        html.querySelector('[data-action="reset-defaults"]')?.addEventListener("click", async () => {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.reset_confirm_title") },
                content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.reset_confirm_content")}</p>`,
                modal: true
            });
            if (confirmed) {
                await saveCreatureTypes(DEFAULT_CREATURE_TYPES.filter(t => t !== ""));
                this.render();
                ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.reset_success"));
            }
        });

        // Export types
        html.querySelector('[data-action="export-types"]')?.addEventListener("click", () => this._exportTypes());

        // Import types
        html.querySelector('[data-action="import-types"]')?.addEventListener("click", () => this._importTypes());

        // Bake mapped creature types onto world actors
        html.querySelector('[data-action="bake-types"]')?.addEventListener("click", () => this._bakeWorldActors());
    }

    /**
     * Add a new creature type
     */
    async _addType(newType) {
        const currentTypes = getCreatureTypes().filter(t => t !== "");
        if (currentTypes.includes(newType)) {
            ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.type_exists"));
            return;
        }
        currentTypes.push(newType);
        currentTypes.sort((a, b) => a.localeCompare(b));
        await saveCreatureTypes(currentTypes);
        this.render();
        ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.creature_types.type_added", { type: newType }));
    }

    /**
     * Delete a creature type
     */
    async _deleteType(typeToDelete) {
        const currentTypes = getCreatureTypes().filter(t => t !== "" && t !== typeToDelete);
        await saveCreatureTypes(currentTypes);
        this.render();
        ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.creature_types.type_deleted", { type: typeToDelete }));
    }

    /**
     * Export types as JSON
     */
    _exportTypes() {
        const types = getCreatureTypes().filter(t => t !== "");
        const exportData = {
            type: "shadowdark-creature-types",
            version: 1,
            creatureTypes: types
        };

        const filename = "creature_types.json";
        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "application/json", filename);

        ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.export_success"));
    }

    /**
     * Import types from JSON
     */
    async _importTypes() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";

        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importData = JSON.parse(text);

                if (importData.type !== "shadowdark-creature-types" || !Array.isArray(importData.creatureTypes)) {
                    ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.invalid_import"));
                    return;
                }

                await saveCreatureTypes(importData.creatureTypes);
                this.render();
                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.creature_types.import_success", {
                    count: importData.creatureTypes.length
                }));
            } catch (err) {
                console.error(`${MODULE_ID} | Failed to import creature types:`, err);
                ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.import_error"));
            }
        };

        input.click();
    }

    /**
     * GM action: apply mapped creature types to world NPC actors that lack one.
     */
    async _bakeWorldActors() {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.bake_confirm_title") },
            content: `<p>${game.i18n.localize("SHADOWDARK_EXTRAS.creature_types.bake_confirm_content")}</p>`,
            modal: true
        });
        if (!confirmed) return;
        const res = await bakeCreatureTypesToWorldActors();
        ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.creature_types.bake_result", {
            updated: res.updated,
            skipped: res.skipped,
            unmatched: res.unmatched,
            total: res.total
        }));
    }
}

/**
 * Open the creature types editor
 */
export function openCreatureTypesEditor() {
    new CreatureTypesApp().render({ force: true });
}
