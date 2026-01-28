/**
 * Character Tray Application
 *
 * V2 Application for displaying the character tray.
 * Uses Handlebars templates for rendering.
 * Ported from coffee-pub-squire module.
 */

import {
    setViewMode,
    getViewMode,
    cycleViewMode,
    openTokenSheet,
    selectToken,
    selectPartyTokens,
    clearTokenSelection,
    switchToActor,
    getHealthOverlayHeight
} from "./TraySD.mjs";
import { showLeaderDialog, showMovementModeDialog } from "./MarchingModeSD.mjs";
import { FormationSpawnerSD } from "./FormationSpawnerSD.mjs";
import { PinPlacer } from "./JournalPinsSD.mjs";
import { PinListApp } from "./PinListApp.mjs";
import { GetRollDataSD } from "./sdx-rolls/GetRollDataSD.mjs";
import { SdxRollSD } from "./sdx-rolls/SdxRollSD.mjs";
import { getSDXROLLSSetting } from "./sdx-rolls/SdxRollsSD.mjs";
import { PlaceableNotesSD } from "./PlaceableNotesSD.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "shadowdark-extras";

export class TrayApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-tray",
        tag: "div",
        position: {
            width: "auto",
            height: "auto",
        },
        window: {
            frame: false,
            positioned: false,
        },
    };

    static PARTS = {
        main: {
            template: "modules/shadowdark-extras/templates/sdx-tray/tray.hbs"
        }
    };

    constructor(data = {}, options = {}) {
        super(options);
        this.trayData = data;
        this._isExpanded = false;
        this._pinSearchTerm = "";
    }

    /**
     * Update the tray data and re-render
     * @param {Object} data - Tray data
     */
    updateData(data) {
        this.trayData = data;
        this.render();
    }

    /**
     * Toggle expanded state
     */
    toggleExpanded() {
        this._isExpanded = !this._isExpanded;
        this._applyExpandedState();
    }

    /**
     * Set expanded state
     */
    setExpanded(expanded) {
        this._isExpanded = expanded;
        this._applyExpandedState();
    }

    /**
     * Apply the expanded state to the DOM
     */
    _applyExpandedState() {
        const elem = document.querySelector(".sdx-tray");
        if (elem) {
            elem.classList.toggle("expanded", this._isExpanded);
        }
    }

    /**
     * Check if tray is expanded
     * @returns {boolean}
     */
    isExpanded() {
        return this._isExpanded;
    }

    /**
     * Prepare context data for the template
     */
    _prepareContext(options) {
        return {
            ...this.trayData,
            isExpanded: this._isExpanded,
            viewMode: getViewMode(),
            pinSearchTerm: this._pinSearchTerm
        };
    }



    /**
     * Attach event listeners after render
     */
    _onRender(context, options) {
        super._onRender(context, options);

        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;

        // Toggle button - click to expand/collapse
        elem.querySelector(".tray-handle-button-toggle")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleExpanded();
        });

        // View cycle button
        elem.querySelector(".tray-handle-button-viewcycle")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cycleViewMode();
        });

        // GM Tools Buttons
        elem.querySelector(".tray-handle-button-tool[data-action='leader']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showLeaderDialog();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='marching']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showMovementModeDialog();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='formation']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            FormationSpawnerSD.show();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='add-pin']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            PinPlacer.activate();
        });

        elem.querySelector("[data-action='add-condition']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const actor = this.trayData?.actor;
            if (!actor) return;

            // Use the Shadowdark Extras API to show the condition selector
            const moduleApi = game.modules.get("shadowdark-extras")?.api;
            if (moduleApi && moduleApi.getConditionsData && moduleApi.showConditionsModal) {
                const conditionData = await moduleApi.getConditionsData();
                const theme = game.settings.get("shadowdark-extras", "conditionsTheme") || "parchment";
                moduleApi.showConditionsModal(actor, conditionData, theme);
            } else {
                console.warn("Shadowdark Extras Tray | Condition toggler API not found.");
                ui.notifications.warn("Condition toggler API not found. Please reload.");
            }
        });

        elem.querySelector(".tray-handle-button-tool[data-action='pin-list']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            setViewMode("pins");
            this.setExpanded(true);
        });

        // SDX Roll Button
        elem.querySelector(".tray-handle-button-tool[data-action='sdx-roll']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            new GetRollDataSD().render(true);
        });

        elem.querySelector(".tray-handle-button-tool[data-action='sdx-roll']")?.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();

            const btn = e.currentTarget;
            const existingMenu = document.querySelector(".sdx-recent-rolls");
            if (existingMenu) {
                existingMenu.remove();
                return;
            }

            const recentRolls = getSDXROLLSSetting("recentRolls");
            if (!recentRolls || recentRolls.length === 0) return;

            const wrapper = document.createElement("div");
            const ul = document.createElement("ul");
            wrapper.appendChild(ul);
            wrapper.classList.add("sdx-recent-rolls");

            recentRolls.forEach((roll) => {
                const li = document.createElement("li");
                li.innerHTML = SdxRollSD.getRollLabel(roll.type, roll.options.DC, roll.contest, roll.options);
                ul.appendChild(li);
                li.addEventListener("click", () => {
                    new GetRollDataSD(roll).render(true);
                    wrapper.remove();
                });
            });

            // Position to the right of the button
            const rect = btn.getBoundingClientRect();
            wrapper.style.position = "fixed";
            wrapper.style.left = `${rect.right + 10}px`;
            wrapper.style.top = `${rect.top}px`;
            wrapper.style.bottom = "auto";
            wrapper.style.right = "auto";
            wrapper.style.zIndex = "100"; // Ensure visibility

            document.body.appendChild(wrapper);

            const listener = (event) => {
                if (!wrapper.contains(event.target) && event.target !== btn) {
                    wrapper.remove();
                    document.removeEventListener("click", listener);
                    document.removeEventListener("contextmenu", listener);
                }
            };

            setTimeout(() => {
                document.addEventListener("click", listener);
                document.addEventListener("contextmenu", listener);
            }, 10);
        });

        // Light Tracker Button
        elem.querySelector(".tray-handle-button-tool[data-action='light-tracker']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (game.shadowdark?.lightSourceTracker?.toggleInterface) {
                game.shadowdark.lightSourceTracker.toggleInterface();
            } else {
                ui.notifications.warn("Light Source Tracker not found. Ensure the system is updated.");
            }
        });

        // Carousing Button
        elem.querySelector(".tray-handle-button-tool[data-action='carousing']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (window.sdxOpenCarousingOverlay) {
                window.sdxOpenCarousingOverlay();
            } else {
                ui.notifications.warn("Carousing system not ready.");
            }
        });

        // Tab buttons
        elem.querySelectorAll(".tray-tab-button").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = btn.dataset.view;
                if (view) setViewMode(view);
            });
        });

        // Party card clicks
        elem.querySelectorAll(".party-card").forEach(card => {
            card.addEventListener("click", (e) => {
                // Don't trigger if clicking a specific action button
                if (e.target.closest(".party-card-actions")) return;

                const tokenId = card.dataset.tokenId;
                if (tokenId) {
                    selectToken(tokenId);
                }
            });
        });

        // Open sheet buttons
        elem.querySelectorAll(".open-sheet").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const card = btn.closest(".party-card");
                const tokenId = card?.dataset.tokenId;
                if (tokenId) {
                    openTokenSheet(tokenId);
                }
            });
        });

        // Party member icons (switch actor)
        elem.querySelectorAll(".handle-partymember-icon.clickable").forEach(icon => {
            icon.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const actorId = icon.dataset.actorId;
                if (actorId) {
                    switchToActor(actorId);
                }
            });
        });

        // Select party button
        elem.querySelector('[data-action="select-party"]')?.addEventListener("click", (e) => {
            e.preventDefault();
            selectPartyTokens();
        });

        // Clear selection button
        elem.querySelector(".button-clear")?.addEventListener("click", (e) => {
            e.preventDefault();
            clearTokenSelection();
        });



        // Character panel click to open sheet
        elem.querySelector('.panel-container[data-panel="character"]')?.addEventListener("click", (e) => {
            const actor = this.trayData?.actor;
            if (actor) {
                actor.sheet.render(true);
            }
        });

        // Pin/Note List Pan Action
        elem.querySelectorAll(".pin-control[data-action='pan']").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const entry = btn.closest(".pin-entry");
                const x = parseFloat(entry.dataset.x);
                const y = parseFloat(entry.dataset.y);

                if (!isNaN(x) && !isNaN(y)) {
                    canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                }
            });
        });

        // Note Actions
        elem.querySelectorAll(".note-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = btn.dataset.action;
                const entry = btn.closest(".note-entry");
                const id = entry.dataset.id;
                const type = entry.querySelector(".note-icon i").className.includes("fa-user") ? "Token" :
                    entry.querySelector(".note-icon i").className.includes("fa-lightbulb") ? "AmbientLight" :
                        entry.querySelector(".note-icon i").className.includes("fa-volume-high") ? "AmbientSound" :
                            entry.querySelector(".note-icon i").className.includes("fa-image") ? "Tile" :
                                entry.querySelector(".note-icon i").className.includes("fa-block-brick") ? "Wall" : null;

                if (!type) return;

                // Find the document
                let doc;
                if (type === "Token") {
                    const token = canvas.tokens.get(id);
                    if (token) {
                        const tokenDoc = token.document;
                        // Check if token has its own note
                        const tokenNote = tokenDoc.getFlag("shadowdark-extras", "notes");
                        // If token has no note, but actor does, edit the actor's note (matching display logic)
                        if (!tokenNote && token.actor && token.actor.getFlag("shadowdark-extras", "notes")) {
                            doc = token.actor;
                        } else {
                            doc = tokenDoc;
                        }
                    }
                }
                else if (type === "AmbientLight") doc = canvas.lighting.get(id)?.document;
                else if (type === "AmbientSound") doc = canvas.sounds.get(id)?.document;
                else if (type === "Tile") doc = canvas.tiles.get(id)?.document;
                else if (type === "Wall") doc = canvas.walls.get(id)?.document;

                if (!doc) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                } else if (action === "rename") {
                    const currentName = doc.getFlag("shadowdark-extras", "customName") || doc.name || "";
                    new Dialog({
                        title: "Rename Placeable Note",
                        content: `
                            <form>
                                <div class="form-group">
                                    <label>Name:</label>
                                    <input type="text" name="name" value="${currentName}" autofocus>
                                </div>
                            </form>
                        `,
                        buttons: {
                            save: {
                                label: "Save",
                                icon: '<i class="fas fa-check"></i>',
                                callback: async (html) => {
                                    const newName = html.find("input[name='name']").val();
                                    await doc.setFlag("shadowdark-extras", "customName", newName);
                                    // Tray will auto-update via hooks
                                }
                            },
                            reset: {
                                label: "Reset",
                                icon: '<i class="fas fa-undo"></i>',
                                callback: async () => {
                                    await doc.unsetFlag("shadowdark-extras", "customName");
                                }
                            }
                        },
                        default: "save"
                    }).render(true);
                } else if (action === "toggle-visibility") {
                    const isVisible = !!doc.getFlag("shadowdark-extras", "noteVisible");
                    await doc.setFlag("shadowdark-extras", "noteVisible", !isVisible);
                } else if (action === "delete") {
                    Dialog.confirm({
                        title: "Delete Note",
                        content: `<p>Are you sure you want to delete the note for <strong>${doc.name}</strong>?</p>`,
                        yes: async () => {
                            // If we are deleting a note on a token, and it was displaying fallback actor notes...
                            // Actually, 'doc' is already resolved to the correct document (Token or Actor)
                            // So we just delete the flag from 'doc'.
                            await doc.unsetFlag("shadowdark-extras", "notes");
                            // Also clear visibility flag? Yes.
                            await doc.unsetFlag("shadowdark-extras", "noteVisible");
                        },
                        defaultYes: false
                    });
                }
            });
        });

        // Note Toggle Action
        elem.querySelectorAll(".note-header").forEach(header => {
            header.addEventListener("click", (e) => {
                // Don't toggle if clicking a control button
                if (e.target.closest(".note-controls")) return;

                e.preventDefault();
                e.stopPropagation();
                const entry = header.closest(".note-entry");
                const content = entry.querySelector(".note-content");
                if (content) {
                    content.classList.toggle("hidden");
                    const icon = header.querySelector(".toggle-icon i");
                    if (icon) {
                        icon.classList.toggle("fa-chevron-right");
                        icon.classList.toggle("fa-chevron-down");
                    }
                }
            });
        });

        // Note Entry Context Menu (Edit)
        elem.querySelectorAll(".note-entry").forEach(entry => {
            entry.addEventListener("contextmenu", (e) => {
                if (!game.user.isGM) return;
                e.preventDefault();
                e.stopPropagation();

                const id = entry.dataset.id;
                const type = entry.querySelector(".note-icon i").className.includes("fa-user") ? "Token" :
                    entry.querySelector(".note-icon i").className.includes("fa-lightbulb") ? "AmbientLight" :
                        entry.querySelector(".note-icon i").className.includes("fa-volume-high") ? "AmbientSound" :
                            entry.querySelector(".note-icon i").className.includes("fa-image") ? "Tile" :
                                entry.querySelector(".note-icon i").className.includes("fa-block-brick") ? "Wall" : null;

                if (!type) return;

                // Find the document
                let doc;
                if (type === "Token") {
                    const token = canvas.tokens.get(id);
                    if (token) {
                        const tokenDoc = token.document;
                        // Check if token has its own note
                        const tokenNote = tokenDoc.getFlag("shadowdark-extras", "notes");
                        // If token has no note, but actor does, edit the actor's note (matching display logic)
                        if (!tokenNote && token.actor && token.actor.getFlag("shadowdark-extras", "notes")) {
                            doc = token.actor;
                        } else {
                            doc = tokenDoc;
                        }
                    }
                }
                else if (type === "AmbientLight") doc = canvas.lighting.get(id)?.document;
                else if (type === "AmbientSound") doc = canvas.sounds.get(id)?.document;
                else if (type === "Tile") doc = canvas.tiles.get(id)?.document;
                else if (type === "Wall") doc = canvas.walls.get(id)?.document;

                if (!doc) return;

                new PlaceableNotesSD(doc).render(true);
            });
        });

        // Pin Search Input
        const searchInput = elem.querySelector(".pin-search-input");
        if (searchInput) {
            // Restore focus if we re-rendered and input was focused (simple heuristic)
            // But actually ApplicationV2 re-renders the whole thing, so focus is lost.
            // We can rely on value={pinSearchTerm} to restore value, 
            // but for smooth typing we might want to avoid full re-render on every keystroke if possible,
            // or just use client-side filtering without re-render.

            // We will use client-side filtering for better performance (no re-render)
            searchInput.addEventListener("input", (e) => {
                e.preventDefault();
                const term = e.target.value;
                this._pinSearchTerm = term;
                this._filterPins(term);
            });

            // Initial filter application (in case of re-render with existing term)
            if (this._pinSearchTerm) {
                this._filterPins(this._pinSearchTerm);
            }
        }
    }

    /**
     * Filter the pin list based on search term
     * @param {string} term 
     */
    _filterPins(term) {
        const elem = document.querySelector(".sdx-tray");
        if (!elem) return;

        const entries = elem.querySelectorAll(".pin-entry");
        const lowerTerm = term.toLowerCase();

        entries.forEach(entry => {
            const name = entry.querySelector(".pin-name")?.textContent.toLowerCase() || "";
            const page = entry.querySelector(".pin-page-name")?.textContent.toLowerCase() || "";

            if (name.includes(lowerTerm) || page.includes(lowerTerm)) {
                entry.style.display = "flex";
            } else {
                entry.style.display = "none";
            }
        });
    }
}

// Register Handlebars helpers for the tray
Hooks.once("init", () => {
    // Helper to check equality
    Handlebars.registerHelper("eq", function (a, b) {
        return a === b;
    });

    // Helper for health overlay height
    Handlebars.registerHelper("healthOverlayHeight", function (hp) {
        return getHealthOverlayHeight(hp);
    });

    // Helper for multiplication
    Handlebars.registerHelper("multiply", function (a, b) {
        return (a || 0) * (b || 0);
    });

    // Helper for division
    Handlebars.registerHelper("divide", function (a, b) {
        if (!b || b === 0) return 0;
        return (a || 0) / b;
    });

    // Helper to check if value is in array
    Handlebars.registerHelper("includes", function (arr, value) {
        if (!Array.isArray(arr)) return false;
        return arr.includes(value);
    });

    // Helper for default values
    Handlebars.registerHelper("default", function (value, defaultValue) {
        return value ?? defaultValue;
    });
});
