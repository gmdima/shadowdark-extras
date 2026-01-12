/**
 * Marching Mode for Shadowdark Extras
 *
 * Allows a GM to designate a party leader and enable marching mode where
 * other tokens follow the leader's exact movement path.
 */

const MODULE_ID = "shadowdark-extras";

// Marching mode state
let marchingModeEnabled = false;
let leaderTokenId = null;
let leaderMovementPath = []; // Array of {x, y, gridPos} points
let tokenFollowers = new Map(); // tokenId -> {marchPosition, moving}
let processingCongaMovement = false;

/**
 * Initialize Marching Mode
 */
export function initMarchingMode() {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Initializing Marching Mode`);

    // Register the renderSidebar hook
    Hooks.on("renderSidebar", onRenderSidebar);

    // If sidebar already exists, inject buttons now
    const sidebar = document.getElementById("sidebar");
    if (sidebar) {
        injectSidebarButtons($(sidebar));
    }

    // Hook into token movement
    Hooks.on("preUpdateToken", onPreUpdateToken);
    Hooks.on("updateToken", onUpdateToken);
}

/**
 * Hook callback for renderSidebar
 */
function onRenderSidebar(sidebar, html) {
    if (!game.user.isGM) return;
    injectSidebarButtons(html);
}

/**
 * Inject sidebar buttons into the given HTML
 */
function injectSidebarButtons($html) {
    const $tabs = $html.find("#sidebar-tabs");
    if (!$tabs.length) {
        console.warn(`${MODULE_ID} | Could not find #sidebar-tabs`);
        return;
    }

    // Check if buttons already exist
    if ($tabs.find(".sdx-marching-leader-btn").length) {
        console.log(`${MODULE_ID} | Marching buttons already exist, skipping injection`);
        return;
    }

    // Find the settings button to insert before it
    const $settingsBtn = $tabs.find('button[data-tab="settings"]').parent();
    if (!$settingsBtn.length) {
        console.warn(`${MODULE_ID} | Could not find settings button to insert marching buttons before`);
        return;
    }

    console.log(`${MODULE_ID} | Injecting marching mode buttons into sidebar`);

    // Create Leader button
    const $leaderBtn = $(`
        <li class="sdx-marching-btn-container">
            <button type="button" class="ui-control plain icon fa-solid fa-crown sdx-marching-leader-btn"
                    data-tooltip="Choose Party Leader" data-tooltip-direction="LEFT">
            </button>
        </li>
    `);

    // Create Movement Mode button
    const $movementBtn = $(`
        <li class="sdx-marching-btn-container">
            <button type="button" class="ui-control plain icon fa-solid fa-person-walking sdx-marching-mode-btn"
                    data-tooltip="Movement Mode" data-tooltip-direction="LEFT">
            </button>
        </li>
    `);

    // Insert before settings
    $settingsBtn.before($leaderBtn);
    $settingsBtn.before($movementBtn);

    // Add event handlers
    $leaderBtn.find("button").on("click", showLeaderDialog);
    $movementBtn.find("button").on("click", showMovementModeDialog);

    // Update button states
    updateButtonStates();
}

/**
 * Show leader selection dialog
 */
function showLeaderDialog() {
    // Get all player-owned tokens on the current scene
    const playerTokens = canvas.tokens.placeables.filter(t => {
        const actor = t.actor;
        return actor && actor.type === "Player" && actor.hasPlayerOwner;
    });

    if (playerTokens.length === 0) {
        ui.notifications.warn("No player tokens found on the current scene.");
        return;
    }

    // Build options
    const options = playerTokens.map(t => {
        const ownerName = getTokenOwnerName(t);
        return `<option value="${t.id}" ${t.id === leaderTokenId ? 'selected' : ''}>
            ${t.name}${ownerName ? ` (${ownerName})` : ''}
        </option>`;
    }).join('');

    const content = `
        <form>
            <div class="form-group">
                <label>Select Party Leader:</label>
                <select name="leaderId" style="width: 100%;">
                    <option value="">None</option>
                    ${options}
                </select>
            </div>
        </form>
    `;

    new Dialog({
        title: "Set Party Leader",
        content: content,
        buttons: {
            set: {
                icon: '<i class="fas fa-check"></i>',
                label: "Set Leader",
                callback: (html) => {
                    const leaderId = html.find('[name="leaderId"]').val();
                    setLeader(leaderId || null);
                }
            },
            cancel: {
                icon: '<i class="fas fa-times"></i>',
                label: "Cancel"
            }
        },
        default: "set"
    }).render(true);
}

