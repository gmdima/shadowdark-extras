/**
 * Torch Animation for Shadowdark Extras
 * Adds visual torch/flame animations when light sources are activated
 * Uses Sequencer module for animations and JB2A for animation files
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Check if torch animations are enabled in settings
 */
function isEnabled() {
	try {
		return game.settings.get(MODULE_ID, "enableTorchAnimations") !== false;
	} catch (e) {
		return true; // Default to enabled if setting not registered yet
	}
}

/**
 * Check if required modules are active
 */
function checkDependencies() {
	const hasSequencer = game.modules.get("sequencer")?.active;
	const hasJB2A = game.modules.get("jb2a_patreon")?.active || game.modules.get("JB2A_DnD5e")?.active;

	return {
		hasSequencer,
		hasJB2A,
		ready: hasSequencer && hasJB2A
	};
}

/**
 * Get the effect name for a token's torch animation
 * @param {Token} token - The token
 * @param {string} itemId - The light source item ID
 * @returns {string} - Unique effect name
 */
function getEffectName(token, itemId) {
	return `${MODULE_ID}-torch-${token.id}-${itemId}`;
}

/**
 * Get animation settings based on light source type
 * @param {Item} item - The light source item
 * @returns {object} - Animation configuration
 */
function getAnimationConfig(item) {
	const lightTemplate = item.system?.light?.template?.toLowerCase() || "";
	const itemName = item.name?.toLowerCase() || "";

	// Default torch animation - use local torch.webp
	let config = {
		type: "torch",
		torchFile: "modules/shadowdark-extras/assets/torch.webp",
		flameFile: "jb2a.flames.01.orange",
		impactFile: "jb2a.impact.002.orange",
		scale: 1.2,
		torchOffsetX: 0.35,
		torchOffsetY: 0.1,
		flameOffsetX: 0.5,
		flameOffsetY: -0.05,
		flameScale: 1.0,
		flameRotation: 45,
		isSpell: false
	};

	// Customize based on light source type
	if (itemName.includes("light spell") || itemName.includes("light (")) {
		// Light Spell - magical bluish glow above token
		config.type = "spell";
		config.isSpell = true;
		config.torchFile = null; // No physical prop for spells
		config.flameFile = "jb2a.energy_strands.complete.blue.01";
		config.impactFile = "jb2a.impact.004.blue";
		config.scale = 0.8;
		config.flameScale = 0.6;
		config.flameOffsetX = 0;
		config.flameOffsetY = -0.5; // Above the token
		config.tint = "#4488ff";
	} else if (itemName.includes("oil") || itemName.includes("flask")) {
		// Oil Flask - use lamp.webp
		config.type = "oil";
		config.torchFile = "modules/shadowdark-extras/assets/lamp.webp";
		config.scale = 1.0;
		config.torchOffsetX = 0.35;
		config.torchOffsetY = 0.1;
		config.flameScale = 0.35;
		config.flameOffsetX = 0.34;
		config.flameOffsetY = 0.19;
		config.flameRotation = 0;
	} else if (lightTemplate.includes("lantern") || itemName.includes("lantern")) {
		// Lantern - use lamp.webp
		config.type = "lantern";
		config.torchFile = "modules/shadowdark-extras/assets/lamp.webp";
		config.scale = 1.0;
		config.torchOffsetX = 0.35;
		config.torchOffsetY = 0.1;
		config.flameScale = 0.35;
		config.flameOffsetX = 0.45;
		config.flameOffsetY = -0.08;
	} else if (lightTemplate.includes("candle") || itemName.includes("candle")) {
		// Candle - use candle.webp
		config.type = "candle";
		config.torchFile = "modules/shadowdark-extras/assets/candle.webp";
		config.flameFile = "jb2a.flames.04.loop.orange";
		config.scale = 0.8;
		config.flameScale = 0.35;
		config.torchOffsetX = 0.35;
		config.torchOffsetY = 0.15;
		config.flameOffsetX = 0.50;
		config.flameOffsetY = -0.07;
	}

	return config;
}

