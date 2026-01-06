/**
 * Display Table Enricher for Shadowdark Extras
 * 
 * Allows journal pages to display styled rollable tables using:
 * @DisplayTable[RollTable.UUID]{Display Name}
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Parse the brackets content to extract UUID and optional flags
 * @param {String} match - The part between brackets
 * @returns {Object} Contains uuid and flag booleans
 */
function parseMatch(match) {
    const words = match.split(" ");
    let result = {};
    if (words.length) {
        result.uuid = words[0];
    }
    for (let i = 1; i < words.length; i++) {
        result[words[i]] = true;
    }
    return result;
}

/**
 * Get a table from a UUID
 * @param {String} uuid - The table UUID
 * @returns {RollTable|null} The table document or null
 */
async function getTableFromUUID(uuid) {
    try {
        let table = fromUuidSync(uuid);
        if (!table) {
            table = await fromUuid(uuid);
        }
        return table;
    } catch (e) {
        console.warn(`SDX DisplayTable: Could not find table for UUID: ${uuid}`);
        return null;
    }
}

/**
 * Main enricher function for @DisplayTable
 * @param {RegExpMatchArray} match - The regex match array
 * @param {Object} _options - Enricher options
 * @returns {HTMLElement} The rendered element
 */
export async function enrichDisplayTable(match, _options) {
    const parsedMatch = parseMatch(match[1]);
    const table = await getTableFromUUID(parsedMatch.uuid);
    const tableName = match[2] ?? table?.name;

    const container = document.createElement("div");
    container.classList.add("sdx-display-table-container");

    if (table) {
        container.dataset.tableUuid = table.uuid;

        // Header and Roll Bar
        let html = `
        <div class="sdx-display-table">
            <div class="sdx-table-header">
                ${tableName}
            </div>
            <div class="sdx-table-roll-bar">
                <div class="sdx-table-roll-btn" title="${game.i18n.localize("TABLE.Roll")}">
                    <i class="fas fa-dice-d20"></i>
                    <i class="fas fa-list"></i>
                    <span class="sdx-table-formula">${table.formula}</span>
                </div>
                <div class="sdx-table-result-label">${game.i18n.localize("TABLE.Result")}</div>
            </div>
            <div class="sdx-table-results">`;

        // Rows
        for (const result of table.results) {
            const rangeStr = result.range[0] === result.range[1]
                ? `${result.range[0]}`
                : `${result.range[0]}-${result.range[1]}`;

            let resultText = "";
            if (result.type === CONST.TABLE_RESULT_TYPES.TEXT) {
                resultText = result.text || result.description || "";
            } else if (result.type === CONST.TABLE_RESULT_TYPES.DOCUMENT) {
                resultText = `@UUID[${result.documentCollection}.${result.documentId}]{${result.text}}`;
            } else if (result.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
                resultText = `@UUID[Compendium.${result.documentCollection}.${result.documentId}]{${result.text}}`;
            }

            html += `
                <div class="sdx-table-row">
                    <div class="sdx-table-row-range">${rangeStr}</div>
                    <div class="sdx-table-row-text">${resultText}</div>
                </div>`;
        }

        html += `
            </div>
        </div>`;

        // We use TextEditor.enrichHTML to handle any nested UUID links or dice rolls in the results
        container.innerHTML = await TextEditor.enrichHTML(html, { async: true });
    } else {
        // Broken link fallback
        container.dataset.tableId = parsedMatch.uuid;
        if (match[2]) container.dataset.tableName = match[2];
        container.classList.add("content-link", "broken");
        container.innerHTML = `<i class="fas fa-unlink"></i> ${tableName ?? "Unknown Table"}`;
    }

    return container;
}

/**
 * Register the DisplayTable enricher with Foundry
 */
export function registerDisplayTableEnricher() {
    CONFIG.TextEditor.enrichers.push({
        pattern: /@DisplayTable\[(.+?)\](?:\{(.+?)\})?/gm,
        enricher: enrichDisplayTable
    });

    console.log("SDX | Registered DisplayTable enricher");
}