/**
 * Show movement mode configuration dialog
 */
function showMovementModeDialog() {
    const content = `
        <form>
            <div class="sdx-movement-mode-options">
                <div class="sdx-movement-option ${!marchingModeEnabled ? 'selected' : ''}" data-mode="free">
                    <i class="fas fa-person-walking"></i>
                    <div class="sdx-movement-option-content">
                        <h3>Free Movement</h3>
                        <p>All party members can move their tokens at will without limitations. Move wisely.</p>
                    </div>
                </div>
                <div class="sdx-movement-option ${marchingModeEnabled ? 'selected' : ''}" data-mode="marching">
                    <i class="fas fa-people-line"></i>
                    <div class="sdx-movement-option-content">
                        <h3>Marching Mode</h3>
                        <p>The party leader moves freely while the remaining party will follow the exact path set by the leader.</p>
                    </div>
                </div>
            </div>
        </form>
    `;

    const dialog = new Dialog({
        title: "Configure Movement Mode",
        content: content,
        buttons: {
            apply: {
                icon: '<i class="fas fa-check"></i>',
                label: "Apply",
                callback: (html) => {
                    const selectedMode = html.find('.sdx-movement-option.selected').data('mode');
                    setMovementMode(selectedMode === 'marching');
                }
            },
            close: {
                icon: '<i class="fas fa-times"></i>',
                label: "Close"
            }
        },
        default: "apply",
        render: (html) => {
            // Make options clickable
            html.find('.sdx-movement-option').on('click', function() {
                html.find('.sdx-movement-option').removeClass('selected');
                $(this).addClass('selected');
            });
        }
    }, {
        width: 480,
        classes: ["sdx-movement-mode-dialog"]
    }).render(true);
}

/**
 * Set the party leader
 */
function setLeader(tokenId) {
    leaderTokenId = tokenId;

    if (tokenId) {
        const token = canvas.tokens.get(tokenId);
        ui.notifications.info(`Party leader set to: ${token?.name || 'Unknown'}`);
    } else {
        ui.notifications.info("Party leader cleared.");
    }

    updateButtonStates();
}

/**
 * Set movement mode
 */
function setMovementMode(enabled) {
    marchingModeEnabled = enabled;

    if (enabled) {
        if (!leaderTokenId) {
            ui.notifications.warn("Please set a party leader first.");
            marchingModeEnabled = false;
            return;
        }
        ui.notifications.info("Marching Mode enabled. Followers will track the leader's path.");
    } else {
        ui.notifications.info("Free Movement enabled.");
        leaderMovementPath = [];
        tokenFollowers.clear();
    }

    updateButtonStates();

    // Calculate initial marching order when enabled
    if (enabled && leaderTokenId) {
        const leaderToken = canvas.tokens.get(leaderTokenId);
        if (leaderToken) {
            calculateMarchingOrder(leaderToken);
        }
    }
}

/**
 * Update button states to show active mode
 */
function updateButtonStates() {
    const $leaderBtn = $("#sidebar-tabs .sdx-marching-leader-btn");
    const $modeBtn = $("#sidebar-tabs .sdx-marching-mode-btn");

    // Update leader button
    if (leaderTokenId) {
        $leaderBtn.addClass("active").css("color", "#ffd700");
    } else {
        $leaderBtn.removeClass("active").css("color", "");
    }

    // Update mode button
    if (marchingModeEnabled) {
        $modeBtn.addClass("active").css("color", "#4CAF50");
    } else {
        $modeBtn.removeClass("active").css("color", "");
    }
}

/**
 * Get the owner name of a token
 */
function getTokenOwnerName(token) {
    if (!token.actor) return null;

    const owners = Object.entries(token.actor.ownership || {})
        .filter(([userId, level]) => level === 3 && userId !== "default")
        .map(([userId]) => game.users.get(userId))
        .filter(user => user && !user.isGM);

    return owners.length > 0 ? owners[0].name : "Gamemaster";
}

