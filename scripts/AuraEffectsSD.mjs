/**
 * Aura Effects System for Shadowdark Extras
 * Token-attached effects that follow the bearer with damage, saves, and conditions
 * 
 * Features:
 * - Attach aura to caster or target
 * - Triggers: onEnter, onLeave, turnStart, turnEnd
 * - Apply damage with saves
 * - Apply/remove Active Effects
 * - Animation with customizable tint
 * - Respects autoApplyDamage setting
 */

import { getSocket } from "./CombatSettingsSD.mjs";

const MODULE_ID = "shadowdark-extras";

// Track which tokens have been affected by which auras this turn
const _auraAffectedThisTurn = new Map();

// Track previous token positions for enter/leave detection
const _previousPositions = new Map();

/**
 * Apply TokenMagic filter to a token when entering an aura
 * @param {Token} token - The token to apply filter to
 * @param {string} presetName - The TokenMagic preset name
 * @param {string} auraEffectId - The aura effect ID for tracking
 */
async function applyTokenMagicFilter(token, presetName, auraEffectId) {

    if (!presetName) {
        return;
    }
    if (!game.modules.get('tokenmagic')?.active) {
        return;
    }

    try {
        // Get the preset from TokenMagic library
        const preset = TokenMagic.getPreset(presetName);
        if (!preset) {
            console.warn(`shadowdark-extras | TokenMagic preset '${presetName}' not found`);
            return;
        }

        // Create a unique filter ID for this aura so we can remove it later
        const filterId = `sdx-aura-${auraEffectId}`;

        // Clone the preset and add our custom filter ID
        const params = preset.map(p => ({
            ...p,
            filterId: filterId
        }));

        await TokenMagic.addUpdateFilters(token, params);
    } catch (e) {
        console.error("shadowdark-extras | Error applying TokenMagic filter:", e);
    }
}

/**
 * Remove TokenMagic filter from a token when leaving an aura
 * @param {Token} token - The token to remove filter from
 * @param {string} auraEffectId - The aura effect ID for tracking
 */
async function removeTokenMagicFilter(token, auraEffectId) {

    if (!game.modules.get('tokenmagic')?.active) {
        return;
    }

    try {
        const filterId = `sdx-aura-${auraEffectId}`;

        // Check if the token has this filter applied
        const hasFilter = TokenMagic.hasFilterId(token, filterId);
        if (!hasFilter) {
            return;
        }

        await TokenMagic.deleteFilters(token, filterId);
    } catch (e) {
        console.error("shadowdark-extras | Error removing TokenMagic filter:", e);
    }
}

/**
 * Initialize the aura effects system
 * Call this from the main module during 'ready' hook
 */
export function initAuraEffects() {

    // Track token positions before movement
    Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
        if (changes.x !== undefined || changes.y !== undefined) {
            // Get the token placeable to access its current center
            const token = canvas.tokens.get(tokenDoc.id);
            const center = token ? token.center : {
                x: tokenDoc.x + (tokenDoc.width * canvas.grid.size) / 2,
                y: tokenDoc.y + (tokenDoc.height * canvas.grid.size) / 2
            };


            _previousPositions.set(tokenDoc.id, {
                x: tokenDoc.x,
                y: tokenDoc.y,
                center: center
            });
        }
    });

    // Process token movement for enter/leave triggers
    Hooks.on("updateToken", async (tokenDoc, changes, options, userId) => {
        if (changes.x === undefined && changes.y === undefined) return;
        if (!game.user.isGM) return;

        // Process token moving through existing auras
        await processAuraMovement(tokenDoc, changes);

        // Process other tokens if this token is an aura bearer
        await processAuraSourceMovement(tokenDoc, changes);

        // Remove the previous position after all processing is done
        _previousPositions.delete(tokenDoc.id);
    });

    // Clear per-turn tracking when combat advances
    Hooks.on("updateCombat", async (combat, changes, options, userId) => {
        if (changes.turn !== undefined || changes.round !== undefined) {
            _auraAffectedThisTurn.clear();
        }

        if (!game.user.isGM) return;
        if (changes.turn === undefined && changes.round === undefined) return;

        // Process turn-based aura effects
        await processAuraTurnEffects(combat, changes);
    });

    // Handle interactive aura card buttons
    Hooks.on("renderChatMessage", (message, html) => {
        const card = html.find(".sdx-aura-effect-card");
        if (card.length === 0) return;

        // Apply Damage button
        html.find(".sdx-aura-apply-damage").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const cardElement = btn.closest(".sdx-aura-effect-card");

            const targetId = cardElement.data("target-token-id");
            const formula = cardElement.data("damage-formula");

            const targetToken = canvas.tokens.get(targetId);
            if (!targetToken) return ui.notifications.warn("shadowdark-extras | Target token not found on canvas");

            const config = {
                damage: { formula: formula },
                save: { halfOnSuccess: cardElement.data("half-damage") }
            };

            // If not GM, execute via socket to avoid permission issues
            if (!game.user.isGM) {
                const socket = getSocket();
                if (socket) {
                    socket.executeAsGM("applyAuraDamageViaGM", {
                        targetTokenId: targetId,
                        config: config,
                        savedSuccessfully: false
                    });
                }
            } else {
                // Apply full damage when clicking this button (GM)
                let auraActor = game.actors.get(cardElement.data("aura-actor-id"));
                if (!auraActor) auraActor = canvas.tokens.get(cardElement.data("aura-actor-id"))?.actor;

                await applyAuraDamage(targetToken, config, false);
            }

            // Create reporting message
            const sourceId = cardElement.data("source-token-id");
            const sourceToken = canvas.tokens.get(sourceId);
            const auraName = cardElement.find("strong").text();

            await createAuraEffectMessage(sourceToken || targetToken, targetToken, "manual", {
                damage: config.damage.formula, // formula for now, or we'd need roll result from socket
                auraName: auraName,
                manualAction: "Damage Applied"
            });
        });

        // Roll Save button
        html.find(".sdx-aura-roll-save").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const cardElement = btn.closest(".sdx-aura-effect-card");

            const targetId = cardElement.data("target-token-id");
            const dc = cardElement.data("save-dc");
            const ability = cardElement.data("save-ability");

            const targetToken = canvas.tokens.get(targetId);
            if (!targetToken?.actor) return ui.notifications.warn("shadowdark-extras | Target actor not found");

            const config = {
                save: {
                    enabled: true,
                    dc: dc,
                    ability: ability
                }
            };

            const saveResult = await rollAuraSave(targetToken.actor, config.save);

            const sourceId = cardElement.data("source-token-id");
            const sourceToken = canvas.tokens.get(sourceId);
            const auraName = cardElement.find("strong").text();

            await createAuraEffectMessage(sourceToken || targetToken, targetToken, "manual", {
                saveResult: saveResult,
                saved: saveResult.success,
                auraName: auraName
            });
        });

        // Apply Effects button
        html.find(".sdx-aura-apply-effects").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const cardElement = btn.closest(".sdx-aura-effect-card");

            const targetId = cardElement.data("target-token-id");
            const auraEffectId = cardElement.data("aura-effect-id");
            const auraActorId = cardElement.data("aura-actor-id");
            const effectUuids = (cardElement.data("effect-uuids") || "").split(",").filter(u => u);

            const targetToken = canvas.tokens.get(targetId);
            if (!targetToken) return ui.notifications.warn("shadowdark-extras | Target token not found");

            // If not GM, execute via socket to avoid permission issues
            if (!game.user.isGM) {
                const socket = getSocket();
                if (socket) {
                    socket.executeAsGM("applyAuraConditionsViaGM", {
                        auraEffectId: auraEffectId,
                        auraEffectActorId: auraActorId,
                        targetTokenId: targetId,
                        effectUuids: effectUuids
                    });
                }
            } else {
                // GM: apply locally
                let auraActor = game.actors.get(auraActorId);
                if (!auraActor) auraActor = canvas.tokens.get(auraActorId)?.actor;

                const auraEffect = auraActor?.effects.get(auraEffectId);
                if (auraEffect) {
                    await applyAuraConditions(auraEffect, targetToken, effectUuids);
                } else {
                    console.error("shadowdark-extras | Apply Effects: Aura effect not found", { auraActorId, auraEffectId });
                }
            }

            // Create reporting message
            const sourceId = cardElement.data("source-token-id");
            const sourceToken = canvas.tokens.get(sourceId);
            const auraName = cardElement.find("strong").text();

            await createAuraEffectMessage(sourceToken || targetToken, targetToken, "manual", {
                auraName: auraName,
                manualAction: "Condition Applied"
            });
        });
    });

    // Re-evaluate auras when walls change (LOS updates)
    Hooks.on("createWall", (wall) => {
        if (game.user.isGM) {
            refreshSceneAuras();
        }
    });
    Hooks.on("updateWall", (wall, changes) => {
        if (game.user.isGM && (changes.c !== undefined || changes.ds !== undefined || changes.sense !== undefined)) {
            refreshSceneAuras();
        }
    });
    Hooks.on("deleteWall", (wall) => {
        if (game.user.isGM) {
            refreshSceneAuras();
        }
    });

    // Also re-evaluate on scene updates that might affect vision/lighting
    Hooks.on("updateScene", (scene, changes) => {
        if (game.user.isGM && (changes.grid !== undefined || changes.padding !== undefined || changes.fogExploration !== undefined)) {
            refreshSceneAuras();
        }
    });

    // Clean up aura animations when effect is deleted
    Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
        if (!game.user.isGM) return;

        const auraConfig = effect.flags?.[MODULE_ID]?.aura;
        if (!auraConfig?.enabled) return;

        // Stop animation if using Sequencer
        const token = effect.parent?.token ||
            canvas.tokens.placeables.find(t => t.actor?.id === effect.parent?.id);

        if (token && typeof Sequencer !== 'undefined') {
            Sequencer.EffectManager.endEffects({ name: `aura-${effect.id}`, object: token });
        }

        // Remove aura effects from all tokens
        await removeAuraEffectsFromAll(effect);
    });

}

