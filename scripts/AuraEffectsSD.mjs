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
 * Initialize the aura effects system
 * Call this from the main module during 'ready' hook
 */
export function initAuraEffects() {
    console.log("shadowdark-extras | Initializing Aura Effects System");

    // Track token positions before movement
    Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
        if (changes.x !== undefined || changes.y !== undefined) {
            // Get the token placeable to access its current center
            const token = canvas.tokens.get(tokenDoc.id);
            const center = token ? token.center : {
                x: tokenDoc.x + (tokenDoc.width * canvas.grid.size) / 2,
                y: tokenDoc.y + (tokenDoc.height * canvas.grid.size) / 2
            };

            console.log(`shadowdark-extras | preUpdateToken: Storing previous position for ${tokenDoc.name}`);

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
                    console.log("shadowdark-extras | Applying aura damage via GM socket");
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
                    console.log("shadowdark-extras | Applying aura conditions via GM socket");
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
            console.log("shadowdark-extras | Wall created, triggering aura refresh");
            refreshSceneAuras();
        }
    });
    Hooks.on("updateWall", (wall, changes) => {
        if (game.user.isGM && (changes.c !== undefined || changes.ds !== undefined || changes.sense !== undefined)) {
            console.log("shadowdark-extras | Wall updated, triggering aura refresh");
            refreshSceneAuras();
        }
    });
    Hooks.on("deleteWall", (wall) => {
        if (game.user.isGM) {
            console.log("shadowdark-extras | Wall deleted, triggering aura refresh");
            refreshSceneAuras();
        }
    });

    // Also re-evaluate on scene updates that might affect vision/lighting
    Hooks.on("updateScene", (scene, changes) => {
        if (game.user.isGM && (changes.grid !== undefined || changes.padding !== undefined || changes.fogExploration !== undefined)) {
            console.log("shadowdark-extras | Scene updated, triggering aura refresh");
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

    console.log("shadowdark-extras | Aura Effects System initialized");
}

/**
 * Force a re-evaluation of all auras in the scene
 * Useful when walls are added/modified or large-scale changes occur
 */
export async function refreshSceneAuras() {
    if (!game.user.isGM) return;
    console.log("shadowdark-extras | refreshSceneAuras: Forcing re-evaluation of all auras");
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

            if (!hasEffect && isInside && config.triggers?.onEnter) {
                console.log(`shadowdark-extras | refreshSceneAuras: [ENTER] ${targetToken.name} entering aura of ${sourceToken.name}`);
                await applyAuraEffect(sourceToken, targetToken, "enter", config, effect);
            } else if (hasEffect && !isInside && config.triggers?.onLeave) {
                console.log(`shadowdark-extras | refreshSceneAuras: [LEAVE] ${targetToken.name} leaving aura of ${sourceToken.name}`);
                await removeAuraEffectsFromToken(effect, targetToken);
            } else {
                console.log(`shadowdark-extras | refreshSceneAuras: No change for ${targetToken.name} (hasEffect=${hasEffect}, isInside=${isInside})`);
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
        console.log(`shadowdark-extras | isTokenInAura: Missing center for ${sourceToken?.name} or ${testToken?.name}`);
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

    console.log(`shadowdark-extras | processAuraMovement called for token: ${token.name}`);

    const previousPos = _previousPositions.get(tokenDoc.id);

    // Calculate the NEW center position from changes (which has the NEW values)
    // In Foundry v13, tokenDoc.x/y still has OLD values in updateToken hook
    const newX = changes.x ?? tokenDoc.x;
    const newY = changes.y ?? tokenDoc.y;
    const newCenter = {
        x: newX + (tokenDoc.width * canvas.grid.size) / 2,
        y: newY + (tokenDoc.height * canvas.grid.size) / 2
    };

    console.log(`shadowdark-extras | Token positions: previous=${previousPos?.center?.x},${previousPos?.center?.y}, new=${newCenter.x},${newCenter.y}`);

    const auras = getActiveAuras();
    console.log(`shadowdark-extras | Found ${auras.length} active auras on scene`);

    for (const { effect, token: sourceToken, config } of auras) {
        // Skip if source is the moving token (can't enter/leave own aura)
        if (sourceToken.id === token.id) {
            console.log(`shadowdark-extras | Skipping - token is aura source`);
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

        console.log(`shadowdark-extras | Aura check for ${token.name} vs ${sourceToken.name}: isInside=${isInside}, hasEffect=${hasEffect}`);

        if (!hasEffect && isInside && config.triggers?.onEnter) {
            console.log(`shadowdark-extras | Token ${token.name} entering aura of ${sourceToken.name}`);
            await applyAuraEffect(sourceToken, token, 'enter', config, effect);
        } else if (hasEffect && !isInside && config.triggers?.onLeave) {
            console.log(`shadowdark-extras | Token ${token.name} leaving aura of ${sourceToken.name}`);
            await removeAuraEffectsFromToken(effect, token);
        } else {
            console.log(`shadowdark-extras | No enter/leave trigger needed: isInside=${isInside}, hasEffect=${hasEffect}`);
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

            if (!hasEffect && isInside && config.triggers?.onEnter) {
                console.log(`shadowdark-extras | [SOURCE MOVE] Applying effect to ${otherToken.name}`);
                await applyAuraEffect(sourceToken, otherToken, 'enter', config, effect);
            } else if (hasEffect && !isInside && config.triggers?.onLeave) {
                console.log(`shadowdark-extras | [SOURCE MOVE] Removing effect from ${otherToken.name}`);
                await removeAuraEffectsFromToken(effect, otherToken);
            } else {
                // If it should have had the effect but didn't, and onEnter is true, we force it if triggers onEnter
                // This covers cases where initial application might have failed or been skipped
                if (!hasEffect && isInside && config.triggers?.onEnter) {
                    console.log(`shadowdark-extras | [SOURCE MOVE] Catch-up application for ${otherToken.name}`);
                    await applyAuraEffect(sourceToken, otherToken, 'enter', config, effect);
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
            console.log(`shadowdark-extras | checkAuraVisibility: Foundry API says visible for ${targetToken.name}`);
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
                console.log(`shadowdark-extras | checkAuraVisibility: Visible via offset check for ${targetToken.name}`);
                return true;
            }
        }
    }

    console.log(`shadowdark-extras | checkAuraVisibility: [LOS RESULT] ${!isBlocked} for ${targetToken.name} from ${sourceToken.name}`);
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
    if (!combatant?.token) return;

    const currentToken = canvas.tokens.get(combatant.token.id);
    if (!currentToken) return;

    const auras = getActiveAuras();

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
                    console.log(`shadowdark-extras | removing expired aura effect: ${effect.name} (Expired at round ${expiryRound}, current: ${currentRound})`);
                    await effect.delete();
                    continue; // Skip processing for this deleted effect
                }
            }
        }
    }

    // Process turnEnd for previous combatant
    if (combat.previous?.tokenId) {
        const prevToken = canvas.tokens.get(combat.previous.tokenId);
        if (prevToken) {
            for (const { effect, token: sourceToken, config } of auras) {
                if (!config.triggers?.onTurnEnd) continue;

                // Check if previous token is in this aura
                if (!isTokenInAura(sourceToken, prevToken, config.radius)) continue;
                if (sourceToken.id === prevToken.id && !config.includeSelf) continue;

                // Check disposition
                if (!checkDisposition(sourceToken, prevToken, config.disposition)) continue;

                // Check visibility
                if (config.checkVisibility && !checkAuraVisibility(sourceToken, prevToken)) continue;

                console.log(`shadowdark-extras | Aura turnEnd for ${prevToken.name} in ${sourceToken.name}'s aura`);
                await applyAuraEffect(sourceToken, prevToken, 'turnEnd', config, effect);
            }
        }
    }

    // Process turnStart for current combatant
    for (const { effect, token: sourceToken, config } of auras) {
        if (!config.triggers?.onTurnStart) continue;

        // Check if current token is in this aura
        if (!isTokenInAura(sourceToken, currentToken, config.radius)) continue;
        if (sourceToken.id === currentToken.id && !config.includeSelf) continue;

        // Check disposition
        if (!checkDisposition(sourceToken, currentToken, config.disposition)) continue;

        // Check visibility
        if (config.checkVisibility && !checkAuraVisibility(sourceToken, currentToken)) continue;

        // Prevent duplicate processing
        const key = `${effect.id}-${currentToken.id}-turnStart`;
        if (_auraAffectedThisTurn.has(key)) continue;
        _auraAffectedThisTurn.set(key, true);

        console.log(`shadowdark-extras | Aura turnStart for ${currentToken.name} in ${sourceToken.name}'s aura`);
        await applyAuraEffect(sourceToken, currentToken, 'turnStart', config, effect);
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
 * Apply aura effect to a token
 * @param {Token} sourceToken - The aura source
 * @param {Token} targetToken - The affected token
 * @param {string} trigger - The trigger type
 * @param {Object} config - The aura configuration
 * @param {ActiveEffect} auraEffect - The source aura effect
 */
export async function applyAuraEffect(sourceToken, targetToken, trigger, config, auraEffect) {
    // If not GM, execute via socket to avoid permission issues
    if (!game.user.isGM) {
        const socket = getSocket();
        if (socket) {
            console.log("shadowdark-extras | applyAuraEffect: Player client, executing via GM socket");
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

    const actor = targetToken.actor;
    if (!actor) {
        console.log("shadowdark-extras | applyAuraEffect: No actor on token");
        return;
    }

    console.log("shadowdark-extras | applyAuraEffect:", {
        source: sourceToken.name,
        target: targetToken.name,
        trigger: trigger,
        config: config
    });

    // Get auto-apply settings
    let autoApplyDamage = true;
    let autoApplyConditions = true;
    try {
        const settings = game.settings.get(MODULE_ID, "combatSettings") || {};
        autoApplyDamage = settings.damageCard?.autoApplyDamage ?? true;
        autoApplyConditions = settings.damageCard?.autoApplyConditions ?? true;
        console.log("shadowdark-extras | applyAuraEffect: autoApplyDamage =", autoApplyDamage, ", autoApplyConditions =", autoApplyConditions);
    } catch (e) {
        console.log("shadowdark-extras | applyAuraEffect: Could not get settings, using defaults");
    }

    // Apply effects/conditions immediately if autoApplyConditions is on (regardless of damage setting)
    if (autoApplyConditions && config.effects?.length > 0) {
        console.log("shadowdark-extras | applyAuraEffect: Auto-applying conditions to", targetToken.name);
        await applyAuraConditions(auraEffect, targetToken, config.effects);
    }

    // If auto-apply damage is OFF, create interactive card for damage
    if (!autoApplyDamage) {
        console.log("shadowdark-extras | applyAuraEffect: autoApplyDamage OFF, creating interactive card");
        await createInteractiveAuraCard(sourceToken, targetToken, trigger, config, auraEffect);

        // Still run item macro
        if (config.runItemMacro && config.spellId) {
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
        console.log("shadowdark-extras | applyAuraEffect: Rolling save DC", config.save.dc);
        saveResult = await rollAuraSave(actor, config.save);
        savedSuccessfully = saveResult.success;
        console.log("shadowdark-extras | applyAuraEffect: Save result:", savedSuccessfully ? "SUCCESS" : "FAILED");

        if (savedSuccessfully && !config.save.halfOnSuccess) {
            console.log("shadowdark-extras | applyAuraEffect: Save negates, returning early");
            await createAuraEffectMessage(sourceToken, targetToken, trigger, {
                saved: true,
                saveResult: saveResult,
                auraName: auraEffect.name
            });
            return;
        }
    }

    // Apply damage if configured
    console.log("shadowdark-extras | applyAuraEffect: Checking damage formula:", config.damage?.formula);
    if (config.damage?.formula) {
        console.log("shadowdark-extras | applyAuraEffect: Applying damage with formula:", config.damage.formula);
        damageApplied = await applyAuraDamage(targetToken, config, savedSuccessfully);
        console.log("shadowdark-extras | applyAuraEffect: Damage applied:", damageApplied);
    } else {
        console.log("shadowdark-extras | applyAuraEffect: No damage formula configured");
    }

    // Apply effects if configured and not saved
    console.log("shadowdark-extras | applyAuraEffect: Effects check:", {
        effects: config.effects,
        effectsLength: config.effects?.length,
        savedSuccessfully: savedSuccessfully
    });
    if (config.effects?.length > 0 && !savedSuccessfully) {
        console.log("shadowdark-extras | applyAuraEffect: Applying conditions to", targetToken.name);
        await applyAuraConditions(auraEffect, targetToken, config.effects);
    } else {
        console.log("shadowdark-extras | applyAuraEffect: Skipping conditions (empty or saved)");
    }

    // Run item macro if configured
    if (config.runItemMacro && config.spellId) {
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
        console.log("shadowdark-extras | applyAuraDamage: No actor found for token", token.name);
        return 0;
    }

    console.log("shadowdark-extras | applyAuraDamage: Rolling damage", config.damage.formula);
    const roll = await new Roll(config.damage.formula).evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    let damage = roll.total;

    console.log("shadowdark-extras | applyAuraDamage: Rolled", damage, "damage");

    // Half damage if saved
    if (savedSuccessfully && config.save?.halfOnSuccess) {
        damage = Math.floor(damage / 2);
        console.log("shadowdark-extras | applyAuraDamage: Halved to", damage);
    }

    // Apply to HP
    const currentHp = actor.system?.attributes?.hp?.value ?? 0;
    const newHp = Math.max(0, currentHp - damage);

    console.log(`shadowdark-extras | applyAuraDamage: Applying to ${actor.name} (${actor.type}). Link: ${token.document.actorLink}`);
    console.log(`shadowdark-extras | applyAuraDamage: HP Calc: ${currentHp} - ${damage} = ${newHp}`);

    try {
        await actor.update({ "system.attributes.hp.value": newHp });
        console.log("shadowdark-extras | applyAuraDamage: Successfully updated HP for", actor.name);
    } catch (err) {
        console.error("shadowdark-extras | applyAuraDamage: Error updating HP:", err);
    }

    return damage;
}

/**
 * Apply condition effects from an aura
 */
export async function applyAuraConditions(auraEffect, token, effectUuids) {
    console.log(`shadowdark-extras | applyAuraConditions: Called with`, {
        auraEffectName: auraEffect?.name,
        tokenName: token?.name,
        effectUuids: effectUuids
    });

    const actor = token.actor;
    if (!actor) return;

    for (const effectUuid of effectUuids) {
        try {
            const effectDoc = await fromUuid(effectUuid);
            if (!effectDoc) {
                console.log(`shadowdark-extras | applyAuraConditions: Could not find effect for UUID ${effectUuid}`);
                continue;
            }

            console.log(`shadowdark-extras | applyAuraConditions: Found effect`, {
                name: effectDoc.name,
                type: effectDoc.type,
                documentType: effectDoc.constructor.name
            });

            // Check if already has this effect from this aura (by name + aura origin flag)
            const existingItem = actor.items.find(i =>
                i.type === "Effect" &&
                i.name === effectDoc.name &&
                i.flags?.[MODULE_ID]?.auraOrigin === auraEffect.id
            );

            if (existingItem) {
                console.log(`shadowdark-extras | applyAuraConditions: Already has effect ${effectDoc.name}, skipping`);
                continue;
            }

            // Create the Effect Item on the actor (not ActiveEffect!)
            // This is the correct approach for Shadowdark - Effect Items have embedded ActiveEffects
            // with transfer: true that Foundry automatically applies to the actor
            const effectData = effectDoc.toObject();
            effectData.flags = effectData.flags || {};
            effectData.flags[MODULE_ID] = effectData.flags[MODULE_ID] || {};
            effectData.flags[MODULE_ID].auraOrigin = auraEffect.id;

            await actor.createEmbeddedDocuments("Item", [effectData]);
            console.log(`shadowdark-extras | Applied aura effect ${effectDoc.name} to ${token.name}`);
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
            console.log("shadowdark-extras | removeAuraEffectsFromToken: Player client, executing via GM socket");
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
    console.log(`shadowdark-extras | removeAuraEffectsFromToken: Searching for items with auraOrigin=${auraEffect.id} on ${token.name}`);
    const itemsToRemove = actor.items.filter(i =>
        i.type === "Effect" &&
        i.flags?.[MODULE_ID]?.auraOrigin === auraEffect.id
    );

    if (itemsToRemove.length > 0) {
        const ids = itemsToRemove.map(i => i.id);
        console.log(`shadowdark-extras | removeAuraEffectsFromToken: Found ${ids.length} items to remove:`, itemsToRemove.map(i => i.name));
        await actor.deleteEmbeddedDocuments("Item", ids);
        console.log(`shadowdark-extras | Removed ${ids.length} aura effect items from ${token.name}`);
    } else {
        console.log(`shadowdark-extras | No matching aura effects found for origin ${auraEffect.id} on ${token.name}`);
    }
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

        console.log(`shadowdark-extras | Running aura item macro for ${spellItem.name} on ${targetToken.name}`);

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
                    disposition: auraConfig.disposition || 'all',
                    includeSelf: auraConfig.includeSelf || false,
                    checkVisibility: auraConfig.checkVisibility || false,
                    runItemMacro: auraConfig.runItemMacro || false,
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

    console.log(`shadowdark-extras | Created aura effect on ${actor.name}`);

    // Process initial tokens in aura range (apply effects immediately on creation)
    // IMPORTANT: Use canvas.tokens.placeables to get Token objects (with .center), NOT actor.token (TokenDocument)
    const sourceToken = canvas.tokens.placeables.find(t => t.actor?.id === actor.id);
    if (sourceToken && auraConfig.triggers?.onEnter) {
        console.log(`shadowdark-extras | Processing initial tokens in aura range for ${sourceToken.name}`);

        const config = {
            radius: auraConfig.radius || 30,
            triggers: auraConfig.triggers || {},
            damage: auraConfig.damage || {},
            save: auraConfig.save || {},
            effects: auraConfig.effects || [],
            animation: auraConfig.animation || {},
            disposition: auraConfig.disposition || 'all',
            includeSelf: auraConfig.includeSelf || false,
            checkVisibility: auraConfig.checkVisibility || false,
            runItemMacro: auraConfig.runItemMacro || false,
            spellId: sourceItem.id
        };

        // Get all tokens in scene
        console.log(`shadowdark-extras | Initial aura processing: radius=${config.radius}, checkVisibility=${config.checkVisibility}`);

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
                console.log(`shadowdark-extras | Initial aura processing: Skipping ${otherToken.name} - invalid disposition`);
                continue;
            }

            // 4. Visibility Check
            if (config.checkVisibility) {
                const isVisible = checkAuraVisibility(sourceToken, otherToken);
                if (!isVisible) {
                    console.log(`shadowdark-extras | Initial aura processing: Skipping ${otherToken.name} - NOT in LOS`);
                    continue;
                }
            }

            console.log(`shadowdark-extras | Initial aura processing: applying to ${otherToken.name}`);
            await applyAuraEffect(sourceToken, otherToken, 'enter', config, effect);
        }
    } else if (!sourceToken) {
        console.log(`shadowdark-extras | Could not find source token on canvas for ${actor.name}`);
    }

    return effect;
}

/**
 * Create visual animation for aura (using Sequencer if available)
 */
async function createAuraAnimation(token, effect, config) {
    if (typeof Sequencer === 'undefined') {
        console.log("shadowdark-extras | Sequencer not available, skipping aura animation");
        return;
    }

    const animation = config.animation || {};
    const radius = config.radius || 30;
    const tint = animation.tint || '#ffffff';
    const style = animation.style || 'circle';
    const opacity = animation.opacity ?? 0.6;
    const scaleMultiplier = animation.scaleMultiplier ?? 1.0;

    // Calculate scale based on radius (radius in grid squares)
    const gridDistance = canvas.scene.grid.distance || 5;
    const radiusInSquares = radius / gridDistance;
    // Apply user scale multiplier
    const finalScale = radiusInSquares * scaleMultiplier;

    // Select animation file based on style
    let animationFile;
    switch (style) {
        case 'darkness':
            animationFile = 'jb2a.darkness.black';
            break;
        case 'pulse':
            animationFile = 'jb2a.template_circle.out_pulse.01.burst.bluewhite';
            break;
        case 'glow':
            animationFile = 'jb2a.extras.tmfx.outpulse.circle.01.normal';
            break;
        case 'circle':
        default:
            animationFile = 'jb2a.template_circle.aura.01.complete.small.blue';
            break;
    }

    console.log(`shadowdark-extras | Creating aura animation: style=${style}, file=${animationFile}, opacity=${opacity}, scale=${finalScale}`);

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

    console.log(`shadowdark-extras | Created aura animation for ${token.name}`);
}
