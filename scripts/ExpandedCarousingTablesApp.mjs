import {
    getExpandedCarousingTables,
    saveExpandedCarousingTables,
    getDefaultExpandedData
} from "./CarousingSD.mjs";

export default class ExpandedCarousingTablesApp extends FormApplication {
    constructor(object, options) {
        super(object, options);
        this.editingTable = null;
        this._currentTab = "tiers"; // Track current tab for persistence
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "shadowdark-expanded-carousing-tables",
            classes: ["shadowdark-extras", "expanded-carousing-tables-app"],
            title: "Expanded Carousing Tables Editor",
            template: "modules/shadowdark-extras/templates/expanded-carousing-tables-app.hbs",
            width: 800,
            height: 700,
            scrollY: [".scrollable-list"],
            closeOnSubmit: false,
            submitOnChange: false,
            submitOnClose: false,
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: ".tab-content", initial: "tiers" }]
        });
    }

    getData() {
        const tables = getExpandedCarousingTables();
        const activeTab = this._tabs?.[0]?.active || "tiers";

        return {
            tables: tables, // List of tables for the list view
            isEditing: !!this.editingTable, // Whether we are in edit mode
            editingTable: this.editingTable, // The table currently being edited
            activeTab: activeTab,
            // Pre-calculated default/empty arrays to ensure structure exists in template loop if array is empty
            // Though Handlebars usually handles empty arrays fine by just not rendering
            defaultTiers: getDefaultExpandedData().tiers,
            defaultOutcomes: getDefaultExpandedData().outcomes,
            defaultBenefits: getDefaultExpandedData().benefits,
            defaultMishaps: getDefaultExpandedData().mishaps
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Sidebar Actions (List View)
        html.find('[data-action="new-table"]').click(this._onNewTable.bind(this));
        html.find('[data-action="edit-table"]').click(this._onEditTable.bind(this));
        html.find('[data-action="delete-table"]').click(this._onDeleteTable.bind(this));
        html.find('[data-action="export-table"]').click(this._onExportTable.bind(this));
        html.find('[data-action="import-table"]').click(this._onImportTable.bind(this));

        // Editor Actions (Edit View)
        html.find('[data-action="cancel-edit"]').click(this._onCancelEdit.bind(this));

        // Add Row Actions
        html.find('[data-action="add-tier"]').click(this._onAddTier.bind(this));
        html.find('[data-action="add-outcome"]').click(this._onAddOutcome.bind(this));
        html.find('[data-action="add-benefit"]').click(this._onAddBenefit.bind(this));
        html.find('[data-action="add-mishap"]').click(this._onAddMishap.bind(this));

        // Remove Row Actions
        html.find('[data-action="remove-row"]').click(this._onRemoveRow.bind(this));

        // Reset/Import Actions
        html.find('[data-action="reset-tiers"]').click(() => this._onResetSection("tiers"));
        html.find('[data-action="reset-outcomes"]').click(() => this._onResetSection("outcomes"));
        html.find('[data-action="reset-benefits"]').click(() => this._onResetSection("benefits"));
        html.find('[data-action="reset-mishaps"]').click(() => this._onResetSection("mishaps"));
        html.find('[data-action="import-tiers"]').click(this._onImportTiers.bind(this));
        html.find('[data-action="import-outcomes"]').click(this._onImportOutcomes.bind(this));
        html.find('[data-action="import-benefits"]').click(this._onImportBenefits.bind(this));
        html.find('[data-action="import-mishaps"]').click(this._onImportMishaps.bind(this));

        // Tab switching (manual jQuery approach like CarousingTablesApp)
        html.find('.tabs .item').click((event) => {
            event.preventDefault();
            const tab = $(event.currentTarget).data('tab');
            this._currentTab = tab; // Remember the active tab
            html.find('.tabs .item').removeClass('active');
            $(event.currentTarget).addClass('active');
            html.find('.tab-pane').removeClass('active');
            html.find(`.tab-pane[data-tab="${tab}"]`).addClass('active');
        });

        // Restore last active tab if we have one
        if (this._currentTab && this._currentTab !== "tiers") {
            html.find('.tabs .item').removeClass('active');
            html.find(`.tabs .item[data-tab="${this._currentTab}"]`).addClass('active');
            html.find('.tab-pane').removeClass('active');
            html.find(`.tab-pane[data-tab="${this._currentTab}"]`).addClass('active');
        }
    }

    _onNewTable(event) {
        event.preventDefault();
        const defaultData = getDefaultExpandedData();
        // Create a new empty table structure
        this.editingTable = {
            ...defaultData,
            id: null, // New table has no ID initially
            name: "New Expanded Table",
            // Use defaults for structure
            tiers: foundry.utils.deepClone(defaultData.tiers),
            outcomes: foundry.utils.deepClone(defaultData.outcomes),
            benefits: foundry.utils.deepClone(defaultData.benefits),
            mishaps: foundry.utils.deepClone(defaultData.mishaps)
        };
        this.render(true);
    }

    _onEditTable(event) {
        event.preventDefault();
        const tableId = event.currentTarget.dataset.tableId;
        const tables = getExpandedCarousingTables();
        const table = tables.find(t => t.id === tableId);
        if (table) {
            this.editingTable = foundry.utils.deepClone(table);
            this.render(true);
        }
    }

    async _onDeleteTable(event) {
        event.preventDefault();
        const tableId = event.currentTarget.dataset.tableId;

        const confirm = await Dialog.confirm({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.delete_table"),
            content: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.delete_confirm")
        });

        if (confirm) {
            const tables = getExpandedCarousingTables().filter(t => t.id !== tableId);
            await saveExpandedCarousingTables(tables);
            this.render(true);
        }
    }

    _onCancelEdit(event) {
        event.preventDefault();
        this.editingTable = null;
        this.render(true);
    }

    _onAddTier(event) {
        event.preventDefault();
        if (!this.editingTable) return;
        this.editingTable.tiers.push({ cost: 0, bonus: 0, description: "" });
        this.render(true);
    }

    _onAddOutcome(event) {
        event.preventDefault();
        if (!this.editingTable) return;
        const nextRoll = this.editingTable.outcomes.length + 1;
        this.editingTable.outcomes.push({
            roll: nextRoll,
            mishaps: 0,
            benefits: 0,
            modifier: 0,
            xp: 0
        });
        this.render(true);
    }

    _onAddBenefit(event) {
        event.preventDefault();
        if (!this.editingTable) return;
        const nextRoll = this.editingTable.benefits.length + 1;
        this.editingTable.benefits.push({ roll: nextRoll, description: "" });
        this.render(true);
    }

    _onAddMishap(event) {
        event.preventDefault();
        if (!this.editingTable) return;
        const nextRoll = this.editingTable.mishaps.length + 1;
        this.editingTable.mishaps.push({ roll: nextRoll, description: "" });
        this.render(true);
    }

    _onRemoveRow(event) {
        event.preventDefault();
        const row = $(event.currentTarget).closest('.table-row, .outcome-row');
        const index = row.index();
        const parentList = row.parent();

        if (parentList.hasClass('tiers-list')) {
            this.editingTable.tiers.splice(index, 1);
        } else if (parentList.hasClass('outcomes-list')) {
            this.editingTable.outcomes.splice(index, 1);
        } else if (parentList.hasClass('benefits-list')) {
            this.editingTable.benefits.splice(index, 1);
        } else if (parentList.hasClass('mishaps-list')) {
            this.editingTable.mishaps.splice(index, 1);
        }

        this.render(true);
    }

    _onResetSection(section) {
        if (!this.editingTable) return;
        const defaults = getDefaultExpandedData();

        // Confirm before resetting
        Dialog.confirm({
            title: `Reset ${section}`,
            content: "Are you sure you want to reset this section to defaults?",
            yes: () => {
                this.editingTable[section] = foundry.utils.deepClone(defaults[section]);
                this.render(true);
            }
        });
    }

    async _updateObject(event, formData) {
        if (!this.editingTable) return;

        // Extract basic fields
        this.editingTable.name = formData.name;

        // Helper to reconstruct array from indexed fields
        const extractArray = (prefix, fields) => {
            const list = [];
            let i = 0;
            // Scan for index-0, index-1, etc until no more found
            while (formData.hasOwnProperty(`${prefix}-${fields[0]}-${i}`)) {
                const item = {};
                for (const field of fields) {
                    let val = formData[`${prefix}-${field}-${i}`];
                    // Convert numeric fields
                    if (['cost', 'bonus', 'roll', 'mishaps', 'benefits', 'modifier', 'xp'].includes(field)) {
                        val = parseInt(val) || 0;
                    }
                    item[field] = val;
                }
                list.push(item);
                i++;
            }
            return list;
        };

        this.editingTable.tiers = extractArray('tier', ['cost', 'bonus', 'description']);
        this.editingTable.outcomes = extractArray('outcome', ['roll', 'mishaps', 'benefits', 'modifier', 'xp']);
        this.editingTable.benefits = extractArray('benefit', ['roll', 'description']);
        this.editingTable.mishaps = extractArray('mishap', ['roll', 'description']);

        // Check ID
        if (!this.editingTable.id) {
            this.editingTable.id = foundry.utils.randomID();
        }

        // Save to journal
        const tables = getExpandedCarousingTables();
        const existingIndex = tables.findIndex(t => t.id === this.editingTable.id);

        if (existingIndex >= 0) {
            tables[existingIndex] = this.editingTable;
        } else {
            tables.push(this.editingTable);
        }

        await saveExpandedCarousingTables(tables);

        // Return to list view
        this.editingTable = null;
        this.render(true);
    }

    /**
     * Export a table as JSON file
     */
    _onExportTable(event) {
        event.preventDefault();
        const tableId = event.currentTarget.dataset.tableId;
        const tables = getExpandedCarousingTables();
        const table = tables.find(t => t.id === tableId);
        if (!table) {
            ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.table_not_found"));
            return;
        }

        // Create export data (include type for import validation)
        const exportData = {
            type: "shadowdark-expanded-carousing-table",
            version: 1,
            table: foundry.utils.deepClone(table)
        };

        // Create and download the file using Foundry's utility (works in both browser and Electron)
        const filename = `${table.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_expanded_carousing.json`;
        const data = JSON.stringify(exportData, null, 2);
        saveDataToFile(data, "application/json", filename);

        ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.table_exported", { name: table.name }));
    }

    /**
     * Import a table from JSON file
     */
    async _onImportTable(event) {
        event.preventDefault();

        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.onchange = async (fileEvent) => {
            const file = fileEvent.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const importData = JSON.parse(text);

                // Validate import data
                if (importData.type !== "shadowdark-expanded-carousing-table" || !importData.table) {
                    ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.invalid_import_file"));
                    return;
                }

                const tableData = importData.table;

                // Generate new ID for imported table
                tableData.id = foundry.utils.randomID();

                // Ensure required fields exist
                if (!tableData.name) tableData.name = "Imported Table";
                if (!Array.isArray(tableData.tiers)) tableData.tiers = [];
                if (!Array.isArray(tableData.outcomes)) tableData.outcomes = [];
                if (!Array.isArray(tableData.benefits)) tableData.benefits = [];
                if (!Array.isArray(tableData.mishaps)) tableData.mishaps = [];

                // Add to existing tables
                const tables = getExpandedCarousingTables();
                tables.push(tableData);
                await saveExpandedCarousingTables(tables);

                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.table_imported", { name: tableData.name }));
                this.render(true);
            } catch (err) {
                console.error("Failed to import expanded carousing table:", err);
                ui.notifications.error(game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_error"));
            }
        };

        input.click();
    }

    /**
     * Import tiers from text format
     * Format: "cost gp description +bonus" per line
     * Example: "30 gp Night at the tavern to toast and gossip +0"
     */
    async _onImportTiers(event) {
        event.preventDefault();
        if (!this.editingTable) return;

        const content = `
            <p>Paste tier entries. Each line: <code>cost gp description +bonus</code></p>
            <p><small>Example:<br>
            30 gp Night at the tavern to toast and gossip +0<br>
            100 gp Festive day of high spirits and revelry +1</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await Dialog.prompt({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_tiers"),
            content: content,
            label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
            callback: (html) => html.find('#import-text').val()
        });

        if (result) {
            const lines = result.split('\n').filter(l => l.trim());
            const entries = [];

            for (const line of lines) {
                // Pattern: "cost gp description +bonus" or "cost gp description -bonus"
                // Cost can have commas (e.g., 1,200 gp)
                const match = line.match(/^([\d,]+)\s*gp\s+(.+?)\s*([+-]\d+)\s*$/i);

                if (match) {
                    const cost = parseInt(match[1].replace(/,/g, '')) || 0;
                    const description = match[2].trim();
                    const bonus = parseInt(match[3]) || 0;
                    entries.push({ cost, bonus, description });
                }
            }

            if (entries.length > 0) {
                this.editingTable.tiers = entries;
                this.render(true);
                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
            } else {
                ui.notifications.warn("No valid tier entries found. Format: cost gp description +bonus");
            }
        }
    }

    /**
     * Import outcomes from text format
     * Format per line: roll mishaps benefits modifier xp
     * Example: "1 2 - -20 2" means roll=1, mishaps=2, benefits=0, modifier=-20, xp=2
     * "-" means 0 for numeric fields
     */
    async _onImportOutcomes(event) {
        event.preventDefault();
        if (!this.editingTable) return;

        const content = `
            <p>Paste outcome entries. Each line: <code>roll mishaps benefits modifier xp</code></p>
            <p><small>Use "-" for 0. Example:<br>
            1 2 - -20 2<br>
            5 - 1 -10 3<br>
            25+ - 3 +25 10</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await Dialog.prompt({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_outcomes"),
            content: content,
            label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
            callback: (html) => html.find('#import-text').val()
        });

        if (result) {
            const lines = result.split('\n').filter(l => l.trim());
            const entries = [];

            for (const line of lines) {
                // Split by whitespace
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5) {
                    // Parse roll (can be "25+" format)
                    const rollStr = parts[0].replace('+', '');
                    const roll = parseInt(rollStr) || entries.length + 1;

                    // Parse other fields, "-" means 0
                    const parseField = (val) => val === '-' ? 0 : parseInt(val) || 0;

                    const mishaps = parseField(parts[1]);
                    const benefits = parseField(parts[2]);

                    // Modifier can be "+20", "-20", or "-" for 0
                    let modifier = 0;
                    if (parts[3] !== '-') {
                        modifier = parseInt(parts[3]) || 0;
                    }

                    const xp = parseField(parts[4]);

                    entries.push({ roll, mishaps, benefits, modifier, xp });
                }
            }

            if (entries.length > 0) {
                this.editingTable.outcomes = entries;
                this.render(true);
                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
            } else {
                ui.notifications.warn("No valid outcome entries found. Format: roll mishaps benefits modifier xp");
            }
        }
    }

    /**
     * Import benefits from text format
     * Format per line: roll description
     * Example: "01 You drank with a gossiper and learned a random rumor"
     */
    async _onImportBenefits(event) {
        event.preventDefault();
        if (!this.editingTable) return;

        const content = `
            <p>Paste benefit entries. Each line: <code>roll description</code></p>
            <p><small>Roll can have leading zeros (01, 02). Example:<br>
            01 Terrible luck dogs you; re-roll this benefit as a mishap<br>
            02 You drank with a gossiper and learned a random rumor</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await Dialog.prompt({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_benefits"),
            content: content,
            label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
            callback: (html) => html.find('#import-text').val()
        });

        if (result) {
            const lines = result.split('\n').filter(l => l.trim());
            const entries = [];

            for (const line of lines) {
                // Pattern: roll (1-3 digits) followed by space and description
                const match = line.match(/^(\d{1,3})\s+(.+)$/);
                if (match) {
                    const roll = parseInt(match[1]) || entries.length + 1;
                    const description = match[2].trim();
                    entries.push({ roll, description });
                }
            }

            if (entries.length > 0) {
                this.editingTable.benefits = entries;
                this.render(true);
                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
            } else {
                ui.notifications.warn("No valid benefit entries found. Format: roll description");
            }
        }
    }

    /**
     * Import mishaps from text format
     * Format per line: roll description
     * Example: "01 You wake up in the Duke's Donjon accused of a major crime"
     */
    async _onImportMishaps(event) {
        event.preventDefault();
        if (!this.editingTable) return;

        const content = `
            <p>Paste mishap entries. Each line: <code>roll description</code></p>
            <p><small>Roll can have leading zeros (01, 02). Example:<br>
            01 You wake up in the Duke's Donjon accused of a major crime<br>
            02 You wake up in the stocks accused of a minor crime</small></p>
            <textarea id="import-text" style="width:100%; height:300px;"></textarea>
        `;

        const result = await Dialog.prompt({
            title: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import_mishaps"),
            content: content,
            label: game.i18n.localize("SHADOWDARK_EXTRAS.carousing.import"),
            callback: (html) => html.find('#import-text').val()
        });

        if (result) {
            const lines = result.split('\n').filter(l => l.trim());
            const entries = [];

            for (const line of lines) {
                // Pattern: roll (1-3 digits) followed by space and description
                const match = line.match(/^(\d{1,3})\s+(.+)$/);
                if (match) {
                    const roll = parseInt(match[1]) || entries.length + 1;
                    const description = match[2].trim();
                    entries.push({ roll, description });
                }
            }

            if (entries.length > 0) {
                this.editingTable.mishaps = entries;
                this.render(true);
                ui.notifications.info(game.i18n.format("SHADOWDARK_EXTRAS.carousing.imported_count", { count: entries.length }));
            } else {
                ui.notifications.warn("No valid mishap entries found. Format: roll description");
            }
        }
    }
}

export function openExpandedCarousingTablesEditor() {
    new ExpandedCarousingTablesApp().render(true);
}
