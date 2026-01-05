/**
 * Template Effects System for Shadowdark Extras
 * Handles damage and effects for tokens inside spell templates
 * 
 * Triggers:
 * - onEnter: When a token moves into a template
 * - onTurnStart: At the start of a token's turn while inside
 * - onTurnEnd: At the end of a token's turn while inside
 * - onLeave: When a token leaves a template (removes effects)
 */

const MODULE_ID = "shadowdark-extras";

// Track previous token positions for movement detection
const _previousTokenPositions = new Map();

// Track which tokens have been affected this combat turn (to prevent duplicates)
const _affectedThisTurn = new Map();

/**
 * Initialize the template effects system
 * Call this from the main module during 'ready' hook
 */
export function initTemplateEffects() {
    console.log("shadowdark-extras | Initializing Template Effects System");

    // Hook for token movement detection
    Hooks.on("preUpdateToken", (tokenDoc, changes, options, userId) => {
        // Store previous position before update
        if (changes.x !== undefined || changes.y !== undefined) {
            _previousTokenPositions.set(tokenDoc.id, {
                x: tokenDoc.x,
                y: tokenDoc.y
            });
        }
    });

    Hooks.on("updateToken", async (tokenDoc, changes, options, userId) => {
        // Only process position changes
        if (changes.x === undefined && changes.y === undefined) return;

        // Only run on GM client to prevent duplicate processing
        if (!game.user.isGM) return;

        await processTokenMovement(tokenDoc);
    });

    // Hook for template creation - store initial contained tokens
    Hooks.on("createMeasuredTemplate", async (templateDoc, options, userId) => {
        if (!game.user.isGM) return;

        // Small delay to ensure template is fully rendered
        await new Promise(r => setTimeout(r, 100));

        const tokens = getTokensInTemplate(templateDoc);
        if (tokens.length > 0) {
            await templateDoc.setFlag(MODULE_ID, 'containedTokens', tokens.map(t => t.id));
            console.log(`shadowdark-extras | Template created with ${tokens.length} tokens inside`);
        }
    });

    // Hook for template deletion - clean up effects
    Hooks.on("deleteMeasuredTemplate", async (templateDoc, options, userId) => {
        if (!game.user.isGM) return;

        const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
        if (!config?.enabled) return;

        // If template has onLeave trigger, remove effects from all contained tokens
        if (config.triggers?.onLeave) {
            const containedTokenIds = templateDoc.flags?.[MODULE_ID]?.containedTokens || [];
            for (const tokenId of containedTokenIds) {
                const token = canvas.tokens?.get(tokenId);
                if (token) {
                    await removeTemplateEffects(templateDoc, token);
                }
            }
        }
    });

    // Clear per-turn tracking and process turn-based effects when combat advances
    Hooks.on("updateCombat", async (combat, changes, options, userId) => {
        // Clear tracking on any turn change
        if (changes.turn !== undefined || changes.round !== undefined) {
            _affectedThisTurn.clear();
        }

        // Only process turn changes, and only on GM client
        if (!game.user.isGM) return;
        if (changes.turn === undefined && changes.round === undefined) return;

        // Check for expired templates and delete them FIRST (only on round changes)
        // This must happen BEFORE turn processing so no token gets an extra hit from an expired template
        if (changes.round !== undefined) {
            const currentRound = combat.round;
            const templatesToDelete = [];
            const expiringMessages = [];

            // Check all templates on the scene for expiry
            // Use < instead of <= so template lasts THROUGH the expiry round (delete at start of next round)
            for (const template of canvas.scene.templates) {
                const expiry = template.flags?.[MODULE_ID]?.templateExpiry;
                if (expiry && expiry.expiryRound < currentRound) {
                    templatesToDelete.push(template.id);
                    expiringMessages.push(`<b>${expiry.spellName}</b> template has expired!`);
                    console.log(`shadowdark-extras | Template ${expiry.spellName} expired at round ${currentRound} (was set to expire after round ${expiry.expiryRound})`);
                }
            }

            // Delete expired templates
            if (templatesToDelete.length > 0) {
                try {
                    await canvas.scene.deleteEmbeddedDocuments("MeasuredTemplate", templatesToDelete);
                    console.log(`shadowdark-extras | Deleted ${templatesToDelete.length} expired template(s)`);
                } catch (err) {
                    console.error("shadowdark-extras | Error deleting expired templates:", err);
                }

                // Send chat message about expired templates
                if (expiringMessages.length > 0) {
                    const content = `
                        <div class="sdx-template-expiry">
                            <h4 style="margin: 0 0 6px 0; border-bottom: 1px solid #666; padding-bottom: 4px;">
                                <i class="fas fa-crosshairs"></i> Template Expiry
                            </h4>
                            <ul style="margin: 0; padding-left: 16px; list-style-type: none;">
                                ${expiringMessages.map(m => `<li style="margin: 2px 0;">${m}</li>`).join('')}
                            </ul>
                        </div>
                    `;
                    ChatMessage.create({
                        content: content,
                        whisper: [game.user.id] // Whisper to GM only
                    });
                }
            }
        }

        // Process turn end for previous combatant
        if (combat.previous?.combatantId) {
            const prevCombatant = combat.combatants.get(combat.previous.combatantId);
            if (prevCombatant?.token) {
                await processTemplateTurnEffects(prevCombatant.token, 'turnEnd');
            }
        }

        // Process turn start for current combatant
        if (combat.current?.combatantId) {
            const currentCombatant = combat.combatants.get(combat.current.combatantId);
            if (currentCombatant?.token) {
                await processTemplateTurnEffects(currentCombatant.token, 'turnStart');
            }
        }
    });

    // Hook for chat message buttons (Roll Save, Apply Damage)
    Hooks.on("renderChatMessage", (message, html, data) => {
        // Handle Roll Save buttons
        html.find('.sdx-template-roll-save-btn').on('click', async (event) => {
            event.preventDefault();
            const btn = event.currentTarget;
            const $btn = $(btn);

            // Disable all save buttons immediately
            const $allSaveBtns = html.find('.sdx-template-roll-save-btn');
            if ($btn.prop('disabled')) return;
            $allSaveBtns.prop('disabled', true);

            const tokenId = btn.dataset.tokenId;
            const actorId = btn.dataset.actorId;
            const ability = btn.dataset.ability;
            const dc = parseInt(btn.dataset.dc);
            const halfOnSuccess = btn.dataset.halfOnSuccess === 'true';
            const rollMode = btn.dataset.rollMode || 'normal';

            // Get the actor
            let actor = null;
            const token = canvas.tokens?.get(tokenId);
            if (token?.actor) {
                actor = token.actor;
            } else if (actorId) {
                actor = game.actors.get(actorId);
            }

            if (!actor) {
                ui.notifications.error("Could not find actor");
                $allSaveBtns.prop('disabled', false);
                return;
            }

            // Roll the save with the selected mode
            const saveResult = await rollTemplateSave(actor, { ability, dc, rollMode });

            // Update to show result - replace the button container
            const saveText = saveResult.success ? "✓ SAVED" : "✗ FAILED";
            const rollModeText = rollMode === 'advantage' ? ' (Adv)' : rollMode === 'disadvantage' ? ' (Dis)' : '';
            const dieResult = saveResult.dieResults || saveResult.roll?.dice?.[0]?.results?.[0]?.result || "?";
            const modifier = saveResult.modifier ?? 0;
            const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

            // Replace all buttons with the result
            $allSaveBtns.parent().replaceWith(`
                <div style="padding: 4px; text-align: center; background: #1a1a1a; border-radius: 3px;">
                    <p style="margin: 2px 0; font-size: 12px;">
                        Roll${rollModeText}: <strong>${dieResult}</strong> ${modifierStr} = <strong>${saveResult.total}</strong> vs DC ${dc}
                    </p>
                    <p style="margin: 2px 0; font-size: 13px;"><strong>${saveText}</strong></p>
                </div>
            `);

            // If save succeeded with halfOnSuccess, update the damage buttons
            if (saveResult.success && halfOnSuccess) {
                const $fullBtn = html.find('.sdx-template-apply-damage-btn');
                $fullBtn.hide();
                html.find('.sdx-template-apply-half-damage-btn').css('background', '#3a5a3a');
            } else if (!saveResult.success) {
                // Failed save - hide half damage button
                html.find('.sdx-template-apply-half-damage-btn').hide();
            }
        });

        // Handle Apply Damage buttons
        html.find('.sdx-template-apply-damage-btn, .sdx-template-apply-half-damage-btn').on('click', async (event) => {
            event.preventDefault();
            const btn = event.currentTarget;
            const $btn = $(btn);

            // Disable button immediately  
            if ($btn.prop('disabled') || $btn.hasClass('sdx-applied')) return;
            $btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Applying...');

            const tokenId = btn.dataset.tokenId;
            const actorId = btn.dataset.actorId;
            const damage = parseInt(btn.dataset.damage);
            const damageType = btn.dataset.damageType;
            const actorName = btn.dataset.actorName;

            if (isNaN(damage)) {
                $btn.prop('disabled', false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
                return;
            }

            try {
                // Get the token and apply damage
                const token = canvas.tokens?.get(tokenId);
                let actor = token?.actor;
                if (!actor && actorId) {
                    actor = game.actors.get(actorId);
                }

                if (!actor) {
                    ui.notifications.error("Could not find target");
                    $btn.prop('disabled', false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
                    return;
                }

                const currentHp = actor.system?.attributes?.hp?.value ?? 0;
                const newHp = Math.max(0, currentHp - damage);
                await actor.update({ "system.attributes.hp.value": newHp });

                // Update button to show applied
                $btn.addClass('sdx-applied').html(`<i class="fas fa-check"></i> Applied ${damage}`);

                // Hide other damage buttons
                html.find('.sdx-template-apply-damage-btn, .sdx-template-apply-half-damage-btn').not($btn).hide();

                ui.notifications.info(`Applied ${damage} ${damageType} damage to ${actorName}`);
            } catch (err) {
                console.error("shadowdark-extras | Error applying template damage:", err);
                $btn.prop('disabled', false).html('<i class="fas fa-heart-broken"></i> Apply Damage');
            }
        });
    });

    console.log("shadowdark-extras | Template Effects System initialized");
}

/**
 * Process template effects for combat turn changes
 * Call this from the updateCombat hook in CombatSettingsSD.mjs
 * @param {TokenDocument} tokenDoc - The token whose turn it is
 * @param {string} trigger - 'turnStart' or 'turnEnd'
 */
export async function processTemplateTurnEffects(tokenDoc, trigger) {
    if (!tokenDoc || !game.user.isGM) return;

    const token = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (!token) return;

    const templates = getTemplatesContainingToken(token);

    for (const templateDoc of templates) {
        const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
        if (!config?.enabled) continue;

        // Check if this trigger is enabled
        const triggerKey = trigger === 'turnStart' ? 'onTurnStart' : 'onTurnEnd';
        if (!config.triggers?.[triggerKey]) continue;

        // Check per-turn duplicate prevention
        const turnKey = `${templateDoc.id}-${tokenDoc.id}-${trigger}`;
        if (_affectedThisTurn.has(turnKey)) continue;
        _affectedThisTurn.set(turnKey, true);

        console.log(`shadowdark-extras | Template ${trigger} trigger for ${token.name} in ${config.spellName || 'template'}`);

        await applyTemplateEffect(templateDoc, token, trigger);
    }
}

/**
 * Process token movement for enter/leave detection
 * @param {TokenDocument} tokenDoc - The token that moved
 */
async function processTokenMovement(tokenDoc) {
    const previousPos = _previousTokenPositions.get(tokenDoc.id);
    _previousTokenPositions.delete(tokenDoc.id);

    if (!previousPos) return;

    const token = tokenDoc.object || canvas.tokens?.get(tokenDoc.id);
    if (!token) return;

    // Get templates at old and new positions
    const oldTemplates = getTemplatesAtPosition(previousPos.x, previousPos.y, tokenDoc.parent);
    const newTemplates = getTemplatesContainingToken(token);

    // Find entered templates
    const enteredTemplates = newTemplates.filter(t => !oldTemplates.some(ot => ot.id === t.id));

    // Find left templates  
    const leftTemplates = oldTemplates.filter(t => !newTemplates.some(nt => nt.id === t.id));

    // Process entered templates
    for (const templateDoc of enteredTemplates) {
        const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
        if (!config?.enabled) continue;

        if (config.triggers?.onEnter) {
            console.log(`shadowdark-extras | Token ${token.name} entered template ${config.spellName || 'template'}`);
            await applyTemplateEffect(templateDoc, token, 'enter');
        }

        // Update contained tokens list
        const contained = templateDoc.flags?.[MODULE_ID]?.containedTokens || [];
        if (!contained.includes(tokenDoc.id)) {
            await templateDoc.setFlag(MODULE_ID, 'containedTokens', [...contained, tokenDoc.id]);
        }
    }

    // Process left templates
    for (const templateDoc of leftTemplates) {
        const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
        if (!config?.enabled) continue;

        if (config.triggers?.onLeave) {
            console.log(`shadowdark-extras | Token ${token.name} left template ${config.spellName || 'template'}`);
            await removeTemplateEffects(templateDoc, token);
        }

        // Update contained tokens list
        const contained = templateDoc.flags?.[MODULE_ID]?.containedTokens || [];
        await templateDoc.setFlag(MODULE_ID, 'containedTokens', contained.filter(id => id !== tokenDoc.id));
    }
}

/**
 * Apply template effect (damage and/or conditions) to a token
 * Respects the autoApplyDamage combat setting
 * @param {MeasuredTemplateDocument} templateDoc - The template
 * @param {Token} token - The token to affect
 * @param {string} trigger - The trigger type ('enter', 'turnStart', 'turnEnd')
 */
async function applyTemplateEffect(templateDoc, token, trigger) {
    const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
    if (!config) return;

    const actor = token.actor;
    if (!actor) return;

    // Check if caster's token - exclude if configured
    if (config.excludeCaster && token.document?.id === config.casterTokenId) {
        console.log(`shadowdark-extras | Excluding caster from template effect`);
        return;
    }

    // Get auto-apply setting
    let autoApplyDamage = true;
    try {
        const settings = game.settings.get(MODULE_ID, "combatSettings") || {};
        autoApplyDamage = settings.damageCard?.autoApplyDamage ?? true;
    } catch (e) {
        // Settings may not exist
    }

    // If auto-apply is OFF, create interactive card
    if (!autoApplyDamage) {
        await createInteractiveTemplateCard(templateDoc, token, trigger, config);

        // Still run item macro even in interactive mode
        console.log(`shadowdark-extras | Macro check (interactive): runItemMacro=${config.runItemMacro}, spellId=${config.spellId}`);
        if (config.runItemMacro && config.spellId) {
            await runTemplateItemMacro(templateDoc, token, trigger, config);
        }
        return;
    }

    // Auto-apply mode: roll saves and apply damage automatically
    let damageApplied = 0;
    let savedSuccessfully = false;
    let saveResult = null;
    let halfDamage = false;

    // Handle save if configured
    if (config.save?.enabled && config.save?.dc) {
        // Roll save for the token
        saveResult = await rollTemplateSave(actor, config.save);
        savedSuccessfully = saveResult.success;

        if (savedSuccessfully && !config.save.halfOnSuccess) {
            // Full save negates - skip damage and effects
            await createTemplateEffectMessage(templateDoc, token, trigger, {
                saved: true,
                saveResult: saveResult
            });
            return;
        }

        // Mark if half damage will be applied
        if (savedSuccessfully && config.save.halfOnSuccess) {
            halfDamage = true;
        }
    }

    // Apply damage if configured
    if (config.damage?.formula) {
        const damageResult = await applyTemplateDamage(templateDoc, token, config, savedSuccessfully);
        damageApplied = damageResult.damage;
    }

    // Apply effects if configured
    if (config.effects?.length > 0 && !savedSuccessfully) {
        await applyTemplateConditions(templateDoc, token, config.effects);
    }

    // Run item macro if configured
    console.log(`shadowdark-extras | Macro check: runItemMacro=${config.runItemMacro}, spellId=${config.spellId}`);
    if (config.runItemMacro && config.spellId) {
        await runTemplateItemMacro(templateDoc, token, trigger, config);
    }

    // Create chat message
    await createTemplateEffectMessage(templateDoc, token, trigger, {
        damage: damageApplied,
        saved: savedSuccessfully,
        saveResult: saveResult,
        halfDamage: halfDamage,
        damageType: config.damage?.type
    });
}

/**
 * Create an interactive template effect card with buttons
 * Used when autoApplyDamage is OFF
 */
async function createInteractiveTemplateCard(templateDoc, token, trigger, config) {
    const spellName = config?.spellName || "Template";
    const actor = token.actor;

    const triggerText = {
        enter: "entered",
        turnStart: "started turn in",
        turnEnd: "ended turn in"
    }[trigger] || trigger;

    const abilityNames = {
        str: "Strength", dex: "Dexterity", con: "Constitution",
        int: "Intelligence", wis: "Wisdom", cha: "Charisma"
    };

    // Roll damage formula to show what damage would be
    let damageRoll = null;
    let damageTotal = 0;
    if (config.damage?.formula) {
        const rollData = {
            level: actor?.system?.level?.value || 1,
            ...actor?.getRollData?.() || {}
        };
        damageRoll = await new Roll(config.damage.formula, rollData).evaluate();

        // Show 3D dice animation if Dice So Nice is available
        if (game.dice3d) {
            await game.dice3d.showForRoll(damageRoll, game.user, true);
        }

        damageTotal = damageRoll.total;
    }


    let content = `
        <div class="sdx-template-effect-card" style="background: #1a1a1a; border: 1px solid #333; border-radius: 4px; padding: 10px; color: #e0e0e0;">
            <div style="border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 8px;">
                <strong style="font-size: 14px;">${spellName}</strong>
            </div>
            <p style="margin: 0 0 8px 0; font-size: 12px;">
                <strong>${token.name}</strong> ${triggerText} the area
            </p>
    `;

    // Show save info if save is configured
    if (config.save?.enabled && config.save?.dc) {
        const abilityName = abilityNames[config.save.ability] || config.save.ability;
        const btnBaseStyle = `flex: 1; color: #fff; border: 1px solid #555; padding: 6px 4px; cursor: pointer; border-radius: 3px; font-size: 11px;`;
        content += `
            <style>
                .sdx-save-btn-adv:hover { background: #2a4a2a !important; }
                .sdx-save-btn-normal:hover { background: #4a4a4a !important; }
                .sdx-save-btn-dis:hover { background: #4a2a2a !important; }
            </style>
            <div style="background: #252525; border: 1px solid #333; border-radius: 3px; padding: 8px; margin-bottom: 8px;">
                <p style="margin: 0 0 6px 0; font-size: 11px; color: #aaa;">
                    <i class="fas fa-shield-alt" style="margin-right: 4px;"></i>${abilityName} Save DC ${config.save.dc}
                </p>
                <div style="display: flex; gap: 4px;">
                    <button type="button" class="sdx-template-roll-save-btn sdx-save-btn-adv" 
                        data-token-id="${token.document?.id || token.id}"
                        data-actor-id="${actor?.id}"
                        data-ability="${config.save.ability}"
                        data-dc="${config.save.dc}"
                        data-half-on-success="${config.save.halfOnSuccess}"
                        data-roll-mode="advantage"
                        style="${btnBaseStyle} background: #2a3a2a;">
                        <i class="fas fa-angle-double-up"></i> Adv
                    </button>
                    <button type="button" class="sdx-template-roll-save-btn sdx-save-btn-normal" 
                        data-token-id="${token.document?.id || token.id}"
                        data-actor-id="${actor?.id}"
                        data-ability="${config.save.ability}"
                        data-dc="${config.save.dc}"
                        data-half-on-success="${config.save.halfOnSuccess}"
                        data-roll-mode="normal"
                        style="${btnBaseStyle} background: #3a3a3a;">
                        <i class="fas fa-dice-d20"></i> Roll
                    </button>
                    <button type="button" class="sdx-template-roll-save-btn sdx-save-btn-dis" 
                        data-token-id="${token.document?.id || token.id}"
                        data-actor-id="${actor?.id}"
                        data-ability="${config.save.ability}"
                        data-dc="${config.save.dc}"
                        data-half-on-success="${config.save.halfOnSuccess}"
                        data-roll-mode="disadvantage"
                        style="${btnBaseStyle} background: #3a2a2a;">
                        <i class="fas fa-angle-double-down"></i> Dis
                    </button>
                </div>
            </div>
        `;
    }

    // Show damage info with apply button
    if (damageRoll) {
        const typeText = config.damage?.type ? ` ${config.damage.type}` : "";
        content += `
            <div style="background: #252525; border: 1px solid #333; border-radius: 3px; padding: 8px;">
                <p style="margin: 0 0 4px 0; font-size: 13px;">
                    <i class="fas fa-heart-broken" style="color: #c44; margin-right: 4px;"></i>
                    <strong>${damageTotal}</strong>${typeText}
                </p>
                <p style="margin: 0 0 8px 0; font-size: 10px; color: #888;">${config.damage.formula} = ${damageRoll.result}</p>
                <button type="button" class="sdx-template-apply-damage-btn" 
                    data-token-id="${token.document?.id || token.id}"
                    data-actor-id="${actor?.id}"
                    data-damage="${damageTotal}"
                    data-damage-type="${config.damage?.type || 'damage'}"
                    data-actor-name="${actor?.name || token.name}"
                    style="width: 100%; background: #533; color: #fff; border: 1px solid #744; padding: 6px; cursor: pointer; border-radius: 3px; margin-bottom: 4px;">
                    <i class="fas fa-heart-broken"></i> Apply ${damageTotal} Damage
                </button>
                <button type="button" class="sdx-template-apply-half-damage-btn" 
                    data-token-id="${token.document?.id || token.id}"
                    data-actor-id="${actor?.id}"
                    data-damage="${Math.floor(damageTotal / 2)}"
                    data-damage-type="${config.damage?.type || 'damage'}"
                    data-actor-name="${actor?.name || token.name}"
                    style="width: 100%; background: #353; color: #fff; border: 1px solid #474; padding: 6px; cursor: pointer; border-radius: 3px;">
                    <i class="fas fa-shield-alt"></i> Apply ${Math.floor(damageTotal / 2)} (Half)
                </button>
            </div>
        `;
    }

    content += `</div>`;

    // Create message with flags for button handlers
    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor }),
        flags: {
            [MODULE_ID]: {
                isTemplateEffectCard: true,
                templateId: templateDoc.id,
                tokenId: token.document?.id || token.id,
                actorId: actor?.id,
                config: config,
                damageTotal: damageTotal,
                trigger: trigger
            }
        }
    });
}

