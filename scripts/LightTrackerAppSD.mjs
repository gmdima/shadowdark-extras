/**
 * Light Tracker AppV2 for Shadowdark Extras
 * 
 * A modern AppV2 wrapper around the system's light source tracker.
 * Provides SDX styling while leveraging the existing tracking logic.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const MODULE_ID = "shadowdark-extras";

// Singleton instance
let _instance = null;

export class LightTrackerAppSD extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(options = {}) {
        super(options);
        this.showAllPlayerActors = true;
        this._refreshIntervalId = null;
    }

    static DEFAULT_OPTIONS = {
        tag: "div",
        id: "sdx-light-tracker",
        window: {
            title: "Light Tracker",
            icon: "fas fa-fire",
            resizable: true,
            controls: [],
            classes: ["shadowdark", "sdx-light-tracker-window"]
        },
        position: {
            width: 400,
            height: "auto"
        },
        actions: {
            toggleActor: LightTrackerAppSD.onToggleActor,
            disableLight: LightTrackerAppSD.onDisableLight,
            disableActorLights: LightTrackerAppSD.onDisableActorLights,
            disableAllLights: LightTrackerAppSD.onDisableAllLights,
            toggleShowAll: LightTrackerAppSD.onToggleShowAll
        }
    };

    static PARTS = {
        content: {
            template: `modules/${MODULE_ID}/templates/light-tracker.hbs`,
            scrollable: [".sdx-lt-grid"]
        }
    };

    /**
     * Get the singleton instance
     */
    static getInstance() {
        if (!_instance) {
            _instance = new LightTrackerAppSD();
        }
        return _instance;
    }

    /**
     * Toggle the interface (open/close)
     */
    static toggleInterface() {
        const app = LightTrackerAppSD.getInstance();
        if (app.rendered) {
            app.close();
        } else {
            app.render(true);
        }
    }

    /** @override */
    async _prepareContext(options) {
        const tracker = game.shadowdark?.lightSourceTracker;

        if (!tracker) {
            return {
                error: "Light Source Tracker not available",
                monitoredLightSources: [],
                isRealtimeEnabled: false,
                paused: false,
                showAllPlayerActors: this.showAllPlayerActors
            };
        }

        // Get monitored light sources from the system tracker
        const monitoredLightSources = (tracker.monitoredLightSources || []).map(actorData => {
            return {
                ...actorData,
                showOnTracker: this.showAllPlayerActors || actorData.lightSources?.length > 0,
                lightSources: (actorData.lightSources || []).map(light => ({
                    ...light,
                    remainingMins: Math.ceil((light.system?.light?.remainingSecs || 0) / 60),
                    remainingSecs: light.system?.light?.remainingSecs || 0,
                    isBasic: light.type === "Basic"
                }))
            };
        });

        return {
            monitoredLightSources,
            isRealtimeEnabled: tracker.realTime?.isEnabled() ?? false,
            paused: tracker.realTime?.isPaused() ?? false,
            showAllPlayerActors: this.showAllPlayerActors,
            hasActiveLights: monitoredLightSources.some(a => a.lightSources?.length > 0)
        };
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Start refresh interval to sync with system tracker
        if (!this._refreshIntervalId) {
            this._refreshIntervalId = setInterval(() => {
                if (this.rendered) {
                    this.render({ force: false });
                }
            }, 5000); // Refresh every 5 seconds
        }
    }

    /** @override */
    _onClose(options) {
        super._onClose(options);

        // Clear refresh interval
        if (this._refreshIntervalId) {
            clearInterval(this._refreshIntervalId);
            this._refreshIntervalId = null;
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle actor sheet open/close
     */
    static async onToggleActor(event, target) {
        const actorId = target.dataset.actorId;
        const actor = game.actors.get(actorId);

        if (!actor) return;

        if (actor.sheet.rendered) {
            actor.sheet.close();
        } else {
            actor.sheet.render(true);
        }
    }

    /**
     * Disable a single light source
     */
    static async onDisableLight(event, target) {
        const actorId = target.dataset.actorId;
        const itemId = target.dataset.itemId;

        const actor = game.actors.get(actorId);
        if (!actor) return;

        const item = actor.getEmbeddedDocument("Item", itemId);
        if (!item) return;

        console.log(`${MODULE_ID} | Turning off ${actor.name}'s ${item.name} light source`);

        // Use the system's method if available
        if (typeof actor.yourLightWentOut === "function") {
            await actor.yourLightWentOut(itemId);
        }

        if (item.type === "Effect") {
            await actor.deleteEmbeddedDocuments("Item", [itemId]);
        } else {
            const active = !item.system.light.active;
            await actor.updateEmbeddedDocuments("Item", [{
                "_id": itemId,
                "system.light.active": active
            }]);
        }

        // Mark tracker as dirty and refresh
        const tracker = game.shadowdark?.lightSourceTracker;
        if (tracker) {
            tracker.dirty = true;
        }

        this.render({ force: true });
    }

    /**
     * Disable all light sources
     */
    static async onDisableAllLights(event, target) {
        const tracker = game.shadowdark?.lightSourceTracker;
        if (!tracker || tracker.monitoredLightSources.length <= 0) return;

        console.log(`${MODULE_ID} | Turning out all the lights`);

        for (const actorData of tracker.monitoredLightSources) {
            if (actorData.lightSources.length <= 0) continue;

            const actor = game.actors.get(actorData._id);
            if (!actor) continue;

            // Turn off the actor's light
            if (typeof actor.turnLightOff === "function") {
                await actor.turnLightOff();
            }

            for (const itemData of actorData.lightSources) {
                console.log(`${MODULE_ID} | Turning off ${actor.name}'s ${itemData.name} light source`);

                if (itemData.type === "Effect") {
                    await actor.deleteEmbeddedDocuments("Item", [itemData._id]);
                } else {
                    await actor.updateEmbeddedDocuments("Item", [{
                        "_id": itemData._id,
                        "system.light.active": false
                    }]);
                }
            }
        }

        // Post chat message
        const cardData = {
            img: "icons/magic/perception/shadow-stealth-eyes-purple.webp",
            message: game.i18n.localize("SHADOWDARK.chat.light_source.source.all")
        };

        const content = await foundry.applications.handlebars.renderTemplate(
            "systems/shadowdark/templates/chat/lightsource-toggle-gm.hbs",
            cardData
        );

        await ChatMessage.create({
            content,
            rollMode: CONST.DICE_ROLL_MODES.PUBLIC
        });

        // Mark tracker as dirty and refresh
        tracker.dirty = true;
        this.render({ force: true });
    }

    /**
     * Disable all lights for a single actor
     */
    static async onDisableActorLights(event, target) {
        const actorId = target.dataset.actorId;
        const actor = game.actors.get(actorId);
        if (!actor) return;

        const tracker = game.shadowdark?.lightSourceTracker;
        const actorData = tracker?.monitoredLightSources?.find(a => a._id === actorId);
        if (!actorData || actorData.lightSources.length <= 0) return;

        console.log(`${MODULE_ID} | Turning off all lights for ${actor.name}`);

        // Turn off the actor's light
        if (typeof actor.turnLightOff === "function") {
            await actor.turnLightOff();
        }

        for (const itemData of actorData.lightSources) {
            console.log(`${MODULE_ID} | Turning off ${actor.name}'s ${itemData.name} light source`);

            if (typeof actor.yourLightWentOut === "function") {
                await actor.yourLightWentOut(itemData._id);
            }

            if (itemData.type === "Effect") {
                await actor.deleteEmbeddedDocuments("Item", [itemData._id]);
            } else {
                await actor.updateEmbeddedDocuments("Item", [{
                    "_id": itemData._id,
                    "system.light.active": false
                }]);
            }
        }

        // Mark tracker as dirty and refresh
        if (tracker) {
            tracker.dirty = true;
        }

        this.render({ force: true });
    }

    /**
     * Toggle showing all player actors vs only those with active lights
     */
    static async onToggleShowAll(event, target) {
        this.showAllPlayerActors = !this.showAllPlayerActors;
        this.render({ force: true });
    }
}

/**
 * Initialize the Light Tracker App
 */
export function initLightTrackerApp() {
    // Register with game for easy access
    if (!game.shadowdarkExtras) game.shadowdarkExtras = {};
    game.shadowdarkExtras.lightTracker = {
        toggle: () => LightTrackerAppSD.toggleInterface(),
        app: LightTrackerAppSD
    };

    console.log(`${MODULE_ID} | Light Tracker AppV2 initialized`);
}
