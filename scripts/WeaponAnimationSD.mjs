/**
 * Weapon Animation for Shadowdark Extras
 * Displays weapon images on tokens when weapons are equipped
 * Uses Sequencer module for animations
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Check if weapon animations are enabled in settings
 */
function isEnabled() {
    try {
        return game.settings.get(MODULE_ID, "enableWeaponAnimations") !== false;
    } catch (e) {
        return true; // Default to enabled if setting not registered yet
    }
}

/**
 * Check if required modules are active
 */
function checkDependencies() {
    const hasSequencer = game.modules.get("sequencer")?.active;

    return {
        hasSequencer,
        ready: hasSequencer
    };
}

/**
 * Get the effect name for a token's weapon animation
 * @param {Token} token - The token
 * @param {string} itemId - The weapon item ID
 * @returns {string} - Unique effect name
 */
function getEffectName(token, itemId) {
    return `${MODULE_ID}-weapon-${token.id}-${itemId}`;
}

/**
 * Recursively scan the Weapons folder for all image files
 * @returns {Promise<Array>} Array of {path, name, category} objects
 */
export async function scanItemImages() {
    const basePaths = [
        { path: `modules/${MODULE_ID}/assets/Weapons`, category: "Weapons" },
        { path: `fa-nexus-assets/!Core_Settlements/Combat/Weapons`, category: "Weapons" },
        { path: `fa-nexus-assets/!Core_Settlements/Combat/Weapons/Shields`, category: "Shields" }
    ];
    const imageMap = new Map(); // Use Map to de-duplicate by filename

    for (const config of basePaths) {
        const basePath = config.path;
        const defaultCategory = config.category;

        try {
            // Check if directory exists first
            const browseResult = await FilePicker.browse("data", basePath).catch(err => {
                console.log(`${MODULE_ID} | Path ${basePath} not found or not accessible.`);
                return null;
            });

            if (!browseResult) continue;

            const images = [];

            // Process subdirectories recursively
            for (const dir of browseResult.dirs) {
                await scanDirectory(dir, images, basePath);
            }

            // Process any images in the root folder
            for (const file of browseResult.files) {
                if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
                    images.push({
                        path: file,
                        name: getImageName(file),
                        category: defaultCategory
                    });
                }
            }

            // Add to map, avoiding duplicates by name
            for (const img of images) {
                if (!imageMap.has(img.name)) {
                    imageMap.set(img.name, img);
                }
            }

        } catch (error) {
            console.warn(`${MODULE_ID} | Error scanning ${basePath}:`, error);
        }
    }

    return Array.from(imageMap.values());
}

/**
 * Recursively scan a directory for images
 * @param {string} dirPath - Directory path to scan
 * @param {Array} images - Array to collect images into
 * @param {string} basePath - The base path for category calculation
 */
async function scanDirectory(dirPath, images, basePath) {
    try {
        const result = await FilePicker.browse("data", dirPath);
        const category = getCategory(dirPath, basePath);

        // Process subdirectories
        for (const subDir of result.dirs) {
            await scanDirectory(subDir, images, basePath);
        }

        // Process image files
        for (const file of result.files) {
            if (file.endsWith('.webp') || file.endsWith('.png') || file.endsWith('.jpg')) {
                images.push({
                    path: file,
                    name: getImageName(file),
                    category: category
                });
            }
        }
    } catch (error) {
        console.warn(`${MODULE_ID} | Error scanning directory ${dirPath}:`, error);
    }
}

/**
 * Extract category from path (e.g., "Swords/Longswords" from full path)
 * @param {string} dirPath - The current directory path
 * @param {string} basePath - The base path to calculate relative category from
 */
function getCategory(dirPath, basePath) {
    const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
    if (dirPath.startsWith(prefix)) {
        return dirPath.substring(prefix.length);
    }
    // Fallback to last folder name if it's the root path or something else
    if (dirPath === basePath) return "Weapons";
    return dirPath.split('/').pop();
}

