/**
 * Identify Spell Macro
 * 
 * This module contains the Identify spell implementation for Shadowdark Extras.
 * The Identify spell allows players to reveal the true nature of unidentified items.
 */

const MODULE_ID = "shadowdark-extras";

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
