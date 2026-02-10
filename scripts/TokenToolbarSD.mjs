/**
 * Token Toolbar for Shadowdark Extras
 * 
 * Displays a HUD-style toolbar for the selected/controlled token showing:
 * - Character name
 * - Luck (for players)
 * - AC
 * - Level badge
 * - HP bar with editable current HP
 * 
 * Ported from lights-out-theme-shadowdark module with modifications.
 */

import { TokenToolbarApp } from "./TokenToolbarApp.mjs";
import { getActiveFocusSpells, getActiveDurationSpells, endFocusSpell, endDurationSpell } from "./FocusSpellTrackerSD.mjs";

const MODULE_ID = "shadowdark-extras";

// Toolbar instance
let _toolbarApp = null;

/**
 * Initialize the Token Toolbar
 * Called from shadowdark-extras.mjs ready hook
 */
export function initTokenToolbar() {
    // Check if toolbar is enabled
    if (!game.settings.get(MODULE_ID, "tokenToolbar.enabled")) {
        console.log("shadowdark-extras | Token Toolbar is disabled");
        return;
    }

    console.log("shadowdark-extras | Initializing Token Toolbar");

    // Create the toolbar app
    _toolbarApp = new TokenToolbarApp();
    _toolbarApp.render(true);

    // Initial render
    renderToolbar();

    // Hook into token selection changes
    Hooks.on("controlToken", async () => {
        await renderToolbar();
    });

    // Hook into actor updates (HP, luck, etc.)
    Hooks.on("updateActor", async (actor) => {
        const currentData = getTokenData();
        if (currentData && (currentData.actorId === actor.id || currentData.uuid === actor.uuid)) {
            await renderToolbar();
        }
    });

    // Hook into effect changes to refresh toolbar
    Hooks.on("createActiveEffect", async (effect, options, userId) => {
        await renderToolbar();
    });
    Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
        await renderToolbar();
    });
    Hooks.on("updateActiveEffect", async (effect, changes, options, userId) => {
        await renderToolbar();
    });

    // Hook into item changes (Shadowdark stores conditions as Effect items)
    Hooks.on("createItem", async (item, options, userId) => {
        if (item.type === "Effect") await renderToolbar();
    });
    Hooks.on("deleteItem", async (item, options, userId) => {
        if (item.type === "Effect") await renderToolbar();
    });
    Hooks.on("updateItem", async (item, changes, options, userId) => {
        if (item.type === "Effect") await renderToolbar();
    });

    // Hook into combat changes (for combat-only mode)
    Hooks.on("updateCombat", async () => {
        await renderToolbar();
    });
    Hooks.on("deleteCombat", async () => {
        await renderToolbar();
    });

    console.log("shadowdark-extras | Token Toolbar initialized");
}

/**
 * Get the current token/actor to display
 * - For GM: selected/controlled token
 * - For players: their assigned character or first owned actor
 */
export function getTokenData() {
    // Check visibility settings
    const visibility = game.settings.get(MODULE_ID, "tokenToolbar.visibility");
    const isGM = game.user.isGM;

    // visibility: "both", "gm", "players"
    if (visibility === "gm" && !isGM) return null;
    if (visibility === "players" && isGM) return null;

    // Check combat-only mode
    if (game.settings.get(MODULE_ID, "tokenToolbar.combatOnly")) {
        if (!game.combat?.active) return null;
    }

    // For GM: use controlled token
    if (isGM && canvas.tokens) {
        const tokens = canvas.tokens.controlled;
        if (tokens.length === 0 || tokens.length > 1) return null;

        const token = tokens[0];
        if (token.document.actorLink) {
            return game.actors.get(token.document.actorId);
        } else {
            return token.document;
        }
    }

    // For players: use assigned character or first owned actor
    let character = game.users.get(game.userId).character;
    if (!character) {
        for (let actor of Array.from(game.actors.values())) {
            if (actor.isOwner && actor.type === "Player") {
                character = actor;
                break;
            }
        }
    }

    return character;
}

/**
 * Get entity data for the toolbar display
 * @param {Actor|TokenDocument} entity - The actor or token document
 * @returns {Object} Data for the toolbar template
 */
