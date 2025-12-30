import {
    getExpandedCarousingTables,
    saveExpandedCarousingTables,
    getDefaultExpandedData
} from "./CarousingSD.mjs";

export default class ExpandedCarousingTablesApp extends FormApplication {
    constructor(object, options) {
        super(object, options);
        this.editingTable = null;
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
            resizable: true
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

        // Tab switching
        if (this._tabs?.[0]) {
            this._tabs[0].bind(html[0]);
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
}

export function openExpandedCarousingTablesEditor() {
    new ExpandedCarousingTablesApp().render(true);
}
