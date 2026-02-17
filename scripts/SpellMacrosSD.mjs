/**
 * Spell Macros for Shadowdark Extras
 * 
 * This module serves as the main entry point for spell macro functions.
 * Individual spell implementations are organized in the ./macros/ folder.
 */

const MODULE_ID = "shadowdark-extras";

// Import Identify spell functions
import {
    isUnidentified,
    getUnidentifiedName,
    showIdentifyDialog,
    identifyItem,
    showItemReveal
} from "./macros/identify.mjs";

// Import Holy Weapon spell functions
import {
    showHolyWeaponDialog,
    applyHolyWeapon
} from "./macros/holy-weapon.mjs";

// Import Cleansing Weapon spell functions
import {
    showCleansingWeaponDialog,
    applyCleansingWeapon
} from "./macros/cleansing-weapon.mjs";

// Import Wrath spell functions
import {
    showWrathWeaponDialog,
    applyWrathWeapon,
    applyWrathToAllWeapons
} from "./macros/wrath.mjs";

// Import Shapechanger spell functions
import {
    showShapechangerDialog,
    applyShapechanger,
    revertShapechanger
} from "./macros/shapechanger.mjs";

// Re-export all functions for backward compatibility
export {
    // Identify spell
    isUnidentified,
    getUnidentifiedName,
    showIdentifyDialog,
    identifyItem,
    showItemReveal,
    // Holy Weapon spell
    showHolyWeaponDialog,
    applyHolyWeapon,
    // Cleansing Weapon spell
    showCleansingWeaponDialog,
    applyCleansingWeapon,
    // Wrath spell
    showWrathWeaponDialog,
    applyWrathWeapon,
    applyWrathToAllWeapons,
    // Shapechanger spell
    showShapechangerDialog,
    applyShapechanger,
    revertShapechanger
};

// ============================================
// API REGISTRATION
// ============================================
// Register API functions immediately when module loads
Hooks.once("ready", () => {
    const module = game.modules.get(MODULE_ID);
    if (module) {
        module.api = module.api || {};
        // Identify spell
        module.api.isUnidentified = isUnidentified;
        module.api.getUnidentifiedName = getUnidentifiedName;
        module.api.showIdentifyDialog = showIdentifyDialog;
        module.api.identifyItem = identifyItem;
        module.api.showItemReveal = showItemReveal;
        // Holy Weapon spell
        module.api.showHolyWeaponDialog = showHolyWeaponDialog;
        module.api.applyHolyWeapon = applyHolyWeapon;
        // Cleansing Weapon spell
        module.api.showCleansingWeaponDialog = showCleansingWeaponDialog;
        module.api.applyCleansingWeapon = applyCleansingWeapon;
        // Wrath spell
        module.api.showWrathWeaponDialog = showWrathWeaponDialog;
        module.api.applyWrathWeapon = applyWrathWeapon;
        module.api.applyWrathToAllWeapons = applyWrathToAllWeapons;
        // Shapechanger spell
        module.api.showShapechangerDialog = showShapechangerDialog;
        module.api.applyShapechanger = applyShapechanger;
        module.api.revertShapechanger = revertShapechanger;
        console.log(`${MODULE_ID} | Spell Macros API registered`);
    }
});