export async function getEntityData(entity) {
    if (!entity) return null;

    const pulpMode = game.settings.get("shadowdark", "usePulpMode");

    let actor = entity;
    if (!entity.prototypeToken) {
        actor = entity.actor;
    }

    // Get class and ancestry data
    const classData = await fromUuid(actor.system.class);
    const ancestryData = await fromUuid(actor.system.ancestry);

    // HP values
    const hp = actor.system.attributes?.hp?.value ?? 0;
    const hpMax = actor.system.attributes?.hp?.max ?? 0;
    const hpPercent = calculateHpPercent(hp, hpMax);

    // Level and AC
    const level = actor.system.level?.value ?? 1;
    const ac = actor.system.attributes?.ac?.value ?? 10;

    // Luck (for players)
    let luckValue = null;
    if (actor.system.luck) {
        if (pulpMode) {
            luckValue = actor.system.luck?.remaining ?? 0;
        } else {
            luckValue = actor.system.luck?.available ? "●" : "○";
        }
    }

    // Get active effects (if setting enabled)
    let activeEffects = [];
    if (game.settings.get(MODULE_ID, "tokenToolbar.showEffects")) {
        activeEffects = getActiveEffects(actor);
    }

    // Get equipped items (if setting enabled)
    let equippedItems = [];
    if (game.settings.get(MODULE_ID, "tokenToolbar.showEquipped")) {
        equippedItems = getEquippedItems(actor);
    }

    // Get active spell icons
    const focusSpells = getFocusSpellIcons(actor);
    const durationSpells = getDurationSpellIcons(actor);

    return {
        uuid: actor.uuid,
        actorId: actor.id,
        isPlayer: actor.type === "Player",
        isToken: !entity.prototypeToken,
        name: actor.name,
        level: level,
        ancestry: ancestryData?.name,
        class: classData?.name,
        armor: ac,
        luck: luckValue,
        picture: actor.img,
        hp: {
            value: hp,
            max: hpMax,
            percent: hpPercent,
            status: getHpStatus(hpPercent),
        },
        activeEffects: activeEffects,
        equippedItems: equippedItems,
        focusSpells: focusSpells,
        durationSpells: durationSpells,
    };
}

/**
 * Calculate HP percentage for the bar
 */
function calculateHpPercent(current, max) {
    if (max <= 0) return 0;
    const percent = (current / max) * 100;
    return Math.min(Math.max(percent, 0), 100);
}

/**
 * Get HP status class for styling
 */
function getHpStatus(percent) {
    if (percent <= 25) return "critical";
    if (percent <= 50) return "injured";
    if (percent <= 75) return "hurt";
    return "healthy";
}

/**
 * Get active effects for the actor
 * In Shadowdark, conditions are stored as items of type "Effect", not as ActiveEffects
 * So we need to include both Foundry ActiveEffects AND Shadowdark Effect items
 * @param {Actor} actor - The actor
 * @returns {Array} Array of effect data objects
 */
function getActiveEffects(actor) {
    const effects = [];

    // First: Get Foundry ActiveEffects (if any)
    if (actor?.effects) {
        // Collect all effect IDs for child detection
        const actorEffectIds = new Set();
        for (const effect of actor.effects) {
            actorEffectIds.add(effect.id);
        }

        for (const effect of actor.effects) {
            // Skip disabled effects
            if (effect.disabled) continue;

            // Skip child effects whose parent exists on this actor
            if (effect.origin) {
                const originParts = effect.origin.split(".");
                const effectIdx = originParts.indexOf("ActiveEffect");
                if (effectIdx >= 0 && effectIdx + 1 < originParts.length) {
                    const parentEffectId = originParts[effectIdx + 1];
                    if (actorEffectIds.has(parentEffectId)) {
                        continue;
                    }
                }
            }

            // Build description from changes
            let description = effect.description || "";
            if (!description && effect.changes?.length > 0) {
                description = effect.changes.map(c => `${c.key}: ${c.value}`).join(", ");
            }

            effects.push({
                id: effect.id,
                name: effect.name || "Unknown Effect",
                img: effect.img || "icons/svg/aura.svg",
                description: description,
                isTemporary: effect.isTemporary,
                duration: effect.duration?.label || "",
                isActiveEffect: true,  // Flag to know this is an ActiveEffect
            });
        }
    }

    // Second: Get Shadowdark Effect items (conditions)
    if (actor?.items) {
        for (const item of actor.items) {
            // Only include items of type "Effect"
            if (item.type !== "Effect") continue;

            // Get description from item
            const description = item.system?.description || "";

            effects.push({
                id: item.id,
                name: item.name || "Unknown Effect",
                img: item.img || "icons/svg/aura.svg",
                description: description,
                isTemporary: false,
                duration: "",
                isActiveEffect: false,  // Flag to know this is an item
            });
        }
    }

    return effects;
}

/**
 * Get equipped items for the actor
 * @param {Actor} actor - The actor
 * @returns {Array} Array of equipped item data objects
 */
