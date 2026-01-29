/**
 * Carousing System for Shadowdark Extras
 * Implements the full Shadowdark carousing mechanics with synchronized player dropboxes,
 * cost tiers, player confirmations, and roll outcomes.
 */

const MODULE_ID = "shadowdark-extras";
const CAROUSING_JOURNAL_NAME = "__sdx_carousing_sync__";
const CAROUSING_TABLES_JOURNAL_NAME = "__sdx_carousing_tables__";

// Track active tab per player sheet (by actor ID) for persistence
const carousingActiveTabTracker = new Map();

// Cached journal references
let _carousingJournal = null;
let _carousingTablesJournal = null;

// ============================================
// CAROUSING DATA TABLES
// Original mode uses ONLY custom tables created by GM
// ============================================

/**
 * Original Carousing - No default tables (GM must create custom tables)
 * These empty arrays are kept for backwards compatibility
 */
const CAROUSING_TIERS = [];
const CAROUSING_OUTCOMES = [];

// ============================================
// EXPANDED CAROUSING DATA TABLES
// Empty templates - GM must configure via Settings
// ============================================

/**
 * Expanded Carousing Tiers - Empty template (10 tiers)
 * GM configures via Settings > Edit Expanded Tables
 */
const EXPANDED_CAROUSING_TIERS = [
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" },
    { cost: 0, bonus: 0, description: "" }
];

/**
 * Expanded Outcome Table (d8 + tier bonus) - Empty template (25 rows)
 * GM configures via Settings > Edit Expanded Tables
 */
const EXPANDED_OUTCOME_TABLE = [
    { roll: 1, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 2, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 3, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 4, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 5, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 6, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 7, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 8, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 9, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 10, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 11, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 12, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 13, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 14, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 15, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 16, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 17, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 18, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 19, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 20, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 21, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 22, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 23, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 24, mishaps: 0, benefits: 0, modifier: 0, xp: 0 },
    { roll: 25, mishaps: 0, benefits: 0, modifier: 0, xp: 0 }
];

/**
 * Expanded Benefits Table (d100) - Empty template
 * GM configures via Settings > Edit Expanded Tables
 */
const EXPANDED_BENEFITS = Array.from({ length: 100 }, (_, i) => ({ roll: i + 1, description: "" }));

/**
 * Expanded Mishaps Table (d100) - Empty template  
 * GM configures via Settings > Edit Expanded Tables
 */
const EXPANDED_MISHAPS = Array.from({ length: 100 }, (_, i) => ({ roll: i + 1, description: "" }));
// ============================================
// JOURNAL AND STATE MANAGEMENT
// ============================================
/**
 * Initialize the carousing system
 */

export function initCarousing() {
    console.log(`${MODULE_ID} | Carousing system initialized`);
}

/**
 * Get the current carousing mode setting
 * @returns {"original"|"expanded"}
 */
export function getCarousingMode() {
    try {
        return game.settings.get(MODULE_ID, "carousingMode") || "original";
    } catch {
        return "original";
    }
}

/**
 * Get the tiers for the current carousing mode
 * Returns either Original or Expanded tiers based on setting
 */
export function getActiveCarousingTiers() {
    const mode = getCarousingMode();
    return mode === "expanded" ? EXPANDED_CAROUSING_TIERS : CAROUSING_TIERS;
}

/**
 * Get expanded outcome based on d8 roll (uses editable data)
 */
export function getExpandedOutcome(rollTotal) {
    const data = getExpandedCarousingData();
    const outcomes = data.outcomes || EXPANDED_OUTCOME_TABLE;
    const capped = Math.min(rollTotal, 25);
    return outcomes.find(o => o.roll === capped) || outcomes[outcomes.length - 1];
}

/**
 * Get expanded benefit by d100 roll (uses editable data)
 */
export function getExpandedBenefit(rollTotal) {
    const data = getExpandedCarousingData();
    const benefits = data.benefits || EXPANDED_BENEFITS;
    const capped = Math.max(1, Math.min(rollTotal, 100));
    return benefits.find(b => b.roll === capped) || { roll: capped, description: `Benefit result ${capped} (customize via table editor)` };
}

/**
 * Get expanded mishap by d100 roll
 */
export function getExpandedMishap(rollTotal) {
    const capped = Math.max(1, Math.min(rollTotal, 100));
    const data = getExpandedCarousingData();
    const mishaps = data.mishaps || EXPANDED_MISHAPS;
    return mishaps.find(m => m.roll === capped) || { roll: capped, description: `Mishap result ${capped} (customize via table editor)` };
}

// ============================================
// EXPANDED CAROUSING DATA MANAGEMENT
// ============================================

/**
 * Get the default expanded carousing data (hardcoded values)
 */
export function getDefaultExpandedData() {
    return {
        id: "default",
        name: "Shadowdark Expanded (Default)",
        tiers: EXPANDED_CAROUSING_TIERS.map(t => ({ cost: t.cost, bonus: t.bonus })),
        outcomes: EXPANDED_OUTCOME_TABLE.map(o => ({
            roll: o.roll,
            benefits: o.benefits,
            mishaps: o.mishaps,
            modifier: o.modifier,
            xp: o.xp
        })),
        benefits: EXPANDED_BENEFITS.map(b => ({ roll: b.roll, description: b.description })),
        mishaps: EXPANDED_MISHAPS.map(m => ({ roll: m.roll, description: m.description }))
    };
}

/**
 * Get all expanded carousing tables from journal
 */
export function getExpandedCarousingTables() {
    const journal = getCarousingTablesJournal();
    if (!journal) return [];

    // Check for migration from old settings
    let tables = journal.getFlag(MODULE_ID, "expandedTables") || [];
    if (tables.length === 0) {
        // Try to migrate from settings if journal is empty
        try {
            const settingsData = game.settings.get(MODULE_ID, "expandedCarousingData");
            if (settingsData && settingsData.tiers) {
                // We have legacy settings data, convert to a table
                const migratedTable = {
                    ...settingsData,
                    id: foundry.utils.randomID(),
                    name: "Imported Settings"
                };
                // We can't save here easily without async, but we can return it
                // The next save operation will persist it
                tables = [migratedTable];
            }
        } catch (e) {
            // No legacy data
        }

        // If still empty, use default
        if (tables.length === 0) {
            tables = [getDefaultExpandedData()];
        }
    }

    return tables;
}

/**
 * Save all expanded carousing tables to journal
 */
export async function saveExpandedCarousingTables(tables) {
    const journal = getCarousingTablesJournal();
    if (!journal) {
        console.error(`${MODULE_ID} | Carousing tables journal not found!`);
        return;
    }
    await journal.setFlag(MODULE_ID, "expandedTables", tables);
}