/**
 * Force a re-evaluation of all auras in the scene
 * Useful when walls are added/modified or large-scale changes occur
 */
export async function refreshSceneAuras() {
    if (!game.user.isGM) return;
    const auras = getActiveAuras();
    if (auras.length === 0) return;

    for (const { effect, token: sourceToken, config } of auras) {
        for (const targetToken of canvas.tokens.placeables) {
            // Skip source unless includeSelf
            if (targetToken.id === sourceToken.id && !config.includeSelf) continue;
            if (!targetToken.actor) continue;

            // Check disposition
            if (!checkDisposition(sourceToken, targetToken, config.disposition)) continue;

            // Calculate current state
            let isInside = isTokenInAura(sourceToken, targetToken, config.radius);
            if (isInside && config.checkVisibility) {
                isInside = checkAuraVisibility(sourceToken, targetToken);
            }

            // Check existing effects to see "previous" state
            const hasEffect = targetToken.actor.items.some(i =>
                i.type === "Effect" && i.flags?.[MODULE_ID]?.auraOrigin === effect.id
            );

            if (!hasEffect && isInside && shouldAnyComponentTrigger(config, 'enter')) {
                await applyAuraEffect(sourceToken, targetToken, "enter", config, effect);
            } else if (hasEffect && !isInside && config.triggers?.onLeave) {
                await removeAuraEffectsFromToken(effect, targetToken);
            } else if (!isInside) {
                // Token is outside aura - always remove TokenMagic filter even if onLeave trigger isn't configured
                if (config.tokenFilters?.enabled) {
                    await removeTokenMagicFilter(targetToken, effect.id);
                }
            } else {
            }
        }
    }
}

/**
 * Get all active aura effects on the scene
 * @returns {Array} Array of {effect, token, config} objects
 */
export function getActiveAuras() {
    const auras = [];

    for (const token of canvas.tokens.placeables) {
        if (!token.actor) continue;

        // Check all effects on the actor for aura configurations
        const effects = token.actor.effects || [];
        for (const effect of effects) {
            const auraConfig = effect.flags?.[MODULE_ID]?.aura;
            if (auraConfig?.enabled) {
                auras.push({
                    effect: effect,
                    token: token,
                    config: auraConfig
                });
            }
        }
    }

    return auras;
}

/**
 * Get tokens within an aura's radius
 * @param {Token} sourceToken - The token with the aura
 * @param {number} radiusFeet - Radius in feet
 * @param {string} disposition - 'ally', 'enemy', or 'all'
 * @param {boolean} includeSelf - Whether to include the source token
 * @returns {Token[]} Array of tokens within the aura
 */
export function getTokensInAura(sourceToken, radiusFeet, disposition = 'all', includeSelf = false) {
    const tokens = [];
    const gridDistance = canvas.scene.grid.distance || 5; // feet per grid unit
    const radiusPixels = (radiusFeet / gridDistance) * canvas.grid.size;

    const sourceCenter = sourceToken.center;

    for (const token of canvas.tokens.placeables) {
        if (!token.actor) continue;
        if (!includeSelf && token.id === sourceToken.id) continue;

        // Check disposition
        if (disposition !== 'all') {
            const sourceDisp = sourceToken.document.disposition;
            const tokenDisp = token.document.disposition;

            if (disposition === 'ally' && sourceDisp !== tokenDisp) continue;
            if (disposition === 'enemy' && sourceDisp === tokenDisp) continue;
        }

        // Calculate distance from source center to token center
        const tokenCenter = token.center;
        const distance = Math.hypot(tokenCenter.x - sourceCenter.x, tokenCenter.y - sourceCenter.y);

        if (distance <= radiusPixels) {
            tokens.push(token);
        }
    }

    return tokens;
}

