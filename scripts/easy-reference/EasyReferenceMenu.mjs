

const MODULE_ID = "shadowdark-extras";

/**
 * Initialize the Easy Reference Menu
 * Call this on module ready
 */
export function initEasyReferenceMenu() {
    console.log("shadowdark-extras | Initializing Easy Reference Menu");

    // Hook into ProseMirror menu creation
    Hooks.on("getProseMirrorMenuDropDowns", (proseMirrorMenu, dropdowns) => {
        buildEasyReferenceMenu(proseMirrorMenu, dropdowns);
    });
}

/**
 * Build the Easy Reference dropdown menu
 */
function buildEasyReferenceMenu(proseMirrorMenu, dropdowns) {
    // Helper function to insert text into the editor
    const insertText = (text) => {
        if (!text) return;
        proseMirrorMenu.view.dispatch(
            proseMirrorMenu.view.state.tr.insertText(text).scrollIntoView()
        );
    };

    // Build menu entries based on enabled settings
    const entries = [];

    // NPC Cards submenu
    if (game.settings.get(MODULE_ID, "easyRef_showNpcCards")) {
        entries.push({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.npc_cards.title"),
            action: "npc-cards",
            children: [
                {
                    title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.npc_cards.stat_card"),
                    action: "npc-stat-card",
                    cmd: () => {
                        showUuidInputDialog(
                            game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.npc_cards.stat_card"),
                            "Actor",
                            (uuid, name) => insertText(`@DisplayNpcCard[${uuid}]{${name}}`)
                        );
                    }
                },
                {
                    title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.npc_cards.detailed_card"),
                    action: "npc-detailed-card",
                    cmd: () => {
                        showUuidInputDialog(
                            game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.npc_cards.detailed_card"),
                            "Actor",
                            (uuid, name) => insertText(`@DisplayNpcCardDetailed[${uuid}]{${name}}`)
                        );
                    }
                }
            ]
        });
    }

    // Item Cards submenu
    if (game.settings.get(MODULE_ID, "easyRef_showItemCards")) {
        entries.push({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.item_cards.title"),
            action: "item-cards",
            cmd: () => {
                showUuidInputDialog(
                    game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.item_cards.title"),
                    "Item",
                    (uuid, name) => insertText(`@DisplayItemCard[${uuid}]{${name}}`)
                );
            }
        });
    }

    // Tables submenu
    if (game.settings.get(MODULE_ID, "easyRef_showTables")) {
        entries.push({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.tables.title"),
            action: "tables",
            cmd: () => {
                showUuidInputDialog(
                    game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.tables.title"),
                    "RollTable",
                    (uuid, name) => insertText(`@DisplayTable[${uuid}]{${name}}`)
                );
            }
        });
    }

    // Ability Checks submenu
    if (game.settings.get(MODULE_ID, "easyRef_showChecks")) {
        const abilities = ["str", "dex", "con", "int", "wis", "cha"];
        entries.push({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.title"),
            action: "ability-checks",
            children: [
                // Custom check dialog option
                {
                    title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.custom_check"),
                    action: "custom-check",
                    cmd: () => {
                        showCheckDialog((dc, stat, type) => {
                            insertText(`[[${type} ${dc} ${stat}]]`);
                        });
                    }
                },
                // Quick checks for each ability - opens dialog with ability pre-selected
                ...abilities.map(ability => ({
                    title: game.i18n.localize(`SHADOWDARK.ability_${ability}`),
                    action: `check-${ability}`,
                    cmd: () => {
                        showCheckDialog((dc, stat, type) => {
                            insertText(`[[${type} ${dc} ${stat}]]`);
                        }, ability);
                    }
                }))
            ]
        });
    }

    // Dice Rolls submenu
    if (game.settings.get(MODULE_ID, "easyRef_showDice")) {
        const dice = ["d4", "d6", "d8", "d10", "d12", "d20"];
        entries.push({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dice.title"),
            action: "dice-rolls",
            children: [
                // Custom roll dialog
                {
                    title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dice.custom"),
                    action: "dice-custom",
                    cmd: () => {
                        showDiceDialog((formula) => {
                            insertText(`[[/r ${formula}]]`);
                        });
                    }
                },
                // Quick dice inserts
                ...dice.map(die => ({
                    title: die.toUpperCase(),
                    action: `dice-${die}`,
                    cmd: () => insertText(`[[/r 1${die}]]`)
                }))
            ]
        });
    }

    // Only add the menu if there are entries
    if (entries.length > 0) {
        dropdowns.sdxEasyReference = {
            action: "sdx-easy-reference",
            title: '<i class="fa-solid fa-book-sparkles"></i>',
            entries: entries
        };
    }
}