/**
 * Get active expanded carousing table data
 * Uses session selectedTableId if available, otherwise first table
 */
export function getExpandedCarousingData() {
    const session = getCarousingSession();
    const tables = getExpandedCarousingTables();

    if (session && session.selectedTableId) {
        const table = tables.find(t => t.id === session.selectedTableId);
        if (table) return table;
    }

    // Fallback to first table or default
    return tables[0] || getDefaultExpandedData();
}

/**
 * Legacy support: Save single table data (now saves to the first table or updates by ID)
 * This is kept for compatibility if needed, but the App should now use saveExpandedCarousingTables
 */
export async function saveExpandedCarousingData(data) {
    const tables = getExpandedCarousingTables();
    const index = tables.findIndex(t => t.id === data.id);

    if (index >= 0) {
        tables[index] = data;
    } else {
        tables.push(data);
    }

    await saveExpandedCarousingTables(tables);
}

/**
 * Get expanded outcome based on d8 roll (uses editable data)
 */
function getExpandedOutcomeFromData(rollTotal) {
    const data = getExpandedCarousingData();
    const outcomes = data.outcomes || EXPANDED_OUTCOME_TABLE;
    const capped = Math.min(rollTotal, 25);
    return outcomes.find(o => o.roll === capped) || outcomes[outcomes.length - 1];
}

/**
 * Get expanded benefit by d100 roll (uses editable data)
 */
function getExpandedBenefitFromData(rollTotal) {
    const data = getExpandedCarousingData();
    const benefits = data.benefits || EXPANDED_BENEFITS;
    const capped = Math.max(1, Math.min(rollTotal, 100));
    return benefits.find(b => b.roll === capped) || { roll: capped, description: `Benefit result ${capped}` };
}

/**
 * Get expanded mishap by d100 roll (uses editable data)
 */
function getExpandedMishapFromData(rollTotal) {
    const data = getExpandedCarousingData();
    const mishaps = data.mishaps || EXPANDED_MISHAPS;
    const capped = Math.max(1, Math.min(rollTotal, 100));
    return mishaps.find(m => m.roll === capped) || { roll: capped, description: `Mishap result ${capped}` };
}


/**
 * Get the carousing journal entry
 */
function getCarousingJournal() {
    if (_carousingJournal && game.journal.get(_carousingJournal.id)) {
        return _carousingJournal;
    }
    _carousingJournal = game.journal.find(j => j.name === CAROUSING_JOURNAL_NAME);
    return _carousingJournal;
}

/**
 * Ensure the carousing journal exists (called by GM on ready)
 */
export async function ensureCarousingJournal() {
    if (!game.user.isGM) return;

    let journal = game.journal.find(j => j.name === CAROUSING_JOURNAL_NAME);

    if (!journal) {
        console.log(`${MODULE_ID} | Creating carousing sync journal...`);
        journal = await JournalEntry.create({
            name: CAROUSING_JOURNAL_NAME,
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
            flags: {
                [MODULE_ID]: {
                    isCarousingJournal: true
                }
            }
        });
        console.log(`${MODULE_ID} | Carousing sync journal created:`, journal.id);
    } else {
        if (journal.ownership.default !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            await journal.update({
                ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
            });
        }
    }

    _carousingJournal = journal;
    return journal;
}

// ============================================
// CUSTOM TABLES JOURNAL MANAGEMENT
// ============================================

/**
 * Get the custom carousing tables journal
 */
function getCarousingTablesJournal() {
    if (_carousingTablesJournal && game.journal.get(_carousingTablesJournal.id)) {
        return _carousingTablesJournal;
    }
    _carousingTablesJournal = game.journal.find(j => j.name === CAROUSING_TABLES_JOURNAL_NAME);
    return _carousingTablesJournal;
}

/**
 * Ensure the custom tables journal exists (called by GM on ready)
 */
export async function ensureCarousingTablesJournal() {
    if (!game.user.isGM) return;

    let journal = game.journal.find(j => j.name === CAROUSING_TABLES_JOURNAL_NAME);

    if (!journal) {
        console.log(`${MODULE_ID} | Creating carousing tables journal...`);
        journal = await JournalEntry.create({
            name: CAROUSING_TABLES_JOURNAL_NAME,
            ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
            flags: {
                [MODULE_ID]: {
                    isCarousingTablesJournal: true,
                    customTables: []
                }
            }
        });
        console.log(`${MODULE_ID} | Carousing tables journal created:`, journal.id);
    }

    _carousingTablesJournal = journal;
    return journal;
}

/**
 * Get all custom carousing tables
 */
export function getCustomCarousingTables() {
    const journal = getCarousingTablesJournal();
    if (!journal) return [];
    return journal.getFlag(MODULE_ID, "customTables") || [];
}

/**
 * Save all custom carousing tables
 */
export async function saveCustomCarousingTables(tables) {
    const journal = getCarousingTablesJournal();
    if (!journal) {
        console.error(`${MODULE_ID} | Custom tables journal not found!`);
        return;
    }
    await journal.setFlag(MODULE_ID, "customTables", tables);
}

/**
 * Get a specific carousing table by ID (or "default" for built-in)
 * Returns { tiers, outcomes, name }
 * Note: Since default tables are now empty, this will return first custom table if available
 */
export function getCarousingTableById(tableId) {
    const customTables = getCustomCarousingTables();

    // If a specific custom table ID is provided, find it
    if (tableId && tableId !== "default") {
        const table = customTables.find(t => t.id === tableId);
        if (table) {
            return table;
        }
    }

    // Default table is now empty - auto-select first custom table if available
    if (customTables.length > 0) {
        return customTables[0];
    }

    // Fallback to empty default (will show "no tables" message)
    return {
        id: "default",
        name: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.default_table"),
        tiers: CAROUSING_TIERS,
        outcomes: CAROUSING_OUTCOMES
    };
}

/**
 * Get carousing gm-added actors
 */
export function getCarousingGmActors() {
    const journal = getCarousingJournal();
    if (!journal) return [];
    return journal.getFlag(MODULE_ID, "carousingGmActors") || [];
}

/**
 * Get carousing drops state
 */
export function getCarousingDrops() {
    const journal = getCarousingJournal();
    if (!journal) return {};
    return journal.getFlag(MODULE_ID, "carousingDrops") || {};
}

/**
 * Save carousing drops state
 */
async function saveCarousingDrops(state) {
    const journal = getCarousingJournal();
    if (!journal) {
        console.error(`${MODULE_ID} | Carousing journal not found!`);
        return;
    }
    await journal.setFlag(MODULE_ID, "carousingDrops", state);
}

/**
 * Get carousing session state
 */