/**
 * Check if a token is within an aura
 * @param {Token} sourceToken - The aura source token
 * @param {Token} testToken - The token to test
 * @param {number} radiusFeet - Radius in feet
 * @returns {boolean}
 */
function isTokenInAura(sourceToken, testToken, radiusFeet) {
    // Safety check for missing center properties
    if (!sourceToken?.center || !testToken?.center) {
        return false;
    }

    const gridDistance = canvas.scene.grid.distance || 5;
    const radiusPixels = (radiusFeet / gridDistance) * canvas.grid.size;

    const distance = Math.hypot(
        testToken.center.x - sourceToken.center.x,
        testToken.center.y - sourceToken.center.y
    );

    return distance <= radiusPixels;
}

/**
 * Process token movement for aura enter/leave triggers
 * @param {TokenDocument} tokenDoc - The token that moved
 * @param {Object} changes - The changes from updateToken hook containing new x/y values
 */
async function processAuraMovement(tokenDoc, changes = {}) {
    const token = canvas.tokens.get(tokenDoc.id);
    if (!token) return;


    const previousPos = _previousPositions.get(tokenDoc.id);

    // Calculate the NEW center position from changes (which has the NEW values)
    // In Foundry v13, tokenDoc.x/y still has OLD values in updateToken hook
    const newX = changes.x ?? tokenDoc.x;
    const newY = changes.y ?? tokenDoc.y;
    const newCenter = {
        x: newX + (tokenDoc.width * canvas.grid.size) / 2,
        y: newY + (tokenDoc.height * canvas.grid.size) / 2
    };


    const auras = getActiveAuras();

    for (const { effect, token: sourceToken, config } of auras) {
        // Skip if source is the moving token (can't enter/leave own aura)
        if (sourceToken.id === token.id) {
            continue;
        }

        // Check disposition
        if (!checkDisposition(sourceToken, token, config.disposition)) continue;

        // Calculate if inside (including visibility)
        let isInside = isPositionInAuraAtPosition(sourceToken.center, newCenter, config.radius);
        if (isInside && config.checkVisibility) {
            isInside = checkAuraVisibility(sourceToken, token, null, newCenter);
        }

        // Check if token currently has the effect from this aura
        const hasEffect = token.actor.items.some(i =>
            i.type === "Effect" && i.flags?.[MODULE_ID]?.auraOrigin === effect.id
        );


        if (!hasEffect && isInside && shouldAnyComponentTrigger(config, 'enter')) {
            await applyAuraEffect(sourceToken, token, 'enter', config, effect);
        } else if (!isInside && hasEffect) {
            // Token LEFT the aura (it had effect, now it's outside)
            // First, apply any 'leave' triggered effects (damage, effects, macro)
            if (shouldAnyComponentTrigger(config, 'leave')) {
                await applyAuraEffect(sourceToken, token, 'leave', config, effect);
            }
            // Then, remove existing effects if Standard 'On Leave (remove)' is checked
            if (config.triggers?.onLeave) {
                await removeAuraEffectsFromToken(effect, token);
            }
            // Always remove TokenMagic filters when leaving
            if (config.tokenFilters?.enabled) {
                await removeTokenMagicFilter(token, effect.id);
            }
        } else if (!isInside && !hasEffect && config.tokenFilters?.enabled) {
            // Token is outside aura and never had effect - just clean up filters if any
            await removeTokenMagicFilter(token, effect.id);
        } else {
        }
    }
}

/**
 * Process when an aura SOURCE token moves (the token carrying the aura)
 * This handles enter/leave for all tokens when the aura bearer moves
 * @param {TokenDocument} sourceTokenDoc - The source token that moved
 * @param {Object} changes - The movement changes
 */
async function processAuraSourceMovement(sourceTokenDoc, changes = {}) {
    const sourceToken = canvas.tokens.get(sourceTokenDoc.id);
    if (!sourceToken?.actor) return;

    // Check if this token has an active aura
    const auras = getActiveAuras().filter(a => a.token.id === sourceToken.id);
    if (auras.length === 0) return;

    const previousPos = _previousPositions.get(sourceTokenDoc.id);

    // Calculate old and new source center positions
    const oldSourceCenter = previousPos?.center;
    const newX = changes.x ?? sourceTokenDoc.x;
    const newY = changes.y ?? sourceTokenDoc.y;
    const newSourceCenter = {
        x: newX + (sourceTokenDoc.width * canvas.grid.size) / 2,
        y: newY + (sourceTokenDoc.height * canvas.grid.size) / 2
    };

    for (const { effect, config } of auras) {
        // Check all tokens on the scene
        for (const otherToken of canvas.tokens.placeables) {
            // Skip the source token itself (unless includeSelf)
            if (otherToken.id === sourceToken.id && !config.includeSelf) continue;
            if (!otherToken.actor) continue;

            // Check disposition
            const dispOk = checkDisposition(sourceToken, otherToken, config.disposition);
            if (!dispOk) continue;

            const otherCenter = otherToken.center;

            // Calculate if now inside (relative to new source position)
            let isInside = isPositionInAuraAtPosition(newSourceCenter, otherCenter, config.radius);

            if (isInside && config.checkVisibility) {
                isInside = checkAuraVisibility(sourceToken, otherToken, newSourceCenter, otherCenter);
            }

            // Check if token currently has the effect from this aura
            const hasEffect = otherToken.actor.items.some(i =>
                i.type === "Effect" && i.flags?.[MODULE_ID]?.auraOrigin === effect.id
            );

            if (!hasEffect && isInside && shouldAnyComponentTrigger(config, 'enter')) {
                await applyAuraEffect(sourceToken, otherToken, 'enter', config, effect);
            } else if (hasEffect && !isInside && config.triggers?.onLeave) {
                await removeAuraEffectsFromToken(effect, otherToken);
            } else if (!isInside) {
                // Token is outside aura - always remove TokenMagic filter even if onLeave trigger isn't configured
                if (config.tokenFilters?.enabled) {
                    await removeTokenMagicFilter(otherToken, effect.id);
                }
            }
        }
    }
}

/**
 * Check if a position is within aura range of a source position (for source movement)
 */