function getEquippedItems(actor) {
    if (!actor?.items) return [];

    const items = [];
    const isNPC = actor.type === "NPC";

    // NPC item types that should always be shown
    const npcItemTypes = ["NPC Attack", "NPC Special Attack", "NPC Feature"];

    for (const item of actor.items) {
        // For NPCs: show NPC Attack, NPC Special Attack, NPC Feature
        // For Players: show equipped items (weapons, armor, etc.)
        const isNpcItem = npcItemTypes.includes(item.type);
        
        if (isNPC) {
            if (!isNpcItem) continue;
        } else {
            if (!item.system?.equipped) continue;
        }

        // Build description based on item type
        let description = "";

        // For weapons - build damage string
        if (item.type === "Weapon") {
            const dmg = item.system.damage;
            if (dmg?.oneHanded) {
                description = `${dmg.numDice || 1}${dmg.oneHanded}`;
                if (dmg.bonus && dmg.bonus !== 0) {
                    description += dmg.bonus > 0 ? `+${dmg.bonus}` : dmg.bonus;
                }
            }
        }

        // For armor - show AC
        if (item.type === "Armor" && item.system.ac?.modifier) {
            description = `AC +${item.system.ac.modifier}`;
        }

        // For NPC Attack - show damage and attack count
        if (item.type === "NPC Attack") {
            const dmg = item.system.damage?.value || "";
            const attackNum = item.system.attack?.num || "1";
            description = dmg ? `${attackNum}× ${dmg}` : `${attackNum}×`;
        }

        // For NPC Special Attack - show attack count
        if (item.type === "NPC Special Attack") {
            const attackNum = item.system.attack?.num || "1";
            description = `${attackNum}×`;
        }

        // For NPC Feature - no description needed
        if (item.type === "NPC Feature") {
            description = "";
        }

        items.push({
            id: item.id,
            name: item.name || "Unknown Item",
            img: item.img || "icons/svg/item-bag.svg",
            type: item.type,
            description: description,
        });
    }

    return items;
}

/**
 * Get active focus spells for the actor
 * @param {Actor} actor - The actor
 * @returns {Array} Array of focus spell data objects
 */
function getFocusSpellIcons(actor) {
    if (!actor) return [];

    const focusSpells = getActiveFocusSpells(actor);
    if (!focusSpells || focusSpells.length === 0) return [];

    return focusSpells.map(spell => ({
        spellId: spell.spellId,
        name: spell.spellName || "Unknown Spell",
        img: spell.spellImg || "icons/svg/mystery-man.svg",
        isFocus: true,
        // Focus spells don't have a fixed duration - shown until failed/dropped
        duration: null
    }));
}

/**
 * Get active duration spells for the actor
 * @param {Actor} actor - The actor
 * @returns {Array} Array of duration spell data objects
 */
function getDurationSpellIcons(actor) {
    if (!actor) return [];

    const durationSpells = getActiveDurationSpells(actor);
    if (!durationSpells || durationSpells.length === 0) return [];

    const currentRound = game.combat?.round ?? 0;

    return durationSpells.map(spell => {
        // Calculate remaining rounds
        const remaining = spell.expiryRound - currentRound;

        return {
            instanceId: spell.instanceId,
            spellId: spell.spellId,
            name: spell.spellName || "Unknown Spell",
            img: spell.spellImg || "icons/svg/mystery-man.svg",
            isFocus: false,
            duration: remaining,
            durationLabel: `${remaining} ${spell.durationType || 'rounds'}`
        };
    });
}

/**
 * Render the toolbar with current token data
 */
async function renderToolbar() {
    if (!_toolbarApp) return;

    const entity = getTokenData();
    if (!entity) {
        _toolbarApp.hide();
        return;
    }

    const data = await getEntityData(entity);
    if (!data) {
        _toolbarApp.hide();
        return;
    }

    _toolbarApp.updateData(data);
}

// ============================================
// Action Handlers
// ============================================

/**
 * Open the actor sheet
 * @param {Event} event - Click event
 */
export async function openSheet(event) {
    const uuid = event.currentTarget.dataset.uuid;
    const actor = await fromUuid(uuid);
    if (actor) {
        actor.sheet.render(true);
    }
}

/**
 * Toggle luck (standard mode) or be called with increment (pulp mode)
 * @param {Event} event - Click event
 * @param {number} change - For pulp mode: +1 or -1
 */
export async function changeLuck(event, change = null) {
    const uuid = event.currentTarget.dataset.uuid;
    const actor = await fromUuid(uuid);
    if (!actor) return;

    const pulpMode = game.settings.get("shadowdark", "usePulpMode");

    if (pulpMode && change !== null) {
        // Pulp mode: increment/decrement luck
        let luckValue = parseInt(actor.system.luck.remaining + change);
        if (luckValue < 0) luckValue = 0;

        await actor.update({
            "system.luck.available": luckValue > 0,
            "system.luck.remaining": luckValue,
        });
    } else {
        // Standard mode: toggle available
        await actor.update({
            "system.luck.available": !actor.system.luck.available
        });
    }
}