export function getCarousingSession() {
    const journal = getCarousingJournal();
    const defaultSession = { selectedTableId: "default", selectedTier: null, confirmations: {}, phase: "setup", results: {}, modifiers: {} };
    if (!journal) return defaultSession;
    const session = journal.getFlag(MODULE_ID, "carousingSession") || defaultSession;
    if (!session.modifiers) session.modifiers = {};
    return session;
}

/**
 * Save carousing session state
 */
async function saveCarousingSession(session) {
    const journal = getCarousingJournal();
    if (!journal) {
        console.error(`${MODULE_ID} | Carousing journal not found!`);
        return;
    }
    await journal.setFlag(MODULE_ID, "carousingSession", session);
}

/**
 * Set actor drop for a user
 */
export async function setCarousingDrop(userId, actorId) {
    const journal = getCarousingJournal();
    if (!journal) return;

    const session = getCarousingSession();
    const drops = getCarousingDrops();

    if (actorId) {
        drops[userId] = actorId;
    } else {
        delete drops[userId];
    }

    // Always clear confirmation and results when actor changes or is removed
    delete session.confirmations[userId];
    if (session.results) delete session.results[userId];

    await journal.update({
        [`flags.${MODULE_ID}.carousingDrops`]: drops,
        [`flags.${MODULE_ID}.carousingSession`]: session
    });
}

/**
 * Set tier selection (GM only)
 */
export async function setCarousingTier(tierIndex) {
    if (!game.user.isGM) return;
    const journal = getCarousingJournal();
    if (!journal) return;

    const currentSession = getCarousingSession();
    const session = {
        selectedTableId: currentSession.selectedTableId || "default",
        selectedTier: tierIndex,
        confirmations: {},
        phase: "setup",
        results: {}
    };

    await journal.update({
        [`flags.${MODULE_ID}.carousingSession`]: session
    });
}

/**
 * Set table selection (GM only)
 */
export async function setCarousingTable(tableId) {
    if (!game.user.isGM) return;
    const journal = getCarousingJournal();
    if (!journal) return;

    // Reset everything when table changes
    const session = {
        selectedTableId: tableId || "default",
        selectedTier: null,
        confirmations: {},
        phase: "setup",
        results: {}
    };

    await journal.update({
        [`flags.${MODULE_ID}.carousingSession`]: session,
        [`flags.${MODULE_ID}.-=carousingDrops`]: null
    });

    rerenderPlayerSheets();
}

/**
 * Set player confirmation
 */
export async function setPlayerConfirmation(userId, confirmed) {
    const session = getCarousingSession();
    if (confirmed) {
        session.confirmations[userId] = true;
    } else {
        delete session.confirmations[userId];
    }
    await saveCarousingSession(session);
}

/**
 * Set player roll modifier
 * @param {string} userId - The user ID
 * @param {string} type - 'outcome', 'benefits', or 'mishaps'
 * @param {string} value - The modifier value (static or dice string)
 */
export async function setPlayerModifier(userId, type, value) {
    const session = getCarousingSession();
    if (!session.modifiers[userId]) session.modifiers[userId] = {};

    if (!value || value.trim() === "") {
        delete session.modifiers[userId][type];
    } else {
        session.modifiers[userId][type] = value.trim();
    }

    await saveCarousingSession(session);
    // Don't re-render everything on every keystroke if called from input, 
    // but useful for sync
}

/**
 * Add a GM-managed participant (offline/unassigned actor)
 */
export async function addGmParticipant(actorId) {
    if (!game.user.isGM) return;
    const journal = getCarousingJournal();
    if (!journal) return;

    const gmActors = getCarousingGmActors();
    if (gmActors.includes(actorId)) return;

    gmActors.push(actorId);
    await journal.setFlag(MODULE_ID, "carousingGmActors", gmActors);
    rerenderPlayerSheets();
}

/**
 * Remove a GM-managed participant
 */
export async function removeGmParticipant(actorId) {
    if (!game.user.isGM) return;
    const journal = getCarousingJournal();
    if (!journal) return;

    let gmActors = getCarousingGmActors();
    gmActors = gmActors.filter(id => id !== actorId);

    const session = getCarousingSession();
    const participantId = `actor-${actorId}`;
    delete session.confirmations[participantId];
    if (session.results) delete session.results[participantId];
    if (session.modifiers) delete session.modifiers[participantId];

    await journal.update({
        [`flags.${MODULE_ID}.carousingGmActors`]: gmActors,
        [`flags.${MODULE_ID}.carousingSession`]: session
    });
    rerenderPlayerSheets();
}


/**
 * Reset carousing session (GM only)
 */
export async function resetCarousingSession() {
    if (!game.user.isGM) return;
    const journal = getCarousingJournal();
    if (!journal) {
        ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.no_journal"));
        return;
    }

    ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.resetting"));

    // Forcefully wipe the flags using the -= syntax
    // This ensures a clean slate better than just setting to {}
    await journal.update({
        [`flags.${MODULE_ID}.-=carousingSession`]: null,
        [`flags.${MODULE_ID}.-=carousingDrops`]: null
    });

    // Manually trigger local re-render immediately so the GM sees it instantly
    rerenderPlayerSheets();
}

/**
 * Add an extra benefit or mishap result for a user
 * @param {string} userId - The user ID
 * @param {string} type - "benefit" or "mishap"
 * @returns {Object} The new result that was added, or null if failed
 */
export async function addCarousingResult(userId, type) {
    const session = getCarousingSession();
    if (!session.results || !session.results[userId]) {
        console.warn("No results found for user", userId);
        return null;
    }

    // Permission check: players can only modify their own, GM can modify any
    if (!game.user.isGM && game.user.id !== userId) {
        ui.notifications.warn("You can only modify your own results");
        return null;
    }

    // Roll 1d100 for the new result
    const roll = await new Roll("1d100").evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    const rollTotal = roll.total;

    let newResult;
    if (type === "benefit") {
        const benefit = getExpandedBenefit(rollTotal);
        newResult = {
            diceRoll: rollTotal,
            percentMod: 0,
            adjustment: 0,
            finalRoll: rollTotal,
            description: benefit.description
        };
        if (!session.results[userId].benefits) {
            session.results[userId].benefits = [];
        }
        session.results[userId].benefits.push(newResult);
    } else if (type === "mishap") {
        const mishap = getExpandedMishap(rollTotal);
        newResult = {
            diceRoll: rollTotal,
            percentMod: 0,
            adjustment: 0,
            finalRoll: rollTotal,
            description: mishap.description
        };
        if (!session.results[userId].mishaps) {
            session.results[userId].mishaps = [];
        }
        session.results[userId].mishaps.push(newResult);
    } else {
        console.warn("Invalid type:", type);
        return null;
    }

    await saveCarousingSession(session);
    rerenderPlayerSheets();

    return newResult;
}

