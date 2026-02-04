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
    async _prepareContext(options) {
        // Tom Broadcast State
        let activeSceneId = null;
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            activeSceneId = TomStore.activeSceneId || null;
        } catch (err) {
            // Ignore
        }
        this._tomActiveSceneId = activeSceneId;

        return {
            ...this.trayData,
            isExpanded: this._isExpanded,
            viewMode: getViewMode(),
            pinSearchTerm: this._pinSearchTerm,
            tomActiveSceneId: activeSceneId,
            showTomOverlays: !!activeSceneId,
            tomScenes: await this._getTomScenes(),
        };
    }

    /**
     * Get list of sections from TomStore
     */
    async _getTomScenes() {
        try {
            const { TomStore } = await import("./data/TomStore.mjs");
            const scenes = Array.from(TomStore.scenes.values());
            // Add isVideo property to each scene for thumbnail rendering
            return scenes.map(scene => {
                const sceneData = scene.toJSON ? scene.toJSON() : scene;
                const bg = sceneData.background || "";
                const isVideo = /\.(webm|mp4)$/i.test(bg);
                return { ...sceneData, isVideo };
            });
        } catch (err) {
            console.error("Failed to load TomScenes:", err);
            return [];
        }
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
        elem.querySelector(".tray-handle-button-tool[data-action='tom-scene-switcher']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomScenePanel();
        });

        elem.querySelector(".tray-handle-button-tool[data-action='tom-overlay-manager']")?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._toggleTomOverlayPanel();
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

        /* ------------------------------------------- */
        /*  SCENES TAB ACTIONS                        */
        /* ------------------------------------------- */

        // Create Scene
        elem.querySelector("[data-action='create-scene']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
            new TomSceneEditor().render(true);
        });

        // Stop Broadcast (Header Button)
        elem.querySelector("[data-action='stop-broadcast']")?.addEventListener("click", async (e) => {
            e.preventDefault();
            const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
            const { TomStore } = await import("./data/TomStore.mjs");
            const activeSceneId = TomStore.activeSceneId;
            const activeScene = activeSceneId ? TomStore.scenes.get(activeSceneId) : null;
            const outAnimation = activeScene?.outAnimation || 'fade';
            TomSocketHandler.emitStopBroadcast(outAnimation);
        });

        // Scene Card Actions
        elem.querySelectorAll(".scene-card").forEach(card => {
            const sceneId = card.dataset.sceneId;

            // Activate Scene (Broadcast) - Clicking the thumbnail/name
            card.querySelector(".scene-card-activate")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const { TomStore } = await import("./data/TomStore.mjs");
                const scene = TomStore.scenes.get(sceneId);
                const inAnimation = scene?.inAnimation || 'fade';
                TomSocketHandler.emitBroadcastScene(sceneId, inAnimation);
            });

            // Edit Scene
            card.querySelector("[data-action='edit-scene']")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
                new TomSceneEditor(sceneId).render(true);
            });

            // Delete Scene
            card.querySelector("[data-action='delete-scene']")?.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sceneName = card.querySelector(".scene-name").textContent;

                const confirmed = await Dialog.confirm({
                    title: "Delete Scene",
                    content: `<p>Are you sure you want to delete <strong>${sceneName}</strong>?</p><p>This action cannot be undone.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });

                if (confirmed) {
                    const { TomStore } = await import("./data/TomStore.mjs");
                    TomStore.deleteItem(sceneId, "scene");
                    ui.notifications.info(`Scene "${sceneName}" deleted.`);
                }
            });

            // Drag and Drop for Reordering
            card.addEventListener("dragstart", (e) => {
                e.stopPropagation();
                card.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", sceneId);
            });

            card.addEventListener("dragend", (e) => {
                e.stopPropagation();
                card.classList.remove("dragging");
                // Remove all drag-over classes
                elem.querySelectorAll(".scene-card").forEach(c => c.classList.remove("drag-over"));
            });

            card.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";

                const draggingCard = elem.querySelector(".scene-card.dragging");
                if (draggingCard && draggingCard !== card) {
                    card.classList.add("drag-over");
                }
            });

            card.addEventListener("dragleave", (e) => {
                e.stopPropagation();
                if (!card.contains(e.relatedTarget)) {
                    card.classList.remove("drag-over");
                }
            });

            card.addEventListener("drop", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                card.classList.remove("drag-over");

                const draggedId = e.dataTransfer.getData("text/plain");
                const targetId = card.dataset.sceneId;

                if (draggedId === targetId) return;

                // Get current scene order
                const { TomStore } = await import("./data/TomStore.mjs");
                const currentScenes = Array.from(TomStore.scenes.values());
                const sceneIds = currentScenes.map(s => s.id);

                // Find indices
                const draggedIndex = sceneIds.indexOf(draggedId);
                const targetIndex = sceneIds.indexOf(targetId);

                if (draggedIndex === -1 || targetIndex === -1) return;

                // Reorder array
                sceneIds.splice(draggedIndex, 1);
                sceneIds.splice(targetIndex, 0, draggedId);

                // Update store
                TomStore.reorderScenes(sceneIds);
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
     * Handle broadcast stop — refresh UI to hide overlay manager
     */
    onBroadcastStopped() {
        this._tomActiveSceneId = null;
        this.render();
    }

    // Cast manager button has been removed


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
        const btn = document.querySelector(".tray-handle-button-tool[data-action='tom-overlay-manager']");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tray-handle-button-tool[data-action='tom-overlay-manager']")) {
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

        // Get Tom data from store
        const { TomStore } = await import("./data/TomStore.mjs");
        const scene = this._tomActiveSceneId ? TomStore.scenes.get(this._tomActiveSceneId) : null;
        const broadcasting = !!scene;

        // Characters are no longer managed through Tom


        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-cast-manager-panel";

        // Header — shows scene name only while broadcasting
        const header = document.createElement("div");
        header.className = "tom-cast-header";
        if (broadcasting) {
            header.innerHTML = `<span><i class="fas fa-users"></i> Manage Cast</span><span class="tom-cast-scene-name">${scene.name}</span>`;
        } else {
            header.innerHTML = `<span><i class="fas fa-users"></i> Characters</span>`;
        }
        panel.appendChild(header);

        // Character creation has been removed


        // Character list has been removed


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

        // Create panel
        const panel = document.createElement("div");
        panel.className = "tom-scene-switcher-panel";

        // Create new scene button (always at top)
        const createSceneBtn = document.createElement("button");
        createSceneBtn.className = "tom-switcher-create-btn";
        createSceneBtn.innerHTML = '<i class="fas fa-plus"></i> Create new scene';
        createSceneBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            panel.remove();
            const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
            new TomSceneEditor().render(true);
        });
        panel.appendChild(createSceneBtn);

        // Stop Broadcasting button — only shown while actively broadcasting
        if (this._tomActiveSceneId) {
            const stopBtn = document.createElement("button");
            stopBtn.className = "tom-switcher-stop-btn";
            stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Broadcasting';
            stopBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                panel.remove();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const { TomStore } = await import("./data/TomStore.mjs");
                const activeScene = TomStore.scenes.get(this._tomActiveSceneId);
                const outAnimation = activeScene?.outAnimation || 'fade';
                TomSocketHandler.emitStopBroadcast(outAnimation);
            });
            panel.appendChild(stopBtn);
        }

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

            // Edit / Delete action buttons
            const actions = document.createElement("div");
            actions.className = "tom-switcher-actions";

            const editBtn = document.createElement("button");
            editBtn.className = "tom-switcher-action-btn tom-switcher-action-edit";
            editBtn.title = "Edit Scene";
            editBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
            editBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                panel.remove();
                const { TomSceneEditor } = await import("./apps/TomEditors.mjs");
                new TomSceneEditor(scene.id).render(true);
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "tom-switcher-action-btn tom-switcher-action-delete";
            deleteBtn.title = "Delete Scene";
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const confirmed = await Dialog.confirm({
                    title: "Delete Scene",
                    content: `<p>Are you sure you want to delete <strong>${scene.name}</strong>?</p><p>This action cannot be undone.</p>`,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                });
                if (!confirmed) return;
                panel.remove();
                const { TomStore } = await import("./data/TomStore.mjs");
                TomStore.deleteItem(scene.id, "scene");
                ui.notifications.info(`Scene "${scene.name}" deleted.`);
            });

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            item.appendChild(thumb);
            item.appendChild(name);
            item.appendChild(actions);
            list.appendChild(item);

            // Click handler
            item.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (scene.id === this._tomActiveSceneId) return; // Already playing

                // Close the panel first
                panel.remove();

                const { TomSocketHandler } = await import("./data/TomSocketHandler.mjs");
                const inAnimation = scene?.inAnimation || 'fade';

                if (this._tomActiveSceneId) {
                    // Already broadcasting — fade-transition to the new scene
                    TomSocketHandler.emitSceneFadeTransition(scene.id);
                } else {
                    // Not broadcasting yet — start a new broadcast
                    TomSocketHandler.emitBroadcastScene(scene.id, inAnimation);
                }

                // Update local state
                this._tomActiveSceneId = scene.id;
            });
        }

        if (scenes.length === 0) {
            const empty = document.createElement("div");
            empty.className = "tom-switcher-empty";
            empty.textContent = "Click above to create a new Scene";
            list.appendChild(empty);
        }

        panel.appendChild(list);

        // Position panel next to button
        const btn = document.querySelector(".tray-handle-button-tool[data-action='tom-scene-switcher']");
        if (btn) {
            const rect = btn.getBoundingClientRect();
            panel.style.position = "fixed";
            panel.style.left = `${rect.right + 10}px`;
            panel.style.top = `${rect.top}px`;
        }

        document.body.appendChild(panel);

        // Close on click outside
        const closeHandler = (e) => {
            if (!panel.contains(e.target) && !e.target.closest(".tray-handle-button-tool[data-action='tom-scene-switcher']")) {
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