function isPositionInAuraAtPosition(sourceCenter, testCenter, radiusFeet) {
    const gridDistance = canvas.grid.distance || canvas.scene?.grid?.distance || 5;
    const radiusPixels = (radiusFeet / gridDistance) * canvas.grid.size;
    const distance = Math.hypot(testCenter.x - sourceCenter.x, testCenter.y - sourceCenter.y);
    return distance <= radiusPixels;
}

/**
 * Check if the aura source can see the target token
 * @param {Token} sourceToken - The token carrying the aura
 * @param {Token} targetToken - The target token
 * @param {Object} [fromPosition] - Optional position to check from (instead of sourceToken.center)
 * @param {Object} [toPosition] - Optional position to check to (instead of targetToken.center)
 * @returns {boolean} - True if visible or if visibility check should be bypassed
 */
function checkAuraVisibility(sourceToken, targetToken, fromPosition = null, toPosition = null) {
    const startPos = fromPosition || sourceToken.center;
    const endPos = toPosition || (targetToken.getCenterPoint ? targetToken.getCenterPoint() : targetToken.center);

    // 1. Primary Foundry Visibility Check (V11/V12/V13)
    const visibilityApi = canvas.visibility || canvas.effects?.visibility;
    if (visibilityApi?.testVisibility) {
        const isVisible = visibilityApi.testVisibility(endPos, { object: sourceToken });
        if (isVisible) {
            return true;
        }
    }

    // 2. Wall collision fallback (Sight-blocking Ray Casting)
    // We check from center to center as primary
    let isBlocked = false;
    if (window.foundry?.canvas?.geometry?.Ray) {
        // V13 check
        if (CONFIG.Canvas?.polygonBackends?.sight?.testCollision) {
            isBlocked = CONFIG.Canvas.polygonBackends.sight.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        } else if (canvas.edges?.testCollision) {
            isBlocked = canvas.edges.testCollision(startPos, endPos, { mode: "any", type: "sight" });
        }
    } else if (canvas.walls?.checkCollision) {
        // Fallback for V11/V12
        const ray = new Ray(startPos, endPos);
        isBlocked = canvas.walls.checkCollision(ray, { mode: "any", type: "sight" });
    }

    // If center is blocked, try a tiny offset to avoid snapping issues at wall edges
    if (isBlocked) {
        const offset = 2;
        const offsets = [
            { x: offset, y: 0 }, { x: -offset, y: 0 }, { x: 0, y: offset }, { x: 0, y: -offset }
        ];

        for (const off of offsets) {
            const testEnd = { x: endPos.x + off.x, y: endPos.y + off.y };
            let secondaryBlocked = true;
            if (CONFIG.Canvas?.polygonBackends?.sight?.testCollision) {
                secondaryBlocked = CONFIG.Canvas.polygonBackends.sight.testCollision(startPos, testEnd, { mode: "any", type: "sight" });
            } else if (canvas.edges?.testCollision) {
                secondaryBlocked = canvas.edges.testCollision(startPos, testEnd, { mode: "any", type: "sight" });
            } else if (canvas.walls?.checkCollision) {
                secondaryBlocked = canvas.walls.checkCollision(new Ray(startPos, testEnd), { mode: "any", type: "sight" });
            }

            if (!secondaryBlocked) {
                return true;
            }
        }
    }

    return !isBlocked;
}

/**
 * Check if a position is within an aura
 */
function isTokenInAuraAtPosition(sourceToken, position, radiusFeet) {
    const gridDistance = canvas.scene.grid.distance || 5;
    const radiusPixels = (radiusFeet / gridDistance) * canvas.grid.size;

    const distance = Math.hypot(
        position.x - sourceToken.center.x,
        position.y - sourceToken.center.y
    );

    return distance <= radiusPixels;
}

/**
 * Process turn-based aura effects
 * @param {Combat} combat - The combat instance
 * @param {Object} changes - The changes object from updateCombat
 */
