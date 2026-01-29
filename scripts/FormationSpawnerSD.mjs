/**
 * Formation Spawner for Shadowdark Extras
 * 
 * Allows a GM to arrange party members on a grid and spawn them
 * in formation on the canvas by dragging the spawn button.
 * Adapted from osr-helper's party-sheet formation feature.
 */

const MODULE_ID = "shadowdark-extras";
const SETTING_KEY_FORMATION = "currentFormation";

/**
 * Formation Spawner Application
 */
export class FormationSpawnerSD extends FormApplication {
    static _instance = null;

    constructor(options = {}) {
        super(options);
        this.gridSize = 7; // Default 7x7 grid
        this.formation = null;
        this.tempFormation = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "sdx-formation-spawner",
            title: game.i18n?.localize("SDX.formationSpawner.title") || "Formation Spawner",
            classes: ["sdx-formation-spawner-app", "shadowdark"],
            template: "modules/shadowdark-extras/templates/formation-spawner.hbs",
            width: 420,
            height: "auto",
            resizable: true,
            dragDrop: [
                { dragSelector: ".pool-member", dropSelector: ".formation-grid" },
                { dragSelector: ".grid-marker", dropSelector: ".formation-grid" },
                { dragSelector: ".spawn-btn" }
            ]
        });
    }

    /**
     * Show the formation spawner (singleton pattern)
     */
    static show() {
        if (!game.user.isGM) {
            ui.notifications.warn("Only the GM can use the Formation Spawner.");
            return;
        }

        if (!FormationSpawnerSD._instance) {
            FormationSpawnerSD._instance = new FormationSpawnerSD();
        }
        FormationSpawnerSD._instance.render(true);
    }

    /**
     * Initialize formation spawner settings
     */
    static registerSettings() {
        game.settings.register(MODULE_ID, SETTING_KEY_FORMATION, {
            name: "Current Formation",
            scope: "world",
            config: false,
            type: Object,
            default: { active: false, data: null, gridSize: 7 }
        });
    }

    /**
     * Get data for template rendering
     */
    async getData(options = {}) {
        const context = await super.getData(options);

        // Load or create formation data
        await this._loadFormation();

        // Refresh pool to ensure validity (removes deleted actors)
        await this.refreshPool();

        // Get party members for the pool
        context.pool = this.formation.pool;
        context.gridHtml = this._generateGrid();
        context.gridSize = this.gridSize;

        return context;
    }

    /**
     * Load formation from settings or create default
     */
    async _loadFormation() {
        const savedFormation = game.settings.get(MODULE_ID, SETTING_KEY_FORMATION);

        if (savedFormation?.active && savedFormation?.data) {
            this.formation = savedFormation.data;
            this.gridSize = savedFormation.gridSize || 7;
        } else {
            this.formation = await this._createDefaultFormation();
        }
    }

    /**
     * Create default formation data
     */
    async _createDefaultFormation() {
        const center = Math.floor(this.gridSize / 2);
        const data = {
            lead: [center, center], // Center cell is the leader position
            pool: [],
            grid: []
        };

        // Get party actors (player-owned characters)
        const partyActors = game.actors.filter(a =>
            a.type === "Player" && a.hasPlayerOwner
        );

        // Add actors to pool
        for (const actor of partyActors) {
            data.pool.push({
                uuid: actor.uuid,
                img: actor.img,
                name: actor.name
            });
        }

        // Initialize empty grid
        for (let r = 0; r < this.gridSize; r++) {
            const row = [];
            for (let c = 0; c < this.gridSize; c++) {
                row.push({ uuid: null, img: null, name: null });
            }
            data.grid.push(row);
        }

        return data;
    }

    /**
     * Generate the formation grid HTML
     */
    _generateGrid() {
        const lead = this.formation.lead;
        let gridHtml = "";

        for (let r = 0; r < this.gridSize; r++) {
            let rowHtml = "";
            for (let c = 0; c < this.gridSize; c++) {
                const cellData = this.formation.grid?.[r]?.[c];
                const isLeader = lead[0] === r && lead[1] === c;
                const leaderClass = isLeader ? "leader-cell" : "";

                let markerHtml = "";
                if (cellData?.uuid) {
                    markerHtml = `
                        <div class="grid-marker" data-uuid="${cellData.uuid}">
                            <img src="${cellData.img}" title="${cellData.name}" draggable="true"/>
                            <a class="marker-delete" title="Remove"><i class="fa-solid fa-xmark"></i></a>
                        </div>
                    `;
                }

                rowHtml += `
                    <div class="grid-cell ${leaderClass}" 
                         data-type="grid-cell" 
                         data-row="${r}" 
                         data-cell="${c}">
                        ${markerHtml}
                    </div>
                `;
            }
            gridHtml += `<div class="grid-row" data-row="${r}">${rowHtml}</div>`;
        }

        return gridHtml;
    }

    /**
     * Activate event listeners
     */
    activateListeners(html) {
        super.activateListeners(html);

        // Rotate button
        html.find(".rotate-btn").on("click", () => this._rotateFormation());

        // Grid size change
        html.find(".grid-size-select").on("change", (e) => {
            this._changeGridSize(parseInt(e.target.value));
        });

        // Marker delete buttons
        html.find(".marker-delete").on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cell = e.target.closest(".grid-cell");
            const row = parseInt(cell.dataset.row);
            const col = parseInt(cell.dataset.cell);
            this._removeFromGrid(row, col);
        });

        // Set current grid size in select
        html.find(".grid-size-select").val(this.gridSize);
    }

    /**
     * Handle drag start
     */
    _onDragStart(event) {
        if (!game.user.isGM) return;

        const target = event.target;

        // Spawning to canvas
        if (target.closest(".spawn-btn")) {
            const leader = this._getLeaderFromGrid();
            if (!leader) {
                ui.notifications.warn(
                    game.i18n?.localize("SDX.formationSpawner.noLeader") ||
                    "Please place a party member in the center square."
                );
                return false;
            }

            const dragData = {
                uuid: leader.uuid,
                type: "Actor"
            };
            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));

            // Store formation for spawn
            this.tempFormation = foundry.utils.deepClone(this.formation);

            // Set up hook for token creation
            const offsets = this._getPartyOffsets();
            const hookId = Hooks.once("createToken", async (tokenDoc) => {
                if (tokenDoc.baseActor?.uuid === leader.uuid) {
                    await this._spawnFormationTokens(tokenDoc, offsets);
                }
                this.tempFormation = null;
            });

            // Clean up hook after timeout
            setTimeout(() => {
                Hooks.off("createToken", hookId);
            }, 5000);

            return true;
        }

        // Dragging from pool
        if (target.closest(".pool-member")) {
            const poolMember = target.closest(".pool-member");
            const dragData = {
                uuid: poolMember.dataset.uuid,
                type: "Actor",
                origin: "pool"
            };
            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
            return true;
        }

        // Dragging from grid
        if (target.closest(".grid-marker")) {
            const cell = target.closest(".grid-cell");
            const marker = target.closest(".grid-marker");
            const dragData = {
                uuid: marker.dataset.uuid,
                type: "Actor",
                origin: {
                    row: parseInt(cell.dataset.row),
                    cell: parseInt(cell.dataset.cell)
                }
            };
            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
            return true;
        }

        return false;
    }

    /**
     * Handle drop events
     */
    async _onDrop(event) {
        if (!game.user.isGM) return;

        const dragData = TextEditor.getDragEventData(event);
        if (dragData.type !== "Actor" || !dragData.uuid) return;

        const actor = await fromUuid(dragData.uuid);
        if (!actor) return;

        // Check if dropped on a grid cell
        const targetCell = event.target.closest(".grid-cell");
        if (!targetCell) return;

        const row = parseInt(targetCell.dataset.row);
        const col = parseInt(targetCell.dataset.cell);

        // Get current cell data
        const currentCellData = this.formation.grid[row][col];

        // If cell is occupied, move existing member to pool
        if (currentCellData?.uuid) {
            this.formation.pool.push({
                uuid: currentCellData.uuid,
                img: currentCellData.img,
                name: currentCellData.name
            });
        }

        // Place actor in cell
        this.formation.grid[row][col] = {
            uuid: actor.uuid,
            img: actor.img,
            name: actor.name
        };

        // Remove from pool if coming from pool
        if (dragData.origin === "pool") {
            this.formation.pool = this.formation.pool.filter(p => p.uuid !== actor.uuid);
        }

        // Clear origin cell if coming from grid
        if (dragData.origin?.row !== undefined) {
            this.formation.grid[dragData.origin.row][dragData.origin.cell] = {
                uuid: null,
                img: null,
                name: null
            };
        }

        // Save and re-render
        await this._saveFormation();
        this.render();
    }

    /**
     * Remove a member from the grid back to pool
     */
    async _removeFromGrid(row, col) {
        const cellData = this.formation.grid[row][col];
        if (!cellData?.uuid) return;

        // Add back to pool
        this.formation.pool.push({
            uuid: cellData.uuid,
            img: cellData.img,
            name: cellData.name
        });

        // Clear cell
        this.formation.grid[row][col] = { uuid: null, img: null, name: null };

        await this._saveFormation();
        this.render();
    }

    /**
     * Rotate formation 90 degrees clockwise
     */
    async _rotateFormation() {
        if (!game.user.isGM) return;

        const curGrid = this.formation.grid;
        const newGrid = [];
        const size = this.gridSize;

        // Initialize new grid
        for (let i = 0; i < size; i++) {
            newGrid.push([]);
        }

        // Rotate: new[col][size-1-row] = old[row][col]
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                const newRow = c;
                const newCol = size - 1 - r;
                newGrid[newRow][newCol] = {
                    uuid: curGrid[r][c].uuid,
                    img: curGrid[r][c].img,
                    name: curGrid[r][c].name
                };
            }
        }

        this.formation.grid = newGrid;
        await this._saveFormation();
        this.render();
    }

    /**
     * Change grid size
     */
    async _changeGridSize(newSize) {
        if (!game.user.isGM) return;
        if (![5, 7, 9].includes(newSize)) return;

        // Move all grid members back to pool
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cellData = this.formation.grid[r]?.[c];
                if (cellData?.uuid) {
                    this.formation.pool.push({
                        uuid: cellData.uuid,
                        img: cellData.img,
                        name: cellData.name
                    });
                }
            }
        }

        // Update grid size and recreate
        this.gridSize = newSize;
        const center = Math.floor(newSize / 2);
        this.formation.lead = [center, center];
        this.formation.grid = [];

        for (let r = 0; r < newSize; r++) {
            const row = [];
            for (let c = 0; c < newSize; c++) {
                row.push({ uuid: null, img: null, name: null });
            }
            this.formation.grid.push(row);
        }

        await this._saveFormation();
        this.render();
    }

    /**
     * Get the leader (center cell) from the grid
     */
    _getLeaderFromGrid() {
        const [leadRow, leadCol] = this.formation.lead;
        const cellData = this.formation.grid[leadRow]?.[leadCol];
        return cellData?.uuid ? cellData : null;
    }

    /**
     * Calculate position offsets for all party members relative to leader
     */
    _getPartyOffsets() {
        const [leadRow, leadCol] = this.formation.lead;
        const offsets = [];

        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                // Skip leader position
                if (r === leadRow && c === leadCol) continue;

                const cellData = this.formation.grid[r]?.[c];
                if (cellData?.uuid) {
                    offsets.push({
                        uuid: cellData.uuid,
                        offX: c - leadCol,
                        offY: r - leadRow
                    });
                }
            }
        }

        return offsets;
    }

    /**
     * Spawn formation tokens on the canvas
     */
    async _spawnFormationTokens(leaderTokenDoc, offsets) {
        const scene = game.scenes.current;
        if (!scene) return;

        const gridSize = scene.grid.size;
        const tokenDocs = [];

        for (const member of offsets) {
            const actor = await fromUuid(member.uuid);
            if (!actor) continue;

            let tokenData = await actor.getTokenDocument();
            tokenData = tokenData.toObject();

            tokenData.x = leaderTokenDoc.x + (member.offX * gridSize);
            tokenData.y = leaderTokenDoc.y + (member.offY * gridSize);
            tokenData.actorLink = true;

            tokenDocs.push(tokenData);
        }

        if (tokenDocs.length > 0) {
            await scene.createEmbeddedDocuments("Token", tokenDocs);
            ui.notifications.info(`Spawned ${tokenDocs.length + 1} tokens in formation.`);
        }
    }

    /**
     * Save formation to settings
     */
    async _saveFormation() {
        await game.settings.set(MODULE_ID, SETTING_KEY_FORMATION, {
            active: true,
            data: this.formation,
            gridSize: this.gridSize
        });
    }

    /**
     * Refresh party pool (e.g., when new actors are created)
     */
    async refreshPool() {
        const partyActors = game.actors.filter(a =>
            a.type === "Player" && a.hasPlayerOwner
        );

        // Get UUIDs already on grid
        const gridUuids = new Set();
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const uuid = this.formation.grid[r]?.[c]?.uuid;
                if (uuid) gridUuids.add(uuid);
            }
        }

        // Get existing pool UUIDs
        const poolUuids = new Set(this.formation.pool.map(p => p.uuid));

        // Add new actors to pool
        for (const actor of partyActors) {
            if (!gridUuids.has(actor.uuid) && !poolUuids.has(actor.uuid)) {
                this.formation.pool.push({
                    uuid: actor.uuid,
                    img: actor.img,
                    name: actor.name
                });
            }
        }

        // Remove actors that no longer exist from pool
        const validUuids = new Set(partyActors.map(a => a.uuid));
        this.formation.pool = this.formation.pool.filter(p => validUuids.has(p.uuid));

        // Also clean up the grid (remove invalid actors)
        for (let r = 0; r < this.gridSize; r++) {
            for (let c = 0; c < this.gridSize; c++) {
                const cell = this.formation.grid[r]?.[c];
                if (cell?.uuid && !validUuids.has(cell.uuid)) {
                    // Actor no longer exists, clear cell
                    this.formation.grid[r][c] = { uuid: null, img: null, name: null };
                }
            }
        }

        await this._saveFormation();
    }
}

/**
 * Initialize Formation Spawner
 */
export function initFormationSpawner() {
    // Register settings
    FormationSpawnerSD.registerSettings();
    console.log(`${MODULE_ID} | Formation Spawner initialized`);
}
