export const MODULE_ID = "shadowdark-extras";

// Theme file paths
const DARK_THEME_PATH = `modules/${MODULE_ID}/assets/themes/dark2.json`;
const LIGHT_THEME_PATH = `modules/${MODULE_ID}/assets/themes/light.json`;

// Cache for loaded themes
let darkTheme = null;
let lightTheme = null;

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
        default: true,
        onChange: (value) => toggleDarkMode(value)
    });

    // Initialize dark mode class on load without overwriting custom settings
    toggleDarkMode(game.settings.get(MODULE_ID, "darkMode"), false);
}

/**
 * Load a theme JSON file
 * @param {string} path - Path to the theme file
 * @returns {Promise<Object>} The theme object
 */
async function loadTheme(path) {
    try {
        const response = await fetch(path);
        if (!response.ok) {
            console.error(`${MODULE_ID} | Failed to load theme: ${path}`);
            return null;
        }
        return await response.json();
    } catch (err) {
        console.error(`${MODULE_ID} | Error loading theme:`, err);
        return null;
    }
}

/**
 * Apply a theme to the sheet editor settings
 * @param {Object} theme - The theme settings object
 */
async function applyTheme(theme) {
    if (!theme) return;

    // Apply each theme setting
    for (const [key, value] of Object.entries(theme)) {
        try {
            // Check if the setting exists before trying to set it
            if (game.settings.settings.has(`${MODULE_ID}.${key}`)) {
                await game.settings.set(MODULE_ID, key, value);
            }
        } catch (err) {
            console.warn(`${MODULE_ID} | Could not apply setting ${key}:`, err);
        }
    }
}

/**
 * Toggle the dark mode class on the document body and optionally apply theme presets
 * @param {boolean} enabled - Whether dark mode is enabled
 * @param {boolean} [applyStyles=true] - Whether to apply theme JSON settings
 */
async function toggleDarkMode(enabled, applyStyles = true) {
    if (enabled) {
        document.body.classList.add("sdx-dark-mode");

        if (!applyStyles) return;

        // Load and apply dark theme if not cached
        if (!darkTheme) {
            darkTheme = await loadTheme(DARK_THEME_PATH);
        }
        await applyTheme(darkTheme);
    } else {
        document.body.classList.remove("sdx-dark-mode");

        if (!applyStyles) return;

        // Load and apply light theme if not cached
        if (!lightTheme) {
            lightTheme = await loadTheme(LIGHT_THEME_PATH);
        }
        await applyTheme(lightTheme);
    }
}

/**
 * Initialize appearance settings
 */
export function initAppearanceSettings() {
    registerAppearanceSettings();
}