async function processAuraTurnEffects(combat, changes) {
    const combatant = combat.combatant;
    console.log(`shadowdark-extras | processAuraTurnEffects: Called for ${combatant?.name}, round=${combat.round}, turn=${combat.turn}, prev=${combat.previous?.combatantId}`);

    const auras = getActiveAuras();
    if (auras.length === 0) return;

    // Check for expired auras and delete them
    // Only GM should do this to avoid race conditions
    if (game.user.isGM) {
        for (const { effect } of auras) {
            const startRound = effect.duration?.startRound;
            const rounds = effect.duration?.rounds;

            if (startRound !== undefined && rounds !== undefined && rounds !== null) {
                const currentRound = combat.round;
                const expiryRound = startRound + rounds;

                if (currentRound >= expiryRound) {
                    await effect.delete();
                    continue;
                }
            }
        }
    }

    // Process turnEnd for previous combatant FIRST (before checking current token)
    // This ensures we don't skip turnEnd just because the current combatant has no token
    if (combat.previous?.combatantId) {
        const prevCombatant = combat.combatants.get(combat.previous.combatantId);
        const prevToken = prevCombatant?.token ? canvas.tokens.get(prevCombatant.token.id) : null;
        console.log(`shadowdark-extras | handleCombatUpdate: turnEnd for prevToken=${prevToken?.name}`);
        if (prevToken) {
            for (const { effect, token: sourceToken, config } of auras) {
                // Case 1: Source Turn End - previous combatant IS the aura source -> apply to all tokens in range
                // Check both standard triggers AND component-specific triggers
                const hasSourceTurnEnd = config.triggers?.onSourceTurnEnd ||
                    config.damageTriggers?.onSourceTurnEnd ||
                    config.effectsTriggers?.onSourceTurnEnd ||
                    config.macroTriggers?.onSourceTurnEnd;
                if (sourceToken.id === prevToken.id && hasSourceTurnEnd) {
                    console.log(`shadowdark-extras | handleCombatUpdate: Source Turn End - checking all tokens in aura`);
                    for (const targetToken of canvas.tokens.placeables) {
                        if (targetToken.id === sourceToken.id && !config.includeSelf) continue;
                        if (!targetToken.actor) continue;
                        if (!isTokenInAura(sourceToken, targetToken, config.radius)) continue;
                        if (!checkDisposition(sourceToken, targetToken, config.disposition)) continue;
                        if (config.checkVisibility && !checkAuraVisibility(sourceToken, targetToken)) continue;

                        console.log(`shadowdark-extras | handleCombatUpdate: Source Turn End applying to ${targetToken.name}`);
                        await applyAuraEffect(sourceToken, targetToken, 'sourceTurnEnd', config, effect);
                    }
                }

                // Case 2: Target Turn End - previous combatant is inside an aura -> apply to that combatant only
                // Check both standard triggers AND component-specific triggers
                const hasTargetTurnEnd = config.triggers?.onTargetTurnEnd ||
                    config.damageTriggers?.onTargetTurnEnd ||
                    config.effectsTriggers?.onTargetTurnEnd ||
                    config.macroTriggers?.onTargetTurnEnd;
                if (hasTargetTurnEnd) {
                    console.log(`shadowdark-extras | handleCombatUpdate: Checking Target Turn End for ${prevToken.name} in ${effect.name}`);
                    if (sourceToken.id === prevToken.id && !config.includeSelf) {
                        console.log(`shadowdark-extras | handleCombatUpdate: Target Turn End skipped (self)`);
                        continue;
                    }
                    const inAura = isTokenInAura(sourceToken, prevToken, config.radius);
                    console.log(`shadowdark-extras | handleCombatUpdate: Target Turn End inAura=${inAura}`);
                    if (!inAura) continue;
                    if (!checkDisposition(sourceToken, prevToken, config.disposition)) continue;
                    if (config.checkVisibility && !checkAuraVisibility(sourceToken, prevToken)) continue;

                    console.log(`shadowdark-extras | handleCombatUpdate: Target Turn End applying to ${prevToken.name}`);
                    await applyAuraEffect(sourceToken, prevToken, 'targetTurnEnd', config, effect);
                }
            }
        }
    }

    // Process turnStart for current combatant (only if current combatant has a token)
    if (!combatant?.token) return;
    const currentToken = canvas.tokens.get(combatant.token.id);
    if (!currentToken) return;

    for (const { effect, token: sourceToken, config } of auras) {
        // Case 1: Source Turn Start - current combatant IS the aura source -> apply to all tokens in range
        // Check both standard triggers AND component-specific triggers
        const hasSourceTurnStart = config.triggers?.onSourceTurnStart ||
            config.damageTriggers?.onSourceTurnStart ||
            config.effectsTriggers?.onSourceTurnStart ||
            config.macroTriggers?.onSourceTurnStart;
        if (sourceToken.id === currentToken.id && hasSourceTurnStart) {
            console.log(`shadowdark-extras | handleCombatUpdate: Source Turn Start - checking all tokens in aura`);
            for (const targetToken of canvas.tokens.placeables) {
                if (targetToken.id === sourceToken.id && !config.includeSelf) continue;
                if (!targetToken.actor) continue;
                if (!isTokenInAura(sourceToken, targetToken, config.radius)) continue;
                if (!checkDisposition(sourceToken, targetToken, config.disposition)) continue;
                if (config.checkVisibility && !checkAuraVisibility(sourceToken, targetToken)) continue;

                // Prevent duplicate processing
                const key = `${effect.id}-${targetToken.id}-sourceTurnStart`;
                if (_auraAffectedThisTurn.has(key)) continue;
                _auraAffectedThisTurn.set(key, true);

                console.log(`shadowdark-extras | handleCombatUpdate: Source Turn Start applying to ${targetToken.name}`);
                await applyAuraEffect(sourceToken, targetToken, 'sourceTurnStart', config, effect);
            }
        }

        // Case 2: Target Turn Start - current combatant is inside an aura -> apply to that combatant only
        // Check both standard triggers AND component-specific triggers
        const hasTargetTurnStart = config.triggers?.onTargetTurnStart ||
            config.damageTriggers?.onTargetTurnStart ||
            config.effectsTriggers?.onTargetTurnStart ||
            config.macroTriggers?.onTargetTurnStart;
        if (hasTargetTurnStart) {
            if (sourceToken.id === currentToken.id && !config.includeSelf) continue;
            if (!isTokenInAura(sourceToken, currentToken, config.radius)) continue;
            if (!checkDisposition(sourceToken, currentToken, config.disposition)) continue;
            if (config.checkVisibility && !checkAuraVisibility(sourceToken, currentToken)) continue;

            // Prevent duplicate processing
            const key = `${effect.id}-${currentToken.id}-targetTurnStart`;
            if (_auraAffectedThisTurn.has(key)) continue;
            _auraAffectedThisTurn.set(key, true);

            console.log(`shadowdark-extras | handleCombatUpdate: Target Turn Start applying to ${currentToken.name}`);
            await applyAuraEffect(sourceToken, currentToken, 'targetTurnStart', config, effect);
        }
    }
}

/**
 * Check if token matches disposition filter
 */
function checkDisposition(sourceToken, targetToken, disposition) {
    if (disposition === 'all') return true;

    const sourceDisp = sourceToken.document.disposition;
    const targetDisp = targetToken.document.disposition;

    if (disposition === 'ally') return sourceDisp === targetDisp;
    if (disposition === 'enemy') return sourceDisp !== targetDisp;

    return true;
}

/**
 * Check if a specific component (damage, effects, macro) should trigger
 * @param {Object} componentTriggers - Component-specific triggers
 * @param {Object} standardTriggers - Standard aura triggers
 * @param {string} eventType - 'enter', 'sourceTurnStart', 'sourceTurnEnd', 'targetTurnStart', 'targetTurnEnd'
 * @returns {boolean}
 */
