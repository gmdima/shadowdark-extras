/**
 * Wrath Spell Macro
 * 
 * This module contains the Wrath spell implementation for Shadowdark Extras.
 * The Wrath spell empowers ALL weapons with divine wrath, granting +2 to hit and +1d8 damage.
 * On critical success, grants +4 to hit and +2d8 damage.
 */

const MODULE_ID = "shadowdark-extras";

// Import helper functions from identify.mjs
import { isUnidentified, getUnidentifiedName } from "./identify.mjs";

/**
 * Apply Wrath to all of the caster's weapons
 * 
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The Wrath spell item
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 * @param {boolean} isCritical - Optional: Whether the spell was cast with a critical success (grants +4/+2d8 instead of +2/+1d8)
 */
export async function applyWrathToAllWeapons(casterActor, casterItem, originatingUserId = null, isCritical = false) {
    const sdxModule = game.modules.get(MODULE_ID);
    if (!sdxModule?.api) {
        ui.notifications.warn("Module API not available");
        return;
    }

    // Get all weapons
    const allWeapons = casterActor.items.filter(item => item.type === "Weapon");
    if (allWeapons.length === 0) {
        ui.notifications.warn(`${casterActor.name} has no weapons to empower!`);
        return;
    }

    // Check ownership - if not owner and not GM, route to GM
    const needsGMExecution = allWeapons.some(w => !w.isOwner) && !game.user.isGM;
    if (needsGMExecution) {
        if (sdxModule.socket) {
            await sdxModule.socket.executeAsGM(
                "applyWrathToAllWeaponsAsGM",
                casterActor.uuid,
                casterItem.uuid,
                isCritical
            );
            return;
        } else {
            ui.notifications.warn("Cannot empower weapons: No GM connected or socket unavailable.");
            return;
        }
    }

    const hitBonus = isCritical ? "4" : "2";
    const damageBonus = isCritical ? "2d8" : "1d8";

    // Apply bonuses to all weapons
    const weaponUpdates = [];
    for (const weapon of allWeapons) {
        const existingBonus = weapon.getFlag(MODULE_ID, "weaponBonus") || {};

        // Skip if already has Wrath bonus
        const hasWrathBonus = existingBonus.hitBonuses?.some(b => b.label === "Wrath") ||
            existingBonus.damageBonuses?.some(b => b.label === "Wrath");
        if (hasWrathBonus) continue;

        const wrathWeaponBonus = {
            enabled: true,
            hitBonuses: [
                ...(existingBonus.hitBonuses || []),
                { formula: hitBonus, label: "Wrath", exclusive: false, requirements: [] }
            ],
            damageBonuses: [
                ...(existingBonus.damageBonuses || []),
                { formula: damageBonus, label: "Wrath", damageType: "physical", exclusive: false, requirements: [] }
            ],
            damageBonus: existingBonus.damageBonus || "",
            criticalExtraDice: existingBonus.criticalExtraDice || "",
            criticalExtraDamage: existingBonus.criticalExtraDamage || "",
            requirements: existingBonus.requirements || [],
            effects: existingBonus.effects || [],
            itemMacro: existingBonus.itemMacro || { enabled: false, runAsGm: false, triggers: [] }
        };

        const changes = {
            "system.magicItem": true,
            [`flags.${MODULE_ID}.weaponBonus`]: wrathWeaponBonus
        };

        // Register modification for reversion
        await sdxModule.api.registerSpellModification(casterActor, casterItem, weapon, changes, {
            icon: "fas fa-gavel",
            endMessage: "The wrath fades from <strong>{weapon}</strong> on <strong>{actor}</strong>."
        });

        weaponUpdates.push({ weapon, changes });
    }

    // Apply all updates
    for (const { weapon, changes } of weaponUpdates) {
        await weapon.update(changes);
    }

    // Start duration tracking
    const targetToken = casterActor.token || casterActor.getActiveTokens()[0];
    if (targetToken) {
        const activeDuration = sdxModule.api.getActiveDurationSpells ? sdxModule.api.getActiveDurationSpells(casterActor) : [];
        const isTracking = activeDuration.some(d => d.spellId === casterItem.id);

        if (!isTracking) {
            await sdxModule.api.startDurationSpell(casterActor, casterItem, [targetToken.id], {});
        }
    }

    // Sequencer animation
    try {
        if (game.modules.get("sequencer")?.active) {
            const token = casterActor.getActiveTokens()?.[0];
            if (token) {
                new Sequence()
                    .effect()
                    .atLocation(token)
                    .file("jb2a.divine_smite.caster.blueyellow")
                    .scale(0.6)
                    .fadeIn(200)
                    .fadeOut(400)
                    .play();
            }
        }
    } catch (e) {
        console.log(`${MODULE_ID} | Sequencer animation not available: ${e.message}`);
    }

    const criticalText = isCritical ? " (Critical Success!)" : "";
    ui.notifications.info(`All weapons are empowered with Wrath!${criticalText}`);

    // Post chat message
    const duration = casterItem.system?.duration?.value || "?";
    const weaponCount = weaponUpdates.length;
    const criticalBadge = isCritical ? ' <span style="color: gold; font-weight: bold;">[CRITICAL SUCCESS]</span>' : '';

    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-wrath-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${casterItem.img}" alt="Wrath"/>
                    <div class="header-text">
                        <h3><i class="fas fa-gavel"></i> Wrath${criticalBadge}</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> empowers their weapons with Wrath!</p>
                    <p class="spell-effect"><em>${weaponCount} weapon${weaponCount !== 1 ? 's' : ''} become magical, gain +${hitBonus} to hit, and deal +${damageBonus} physical damage for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}

// Legacy function name for backward compatibility - just redirects to the new function
export async function showWrathWeaponDialog(casterActor, casterItem, originatingUserId = null, isCritical = false) {
    await applyWrathToAllWeapons(casterActor, casterItem, originatingUserId, isCritical);
}

// Legacy function for backward compatibility
export async function applyWrathWeapon(weapon, casterActor, casterItem, targetActor, targetToken, isCritical = false) {
    // This function is no longer used, but kept for compatibility
    console.warn(`${MODULE_ID} | applyWrathWeapon is deprecated. Use applyWrathToAllWeapons instead.`);
}
