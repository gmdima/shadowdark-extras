/**
 * Wall Context Menu for Shadowdark Extras
 * Adds a right-click menu to walls for quick state toggling
 */

const MODULE_ID = "shadowdark-extras";

export class WallContextMenuSD {
    static initialize() {
        console.log("Shadowdark Extras | Initializing Wall Context Menu");

        // Hook into the right-click event on the WallsLayer (background)
        const WallsLayerClass = foundry.canvas?.layers?.WallsLayer || globalThis.WallsLayer;
        if (typeof libWrapper === "function") {
            libWrapper.register(MODULE_ID, "WallsLayer.prototype._onClickRight", this._onLayerRightClick, "WRAPPER");
            libWrapper.register(MODULE_ID, "Wall.prototype._onClickRight", this._onWallRightClick, "WRAPPER");
        } else {
            const originalLayer = WallsLayerClass.prototype._onClickRight;
            WallsLayerClass.prototype._onClickRight = function (event) {
                WallContextMenuSD._onLayerRightClick.call(this, originalLayer, event);
            };

            const originalWall = Wall.prototype._onClickRight;
            Wall.prototype._onClickRight = function (event) {
                WallContextMenuSD._onWallRightClick.call(this, originalWall, event);
            };
        }
    }

    /**
     * Intercept right-click on the walls layer background
     */
    static _onLayerRightClick(wrapped, event) {

        // Always chain the call first or last to avoid libWrapper warnings
        const result = wrapped(event);

        if (!game.user.isGM) return result;

        // Try to find the point in various ways depending on Foundry version/event type
        const point = event.interactionData?.origin || event.data?.origin || canvas.mousePosition;
        if (!point) return result;

        const wall = WallContextMenuSD._getWallAtPoint(point);
        if (!wall) return result;

        WallContextMenuSD._handleEvent(wall, event);
        return result;
    }

    /**
     * Intercept right-click directly on a wall object
     */
    static _onWallRightClick(wrapped, event) {
        console.log("Shadowdark Extras | Wall object right-click detected:", this.id);

        // Always chain
        const result = wrapped(event);

        if (!game.user.isGM) return result;

        WallContextMenuSD._handleEvent(this, event);
        return result;
    }

    static _handleEvent(wall, event) {
        // Prevent default HUD or other right-click behavior
        const originalEvent = event.data?.originalEvent || event.nativeEvent || event;
        if (originalEvent?.preventDefault) originalEvent.preventDefault();
        if (originalEvent?.stopPropagation) originalEvent.stopPropagation();

        // Show our context menu
        WallContextMenuSD.showMenu(wall, event);
    }

