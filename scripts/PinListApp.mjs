/**
 * Application for displaying a list of journal pins on the current scene
 */
import { JournalPinManager } from "./JournalPinsSD.mjs";

const MODULE_ID = "shadowdark-extras";

export class PinListApp extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sdx-pin-list",
            title: game.i18n.localize("SHADOWDARK_EXTRAS.pinList.title") || "Journal Pin List",
            template: `modules/${MODULE_ID}/templates/pin-list.hbs`,
            classes: ["shadowdark", "shadowdark-extras", "pin-list-app"],
            width: 400,
            height: 500,
            resizable: true,
            closeOnSubmit: false,
            submitOnChange: false,
            scrollY: [".pin-list-container"]
        });
    }

    static _instance = null;

    static show() {
        if (this._instance) {
            this._instance.render(true);
        } else {
            this._instance = new PinListApp();
            this._instance.render(true);
        }
        return this._instance;
    }

    async getData(options = {}) {
        if (!canvas.scene) {
            return { pins: [] };
        }

        // Get all pins for the current scene
        const pins = JournalPinManager.list({ sceneId: canvas.scene.id });

        // Enrich pin data
        const enrichedPins = pins.map(pin => {
            let pinName = pin.label || "Unnamed Pin";
            let pageName = "";
            let icon = pin.style?.iconClass || "fas fa-map-pin";

            // If the pin is linked to a journal/page, try to get its name
            if (pin.journalId) {
                const journal = game.journal.get(pin.journalId);
                if (journal) {
                    if (pin.pageId) {
                        const page = journal.pages.get(pin.pageId);
                        if (page) {
                            // If label is default "New Pin" or "Journal Pin", use page name
                            if (pinName === "New Pin" || pinName === "Journal Pin") {
                                pinName = page.name;
                            }
                            // Or maybe show Journal Name > Page Name
                            pageName = `${journal.name} • ${page.name}`;
                        } else {
                            pageName = journal.name;
                        }
                    } else {
                        if (pinName === "New Pin" || pinName === "Journal Pin") {
                            pinName = journal.name;
                        }
                    }
                }
            }

            // Fallback: If still default name "New Pin", try to use Tooltip Title
            if ((pinName === "New Pin" || pinName === "Journal Pin") && pin.tooltipTitle) {
                pinName = pin.tooltipTitle;
            }

            // Determine Display Type & Content
            const style = pin.style || {};
            const contentType = style.contentType || (style.showIcon ? "symbol" : "number");

            let displayType = "icon";
            let displayContent = "";
            let displayStyle = "";
            let displayClass = "";

            if (contentType === "symbol" || contentType === "icon") {
                displayType = "icon";
                displayClass = style.symbolClass || style.iconClass || "fa-solid fa-map-pin";
                displayStyle = `color: ${style.symbolColor || style.fontColor || "#ffffff"};`;
            }
            else if (contentType === "customIcon" && style.customIconPath) {
                displayType = "image";
                displayContent = style.customIconPath;
            }
            else {
                // Text or Number
                displayType = "text";
                displayStyle = `
                    color: ${style.fontColor || "#ffffff"}; 
                    font-family: ${style.fontFamily || "Arial"};
                    font-weight: ${style.fontWeight || "bold"};
                    font-size: 16px;
                `;

                if (contentType === "text") {
                    displayContent = style.customText || "";
                } else {
                    // Number logic
                    if (pin.journalId && pin.pageId) {
                        // Find page index
                        const journal = game.journal.get(pin.journalId);
                        if (journal) {
                            const sortedPages = journal.pages.contents.sort((a, b) => a.sort - b.sort);
                            const idx = sortedPages.findIndex(p => p.id === pin.pageId);
                            displayContent = idx >= 0 ? idx : 0;
                        } else {
                            displayContent = "0";
                        }
                    } else {
                        displayContent = "0";
                    }
                }
            }

            let backgroundColor = style.fillColor || "#000000";
            let borderColor = style.ringColor || "#ffffff";

            return {
                id: pin.id,
                x: pin.x,
                y: pin.y,
                name: pinName,
                pageName: pageName,
                displayType,
                displayContent,
                displayStyle,
                displayClass,
                backgroundColor,
                borderColor,
                // Legacy support
                icon: displayType === 'icon' ? displayClass : "fas fa-map-pin"
            };
        });

        // Sort alphabetically
        enrichedPins.sort((a, b) => a.name.localeCompare(b.name));

        return {
            pins: enrichedPins,
            MODULE_ID
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Pan to pin
        html.find(".pin-entry, .pin-control[data-action='pan']").on("click", (ev) => {
            const $entry = $(ev.currentTarget).closest(".pin-entry");
            const x = parseInt($entry.data("x"));
            const y = parseInt($entry.data("y"));

            if (!isNaN(x) && !isNaN(y)) {
                canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
            }
        });
    }

    // Override close to clear the instance
    async close(options) {
        PinListApp._instance = null;
        return super.close(options);
    }

    async _updateObject(event, formData) {
        // No form data to save
    }
}

// Hooks to ensure the Pin List updates when pins change or scene changes
Hooks.on("updateScene", (document, change, options, userId) => {
    // Check if the update involves the flags for this module
    if (change.flags?.[MODULE_ID]?.journalPins) {
        // Refresh if the app is open
        if (PinListApp._instance && PinListApp._instance.rendered) {
            PinListApp._instance.render(true);
        }
    }
});

Hooks.on("canvasReady", () => {
    // specific hook to update when switching scenes
    if (PinListApp._instance && PinListApp._instance.rendered) {
        PinListApp._instance.render(true);
    }
});
