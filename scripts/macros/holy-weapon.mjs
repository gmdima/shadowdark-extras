/**
 * Holy Weapon Spell Macro
 * 
 * This module contains the Holy Weapon spell implementation for Shadowdark Extras.
 * The Holy Weapon spell blesses a weapon with holy power, granting +1 to attack and damage rolls.
 */

const MODULE_ID = "shadowdark-extras";

// Import helper functions from identify.mjs
import { isUnidentified, getUnidentifiedName } from "./identify.mjs";

/**
 * Show the Holy Weapon spell selection dialog
 * Displays all available weapons on the target actor in a grid with images
 * 
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The Holy Weapon spell item
 * @param {Actor} targetActor - The actor whose weapons to show
 * @param {Token} targetToken - The target token (for duration tracking)
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 * @param {boolean} isCritical - Optional: Whether the spell was cast with a critical success (grants +2/+2 instead of +1/+1)
 */
export async function showHolyWeaponDialog(casterActor, casterItem, targetActor, targetToken, originatingUserId = null, isCritical = false) {
    if (!targetActor) {
        ui.notifications.warn("You must target a creature to cast Holy Weapon!");
        return;
    }

    // Check if we need to route this dialog to the originating user
    // This happens when a spell macro runs on the GM's client via runAsGm
    if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.socket) {
            await sdxModule.socket.executeAsUser("showHolyWeaponDialogForUser", originatingUserId, {
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
            const hasHolyBonus = hasExistingBonuses && (
                bonusData?.hitBonuses?.some(b => b.label === "Holy Weapon") ||
                bonusData?.damageBonuses?.some(b => b.label === "Holy Weapon")
            );
            if (hasHolyBonus) return false;

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
        <div class="sdx-spell-weapon-dialog sdx-holyweapon-theme">
            <div class="sdx-spell-header">
                <i class="fas fa-hand-sparkles"></i>
                <span>Choose a weapon to bless with holy power</span>
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
                The chosen weapon will gain <strong>+${isCritical ? '2' : '1'} to attack and damage rolls</strong> for the spell's duration.${isCritical ? ' <em>(Critical Success!)</em>' : ''}
            </div>
            <input type="hidden" name="selectedWeaponId" value="">
        </div>
    `;

    const dialog = new foundry.applications.api.DialogV2({
        window: {
            title: "Holy Weapon",
            icon: "fas fa-hand-sparkles"
        },
        content: content,
        buttons: [
            {
                action: "cancel",
                label: "Cancel",
                icon: "fas fa-times"
            },
            {
                action: "bless",
                label: "Bless Weapon",
                icon: "fas fa-hand-sparkles",
                default: true,
                callback: async (event, button, dialogApp) => {
                    const selectedId = dialogApp.element.querySelector("input[name='selectedWeaponId']")?.value;
                    if (!selectedId) {
                        ui.notifications.warn("Please select a weapon to bless.");
                        return false;
                    }
                    const selectedWeapon = targetActor.items.get(selectedId);
                    if (selectedWeapon) {
                        await applyHolyWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken, isCritical);
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
 * Apply the Holy Weapon blessing to a weapon
 * 
 * @param {Item} weapon - The weapon to bless
 * @param {Actor} casterActor - The caster
 * @param {Item} casterItem - The spell item
 * @param {Actor} targetActor - The target owner of the weapon
 * @param {Token} targetToken - The target token
 * @param {boolean} isCritical - Whether the spell was cast with a critical success (grants +2/+2 instead of +1/+1)
 */
export async function applyHolyWeapon(weapon, casterActor, casterItem, targetActor, targetToken, isCritical = false) {
    const sdxModule = game.modules.get(MODULE_ID);
    if (!sdxModule?.api) {
        ui.notifications.warn("Module API not available");
        return;
    }

    // Check ownership. If we can't update the weapon, ask GM to do it.
    if (!weapon.isOwner && !game.user.isGM) {
        if (sdxModule.socket) {
            await sdxModule.socket.executeAsGM(
                "applyHolyWeaponAsGM",
                weapon.uuid,
                casterActor.uuid,
                casterItem.uuid,
                targetActor.uuid,
                targetToken?.document?.uuid
            );
            return;
        } else {
            ui.notifications.warn("Cannot bless weapon: No GM connected or socket unavailable.");
            return;
        }
    }

    const bonusAmount = isCritical ? "2" : "1";
    const holyWeaponBonus = {
        enabled: true,
        hitBonuses: [{ formula: bonusAmount, label: "Holy Weapon", exclusive: false, requirements: [] }],
        damageBonuses: [{ formula: bonusAmount, label: "Holy Weapon", exclusive: false, requirements: [] }],
        damageBonus: "",
        criticalExtraDice: "",
        criticalExtraDamage: "",
        requirements: [],
        effects: [],
        itemMacro: { enabled: false, runAsGm: false, triggers: [] }
    };

    const changes = {
        "system.magicItem": true,
        [`flags.${MODULE_ID}.weaponBonus`]: holyWeaponBonus
    };

    // Register modification (captures original state), apply changes, start duration
    await sdxModule.api.registerSpellModification(casterActor, casterItem, weapon, changes, {
        icon: "fas fa-hand-sparkles",
        endMessage: "The holy blessing fades from <strong>{weapon}</strong> on <strong>{actor}</strong>."
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

    const isUnidentifiedItem = isUnidentified(weapon);
    const displayName = isUnidentifiedItem ? getUnidentifiedName(weapon) : weapon.name;

    const criticalText = isCritical ? " (Critical Success!)" : "";
    ui.notifications.info(`${displayName} has been blessed with holy power!${criticalText}`);

    // Post chat message
    const duration = casterItem.system?.duration?.value || "?";
    const criticalBadge = isCritical ? ' <span style="color: gold; font-weight: bold;">[CRITICAL SUCCESS]</span>' : '';
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-holyweapon-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${weapon.img}" alt="${displayName}"/>
                    <div class="header-text">
                        <h3><i class="fas fa-hand-sparkles"></i> Holy Weapon${criticalBadge}</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> blesses <strong>${targetActor.name}'s ${displayName}</strong> with holy power!</p>
                    <p class="spell-effect"><em>The weapon glows with divine energy, granting +${bonusAmount} to attack and damage rolls for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}