/**
 * Play torch animation on a token
 * @param {Token} token - The token to animate
 * @param {Item} item - The light source item
 */
async function playTorchAnimation(token, item) {
	if (!isEnabled()) return;

	const deps = checkDependencies();
	if (!deps.ready) {
		if (!deps.hasSequencer) {
			console.warn(`${MODULE_ID} | Sequencer module is required for torch animations`);
		}
		if (!deps.hasJB2A) {
			console.warn(`${MODULE_ID} | JB2A module is required for torch animations`);
		}
		return;
	}

	const effectName = getEffectName(token, item.id);
	const config = getAnimationConfig(item);
	const hasPatreon = game.modules.get("jb2a_patreon")?.active;

	// End any existing animation for this light source
	await Sequencer.EffectManager.endEffects({ name: effectName, object: token });

	// Get token dimensions
	const tokenWidth = token.document.width;
	const tokenScale = {
		x: token.document.texture?.scaleX ?? 1,
		y: token.document.texture?.scaleY ?? 1
	};

	console.log(`${MODULE_ID} | Playing torch animation for ${token.name}'s ${item.name}`, config);

	// Build the animation sequence
	const seq = new Sequence();

	// Handle spell light differently - magical glow above token
	if (config.isSpell) {
		// Initial magical burst
		if (hasPatreon && config.impactFile) {
			seq.effect()
				.name(`${effectName}_impact`)
				.file(config.impactFile)
				.atLocation(token)
				.attachTo(token, { bindRotation: false, bindVisibility: false })
				.scaleToObject(1.2, { considerTokenScale: true })
				.spriteOffset({
					x: 0,
					y: -0.4 * tokenWidth
				}, { gridUnits: true })
				.aboveLighting()
				.zIndex(1);
		}

		// Magical orb/glow effect above the token
		seq.effect()
			.name(effectName)
			.file("jb2a.markers.light.complete.blue")
			.atLocation(token)
			.attachTo(token, { bindRotation: false, bindVisibility: false })
			.scaleToObject(0.5, { considerTokenScale: true })
			.scaleIn(0, 500, { ease: "easeOutElastic" })
			.scaleOut(0, 250, { ease: "easeOutCubic" })
			.spriteOffset({
				x: 0,
				y: -0.5 * tokenWidth
			}, { gridUnits: true })
			.loopProperty("sprite", "scale.x", { from: 0.95, to: 1.05, duration: 2000, ease: "easeInOutSine", pingPong: true })
			.loopProperty("sprite", "scale.y", { from: 0.95, to: 1.05, duration: 2000, ease: "easeInOutSine", pingPong: true })
			.persist()
			.aboveLighting()
			.zIndex(2);

		// Add subtle particle effect around the light
		seq.effect()
			.delay(300)
			.name(effectName)
			.file("jb2a.particles.outward.greenyellow.01.02")
			.atLocation(token)
			.attachTo(token, { bindRotation: false, bindVisibility: false })
			.scaleToObject(0.4, { considerTokenScale: true })
			.spriteOffset({
				x: 0,
				y: -0.5 * tokenWidth
			}, { gridUnits: true })
			.persist()
			.opacity(0.7)
			.aboveLighting()
			.zIndex(3);

		await seq.play();
		return;
	}

	// Initial impact/ignition effect for physical light sources (only for patreon)
	if (hasPatreon && config.impactFile) {
		seq.effect()
			.name(`${effectName}_impact`)
			.file(config.impactFile)
			.atLocation(token)
			.attachTo(token, { bindRotation: true, local: true, bindVisibility: false })
			.scaleToObject(0.9, { considerTokenScale: true })
			.spriteOffset({
				x: config.flameOffsetX * tokenWidth,
				y: config.flameOffsetY * tokenWidth
			}, { gridUnits: true })
			.spriteRotation(45)
			.spriteScale({ x: 1.0 / tokenScale.x, y: 1.0 / tokenScale.y })
			.aboveLighting()
			.zIndex(1);
	}

	// Main torch/lantern/candle image effect - persistent
	if (config.torchFile) {
		seq.effect()
			.name(effectName)
			.file(config.torchFile)
			.atLocation(token)
			.attachTo(token, { bindRotation: true, local: true, bindVisibility: false })
			.scaleToObject(config.scale, { considerTokenScale: true })
			.scaleIn(0, 500, { ease: "easeOutElastic" })
			.scaleOut(0, 250, { ease: "easeOutCubic" })
			.spriteOffset({
				x: config.torchOffsetX * tokenWidth,
				y: config.torchOffsetY * tokenWidth
			}, { gridUnits: true })
			.spriteScale({ x: 1.0 / tokenScale.x, y: 1.0 / tokenScale.y })
			// Gentle swaying animation
			.animateProperty("sprite", "rotation", { from: 60, to: -60, duration: 300, ease: "easeInOutBack" })
			.animateProperty("sprite", "rotation", { from: 0, to: 30, duration: 250, delay: 200, ease: "easeOutBack" })
			.loopProperty("sprite", "rotation", { from: 2, to: -2, duration: 1500, ease: "easeOutQuad", pingPong: true })
			.persist()
			.aboveLighting()
			.zIndex(2);
	}

	// Flame effect on the torch - persistent
	seq.effect()
		.delay(250)
		.name(effectName)
		.file(config.flameFile)
		.atLocation(token)
		.attachTo(token, { bindRotation: true, local: true, bindVisibility: false })
		.scaleToObject(config.flameScale, { considerTokenScale: true })
		.spriteOffset({
			x: config.flameOffsetX * tokenWidth,
			y: config.flameOffsetY * tokenWidth
		}, { gridUnits: true })
		.spriteScale({ x: 1.0 / tokenScale.x, y: 1.0 / tokenScale.y })
		.loopProperty("sprite", "rotation", { from: config.flameRotation + 2, to: config.flameRotation - 2, duration: 1500, ease: "easeOutQuad", pingPong: true })
		.persist()
		.aboveLighting()
		.zIndex(3);

	await seq.play();
}