/**
 * Show a dialog to input a UUID and optional display name
 */
function showUuidInputDialog(title, docType, callback) {
    const content = `
		<form class="sdx-easy-ref-dialog">
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.uuid_label")}</label>
				<input type="text" name="uuid" placeholder="Compendium.module.pack.Item.xxxxx" />
				<p class="notes">${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.uuid_hint")}</p>
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.name_label")}</label>
				<input type="text" name="displayName" placeholder="${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.name_placeholder")}" />
			</div>
		</form>
	`;

    new Dialog({
        title: title,
        content: content,
        buttons: {
            insert: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.insert"),
                callback: async (html) => {
                    const uuid = html.find('input[name="uuid"]').val().trim();
                    let displayName = html.find('input[name="displayName"]').val().trim();

                    if (!uuid) {
                        ui.notifications.warn(game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.uuid_required"));
                        return;
                    }

                    // Try to get the document name if no display name provided
                    if (!displayName) {
                        try {
                            const doc = await fromUuid(uuid);
                            displayName = doc?.name || "Unknown";
                        } catch (e) {
                            displayName = "Unknown";
                        }
                    }

                    callback(uuid, displayName);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("Cancel")
            }
        },
        default: "insert"
    }).render(true);
}

/**
 * Show a dialog to create a custom ability check
 * @param {Function} callback - Callback function receiving (dc, stat, type)
 * @param {string} [preSelectedAbility] - Optional ability to pre-select
 */
function showCheckDialog(callback, preSelectedAbility = null) {
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    const abilityOptions = abilities.map(a =>
        `<option value="${a}"${a === preSelectedAbility ? ' selected' : ''}>${game.i18n.localize(`SHADOWDARK.ability_${a}`)}</option>`
    ).join("");

    const content = `
		<form class="sdx-easy-ref-dialog">
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.type_label")}</label>
				<select name="type">
					<option value="check">${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.check")}</option>
					<option value="request">${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.request")}</option>
				</select>
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.dc_label")}</label>
				<input type="number" name="dc" value="12" min="1" max="30" />
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.ability_label")}</label>
				<select name="ability">${abilityOptions}</select>
			</div>
		</form>
	`;

    new Dialog({
        title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.checks.dialog_title"),
        content: content,
        buttons: {
            insert: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.insert"),
                callback: (html) => {
                    const type = html.find('select[name="type"]').val();
                    const dc = html.find('input[name="dc"]').val();
                    const ability = html.find('select[name="ability"]').val();
                    callback(dc, ability, type);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("Cancel")
            }
        },
        default: "insert"
    }).render(true);
}

/**
 * Show a dialog to create a custom dice roll
 */
function showDiceDialog(callback) {
    const content = `
		<form class="sdx-easy-ref-dialog">
			<div class="form-group">
				<label>${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dice.formula_label")}</label>
				<input type="text" name="formula" value="1d20" placeholder="1d20+5" />
				<p class="notes">${game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dice.formula_hint")}</p>
			</div>
		</form>
	`;

    new Dialog({
        title: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dice.dialog_title"),
        content: content,
        buttons: {
            insert: {
                icon: '<i class="fas fa-check"></i>',
                label: game.i18n.localize("SHADOWDARK_EXTRAS.easy_reference.dialog.insert"),
                callback: (html) => {
                    const formula = html.find('input[name="formula"]').val().trim();
                    if (formula) callback(formula);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("Cancel")
            }
        },
        default: "insert"
    }).render(true);
}

/**
 * Register settings for the Easy Reference Menu
 */
export function registerEasyReferenceSettings() {
    const categories = [
        "showNpcCards",
        "showItemCards",
        "showTables",
        "showChecks",
        "showDice"
    ];

    // Register each category setting
    categories.forEach(category => {
        game.settings.register(MODULE_ID, `easyRef_${category}`, {
            name: game.i18n.localize(`SHADOWDARK_EXTRAS.easy_reference.settings.${category}.name`),
            hint: game.i18n.localize(`SHADOWDARK_EXTRAS.easy_reference.settings.${category}.hint`),
            scope: "world",
            config: true,
            type: Boolean,
            default: true
        });
    });
}
