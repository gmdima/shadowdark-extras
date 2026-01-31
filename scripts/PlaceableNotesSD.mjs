const MODULE_ID = "shadowdark-extras";

class PlaceableNotesSD extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sdx-placeable-notes",
            classes: ["shadowdark", "shadowdark-extras", "placeable-notes"],
            title: "Notes",
            template: `modules/${MODULE_ID}/templates/placeable-notes.hbs`,
            width: 600,
            height: 400,
            resizable: true,
            closeOnSubmit: true,
            submitOnClose: true
        });
    }

    async getData() {
        const notes = this.object.getFlag(MODULE_ID, "notes") || "";
        return {
            notes: await TextEditor.enrichHTML(notes, { async: true }),
            owner: game.user.id,
            isGM: game.user.isGM
        };
    }

    async _updateObject(event, formData) {
        if (!game.user.isGM) return;
        await this.object.setFlag(MODULE_ID, "notes", formData[`flags.${MODULE_ID}.notes`]);
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

        // Debug logging to specific scenarios (Token and Actor sheets)
        if (app.constructor.name.includes("Token") || app.constructor.name.includes("Actor") || docName === "Actor") {
            console.log("Shadowdark Extras | Placeable Notes | Checking App:", {
                appConstructor: app.constructor.name,
                app,
                object,
                documentName: docName,
                supportedTypes
            });
            if (!docName || !supportedTypes.includes(docName)) {
                console.warn("Shadowdark Extras | Placeable Notes | Rejected due to missing/unsupported docName:", docName);
            }
        }

        // Validation: must be a Document and one of the supported types
        if (!docName || !supportedTypes.includes(docName)) return;

        const hasNotes = !!object.getFlag(MODULE_ID, "notes");

        const noteButton = {
            label: "Notes", // Set label ensuring it appears in menus
            tooltip: "Notes",
            class: "open-sdx-notes",
            icon: hasNotes ? "fas fa-sticky-note" : "far fa-sticky-note",
            onclick: () => {
                console.log("Shadowdark Extras | Placeable Notes clicked (onclick)");
                new PlaceableNotesSD(object).render(true);
            },
            onClick: () => {
                console.log("Shadowdark Extras | Placeable Notes clicked (onClick)");
                new PlaceableNotesSD(object).render(true);
            },
            // For V2 controls compatibility if passed as controls
            action: "open-sdx-notes",
            handler: () => {
                console.log("Shadowdark Extras | Placeable Notes clicked (handler)");
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

        // Introduce a delay to ensure the page is fully updated (Ported from gm-notes)
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
    // gm-notes monitors 'ActorSheet', 'ItemSheet', 'Application'
    // We only care about placeables, effectively covered by Application

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
