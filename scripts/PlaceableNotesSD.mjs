const MODULE_ID = "shadowdark-extras";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

class PlaceableNotesSD extends HandlebarsApplicationMixin(DocumentSheetV2) {
    constructor(object, options = {}) {
        options.document = object;
        super(options);
    }

    get document() {
        return this.options.document;
    }

    static DEFAULT_OPTIONS = {
        id: "sdx-placeable-notes",
        classes: ["shadowdark", "shadowdark-extras", "placeable-notes"],
        tag: "form",
        window: {
            title: "Notes",
            resizable: true
        },
        position: {
            width: 600,
            height: 400
        },
        form: {
            submitOnChange: true,
            closeOnSubmit: false
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/placeable-notes.hbs`
        }
    };

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const rawNotes = this.document.getFlag(MODULE_ID, "notes") || "";

        return {
            ...context,
            notes: rawNotes,
            enrichedNotes: await (foundry.applications?.ux?.TextEditor || TextEditor).enrichHTML(rawNotes, {
                async: true,
                secrets: this.document.isOwner,
                relativeTo: this.document
            }),
            owner: game.user.id,
            isGM: game.user.isGM
        };
    }

    // Compatibility for render calls in other files
    render(force, options) {
        if (force === true) return super.render(true, options);
        return super.render(force, options);
    }


    static _onRenderTileHUD(hud, html, data) {
        if (!game.user.isGM) return;

        const tile = hud.object;
        if (!tile) return;

        const notes = tile.document.getFlag(MODULE_ID, "notes");
        const hasNotes = !!notes;

        const title = game.i18n.localize("shadowdark-extras.notes.title") || "GM Notes";
        const button = $(`
            <div class="control-icon placeable-notes-hud ${hasNotes ? "active" : ""}" title="${title}">
                <i class="${hasNotes ? "fas fa-sticky-note" : "far fa-sticky-note"}"></i>
            </div>
        `);

        // Add click listener
        button.click((event) => {
            event.preventDefault();
            event.stopPropagation(); // vital for HUDs
            new PlaceableNotesSD(tile.document).render(true);
        });

        // Add to the HUD (left column usually has less stuff)
        $(html).find(".col.left").append(button);
    }

    static _attachHeaderButton(app, buttons) {
        if (!game.user.isGM) return;

        // Handle different app structures (document or object or token)
        const object = app.document || app.object || app.token;
        if (!object) return;

        // Supported types list
        const supportedTypes = ["AmbientLight", "AmbientSound", "Token", "Wall", "Tile", "Actor"];
        const docName = object.documentName;

        // Validation: must be a Document and one of the supported types
        if (!docName || !supportedTypes.includes(docName)) return;

        const hasNotes = !!object.getFlag(MODULE_ID, "notes");

        const noteButton = {
            label: "Notes", // Set label ensuring it appears in menus
            tooltip: "Notes",
            class: "open-sdx-notes",
            icon: hasNotes ? "fas fa-sticky-note" : "far fa-sticky-note",
            onclick: () => {
                new PlaceableNotesSD(object).render(true);
            },
            onClick: () => {
                new PlaceableNotesSD(object).render(true);
            },
            // For V2 controls compatibility if passed as controls
            action: "open-sdx-notes",
            handler: () => {
                new PlaceableNotesSD(object).render(true);
            }
        };

        // Add to beginning
        buttons.unshift(noteButton);
    }

    static _updateHeaderButton(app, [elem]) {
        if (!game.user.isGM) return;

        const object = app.document || app.object || app.token;
        if (!object) return;

        const supportedTypes = ["AmbientLight", "AmbientSound", "Token", "Wall", "Tile", "Actor"];
        if (!object.documentName || !supportedTypes.includes(object.documentName)) return;

        setTimeout(() => {
            // Find the element
            // In V2, elem might be the HTML content, so we look up to window-app
            let appElem = elem instanceof HTMLElement ? elem.closest(".window-app") : null;
            if (!appElem && app.element) appElem = app.element[0] || app.element;

            if (!appElem) return;

            const header = appElem.querySelector(".window-header");
            if (!header) return;

            // Find by class or action
            let button = header.querySelector(".open-sdx-notes");
            if (!button) button = header.querySelector("[data-action='open-sdx-notes']");

            if (!button) return;

            const notes = object.getFlag(MODULE_ID, "notes");
            const hasNotes = !!notes;

            // Update icon
            const icon = button.querySelector("i");
            if (icon) {
                icon.className = hasNotes ? "fas fa-sticky-note" : "far fa-sticky-note";
            }

            // Update Color (Green if notes exist)
            if (hasNotes) {
                button.style.color = "#4ade80";
            } else {
                button.style.color = "";
            }
        }, 150);
    }
}

export { PlaceableNotesSD };

export function initPlaceableNotes() {
    if (!game.settings.get(MODULE_ID, "enablePlaceableNotes")) return;

    // Monitor Application generally to catch everything, mirroring gm-notes approach
    // Standard Hooks
    Hooks.on("getApplicationHeaderButtons", PlaceableNotesSD._attachHeaderButton);
    Hooks.on("renderApplication", PlaceableNotesSD._updateHeaderButton);
    Hooks.on("renderTileHUD", PlaceableNotesSD._onRenderTileHUD);

    // Replicate gm-notes "watchedHooksV2" hook just in case the user has a setup using it
    Hooks.on("getHeaderControlsApplicationV2", PlaceableNotesSD._attachHeaderButton);

    // Also explicit hooks for known configs to be safe if they don't bubble Application info correctly
    const explicitApps = ["AmbientLightConfig", "AmbientSoundConfig", "TokenConfig", "WallConfig", "TileConfig", "ActorSheet"];
    explicitApps.forEach(appName => {
        Hooks.on(`get${appName}HeaderButtons`, PlaceableNotesSD._attachHeaderButton);
        Hooks.on(`render${appName}`, PlaceableNotesSD._updateHeaderButton);
    });
}
