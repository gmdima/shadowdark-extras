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
import { PinPlacer, JournalPinManager, JournalPinRenderer } from "./JournalPinsSD.mjs";
import { PinStyleEditorApp } from "./PinStyleEditorSD.mjs";
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

    // Static instance reference for easy access
    static _instance = null;

    constructor(data = {}, options = {}) {
        super(options);
        this.trayData = data;
        this._isExpanded = false;
        this._pinSearchTerm = "";

        // Store static reference
        TrayApp._instance = this;
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

        // Close Tom panels if open (they're positioned relative to handle)
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();
    }

    /**
     * Set expanded state
     */
    setExpanded(expanded) {
        this._isExpanded = expanded;
        this._applyExpandedState();

        // Close Tom panels if open
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();
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

        // Check for active Tom broadcast and show scene switcher if needed (GM only)
        if (game.user.isGM) {
            this._checkTomBroadcastState();
        }

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

        // Tom Button (Scene Manager)
        elem.querySelector(".tray-handle-button-tool[data-action='tom']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Import TomSD dynamically to avoid circular dependencies
            import("./TomSD.mjs").then(({ TomSD }) => {
                TomSD.open();
            }).catch(err => {
                console.error("Shadowdark Extras | Failed to open Tom:", err);
                ui.notifications.error("Failed to open Tom panel.");
            });
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
        elem.querySelectorAll(".pin-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = btn.dataset.action;
                const entry = btn.closest(".pin-entry");
                const id = entry.dataset.id;

                if (!id) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    if (!isNaN(x) && !isNaN(y)) {
                        canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                    }
                } else if (action === "ping-pin") {
                    if (!JournalPinRenderer.getContainer()) return;
                    const pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === id);

                    if (game.user.isGM) {
                        if (pin && pin.animatePing) pin.animatePing("ping");
                        game.socket.emit("module.shadowdark-extras", {
                            type: "pingPin",
                            sceneId: canvas.scene?.id,
                            pinId: id
                        });
                    } else {
                        ui.notifications.warn("Only GM can ping pins.");
                    }
                } else if (action === "bring-players") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);

                    if (game.user.isGM) {
                        if (!isNaN(x) && !isNaN(y)) {
                            canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                            if (JournalPinRenderer.getContainer()) {
                                const pin = JournalPinRenderer.getContainer().children.find(c => c.pinData?.id === id);
                                if (pin && pin.animatePing) pin.animatePing("bring");
                            }
                            game.socket.emit("module.shadowdark-extras", {
                                type: "panToPin",
                                x: x,
                                y: y,
                                sceneId: canvas.scene?.id,
                                pinId: id
                            });
                        }
                    } else {
                        ui.notifications.warn("Only GM can bring players.");
                    }
                } else if (action === "edit-pin") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        new PinStyleEditorApp({ pinId: id }).render(true);
                    }
                } else if (action === "toggle-gm-only") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        if (game.user.isGM) {
                            const current = pinData.gmOnly || false;
                            await JournalPinManager.update(id, { gmOnly: !current });
                        } else {
                            ui.notifications.warn("Only GM can toggle visibility.");
                        }
                    }
                } else if (action === "toggle-vision") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        if (game.user.isGM) {
                            const current = pinData.requiresVision || false;
                            await JournalPinManager.update(id, { requiresVision: !current });
                        } else {
                            ui.notifications.warn("Only GM can toggle vision requirement.");
                        }
                    }
                } else if (action === "delete-pin") {
                    Dialog.confirm({
                        title: "Delete Pin",
                        content: "<p>Are you sure you want to delete this pin?</p>",
                        yes: async () => {
                            await JournalPinManager.delete(id);
                        },
                        defaultYes: false
                    });
                } else if (action === "copy-style") {
                    const pinData = JournalPinManager.get(id);
                    if (pinData) {
                        JournalPinManager.copyStyle(pinData);
                    }
                } else if (action === "paste-style") {
                    await JournalPinManager.pasteStyle(id);
                } else if (action === "duplicate-pin") {
                    await JournalPinManager.duplicate(id);
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

        // Map Note Actions
        elem.querySelectorAll(".map-note-control").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const action = btn.dataset.action;
                const entry = btn.closest(".map-note-entry");
                const id = entry.dataset.id;
                const uuid = entry.dataset.uuid;

                if (!id) return;

                if (action === "pan") {
                    const x = parseFloat(entry.dataset.x);
                    const y = parseFloat(entry.dataset.y);
                    if (!isNaN(x) && !isNaN(y)) {
                        canvas.animatePan({ x, y, scale: 1.5, duration: 500 });
                    }
                } else if (action === "delete") {
                    const note = fromUuidSync(uuid);
                    if (!note) return;

                    Dialog.confirm({
                        title: "Delete Map Note",
                        content: `<p>Are you sure you want to delete the map note <strong>${note.text || note.name}</strong>?</p>`,
                        yes: () => note.delete(),
                        defaultYes: false
                    });
                } else if (action === "open") {
                    const note = fromUuidSync(uuid);
                    if (note) note.sheet.render(true);
                }
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

    /* ═══════════════════════════════════════════════════════════════
       TOM SCENE SWITCHER (Quick scene switching during broadcast)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * Check if Tom is broadcasting and show scene switcher if so
     * Called on tray render to handle page refresh during broadcast
     */
    async _checkTomBroadcastState() {
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            if (TomStore.activeSceneId) {
                // Always try to show (showTomSceneSwitcher will clean up existing first)
                this.showTomSceneSwitcher(TomStore.activeSceneId);
                this.showTomCastManager();
                this.showTomOverlayManager();
            }
        } catch (err) {
            // TomStore may not be initialized yet, ignore
        }
    }

    /**
     * Show the Tom scene switcher button in the tray handle
     * Called when broadcast starts
     * @param {string} activeSceneId - Currently broadcasting scene ID
     */
    showTomSceneSwitcher(activeSceneId) {
        if (!game.user.isGM) return;

        const handle = document.querySelector(".tray-handle-content-container");
        if (!handle) return;

        // Remove existing if any
        this.hideTomSceneSwitcher();

        // Create the button
        const btn = document.createElement("button");
        btn.className = "tray-handle-button-tool tom-scene-switcher-btn";
        btn.dataset.action = "tom-scene-switcher";
        btn.title = "Quick Scene Switch";
        btn.innerHTML = '<i class="fa-solid fa-images"></i>';

        // Insert after the tom button
        const tomBtn = handle.querySelector('[data-action="tom"]');
        if (tomBtn) {
            tomBtn.after(btn);
        } else {
            // Fallback: insert before carousing button or at the end of GM tools
            const carousingBtn = handle.querySelector('[data-action="carousing"]');
            if (carousingBtn) {
                carousingBtn.before(btn);
            } else {
                handle.appendChild(btn);
            }
        }

        // Store active scene ID
        this._tomActiveSceneId = activeSceneId;

        // Add click handler
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomScenePanel();
        });
    }

    /**
     * Hide the Tom scene switcher button
     * Called when broadcast stops
     */
    hideTomSceneSwitcher() {
        const btn = document.querySelector(".tom-scene-switcher-btn");
        if (btn) btn.remove();

        const panel = document.querySelector(".tom-scene-switcher-panel");
        if (panel) panel.remove();

        // Also hide cast manager and overlay manager
        this.hideTomCastManager();
        this.hideTomOverlayManager();

        this._tomActiveSceneId = null;
    }

    /**
     * Show the Tom cast manager button in the tray handle
     * Called when broadcast starts (after scene switcher)
     */
    showTomCastManager() {
        if (!game.user.isGM) return;

        const handle = document.querySelector(".tray-handle-content-container");
        if (!handle) return;

        // Remove existing if any
        const existingBtn = document.querySelector(".tom-cast-manager-btn");
        if (existingBtn) existingBtn.remove();

        // Create the button
        const btn = document.createElement("button");
        btn.className = "tray-handle-button-tool tom-cast-manager-btn";
        btn.dataset.action = "tom-cast-manager";
        btn.title = "Manage Cast";
        btn.innerHTML = '<i class="fa-solid fa-users"></i>';

        // Insert after scene switcher button
        const switcherBtn = handle.querySelector(".tom-scene-switcher-btn");
        if (switcherBtn) {
            switcherBtn.after(btn);
        } else {
            // Fallback: insert after tom button
            const tomBtn = handle.querySelector('[data-action="tom"]');
            if (tomBtn) {
                tomBtn.after(btn);
            } else {
                handle.appendChild(btn);
            }
        }

        // Add click handler
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomCastPanel();
        });
    }

    /**
     * Hide the Tom cast manager button
     */
    hideTomCastManager() {
        const btn = document.querySelector(".tom-cast-manager-btn");
        if (btn) btn.remove();

        const panel = document.querySelector(".tom-cast-manager-panel");
        if (panel) panel.remove();
    }

    /**
     * Show the Tom overlay manager button in the tray handle
     * Called when broadcast starts (after cast manager)
     */
    showTomOverlayManager() {
        if (!game.user.isGM) return;

        const handle = document.querySelector(".tray-handle-content-container");
        if (!handle) return;

        // Remove existing if any
        const existingBtn = document.querySelector(".tom-overlay-manager-btn");
        if (existingBtn) existingBtn.remove();

        // Create the button
        const btn = document.createElement("button");
        btn.className = "tray-handle-button-tool tom-overlay-manager-btn";
        btn.dataset.action = "tom-overlay-manager";
        btn.title = "Video Overlays";
        btn.innerHTML = '<i class="fa-solid fa-film"></i>';

        // Insert after cast manager button
        const castBtn = handle.querySelector(".tom-cast-manager-btn");
        if (castBtn) {
            castBtn.after(btn);
        } else {
            // Fallback: insert after scene switcher
            const switcherBtn = handle.querySelector(".tom-scene-switcher-btn");
            if (switcherBtn) {
                switcherBtn.after(btn);
            } else {
                handle.appendChild(btn);
            }
        }

        // Add click handler
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomOverlayPanel();
        });
    }

    /**
     * Hide the Tom overlay manager button
     */
    hideTomOverlayManager() {
        const btn = document.querySelector(".tom-overlay-manager-btn");
        if (btn) btn.remove();

        const panel = document.querySelector(".tom-overlay-manager-panel");
        if (panel) panel.remove();
    }

    /**
     * Toggle the overlay manager panel
     */
    async _toggleTomOverlayPanel() {
        // Close other panels first
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-cast-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-overlay-manager-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Available overlays (hardcoded for now, could be made dynamic)
        const overlays = [
            { name: "Fire", file: "fire.webm" },
            { name: "Snow", file: "snow.webm" },
            { name: "Wind", file: "wind.webm" },
            { name: "Rain", file: "rain.webm" },
            { name: "Dust", file: "dust.webm" },
            { name: "Campfire", file: "campfire.webm" },
            { name: "Burning", file: "burning.webm" },
            { name: "Gold", file: "gold.webm" },
            { name: "Purple", file: "purple.webm" },
            { name: "Light", file: "light.webm" },
            { name: "Storm", file: "storm.webm" },
            { name: "Fog", file: "fog.webm" },
            { name: "Gente Snow", file: "gentlesnow.mp4" },
            { name: "Light Rain", file: "lightrain.mp4" },
            { name: "Slow Snow", file: "slowsnow.mp4" },
            { name: "Light Snow", file: "lightsnow.mp4" },
            { name: "Blue Rays", file: "bluerays.mp4" },
            { name: "Embers", file: "embers.mp4" },
            { name: "Sparks", file: "sparks.mp4" },
            { name: "Glow", file: "aurora.mp4" }

        ];

        const basePath = "modules/shadowdark-extras/assets/Tom/overlays/";

        // Get current overlay from TomStore
        const { TomStore } = await import("./data/TomStore.mjs");
        const currentOverlay = TomStore.currentOverlay;

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-overlay-manager-panel";

        // Header
        const header = document.createElement("div");
        header.className = "tom-overlay-header";
        header.innerHTML = `<span><i class="fas fa-film"></i> Video Overlays</span>`;
        panel.appendChild(header);

        // Clear overlay button
        const clearBtn = document.createElement("button");
        clearBtn.className = `tom-overlay-clear-btn ${!currentOverlay ? "disabled" : ""}`;
        clearBtn.innerHTML = '<i class="fas fa-times"></i> Clear Overlay';
        clearBtn.disabled = !currentOverlay;
        clearBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
            TomSocketHandler.emitOverlayClear();
            panel.remove();
            this._toggleTomOverlayPanel(); // Refresh panel
        });
        panel.appendChild(clearBtn);

        // Build overlay list
        const list = document.createElement("div");
        list.className = "tom-overlay-list";

        for (const overlay of overlays) {
            const overlayPath = basePath + overlay.file;
            const isActive = currentOverlay === overlayPath;

            const item = document.createElement("div");
            item.className = `tom-overlay-item ${isActive ? "active" : ""}`;
            item.dataset.path = overlayPath;

            // Preview thumbnail (use video poster or just colored box)
            const preview = document.createElement("div");
            preview.className = "tom-overlay-preview";
            preview.innerHTML = `<i class="fas fa-play"></i>`;

            // Name
            const name = document.createElement("div");
            name.className = "tom-overlay-name";
            name.textContent = overlay.name;

            // Active indicator
            if (isActive) {
                const indicator = document.createElement("div");
                indicator.className = "tom-overlay-active-indicator";
                indicator.innerHTML = '<i class="fas fa-check"></i>';
                item.appendChild(indicator);
            }

            item.appendChild(preview);
            item.appendChild(name);
            list.appendChild(item);

            // Click handler
            item.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");

                if (isActive) {
                    // Clicking active overlay clears it
                    TomSocketHandler.emitOverlayClear();
                } else {
                    // Set new overlay
                    TomSocketHandler.emitOverlaySet(overlayPath);
                }

                panel.remove();
                this._toggleTomOverlayPanel(); // Refresh panel
            });
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tom-overlay-manager-btn");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tom-overlay-manager-btn")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }

    /**
     * Toggle the cast manager panel
     */
    async _toggleTomCastPanel() {
        // Close other panels first
        document.querySelector(".tom-scene-switcher-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-cast-manager-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        if (!this._tomActiveSceneId) {
            ui.notifications.warn("No scene is currently broadcasting.");
            return;
        }

        // Get Tom data from store
        const { TomStore } = await import("./data/TomStore.mjs");
        const scene = TomStore.scenes.get(this._tomActiveSceneId);
        if (!scene) {
            ui.notifications.warn("Broadcasting scene not found.");
            return;
        }

        const allCharacters = Array.from(TomStore.characters.values());
        const castIds = scene.cast.map(c => c.id);

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-cast-manager-panel";

        // Header
        const header = document.createElement("div");
        header.className = "tom-cast-header";
        header.innerHTML = `<span><i class="fas fa-users"></i> Manage Cast</span><span class="tom-cast-scene-name">${scene.name}</span>`;
        panel.appendChild(header);

        // Build character list
        const list = document.createElement("div");
        list.className = "tom-cast-list";

        for (const character of allCharacters) {
            const isInCast = castIds.includes(character.id);

            const item = document.createElement("div");
            item.className = `tom-cast-character ${isInCast ? "in-cast" : ""}`;
            item.dataset.characterId = character.id;

            // Portrait
            const portrait = document.createElement("div");
            portrait.className = "tom-cast-portrait";
            if (character.image) {
                portrait.style.backgroundImage = `url('${character.image}')`;
            }

            // Name
            const name = document.createElement("div");
            name.className = "tom-cast-name";
            name.textContent = character.name;

            // Toggle button
            const toggleBtn = document.createElement("button");
            toggleBtn.className = `tom-cast-toggle ${isInCast ? "remove" : "add"}`;
            toggleBtn.innerHTML = isInCast
                ? '<i class="fas fa-minus"></i>'
                : '<i class="fas fa-plus"></i>';
            toggleBtn.title = isInCast ? "Remove from cast" : "Add to cast";

            item.appendChild(portrait);
            item.appendChild(name);
            item.appendChild(toggleBtn);
            list.appendChild(item);

            // Click handler for toggle
            toggleBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");

                if (isInCast) {
                    // Remove from cast
                    TomStore.removeCastMember(this._tomActiveSceneId, character.id);
                } else {
                    // Add to cast
                    TomStore.addCastMember(this._tomActiveSceneId, character.id);
                }

                // Broadcast the cast update
                TomSocketHandler.emitUpdateCast(this._tomActiveSceneId);

                // Refresh the panel
                panel.remove();
                this._toggleTomCastPanel();
            });
        }

        if (allCharacters.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tom-cast-empty";
            empty.textContent = "No characters available. Create characters in Tom first.";
            list.appendChild(empty);
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tom-cast-manager-btn");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tom-cast-manager-btn")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
    }

    /**
     * Refresh the cast manager panel if it is open
     */
    refreshTomCastPanel() {
        if (document.querySelector(".tom-cast-manager-panel")) {
            this._toggleTomCastPanel(); // This will close it
            this._toggleTomCastPanel(); // This will open it again (refreshing data)
        }
    }

    /**
     * Update the active scene highlight in the panel
     * @param {string} sceneId - New active scene ID
     */
    updateTomSceneSwitcher(sceneId) {
        this._tomActiveSceneId = sceneId;

        // Update highlight if panel is open
        const panel = document.querySelector(".tom-scene-switcher-panel");
        if (panel) {
            panel.querySelectorAll(".tom-switcher-scene").forEach(item => {
                item.classList.toggle("active", item.dataset.sceneId === sceneId);
            });
        }
    }

    /**
     * Toggle the scene switcher panel
     */
    async _toggleTomScenePanel() {
        // Close other panels first
        document.querySelector(".tom-cast-manager-panel")?.remove();
        document.querySelector(".tom-overlay-manager-panel")?.remove();

        const existingPanel = document.querySelector(".tom-scene-switcher-panel");
        if (existingPanel) {
            existingPanel.remove();
            return;
        }

        // Get Tom scenes from store
        const { TomStore } = await import("./data/TomStore.mjs");
        const scenes = Array.from(TomStore.scenes.values());

        if (scenes.length === 0) {
            ui.notifications.warn("No Tom scenes available.");
            return;
        }

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-scene-switcher-panel";

        // Stop Broadcasting button
        const stopBtn = document.createElement("button");
        stopBtn.className = "tom-switcher-stop-btn";
        stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Broadcasting';
        stopBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            panel.remove();

            const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
            TomSocketHandler.emitStopBroadcast();
        });
        panel.appendChild(stopBtn);

        // Build scene list
        const list = document.createElement("div");
        list.className = "tom-switcher-list";

        for (const scene of scenes) {
            const item = document.createElement("div");
            item.className = `tom-switcher-scene ${scene.id === this._tomActiveSceneId ? "active" : ""}`;
            item.dataset.sceneId = scene.id;

            // Thumbnail
            const thumb = document.createElement("div");
            thumb.className = "tom-switcher-thumb";
            if (scene.background) {
                thumb.style.backgroundImage = `url('${scene.background}')`;
            }

            // Name
            const name = document.createElement("div");
            name.className = "tom-switcher-name";
            name.textContent = scene.name;

            // Playing indicator
            if (scene.id === this._tomActiveSceneId) {
                const indicator = document.createElement("i");
                indicator.className = "fas fa-play tom-switcher-playing";
                thumb.appendChild(indicator);
            }

            item.appendChild(thumb);
            item.appendChild(name);
            list.appendChild(item);

            // Click handler
            item.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (scene.id === this._tomActiveSceneId) return; // Already playing

                // Close the panel first
                panel.remove();

                // Emit scene fade transition to all clients
                // This handles the fade effect and scene switch for everyone
                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                TomSocketHandler.emitSceneFadeTransition(scene.id);

                // Update local state
                this._tomActiveSceneId = scene.id;
            });
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tom-scene-switcher-btn");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tom-scene-switcher-btn")) {
                panel.remove();
                document.removeEventListener("click", closeHandler);
            }
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 10);
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
