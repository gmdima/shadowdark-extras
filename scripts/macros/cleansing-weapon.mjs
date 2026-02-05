/**
 * Cleansing Weapon Spell Macro
 * 
 * This module contains the Cleansing Weapon spell implementation for Shadowdark Extras.
 * The Cleansing Weapon spell wreaths a weapon in purifying flames, dealing fire damage.
 */

const MODULE_ID = "shadowdark-extras";

// Import helper functions from identify.mjs
import { isUnidentified, getUnidentifiedName } from "./identify.mjs";

/**
 * Show the Cleansing Weapon spell selection dialog
 * Displays all available weapons on the target actor in a grid with images
 * 
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The Cleansing Weapon spell item
 * @param {Actor} targetActor - The actor whose weapons to show
 * @param {Token} targetToken - The target token (for duration tracking)
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 * @param {boolean} isCritical - Optional: Whether the spell was cast with a critical success (grants 2d4/2d6 instead of 1d4/1d6)
 */
export async function showCleansingWeaponDialog(casterActor, casterItem, targetActor, targetToken, originatingUserId = null, isCritical = false) {
    if (!targetActor) {
        ui.notifications.warn("You must target a creature to cast Cleansing Weapon!");
        return;
    }

    // Check if we need to route this dialog to the originating user
    // This happens when a spell macro runs on the GM's client via runAsGm
    if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.socket) {
            await sdxModule.socket.executeAsUser("showCleansingWeaponDialogForUser", originatingUserId, {
                casterActorId: casterActor.id,
                casterItemId: casterItem.id,
                targetActorId: targetActor.id,
                targetTokenId: targetToken?.id,
                isCritical: isCritical
            });
            return;
        }
    }

    const allWeapons = targetActor.items.filter(item => item.type === "Weapon");
    if (allWeapons.length === 0) {
        ui.notifications.warn(`${targetActor.name} has no weapons!`);
        return;
    }

    // Build dialog content with checkboxes
    const buildWeaponGrid = (includeMagical, includeWithBonuses) => {
        const filteredWeapons = allWeapons.filter(weapon => {
            const bonusData = weapon.getFlag(MODULE_ID, "weaponBonus");
            const hasExistingBonuses = bonusData?.enabled;
            const isMagical = weapon.system?.magicItem || false;

            // 1. Always exclude if it already has THIS spell's bonus
            const hasCleansingBonus = hasExistingBonuses && (
                bonusData?.hitBonuses?.some(b => b.label === "Cleansing Weapon") ||
                bonusData?.damageBonuses?.some(b => b.label === "Cleansing Weapon")
            );
            if (hasCleansingBonus) return false;

            // 2. If it has OTHER bonuses, check includeWithBonuses
            if (hasExistingBonuses) return includeWithBonuses;

            // 3. If it's magical (but no temporary bonuses), check includeMagical
            if (isMagical) return includeMagical;

            // 4. Otherwise it's a normal weapon
            return true;
        });

        if (filteredWeapons.length === 0) {
            return `<div class="sdx-spell-no-items">
                No available weapons.
                <div class="sdx-spell-no-items-hint">Try adjusting the filters above.</div>
            </div>`;
        }

        return filteredWeapons.map(weapon => {
            const img = weapon.img || "icons/svg/sword.svg";
            const bonusData = weapon.getFlag(MODULE_ID, "weaponBonus");
            const hasExistingBonuses = bonusData?.enabled;
            const isMagical = weapon.system?.magicItem || false;

            // Check for unidentified status
            const isUnidentifiedItem = isUnidentified(weapon);
            const displayName = isUnidentifiedItem ? getUnidentifiedName(weapon) : weapon.name;

            let badge = "";
            if (hasExistingBonuses) {
                badge = `<span class="sdx-weapon-badge bonus" title="Has existing bonuses"><i class="fas fa-plus-circle"></i></span>`;
            } else if (isMagical && !isUnidentifiedItem) {
                // Hide magic sparkle if unidentified
                badge = `<span class="sdx-weapon-badge magical" title="Magic Item"><i class="fas fa-sparkles"></i></span>`;
            }

            return `
                <div class="sdx-spell-weapon-item" data-weapon-id="${weapon.id}">
                    <div class="sdx-spell-weapon-img">
                        <img src="${img}" alt="${displayName}">
                        ${badge}
                    </div>
                    <div class="sdx-spell-weapon-name">${displayName}</div>
                </div>
            `;
        }).join("");
    };

    const content = `
        <div class="sdx-spell-weapon-dialog sdx-cleansingweapon-theme">
            <div class="sdx-spell-header">
                <i class="fas fa-fire"></i>
                <span>Choose a weapon to wreath in purifying flames</span>
            </div>
            <div class="sdx-spell-options">
                <label class="sdx-spell-checkbox">
                    <input type="checkbox" name="includeMagical" />
                    <span>Include Magical Weapons</span>
                </label>
                <label class="sdx-spell-checkbox">
                    <input type="checkbox" name="includeWithBonuses" />
                    <span>Include with Bonuses</span>
                </label>
            </div>
            <div class="sdx-spell-weapon-grid">
                ${buildWeaponGrid(false, false)}
            </div>
            <div class="sdx-spell-description">
                <i class="fas fa-info-circle"></i>
                The weapon deals <strong>+${isCritical ? '2d4' : '1d4'} fire damage</strong> (<strong>+${isCritical ? '2d6' : '1d6'} vs. undead</strong>) for the spell's duration.${isCritical ? ' <em>(Critical Success!)</em>' : ''}
            </div>
            <input type="hidden" name="selectedWeaponId" value="">
        </div>
    `;

    const dialog = new foundry.applications.api.DialogV2({
        window: {
            title: "Cleansing Weapon",
            icon: "fas fa-fire"
        },
        content: content,
        buttons: [
            {
                action: "cancel",
                label: "Cancel",
                icon: "fas fa-times"
            },
            {
                action: "cleanse",
                label: "Cleanse Weapon",
                icon: "fas fa-fire",
                default: true,
                callback: async (event, button, dialogApp) => {
                    const selectedId = dialogApp.element.querySelector("input[name='selectedWeaponId']")?.value;
                    if (!selectedId) {
                        ui.notifications.warn("Please select a weapon to cleanse.");
                        return false;
                    }
                    const selectedWeapon = targetActor.items.get(selectedId);
                    if (selectedWeapon) {
                        await applyCleansingWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken, isCritical);
                    }
                    return true;
                }
            }
        ],
        position: {
            width: 500,
            height: "auto"
        }
    });

    dialog.addEventListener("render", (event) => {
        const dialogElement = dialog.element;
        const grid = dialogElement.querySelector(".sdx-spell-weapon-grid");
        const hiddenInput = dialogElement.querySelector("input[name='selectedWeaponId']");
        const checkboxMagical = dialogElement.querySelector("input[name='includeMagical']");
        const checkboxBonuses = dialogElement.querySelector("input[name='includeWithBonuses']");

        const setupItemSelection = () => {
            const items = dialogElement.querySelectorAll(".sdx-spell-weapon-item");
            items.forEach(itemEl => {
                itemEl.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    items.forEach(i => i.classList.remove("selected"));
                    itemEl.classList.add("selected");
                    if (hiddenInput) {
                        hiddenInput.value = itemEl.dataset.weaponId;
                    }
                });
            });
        };

        const updateGrid = () => {
            grid.innerHTML = buildWeaponGrid(checkboxMagical.checked, checkboxBonuses.checked);
            hiddenInput.value = "";
            setupItemSelection();
        };

        setupItemSelection();

        // Handle checkbox toggles
        checkboxMagical?.addEventListener("change", updateGrid);
        checkboxBonuses?.addEventListener("change", updateGrid);
    });

    await dialog.render(true);
}