/**
 * Remove a benefit or mishap result for a user by index
 * @param {string} userId - The user ID
 * @param {string} type - "benefit" or "mishap"
 * @param {number} index - The index of the result to remove
 * @returns {boolean} Whether the removal was successful
 */
export async function removeCarousingResult(userId, type, index) {
    const session = getCarousingSession();
    if (!session.results || !session.results[userId]) {
        console.warn("No results found for user", userId);
        return false;
    }

    // Permission check: players can only modify their own, GM can modify any
    if (!game.user.isGM && game.user.id !== userId) {
        ui.notifications.warn("You can only modify your own results");
        return false;
    }

    const arrayKey = type === "benefit" ? "benefits" : "mishaps";
    const arr = session.results[userId][arrayKey];

    if (!arr || index < 0 || index >= arr.length) {
        console.warn("Invalid index:", index, "for", arrayKey);
        return false;
    }

    // Remove the item
    arr.splice(index, 1);

    await saveCarousingSession(session);
    rerenderPlayerSheets();

    return true;
}

/**
 * Prune carousing data for offline players (GM only)
 */
export async function pruneOfflineCarousingData() {
    if (!game.user.isGM) return;

    const journal = getCarousingJournal();
    if (!journal) return;

    const drops = getCarousingDrops();
    const session = getCarousingSession();
    let dropsChanged = false;
    let sessionChanged = false;

    // Check drops
    for (const userId of Object.keys(drops)) {
        const user = game.users.get(userId);
        if (!user || !user.active) {
            delete drops[userId];
            dropsChanged = true;
        }
    }

    // Check confirmations
    for (const userId of Object.keys(session.confirmations || {})) {
        // Skip GM-managed actors
        if (userId.startsWith("actor-")) continue;

        const user = game.users.get(userId);
        if (!user || !user.active) {
            delete session.confirmations[userId];
            sessionChanged = true;
        }
    }

    if (dropsChanged || sessionChanged) {
        const updates = {};
        if (dropsChanged) updates[`flags.${MODULE_ID}.carousingDrops`] = drops;
        if (sessionChanged) updates[`flags.${MODULE_ID}.carousingSession`] = session;
        await journal.update(updates);
    }
}

// ============================================
// PLAYER DATA HELPERS
// ============================================

/**
 * Calculate Renown bonus based on tiered system:
 * 3 or less = 0
 * 4-7 = +1
 * 8-11 = +2
 * 12 or higher = +3
 * @param {number} renown 
 * @returns {number}
 */
export function getRenownBonus(renown) {
    if (renown >= 12) return 3;
    if (renown >= 8) return 2;
    if (renown >= 4) return 1;
    return 0;
}

/**
 * Get online players and GM-added actors with their carousing data
 */
export function getCarousingParticipants() {
    const drops = getCarousingDrops();
    const gmActors = getCarousingGmActors();
    const session = getCarousingSession();

    // Get the correct table based on mode
    const mode = getCarousingMode();
    const activeTable = mode === "expanded"
        ? getExpandedCarousingData()
        : getCarousingTableById(session.selectedTableId);

    const selectedTier = session.selectedTier !== null ? activeTable.tiers[session.selectedTier] : null;
    const totalTierCost = selectedTier?.cost || 0;

    // Calculate how many participants have characters dropped
    const participantCount = Object.values(drops).length + gmActors.length;
    const splitCost = Math.ceil(totalTierCost / Math.max(1, participantCount));

    // 1. Get Online User participants
    const userParticipants = game.users.filter(user => {
        if (!user.active) return false;
        if (user.role === CONST.USER_ROLES.GAMEMASTER) return false;
        if (user.role === CONST.USER_ROLES.ASSISTANT) return false;
        return true;
    }).map(user => {
        const participantId = user.id; // Keep original ID for user drops to avoid breaking everything
        const droppedActorId = drops[user.id];
        const droppedActor = droppedActorId ? game.actors.get(droppedActorId) : null;
        const actorGp = droppedActor ? getActorTotalGp(droppedActor) : 0;
        const canAfford = actorGp >= splitCost;
        const isConfirmed = session.confirmations[user.id] === true;
        const result = session.results?.[user.id];
        const renown = droppedActor ? (droppedActor.getFlag(MODULE_ID, "renown") || 0) : 0;
        const renownBonus = getRenownBonus(renown);
        const totalBonus = selectedTier ? (selectedTier.bonus + renownBonus) : renownBonus;

        return {
            id: user.id,
            participantId: user.id,
            name: user.name,
            character: user.character,
            characterName: user.character?.name || game.i18n.localize("SHADOWDARK_EXTRAS.carousing.no_character"),
            color: user.color,
            droppedActor: droppedActor,
            droppedActorId: droppedActorId,
            droppedActorName: droppedActor?.name || null,
            droppedActorImg: droppedActor?.img || null,
            hasDrop: !!droppedActor,
            isCurrentUser: user.id === game.user.id,
            actorGp: actorGp,
            canAfford: canAfford,
            isConfirmed: isConfirmed,
            result: result,
            renown: renown,
            totalBonus: totalBonus,
            isGmManaged: false
        };
    });

    // 2. Get GM-added Actor participants
    const gmParticipants = gmActors.map(actorId => {
        const droppedActor = game.actors.get(actorId);
        if (!droppedActor) return null;

        const participantId = `actor-${actorId}`;
        const actorGp = getActorTotalGp(droppedActor);
        const canAfford = actorGp >= splitCost;
        const isConfirmed = session.confirmations[participantId] === true;
        const result = session.results?.[participantId];
        const renown = droppedActor.getFlag(MODULE_ID, "renown") || 0;
        const renownBonus = getRenownBonus(renown);
        const totalBonus = selectedTier ? (selectedTier.bonus + renownBonus) : renownBonus;

        return {
            id: participantId,
            participantId: participantId,
            name: "GM Managed",
            character: droppedActor,
            characterName: droppedActor.name,
            color: "#666",
            droppedActor: droppedActor,
            droppedActorId: actorId,
            droppedActorName: droppedActor.name,
            droppedActorImg: droppedActor.img,
            hasDrop: true,
            isCurrentUser: game.user.isGM,
            actorGp: actorGp,
            canAfford: canAfford,
            isConfirmed: isConfirmed,
            result: result,
            renown: renown,
            totalBonus: totalBonus,
            isGmManaged: true
        };
    }).filter(p => p !== null);

    return [...userParticipants, ...gmParticipants];
}

/**
 * Get online players with their carousing data
 * @deprecated Use getCarousingParticipants instead
 */
function getOnlinePlayers() {
    return getCarousingParticipants().filter(p => !p.isGmManaged);
}


/**
 * Get actor's total GP (coins.gp + sp/10 + cp/100)
 */
