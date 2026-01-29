/**
 * CarousingOverlaySD - Full-screen carousing application overlay
 * Provides a full-screen interface for carousing sessions with auto-assign character
 */

import {
    getCarousingMode,
    getCarousingSession,
    getCarousingDrops,
    getCarousingParticipants,
    getCarousingGmActors,
    addGmParticipant,
    removeGmParticipant,
    getExpandedCarousingData,
    getExpandedCarousingTables,
    getCustomCarousingTables,
    getCarousingTableById,
    setCarousingDrop,
    setCarousingTier,
    setCarousingTable,
    setPlayerConfirmation,
    setPlayerModifier,
    executeCarousingRolls,
    getRenownBonus,
    resetCarousingSession,
    pruneOfflineCarousingData,
    addCarousingResult,
    removeCarousingResult
} from "./CarousingSD.mjs";

const MODULE_ID = "shadowdark-extras";

/**
 * Singleton instance of the overlay
 */
let _overlayInstance = null;

/**
 * Broadcast a toast notification to all clients
 */
function broadcastToast(message, type) {
    game.socket.emit(`module.${MODULE_ID}`, {
        type: "carousing-toast",
        message: message,
        toastType: type,
        senderId: game.user.id
    });
}

/**
 * Show a toast locally
 */
function showToastGlobal(message, type) {
    let container = document.querySelector('.sdx-carousing-toast-container-global');
    if (!container) {
        container = document.createElement('div');
        container.className = 'sdx-carousing-toast-container-global';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `sdx-carousing-toast sdx-toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'benefit' ? 'fa-star' : type === 'mishap' ? 'fa-skull' : 'fa-times'}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('sdx-toast-fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

/**
 * Full-screen Carousing Overlay Application
 */
export default class CarousingOverlaySD extends Application {
    constructor(options = {}) {
        super(options);
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sdx-carousing-overlay",
            classes: ["sdx-carousing-overlay-app"],
            template: `modules/${MODULE_ID}/templates/carousing-overlay.hbs`,
            width: "100%",
            height: "100%",
            popOut: true,
            resizable: false,
            minimizable: false,
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.title")
        });
    }

    /**
     * Get the singleton instance
     */
    static getInstance() {
        if (!_overlayInstance) {
            _overlayInstance = new CarousingOverlaySD();
        }
        return _overlayInstance;
    }

    /**
     * Open the carousing overlay
     */
    static async open() {
        const instance = CarousingOverlaySD.getInstance();

        // Auto-assign character for current user if they have one and haven't dropped yet
        await instance._autoAssignCharacter();

        // Render the overlay
        instance.render(true);
        return instance;
    }

    /**
     * Close the overlay
     */
    static close() {
        if (_overlayInstance?.rendered) {
            _overlayInstance.close();
        }
    }

    /**
     * Refresh the overlay if it's open
     */
    static refresh() {
        if (_overlayInstance?.rendered) {
            _overlayInstance.render(false);
        }
    }

    /**
     * Auto-assign the current user's character if available
     */
    async _autoAssignCharacter() {
        // Only for non-GM players
        if (game.user.isGM) return;

        const drops = getCarousingDrops();
        const currentDrop = drops[game.user.id];

        // If player already has a drop, don't override
        if (currentDrop) return;

        // Check if user has an assigned character
        const character = game.user.character;
        if (character && character.type === "Player") {
            await setCarousingDrop(game.user.id, character.id);
        }
    }

    /**
     * Get data for template
     */
    async getData() {
        // GM Cleanup: Remove offline players from carousing state
        if (game.user.isGM) {
            await pruneOfflineCarousingData();
        }

        const carousingMode = getCarousingMode();
        const session = getCarousingSession();

        // Get active table and available tables based on mode
        let activeTable;
        let availableTables;

        if (carousingMode === "expanded") {
            availableTables = getExpandedCarousingTables();
            activeTable = getExpandedCarousingData();
        } else {
            availableTables = getCustomCarousingTables();
            activeTable = getCarousingTableById(session.selectedTableId);
        }

        // Get ALL participants (Online + GM added)
        const participants = this._getParticipants(session, activeTable);
        const onlinePlayers = participants.filter(p => !p.isGmManaged);

        // Calculate split cost based on ALL dropped participants
        const participantCount = participants.filter(p => p.hasDrop).length;

        // Calculate selected tier info for display
        let selectedTierCost = 0;
        let selectedTierDescription = "";
        let selectedTierBonus = 0;

        if (session.selectedTier !== null && activeTable.tiers[session.selectedTier]) {
            const tier = activeTable.tiers[session.selectedTier];
            selectedTierDescription = tier.description || "";
            selectedTierBonus = tier.bonus || 0;

            const effectiveCount = participantCount > 0 ? participantCount : 1;
            selectedTierCost = Math.ceil(tier.cost / effectiveCount);
        }

        const droppedParticipants = participants.filter(p => p.hasDrop);
        const allConfirmed = droppedParticipants.length > 0 && droppedParticipants.every(p => p.isConfirmed);
        const allCanAfford = droppedParticipants.length > 0 && droppedParticipants.every(p => p.canAfford);
        const canRoll = allConfirmed && allCanAfford && session.selectedTier !== null && droppedParticipants.length > 0;

        const customTables = availableTables.map(t => ({
            ...t,
            selected: t.id === session.selectedTableId
        }));

        const tierOptions = activeTable.tiers.map((tier, i) => ({
            index: i,
            label: tier.name || `Tier ${i + 1} (${tier.cost} GP, +${tier.bonus})`,
            selected: session.selectedTier === i
        })).filter((_, i) => {
            // Filter out empty tiers
            const tier = activeTable.tiers[i];
            return tier.cost > 0 || tier.bonus > 0 || tier.description;
        });

        // Get visibility settings for benefits/mishaps
        const showBenefitsToPlayers = game.settings.get(MODULE_ID, "carousingShowBenefitsToPlayers") ?? true;
        const showMishapsToPlayers = game.settings.get(MODULE_ID, "carousingShowMishapsToPlayers") ?? true;

        // Get available actors for GM to add (Player type not already in participants)
        let availableActors = [];
        if (game.user.isGM) {
            const participantActorIds = participants.map(p => p.droppedActorId).filter(id => !!id);
            availableActors = game.actors.filter(a =>
                a.type === "Player" && !participantActorIds.includes(a.id)
            ).map(a => ({
                id: a.id,
                name: a.name,
                img: a.img
            }));
        }

        return {
            isGM: game.user.isGM,
            participants: participants,
            hasParticipants: participants.length > 0,
            participantCount: participantCount,
            tierOptions: tierOptions,
            selectedTier: session.selectedTier,
            hasSelectedTier: session.selectedTier !== null,
            selectedTierCost: selectedTierCost,
            selectedTierDescription: selectedTierDescription,
            selectedTierBonus: selectedTierBonus,
            phase: session.phase,
            canRoll: canRoll,
            allConfirmed: allConfirmed,
            selectedTableId: session.selectedTableId || "default",
            customTables: customTables,
            hasCustomTables: customTables.length > 0,
            carousingMode: carousingMode,
            isExpandedMode: carousingMode === "expanded",
            availableActors: availableActors,
            hasAvailableActors: availableActors.length > 0,
            // Visibility settings - show to GMs always, only to players if setting enabled
            canSeeBenefits: game.user.isGM || showBenefitsToPlayers,
            canSeeMishaps: game.user.isGM || showMishapsToPlayers
        };

    }

    /**
     * Get participants with their carousing data
     */
    _getParticipants(session, activeTable) {
        const participants = getCarousingParticipants();

        // Get owned actors for character selection (used by players)
        const ownedActors = game.actors.filter(a =>
            a.type === "Player" && a.isOwner
        ).map(a => ({
            id: a.id,
            name: a.name,
            img: a.img
        }));

        return participants.map(p => {
            const pId = p.participantId;
            const playerMods = session.modifiers?.[pId] || {};

            return {
                ...p,
                modifiers: {
                    outcome: playerMods.outcome || "",
                    benefits: playerMods.benefits || "",
                    mishaps: playerMods.mishaps || ""
                },
                ownedActors: ownedActors.map(a => ({
                    ...a,
                    selected: a.id === p.droppedActorId
                })),
                hasMultipleActors: ownedActors.length > 1
            };
        });
    }

    /**
     * Get online players with their carousing data
     * @deprecated
     */
    _getOnlinePlayers(session, activeTable) {
        return this._getParticipants(session, activeTable).filter(p => !p.isGmManaged);
    }


    /**
     * Get actor's total GP
     */
    _getActorTotalGp(actor) {
        const coins = actor.system?.coins || {};
        const gp = coins.gp || 0;
        const sp = coins.sp || 0;
        const cp = coins.cp || 0;
        return gp + Math.floor(sp / 10) + Math.floor(cp / 100);
    }

    /**
     * Activate listeners
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Close button
        html.find('[data-action="close-overlay"]').click((e) => {
            e.preventDefault();
            this.close();
        });

        // GM: Table selection
        html.find('[data-action="select-table"]').change(async (event) => {
            if (!game.user.isGM) return;
            const tableId = event.target.value || "default";
            await setCarousingTable(tableId);
        });

        // GM: Tier selection
        html.find('[data-action="select-tier"]').change(async (event) => {
            if (!game.user.isGM) return;
            const val = event.target.value;
            const tierIndex = val === "" ? null : parseInt(val);
            await setCarousingTier(tierIndex);
        });

        // GM: Roll button
        html.find('[data-action="roll-carousing"]').click(async (event) => {
            event.preventDefault();
            if (!game.user.isGM) return;
            await executeCarousingRolls();
        });

        // GM: Reset button
        html.find('[data-action="reset-carousing"]').click(async (event) => {
            event.preventDefault();
            if (!game.user.isGM) return;
            await resetCarousingSession();
        });

        // Player: Confirm button
        html.find('[data-action="confirm-carousing"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).data('participant-id');
            // If GM managed, GM can confirm. If user managed, only user can confirm.
            const p = getCarousingParticipants().find(x => x.participantId === pId);
            if (!p) return;
            if (p.isGmManaged && !game.user.isGM) return;
            if (!p.isGmManaged && pId !== game.user.id) return;
            await setPlayerConfirmation(pId, true);
        });

        // Player: Unconfirm button
        html.find('[data-action="unconfirm-carousing"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).data('participant-id');
            const p = getCarousingParticipants().find(x => x.participantId === pId);
            if (!p) return;
            if (p.isGmManaged && !game.user.isGM) return;
            if (!p.isGmManaged && pId !== game.user.id) return;
            await setPlayerConfirmation(pId, false);
        });


        // Player: Change character button
        html.find('[data-action="change-character"]').click(async (event) => {
            event.preventDefault();
            const userId = $(event.currentTarget).data('user-id');
            if (userId !== game.user.id) return;
            await this._showCharacterSelectDialog(userId);
        });

        // Flip card button
        html.find('[data-action="flip-card"]').click((event) => {
            event.preventDefault();
            const card = $(event.currentTarget).closest('.sdx-carousing-overlay-card');
            card.toggleClass('flipped');
        });

        // Player: Clear drop button
        html.find('[data-action="clear-carousing-drop"]').click(async (event) => {
            event.preventDefault();
            const userId = $(event.currentTarget).data('user-id');
            if (userId !== game.user.id) return;
            await setCarousingDrop(userId, null);
        });

        // Result actions (benefit/mishap)
        html.find('[data-action="add-benefit"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).data('participant-id');
            const result = await addCarousingResult(pId, "benefit");
            if (result) {
                const p = getCarousingParticipants().find(x => x.participantId === pId);
                this._showToast(`${p?.droppedActorName || "Someone"} gained a benefit`, "benefit");
            }
        });

        html.find('[data-action="add-mishap"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).data('participant-id');
            const result = await addCarousingResult(pId, "mishap");
            if (result) {
                const p = getCarousingParticipants().find(x => x.participantId === pId);
                this._showToast(`${p?.droppedActorName || "Someone"} suffered a mishap`, "mishap");
            }
        });

        // GM: Add/Remove Offline Actor
        html.find('[data-action="add-gm-actor"]').click(async (event) => {
            event.preventDefault();
            const actorId = $(event.currentTarget).data('actor-id');
            await addGmParticipant(actorId);
        });

        html.find('[data-action="remove-gm-participant"]').click(async (event) => {
            event.preventDefault();
            const actorId = $(event.currentTarget).data('actor-id');
            await removeGmParticipant(actorId);
        });


        // Remove benefit/mishap
        html.find('[data-action="remove-benefit"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).closest('.sdx-results-section').data('player-id');
            const index = parseInt($(event.currentTarget).data('index'));
            const success = await removeCarousingResult(pId, "benefit", index);
            if (success) {
                const p = getCarousingParticipants().find(x => x.participantId === pId);
                this._showToast(`${p?.droppedActorName || "Someone"} removed a benefit`, "remove");
            }
        });

        html.find('[data-action="remove-mishap"]').click(async (event) => {
            event.preventDefault();
            const pId = $(event.currentTarget).closest('.sdx-results-section').data('player-id');
            const index = parseInt($(event.currentTarget).data('index'));
            const success = await removeCarousingResult(pId, "mishap", index);
            if (success) {
                const p = getCarousingParticipants().find(x => x.participantId === pId);
                this._showToast(`${p?.droppedActorName || "Someone"} removed a mishap`, "remove");
            }
        });


        // Click outside to close (on the backdrop)
        html.find('.sdx-carousing-overlay-backdrop').click((e) => {
            if (e.target === e.currentTarget) {
                // Only close if clicking directly on backdrop, not children
                // Disabled for now - user must use X button
            }
        });

        // Modifiers
        html.find('.sdx-modifier-input').on('change', this._onModifierChange.bind(this));
        html.find('[data-action="toggle-modifiers"]').click(this._onToggleModifiers.bind(this));
    }

    async _onModifierChange(event) {
        event.preventDefault();
        if (!game.user.isGM) return;

        const input = event.currentTarget;
        const pId = input.closest('[data-participant-id]').dataset.participantId;
        const modType = input.dataset.modType;
        const value = input.value;

        await setPlayerModifier(pId, modType, value);

    }

    _onToggleModifiers(event) {
        event.preventDefault();
        const btn = event.currentTarget;
        const card = btn.closest('.sdx-carousing-overlay-card');
        const drawer = card.querySelector('.sdx-modifiers-drawer');

        const isExpanded = drawer.classList.contains('expanded');

        drawer.classList.toggle('expanded');
        btn.classList.toggle('active');

        if (!isExpanded) {
            // Temporarily remove max-height to get accurate scrollHeight
            drawer.style.maxHeight = "none";
            const fullHeight = drawer.scrollHeight;
            drawer.style.maxHeight = "0px";
            // Force reflow then set final height
            drawer.offsetHeight;
            drawer.style.maxHeight = fullHeight + "px";
        } else {
            drawer.style.maxHeight = "0px";
        }
    }

    /**
     * Show a toast notification in the overlay
     * @param {string} message - The message to display
     * @param {string} type - "benefit", "mishap", or "remove"
     */
    _showToast(message, type = "info") {
        // Show locally
        showToastGlobal(message, type);
        // Broadcast to other clients
        broadcastToast(message, type);
    }

    /**
     * Show character selection dialog
     */
    async _showCharacterSelectDialog(userId) {
        const ownedActors = game.actors.filter(a =>
            a.type === "Player" && a.isOwner
        );

        if (ownedActors.length === 0) {
            ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.no_owned_characters"));
            return;
        }

        const drops = getCarousingDrops();
        const currentDropId = drops[userId];

        const content = `
            <div class="sdx-character-select-dialog">
                <p>${game.i18n.localize("SHADOWDARK_EXTRAS.carousing.select_character_prompt")}</p>
                <div class="sdx-character-list">
                    ${ownedActors.map(actor => `
                        <div class="sdx-character-option ${actor.id === currentDropId ? 'selected' : ''}" data-actor-id="${actor.id}">
                            <img src="${actor.img}" alt="${actor.name}" />
                            <span>${actor.name}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const dialog = new Dialog({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.change_character"),
            content: content,
            buttons: {
                cancel: {
                    icon: '<i class="fas fa-times"></i>',
                    label: game.i18n.localize("SHADOWDARK_EXTRAS.dialog.cancel")
                }
            },
            render: (html) => {
                html.find('.sdx-character-option').click(async (e) => {
                    const actorId = $(e.currentTarget).data('actor-id');
                    await setCarousingDrop(userId, actorId);
                    // Close the dialog properly
                    dialog.close();
                });
            },
            default: "cancel"
        }, {
            classes: ["sdx-carousing-character-dialog"],
            width: 400
        });
        dialog.render(true);
    }

    /**
     * Override _render to apply full-screen styling
     */
    async _render(force = false, options = {}) {
        await super._render(force, options);

        // Apply full-screen positioning
        if (this.element && this.element.length) {
            this.element.css({
                'position': 'fixed',
                'top': '0',
                'left': '0',
                'width': '100vw',
                'height': '100vh',
                'max-width': 'none',
                'max-height': 'none',
                'z-index': '999'
            });
        }
    }
}

/**
 * Open the carousing overlay (convenience export)
 */
export function openCarousingOverlay() {
    return CarousingOverlaySD.open();
}

/**
 * Refresh the carousing overlay if open
 */
export function refreshCarousingOverlay() {
    CarousingOverlaySD.refresh();
}
