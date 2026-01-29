const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Configuration application for defining what is locked when a sheet is "Locked"
 */
export default class SheetLockConfig extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "sdx-sheet-lock-config",
        tag: "form",
        window: {
            title: "SHADOWDARK_EXTRAS.sheet_lock.title",
            icon: "fas fa-lock",
            resizable: true,
        },
        position: {
            width: 500,
            height: "auto"
        },
        form: {
            handler: SheetLockConfig.formHandler,
            submitOnChange: false,
            closeOnSubmit: true
        }
    };

    static PARTS = {
        form: {
            template: "modules/shadowdark-extras/templates/sheet-lock-config.hbs"
        }
    };

    /**
     * Default lock settings
     */
    static get defaultSettings() {
        return {
            xp: true,
            coins: true,

            hp: true,
            stats: true,
            luck: true,

            inventory: true,    // Prevent adding/removing items (general)

            activeEffects: true // Prevent adding/removing active effects
        };
    }

    async _prepareContext(options) {
        const settings = game.settings.get("shadowdark-extras", "sheetLockConfig") || SheetLockConfig.defaultSettings;
        return {
            ...settings
        };
    }

    static async formHandler(event, form, formData) {
        const settings = foundry.utils.expandObject(formData.object);
        await game.settings.set("shadowdark-extras", "sheetLockConfig", settings);
        ui.notifications.info("SHADOWDARK_EXTRAS.sheet_lock.saved", { localize: true });
    }
}