/**
 * Apply the Cleansing Weapon effect to a weapon
 * 
 * @param {Item} weapon - The weapon to enchant
 * @param {Actor} casterActor - The caster
 * @param {Item} casterItem - The spell item
 * @param {Actor} targetActor - The target owner of the weapon
 * @param {Token} targetToken - The target token
 * @param {boolean} isCritical - Whether the spell was cast with a critical success (grants 2d4/2d6 instead of 1d4/1d6)
 */
export async function applyCleansingWeapon(weapon, casterActor, casterItem, targetActor, targetToken, isCritical = false) {
    const sdxModule = game.modules.get(MODULE_ID);
    if (!sdxModule?.api) {
        ui.notifications.warn("Module API not available");
        return;
    }

    // Check ownership
    if (!weapon.isOwner && !game.user.isGM) {
        if (sdxModule.socket) {
            await sdxModule.socket.executeAsGM(
                "applyCleansingWeaponAsGM",
                weapon.uuid,
                casterActor.uuid,
                casterItem.uuid,
                targetActor.uuid,
                targetToken?.document?.uuid
            );
            return;
        } else {
            ui.notifications.warn("Cannot cleanse weapon: No GM connected or socket unavailable.");
            return;
        }
    }

    const existingBonus = weapon.getFlag(MODULE_ID, "weaponBonus") || {};

    const baseDamage = isCritical ? "2d4" : "1d4";
    const undeadDamage = isCritical ? "2d6" : "1d6";

    const cleansingWeaponBonus = {
        enabled: true,
        hitBonuses: existingBonus.hitBonuses || [],
        damageBonuses: [
            ...(existingBonus.damageBonuses || []),
            // Base damage (1d4 or 2d4 on crit) - always applies (no requirements)
            {
                formula: baseDamage,
                label: "Cleansing Weapon",
                damageType: "fire",
                exclusive: false,
                prompt: false,
                requirements: []
            },
            // Enhanced damage (1d6 or 2d6 on crit) - exclusive, replaces base vs undead
            {
                formula: undeadDamage,
                label: "Cleansing Weapon (vs Undead)",
                damageType: "fire",
                exclusive: true,
                prompt: false,
                requirements: [{
                    type: "targetSubtype",
                    operator: "equals",
                    value: "Undead"
                }]
            }
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
        [`flags.${MODULE_ID}.weaponBonus`]: cleansingWeaponBonus
    };

    // Register modification (captures original state), apply changes, start duration
    await sdxModule.api.registerSpellModification(casterActor, casterItem, weapon, changes, {
        icon: "fas fa-fire",
        endMessage: "The purifying flames fade from <strong>{weapon}</strong> on <strong>{actor}</strong>."
    });

    await weapon.update(changes);

    if (targetToken) {
        await sdxModule.api.startDurationSpell(casterActor, casterItem, [targetToken.id], {});
    }

    // Play Sequencer animation if available
    try {
        if (game.modules.get("sequencer")?.active) {
            const token = targetActor.getActiveTokens()?.[0];
            if (token) {
                new Sequence()
                    .effect()
                    .atLocation(token)
                    .file("jb2a.fire_bolt.orange")
                    .scale(0.5)
                    .fadeIn(200)
                    .fadeOut(400)
                    .spriteOffset({ x: 0, y: -20 })
                    .play();
            }
        }
    } catch (e) {
        console.log(`${MODULE_ID} | Sequencer animation not available: ${e.message}`);
    }

    const isUnidentifiedItem = isUnidentified(weapon);
    const displayName = isUnidentifiedItem ? getUnidentifiedName(weapon) : weapon.name;

    const criticalText = isCritical ? " (Critical Success!)" : "";
    ui.notifications.info(`${displayName} is wreathed in purifying flames!${criticalText}`);

    // Post chat message
    const duration = casterItem.system?.duration?.value || "?";
    const criticalBadge = isCritical ? ' <span style="color: gold; font-weight: bold;">[CRITICAL SUCCESS]</span>' : '';
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-cleansingweapon-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${weapon.img}" alt="${displayName}"/>
                    <div class="header-text">
                        <h3><i class="fas fa-fire"></i> Cleansing Weapon${criticalBadge}</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> wreaths <strong>${targetActor.name}'s ${displayName}</strong> in purifying flames!</p>
                    <p class="spell-effect"><em>The weapon burns with cleansing fire, dealing +${baseDamage} damage (+${undeadDamage} vs. undead) for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}
