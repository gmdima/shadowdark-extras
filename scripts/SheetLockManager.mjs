import SheetLockConfig from "./SheetLockConfig.mjs";

const MODULE_ID = "shadowdark-extras";
const LOCK_FLAG = "sheetLocked";

export default class SheetLockManager {
    static init() {
        // Register Settings
        game.settings.register(MODULE_ID, "sheetLockConfig", {
            name: "Sheet Lock Configuration",
            scope: "world",
            config: false,
            type: Object,
            default: SheetLockConfig.defaultSettings
        });

        game.settings.registerMenu(MODULE_ID, "sheetLockMenu", {
            name: "SHADOWDARK_EXTRAS.sheet_lock.menu_name",
            label: "SHADOWDARK_EXTRAS.sheet_lock.menu_label",
            hint: "SHADOWDARK_EXTRAS.sheet_lock.menu_hint",
            icon: "fas fa-lock",
            type: SheetLockConfig,
            restricted: true
        });

        // Register Hooks
        Hooks.on("renderActorSheet", this._onRenderActorSheet.bind(this));
        Hooks.on("renderApplication", this._onRenderApplication.bind(this));
        Hooks.on("preUpdateActor", this._onPreUpdateActor.bind(this));
        Hooks.on("preCreateItem", this._onPreCreateItem.bind(this));
        Hooks.on("preDeleteItem", this._onPreDeleteItem.bind(this));
        Hooks.on("preUpdateItem", this._onPreUpdateItem.bind(this));
    }

    /**
     * Is the actor currently locked?
     */
    static isLocked(actor) {
        return actor.getFlag(MODULE_ID, LOCK_FLAG) === true;
    }

    /**
     * Get the current lock configuration
     */
    static getConfig() {
        return game.settings.get(MODULE_ID, "sheetLockConfig") || SheetLockConfig.defaultSettings;
    }

    /**
     * Check if a specific feature is locked
     */
    static isFeatureLocked(featureKey) {
        const config = this.getConfig();
        return config[featureKey] === true;
    }

    // ============================================
    // RENDER HOOKS
    // ============================================

    static _onRenderActorSheet(app, html, data) {
        if (!app.actor || !app.actor.isOwner) return;

        // 1. Inject or Update Lock Toggle (GM Only)
        if (game.user.isGM) {
            this._injectLockToggle(app, html);
        }

        const root = html.closest(".window-app");
        const config = this.getConfig();

        // 2. Apply or Remove Lock UI (Everyone)
        if (this.isLocked(app.actor)) {
            // Add global class
            root.addClass("sdx-sheet-locked");

            // Add specific classes based on what is locked
            if (config.xp) root.addClass("lock-xp");
            if (config.coins) root.addClass("lock-coins");
            if (config.hp) root.addClass("lock-hp");
            if (config.stats) root.addClass("lock-stats");
            if (config.luck) root.addClass("lock-luck");

            if (config.inventory) root.addClass("lock-inventory");
            if (config.activeEffects) root.addClass("lock-activeEffects");

            // Disable specific inputs for players
            if (!game.user.isGM) {
                this._disableInputs(html, config);
            }
        } else {
            // Remove all lock classes if unlocked
            root.removeClass("sdx-sheet-locked lock-xp lock-coins lock-hp lock-stats lock-luck lock-inventory lock-activeEffects");

            if (!game.user.isGM) {
                this._enableInputs(html);
            }
        }

        // 3. Disable Context Menus (Event Interception)
        this._disableContextMenus(app, html);
    }

    static _onRenderApplication(app, html, data) {
        // Check if this is the Gem Bag
        if (!app.title || !app.title.startsWith("Gem Bag:")) return;

        // Try to find the actor
        let actor = app.actor || app.object;
        if (!actor && data.actor) actor = data.actor;
        if (!actor) return;

        // Check Lock Logic
        if (this.isLocked(actor)) {
            const root = html.closest(".window-app");
            const config = this.getConfig();

            // Gem Bag is effectively "Gems" + "Coins" (selling) + "Inventory" (add gem)
            root.addClass("sdx-sheet-locked");
            // if (config.gems) root.addClass("lock-gems"); // Removed
            if (config.coins) root.addClass("lock-coins"); // Selling gems gives coins
        }

        // Disable Context Menus if they exist
        this._disableContextMenus(app, html);
    }