/**
 * Hook: Before token update
 */
function onPreUpdateToken(tokenDoc, changes, options, userId) {
    // Skip if no position change
    if (!changes.x && !changes.y) return true;

    if (!marchingModeEnabled) return true;
    if (!leaderTokenId) return true;

    // Allow GM to move any token
    if (game.user.isGM) return true;

    // Check if the token being moved is the leader
    if (tokenDoc.id === leaderTokenId) {
        return true;
    }

    // Allow players to move their own tokens (to join the formation)
    const token = canvas.tokens.get(tokenDoc.id);
    if (token?.actor?.hasPlayerOwner) {
        const isOwner = token.actor.testUserPermission(game.user, "OWNER");
        if (isOwner) {
            return true; // Player can move their own token
        }
    }

    // Non-owned tokens can't be moved manually in marching mode
    ui.notifications.warn("In Marching Mode, only the leader can move tokens freely. Other tokens will follow automatically.");
    return false;
}

/**
 * Hook: After token update (record path and move followers)
 */
async function onUpdateToken(tokenDoc, changes, options, userId) {
    if (!changes.x && !changes.y) return;
    if (!marchingModeEnabled) return;
    if (!leaderTokenId) return;

    // Only process on GM client
    if (!game.user.isGM) return;

    const token = canvas.tokens.get(tokenDoc.id);
    if (!token) return;

    // Check if this is automated movement
    if (options.congaMovement || processingCongaMovement) {
        return;
    }

    // Check if this is the leader moving
    if (tokenDoc.id === leaderTokenId) {
        // Record the leader's movement path
        const startPosition = {
            x: tokenDoc._source.x,
            y: tokenDoc._source.y,
            gridPos: getGridPositionKey(tokenDoc._source.x, tokenDoc._source.y)
        };

        const endPosition = {
            x: tokenDoc.x,
            y: tokenDoc.y,
            gridPos: getGridPositionKey(tokenDoc.x, tokenDoc.y)
        };

        // Add starting position if path is empty
        if (leaderMovementPath.length === 0) {
            leaderMovementPath.push(startPosition);
        }

        // Create path points from start to end
        const newPoints = createPathPoints(startPosition, endPosition);

        // Add points to the beginning of the path
        leaderMovementPath.unshift(...newPoints);

        // If no followers yet, calculate initial marching order
        if (tokenFollowers.size === 0) {
            calculateMarchingOrder(token);
        }

        // Process follower movement after a short delay
        setTimeout(() => {
            if (leaderMovementPath.length >= 2) {
                processCongaMovement();
            }
        }, 100);
    } else {
        // Non-leader token was moved manually - recalculate marching order to include it
        // This allows new tokens to join the formation by being positioned near the group
        const leaderToken = canvas.tokens.get(leaderTokenId);
        if (leaderToken) {
            // Clear the path when manually reordering
            leaderMovementPath = [];
            calculateMarchingOrder(leaderToken);
            console.log(`${MODULE_ID} | Recalculated marching order after ${token.name} was repositioned`);
        }
    }
}

/**
 * Calculate the grid position for a token
 */
function getGridPositionKey(x, y) {
    const gridSize = canvas.grid.size;
    const gridX = Math.round(x / gridSize) * gridSize;
    const gridY = Math.round(y / gridSize) * gridSize;
    return `${gridX},${gridY}`;
}

/**
 * Create path points between two positions
 */
function createPathPoints(startPos, endPos) {
    const gridSize = canvas.grid.size;
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.max(Math.floor(distance / gridSize), 1);

    const result = [];
    for (let i = 1; i <= steps; i++) {
        const x = startPos.x + (dx * i / steps);
        const y = startPos.y + (dy * i / steps);
        const gridPos = getGridPositionKey(x, y);

        // Don't add duplicate positions
        if (result.length > 0 && result[result.length - 1].gridPos === gridPos) {
            continue;
        }

        result.push({ x, y, gridPos });
    }

    return result;
}

/**
 * Calculate the marching order based on proximity to leader
 */