function shouldTriggerComponent(componentTriggers, standardTriggers, eventType) {
    const key = `on${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;

    // Check if any specific triggers are enabled for this component
    const anySpecific = componentTriggers && Object.values(componentTriggers).some(v => v === true);

    if (anySpecific) {
        return !!componentTriggers[key];
    }

    return !!standardTriggers[key];
}

/**
 * Check if at least one component of the aura should trigger for this event
 * @param {Object} config - Aura configuration
 * @param {string} eventType - 'enter', 'turnStart', or 'turnEnd'
 * @returns {boolean}
 */
function shouldAnyComponentTrigger(config, eventType) {
    const key = `on${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;

    // Standard trigger
    if (config.triggers?.[key]) return true;

    // Damage
    if (config.damage?.formula && config.damageTriggers?.[key]) return true;

    // Effects
    if (config.applyConfiguredEffects && config.effects?.length > 0 && config.effectsTriggers?.[key]) return true;

    // Macro
    if (config.runItemMacro && config.macroTriggers?.[key]) return true;

    return false;
}

/**
 * Apply aura effect to a token
 * @param {Token} sourceToken - The aura source
 * @param {Token} targetToken - The affected token
 * @param {string} trigger - The trigger type
 * @param {Object} config - The aura configuration
 * @param {ActiveEffect} auraEffect - The source aura effect
 */
export async function applyAuraEffect(sourceToken, targetToken, trigger, config, auraEffect) {
    if (!game.user.isGM) {
        const socket = getSocket();
        if (socket) {
            socket.executeAsGM("applyAuraEffectViaGM", {
                sourceTokenId: sourceToken.id,
                targetTokenId: targetToken.id,
                trigger: trigger,
                config: config,
                auraEffectId: auraEffect.id,
                auraEffectActorId: auraEffect.parent?.id
            });
            return;
        }
    }

    console.log(`shadowdark-extras | applyAuraEffect: source=${sourceToken.name}, target=${targetToken.name}, trigger=${trigger}`);

    // Skip if target is source and includeSelf is false
    if (sourceToken.id === targetToken.id && !config.includeSelf) {
        console.log(`shadowdark-extras | applyAuraEffect: Self-target skipped (includeSelf=false)`);
        return;
    }

    const actor = targetToken.actor;
    if (!actor) {
        console.log(`shadowdark-extras | applyAuraEffect: No actor for target, skipping.`);
        return;
    }

    // Apply TokenMagic filter if configured (independent of damage/effects settings)
    if (config.tokenFilters?.enabled && config.tokenFilters?.preset) {
        console.log(`shadowdark-extras | applyAuraEffect: Applying TokenMagic filter: ${config.tokenFilters.preset}`);
        await applyTokenMagicFilter(targetToken, config.tokenFilters.preset, auraEffect.id);
    }

    // Get auto-apply settings
    let autoApplyDamage = true;
    let autoApplyConditions = true;
    try {
        const settings = game.settings.get(MODULE_ID, "combatSettings") || {};
        autoApplyDamage = settings.damageCard?.autoApplyDamage ?? true;
        autoApplyConditions = settings.damageCard?.autoApplyConditions ?? true;
    } catch (e) {
    }

    // Apply effects/conditions immediately if autoApplyConditions is on (regardless of damage setting)
    const triggerEffects = shouldTriggerComponent(config.effectsTriggers, config.triggers, trigger);
    console.log(`shadowdark-extras | applyAuraEffect: triggerEffects=${triggerEffects}, autoApplyConditions=${autoApplyConditions}`);
    if (triggerEffects && autoApplyConditions && config.effects?.length > 0) {
        await applyAuraConditions(auraEffect, targetToken, config.effects);
    }

    // If auto-apply damage is OFF, OR if auto-apply conditions is OFF (and we have effects), create interactive card
    const triggerDamage = shouldTriggerComponent(config.damageTriggers, config.triggers, trigger);
    const needsManualDamage = !autoApplyDamage && triggerDamage;
    const needsManualEffects = !autoApplyConditions && triggerEffects && config.effects?.length > 0;

    console.log(`shadowdark-extras | applyAuraEffect: triggerDamage=${triggerDamage}, autoApplyDamage=${autoApplyDamage}, needsManualEffects=${needsManualEffects}`);

    if (needsManualDamage || needsManualEffects) {
        await createInteractiveAuraCard(sourceToken, targetToken, trigger, config, auraEffect);

        // Still run item macro
        const triggerMacro = shouldTriggerComponent(config.macroTriggers, config.triggers, trigger);
        console.log(`shadowdark-extras | applyAuraEffect: triggerMacro=${triggerMacro}`);
        if (config.runItemMacro && triggerMacro && config.spellId) {
            await runAuraItemMacro(sourceToken, targetToken, trigger, config);
        }
        return;
    }

    // Auto-apply mode
    let damageApplied = 0;
    let savedSuccessfully = false;
    let saveResult = null;

    // Handle save if configured
    if (config.save?.enabled && config.save?.dc) {
        saveResult = await rollAuraSave(actor, config.save);
        savedSuccessfully = saveResult.success;

        if (savedSuccessfully && !config.save.halfOnSuccess) {
            await createAuraEffectMessage(sourceToken, targetToken, trigger, {
                saved: true,
                saveResult: saveResult,
                auraName: auraEffect.name
            });
            return;
        }
    }

    // Apply damage if configured
    if (triggerDamage && config.damage?.formula) {
        console.log(`shadowdark-extras | applyAuraEffect: Rolling damage...`);
        damageApplied = await applyAuraDamage(targetToken, config, savedSuccessfully);
    }

    // Apply effects if configured and not saved
    // We check autoApplyConditions here as a safeguard, though the block above should catch it
    if (triggerEffects && config.effects?.length > 0 && !savedSuccessfully && autoApplyConditions) {
        await applyAuraConditions(auraEffect, targetToken, config.effects);
    }

    // Run item macro if configured
    const triggerMacro = shouldTriggerComponent(config.macroTriggers, config.triggers, trigger);
    if (config.runItemMacro && triggerMacro && config.spellId) {
        await runAuraItemMacro(sourceToken, targetToken, trigger, config);
    }

    // Create chat message
    await createAuraEffectMessage(sourceToken, targetToken, trigger, {
        damage: damageApplied,
        saved: savedSuccessfully,
        saveResult: saveResult,
        halfDamage: savedSuccessfully && config.save?.halfOnSuccess,
        damageType: config.damage?.type,
        auraName: auraEffect.name
    });
}

/**
 * Roll a save against an aura effect
 */
export async function rollAuraSave(actor, saveConfig) {
    const ability = saveConfig.ability || 'dex';
    const dc = saveConfig.dc || 12;

    // Get modifier
    const modifier = actor.system?.abilities?.[ability]?.mod || 0;

    // Roll the save
    const roll = await new Roll(`1d20 + ${modifier}`).evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    const total = roll.total;
    const success = total >= dc;


    return {
        roll: roll,
        total: total,
        success: success,
        dc: dc,
        ability: ability,
        modifier: modifier
    };
}

/**
 * Apply damage from an aura
 */
export async function applyAuraDamage(token, config, savedSuccessfully) {
    const actor = token.actor;
    if (!actor) {
        return 0;
    }

    const roll = await new Roll(config.damage.formula).evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    let damage = roll.total;


    // Half damage if saved
    if (savedSuccessfully && config.save?.halfOnSuccess) {
        damage = Math.floor(damage / 2);
    }

    // Apply to HP
    const currentHp = actor.system?.attributes?.hp?.value ?? 0;
    const newHp = Math.max(0, currentHp - damage);


    try {
        await actor.update({ "system.attributes.hp.value": newHp });
    } catch (err) {
        console.error("shadowdark-extras | applyAuraDamage: Error updating HP:", err);
    }

    return damage;
}

/**
 * Apply condition effects from an aura
 */
export async function applyAuraConditions(auraEffect, token, effectUuids) {

    const actor = token.actor;
    if (!actor) return;

    for (const effectUuid of effectUuids) {
        try {
            const effectDoc = await fromUuid(effectUuid);
            if (!effectDoc) {
                continue;
            }


            // Check if already has this effect from this aura (by name + aura origin flag)
            const existingItem = actor.items.find(i =>
                i.type === "Effect" &&
                i.name === effectDoc.name &&
                i.flags?.[MODULE_ID]?.auraOrigin === auraEffect.id
            );

            if (existingItem) {
                continue;
            }

            // Create the Effect Item on the actor (not ActiveEffect!)
            // This is the correct approach for Shadowdark - Effect Items have embedded ActiveEffects
            // with transfer: true that Foundry automatically applies to the actor
            const effectData = effectDoc.toObject();
            effectData.flags = effectData.flags || {};
            effectData.flags[MODULE_ID] = effectData.flags[MODULE_ID] || {};
            effectData.flags[MODULE_ID].auraOrigin = auraEffect.id;

            // Link the embedded effects to the original source spell if possible
            if (effectData.effects && auraEffect.origin) {
                effectData.effects.forEach(e => {
                    e.origin = auraEffect.origin;
                });
            }

            await actor.createEmbeddedDocuments("Item", [effectData]);
        } catch (err) {
            console.error(`shadowdark-extras | Error applying aura condition:`, err);
        }
    }
}

/**
 * Remove aura effects from a token when leaving
 */
export async function removeAuraEffectsFromToken(auraEffect, token) {
    // If not GM, execute via socket to avoid permission issues
    if (!game.user.isGM) {
        const socket = getSocket();
        if (socket) {
            socket.executeAsGM("removeAuraEffectViaGM", {
                auraEffectId: auraEffect.id,
                auraEffectActorId: auraEffect.parent?.id,
                targetTokenId: token.id
            });
            return;
        }
    }

    const actor = token.actor;
    if (!actor) return;

    // Remove Effect Items that came from this aura
    const itemsToRemove = actor.items.filter(i =>
        i.type === "Effect" &&
        i.flags?.[MODULE_ID]?.auraOrigin === auraEffect.id
    );

    if (itemsToRemove.length > 0) {
        const ids = itemsToRemove.map(i => i.id);
        await actor.deleteEmbeddedDocuments("Item", ids);
    } else {
    }

    // Remove TokenMagic filter if any was applied by this aura
    await removeTokenMagicFilter(token, auraEffect.id);
}

/**
 * Remove aura effects from all tokens when aura ends
 */
export async function removeAuraEffectsFromAll(auraEffect) {
    // If not GM, execute via socket to avoid permission issues
    if (!game.user.isGM) {
        const socket = getSocket();
        if (socket) {
            socket.executeAsGM("removeAuraEffectsFromAllViaGM", {
                auraEffectId: auraEffect.id,
                auraEffectActorId: auraEffect.parent?.id
            });
            return;
        }
    }

    for (const token of canvas.tokens.placeables) {
        if (!token.actor) continue;
        await removeAuraEffectsFromToken(auraEffect, token);
    }
}

/**
 * Run item macro for aura trigger
 */
async function runAuraItemMacro(sourceToken, targetToken, trigger, config) {
    try {
        const casterActor = sourceToken.actor;
        if (!casterActor) return;

        const spellItem = casterActor.items.get(config.spellId);
        if (!spellItem) return;

        const itemMacro = spellItem.flags?.["itemacro"]?.macro;
        if (!itemMacro?.command) return;

        const speaker = ChatMessage.getSpeaker({ actor: targetToken.actor });
        const args = {
            trigger: trigger,
            sourceToken: sourceToken,
            config: config,
            casterActor: casterActor,
            isAura: true
        };


        const macroBody = `(async () => { ${itemMacro.command} })();`;
        const fn = new Function("item", "actor", "token", "speaker", "character", "args", `return ${macroBody}`);

        await fn.call(null, spellItem, targetToken.actor, targetToken, speaker, game.user?.character, args);
    } catch (err) {
        console.error(`shadowdark-extras | Error running aura item macro:`, err);
    }
}

/**
 * Create interactive card for aura effect (when autoApply is OFF)
 */
async function createInteractiveAuraCard(sourceToken, targetToken, trigger, config, auraEffect) {
    // Similar to template interactive cards
    const triggerName = {
        enter: "entered",
        turnStart: "started turn in",
        turnEnd: "ended turn in"
    }[trigger] || trigger;

    const content = `
        <div class="shadowdark chat-card sdx-aura-effect-card" style="background: #1a1a1a; border-radius: 6px; padding: 8px; color: #e0e0e0;"
             data-source-token-id="${sourceToken.id}"
             data-target-token-id="${targetToken.id}"
             data-aura-effect-id="${auraEffect.id}"
             data-aura-actor-id="${auraEffect.parent?.id}"
             data-effect-uuids="${(config.effects || []).join(',')}"
             data-damage-formula="${config.damage?.formula || ''}"
             data-save-dc="${config.save?.dc || ''}"
             data-save-ability="${config.save?.ability || ''}"
             data-half-damage="${config.save?.halfOnSuccess || false}">
            
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; border-bottom: 1px solid #444; padding-bottom: 6px;">
                <img src="${auraEffect.img || sourceToken.document.texture.src}" style="width: 32px; height: 32px; border-radius: 4px; border: 1px solid #555;">
                <div>
                    <strong style="color: #fff;">${auraEffect.name}</strong>
                    <div style="font-size: 11px; color: #aaa;">${targetToken.name} ${triggerName} aura</div>
                </div>
            </div>

            ${config.damage?.formula ? `
            <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-dice-d6"></i> ${config.damage.formula} ${config.damage.type || ''}</span>
                <button type="button" class="sdx-aura-apply-damage" style="width: auto; height: 24px; line-height: 24px; font-size: 12px; padding: 0 8px;">
                    Apply Damage
                </button>
            </div>` : ''}

            ${config.save?.enabled ? `
            <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-shield-alt"></i> DC ${config.save.dc} ${config.save.ability?.toUpperCase()}</span>
                <button type="button" class="sdx-aura-roll-save" style="width: auto; height: 24px; line-height: 24px; font-size: 12px; padding: 0 8px;">
                    Roll Save
                </button>
            </div>` : ''}

            ${config.effects?.length > 0 ? `
            <div style="margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span><i class="fas fa-magic"></i> Apply Conditions</span>
                <button type="button" class="sdx-aura-apply-effects" style="width: auto; height: 24px; line-height: 24px; font-size: 12px; padding: 0 8px;">
                    Apply Effect
                </button>
            </div>` : ''}
        </div>
    `;

    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ token: sourceToken.document }),
        type: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
}

