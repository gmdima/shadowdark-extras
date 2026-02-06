/**
 * Level Up Animation for Shadowdark Extras
 * Displays a "Level Up" indicator on tokens when a player has enough XP
 * Uses Sequencer module for animations
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Check if level-up animations are enabled in settings
 */
function isEnabled() {
    try {
        return game.settings.get(MODULE_ID, "enableLevelUpAnimation") !== false;
    } catch (e) {
        return true; // Default to enabled if setting not registered yet
    }
}

/**
 * Check if required modules are active
 */
function checkDependencies() {
    const hasSequencer = game.modules.get("sequencer")?.active;
    return {
        hasSequencer,
        ready: hasSequencer
    };
}

/**
 * Get the effect name for a token's level-up animation
 * @param {Token} token - The token
 * @returns {string} - Unique effect name
 */
function getEffectName(token) {
    return `${MODULE_ID}-levelup-${token.id}`;
}

/**
 * Get the XP required for the next level in Shadowdark
 * @param {number} currentLevel - The current level
 * @returns {number} - XP required for next level
 */
function getXpForNextLevel(currentLevel) {
    // Shadowdark XP requirements per level (linear progression: level * 10)
    return currentLevel * 10;
}

/**
 * Determine if an actor can level up
 * @param {Actor} actor - The actor to check
 * @returns {boolean} - True if actor can level up
 */
function canLevelUp(actor) {
    if (actor.type !== "Player") return false;

    const sys = actor.system;
    const level = sys.level?.value ?? 1;
    const xp = sys.level?.xp ?? 0;
    const xpNeeded = getXpForNextLevel(level);

    return xp >= xpNeeded;
}

/**
 * Play level-up animation on a token
 * @param {Token} token - The token to animate
 */
export async function playLevelUpAnimation(token) {
    if (!isEnabled()) return;

    const deps = checkDependencies();
    if (!deps.ready) {
        if (!deps.hasSequencer) {
            console.warn(`${MODULE_ID} | Sequencer module is required for level-up animations`);
        }
        return;
    }

    const effectName = getEffectName(token);

    // End any existing animation for this token
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });

    // Get token dimensions for positioning
    const tokenWidth = token.document.width;

    console.log(`${MODULE_ID} | Playing level-up animation for ${token.name}`);

    // Build the animation sequence
    const seq = new Sequence();

    // Create the level-up icon effect
    seq.effect()
        .name(effectName)
        .file("icons/svg/upgrade.svg") // Foundry built-in upgrade icon
        .atLocation(token)
        .attachTo(token, { bindRotation: false, local: true, bindVisibility: true })
        .scaleToObject(0.35, { considerTokenScale: true })
        .scaleIn(0, 300, { ease: "easeOutBack" })
        .spriteOffset({
            x: tokenWidth * 0.35,  // Top-right corner
            y: -tokenWidth * 0.35
        }, { gridUnits: true })
        .filter("Glow", {
            distance: 8,
            outerStrength: 3,
            innerStrength: 1,
            color: 0xd4af37, // Golden glow
            quality: 0.2,
            knockout: false
        })
        .loopProperty("sprite", "position.y", {
            from: 0,
            to: -0.03 * tokenWidth,
            duration: 800,
            ease: "easeInOutSine",
            pingPong: true,
            gridUnits: true
        })
        .persist()
        .xray(false)
        .zIndex(10);

    await seq.play();
    console.log(`${MODULE_ID} | Level-up animation started for ${token.name}`);
}

/**
 * Stop level-up animation on a token
 * @param {Token} token - The token
 */
export async function stopLevelUpAnimation(token) {
    const deps = checkDependencies();
    if (!deps.hasSequencer) return;

    const effectName = getEffectName(token);
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });
    console.log(`${MODULE_ID} | Stopped level-up animation for ${token.name}`);
}

/**
 * Get tokens for an actor on the current scene
 * @param {Actor} actor - The actor
 * @returns {Token[]} - Array of tokens
 */
function getTokensForActor(actor) {
    if (!canvas.scene) return [];

    // For synthetic/unlinked tokens
    if (actor.isToken) {
        const token = canvas.tokens.get(actor.token?.id);
        return token ? [token] : [];
    }

    // For linked tokens, find all tokens on the scene
    return canvas.tokens.placeables.filter(t =>
        t.actor?.id === actor.id && t.document.actorLink
    );
}

/**
 * Update level-up animation for an actor's tokens
 * @param {Actor} actor - The actor
 */
async function updateLevelUpAnimationForActor(actor) {
    if (!isEnabled()) return;
    if (actor.type !== "Player") return;

    const tokens = getTokensForActor(actor);
    const shouldShow = canLevelUp(actor);

    for (const token of tokens) {
        if (shouldShow) {
            await playLevelUpAnimation(token);
        } else {
            await stopLevelUpAnimation(token);
        }
    }
}

/**
 * Initialize level-up animation hooks
 */
export function initLevelUpAnimations() {
    if (!isEnabled()) {
        console.log(`${MODULE_ID} | Level-up animations disabled in settings`);
        return;
    }

    const deps = checkDependencies();
    if (!deps.hasSequencer) {
        console.log(`${MODULE_ID} | Level-up animations disabled - Sequencer module not found`);
        return;
    }

    console.log(`${MODULE_ID} | Initializing level-up animations`);

    // Hook into actor updates to detect XP or level changes
    Hooks.on("updateActor", async (actor, changes, options, userId) => {
        // Only the user who made the change should update the animation
        if (userId !== game.user.id) return;

        // Check if XP or level was changed
        const xpChanged = foundry.utils.hasProperty(changes, "system.level.xp");
        const levelChanged = foundry.utils.hasProperty(changes, "system.level.value");

        if (!xpChanged && !levelChanged) return;

        // Update animation for this actor
        await updateLevelUpAnimationForActor(actor);
    });

    // Restore animations on scene ready
    Hooks.on("canvasReady", async () => {
        // Only the first active user should restore animations
        // This prevents all clients from creating duplicate effects
        const firstActiveUser = game.users.find(u => u.active);
        if (game.user.id !== firstActiveUser?.id) return;

        // Small delay to ensure everything is loaded
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check all tokens for level-up eligibility
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            if (!actor || actor.type !== "Player") continue;

            if (canLevelUp(actor)) {
                await playLevelUpAnimation(token);
            }
        }
    });

    // Clean up animations when token is deleted
    Hooks.on("deleteToken", async (tokenDoc, options, userId) => {
        // Only the user who deleted the token should clean up
        if (userId !== game.user.id) return;

        const deps = checkDependencies();
        if (!deps.hasSequencer) return;

        // End level-up effect for this token
        await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-levelup-${tokenDoc.id}` });
    });

    // Check for level-up when a new token is created
    Hooks.on("createToken", async (tokenDoc, options, userId) => {
        // Only the user who created the token should add animations
        if (userId !== game.user.id) return;

        // Small delay to ensure token is fully initialized
        await new Promise(resolve => setTimeout(resolve, 100));

        const token = canvas.tokens.get(tokenDoc.id);
        if (!token) return;

        const actor = token.actor;
        if (!actor || actor.type !== "Player") return;

        if (canLevelUp(actor)) {
            await playLevelUpAnimation(token);
        }
    });

    console.log(`${MODULE_ID} | Level-up animations initialized successfully`);
}
