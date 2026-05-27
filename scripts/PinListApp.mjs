/**
 * Application for displaying a list of journal pins on the current scene
 */
import { JournalPinManager } from "./JournalPinsSD.mjs";

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PinListApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static _instance = null;

    static DEFAULT_OPTIONS = {
        id: "sdx-pin-list",
        classes: ["shadowdark", "shadowdark-extras", "pin-list-app"],
        window: {
            title: "SHADOWDARK_EXTRAS.pinList.title",
            resizable: true
        },
        position: {
            width: 400,
            height: 500
        }
    };

    static PARTS = {
        form: {
            template: `modules/${MODULE_ID}/templates/pin-list.hbs`,
            scrollable: [".pin-list-container"]
        }
    };

    static show() {
        if (this._instance) {
            this._instance.render({ force: true });
        } else {
            this._instance = new PinListApp();
            this._instance.render({ force: true });
        }
        return this._instance;
    }

    async _prepareContext(options) {
        if (!canvas.scene) {
            return { pins: [], MODULE_ID };
        }

        // Get all pins for the current scene
        const pins = JournalPinManager.list({ sceneId: canvas.scene.id });

        // Enrich pin data
        const enrichedPins = pins.map(pin => {
            let pinName = pin.label || "Unnamed Pin";
            let pageName = "";

            // If the pin is linked to a journal/page, try to get its name
            if (pin.journalId) {
                const journal = game.journal.get(pin.journalId);
                if (journal) {
                    if (pin.pageId) {
                        const page = journal.pages.get(pin.pageId);
                        if (page) {
                            if (pinName === "New Pin" || pinName === "Journal Pin") {
                                pinName = page.name;
                            }
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

            // Fallback: If still default name, try to use Tooltip Title
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
                    if (pin.journalId && pin.pageId) {
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

            const backgroundColor = style.fillColor || "#000000";
            const borderColor = style.ringColor || "#ffffff";

            return {
                id: pin.id,
                x: pin.x,
                y: pin.y,
                name: pinName,
                pageName,
                displayType,
                displayContent,
                displayStyle,
                displayClass,
                backgroundColor,
                borderColor,
                icon: displayType === "icon" ? displayClass : "fas fa-map-pin"
            };
        });

        // Sort alphabetically
        enrichedPins.sort((a, b) => a.name.localeCompare(b.name));

        return { pins: enrichedPins, MODULE_ID };
    }

    _onRender(context, options) {
        const html = this.element;
        if (!html) return;

        // Pan to pin (event delegation handles both .pin-entry click and pan control)
        html.addEventListener("click", (ev) => {
            const entry = ev.target.closest(".pin-entry");
            if (!entry) return;
            // Ignore clicks on other controls (none today, but future-proof)
            if (ev.target.closest(".pin-control") && ev.target.closest(".pin-control").dataset.action !== "pan") return;

            const x = parseInt(entry.dataset.x);
            const y = parseInt(entry.dataset.y);
            if (!isNaN(x) && !isNaN(y)) {
                canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
            }
        });
    }

    async close(options) {
        PinListApp._instance = null;
        return super.close(options);
    }
}

// Hooks to ensure the Pin List updates when pins change or scene changes
Hooks.on("updateScene", (document, change, options, userId) => {
    if (change.flags?.[MODULE_ID]?.journalPins) {
        if (PinListApp._instance && PinListApp._instance.rendered) {
            PinListApp._instance.render();
        }
    }
});

Hooks.on("canvasReady", () => {
    if (PinListApp._instance && PinListApp._instance.rendered) {
        PinListApp._instance.render();
    }
});