    /**
     * Helper to find a wall at a specific canvas coordinate
     */
    static _getWallAtPoint(point) {
        const tolerance = 20; // Increased tolerance for easier clicking
        return canvas.walls.placeables.find(w => {
            const [x1, y1, x2, y2] = w.document.c;

            // Point-to-segment distance math
            const l2 = Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2);
            if (l2 === 0) return Math.sqrt(Math.pow(point.x - x1, 2) + Math.pow(point.y - y1, 2)) <= tolerance;

            let t = ((point.x - x1) * (x2 - x1) + (point.y - y1) * (y2 - y1)) / l2;
            t = Math.max(0, Math.min(1, t));

            const dist = Math.sqrt(
                Math.pow(point.x - (x1 + t * (x2 - x1)), 2) +
                Math.pow(point.y - (y1 + t * (y2 - y1)), 2)
            );

            return dist <= tolerance;
        });
    }

    /**
     * Render the context menu
     */
    static showMenu(wall, event) {
        const wallDoc = wall.document;
        const isDoor = wallDoc.door !== CONST.WALL_DOOR_TYPES.NONE;

        const globalPoint = event.global || event.data?.global || { x: event.clientX, y: event.clientY };
        const canvasRect = canvas.app.view.getBoundingClientRect();
        const x = canvasRect.left + (globalPoint?.x || 0);
        const y = canvasRect.top + (globalPoint?.y || 0);

        const menuItems = [];

        // Door Specific Options
        if (isDoor) {
            // Toggle Lock State
            const isLocked = wallDoc.ds === CONST.WALL_DOOR_STATES.LOCKED;
            menuItems.push({
                name: isLocked ? "Unlock Door" : "Lock Door",
                icon: isLocked ? '<i class="fas fa-unlock"></i>' : '<i class="fas fa-lock"></i>',
                callback: () => wallDoc.update({ ds: isLocked ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.LOCKED })
            });

            // Toggle Open/Closed
            const isOpen = wallDoc.ds === CONST.WALL_DOOR_STATES.OPEN;
            menuItems.push({
                name: isOpen ? "Close Door" : "Open Door",
                icon: isOpen ? '<i class="fas fa-door-closed"></i>' : '<i class="fas fa-door-open"></i>',
                callback: () => wallDoc.update({ ds: isOpen ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN })
            });

            menuItems.push({ type: "separator" });
        }

        // Wall Direction
        const dir = wallDoc.dir || CONST.WALL_DIRECTIONS.BOTH;
        const directionNames = {
            [CONST.WALL_DIRECTIONS.BOTH]: "Both Directions",
            [CONST.WALL_DIRECTIONS.LEFT]: "Left Only (Clockwise)",
            [CONST.WALL_DIRECTIONS.RIGHT]: "Right Only (Counter-Clockwise)"
        };

        menuItems.push({
            name: `Direction: ${directionNames[dir]}`,
            icon: '<i class="fas fa-arrows-left-right"></i>',
            callback: () => {
                let nextDir;
                if (dir === CONST.WALL_DIRECTIONS.BOTH) nextDir = CONST.WALL_DIRECTIONS.LEFT;
                else if (dir === CONST.WALL_DIRECTIONS.LEFT) nextDir = CONST.WALL_DIRECTIONS.RIGHT;
                else nextDir = CONST.WALL_DIRECTIONS.BOTH;
                wallDoc.update({ dir: nextDir });
            }
        });

        // Wall Type Conversion
        if (wallDoc.door === CONST.WALL_DOOR_TYPES.NONE) {
            menuItems.push({
                name: "Convert to Door",
                icon: '<i class="fas fa-door-open"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.DOOR })
            });
            menuItems.push({
                name: "Convert to Secret Door",
                icon: '<i class="fas fa-user-secret"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.SECRET })
            });
        } else if (wallDoc.door === CONST.WALL_DOOR_TYPES.DOOR) {
            menuItems.push({
                name: "Convert to Wall",
                icon: '<i class="fas fa-border-all"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.NONE })
            });
            menuItems.push({
                name: "Convert to Secret Door",
                icon: '<i class="fas fa-user-secret"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.SECRET })
            });
        } else if (wallDoc.door === CONST.WALL_DOOR_TYPES.SECRET) {
            menuItems.push({
                name: "Convert to Door",
                icon: '<i class="fas fa-door-open"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.DOOR })
            });
            menuItems.push({
                name: "Convert to Wall",
                icon: '<i class="fas fa-border-all"></i>',
                callback: () => wallDoc.update({ door: CONST.WALL_DOOR_TYPES.NONE })
            });
        }

        menuItems.push({ type: "separator" });

        // GM Notes
        const hasNotes = !!wallDoc.getFlag(MODULE_ID, "notes");
        menuItems.push({
            name: "GM Notes",
            icon: `<i class="${hasNotes ? "fas fa-sticky-note" : "far fa-sticky-note"}" ${hasNotes ? 'style="color: #4ade80;"' : ""}></i>`,
            callback: async () => {
                const { PlaceableNotesSD } = await import("./PlaceableNotesSD.mjs");
                new PlaceableNotesSD(wallDoc).render(true);
            }
        });

        const blocksMove = wallDoc.move !== CONST.WALL_MOVEMENT_TYPES.NONE;
        menuItems.push({
            name: blocksMove ? "Allow Movement" : "Block Movement",
            icon: blocksMove ? '<i class="fas fa-walking"></i>' : '<i class="fas fa-hand-paper"></i>',
            callback: () => wallDoc.update({ move: blocksMove ? CONST.WALL_MOVEMENT_TYPES.NONE : CONST.WALL_MOVEMENT_TYPES.NORMAL })
        });

        menuItems.push({ type: "separator" });

        // Delete Wall
        menuItems.push({
            name: "Delete Wall",
            icon: '<i class="fas fa-trash"></i>',
            callback: () => wallDoc.delete()
        });

        this._renderMenu(menuItems, x, y);
    }

    /**
     * Internal DOM renderer for the menu
     */
    static _renderMenu(menuItems, x, y) {
        const existing = document.getElementById("sdx-wall-context-menu");
        if (existing) existing.remove();

        const menu = document.createElement("div");
        menu.id = "sdx-wall-context-menu";
        menu.className = "sdx-wall-context-menu";
        menu.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:20000;`;

        menuItems.forEach(item => {
            if (item.type === "separator") {
                const sep = document.createElement("hr");
                sep.className = "sdx-wall-menu-separator";
                menu.appendChild(sep);
                return;
            }

            const menuItem = document.createElement("div");
            menuItem.className = "sdx-wall-menu-item";
            menuItem.innerHTML = `${item.icon} <span>${item.name}</span>`;
            menuItem.addEventListener("click", (e) => {
                e.stopPropagation();
                item.callback();
                menu.remove();
            });
            menu.appendChild(menuItem);
        });

        document.body.appendChild(menu);

        // Close logic
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener("click", closeMenu);
                document.removeEventListener("contextmenu", closeMenu);
                document.removeEventListener("keydown", closeOnEscape);
            }
        };
        const closeOnEscape = (e) => {
            if (e.key === "Escape") {
                menu.remove();
                document.removeEventListener("click", closeMenu);
                document.removeEventListener("contextmenu", closeMenu);
                document.removeEventListener("keydown", closeOnEscape);
            }
        };

        setTimeout(() => {
            document.addEventListener("click", closeMenu);
            document.addEventListener("contextmenu", closeMenu);
            document.addEventListener("keydown", closeOnEscape);
        }, 10);
    }
}