    static _disableContextMenus(app, html) {
        // We need to use CAPTURE phase to intercept the event before Foundry's own listeners (which usually sit on the list container) see it.
        // jQuery's .on() does not support capture. We must use native addEventListener.

        const rootElement = html.closest(".window-app")[0];
        if (!rootElement) return;

        // Remove old listener if exists to prevent duplicates
        if (app._sdxContextMenuHandler) {
            rootElement.removeEventListener("contextmenu", app._sdxContextMenuHandler, true);
            delete app._sdxContextMenuHandler;
        }

        // Check if currently locked
        // Note: html is a jQuery object, rootElement is DOM
        // The class might be on the rootElement itself if it's the window
        if (!rootElement.classList.contains("sdx-sheet-locked")) return;

        // Define Handler
        const handler = (ev) => {
            if (game.user.isGM) return;

            const target = ev.target;
            const $target = $(target);
            const $root = $(rootElement);

            let shouldBlock = false;

            // Check locks based on what the target is inside

            // Inventory
            if ($root.hasClass("lock-inventory")) {
                if ($target.closest(".tab-inventory").length || $target.closest(".inventory-list").length) {
                    shouldBlock = true;
                }
            }

            // Spells
            if ($root.hasClass("lock-spells") && $target.closest(".tab-spells").length) {
                shouldBlock = true;
            }

            // Talents
            if ($root.hasClass("lock-talents") && $target.closest(".tab-talents").length) {
                shouldBlock = true;
            }

            // Gem Bag / Gems
            // Just basic locking now since config.gems is gone.
            // Maybe tie it to Inventory? Or just leave it unlocked if "Lock Gems" is gone?
            // User crossed out "Lock Gems".
            // But if Gem Bag is open and SHEET is locked, should it be locked?
            // For now, if "Lock Coins" is on, prevent selling.
            // But prevents adding?

            // If we removed config.gems, we probably don't add lock-gems class anymore.
            // So this check fails naturally.


            // Bio Items
            // Removed lock-class, lock-ancestry, lock-background logic

            // Active Effects
            if ($root.hasClass("lock-activeEffects") && $target.closest(".effect-item").length) shouldBlock = true;

            if (shouldBlock) {
                ev.preventDefault();
                ev.stopPropagation();
                ev.stopImmediatePropagation(); // Ensure nothing else hears it
                return false;
            }
        };

        // Attach with Capture=true
        rootElement.addEventListener("contextmenu", handler, true);

        // Store on app instance for cleanup
        app._sdxContextMenuHandler = handler;
    }

    static _onRenderApplication(app, html, data) {
        // Check if this is the Gem Bag
        if (!app.title || !app.title.startsWith("Gem Bag:")) return;

        // Try to find the actor
        // Usually it might be app.object or passed in data
        let actor = app.actor || app.object;
        // If it is just a plain Application, it might store actor elsewhere.
        // But "Gem Bag: [Name]" implies it's tied to an actor.

        if (!actor && data.actor) actor = data.actor;
        if (!actor) return;

        // Check Lock Logic
        if (this.isLocked(actor)) {
            const root = html.closest(".window-app");
            const config = this.getConfig();

            // Gem Bag is effectively "Gems" + "Coins" (selling) + "Inventory" (add gem)
            root.addClass("sdx-sheet-locked");
            if (config.gems) root.addClass("lock-gems");
            if (config.coins) root.addClass("lock-coins"); // Selling gems gives coins
        }

        // Patch Context Menus if they exist
        this._patchContextMenus(app);
    }



    static _injectLockToggle(app, html) {
        const header = html.closest(".window-app").find(".window-header .window-title");
        let toggleBtn = html.closest(".window-app").find(".sdx-sheet-lock-toggle");

        const isLocked = this.isLocked(app.actor);
        const iconClass = isLocked ? "fas fa-lock" : "fas fa-lock-open";
        const stateClass = isLocked ? "locked" : "unlocked";
        const tooltip = isLocked ? "Unlock Sheet" : "Lock Sheet";

        if (toggleBtn.length === 0) {
            // Create if doesn't exist
            toggleBtn = $(`<a class="sdx-sheet-lock-toggle" title="${tooltip}"><i class="${iconClass}"></i></a>`);

            toggleBtn.on("click", async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                // Get fresh lock state on click
                const currentLock = this.isLocked(app.actor);
                await app.actor.setFlag(MODULE_ID, LOCK_FLAG, !currentLock);
            });

            header.after(toggleBtn);
        }