/**
 * Create chat message for aura effect result
 */
async function createAuraEffectMessage(sourceToken, targetToken, trigger, result) {
    const triggerName = {
        enter: "entered the aura",
        turnStart: "started turn in the aura",
        turnEnd: "ended turn in the aura",
        manual: result.manualAction || "interacted with the aura"
    }[trigger] || trigger;

    let content = `
        <div class="shadowdark chat-card" style="background: #1a1a1a; border-radius: 6px; padding: 8px; color: #e0e0e0;">
            <strong>${result.auraName || 'Aura'}</strong>
            <p>${targetToken.name} ${triggerName}</p>
    `;

    if (result.saveResult) {
        const saveClass = result.saved ? 'color: #4a4' : 'color: #a44';
        content += `<p style="${saveClass}">Save: ${result.saveResult.total} vs DC ${result.saveResult.dc} - ${result.saved ? 'SUCCESS' : 'FAILED'}</p>`;
    }

    if (result.damage) {
        content += `<p>Damage: ${result.damage} ${result.damageType || ''}</p>`;
    }

    content += '</div>';

    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ token: sourceToken.document }),
        type: CONST.CHAT_MESSAGE_STYLES.OTHER
    });
}

/**
 * Create aura effect on an actor
 * @param {Actor} actor - The actor to receive the aura
 * @param {Object} auraConfig - The aura configuration
 * @param {Item} sourceItem - The source item (spell)
 * @returns {ActiveEffect} The created effect
 */