/**
 * Stop torch animation on a token
 * @param {Token} token - The token
 * @param {string} itemId - The light source item ID (optional, stops all if not provided)
 */
async function stopTorchAnimation(token, itemId = null) {
	const deps = checkDependencies();
	if (!deps.hasSequencer) return;

	if (itemId) {
		const effectName = getEffectName(token, itemId);
		await Sequencer.EffectManager.endEffects({ name: effectName, object: token });
		console.log(`${MODULE_ID} | Stopped torch animation: ${effectName}`);
	} else {
		// Stop all torch animations for this token
		await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-torch-${token.id}*`, object: token });
		console.log(`${MODULE_ID} | Stopped all torch animations for ${token.name}`);
	}
}

/**
 * Stop all torch animations on a token (for when turning all lights off)
 * @param {Token} token - The token
 */
async function stopAllTorchAnimations(token) {
	const deps = checkDependencies();
	if (!deps.hasSequencer) return;

	await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-torch-${token.id}*` });
	console.log(`${MODULE_ID} | Stopped all torch animations for ${token.name}`);
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
 * Initialize torch animation hooks
 * This patches the actor's light methods to add animations
 */
export function initTorchAnimations() {
	if (!isEnabled()) {
		console.log(`${MODULE_ID} | Torch animations disabled in settings`);
		return;
	}

	const deps = checkDependencies();

	if (!deps.hasSequencer) {
		console.log(`${MODULE_ID} | Torch animations disabled - Sequencer module not found`);
		return;
	}

	if (!deps.hasJB2A) {
		console.log(`${MODULE_ID} | Torch animations disabled - JB2A module not found`);
		return;
	}

	console.log(`${MODULE_ID} | Initializing torch animations`);

	// Hook into item updates to detect light source toggling
	Hooks.on("updateItem", async (item, changes, options, userId) => {
		// Only process light items
		if (!item.system?.light) return;

		// Check if light.active was changed
		const activeChanged = foundry.utils.hasProperty(changes, "system.light.active");
		if (!activeChanged) return;

		const isActive = changes.system.light.active;
		const actor = item.actor;
		if (!actor) return;

		// Get all tokens for this actor
		const tokens = getTokensForActor(actor);

		for (const token of tokens) {
			if (isActive) {
				// Light turned on - play animation
				await playTorchAnimation(token, item);
			} else {
				// Light turned off - stop animation
				await stopTorchAnimation(token, item.id);
			}
		}
	});

	// Hook into actor light changes (for turnLightOn/turnLightOff)
	// The actor's turnLightOn method changes the token's light settings
	Hooks.on("updateToken", async (tokenDoc, changes, options, userId) => {
		// Check if light settings were changed
		const lightChanged = foundry.utils.hasProperty(changes, "light");
		if (!lightChanged) return;

		const token = canvas.tokens.get(tokenDoc.id);
		if (!token) return;

		const actor = token.actor;
		if (!actor) return;

		// Check if light was turned off (dim and bright both 0)
		const lightDim = changes.light?.dim ?? tokenDoc.light?.dim ?? 0;
		const lightBright = changes.light?.bright ?? tokenDoc.light?.bright ?? 0;

		if (lightDim === 0 && lightBright === 0) {
			// All lights turned off
			await stopAllTorchAnimations(token);
		}
	});

	// Also hook into when an active light source is detected on scene ready
	Hooks.on("canvasReady", async () => {
		// Small delay to ensure everything is loaded
		await new Promise(resolve => setTimeout(resolve, 500));

		// Check all tokens for active light sources
		for (const token of canvas.tokens.placeables) {
			const actor = token.actor;
			if (!actor) continue;

			// Get active light sources
			const activeLightSources = await actor.getActiveLightSources?.();
			if (!activeLightSources || activeLightSources.length === 0) continue;

			// Play animation for each active light source
			for (const item of activeLightSources) {
				await playTorchAnimation(token, item);
			}
		}
	});

	// Clean up animations when token is deleted
	Hooks.on("deleteToken", async (tokenDoc, options, userId) => {
		const deps = checkDependencies();
		if (!deps.hasSequencer) return;

		// End all effects for this token
		await Sequencer.EffectManager.endEffects({ name: `${MODULE_ID}-torch-${tokenDoc.id}*` });
	});

	// Check for active light sources when a new token is created
	Hooks.on("createToken", async (tokenDoc, options, userId) => {
		// Small delay to ensure token is fully initialized
		await new Promise(resolve => setTimeout(resolve, 200));

		const token = canvas.tokens.get(tokenDoc.id);
		if (!token) return;

		// Check if token has light settings (dim or bright > 0)
		const tokenLight = tokenDoc.light || {};
		const hasLight = (tokenLight.dim > 0) || (tokenLight.bright > 0);
		if (!hasLight) return;

		const actor = token.actor;
		if (!actor) return;

		// Find active light source items from the actor
		const activeLightSources = actor.items.filter(i =>
			i.system?.light?.active === true
		);

		if (activeLightSources.length === 0) return;

		// Play animation for each active light source
		for (const item of activeLightSources) {
			await playTorchAnimation(token, item);
		}
	});

	console.log(`${MODULE_ID} | Torch animations initialized successfully`);
}

// Export functions for external use
export {
	playTorchAnimation,
	stopTorchAnimation,
	stopAllTorchAnimations,
	checkDependencies
};
