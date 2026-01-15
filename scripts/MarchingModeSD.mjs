/**
 * Marching Mode for Shadowdark Extras
 *
 * Allows a GM to designate a party leader and enable marching mode where
 * other tokens follow the leader's exact movement path.
 */

const MODULE_ID = "shadowdark-extras";
const SETTING_KEY_LEADER = "marchingModeLeader";
const SETTING_KEY_ENABLED = "marchingModeEnabled";

// Marching mode state
let marchingModeEnabled = false;
let leaderTokenId = null;
let leaderMovementPath = []; // Array of {x, y, gridPos} points
let tokenFollowers = new Map(); // tokenId -> {marchPosition, moving}
let processingCongaMovement = false;
let scheduledTimeouts = new Set(); // Track pending timeouts for cleanup

/**
 * Save marching mode state to settings
 */
async function saveMarchingState() {
    if (!game.user.isGM) return;

    await game.settings.set(MODULE_ID, SETTING_KEY_LEADER, leaderTokenId || "");
    await game.settings.set(MODULE_ID, SETTING_KEY_ENABLED, marchingModeEnabled);
    console.log(`${MODULE_ID} | Saved marching state: leader=${leaderTokenId}, enabled=${marchingModeEnabled}`);
}

/**
 * Load marching mode state from settings
 */
function loadMarchingState() {
    if (!game.user.isGM) return;

    const savedLeader = game.settings.get(MODULE_ID, SETTING_KEY_LEADER);
    const savedEnabled = game.settings.get(MODULE_ID, SETTING_KEY_ENABLED);

    leaderTokenId = savedLeader || null;
    marchingModeEnabled = savedEnabled || false;

    console.log(`${MODULE_ID} | Loaded marching state: leader=${leaderTokenId}, enabled=${marchingModeEnabled}`);
}

/**
 * Register game settings for marching mode
 */
function registerMarchingSettings() {
    game.settings.register(MODULE_ID, SETTING_KEY_LEADER, {
        name: "Marching Mode Leader",
        scope: "world",
        config: false,
        type: String,
        default: ""
    });

    game.settings.register(MODULE_ID, SETTING_KEY_ENABLED, {
        name: "Marching Mode Enabled",
        scope: "world",
        config: false,
        type: Boolean,
        default: false
    });
}

/**
 * Schedule a timeout and track it for cleanup
 */
function scheduleTimeout(callback, delay) {
    const id = setTimeout(() => {
        scheduledTimeouts.delete(id);
        callback();
    }, delay);
    scheduledTimeouts.add(id);
    return id;
}

/**
 * Clear all scheduled timeouts
 */
function clearScheduledTimeouts() {
    for (const id of scheduledTimeouts) {
        clearTimeout(id);
    }
    scheduledTimeouts.clear();
}

/**
 * Initialize Marching Mode
 */
export function initMarchingMode() {
    if (!game.user.isGM) return;

    console.log(`${MODULE_ID} | Initializing Marching Mode`);

    // Register settings
    registerMarchingSettings();

    // Load saved state
    loadMarchingState();

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

    // Restore leader crown when canvas is ready
    Hooks.on("canvasReady", restoreLeaderCrown);

    // Clean up crown when token is deleted
    Hooks.on("deleteToken", async (tokenDoc, options, userId) => {
        if (tokenDoc.id === leaderTokenId) {
            // Leader was deleted, clear leader
            await setLeader(null);
        }
    });

    // Show crown on newly created tokens if they're the leader
    Hooks.on("createToken", async (tokenDoc, options, userId) => {
        // Small delay to ensure token is fully initialized
        await new Promise(resolve => setTimeout(resolve, 100));

        if (tokenDoc.id === leaderTokenId) {
            const token = canvas.tokens.get(tokenDoc.id);
            if (token) {
                await showLeaderCrown(token);
            }
        }
    });
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
            html.find('.sdx-movement-option').on('click', function () {
                html.find('.sdx-movement-option').removeClass('selected');
                $(this).addClass('selected');
            });
        }
    }, {
        width: 480,
        height: 245,
        classes: ["sdx-movement-mode-dialog"]
    }).render(true);
}

/**
 * Set the party leader
 */
