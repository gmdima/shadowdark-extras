/**
 * Effects & Conditions Settings for Shadowdark Extras
 * Configures behavior for active effects and conditions
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Effects Settings Configuration Application
 */
export class EffectsSettingsApp extends FormApplication {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "shadowdark-effects-settings",
            classes: ["shadowdark-extras", "effects-settings"],
            title: "Effects & Conditions Settings",
            template: "modules/shadowdark-extras/templates/effects-settings.hbs",
            width: 600,
            height: "auto",
            maxHeight: 480,
            scrollY: [".window-content"],
            closeOnSubmit: true,
            submitOnChange: false,
            submitOnClose: false,
        });
    }

    async getData(options = {}) {
        const data = await super.getData(options);

        // Get current effects settings
        data.settings = game.settings.get(MODULE_ID, "effectsSettings");

        return data;
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Resize window when details elements are toggled
        html.find('details').on('toggle', (event) => {
            // Use setTimeout to allow the DOM to update before resizing
            setTimeout(() => {
                this.setPosition({ height: 'auto' });
            }, 0);
        });
    }

    async _updateObject(event, formData) {
        // Save the effects settings
        const settings = foundry.utils.expandObject(formData);
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