/**
 * Extract image name from path (without extension)
 */
function getImageName(filePath) {
    const fileName = filePath.split('/').pop();
    return fileName.replace(/\.(webp|png|jpg)$/i, '');
}

/**
 * Play weapon animation on a token
 * @param {Token} token - The token to animate
 * @param {Item} item - The weapon item
 */
export async function playWeaponAnimation(token, item) {
    if (!isEnabled()) return;

    const deps = checkDependencies();
    if (!deps.ready) {
        if (!deps.hasSequencer) {
            console.warn(`${MODULE_ID} | Sequencer module is required for weapon animations`);
        }
        return;
    }

    // Get animation config from item flags
    const animConfig = item.getFlag(MODULE_ID, "weaponAnimation");
    if (!animConfig?.enabled || !animConfig?.imagePath) {
        return; // No animation configured
    }

    const effectName = getEffectName(token, item.id);

    // End any existing animation for this weapon
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });

    // Get token dimensions
    const tokenWidth = token.document.width;
    const tokenScale = {
        x: token.document.texture?.scaleX ?? 1,
        y: token.document.texture?.scaleY ?? 1
    };

    console.log(`${MODULE_ID} | Playing weapon animation for ${token.name}'s ${item.name}`, animConfig);

    // Build the animation sequence
    const seq = new Sequence();

    // Weapon image effect - persistent
    const effect = seq.effect()
        .name(effectName)
        .file(animConfig.imagePath)
        .atLocation(token)
        .attachTo(token, { bindRotation: true, local: true, bindVisibility: false })
        .scaleToObject(animConfig.scale ?? 1.0, { considerTokenScale: true })
        .scaleIn(0, 300, { ease: "easeOutBack" })
        .scaleOut(0, 200, { ease: "easeOutCubic" })
        .spriteOffset({
            x: (animConfig.offsetX ?? 0.35) * tokenWidth,
            y: (animConfig.offsetY ?? 0.1) * tokenWidth
        }, { gridUnits: true })
        .spriteRotation(animConfig.rotation ?? 0)
        .spriteScale({
            x: (1.0 / tokenScale.x) * (animConfig.flipX ? -1 : 1),
            y: (1.0 / tokenScale.y) * (animConfig.flipY ? -1 : 1)
        });

    console.log(`${MODULE_ID} | Playing weapon animation:`, animConfig);

    // Apply ColorMatrix filter if configured
    if (animConfig.filters?.colorMatrix) {
        const cm = animConfig.filters.colorMatrix;
        effect.filter("ColorMatrix", {
            hue: cm.hue ?? 0,
            brightness: cm.brightness ?? 1,
            contrast: cm.contrast ?? 1,
            saturate: cm.saturate ?? 0
        });
    }

    // Apply Glow filter if enabled
    if (animConfig.filters?.glow?.enabled) {
        const glow = animConfig.filters.glow;
        const color = glow.color || "#ffffff";

        console.log(`${MODULE_ID} | Applying Glow filter:`, {
            color: color,
            distance: glow.distance,
            outerStrength: glow.outerStrength,
            innerStrength: glow.innerStrength,
            quality: glow.quality,
            knockout: glow.knockout
        });

        effect.filter("Glow", {
            distance: glow.distance ?? 10,
            outerStrength: glow.outerStrength ?? 4,
            innerStrength: glow.innerStrength ?? 0,
            color: color,
            quality: glow.quality ?? 0.1,
            knockout: glow.knockout ?? false
        });
    }

    effect.persist()
        .aboveLighting()
        .zIndex(5);

    // Apply selected animation type
    const animType = animConfig.animationType ?? (animConfig.wobble !== false ? "wobble" : "none");

    switch (animType) {
        case "wobble":
            effect
                .loopProperty("sprite", "angle", {
                    from: -3,
                    to: 3,
                    duration: 1200,
                    ease: "easeInOutSine",
                    pingPong: true
                });
            break;

        case "bobbing":
            effect.loopProperty("sprite", "position.y", {
                from: 0,
                to: -0.05 * tokenWidth,
                duration: 1000,
                ease: "easeInOutSine",
                pingPong: true,
                gridUnits: true
            });
            break;

        case "floating":
            effect.loopProperty("sprite", "position.x", {
                from: -0.05 * tokenWidth,
                to: 0.05 * tokenWidth,
                duration: 1500,
                ease: "easeInOutSine",
                pingPong: true,
                gridUnits: true
            });
            break;

        case "rotating":
            effect.loopProperty("sprite", "angle", {
                from: 0,
                to: 360,
                duration: 3000,
                ease: "linear"
            });
            break;
    }

    await seq.play();

    // Apply additional PIXI filters that Sequencer doesn't support natively
    if (animConfig.filters?.dropShadow?.enabled) {
        // Wait briefly for the effect to be fully initialized
        await new Promise(resolve => setTimeout(resolve, 100));

        const effectName = getEffectName(token, item.id);
        const effects = Sequencer.EffectManager.effects.filter(e => e.data?.name === effectName);

        for (const seqEffect of effects) {
            try {
                // Access the sprite container
                const sprite = seqEffect.sprite || seqEffect.spriteContainer;
                if (!sprite) {
                    console.warn(`${MODULE_ID} | Could not find sprite for effect ${effectName}`);
                    continue;
                }

                const ds = animConfig.filters.dropShadow;

                // Check if DropShadowFilter is available (from TokenMagic or PIXI)
                const DropShadowFilter = PIXI.filters?.DropShadowFilter;
                if (!DropShadowFilter) {
                    console.warn(`${MODULE_ID} | DropShadowFilter not available - TokenMagic FX may not be installed`);
                    continue;
                }

                // Convert hex color string to number
                let colorValue = 0x000000;
                if (ds.color) {
                    const colorStr = ds.color.replace('#', '');
                    colorValue = parseInt(colorStr, 16);
                }

                const dropShadow = new DropShadowFilter({
                    color: colorValue,
                    alpha: ds.alpha ?? 0.5,
                    blur: ds.blur ?? 2,
                    distance: ds.distance ?? 5,
                    rotation: ds.rotation ?? 45
                });

                sprite.filters = [...(sprite.filters || []), dropShadow];
                console.log(`${MODULE_ID} | Applied DropShadow filter to ${effectName}:`, ds);
            } catch (e) {
                console.error(`${MODULE_ID} | Error applying DropShadow filter:`, e);
            }
        }
    }
}