/**
 * Apply damage from a template to a token
 */
async function applyTemplateDamage(templateDoc, token, config, savedSuccessfully) {
    const actor = token.actor;
    if (!actor) return { damage: 0 };

    let formula = config.damage.formula;

    // Build roll data
    const rollData = {
        level: actor.system?.level?.value || 1,
        ...actor.getRollData?.() || {}
    };

    // Roll the damage
    const roll = await new Roll(formula, rollData).evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    let damage = roll.total;


    // Half damage on successful save
    if (savedSuccessfully && config.save?.halfOnSuccess) {
        damage = Math.floor(damage / 2);
    }

    // Apply damage to token
    const currentHP = actor.system?.attributes?.hp?.value ?? 0;
    const newHP = Math.max(0, currentHP - damage);
    await actor.update({ "system.attributes.hp.value": newHP });

    console.log(`shadowdark-extras | Applied ${damage} damage to ${token.name} from template`);

    return { damage, roll };
}

/**
 * Roll a save for a token against template effect
 * Supports advantage/disadvantage via rollMode
 */
async function rollTemplateSave(actor, saveConfig) {
    const ability = saveConfig.ability || 'dex';
    const dc = saveConfig.dc || 10;
    const rollMode = saveConfig.rollMode || 'normal';

    // Get ability modifier - handle both PCs and NPCs
    // NPCs in Shadowdark store the modifier directly in .mod
    // PCs store the ability score in .value, and the system calculates .mod
    let modifier = 0;
    const abilityData = actor.system?.abilities?.[ability];

    if (abilityData?.mod !== undefined) {
        // Use the stored modifier (works for NPCs and PCs with calculated mod)
        modifier = abilityData.mod;
    } else if (abilityData?.value !== undefined) {
        // Fallback: calculate from ability score value
        modifier = Math.floor((abilityData.value - 10) / 2);
    }

    // Determine roll formula based on mode
    let formula;
    let dieResults;
    if (rollMode === 'advantage') {
        formula = `2d20kh + ${modifier}`;
    } else if (rollMode === 'disadvantage') {
        formula = `2d20kl + ${modifier}`;
    } else {
        formula = `1d20 + ${modifier}`;
    }

    // Roll the save
    const roll = await new Roll(formula).evaluate();

    // Show 3D dice animation if Dice So Nice is available
    if (game.dice3d) {
        await game.dice3d.showForRoll(roll, game.user, true);
    }

    const success = roll.total >= dc;


    // Get die results for display
    if (rollMode === 'advantage' || rollMode === 'disadvantage') {
        const results = roll.dice[0]?.results?.map(r => r.result) || [];
        const kept = rollMode === 'advantage' ? Math.max(...results) : Math.min(...results);
        dieResults = `${results.join(', ')} → ${kept}`;
    } else {
        dieResults = roll.dice[0]?.results?.[0]?.result?.toString() || "?";
    }

    console.log(`shadowdark-extras | Save roll (${rollMode}): ${roll.total} vs DC ${dc} - ${success ? 'SUCCESS' : 'FAILURE'}`);

    return {
        success,
        roll,
        total: roll.total,
        dc,
        ability,
        modifier,
        rollMode,
        dieResults
    };
}