        // Always update state (classes/icon) to match current data
        toggleBtn.removeClass("locked unlocked").addClass(stateClass);
        toggleBtn.find("i").removeClass().addClass(iconClass);
        toggleBtn.attr("title", tooltip);
    }

    static _disableInputs(html, config) {
        if (config.xp) html.find('[name="system.level.xp"]').prop("disabled", true);

        if (config.coins) {
            html.find('.inventory-coins input').prop("disabled", true);
            html.find('[name="system.coins.gp"]').prop("disabled", true);
            html.find('[name="system.coins.sp"]').prop("disabled", true);
            html.find('[name="system.coins.cp"]').prop("disabled", true);
        }

        if (config.hp) html.find('[name="system.attributes.hp.value"], [name="system.attributes.hp.max"]').prop("disabled", true);
        if (config.stats) html.find('.ability-score input').prop("disabled", true);
        if (config.luck) html.find('[name="system.luck.available"]').prop("disabled", true);
    }

    static _enableInputs(html) {
        html.find('[name="system.level.xp"]').prop("disabled", false);
        html.find('.inventory-coins input').prop("disabled", false);
        html.find('[name="system.coins.gp"]').prop("disabled", false);
        html.find('[name="system.coins.sp"]').prop("disabled", false);
        html.find('[name="system.coins.cp"]').prop("disabled", false);
        html.find('[name="system.attributes.hp.value"], [name="system.attributes.hp.max"]').prop("disabled", false);
        html.find('.ability-score input').prop("disabled", false);
        html.find('[name="system.luck.available"]').prop("disabled", false);
    }

    static _hideControls(html, config) {
        // Handled by CSS
    }


    // ============================================
    // DATA INTEGRITY HOOKS (PRE-UPDATES)
    // ============================================

    static _onPreUpdateActor(actor, changes, options, userId) {
        if (!this.isLocked(actor)) return;
        if (game.users.get(userId).isGM) return; // Allow GM override

        const config = this.getConfig();
        const flattened = foundry.utils.flattenObject(changes);
        let blocked = false;

        // Check keys
        if (config.xp && "system.level.xp" in flattened) blocked = true;
        if (config.coins && Object.keys(flattened).some(k => k.startsWith("system.coins"))) blocked = true;
        if (config.gems && "system.gems" in flattened) blocked = true;
        if (config.hp && ("system.attributes.hp.value" in flattened || "system.attributes.hp.max" in flattened)) blocked = true;
        if (config.stats && Object.keys(flattened).some(k => k.match(/system\.abilities\.\w+\.base/))) blocked = true;
        if (config.luck && "system.luck.available" in flattened) blocked = true;

        if (blocked) {
            ui.notifications.warn("SHADOWDARK_EXTRAS.sheet_lock.warning_edit", { localize: true });
            return false;
        }
    }

    static _onPreCreateItem(item, data, options, userId) {
        if (game.users.get(userId).isGM) return;
        if (!item.actor || !this.isLocked(item.actor)) return;

        const config = this.getConfig();
        let blocked = false;

        // Check Item Types
        const type = data.type || item.type;

        // General inventory items
        if (config.inventory && ["Weapon", "Armor", "Basic", "Potion", "Gear"].includes(type)) blocked = true;

        // Active Effects (if created via item creation? distinct from ActiveEffect document)

        if (blocked) {
            ui.notifications.warn("SHADOWDARK_EXTRAS.sheet_lock.warning_create", { localize: true });
            return false;
        }
    }

    static _onPreDeleteItem(item, options, userId) {
        if (game.users.get(userId).isGM) return;
        if (!item.actor || !this.isLocked(item.actor)) return;

        const config = this.getConfig();
        let blocked = false;

        const type = item.type;

        if (config.inventory && ["Weapon", "Armor", "Basic", "Potion", "Gear"].includes(type)) blocked = true;

        if (blocked) {
            ui.notifications.warn("SHADOWDARK_EXTRAS.sheet_lock.warning_delete", { localize: true });
            return false;
        }
    }

    static _onPreUpdateItem(item, changes, options, userId) {
        if (game.users.get(userId).isGM) return;
        if (!item.actor || !this.isLocked(item.actor)) return;

        const config = this.getConfig();
        const type = item.type;
        let blocked = false;

        // If inventory is locked, prevent changing quantity, equipped state, etc.
        // Actually, 'equipped' has its own setting (Removed, merged into Inventory or just removed?)
        // If Inventory lock is just adding/removing, maybe we allow editing? 
        // Hints said "Prevents adding, removing, or editing items" -> changed to "Prevents adding or removing".
        // SO... if inventory is locked, maybe we DON'T block updates?
        // But context menu edit/delete is blocked.
        // If user drags a weapon to equip it??

        // Removed config.equipped check.
        // If config.inventory is true, we blocked context menu edits.
        // But what about sheet inputs (qty, etc)?
        // If we want to allow editing, we shouldn't block update here.
        // BUT the user crossed out "editing items".
        // The crossed out part was "editing items", implying they want to ALLOW editing items?
        // "Lock Inventory Management" -> "Prevents adding, [removing], [editing] items"
        // Wait, the cross was scratching out "editing items".
        // This implies "I want to lock add/remove, but ALLOW editing".
        // So I should NOT block updates here properly if it's just an edit.

        // Previously:
        /*
        if (config.inventory && ["Weapon", "Armor", "Basic", "Potion", "Gear"].includes(type)) {
             blocked = true;
        }
        */

        // If I remove this block, editing is allowed.
        // But 'adding' is CreateItem (handled by preCreate), 'removing' is DeleteItem (handled by preDelete).
        // So removing this block effectively allows "Editing".

        // I will remove the inventory update block.

        /*
        if (config.spells && type === "Spell") blocked = true;
        if (config.talents && type === "Talent") blocked = true;
        */

        if (blocked) {
            ui.notifications.warn("SHADOWDARK_EXTRAS.sheet_lock.warning_edit", { localize: true });
            return false;
        }
    }

    // ============================================
    // CONTEXT MENU HOOK
    // ============================================


}