/**
 * Stop weapon animation on a token
 * @param {Token} token - The token
 * @param {string} itemId - The weapon item ID
 */
export async function stopWeaponAnimation(token, itemId) {
    const deps = checkDependencies();
    if (!deps.hasSequencer) return;

    const effectName = getEffectName(token, itemId);
    await Sequencer.EffectManager.endEffects({ name: effectName, object: token });
    console.log(`${MODULE_ID} | Stopped weapon animation: ${effectName}`);
}

/**
 * Stop all weapon animations on a token
 * @param {Token} token - The token
 */
export async function stopAllWeaponAnimations(token) {
    const deps = checkDependencies();
    if (!deps.hasSequencer) return;

    await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-weapon-${token.id}*` });
    console.log(`${MODULE_ID} | Stopped all weapon animations for ${token.name}`);
}

/**
 * Get tokens for an actor on the current scene
 * @param {Actor} actor - The actor
 * @returns {Token[]} - Array of tokens
 */
function getTokensForActor(actor) {
    if (!canvas.scene) return [];

    // For synthetic/unlinked tokens
    if (actor.isToken) {
        const token = canvas.tokens.get(actor.token?.id);
        return token ? [token] : [];
    }

    // For linked tokens, find all tokens on the scene
    return canvas.tokens.placeables.filter(t =>
        t.actor?.id === actor.id && t.document.actorLink
    );
}

/**
 * Initialize weapon animation hooks
 */
export function initWeaponAnimations() {
    if (!isEnabled()) {
        console.log(`${MODULE_ID} | Weapon animations disabled in settings`);
        return;
    }

    const deps = checkDependencies();

    if (!deps.hasSequencer) {
        console.log(`${MODULE_ID} | Weapon animations disabled - Sequencer module not found`);
        return;
    }

    console.log(`${MODULE_ID} | Initializing weapon animations`);

    // Hook into item updates to detect equip changes
    Hooks.on("updateItem", async (item, changes, options, userId) => {
        // Only the user who made the change should create the animation
        if (userId !== game.user.id) return;

        // Only process weapon and armor (shields) items
        if (item.type !== "Weapon" && item.type !== "Armor") return;

        // Check if equipped status was changed
        const equippedChanged = foundry.utils.hasProperty(changes, "system.equipped");
        if (!equippedChanged) return;

        const isEquipped = changes.system.equipped;
        const actor = item.actor;
        if (!actor) return;

        // Check if this weapon has animation config
        const animConfig = item.getFlag(MODULE_ID, "weaponAnimation");
        if (!animConfig?.enabled) return;

        // Get all tokens for this actor
        const tokens = getTokensForActor(actor);

        for (const token of tokens) {
            if (isEquipped) {
                // Weapon equipped - play animation
                await playWeaponAnimation(token, item);
            } else {
                // Weapon unequipped - stop animation
                await stopWeaponAnimation(token, item.id);
            }
        }
    });

    // Restore animations on scene ready
    Hooks.on("canvasReady", async () => {
        // Only the first GM or the first user should restore animations
        // This prevents all clients from creating duplicate effects
        const firstActiveUser = game.users.find(u => u.active);
        if (game.user.id !== firstActiveUser?.id) return;

        // Small delay to ensure everything is loaded
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check all tokens for equipped weapons/shields with animations
        for (const token of canvas.tokens.placeables) {
            const actor = token.actor;
            if (!actor) continue;

            // Get all equipped items with animation config
            const equippedItems = actor.items.filter(i =>
                (i.type === "Weapon" || i.type === "Armor") &&
                i.system?.equipped === true &&
                i.getFlag(MODULE_ID, "weaponAnimation")?.enabled
            );

            // Play animation for each equipped item
            for (const item of equippedItems) {
                await playWeaponAnimation(token, item);
            }
        }
    });

    // Clean up animations when token is deleted
    Hooks.on("deleteToken", async (tokenDoc, options, userId) => {
        // Only the user who deleted the token should clean up
        if (userId !== game.user.id) return;

        const deps = checkDependencies();
        if (!deps.hasSequencer) return;

        // End all weapon effects for this token
        await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-weapon-${tokenDoc.id}*` });
    });

    // Check for equipped weapons when a new token is created
    Hooks.on("createToken", async (tokenDoc, options, userId) => {
        // Only the user who created the token should add animations
        if (userId !== game.user.id) return;

        // Small delay to ensure token is fully initialized
        await new Promise(resolve => setTimeout(resolve, 100));

        const token = canvas.tokens.get(tokenDoc.id);
        if (!token) return;

        const actor = token.actor;
        if (!actor) return;

        // Get all equipped items with animation config
        const equippedItems = actor.items.filter(i =>
            (i.type === "Weapon" || i.type === "Armor") &&
            i.system?.equipped === true &&
            i.getFlag(MODULE_ID, "weaponAnimation")?.enabled
        );

        // Play animation for each equipped item
        for (const item of equippedItems) {
            await playWeaponAnimation(token, item);
        }
    });

    console.log(`${MODULE_ID} | Weapon animations initialized successfully`);
}