async function setLeader(tokenId) {
    const oldLeaderId = leaderTokenId;

    // Normalize tokenId (convert empty string to null)
    const newLeaderId = tokenId || null;
    leaderTokenId = newLeaderId;

    // Always remove ALL crowns first (handles refresh case where oldLeaderId is null but crowns persist)
    await removeAllLeaderCrowns();

    // Reset marching state when leader changes
    if (oldLeaderId !== newLeaderId) {
        // Clear the movement path
        leaderMovementPath = [];

        // Clear followers
        tokenFollowers.clear();

        // Cancel any pending movements
        clearScheduledTimeouts();

        // If marching mode is enabled and we have a new leader, recalculate marching order
        if (marchingModeEnabled && newLeaderId) {
            const newLeaderToken = canvas.tokens.get(newLeaderId);
            if (newLeaderToken) {
                // Small delay to ensure state is settled
                await new Promise(resolve => setTimeout(resolve, 100));
                calculateMarchingOrder(newLeaderToken);
                console.log(`${MODULE_ID} | Recalculated marching order with new leader`);
            }
        }
    }

    // Add crown to new leader if one was selected
    if (newLeaderId) {
        const token = canvas.tokens.get(newLeaderId);
        if (token) {
            await showLeaderCrown(token);
            ui.notifications.info(`Party leader set to: ${token.name}`);
        } else {
            ui.notifications.info(`Party leader set to: Unknown`);
        }
    } else {
        ui.notifications.info("Party leader cleared.");
    }

    // Save state
    await saveMarchingState();

    updateButtonStates();
}

/**
 * Set movement mode
 */
async function setMovementMode(enabled) {
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
        clearScheduledTimeouts(); // Cancel any pending follower movements
    }

    // Save state
    await saveMarchingState();

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
        // Cancel any pending follower movements - this handles waypoint sequences
        // Each waypoint triggers updateToken, so we cancel previous movements and schedule new ones
        clearScheduledTimeouts();

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

        // Process follower movement after a short delay using tracked timeout
        scheduleTimeout(() => {
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

    // Guard against overlapping processing (e.g., from rapid waypoint movements)
    if (processingCongaMovement) {
        console.log(`${MODULE_ID} | Skipping conga movement - already processing`);
        return;
    }

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
            scheduleTimeout(() => {
                moveAllTokensOneStep();
            }, 100);
        });
    }

    // Start the movement
    moveAllTokensOneStep();
}

/**
 * Get the effect name for a token's leader crown
 */
function getLeaderCrownEffectName(token) {
    return `${MODULE_ID}-leader-crown-${token.id}`;
}

/**
 * Show the leader crown on a token
 */
async function showLeaderCrown(token) {
    // Check if Sequencer is available
    if (typeof Sequencer === "undefined") {
        console.warn(`${MODULE_ID} | Sequencer module required for leader crown visualization`);
        return;
    }

    const effectName = getLeaderCrownEffectName(token);

    // End any existing crown for this token
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });

    // Get token dimensions for positioning
    const tokenWidth = token.document.width;

    console.log(`${MODULE_ID} | Showing leader crown for ${token.name}`);

    // Build the crown effect sequence
    const seq = new Sequence();

    seq.effect()
        .name(effectName)
        .file("modules/shadowdark-extras/assets/crown.svg") // Foundry built-in crown icon
        .atLocation(token)
        .attachTo(token, { bindRotation: false, local: true, bindVisibility: true })
        .scaleToObject(0.35, { considerTokenScale: true })
        .scaleIn(0, 300, { ease: "easeOutBack" })
        .spriteOffset({
            x: 0,  // Top-center
            y: -tokenWidth * 0.45
        }, { gridUnits: true })
        .filter("Glow", {
            distance: 8,
            outerStrength: 3,
            innerStrength: 1,
            color: 0xFFD700, // Gold glow
            quality: 0.2,
            knockout: false
        })
        .loopProperty("sprite", "position.y", {
            from: 0,
            to: -0.03 * tokenWidth,
            duration: 800,
            ease: "easeInOutSine",
            pingPong: true,
            gridUnits: true
        })
        .persist()
        .aboveLighting()
        .zIndex(10);

    await seq.play();
    console.log(`${MODULE_ID} | Leader crown displayed for ${token.name}`);
}

/**
 * Remove the leader crown from a token
 */
async function removeLeaderCrown(token) {
    if (typeof Sequencer === "undefined") return;

    const effectName = getLeaderCrownEffectName(token);
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });
    console.log(`${MODULE_ID} | Removed leader crown from ${token.name}`);
}

/**
 * Remove all leader crowns from all tokens
 */
async function removeAllLeaderCrowns() {
    if (typeof Sequencer === "undefined") return;

    // Get all tokens on the canvas
    const allTokens = canvas.tokens.placeables;

    // Remove crown from each token
    const promises = allTokens.map(token => {
        const effectName = getLeaderCrownEffectName(token);
        return Sequencer.EffectManager.endEffects({ name: effectName, object: token });
    });

    await Promise.all(promises);
    console.log(`${MODULE_ID} | Removed all leader crowns`);
}

/**
 * Restore leader crown on canvas ready
 */
async function restoreLeaderCrown() {
    if (typeof Sequencer === "undefined") return;

    // Small delay to ensure canvas is ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // First, clean up any stale crowns that may have persisted from before refresh
    await removeAllLeaderCrowns();

    // Only restore if we have a leader
    if (leaderTokenId) {
        const leaderToken = canvas.tokens.get(leaderTokenId);
        if (leaderToken) {
            await showLeaderCrown(leaderToken);
        }
    }
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