function getActorTotalGp(actor) {
    const coins = actor.system?.coins || {};
    const gp = coins.gp || 0;
    const sp = coins.sp || 0;
    const cp = coins.cp || 0;
    return gp + Math.floor(sp / 10) + Math.floor(cp / 100);
}

/**
 * Get participants who have dropped actors
 */
function getParticipants() {
    return getCarousingParticipants().filter(p => p.hasDrop);
}

// ============================================
// DICE SO NICE APPEARANCE CUSTOMIZATION
// ============================================

/**
 * Dice So Nice colorset configurations for carousing rolls
 */
const DSN_CAROUSING_APPEARANCE = {
    outcome: { colorset: "black" },      // Black dice for d8 outcome roll
    benefit: { colorset: "acid" },       // Green dice for d100 benefit rolls
    mishap: { colorset: "fire" }         // Red dice for d100 mishap rolls
};

/**
 * Show a roll with Dice So Nice using custom appearance
 * Sets the appearance on the dice options before calling showForRoll
 * @param {Roll} roll - The evaluated Roll object
 * @param {string} type - 'outcome', 'benefit', or 'mishap'
 */
async function showDSNRoll(roll, type = 'outcome') {
    if (!game.dice3d) return;

    const appearances = {
        outcome: { colorset: "black" },           // Black dice for d8 outcome
        benefit: { colorset: "acid" },            // Green dice for benefits
        mishap: { colorset: "fire" }              // Red dice for mishaps
    };

    const appearance = appearances[type] || {};
    console.log(`${MODULE_ID} | showDSNRoll: type=${type}, setting dice appearance`, appearance);

    // Set appearance directly on each die in the roll
    for (const die of roll.dice) {
        die.options.appearance = appearance;
    }
    await game.dice3d.showForRoll(roll, game.user, true);
}

/**
 * Broadcast a roll announcement to all clients
 * Shows a prominent message like "ROLLING FOR ELBIN!"
 * @param {string} characterName - The character name being rolled for
 */
function broadcastRollAnnouncement(characterName) {
    const message = `🎲 Rolling for ${characterName}!`;
    console.log(`${MODULE_ID} | broadcastRollAnnouncement: ${message}`);

    // Broadcast to all other clients
    game.socket.emit(`module.${MODULE_ID}`, {
        type: "carousing-roll-announce",
        message: message
    });

    // Also show locally for the GM
    _showRollAnnouncement(message);
}

/**
 * Show a roll announcement locally (prominent centered message)
 * @param {string} message - The announcement message
 */
function _showRollAnnouncement(message) {
    // Remove any existing announcement
    const existing = document.querySelector('.sdx-roll-announcement');
    if (existing) existing.remove();

    const announcement = document.createElement('div');
    announcement.className = 'sdx-roll-announcement';
    announcement.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(announcement);

    // Auto-remove after 2 seconds
    setTimeout(() => {
        announcement.classList.add('sdx-fade-out');
        setTimeout(() => announcement.remove(), 500);
    }, 2000);
}

// ============================================
// EXPANDED CAROUSING ROLL LOGIC
// ============================================

/**
 * Execute expanded carousing rolls for all participants
 * Uses d8 for outcome table, then d100 for benefits/mishaps
 */
