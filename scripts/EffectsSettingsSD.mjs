/**
 * Effects & Conditions Settings for Shadowdark Extras
 * Configures behavior for active effects and conditions
 */

const MODULE_ID = "shadowdark-extras";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Effects Settings Configuration Application
 */
export class EffectsSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "shadowdark-effects-settings",
        classes: ["shadowdark-extras", "effects-settings"],
        tag: "form",
        window: {
            title: "Effects & Conditions Settings",
            resizable: true
        },
        position: {
            width: 600,
            height: "auto"
        },
        form: {
            handler: EffectsSettingsApp.formHandler,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    static PARTS = {
        form: {
            template: "modules/shadowdark-extras/templates/effects-settings.hbs",
            scrollable: [""]
        }
    };

    async _prepareContext(options) {
        return {
            settings: game.settings.get(MODULE_ID, "effectsSettings")
        };
    }

    _onRender(context, options) {
        const html = this.element;
        if (!html) return;

        // Resize window when details elements are toggled
        html.querySelectorAll("details").forEach(d => {
            d.addEventListener("toggle", () => {
                setTimeout(() => this.setPosition({ height: "auto" }), 0);
            });
        });
    }

    static async formHandler(event, form, formData) {
        const settings = foundry.utils.expandObject(formData.object);
        await game.settings.set(MODULE_ID, "effectsSettings", settings);
        ui.notifications.info("Effects settings saved successfully");
    }
}

/**
 * Default effects settings configuration
 */
export const DEFAULT_EFFECTS_SETTINGS = {
    silenced: {
        blocksSpells: true,
        blocksScrolls: false,
        blocksWands: false
    }
};

/**
 * Register effects settings
 */
export function registerEffectsSettings() {
    // Register the effects settings data (not shown in config)
    game.settings.register(MODULE_ID, "effectsSettings", {
        name: "Effects Settings Configuration",
        scope: "world",
        config: false,
        type: Object,
        default: foundry.utils.deepClone(DEFAULT_EFFECTS_SETTINGS)
    });

    // Register a menu button to open the Effects Settings app
    game.settings.registerMenu(MODULE_ID, "effectsSettingsMenu", {
        name: "Effects & Conditions Settings",
        label: "Configure Effects",
        hint: "Configure behavior for effects and conditions like Silenced",
        icon: "fas fa-magic",
        type: EffectsSettingsApp,
        restricted: true
    });

    console.log(`${MODULE_ID} | Effects settings registered`);
}