function calculateMarchingOrder(leaderToken) {
    tokenFollowers.clear();

    // Find all player-owned tokens except the leader
    const followerTokens = canvas.tokens.placeables.filter(t =>
        t.id !== leaderToken.id &&
        t.actor &&
        t.actor.type === "Player" &&
        t.actor.hasPlayerOwner
    );

    // Sort by distance from leader
    const sortedFollowers = followerTokens.map(token => {
        const distance = Math.sqrt(
            Math.pow(token.x - leaderToken.x, 2) +
            Math.pow(token.y - leaderToken.y, 2)
        );
        return { token, distance };
    }).sort((a, b) => a.distance - b.distance);

    // Assign marching positions
    sortedFollowers.forEach(({ token }, index) => {
        tokenFollowers.set(token.id, {
            marchPosition: index,
            moving: false
        });
    });
}

/**
 * Process conga movement - tokens follow leader's exact path
 */
function processCongaMovement() {
    // Safety check
    if (leaderMovementPath.length < 2) return;
    if (tokenFollowers.size === 0) return;

    // Set processing flag
    processingCongaMovement = true;

    // Get the leader token
    const leaderToken = canvas.tokens.get(leaderTokenId);
    if (!leaderToken) {
        processingCongaMovement = false;
        return;
    }

    // Get sorted followers
    const sortedFollowers = Array.from(tokenFollowers.entries())
        .sort((a, b) => a[1].marchPosition - b[1].marchPosition);

    // Store followers' current positions and target indices
    const followerStates = sortedFollowers.map(([tokenId, state]) => {
        const token = canvas.tokens.get(tokenId);
        if (!token) return null;

        // Find where in the path the token currently is
        let currentIndex = leaderMovementPath.length - 1;
        let isOnPath = false;

        for (let i = 0; i < leaderMovementPath.length; i++) {
            const pathPoint = leaderMovementPath[i];
            if (Math.abs(pathPoint.x - token.x) < 1 && Math.abs(pathPoint.y - token.y) < 1) {
                currentIndex = i;
                isOnPath = true;
                break;
            }
        }

        return {
            token,
            currentIndex,
            targetIndex: state.marchPosition,
            state,
            isOnPath
        };
    }).filter(f => f !== null);

    // Move all tokens one step at a time
    function moveAllTokensOneStep() {
        if (!game.user.isGM) return;

        // Check if all tokens have reached their targets
        const allDone = followerStates.every(f => f.currentIndex <= f.targetIndex);
        if (allDone) {
            // Trim the path
            const highestIndex = Math.max(...followerStates.map(f => f.targetIndex));
            if (highestIndex < leaderMovementPath.length - 1) {
                leaderMovementPath = leaderMovementPath.slice(0, highestIndex + 1);
            }
            processingCongaMovement = false;
            return;
        }

        // Check if this is first-turn movement
        const isFirstTurn = followerStates.some(f => !f.isOnPath);

        // Move each token that hasn't reached its target yet
        const promises = followerStates.map((follower, index) => {
            // Skip if token has reached its target
            if (follower.currentIndex <= follower.targetIndex) {
                return Promise.resolve();
            }

            // For first turn, only move if previous tokens are on path
            if (isFirstTurn) {
                const previousTokensOnPath = followerStates
                    .slice(0, index)
                    .every(f => f.isOnPath || f.currentIndex <= f.targetIndex);

                if (!previousTokensOnPath) {
                    return Promise.resolve();
                }
            }

            const position = leaderMovementPath[follower.currentIndex - 1];

            return follower.token.document.update({
                x: position.x,
                y: position.y
            }, { congaMovement: true }).then(() => {
                follower.currentIndex--;
                if (!follower.isOnPath && follower.currentIndex < leaderMovementPath.length - 1) {
                    follower.isOnPath = true;
                }
            });
        });

        // After all tokens have moved one step, wait then move again
        Promise.all(promises).then(() => {
            setTimeout(() => {
                moveAllTokensOneStep();
            }, 100);
        });
    }

    // Start the movement
    moveAllTokensOneStep();
}

/**
 * Get current marching mode state
 */
export function getMarchingModeState() {
    return {
        enabled: marchingModeEnabled,
        leaderId: leaderTokenId
    };
}
