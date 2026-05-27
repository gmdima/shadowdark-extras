/**
 * Carousing Tables Editor Application
 * Allows GMs to create, edit, and delete custom carousing tables.
 */

const MODULE_ID = "shadowdark-extras";

import { getCustomCarousingTables, saveCustomCarousingTables } from "./CarousingSD.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Application for managing custom carousing tables
 */
export class CarousingTablesApp extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "carousing-tables-app",
        classes: ["shadowdark-extras", "carousing-tables-app"],
        tag: "form",
        window: {
            title: "SHADOWDARK_EXTRAS.carousing.tables_editor_title",
            resizable: true
        },
        position: {
            width: 700,
            height: 600
        },
        form: {
            handler: CarousingTablesApp.formHandler,
            submitOnChange: false,
            closeOnSubmit: false
        }
    };

    static PARTS = {
        form: {
            template: "modules/shadowdark-extras/templates/carousing-tables-app.hbs"
        }
    };

    constructor(options = {}) {
        super(options);
        this.editingTable = null;
    }

    async _prepareContext(options) {
        const tables = getCustomCarousingTables();
        return {
            tables,
            editingTable: this.editingTable ? tables.find(t => t.id === this.editingTable) : null,
            isEditing: !!this.editingTable,
            isNew: this.editingTable === "new"
        };
    }

    _onRender(context, options) {
        const root = this.element;
        if (!root) return;
        const html = $(root);

        // Tab switching
        html.find('.tabs .item').click((event) => {
            const tab = $(event.currentTarget).data('tab');
            html.find('.tabs .item').removeClass('active');
            $(event.currentTarget).addClass('active');
            html.find('.tab-pane').removeClass('active');
            html.find(`.tab-pane[data-tab="${tab}"]`).addClass('active');
        });

        // New table button
        html.find('[data-action="new-table"]').click(() => {
            this.editingTable = "new";
            this.render();
        });

        // Edit table button
        html.find('[data-action="edit-table"]').click((event) => {
            const tableId = $(event.currentTarget).data("table-id");
            this.editingTable = tableId;
            this.render();
        });

        // Delete table button
        html.find('[data-action="delete-table"]').click(async (event) => {
            const tableId = $(event.currentTarget).data("table-id");
            const tables = getCustomCarousingTables();
            const table = tables.find(t => t.id === tableId);
            if (!table) return;

            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.delete_table") },
                content: `<p>${game.i18n.format("SHADOWDARK_EXTRAS.carousing.delete_table_confirm", { name: table.name })}</p>`,
                modal: true
            });

            if (confirmed) {
                const newTables = tables.filter(t => t.id !== tableId);
                await saveCustomCarousingTables(newTables);
                this.render();
            }
        });

        // Export table button
        html.find('[data-action="export-table"]').click((event) => {
            const tableId = $(event.currentTarget).data("table-id");
            this._exportTable(tableId);
        });

        // Import table button
        html.find('[data-action="import-table"]').click(() => this._importTable());

        // Cancel edit
        html.find('[data-action="cancel-edit"]').click(() => {
            this.editingTable = null;
            this.render();
        });

        // Add tier row
        html.find('[data-action="add-tier"]').click(() => {
            const tiersContainer = html.find('.tiers-list');
            const newIndex = tiersContainer.find('.table-row').length;
            const newRow = this._createTierRowHtml(newIndex, { cost: 100, bonus: 0, description: "" });
            tiersContainer.append(newRow);
        });

        // Add outcome row
        html.find('[data-action="add-outcome"]').click(() => {
            const outcomesContainer = html.find('.outcomes-list');
            const newIndex = outcomesContainer.find('.table-row').length;
            const newRow = this._createOutcomeRowHtml(newIndex, { roll: String(newIndex + 1), description: "", benefit: "" });
            outcomesContainer.append(newRow);
        });

        // Remove row (generic - works for both tiers and outcomes)
        html.on('click', '[data-action="remove-row"]', (event) => {
            $(event.currentTarget).closest('.table-row').remove();
        });

        // Import tiers
        html.find('[data-action="import-tiers"]').click(() => this._importTiers(html));

        // Import outcomes
        html.find('[data-action="import-outcomes"]').click(() => this._importOutcomes(html));

        // Reset tiers
        html.find('[data-action="reset-tiers"]').click(() => {
            html.find('.tiers-list').empty();
        });

        // Reset outcomes
        html.find('[data-action="reset-outcomes"]').click(() => {
            html.find('.outcomes-list').empty();
        });
    }

    /**
     * Handle form submission
     */
    static async formHandler(event, form, formData) {
        const flat = formData.object;
        const tables = getCustomCarousingTables();
        const isNew = this.editingTable === "new";

        // Parse tiers from form
        const tiers = [];
        let tierIndex = 0;
        while (flat[`tier-cost-${tierIndex}`] !== undefined) {
            tiers.push({
                cost: parseInt(flat[`tier-cost-${tierIndex}`]) || 0,
                bonus: parseInt(flat[`tier-bonus-${tierIndex}`]) || 0,
                description: flat[`tier-description-${tierIndex}`] || ""
            });
            tierIndex++;
        }

        // Parse outcomes from form
        const outcomes = [];
        let outcomeIndex = 0;
        while (flat[`outcome-roll-${outcomeIndex}`] !== undefined) {
            outcomes.push({
                roll: flat[`outcome-roll-${outcomeIndex}`] || String(outcomeIndex + 1),
                description: flat[`outcome-description-${outcomeIndex}`] || "",
                benefit: flat[`outcome-benefit-${outcomeIndex}`] || ""
            });
            outcomeIndex++;
        }

        const tableData = {
            id: isNew ? foundry.utils.randomID() : this.editingTable,
            name: flat.name || "Unnamed Table",
            tiers,
            outcomes
        };

        if (isNew) {
            tables.push(tableData);
        } else {
            const idx = tables.findIndex(t => t.id === this.editingTable);
            if (idx >= 0) tables[idx] = tableData;
        }

        await saveCustomCarousingTables(tables);
        this.editingTable = null;
        this.render();
        ui.notifications.info(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.table_saved"));
    }

    /**
     * Create HTML for a tier row
     */
    _createTierRowHtml(index, tier) {
        return `
            <div class="table-row flexrow">
                <input type="number" name="tier-cost-${index}" value="${tier.cost}" placeholder="GP" style="width:80px" />
                <input type="number" name="tier-bonus-${index}" value="${tier.bonus}" placeholder="+0" style="width:60px" />
                <input type="text" name="tier-description-${index}" value="${tier.description}" placeholder="Description" style="flex:1" />
                <a data-action="remove-row" title="Remove"><i class="fas fa-trash"></i></a>
            </div>
        `;
    }

    /**
     * Create HTML for an outcome row (simplified: roll, description, benefit)
     */
    _createOutcomeRowHtml(index, outcome) {
        const descLabel = game.i18n.localize("SHADOWDARK_EXTRAS.carousing.description");
        const benefitLabel = game.i18n.localize("SHADOWDARK_EXTRAS.carousing.benefit");
        return `
            <div class="table-row flexrow">
                <input type="text" name="outcome-roll-${index}" value="${outcome.roll || ''}" placeholder="1" style="width:60px; text-align:center" />
                <input type="text" name="outcome-description-${index}" value="${outcome.description || ''}" placeholder="${descLabel}" style="flex:1" />
                <input type="text" name="outcome-benefit-${index}" value="${outcome.benefit || ''}" placeholder="${benefitLabel}" style="flex:1" />
                <a data-action="remove-row" title="Remove"><i class="fas fa-trash"></i></a>
            </div>
        `;
    }

    /**
     * Import tiers from text format
     */
    async _importTiers(html) {
        const content = `
            <p>Paste tier entries. Each entry starts with cost (e.g., "30 gp") and ends with bonus (e.g., "+0").</p>
            <p><small>Entries can span multiple lines. Example:<br>
            "100 gp A full day and night of revelry,<br>
            gambling, and recounting your exploits +1"</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_tiers") },
            content,
            ok: {
                label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
                callback: (event, button, dialog) => dialog.element.querySelector("#import-text")?.value
            },
            rejectClose: false
        });

        if (result) {
            const fullText = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const entryPattern = /(?:^|\n)([\d,]+)\s*gp\s+/gi;

            const entries = [];
            let match;
            const starts = [];

            while ((match = entryPattern.exec(fullText)) !== null) {
                starts.push({
                    index: match.index,
                    cost: match[1].replace(/,/g, '')
                });
            }

            for (let i = 0; i < starts.length; i++) {
                const startIdx = starts[i].index;
                const endIdx = (i + 1 < starts.length) ? starts[i + 1].index : fullText.length;
                const entryText = fullText.slice(startIdx, endIdx).trim();

                const entryMatch = entryText.match(/^([\d,]+)\s*gp\s+([\s\S]*?)\s*([+-]\d+)\s*$/i);

                if (entryMatch) {
                    const cost = parseInt(entryMatch[1].replace(/,/g, '')) || 0;
                    const description = entryMatch[2].replace(/\s+/g, ' ').trim();
                    const bonus = parseInt(entryMatch[3]) || 0;
                    entries.push({ cost, description, bonus });
                } else {
                    const cost = parseInt(starts[i].cost) || 0;
                    const afterCost = entryText.replace(/^[\d,]+\s*gp\s*/i, '');
                    const bonusMatch = afterCost.match(/([+-]\d+)\s*$/);
                    const bonus = bonusMatch ? parseInt(bonusMatch[1]) : i;
                    const description = bonusMatch
                        ? afterCost.replace(/[+-]\d+\s*$/, '').replace(/\s+/g, ' ').trim()
                        : afterCost.replace(/\s+/g, ' ').trim();
                    entries.push({ cost, description, bonus });
                }
            }

            const tiersContainer = html.find('.tiers-list');
            tiersContainer.empty();

            entries.forEach((tier, index) => {
                tiersContainer.append(this._createTierRowHtml(index, tier));
            });

            ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
        }
    }

    /**
     * Import outcomes from text format
     */
    async _importOutcomes(html) {
        const content = `
            <p>Paste outcome entries. Each entry starts with a roll number and ends with the benefit.</p>
            <p><small>Format: roll, description, benefit. Entries can span multiple lines.<br>
            Example: "3 You wake up in a gutter with 15%<br>
            of your total wealth spent Gain 3 XP"</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await foundry.applications.api.DialogV2.prompt({
            window: { title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_outcomes") },
            content,
            ok: {
                label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
                callback: (event, button, dialog) => dialog.element.querySelector("#import-text")?.value
            },
            rejectClose: false
        });

        if (result) {
            const fullText = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const entryPattern = /(?:^|\n)((?:[1-9]|1[0-9]|20)\+?)\s+/g;

            const entries = [];
            let match;
            const starts = [];

            while ((match = entryPattern.exec(fullText)) !== null) {
                starts.push({
                    index: match.index,
                    roll: match[1]
                });
            }

            for (let i = 0; i < starts.length; i++) {
                const startIdx = starts[i].index;
                const endIdx = (i + 1 < starts.length) ? starts[i + 1].index : fullText.length;
                const entryText = fullText.slice(startIdx, endIdx).trim();

                const roll = starts[i].roll;
                const afterRoll = entryText.replace(/^(?:[1-9]|1[0-9]|20)\+?\s+/, '');

                const benefitMatch = afterRoll.match(/\s+(Gain\s+[\s\S]*?)\s*$/);
                let description, benefit;

                if (benefitMatch) {
                    benefit = benefitMatch[1].replace(/\s+/g, ' ').trim();
                    description = afterRoll.slice(0, afterRoll.length - benefitMatch[0].length).replace(/\s+/g, ' ').trim();
                } else {
                    description = afterRoll.replace(/\s+/g, ' ').trim();
                    benefit = "";
                }

                entries.push({ roll, description, benefit });
            }

            const outcomesContainer = html.find('.outcomes-list');
            outcomesContainer.empty();

            entries.forEach((outcome, index) => {
                outcomesContainer.append(this._createOutcomeRowHtml(index, outcome));
            });

            ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
        }
    }

    /**
     * Export a table as JSON file
     */
    _exportTable(tableId) {
        const tables = getCustomCarousingTables();
        const table = tables.find(t => t.id === tableId);
        if (!table) {
            ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.table_not_found"));
            return;
        }

        const exportData = {
            type: "shadowdark-carousing-table",
            version: 1,
            table: foundry.utils.deepClone(table)
        };

        const filename = `${table.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_carousing.json`;
        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "application/json", filename);

        ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.table_exported", { name: table.name }));
    }

    /**
     * Import a table from JSON file
     */
    async _importTable() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importData = JSON.parse(text);

                if (importData.type !== "shadowdark-carousing-table" || !importData.table) {
                    ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.invalid_import_file"));
                    return;
                }

                const tableData = importData.table;
                tableData.id = foundry.utils.randomID();
                if (!tableData.name) tableData.name = "Imported Table";
                if (!Array.isArray(tableData.tiers)) tableData.tiers = [];
                if (!Array.isArray(tableData.outcomes)) tableData.outcomes = [];

                const tables = getCustomCarousingTables();
                tables.push(tableData);
                await saveCustomCarousingTables(tables);

                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.table_imported", { name: tableData.name }));
                this.render();
            } catch (err) {
                console.error("Failed to import carousing table:", err);
                ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_error"));
            }
        };

        input.click();
    }
}

/**
 * Open the carousing tables editor
 */
export function openCarousingTablesEditor() {
    new CarousingTablesApp().render({ force: true });
}