/**
 * Run the spell's item macro when template effect triggers
 * @param {MeasuredTemplateDocument} templateDoc - The template document
 * @param {Token} token - The target token
 * @param {string} trigger - The trigger type
 * @param {Object} config - The template effect config
 */
async function runTemplateItemMacro(templateDoc, token, trigger, config) {
    try {
        // Get the caster actor to find the spell
        const casterActor = game.actors.get(config.casterActorId);
        if (!casterActor) {
            console.warn(`shadowdark-extras | Cannot run item macro: caster actor not found`);
            return;
        }

        // Find the spell item
        const spellItem = casterActor.items.get(config.spellId);
        if (!spellItem) {
            console.warn(`shadowdark-extras | Cannot run item macro: spell ${config.spellId} not found on caster`);
            return;
        }

        // Check if Item Macro module is available and spell has a macro
        const itemMacro = spellItem.flags?.["itemacro"]?.macro;
        if (!itemMacro?.command) {
            console.log(`shadowdark-extras | No item macro configured for ${spellItem.name}`);
            return;
        }

        // Get caster token
        const casterToken = config.casterTokenId ? canvas.tokens.get(config.casterTokenId) : null;

        // Build the macro context similar to Item Macro's standard variables
        const speaker = ChatMessage.getSpeaker({ actor: token.actor });
        const character = game.user?.character || null;

        // Build args object with template-specific data
        const args = {
            trigger: trigger,
            templateDoc: templateDoc,
            config: config,
            casterActor: casterActor,
            casterToken: casterToken,
            saved: false,  // Could be passed in if we want to track this
            damageApplied: 0  // Could be passed in if we want to track this
        };

        console.log(`shadowdark-extras | Running item macro for ${spellItem.name} on ${token.name} (trigger: ${trigger})`);

        // Execute the macro
        // Use similar approach to Item Macro module
        const macroBody = `(async () => {
            ${itemMacro.command}
        })();`;

        // Create a function with the macro variables in scope
        const fn = new Function(
            "item", "actor", "token", "speaker", "character", "args",
            `return ${macroBody}`
        );

        await fn.call(
            null,
            spellItem,        // item - the spell
            token.actor,      // actor - the target actor
            token,            // token - the target token
            speaker,          // speaker
            character,        // character
            args              // args - template-specific data
        );

        console.log(`shadowdark-extras | Item macro completed for ${spellItem.name}`);
    } catch (err) {
        console.error(`shadowdark-extras | Error running item macro:`, err);
        ui.notifications.error(`Error running item macro: ${err.message}`);
    }
}