/**
 * Handle HP input changes
 * Supports: absolute value, +X (heal), -X (damage)
 * @param {Event} event - Keyup event
 */
export async function handleHpChange(event) {
    if (event.keyCode !== 13) return; // Only on Enter

    event.preventDefault();
    event.stopPropagation();

    const input = event.currentTarget;
    const uuid = input.dataset.uuid;
    const actor = await fromUuid(uuid);

    if (!actor) return;

    const currentHP = parseInt(input.dataset.value);
    const inputValue = input.value.trim();

    let damageAmount;
    let multiplier;

    if (inputValue.startsWith("+")) {
        // Healing
        damageAmount = parseInt(inputValue.slice(1), 10);
        multiplier = -1;
    } else if (inputValue.startsWith("-")) {
        // Damage
        damageAmount = parseInt(inputValue.slice(1), 10);
        multiplier = 1;
    } else {
        // Absolute value
        const newHP = parseInt(inputValue, 10);
        damageAmount = currentHP - newHP;
        multiplier = 1;
    }

    if (!isNaN(damageAmount)) {
        await actor.applyDamage(damageAmount, multiplier);
    }

    // Blur the input
    input.blur();
}

/**
 * End a focus spell from the toolbar
 * @param {Event} event - Right-click event
 */
export async function terminateFocusSpell(event) {
    const uuid = event.currentTarget.dataset.actorUuid;
    const spellId = event.currentTarget.dataset.spellId;

    if (!uuid || !spellId) return;

    const actor = await fromUuid(uuid);
    if (!actor) return;

    // End the focus spell
    await endFocusSpell(actor.id, spellId, "manual");

    // Show notification
    const spellName = event.currentTarget.dataset.spellName || "Focus Spell";
    ui.notifications.info(`Ended focus: ${spellName}`);
}

/**
 * End a duration spell from the toolbar
 * @param {Event} event - Right-click event
 */
export async function terminateDurationSpell(event) {
    const uuid = event.currentTarget.dataset.actorUuid;
    const instanceId = event.currentTarget.dataset.instanceId;

    if (!uuid || !instanceId) return;

    const actor = await fromUuid(uuid);
    if (!actor) return;

    // End the duration spell
    await endDurationSpell(actor.id, instanceId);

    // Show notification
    const spellName = event.currentTarget.dataset.spellName || "Duration Spell";
    ui.notifications.info(`Ended duration: ${spellName}`);
}

/**
 * Register settings for the token toolbar
 */
export function registerTokenToolbarSettings() {
    game.settings.register(MODULE_ID, "tokenToolbar.enabled", {
        name: "SHADOWDARK_EXTRAS.settings.tokenToolbar.enabled.name",
        hint: "SHADOWDARK_EXTRAS.settings.tokenToolbar.enabled.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: true
    });

    game.settings.register(MODULE_ID, "tokenToolbar.visibility", {
        name: "SHADOWDARK_EXTRAS.settings.tokenToolbar.visibility.name",
        hint: "SHADOWDARK_EXTRAS.settings.tokenToolbar.visibility.hint",
        scope: "world",
        config: true,
        type: String,
        choices: {
            "both": "SHADOWDARK_EXTRAS.settings.tokenToolbar.visibility.both",
            "gm": "SHADOWDARK_EXTRAS.settings.tokenToolbar.visibility.gm",
            "players": "SHADOWDARK_EXTRAS.settings.tokenToolbar.visibility.players"
        },
        default: "both",
        requiresReload: false
    });

    game.settings.register(MODULE_ID, "tokenToolbar.combatOnly", {
        name: "SHADOWDARK_EXTRAS.settings.tokenToolbar.combatOnly.name",
        hint: "SHADOWDARK_EXTRAS.settings.tokenToolbar.combatOnly.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        requiresReload: false
    });

    game.settings.register(MODULE_ID, "tokenToolbar.showEffects", {
        name: "SHADOWDARK_EXTRAS.settings.tokenToolbar.showEffects.name",
        hint: "SHADOWDARK_EXTRAS.settings.tokenToolbar.showEffects.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: false
    });

    game.settings.register(MODULE_ID, "tokenToolbar.showEquipped", {
        name: "SHADOWDARK_EXTRAS.settings.tokenToolbar.showEquipped.name",
        hint: "SHADOWDARK_EXTRAS.settings.tokenToolbar.showEquipped.hint",
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        requiresReload: false
    });
}