async function executeExpandedCarousingRolls(session, tier, participants) {
    const results = {};
    const chatContent = [];

    // Cost is shared among all participants
    const participantCount = participants.length;
    const costPerPerson = Math.ceil(tier.cost / participantCount);

    chatContent.push(`
        <div class="sdx-carousing-header">
            <h2><i class="fas fa-beer"></i> Carousing <span class="sdx-carousing-mode-tag">Expanded</span></h2>
            <div class="sdx-carousing-cost"><strong>Total Cost:</strong> ${tier.cost} GP (${costPerPerson} GP each for ${participantCount} participant${participantCount > 1 ? 's' : ''})</div>
        </div>
    `);

    for (const participant of participants) {
        const actor = participant.droppedActor;
        if (!actor) continue;

        // Announce that we are rolling for this player
        broadcastRollAnnouncement(participant.droppedActorName || actor.name);

        // Deduct shared cost from each participant
        await deductCoins(actor, costPerPerson);

        // Get actor's renown bonus for the carousing event roll
        const renown = actor.getFlag(MODULE_ID, "renown") || 0;
        const renownBonus = getRenownBonus(renown);

        // Get custom GM modifiers for this player
        const playerMods = session.modifiers?.[participant.participantId] || {};
        const outcomeMod = playerMods.outcome ? ` + ${playerMods.outcome}` : "";

        // Roll 1d8 + tier bonus + renown bonus + custom modifier for outcome table
        const outcomeRoll = await new Roll(`1d8 + ${tier.bonus} + ${renownBonus}${outcomeMod}`).evaluate();

        // Show 3D dice animation with black dice for outcome
        await showDSNRoll(outcomeRoll, 'outcome');

        const outcomeDice = outcomeRoll.dice[0]?.total || outcomeRoll.total;
        const outcomeTotal = outcomeRoll.total;
        const outcome = getExpandedOutcome(outcomeTotal);

        // Apply XP
        const currentXp = actor.system?.level?.xp || 0;
        await actor.update({ "system.level.xp": currentXp + outcome.xp });

        // Helper to apply modifier to d100 roll
        // Modifier is added directly to the roll, e.g., -20 + 40 = 20
        const applyModifier = (diceRoll, modifier) => {
            return Math.max(1, Math.min(100, diceRoll + modifier));
        };

        // Roll for benefits
        const benefitResults = [];
        const benefitMod = playerMods.benefits ? ` + ${playerMods.benefits}` : "";
        for (let i = 0; i < outcome.benefits; i++) {
            const benefitRoll = await new Roll(`1d100${benefitMod}`).evaluate();

            // Show 3D dice animation with green dice for benefits
            await showDSNRoll(benefitRoll, 'benefit');

            const diceResult = benefitRoll.total;
            const finalResult = applyModifier(diceResult, outcome.modifier);
            const benefit = getExpandedBenefit(finalResult);
            benefitResults.push({
                diceRoll: diceResult,
                modifier: outcome.modifier,
                finalRoll: finalResult,
                description: benefit.description
            });
        }

        // Roll for mishaps
        const mishapResults = [];
        const mishapMod = playerMods.mishaps ? ` + ${playerMods.mishaps}` : "";
        for (let i = 0; i < outcome.mishaps; i++) {
            const mishapRoll = await new Roll(`1d100${mishapMod}`).evaluate();

            // Show 3D dice animation with red dice for mishaps
            await showDSNRoll(mishapRoll, 'mishap');

            const diceResult = mishapRoll.total;
            const finalResult = applyModifier(diceResult, outcome.modifier);
            const mishap = getExpandedMishap(finalResult);
            mishapResults.push({
                diceRoll: diceResult,
                modifier: outcome.modifier,
                finalRoll: finalResult,
                description: mishap.description
            });
        }

        // Store result
        results[participant.participantId] = {
            outcomeRoll: outcomeTotal,
            diceRoll: outcomeDice,
            bonus: tier.bonus,
            xp: outcome.xp,
            benefits: benefitResults,
            mishaps: mishapResults
        };

        // Build roll breakdown string for benefits/mishaps (shows modifier)
        const buildRollBreakdown = (r) => {
            // Show: diceRoll + modifier = final
            if (r.modifier === 0) {
                return `<span class="sdx-roll-dice">${r.diceRoll}</span> = <strong>${r.finalRoll}</strong>`;
            }
            const sign = r.modifier >= 0 ? '+' : '';
            return `<span class="sdx-roll-dice">${r.diceRoll}</span> <span class="sdx-roll-mod">${sign}${r.modifier}</span> = <strong>${r.finalRoll}</strong>`;
        };

        // Build outcome roll display (includes renown and custom mods if any)
        let outcomeFormula = `${outcomeDice} + ${tier.bonus}`;
        if (renownBonus !== 0) {
            outcomeFormula += ` <span class="sdx-roll-renown">+ ${renownBonus}</span>`;
        }
        if (playerMods.outcome) {
            outcomeFormula += ` <span class="sdx-roll-custom-mod">+ ${playerMods.outcome}</span>`;
        }
        outcomeFormula += ` = <strong>${outcomeTotal}</strong>`;

        // Build chat content for this player
        // Read visibility settings
        const showBenefitsToPlayers = game.settings.get(MODULE_ID, "carousingShowBenefitsToPlayers") ?? true;
        const showMishapsToPlayers = game.settings.get(MODULE_ID, "carousingShowMishapsToPlayers") ?? true;
        const hiddenText = game.i18n.localize("SHADOWDARK_EXTRAS.carousing.hidden_description");

        let playerContent = `
            <div class="sdx-carousing-player">
                <div class="sdx-player-header">
                    <img src="${actor.img}" class="sdx-player-portrait">
                    <div class="sdx-player-info">
                        <strong class="sdx-player-name">${participant.isGmManaged ? participant.droppedActorName : participant.name}</strong>
                        <div class="sdx-outcome-roll">
                            <span class="sdx-roll-label">Outcome:</span>
                            <span class="sdx-roll-formula">${outcomeFormula}</span>
                        </div>
                    </div>
                    <div class="sdx-xp-badge">+${outcome.xp} XP</div>
                </div>`;

        // Add benefits
        if (benefitResults.length > 0) {
            playerContent += `<div class="sdx-results-section sdx-benefits-section">
                <div class="sdx-section-header sdx-benefit-header"><i class="fas fa-star"></i> Benefits (${benefitResults.length})</div>`;
            for (const b of benefitResults) {
                // If benefits should be hidden from players, add both visible (GM) and hidden (player) versions
                const descHtml = showBenefitsToPlayers
                    ? `<div class="sdx-result-desc">${b.description}</div>`
                    : `<div class="sdx-result-desc sdx-gm-only">${b.description}</div><div class="sdx-result-desc sdx-player-only">${hiddenText}</div>`;
                playerContent += `
                    <div class="sdx-result-row sdx-benefit-row">
                        <div class="sdx-roll-breakdown">${buildRollBreakdown(b)}</div>
                        ${descHtml}
                    </div>`;
            }
            playerContent += `</div>`;
        }

        // Add mishaps
        if (mishapResults.length > 0) {
            playerContent += `<div class="sdx-results-section sdx-mishaps-section">
                <div class="sdx-section-header sdx-mishap-header"><i class="fas fa-skull"></i> Mishaps (${mishapResults.length})</div>`;
            for (const m of mishapResults) {
                // If mishaps should be hidden from players, add both visible (GM) and hidden (player) versions
                const descHtml = showMishapsToPlayers
                    ? `<div class="sdx-result-desc">${m.description}</div>`
                    : `<div class="sdx-result-desc sdx-gm-only">${m.description}</div><div class="sdx-result-desc sdx-player-only">${hiddenText}</div>`;
                playerContent += `
                    <div class="sdx-result-row sdx-mishap-row">
                        <div class="sdx-roll-breakdown">${buildRollBreakdown(m)}</div>
                        ${descHtml}
                    </div>`;
            }
            playerContent += `</div>`;
        }

        if (benefitResults.length === 0 && mishapResults.length === 0) {
            playerContent += `<div class="sdx-no-results"><em>No benefits or mishaps this time.</em></div>`;
        }

        playerContent += `</div>`;
        chatContent.push(playerContent);
    }

    // Save results
    session.results = results;
    session.phase = "complete";
    await saveCarousingSession(session);

    // Send chat message
    await ChatMessage.create({
        content: `<div class="sdx-carousing-chat sdx-expanded-carousing">${chatContent.join("")}</div>`,
        speaker: { alias: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.title") }
    });

    ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.rolls_complete"));
}

// ============================================
// ROLL AND OUTCOME LOGIC
// ============================================

/**
 * Get outcome for a roll result from a given outcomes array
 * Handles new format: roll can be "1", "2", "14+" etc.
 */
function getOutcome(rollTotal, outcomes) {
    for (const outcome of outcomes) {
        const rollStr = String(outcome.roll || "");

        // Handle "N+" format (e.g., "14+")
        if (rollStr.endsWith("+")) {
            const minRoll = parseInt(rollStr);
            if (!isNaN(minRoll) && rollTotal >= minRoll) {
                return outcome;
            }
        } else {
            // Exact match
            const exactRoll = parseInt(rollStr);
            if (!isNaN(exactRoll) && rollTotal === exactRoll) {
                return outcome;
            }
        }
    }
    // Default to last outcome for unmatched rolls
    return outcomes[outcomes.length - 1];
}

/**
 * Execute carousing rolls for all participants (GM only)
 */
export async function executeCarousingRolls() {
    if (!game.user.isGM) return;

    const journal = getCarousingJournal();
    if (!journal) {
        console.error(`${MODULE_ID} | Carousing journal not found!`);
        return;
    }

    const session = getCarousingSession();
    const drops = getCarousingDrops();

    // Get the correct table based on mode
    const mode = getCarousingMode();
    const activeTable = mode === "expanded"
        ? getExpandedCarousingData()
        : getCarousingTableById(session.selectedTableId);

    if (session.selectedTier === null) {
        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.no_tier_selected"));
        return;
    }

    const tier = activeTable.tiers[session.selectedTier];
    const participants = getParticipants();

    // Check all participants are confirmed
    const unconfirmed = participants.filter(p => !p.isConfirmed);
    if (unconfirmed.length > 0) {
        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.not_all_confirmed"));
        return;
    }

    // Check all participants can afford
    const cantAfford = participants.filter(p => !p.canAfford);
    if (cantAfford.length > 0) {
        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.some_cannot_afford"));
        return;
    }

    if (participants.length === 0) {
        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.no_participants"));
        return;
    }

    // Set phase to rolling
    session.phase = "rolling";
    session.results = {};

    // Branch based on carousing mode
    if (mode === "expanded") {
        await executeExpandedCarousingRolls(session, tier, participants);
        return;
    }

    // === ORIGINAL MODE LOGIC ===
    // Process each participant
    const results = {};
    const chatContent = [];

    // Cost is shared among all participants
    const participantCount = participants.length;
    const costPerPerson = Math.ceil(tier.cost / participantCount);

    chatContent.push(`
        <div class="sdx-carousing-header">
            <h2><i class="fas fa-beer"></i> Carousing <span class="sdx-carousing-mode-tag">Original</span></h2>
            <div class="sdx-carousing-cost"><strong>Total Cost:</strong> ${tier.cost} GP (${costPerPerson} GP each for ${participantCount} participant${participantCount > 1 ? 's' : ''})</div>
        </div>
    `);

    for (const participant of participants) {
        const actor = participant.droppedActor;
        if (!actor) continue;

        // Announce that we are rolling for this player
        broadcastRollAnnouncement(participant.droppedActorName || actor.name);

        // Deduct shared cost from each participant
        await deductCoins(actor, costPerPerson);

        // Get custom GM modifiers for this player
        const playerMods = session.modifiers?.[participant.participantId] || {};
        const outcomeMod = playerMods.outcome ? ` + ${playerMods.outcome}` : "";

        // Roll 1d8 + bonus + custom modifier
        const roll = await new Roll(`1d8 + ${tier.bonus}${outcomeMod}`).evaluate();

        // Show 3D dice animation with black dice for outcome
        await showDSNRoll(roll, 'outcome');

        const diceResult = roll.dice[0]?.total || roll.total;
        const rollTotal = roll.total;
        const outcome = getOutcome(rollTotal, activeTable.outcomes);

        // Store result (simplified - no XP or effects applied)
        results[participant.participantId] = {
            roll: rollTotal,
            diceRoll: diceResult,
            bonus: tier.bonus,
            description: outcome?.description || "",
            benefit: outcome?.benefit || ""
        };

        // Read visibility settings (use benefit setting for original mode outcomes)
        const showBenefitsToPlayers = game.settings.get(MODULE_ID, "carousingShowBenefitsToPlayers") ?? true;
        const hiddenText = game.i18n.localize("SHADOWDARK_EXTRAS.carousing.hidden_description");

        // Build description HTML based on visibility setting
        const descHtml = showBenefitsToPlayers
            ? `<div class="sdx-outcome-desc">${outcome?.description || ""}</div>`
            : `<div class="sdx-outcome-desc sdx-gm-only">${outcome?.description || ""}</div><div class="sdx-outcome-desc sdx-player-only">${hiddenText}</div>`;

        // Build benefit HTML based on visibility setting
        let benefitHtml = '';
        if (outcome?.benefit) {
            benefitHtml = showBenefitsToPlayers
                ? `<div class="sdx-outcome-benefit"><i class="fas fa-star"></i> ${outcome.benefit}</div>`
                : `<div class="sdx-outcome-benefit sdx-gm-only"><i class="fas fa-star"></i> ${outcome.benefit}</div><div class="sdx-outcome-benefit sdx-player-only"><i class="fas fa-star"></i> ${hiddenText}</div>`;
        }

        chatContent.push(`
            <div class="sdx-carousing-player">
                <div class="sdx-player-header">
                    <img src="${actor.img}" class="sdx-player-portrait">
                    <div class="sdx-player-info">
                        <strong class="sdx-player-name">${participant.isGmManaged ? participant.droppedActorName : participant.name}</strong>
                        <div class="sdx-outcome-roll">
                            <span class="sdx-roll-label">Roll:</span>
                            <span class="sdx-roll-formula">${diceResult} + ${tier.bonus}${playerMods.outcome ? ` + ${playerMods.outcome}` : ''} = <strong>${rollTotal}</strong></span>
                        </div>
                    </div>
                </div>
                ${descHtml}
                ${benefitHtml}
            </div>
        `);
    }

    // Save results
    session.results = results;
    session.phase = "complete";
    await saveCarousingSession(session);

    // Send chat message
    await ChatMessage.create({
        content: `<div class="sdx-carousing-chat sdx-original-carousing">${chatContent.join("")}</div>`,
        speaker: { alias: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.title") }
    });

    ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.rolls_complete"));
}

/**
 * Deduct coins from actor (prioritize GP, then SP, then CP)
 */
async function deductCoins(actor, gpAmount) {
    const coins = foundry.utils.deepClone(actor.system?.coins || { gp: 0, sp: 0, cp: 0 });

    let remainingGp = gpAmount;

    // Deduct from GP first
    if (coins.gp >= remainingGp) {
        coins.gp -= remainingGp;
        remainingGp = 0;
    } else {
        remainingGp -= coins.gp;
        coins.gp = 0;
    }

    // Convert remaining to SP (1 GP = 10 SP)
    if (remainingGp > 0) {
        const neededSp = remainingGp * 10;
        if (coins.sp >= neededSp) {
            coins.sp -= neededSp;
            remainingGp = 0;
        } else {
            remainingGp -= Math.floor(coins.sp / 10);
            coins.sp = coins.sp % 10;
        }
    }

    // Convert remaining to CP (1 GP = 100 CP)
    if (remainingGp > 0) {
        const neededCp = remainingGp * 100;
        coins.cp = Math.max(0, coins.cp - neededCp);
    }

    await actor.update({ "system.coins": coins });
}

/**
 * Apply outcome effect and return description text
 */
async function applyOutcomeEffect(actor, effect) {
    if (!effect) return "";

    switch (effect.type) {
        case "wealthLoss": {
            const totalGp = getActorTotalGp(actor);
            const lossGp = Math.floor(totalGp * effect.percent / 100);
            if (lossGp > 0) {
                await deductCoins(actor, lossGp);
            }
            const text = game.i18n.format("SHADOWDARK_EXTRAS.carousing.lost_wealth", { percent: effect.percent, amount: lossGp });
            return effect.bonus ? `${text}, ${effect.bonus}` : text;
        }

        case "luckToken": {
            const currentLuck = actor.system?.luck || 0;
            await actor.update({ "system.luck": currentLuck + effect.amount });
            return game.i18n.format("SHADOWDARK_EXTRAS.carousing.gained_luck", { amount: effect.amount });
        }

        case "bonus": {
            return effect.bonus;
        }

        default:
            return "";
    }
}

// ============================================
// SOCKET AND SYNC
// ============================================

/**
 * Initialize the carousing journal update hook
 */
export function initCarousingSocket() {
    Hooks.on("updateJournalEntry", (journal, changes, options, userId) => {
        const carousingJournal = getCarousingJournal();
        if (!carousingJournal || journal.id !== carousingJournal.id) return;

        const flagChanges = changes?.flags?.[MODULE_ID];
        if (!flagChanges) return;

        // Re-render if drops or session changed (including deletions with -= prefix)
        const hasCarousingChange =
            flagChanges.carousingDrops !== undefined ||
            flagChanges.carousingGmActors !== undefined ||
            flagChanges.carousingSession !== undefined ||
            flagChanges["-=carousingDrops"] !== undefined ||
            flagChanges["-=carousingGmActors"] !== undefined ||
            flagChanges["-=carousingSession"] !== undefined;

        if (hasCarousingChange) {
            rerenderPlayerSheets();
        }
    });

    // Listen for carousing toast notifications from other clients
    game.socket.on(`module.${MODULE_ID}`, (data) => {
        // Handle carousing toast messages from other users
        if (data.type === "carousing-toast" && data.senderId !== game.user.id) {
            _showCarousingToast(data.message, data.toastType);
        }

        // Handle roll announcement events during GM rolling
        if (data.type === "carousing-roll-announce") {
            _showRollAnnouncement(data.message);
        }
    });

    console.log(`${MODULE_ID} | Carousing sync initialized (journal-based)`);
}

/**
 * Show a carousing toast notification locally
 * @param {string} message - The message to display
 * @param {string} type - "benefit", "mishap", or "remove"
 */
function _showCarousingToast(message, type) {
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
 * Re-render all open player sheets and the carousing overlay
 */
function rerenderPlayerSheets() {
    // Refresh the full-screen overlay if open
    if (window.sdxCarousingOverlayRefresh) {
        window.sdxCarousingOverlayRefresh();
    }

    // Also refresh any old-style player sheets with carousing tabs
    Object.values(ui.windows).forEach(app => {
        if (app.actor?.type === "Player" && app.element?.find) {
            if (app.element.find('.tab-carousing').length > 0) {
                app.render(false);
            }
        }
    });
}

// ============================================
// TAB INJECTION
// ============================================

/**
 * Inject the Carousing button into player character sheets
 * Shows a "tongue" button on the side that opens the full-screen overlay
 */
export async function injectCarousingButton(app, html, actor) {
    try {
        if (!game.settings.get(MODULE_ID, "enableCarousing")) return;
    } catch {
        return;
    }

    if (actor.type !== "Player") return;

    // Dedup: Remove existing if present
    // app.element is the window app, find the button inside it
    app.element.find('.sdx-carousing-toggle-btn').remove();

    // Create the button
    const buttonHtml = `
        <div class="sdx-carousing-toggle-btn" data-tooltip="${game.i18n.localize("SHADOWDARK_EXTRAS.carousing.title")}">
            <i class="fas fa-beer"></i>
        </div>
    `;

    // Append to the window app wrapper, after the header
    // We use app.element because 'html' in the hook might be just the form content
    const header = app.element.find('.window-header');

    if (header.length > 0) {
        // Remove any existing buttons first (just in case they are in the new location)
        app.element.children('.sdx-carousing-toggle-btn').remove();

        header.after(buttonHtml);

        // Add listener
        app.element.find('.sdx-carousing-toggle-btn').click((event) => {
            event.preventDefault();
            event.stopPropagation();
            if (window.sdxOpenCarousingOverlay) {
                window.sdxOpenCarousingOverlay();
            }
        });
    }
}

/**
 * Activate event listeners for the carousing tab
 */
function activateCarousingListeners(html, actor, app) {
    const carousingSection = html.find('.tab-carousing');
    if (carousingSection.length === 0) return;

    // GM: Table selection
    carousingSection.find('[data-action="select-table"]').change(async (event) => {
        if (!game.user.isGM) return;
        const tableId = event.target.value || "default";
        await setCarousingTable(tableId);
    });

    // GM: Tier selection
    carousingSection.find('[data-action="select-tier"]').change(async (event) => {
        if (!game.user.isGM) return;
        const val = event.target.value;
        const tierIndex = val === "" ? null : parseInt(val);
        await setCarousingTier(tierIndex);
    });

    // GM: Roll button
    carousingSection.find('[data-action="roll-carousing"]').click(async (event) => {
        event.preventDefault();
        if (!game.user.isGM) return;
        await executeCarousingRolls();
    });

    // GM: Reset button
    carousingSection.find('[data-action="reset-carousing"]').click(async (event) => {
        event.preventDefault();
        if (!game.user.isGM) return;
        await resetCarousingSession();
    });

    // Player: Confirm button
    carousingSection.find('[data-action="confirm-carousing"]').click(async (event) => {
        event.preventDefault();
        const userId = $(event.currentTarget).data('user-id');
        if (userId !== game.user.id) return;
        await setPlayerConfirmation(userId, true);
    });

    // Player: Unconfirm button
    carousingSection.find('[data-action="unconfirm-carousing"]').click(async (event) => {
        event.preventDefault();
        const userId = $(event.currentTarget).data('user-id');
        if (userId !== game.user.id) return;
        await setPlayerConfirmation(userId, false);
    });

    // Drag & drop for dropboxes
    carousingSection.find('.sdx-carousing-dropbox-content').each((i, element) => {
        const $dropbox = $(element);
        const userId = $dropbox.data('user-id');

        if (userId !== game.user.id) return;

        element.addEventListener('dragover', (event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            $dropbox.addClass('sdx-carousing-dropbox-hover');
        });

        element.addEventListener('dragleave', (event) => {
            $dropbox.removeClass('sdx-carousing-dropbox-hover');
        });

        element.addEventListener('drop', async (event) => {
            event.preventDefault();
            $dropbox.removeClass('sdx-carousing-dropbox-hover');

            let data;
            try {
                data = JSON.parse(event.dataTransfer.getData("text/plain"));
            } catch (e) {
                return;
            }

            if (data.type !== "Actor") return;

            const droppedActor = await fromUuid(data.uuid);
            if (!droppedActor) return;

            if (droppedActor.type !== "Player") {
                ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.only_players"));
                return;
            }

            await setCarousingDrop(userId, droppedActor.id);
        });
    });

    // Clear button
    carousingSection.find('[data-action="clear-carousing-drop"]').click(async (event) => {
        event.preventDefault();
        const userId = $(event.currentTarget).data('user-id');
        if (userId !== game.user.id) return;
        await setCarousingDrop(userId, null);
    });
}