/**
 * Apply condition effects from template
 */
async function applyTemplateConditions(templateDoc, token, effectUuids) {
    const actor = token.actor;
    if (!actor) return;

    for (const effectUuid of effectUuids) {
        try {
            const effectDoc = await fromUuid(effectUuid);
            if (!effectDoc) continue;

            // Check if actor already has this effect from this template
            const existingEffect = actor.items.find(i =>
                i.type === "Effect" &&
                i.flags?.[MODULE_ID]?.templateOrigin === templateDoc.id
            );

            if (existingEffect) continue; // Don't stack

            // Create the effect
            const effectData = effectDoc.toObject();
            effectData.flags = effectData.flags || {};
            effectData.flags[MODULE_ID] = effectData.flags[MODULE_ID] || {};
            effectData.flags[MODULE_ID].templateOrigin = templateDoc.id;

            await actor.createEmbeddedDocuments("Item", [effectData]);
            console.log(`shadowdark-extras | Applied effect ${effectDoc.name} to ${token.name}`);
        } catch (err) {
            console.error(`shadowdark-extras | Error applying effect:`, err);
        }
    }
}

/**
 * Remove effects applied by a template when token leaves
 */
async function removeTemplateEffects(templateDoc, token) {
    const actor = token.actor;
    if (!actor) return;

    // Find effects from this template
    const effectsToRemove = actor.items.filter(i =>
        i.type === "Effect" &&
        i.flags?.[MODULE_ID]?.templateOrigin === templateDoc.id
    );

    if (effectsToRemove.length > 0) {
        const ids = effectsToRemove.map(e => e.id);
        await actor.deleteEmbeddedDocuments("Item", ids);
        console.log(`shadowdark-extras | Removed ${ids.length} template effects from ${token.name}`);
    }
}