export async function createAuraOnActor(actor, auraConfig, sourceItem, duration = null, expiryRounds = null) {
    // Generate a unique status ID for this aura
    const auraStatusId = `sdx-aura-${sourceItem.id}`;

    const effectData = {
        name: sourceItem.name + " (Aura)",
        img: sourceItem.img,
        origin: sourceItem.uuid,
        // Add statuses to show as icon on token
        statuses: [auraStatusId],
        duration: {
            rounds: expiryRounds,
            startRound: game.combat?.round,
            startTime: game.time.worldTime
        },
        flags: {
            [MODULE_ID]: {
                aura: {
                    enabled: true,
                    radius: auraConfig.radius || 30,
                    triggers: auraConfig.triggers || {},
                    damage: auraConfig.damage || {},
                    save: auraConfig.save || {},
                    effects: auraConfig.effects || [],
                    animation: auraConfig.animation || {},
                    tokenFilters: auraConfig.tokenFilters || {},
                    disposition: auraConfig.disposition || 'all',
                    includeSelf: auraConfig.includeSelf || false,
                    checkVisibility: auraConfig.checkVisibility || false,
                    applyConfiguredEffects: auraConfig.applyConfiguredEffects || false,
                    effectsTriggers: auraConfig.effectsTriggers || {},
                    damageTriggers: auraConfig.damageTriggers || {},
                    runItemMacro: auraConfig.runItemMacro || false,
                    macroTriggers: auraConfig.macroTriggers || {},
                    spellId: sourceItem.id
                }
            }
        }
    };

    const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

    // Create animation if configured
    if (auraConfig.animation?.enabled) {
        const token = actor.token || canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
        if (token) {
            await createAuraAnimation(token, effect, auraConfig);
        }
    }


    // Process initial tokens in aura range (apply effects immediately on creation)
    // IMPORTANT: Use canvas.tokens.placeables to get Token objects (with .center), NOT actor.token (TokenDocument)
    const sourceToken = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
    if (sourceToken && shouldAnyComponentTrigger(auraConfig, 'enter')) {

        const config = {
            radius: auraConfig.radius || 30,
            triggers: auraConfig.triggers || {},
            damage: auraConfig.damage || {},
            save: auraConfig.save || {},
            effects: auraConfig.effects || [],
            animation: auraConfig.animation || {},
            tokenFilters: auraConfig.tokenFilters || {},
            disposition: auraConfig.disposition || 'all',
            includeSelf: auraConfig.includeSelf || false,
            checkVisibility: auraConfig.checkVisibility || false,
            applyConfiguredEffects: auraConfig.applyConfiguredEffects || false,
            effectsTriggers: auraConfig.effectsTriggers || {},
            damageTriggers: auraConfig.damageTriggers || {},
            runItemMacro: auraConfig.runItemMacro || false,
            macroTriggers: auraConfig.macroTriggers || {},
            spellId: sourceItem.id
        };

        // Get all tokens in scene

        for (const otherToken of canvas.tokens.placeables) {
            // 1. Basic Skip Checks
            if (otherToken.id === sourceToken.id && !config.includeSelf) continue;
            if (!otherToken.actor) continue;

            // 2. Range Check
            const isInRange = isTokenInAura(sourceToken, otherToken, config.radius);
            if (!isInRange) continue;

            // 3. Disposition Check
            const dispOk = checkDisposition(sourceToken, otherToken, config.disposition);
            if (!dispOk) {
                continue;
            }

            // 4. Visibility Check
            if (config.checkVisibility) {
                const isVisible = checkAuraVisibility(sourceToken, otherToken);
                if (!isVisible) {
                    continue;
                }
            }

            await applyAuraEffect(sourceToken, otherToken, 'enter', config, effect);
        }
    } else if (!sourceToken) {
    }

    return effect;
}

/**
 * Create visual animation for aura (using Sequencer if available)
 */
async function createAuraAnimation(token, effect, config) {
    if (typeof Sequencer === 'undefined') {
        return;
    }

    const animation = config.animation || {};
    const radius = config.radius || 30;
    const tint = animation.tint || '#ffffff';
    const style = animation.style || 'circle';
    const opacity = Number(animation.opacity) || 0.6;
    const scaleMultiplier = Number(animation.scaleMultiplier) || 1.0;

    // Calculate scale based on radius (radius in grid squares)
    const gridDistance = canvas.scene.grid.distance || 5;
    const radiusInSquares = radius / gridDistance;
    // Apply user scale multiplier
    const finalScale = radiusInSquares * scaleMultiplier;

    // Select animation file based on style
    // Select animation file based on style
    let animationFile;
    const legacyStyles = {
        'darkness': 'jb2a.darkness.black',
        'pulse': 'jb2a.template_circle.out_pulse.01.burst.bluewhite',
        'glow': 'jb2a.extras.tmfx.outpulse.circle.01.normal',
        'circle': 'jb2a.template_circle.aura.01.complete.small.blue'
    };

    if (legacyStyles[style]) {
        animationFile = legacyStyles[style];
    } else {
        // Assume it's a direct Sequencer path if not a legacy keyword
        // If the user typed something custom, use it directly
        animationFile = style;
    }


    // Try to use JB2A if available
    if (typeof Sequencer !== 'undefined') {
        new Sequence()
            .effect()
            .name(`aura-${effect.id}`)
            .file(animationFile)
            .attachTo(token)
            .scaleToObject(finalScale)
            .tint(tint)
            .opacity(opacity)
            .belowTokens()
            .persist()
            .fadeIn(500)
            .fadeOut(500)
            .play();
    }

}