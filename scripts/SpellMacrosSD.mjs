/**
 * Spell Macros for Shadowdark Extras
 * 
 * This module contains item macro functions for spells that need special handling.
 * Functions are exported for use by item macros embedded in spell items.
 */

const MODULE_ID = "shadowdark-extras";

// ============================================
// IDENTIFY SPELL
// ============================================

/**
 * Check if an item is unidentified
 * @param {Item} item - The item to check
 * @returns {boolean} - True if the item has the unidentified flag
 */
export function isUnidentified(item) {
    return Boolean(item?.getFlag?.(MODULE_ID, "unidentified"));
}

/**
 * Get the masked name for an unidentified item
 * @param {Item} item - The item to get masked name for
 * @returns {string} - The masked name to display
 */
export function getUnidentifiedName(item) {
    const customName = item?.getFlag?.(MODULE_ID, "unidentifiedName");
    if (customName && customName.trim()) {
        return customName.trim();
    }
    return game.i18n.localize("SHADOWDARK_EXTRAS.item.unidentified.label");
}

/**
 * Show the Identify spell selection dialog
 * Displays all unidentified items on the target actor in a grid with images
 * 
 * @param {Actor} targetActor - The actor whose items to show
 * @param {Item[]} unidentifiedItems - Array of unidentified items
 * @param {Item} identifySpell - The Identify spell item (for reference)
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 */
export async function showIdentifyDialog(targetActor, unidentifiedItems, identifySpell, originatingUserId = null) {
    // Check if we need to route this dialog to the originating user
    // This happens when a spell macro runs on the GM's client via runAsGm
    if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.socket) {
            await sdxModule.socket.executeAsUser("showIdentifyDialogForUser", originatingUserId, {
                targetActorId: targetActor.id,
                unidentifiedItemIds: unidentifiedItems.map(i => i.id),
                identifySpellId: identifySpell.id,
                casterActorId: identifySpell.parent?.id
            });
            return;
        }
    }

    // Build item cards HTML
    const itemsHtml = unidentifiedItems.map(item => {
        const maskedName = getUnidentifiedName(item);
        const img = item.img || "icons/svg/mystery-man.svg";
        return `
			<div class="sdx-identify-item" data-item-id="${item.id}">
				<div class="sdx-identify-item-img">
					<img src="${img}" alt="${maskedName}">
				</div>
				<div class="sdx-identify-item-name">${maskedName}</div>
			</div>
		`;
    }).join("");

    const content = `
		<div class="sdx-identify-dialog">
			<div class="sdx-identify-header">
				<i class="fas fa-sparkles"></i>
				<span>${game.i18n.localize("SHADOWDARK_EXTRAS.identify.selectItem")}</span>
			</div>
			<div class="sdx-identify-grid">
				${itemsHtml}
			</div>
			<input type="hidden" name="selectedItemId" value="">
		</div>
	`;

    const dialog = new foundry.applications.api.DialogV2({
        window: {
            title: game.i18n.localize("SHADOWDARK_EXTRAS.identify.title"),
            icon: "fas fa-sparkles"
        },
        content: content,
        buttons: [
            {
                action: "cancel",
                label: game.i18n.localize("Cancel"),
                icon: "fas fa-times"
            },
            {
                action: "identify",
                label: game.i18n.localize("SHADOWDARK_EXTRAS.identify.identify"),
                icon: "fas fa-sparkles",
                default: true,
                callback: async (event, button, dialogApp) => {
                    const selectedId = dialogApp.element.querySelector("input[name='selectedItemId']")?.value;
                    if (!selectedId) {
                        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.identify.noSelection"));
                        return false;
                    }
                    const selectedItem = targetActor.items.get(selectedId);
                    if (selectedItem) {
                        await identifyItem(selectedItem, identifySpell);
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
        // Add click handlers for item selection
        const items = dialogElement.querySelectorAll(".sdx-identify-item");
        const hiddenInput = dialogElement.querySelector("input[name='selectedItemId']");

        items.forEach(itemEl => {
            itemEl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Remove selected class from all
                items.forEach(i => i.classList.remove("selected"));
                // Add to clicked
                itemEl.classList.add("selected");
                // Update hidden input
                if (hiddenInput) {
                    hiddenInput.value = itemEl.dataset.itemId;
                }
                console.log(`${MODULE_ID} | Selected item: ${itemEl.dataset.itemId}`);
            });
        });
    });

    await dialog.render(true);
}

/**
 * Identify an item - removes the unidentified flag and shows a reveal animation
 * 
 * @param {Item} item - The item to identify
 * @param {Item} identifySpell - The Identify spell item (for reference)
 */
export async function identifyItem(item, identifySpell) {
    if (!item) return;

    // Check ownership. If we can't update the item, ask GM to do it.
    const sdxModule = game.modules.get(MODULE_ID);
    if (!item.isOwner && !game.user.isGM) {
        if (sdxModule?.socket) {
            // Store masked name before GM removes flags
            const maskedName = getUnidentifiedName(item);
            await sdxModule.socket.executeAsGM(
                "identifyItemAsGM",
                item.uuid,
                identifySpell?.uuid,
                maskedName,
                game.user.id  // Pass originating user for dialog routing
            );
            return;
        } else {
            ui.notifications.warn("Cannot identify item: No GM connected or socket unavailable.");
            return;
        }
    }

    // Store original masked name for the reveal
    const maskedName = getUnidentifiedName(item);

    // Remove unidentified flags
    await item.unsetFlag(MODULE_ID, "unidentified");
    await item.unsetFlag(MODULE_ID, "unidentifiedName");

    // Show reveal modal
    await showItemReveal(item, maskedName);

    // Post chat message
    const chatContent = `
		<div class="shadowdark chat-card sdx-identify-chat">
			<header class="card-header flexrow">
				<img class="item-image" src="${item.img}" alt="${item.name}"/>
				<div class="header-text">
					<h3><i class="fas fa-sparkles"></i> ${game.i18n.localize("SHADOWDARK_EXTRAS.identify.revealed")}</h3>
				</div>
			</header>
			<div class="card-content">
				<p class="reveal-text">
					<em>${maskedName}</em> ${game.i18n.localize("SHADOWDARK_EXTRAS.identify.isActually")}
				</p>
				<p class="item-name"><strong>${item.name}</strong></p>
				${item.system?.description ? `<div class="item-description">${item.system.description}</div>` : ""}
			</div>
		</div>
	`;

    await ChatMessage.create({
        content: chatContent,
        speaker: ChatMessage.getSpeaker({ actor: item.actor }),
        type: CONST.CHAT_MESSAGE_STYLES.OTHER
    });

    ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.identify.success", { name: item.name }));
}

/**
 * Show the magical reveal modal with animation
 * 
 * @param {Item} item - The identified item
 * @param {string} maskedName - The original masked name
 */
export async function showItemReveal(item, maskedName) {
    const content = `
		<div class="sdx-identify-reveal">
			<div class="sdx-reveal-glow"></div>
			<div class="sdx-reveal-content">
				<div class="sdx-reveal-image">
					<img src="${item.img}" alt="${item.name}">
				</div>
				<div class="sdx-reveal-name">
					<i class="fas fa-sparkles"></i>
					<span>${item.name}</span>
					<i class="fas fa-sparkles"></i>
				</div>
				${item.system?.description ? `
					<div class="sdx-reveal-description">
						${item.system.description}
					</div>
				` : ""}
			</div>
		</div>
	`;

    const dialog = new foundry.applications.api.DialogV2({
        window: {
            title: game.i18n.localize("SHADOWDARK_EXTRAS.identify.itemRevealed"),
            icon: "fas fa-sparkles"
        },
        content: content,
        buttons: [
            {
                action: "close",
                label: game.i18n.localize("Close"),
                icon: "fas fa-check",
                default: true
            }
        ],
        position: {
            width: 450,
            height: "auto"
        }
    });

    await dialog.render(true);

    // Play reveal animation with Sequencer if available
    try {
        if (game.modules.get("sequencer")?.active) {
            const token = item.actor?.getActiveTokens()?.[0];
            if (token) {
                new Sequence()
                    .effect()
                    .atLocation(token)
                    .file("jb2a.divine_smite.caster.reversed.blueyellow")
                    .scale(0.5)
                    .fadeIn(300)
                    .fadeOut(500)
                    .play();
            }
        }
    } catch (e) {
        // Silently fail if no JB2A effects available
        console.log(`${MODULE_ID} | Sequencer animation not available: ${e.message}`);
    }
}


// ============================================
// HOLY WEAPON SPELL
// ============================================

/**
 * Show the Holy Weapon spell selection dialog
 * Displays all available weapons on the target actor in a grid with images
 * 
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The Holy Weapon spell item
 * @param {Actor} targetActor - The actor whose weapons to show
 * @param {Token} targetToken - The target token (for duration tracking)
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 */
export async function showHolyWeaponDialog(casterActor, casterItem, targetActor, targetToken, originatingUserId = null) {
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
                targetTokenId: targetToken?.id
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
                The chosen weapon will gain <strong>+1 to attack and damage rolls</strong> for the spell's duration.
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
                        await applyHolyWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken);
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
 */
export async function applyHolyWeapon(weapon, casterActor, casterItem, targetActor, targetToken) {
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

    const holyWeaponBonus = {
        enabled: true,
        hitBonuses: [{ formula: "1", label: "Holy Weapon", exclusive: false, requirements: [] }],
        damageBonuses: [{ formula: "1", label: "Holy Weapon", exclusive: false, requirements: [] }],
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

    ui.notifications.info(`${displayName} has been blessed with holy power!`);

    // Post chat message
    const duration = casterItem.system?.duration?.value || "?";
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-holyweapon-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${weapon.img}" alt="${displayName}"/>
                    <div class="header-text">
                        <h3><i class="fas fa-hand-sparkles"></i> Holy Weapon</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> blesses <strong>${targetActor.name}'s ${displayName}</strong> with holy power!</p>
                    <p class="spell-effect"><em>The weapon glows with divine energy, granting +1 to attack and damage rolls for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}


// ============================================
// CLEANSING WEAPON SPELL
// ============================================

/**
 * Show the Cleansing Weapon spell selection dialog
 * Displays all available weapons on the target actor in a grid with images
 * 
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The Cleansing Weapon spell item
 * @param {Actor} targetActor - The actor whose weapons to show
 * @param {Token} targetToken - The target token (for duration tracking)
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 */
export async function showCleansingWeaponDialog(casterActor, casterItem, targetActor, targetToken, originatingUserId = null) {
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
                targetTokenId: targetToken?.id
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
                The weapon deals <strong>+1d4 fire damage</strong> (<strong>+1d6 vs. undead</strong>) for the spell's duration.
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
                        await applyCleansingWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken);
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
 */
export async function applyCleansingWeapon(weapon, casterActor, casterItem, targetActor, targetToken) {
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

    const cleansingWeaponBonus = {
        enabled: true,
        hitBonuses: existingBonus.hitBonuses || [],
        damageBonuses: [
            ...(existingBonus.damageBonuses || []),
            // Base damage (1d4) - always applies (no requirements)
            {
                formula: "1d4",
                label: "Cleansing Weapon",
                damageType: "fire",
                exclusive: false,
                prompt: false,
                requirements: []
            },
            // Enhanced damage (1d6) - exclusive, replaces 1d4 vs undead
            {
                formula: "1d6",
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

    ui.notifications.info(`${displayName} is wreathed in purifying flames!`);

    // Post chat message
    const duration = casterItem.system?.duration?.value || "?";
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-cleansingweapon-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${weapon.img}" alt="${displayName}"/>
                    <div class="header-text">
                        <h3><i class="fas fa-fire"></i> Cleansing Weapon</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> wreaths <strong>${targetActor.name}'s ${displayName}</strong> in purifying flames!</p>
                    <p class="spell-effect"><em>The weapon burns with cleansing fire, dealing +1d4 damage (+1d6 vs. undead) for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}


// ============================================
// WRATH SPELL
// ============================================

/**
 * Show the Wrath spell selection dialog
 * Displays all available weapons on the caster (Self) in a grid with images
 * 
 * @param {Actor} casterActor - The actor casting the spell and targeting self
 * @param {Item} casterItem - The Wrath spell item
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 */
export async function showWrathWeaponDialog(casterActor, casterItem, originatingUserId = null) {
    // Target is always self
    const targetActor = casterActor;
    // For Wrath, we track duration on the Caster
    // But typically duration tracking links to a token. 
    // We'll try to find the caster's token.
    const targetToken = casterActor.token || casterActor.getActiveTokens()[0];

    // Check if we need to route this dialog to the originating user
    if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
        const sdxModule = game.modules.get(MODULE_ID);
        if (sdxModule?.socket) {
            await sdxModule.socket.executeAsUser("showWrathWeaponDialogForUser", originatingUserId, {
                casterActorId: casterActor.id,
                casterItemId: casterItem.id,
                targetActorId: targetActor.id,
                targetTokenId: targetToken?.id
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
            const hasWrathBonus = hasExistingBonuses && (
                bonusData?.hitBonuses?.some(b => b.label === "Wrath") ||
                bonusData?.damageBonuses?.some(b => b.label === "Wrath")
            );
            if (hasWrathBonus) return false;

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
                <i class="fas fa-gavel"></i>
                <span>Choose a weapon to empower with Wrath</span>
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
                 The weapon becomes magical, gains <strong>+2 to hit</strong> and deals <strong>+1d8 physical damage</strong>.
            </div>
            <input type="hidden" name="selectedWeaponId" value="">
        </div>
    `;

    // Use specific CSS class for styling if needed, or reuse generic one
    // We can inject a style block or rely on existing styles
    // sdx-wrath-theme can be targeted for colors (e.g. red/crimson)

    const dialog = new foundry.applications.api.DialogV2({
        window: {
            title: "Wrath",
            icon: "fas fa-gavel"
        },
        content: content,
        buttons: [
            {
                action: "cancel",
                label: "Cancel",
                icon: "fas fa-times"
            },
            {
                action: "empower",
                label: "Empower Weapon",
                icon: "fas fa-gavel",
                default: true,
                callback: async (event, button, dialogApp) => {
                    const selectedId = dialogApp.element.querySelector("input[name='selectedWeaponId']")?.value;
                    if (!selectedId) {
                        ui.notifications.warn("Please select a weapon to empower.");
                        return false;
                    }
                    const selectedWeapon = targetActor.items.get(selectedId);
                    if (selectedWeapon) {
                        await applyWrathWeapon(selectedWeapon, casterActor, casterItem, targetActor, targetToken);
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

        checkboxMagical?.addEventListener("change", updateGrid);
        checkboxBonuses?.addEventListener("change", updateGrid);
    });

    await dialog.render(true);
}

/**
 * Apply the Wrath effect to a weapon
 * 
 * @param {Item} weapon - The weapon to empower
 * @param {Actor} casterActor - The caster (and target)
 * @param {Item} casterItem - The spell item
 * @param {Actor} targetActor - The target owner of the weapon (same as caster)
 * @param {Token} targetToken - The target token
 */
export async function applyWrathWeapon(weapon, casterActor, casterItem, targetActor, targetToken) {
    const sdxModule = game.modules.get(MODULE_ID);
    if (!sdxModule?.api) {
        ui.notifications.warn("Module API not available");
        return;
    }

    if (!weapon.isOwner && !game.user.isGM) {
        if (sdxModule.socket) {
            await sdxModule.socket.executeAsGM(
                "applyWrathWeaponAsGM",
                weapon.uuid,
                casterActor.uuid,
                casterItem.uuid,
                targetActor.uuid,
                targetToken?.document?.uuid
            );
            return;
        } else {
            ui.notifications.warn("Cannot empower weapon: No GM connected or socket unavailable.");
            return;
        }
    }

    const existingBonus = weapon.getFlag(MODULE_ID, "weaponBonus") || {};

    const wrathWeaponBonus = {
        enabled: true,
        hitBonuses: [
            ...(existingBonus.hitBonuses || []),
            { formula: "2", label: "Wrath", exclusive: false, requirements: [] }
        ],
        damageBonuses: [
            ...(existingBonus.damageBonuses || []),
            { formula: "1d8", label: "Wrath", damageType: "physical", exclusive: false, requirements: [] }
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

    await sdxModule.api.registerSpellModification(casterActor, casterItem, weapon, changes, {
        icon: "fas fa-gavel",
        endMessage: "The wrath fades from <strong>{weapon}</strong> on <strong>{actor}</strong>."
    });

    await weapon.update(changes);

    if (targetToken) {
        // Check if duration tracking is already active for this spell (system might have started it)
        const activeDuration = sdxModule.api.getActiveDurationSpells ? sdxModule.api.getActiveDurationSpells(casterActor) : [];
        const isTracking = activeDuration.some(d => d.spellId === casterItem.id);

        if (!isTracking) {
            await sdxModule.api.startDurationSpell(casterActor, casterItem, [targetToken.id], {});
        }
    }

    // Sequencer animation
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

    ui.notifications.info(`${displayName} is empowered with Wrath!`);

    const duration = casterItem.system?.duration?.value || "?";
    await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: casterActor }),
        content: `
            <div class="shadowdark chat-card sdx-wrath-chat">
                <header class="card-header flexrow">
                    <img class="item-image" src="${weapon.img}" alt="${displayName}"/>
                    <div class="header-text">
                        <h3><i class="fas fa-gavel"></i> Wrath</h3>
                    </div>
                </header>
                <div class="card-content">
                    <p><strong>${casterActor.name}</strong> empowers their <strong>${displayName}</strong> with Wrath!</p>
                    <p class="spell-effect"><em>The weapon becomes magical, gains +2 to hit, and deals +1d8 physical damage for ${duration} rounds.</em></p>
                </div>
            </div>
        `
    });
}


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
        console.log(`${MODULE_ID} | Spell Macros API registered`);
    }
});