/**
 * Create a chat message for template effect
 */
async function createTemplateEffectMessage(templateDoc, token, trigger, result) {
    const config = templateDoc.flags?.[MODULE_ID]?.templateEffects;
    const spellName = config?.spellName || "Template";

    const triggerText = {
        enter: "entered",
        turnStart: "started turn in",
        turnEnd: "ended turn in"
    }[trigger] || trigger;

    // Build ability display name
    const abilityNames = {
        str: "Strength", dex: "Dexterity", con: "Constitution",
        int: "Intelligence", wis: "Wisdom", cha: "Charisma"
    };

    let content = `
        <div class="sdx-template-effect-card" style="border: 2px solid #7b68ee; border-radius: 8px; padding: 8px; background: linear-gradient(135deg, #1a1a2e 0%, #2a2a4a 100%);">
            <h3 style="color: #9370db; margin: 0 0 6px 0;">
                <i class="fas fa-magic"></i> ${spellName}
            </h3>
            <p style="margin: 4px 0; color: #cccccc;">
                <b>${token.name}</b> ${triggerText} the area
            </p>
    `;

    // Show save roll details if save was made
    if (result.saveResult) {
        const sr = result.saveResult;
        const abilityName = abilityNames[sr.ability] || sr.ability;
        const saveColor = sr.success ? "#66ff66" : "#ff6666";
        const saveText = sr.success ? "Save Successful!" : "Save Failed!";

        // Get the die result and use the stored modifier
        const dieResult = sr.roll?.dice?.[0]?.results?.[0]?.result || "?";
        const modifier = sr.modifier ?? 0;
        const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;

        content += `
            <div style="margin: 8px 0; padding: 6px; background: rgba(0,0,0,0.3); border-radius: 4px;">
                <p style="margin: 2px 0; color: #aaa; font-size: 11px;">
                    <i class="fas fa-shield-alt"></i> ${abilityName} Save vs DC ${sr.dc}
                </p>
                <p style="margin: 4px 0; color: #fff; font-size: 14px;">
                    Roll: <span style="color: #ffcc00; font-weight: bold;">${dieResult}</span> 
                    <span style="color: #aaa;">${modifierStr}</span> 
                    = <span style="font-weight: bold;">${sr.total}</span>
                </p>
                <p style="margin: 4px 0; color: ${saveColor}; font-weight: bold;">${saveText}</p>
            </div>
        `;
    }

    // Show damage info with details
    if (result.damage !== undefined && result.damage > 0) {
        const typeText = result.damageType ? ` ${result.damageType}` : "";
        const halfText = result.halfDamage ? " (half)" : "";

        content += `
            <div style="margin: 8px 0; padding: 6px; background: rgba(255,0,0,0.1); border-radius: 4px; border: 1px solid #ff6666;">
                <p style="margin: 2px 0; color: #ff9999;">
                    <i class="fas fa-heart-broken"></i> Damage Applied${halfText}
                </p>
                <p style="margin: 4px 0; color: #ff6666; font-size: 18px; font-weight: bold;">
                    ${result.damage}${typeText}
                </p>
            </div>
        `;
    } else if (result.saved && config?.save?.halfOnSuccess === false) {
        // Save fully negated
        content += `
            <p style="margin: 4px 0; color: #66ff66;">
                <i class="fas fa-shield-alt"></i> Damage negated by save!
            </p>
        `;
    }

    content += `</div>`;

    await ChatMessage.create({
        content,
        speaker: ChatMessage.getSpeaker({ actor: token.actor })
    });
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get all tokens currently inside a template
 * @param {MeasuredTemplateDocument} templateDoc - The template document
 * @returns {Token[]} Array of tokens inside the template
 */
export function getTokensInTemplate(templateDoc) {
    const template = templateDoc.object;
    if (!template?.shape) return [];

    const tokens = [];
    const scene = templateDoc.parent;

    for (const tokenDoc of scene.tokens) {
        const token = tokenDoc.object;
        if (!token) continue;

        // Check if token center is inside template shape
        const localX = token.center.x - template.x;
        const localY = token.center.y - template.y;

        if (template.shape.contains(localX, localY)) {
            tokens.push(token);
        }
    }

    return tokens;
}

/**
 * Get all templates that contain a specific token
 * @param {Token} token - The token to check
 * @returns {MeasuredTemplateDocument[]} Array of template documents
 */
export function getTemplatesContainingToken(token) {
    if (!token || !canvas.scene) return [];

    const templates = [];

    for (const templateDoc of canvas.scene.templates) {
        const template = templateDoc.object;
        if (!template?.shape) continue;

        const localX = token.center.x - template.x;
        const localY = token.center.y - template.y;

        if (template.shape.contains(localX, localY)) {
            templates.push(templateDoc);
        }
    }

    return templates;
}

/**
 * Get templates at a specific position
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Scene} scene - The scene to check
 * @returns {MeasuredTemplateDocument[]} Array of template documents
 */
function getTemplatesAtPosition(x, y, scene) {
    if (!scene) return [];

    const templates = [];
    const gridSize = scene.grid.size || 100;

    // Calculate center of grid square
    const centerX = x + gridSize / 2;
    const centerY = y + gridSize / 2;

    for (const templateDoc of scene.templates) {
        const template = templateDoc.object;
        if (!template?.shape) continue;

        const localX = centerX - template.x;
        const localY = centerY - template.y;

        if (template.shape.contains(localX, localY)) {
            templates.push(templateDoc);
        }
    }

    return templates;
}

/**
 * Store template effect configuration on a template
 * Call this when placing a template from a spell with effects configured
 * @param {MeasuredTemplateDocument} templateDoc - The template
 * @param {Object} config - The effect configuration from the spell
 */
export async function setupTemplateEffectFlags(templateDoc, config) {
    if (!config?.enabled) return;

    await templateDoc.setFlag(MODULE_ID, 'templateEffects', {
        enabled: true,
        spellName: config.spellName || "Spell",
        casterActorId: config.casterActorId,
        casterTokenId: config.casterTokenId,
        triggers: {
            onEnter: config.onEnter || false,
            onTurnStart: config.onTurnStart || false,
            onTurnEnd: config.onTurnEnd || false,
            onLeave: config.onLeave || false
        },
        damage: {
            formula: config.damageFormula || "",
            type: config.damageType || ""
        },
        save: {
            enabled: config.saveEnabled || false,
            dc: config.saveDC || 10,
            ability: config.saveAbility || "dex",
            halfOnSuccess: config.halfOnSuccess || false
        },
        effects: config.effects || [],
        excludeCaster: config.excludeCaster || false,
        runItemMacro: config.runItemMacro || false,
        spellId: config.spellId || null
    });

    // Store initial contained tokens
    const tokens = getTokensInTemplate(templateDoc);
    if (tokens.length > 0) {
        await templateDoc.setFlag(MODULE_ID, 'containedTokens', tokens.map(t => t.id));
    }

    console.log(`shadowdark-extras | Template effect flags set for ${config.spellName}`);
}
