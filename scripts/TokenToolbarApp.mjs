/**
 * Token Toolbar Application
 * 
 * V2 Application for displaying the token toolbar HUD.
 * Uses Handlebars template for rendering.
 * Supports drag-to-reposition with position persistence.
 */

import { openSheet, changeLuck, handleHpChange, terminateFocusSpell, terminateDurationSpell } from "./TokenToolbarSD.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// Local storage key for position
const POSITION_KEY = "sdx-token-toolbar-position";

export class TokenToolbarApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-token-toolbar",
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
            template: "modules/shadowdark-extras/templates/token-toolbar.hbs"
        }
    };

    constructor(data = {}, options = {}) {
        super(options);
        this.tokenData = data;
        this._isDragging = false;
        this._dragOffset = { x: 0, y: 0 };
    }

    /**
     * Update the toolbar data and re-render
     * @param {Object} data - Token/actor data
     */
    async updateData(data) {
        this.tokenData = data;
        await this.render();
        this.show();
    }

    /**
     * Show the toolbar with fade-in animation
     */
    show() {
        const elem = document.querySelector("#sdx-token-toolbar");
        if (elem) {
            elem.classList.remove("sdx-toolbar-hidden");
            elem.classList.add("sdx-toolbar-visible");
        }
    }

    /**
     * Hide the toolbar with fade-out animation
     */
    hide() {
        const elem = document.querySelector("#sdx-token-toolbar");
        if (elem) {
            elem.classList.remove("sdx-toolbar-visible");
            elem.classList.add("sdx-toolbar-hidden");
        }
    }

    /**
     * Prepare context data for the template
     */
    _prepareContext(options) {
        return {
            uuid: this.tokenData.uuid,
            actorId: this.tokenData.actorId,
            isPlayer: this.tokenData.isPlayer,
            isToken: this.tokenData.isToken,
            name: this.tokenData.name,
            level: this.tokenData.level,
            ancestry: this.tokenData.ancestry,
            class: this.tokenData.class,
            armor: this.tokenData.armor,
            luck: this.tokenData.luck,
            picture: this.tokenData.picture,
            hp: this.tokenData.hp,
            activeEffects: this.tokenData.activeEffects || [],
            equippedItems: this.tokenData.equippedItems || [],
            focusSpells: this.tokenData.focusSpells || [],
            durationSpells: this.tokenData.durationSpells || [],
        };
    }

    /**
     * Insert the element into the UI - now uses body for absolute positioning
     * @param {HTMLElement} element - The rendered element
     */
    _insertElement(element) {
        const existing = document.getElementById(element.id);

        // Insert into the body for free-floating positioning
        const container = document.body;

        if (existing) {
            existing.replaceWith(element);
        } else {
            container.appendChild(element);
        }

        // Apply saved position or default to bottom center
        this._applyPosition(element);
    }

    /**
     * Apply saved position or default positioning
     * @param {HTMLElement} element - The toolbar element
     */
    _applyPosition(element) {
        const savedPosition = this._loadPosition();

        if (savedPosition) {
            // Use saved position
            element.style.position = "fixed";
            element.style.transform = "none";
            element.style.bottom = "auto";

            // Apply position - we'll clamp on next render if needed
            element.style.left = `${savedPosition.x}px`;
            element.style.top = `${savedPosition.y}px`;
        } else {
            // Default position: bottom center
            element.style.position = "fixed";
            element.style.left = "50%";
            element.style.transform = "translateX(-50%)";
            element.style.bottom = "100px";
            element.style.top = "auto";
        }
    }

    /**
     * Save position to localStorage
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    _savePosition(x, y) {
        try {
            localStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
        } catch (e) {
            console.warn("shadowdark-extras | Failed to save toolbar position:", e);
        }
    }

    /**
     * Load position from localStorage
     * @returns {Object|null} - Position object or null
     */
    _loadPosition() {
        try {
            const saved = localStorage.getItem(POSITION_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.warn("shadowdark-extras | Failed to load toolbar position:", e);
            return null;
        }
    }

    /**
     * Reset position to default (bottom center)
     */
    resetPosition() {
        try {
            localStorage.removeItem(POSITION_KEY);
        } catch (e) {
            // Ignore
        }
        const elem = document.querySelector("#sdx-token-toolbar");
        if (elem) {
            elem.style.transform = "translateX(-50%)";
            elem.style.left = "50%";
            elem.style.bottom = "100px";
            elem.style.top = "auto";
        }
    }

    /**
     * Called after rendering - attach event listeners
     * @param {Object} context - Render context
     * @param {Object} options - Render options
     */
    _onRender(context, options) {
        const toolbar = document.querySelector("#sdx-token-toolbar");
        if (!toolbar) return;

        // Open sheet on portrait click
        toolbar.querySelectorAll(".sdx-toolbar-sheet").forEach(el => {
            el.addEventListener("click", openSheet);
        });

        // Luck tracker (click = +1 or toggle, right-click = -1)
        const luckAttr = toolbar.querySelector(".sdx-toolbar-attr-luck");
        if (luckAttr) {
            const pulpMode = game.settings.get("shadowdark", "usePulpMode");

            luckAttr.addEventListener("click", (e) => {
                if (pulpMode) {
                    changeLuck(e, 1);
                } else {
                    changeLuck(e, null);
                }
            });

            luckAttr.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                if (pulpMode) {
                    changeLuck(e, -1);
                } else {
                    changeLuck(e, null);
                }
            });
        }

        // HP input handling
        const hpInput = toolbar.querySelector(".sdx-toolbar-hp-current");
        if (hpInput) {
            hpInput.addEventListener("focus", function () {
                this.value = "";
            });

            hpInput.addEventListener("blur", function () {
                this.value = this.dataset.value;
            });

            hpInput.addEventListener("keyup", handleHpChange);
        }

        // Click on equipped items to roll/use them
        toolbar.querySelectorAll(".sdx-toolbar-icon-equipped").forEach(el => {
            el.addEventListener("click", async (e) => {
                const actorUuid = el.dataset.actorUuid;
                const itemId = el.dataset.itemId;
                const itemType = el.dataset.itemType;

                if (!actorUuid || !itemId) return;

                const actor = await fromUuid(actorUuid);
                if (!actor) return;

                const item = actor.items.get(itemId);
                if (!item) return;

                // For weapons, roll the attack
                if (itemType === "Weapon") {
                    // Shadowdark uses rollAttack for weapons
                    if (typeof actor.rollAttack === "function") {
                        await actor.rollAttack(itemId);
                    } else if (typeof item.roll === "function") {
                        await item.roll();
                    }
                } else if (itemType === "NPC Attack") {
                    // NPC Attack - roll using actor's rollNpcAttack or displayCard
                    if (typeof actor.rollNpcAttack === "function") {
                        await actor.rollNpcAttack(itemId);
                    } else if (typeof item.displayCard === "function") {
                        await item.displayCard();
                    } else {
                        item.sheet.render(true);
                    }
                } else if (itemType === "NPC Special Attack") {
                    // NPC Special Attack - display card or open sheet
                    if (typeof item.displayCard === "function") {
                        await item.displayCard();
                    } else {
                        item.sheet.render(true);
                    }
                } else if (itemType === "NPC Feature") {
                    // NPC Feature - display card or open sheet
                    if (typeof item.displayCard === "function") {
                        await item.displayCard();
                    } else {
                        item.sheet.render(true);
                    }
                } else {
                    // For other items, open the item sheet
                    item.sheet.render(true);
                }
            });
        });

        // Right-click on effects to delete them
        toolbar.querySelectorAll(".sdx-toolbar-icon-effect").forEach(el => {
            el.addEventListener("contextmenu", async (e) => {
                e.preventDefault();

                const actorUuid = el.dataset.actorUuid;
                const effectId = el.dataset.effectId;
                const isActiveEffect = el.dataset.isActiveEffect === "true";

                if (!actorUuid || !effectId) return;

                const actor = await fromUuid(actorUuid);
                if (!actor) return;

                let effectName = "Unknown";

                if (isActiveEffect) {
                    // Delete from actor.effects (Foundry ActiveEffect)
                    const effect = actor.effects.get(effectId);
                    if (effect) {
                        effectName = effect.name;
                        await effect.delete();
                    }
                } else {
                    // Delete from actor.items (Shadowdark Effect item)
                    const item = actor.items.get(effectId);
                    if (item) {
                        effectName = item.name;
                        await item.delete();
                    }
                }

                // Show a brief notification
                ui.notifications.info(`Removed: ${effectName}`);
            });
        });

        // Right-click on spell icons to terminate them
        toolbar.querySelectorAll(".sdx-toolbar-icon-spell").forEach(el => {
            el.addEventListener("contextmenu", async (e) => {
                e.preventDefault();

                const isFocus = el.dataset.isFocus === "true";

                if (isFocus) {
                    // Terminate focus spell
                    await terminateFocusSpell(e);
                } else {
                    // Terminate duration spell
                    await terminateDurationSpell(e);
                }
            });
        });

        // Setup drag functionality on the portrait/picture area
        this._setupDrag(toolbar);
    }

    /**
     * Setup drag-to-move functionality
     * @param {HTMLElement} toolbar - The toolbar element
     */
    _setupDrag(toolbar) {
        const dragHandle = toolbar.querySelector(".sdx-toolbar-picture");
        if (!dragHandle) return;

        // Add drag cursor indicator
        dragHandle.style.cursor = "grab";

        const onMouseDown = (e) => {
            // Don't start drag if clicking on the sheet overlay
            if (e.target.classList.contains("sdx-toolbar-sheet")) return;

            e.preventDefault();
            this._isDragging = true;
            dragHandle.style.cursor = "grabbing";

            // Clear any transform as we'll use absolute positioning
            toolbar.style.transform = "none";

            // Calculate offset from mouse to element corner
            const rect = toolbar.getBoundingClientRect();
            this._dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };

            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
        };

        const onMouseMove = (e) => {
            if (!this._isDragging) return;

            const x = e.clientX - this._dragOffset.x;
            const y = e.clientY - this._dragOffset.y;

            // Keep within viewport bounds
            const maxX = window.innerWidth - toolbar.offsetWidth;
            const maxY = window.innerHeight - toolbar.offsetHeight;

            toolbar.style.left = `${Math.min(Math.max(0, x), maxX)}px`;
            toolbar.style.top = `${Math.min(Math.max(0, y), maxY)}px`;
            toolbar.style.bottom = "auto";
        };

        const onMouseUp = (e) => {
            if (!this._isDragging) return;

            this._isDragging = false;
            dragHandle.style.cursor = "grab";

            // Save the new position
            const rect = toolbar.getBoundingClientRect();
            this._savePosition(rect.left, rect.top);

            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };

        dragHandle.addEventListener("mousedown", onMouseDown);

        // Double-click to reset position
        dragHandle.addEventListener("dblclick", (e) => {
            if (e.target.classList.contains("sdx-toolbar-sheet")) return;
            this.resetPosition();
        });
    }
}
