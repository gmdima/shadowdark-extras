export const MODULE_ID = "shadowdark-extras";

/**
 * Register appearance-related settings
 */
export function registerAppearanceSettings() {
    game.settings.register(MODULE_ID, "darkMode", {
        name: "SHADOWDARK_EXTRAS.settings.darkMode.name",
        hint: "SHADOWDARK_EXTRAS.settings.darkMode.hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => toggleDarkMode(value)
    });

    // Initialize dark mode on load
    toggleDarkMode(game.settings.get(MODULE_ID, "darkMode"));
}

/**
 * Toggle the dark mode class on the document body
 * @param {boolean} enabled - Whether dark mode is enabled
 */
function toggleDarkMode(enabled) {
    if (enabled) {
        document.body.classList.add("sdx-dark-mode");
    } else {
        document.body.classList.remove("sdx-dark-mode");
    }
}

/**
 * Initialize appearance settings
 */
export function initAppearanceSettings() {
    registerAppearanceSettings();
}
