/**
 * Shapechanger / Wolf Shape Spell Macro
 *
 * Generic transformation system. Transforms the casting player's token and actor
 * into an NPC from the monsters compendium.
 *
 * Spell-specific configuration is defined in SPELL_CONFIGS below, keyed by
 * normalized spell name. The Item Macro just calls:
 *   showShapechangerDialog(actor, item, game.user.id, isCritical)
 * and the function auto-detects which spell config to use based on item.name.
 *
 * Options can still be passed as a 5th parameter to override the auto-detected config.
 */

const MODULE_ID = "shadowdark-extras";

// Default options (used for Shapechanger and as fallback)
const SHAPECHANGER_DEFAULTS = {
	title: "Shapechanger",
	icon: "fas fa-paw-claws",
	description: "You will gain the creature's <strong>HP, AC, abilities, attacks, and features</strong>. Your name, spells, equipment, and class features are retained.",
	maxLevel: 10,          // Max monster level (null = no limit)
	monsterNames: null,    // Array of exact monster names to allow (null = use maxLevel filter)
	transferAbilities: ["str", "dex", "con", "int", "wis", "cha"],
	revertAt0HP: false,
	revertHPValue: null
};

/**
 * Spell-specific configurations, keyed by normalized spell name.
 * The key is the spell item name lowercased with spaces/hyphens removed.
 * monsterNames can be an array or a function(casterActor) => array.
 */
const SPELL_CONFIGS = {
	wolfshape: {
		title: "Wolf Shape",
		icon: "icons/creatures/mammals/wolf-howl-moon-forest-blue.webp",
		description: "You transform into a wolf. You gain <strong>STR, DEX, CON, HP, AC, and attacks</strong>. You retain INT, WIS, CHA and can cast spells. If you reach 0 HP you revert to your true form at 0 HP.",
		monsterNames: (casterActor) => {
			const names = ["Wolf"];
			const level = casterActor?.system?.level?.value ?? 1;
			if (level >= 5) names.push("Wolf, Dire", "Wolf, Winter");
			return names;
		},
		transferAbilities: ["str", "dex", "con"],
		revertAt0HP: true,
		revertHPValue: 0
	},
	polymorph: {
		title: "Polymorph",
		icon: "fas fa-frog",
		description: "Touch a creature to transform it. It gains <strong>STR, DEX, CON, HP, AC, attacks</strong>. Retains <strong>INT, WIS, CHA</strong>. Reverts at 0 HP to half prior HP.",
		maxLevel: null,
		monsterNames: null,
		transferAbilities: ["str", "dex", "con"],
		revertAt0HP: true,
		revertHPValue: "half",
		targetMode: "other"
	}
};

/**
 * Convert an NPC ability modifier to a Player ability base score that produces that mod.
 * Player mod calculation: 1-3 → -4, 4-5 → -3, 6-7 → -2, 8-9 → -1, 10-11 → 0,
 *                         12-13 → +1, 14-15 → +2, 16-17 → +3, 18+ → +4
 * We pick the lowest base score that yields the desired mod.
 * @param {number} mod - The NPC's flat ability modifier
 * @returns {number} A base score for the Player actor
 */
/**
 * Render an icon as either a FontAwesome <i> or an <img> depending on the value.
 */
function renderIcon(icon, size = 16) {
	if (!icon) return "";
	if (icon.includes("/") || icon.includes(".")) {
		return `<img src="${icon}" alt="" style="width:${size}px;height:${size}px;vertical-align:middle;">`;
	}
	return `<i class="${icon}"></i>`;
}

function modToBase(mod) {
	if (mod <= -4) return 1;
	if (mod === -3) return 4;
	if (mod === -2) return 6;
	if (mod === -1) return 8;
	if (mod === 0) return 10;
	if (mod === 1) return 12;
	if (mod === 2) return 14;
	if (mod === 3) return 16;
	// mod >= 4, cap at 18
	return 18;
}

/**
 * Resolve the best token image for an NPC document.
 * The compendium monsters mostly have the generic cowled_token.webp as their
 * prototypeToken texture. Modules like shadowdark-community-tokens apply art
 * to the actor img but often not the prototypeToken. We also try to find a
 * matching token image file from the community tokens module directly.
 *
 * Priority: community tokens file → prototypeToken (if non-default) → actor img
 * @param {Actor} npcDoc - The full NPC document from the compendium
 * @returns {string} The best available token image path
 */
function resolveNpcTokenImage(npcDoc) {
	const defaultToken = "systems/shadowdark/assets/tokens/cowled_token.webp";
	const protoSrc = npcDoc.prototypeToken?.texture?.src;

	// 1. Try to find a token image from shadowdark-community-tokens module
	try {
		const ctModule = game.modules.get("shadowdark-community-tokens");
		if (ctModule?.active) {
			const slug = npcDoc.name.toLowerCase()
				.replace(/[,.'()]/g, "")
				.replace(/\s+/g, "-")
				.replace(/-+/g, "-");
			const tokenPath = `modules/shadowdark-community-tokens/artwork/tokens/${slug}.webp`;
			if (npcDoc.img?.includes("shadowdark-community-tokens")) {
				return tokenPath;
			}
		}
	} catch (e) {
		console.log(`${MODULE_ID} | Community tokens lookup failed:`, e.message);
	}

	// 2. If prototypeToken has a real (non-default) image, use it
	if (protoSrc && protoSrc !== defaultToken) {
		return protoSrc;
	}

	// 3. Fall back to actor img (often has community tokens portrait applied)
	if (npcDoc.img && npcDoc.img !== defaultToken && !npcDoc.img.includes("mystery-man")) {
		return npcDoc.img;
	}

	// 4. Last resort
	return protoSrc || defaultToken;
}

/**
 * Show the transformation NPC selection dialog
 *
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The spell item
 * @param {string} originatingUserId - Optional: The user who initiated this (for GM routing)
 * @param {boolean} isCritical - Optional: Whether the spell was cast with a critical success
 * @param {object} options - Spell-specific configuration (see SHAPECHANGER_DEFAULTS)
 */
export async function showShapechangerDialog(casterActor, casterItem, originatingUserId = null, isCritical = false, options = {}) {
	// Auto-detect spell config from item name
	const spellKey = casterItem?.name?.toLowerCase().replace(/[\s\-_]+/g, "") || "";
	const spellConfig = SPELL_CONFIGS[spellKey] || {};
	const opts = { ...SHAPECHANGER_DEFAULTS, ...spellConfig, ...options };

	if (!casterActor) {
		ui.notifications.warn("No caster actor found!");
		return;
	}

	// Resolve target for "other" targetMode (e.g. Polymorph)
	let targetActor = null;
	let targetToken = null;
	if (opts.targetMode === "other") {
		targetToken = game.user.targets.first();
		if (!targetToken) {
			ui.notifications.warn("You must target a creature first!");
			return;
		}
		targetActor = targetToken.actor;
		if (!targetActor) {
			ui.notifications.warn("The targeted token has no actor data.");
			return;
		}

		// Warn (don't block) if target level > half caster level
		const casterLevel = casterActor.system?.level?.value ?? 1;
		const targetLevel = targetActor.system?.level?.value ?? 0;
		const maxUnwillingLevel = Math.max(1, Math.floor(casterLevel / 2));
		if (targetLevel > maxUnwillingLevel) {
			ui.notifications.warn(`Warning: Target level ${targetLevel} exceeds half your level (${maxUnwillingLevel}). Unwilling targets may resist!`);
		}
	}

	// Check if the transform target is already transformed
	const transformCheckActor = (opts.targetMode === "other" && targetActor) ? targetActor : casterActor;
	const existingBackup = transformCheckActor.getFlag(MODULE_ID, "shapechangerBackup");
	if (existingBackup) {
		ui.notifications.warn(`${transformCheckActor.name} is already transformed into ${existingBackup.npcName}! Revert first.`);
		return;
	}

	// Route dialog to originating user if running on GM client
	if (originatingUserId && game.user.isGM && originatingUserId !== game.user.id) {
		const sdxModule = game.modules.get(MODULE_ID);
		if (sdxModule?.socket) {
			await sdxModule.socket.executeAsUser("showShapechangerDialogForUser", originatingUserId, {
				casterActorId: casterActor.id,
				casterItemId: casterItem.id,
				isCritical: isCritical,
				options: opts,
				targetActorId: targetActor?.id || null,
				targetTokenId: targetToken?.id || null
			});
			return;
		}
	}

	// Load monster compendium
	const pack = game.packs.get("shadowdark.monsters");
	if (!pack) {
		ui.notifications.error("Could not find shadowdark.monsters compendium!");
		return;
	}

	// Get index with needed fields
	const index = await pack.getIndex({
		fields: ["system.level", "system.attributes", "img", "prototypeToken", "name"]
	});

	// Resolve monsterNames (can be array or function)
	const monsterNames = typeof opts.monsterNames === "function"
		? opts.monsterNames(casterActor)
		: opts.monsterNames;

	// Filter and sort
	const monsters = index.contents
		.filter(entry => {
			if (monsterNames) {
				return monsterNames.includes(entry.name);
			}
			const level = entry.system?.level?.value;
			return level !== undefined && (opts.maxLevel === null || level <= opts.maxLevel);
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	if (monsters.length === 0) {
		ui.notifications.warn("No eligible creatures found!");
		return;
	}

	// Build the NPC grid HTML
	const buildNpcGrid = (searchTerm = "") => {
		const filtered = searchTerm
			? monsters.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()))
			: monsters;

		if (filtered.length === 0) {
			return `<div class="sdx-spell-no-items">
				No monsters match your search.
				<div class="sdx-spell-no-items-hint">Try a different search term.</div>
			</div>`;
		}

		return filtered.map(monster => {
			const img = monster.img || "icons/svg/mystery-man.svg";
			const level = monster.system?.level?.value ?? "?";
			return `
				<div class="sdx-spell-weapon-item sdx-shapechanger-npc-item" data-npc-id="${monster._id}">
					<div class="sdx-spell-weapon-img">
						<img src="${img}" alt="${monster.name}">
						<span class="sdx-weapon-badge" title="Level ${level}">LV ${level}</span>
					</div>
					<div class="sdx-spell-weapon-name">${monster.name}</div>
				</div>
			`;
		}).join("");
	};

	// Only show search bar if more than a handful of monsters
	const showSearch = monsters.length > 6;

	const content = `
		<div class="sdx-spell-weapon-dialog sdx-shapechanger-theme">
			<div class="sdx-spell-header">
				${renderIcon(opts.icon)}
				<span>${opts.targetMode === "other" && targetActor ? `Choose a creature to transform ${targetActor.name} into` : "Choose a creature to transform into"}</span>
			</div>
			${showSearch ? `<div class="sdx-shapechanger-search">
				<input type="text" name="npcSearch" placeholder="Search monsters..." autocomplete="off" />
			</div>` : ''}
			<div class="sdx-spell-weapon-grid sdx-shapechanger-grid">
				${buildNpcGrid()}
			</div>
			<div class="sdx-spell-description">
				<i class="fas fa-info-circle"></i>
				${opts.description}${isCritical ? ' <em>(Critical Success!)</em>' : ''}
			</div>
			<input type="hidden" name="selectedNpcId" value="">
		</div>
	`;

	// DialogV2 window/button icons must be FA classes; fall back for image paths
	const faIcon = (opts.icon && !opts.icon.includes("/") && !opts.icon.includes(".")) ? opts.icon : "fas fa-paw-claws";

	const dialog = new foundry.applications.api.DialogV2({
		window: {
			title: opts.title,
			icon: faIcon
		},
		content: content,
		buttons: [
			{
				action: "cancel",
				label: "Cancel",
				icon: "fas fa-times"
			},
			{
				action: "transform",
				label: "Transform",
				icon: faIcon,
				default: true,
				callback: async (event, button, dialogApp) => {
					const selectedId = dialogApp.element.querySelector("input[name='selectedNpcId']")?.value;
					if (!selectedId) {
						ui.notifications.warn("Please select a creature to transform into.");
						return false;
					}
					const npcDoc = await pack.getDocument(selectedId);
					if (npcDoc) {
						await applyShapechanger(casterActor, casterItem, npcDoc, isCritical, opts, targetActor, targetToken);
					}
					return true;
				}
			}
		],
		position: {
			width: 560,
			height: "auto"
		}
	});

	dialog.addEventListener("render", (event) => {
		const dialogElement = dialog.element;
		const grid = dialogElement.querySelector(".sdx-shapechanger-grid");
		const hiddenInput = dialogElement.querySelector("input[name='selectedNpcId']");
		const searchInput = dialogElement.querySelector("input[name='npcSearch']");

		const setupItemSelection = () => {
			const items = dialogElement.querySelectorAll(".sdx-shapechanger-npc-item");
			items.forEach(itemEl => {
				itemEl.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					items.forEach(i => i.classList.remove("selected"));
					itemEl.classList.add("selected");
					if (hiddenInput) {
						hiddenInput.value = itemEl.dataset.npcId;
					}
				});
			});
		};

		setupItemSelection();

		// Handle search input
		let searchTimeout;
		searchInput?.addEventListener("input", () => {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				const term = searchInput.value.trim();
				grid.innerHTML = buildNpcGrid(term);
				hiddenInput.value = "";
				setupItemSelection();
			}, 200);
		});
	});

	await dialog.render(true);
}

/**
 * Apply the transformation
 *
 * @param {Actor} casterActor - The actor casting the spell
 * @param {Item} casterItem - The spell item
 * @param {Actor} npcDoc - The full NPC document from the compendium
 * @param {boolean} isCritical - Whether the spell was a critical success
 * @param {object} options - Spell-specific configuration
 * @param {Actor} targetActor - The target actor (for targetMode "other", e.g. Polymorph)
 * @param {Token} targetToken - The target token (for targetMode "other")
 */
export async function applyShapechanger(casterActor, casterItem, npcDoc, isCritical = false, options = {}, targetActor = null, targetToken = null) {
	const opts = { ...SHAPECHANGER_DEFAULTS, ...options };
	const sdxModule = game.modules.get(MODULE_ID);
	if (!sdxModule?.api) {
		ui.notifications.warn("Module API not available");
		return;
	}

	// Determine who gets transformed: target (Polymorph) or caster (self-transform)
	const transformActor = (opts.targetMode === "other" && targetActor) ? targetActor : casterActor;
	const transformToken = (opts.targetMode === "other" && targetToken) ? targetToken : null;

	// Guard: already transformed
	const existingBackup = transformActor.getFlag(MODULE_ID, "shapechangerBackup");
	if (existingBackup) {
		ui.notifications.warn(`${transformActor.name} is already transformed into ${existingBackup.npcName}! Revert first.`);
		return;
	}

	// If player doesn't have ownership, route through GM
	if (!transformActor.isOwner && !game.user.isGM) {
		if (sdxModule.socket) {
			await sdxModule.socket.executeAsGM(
				"applyShapechangerAsGM",
				casterActor.uuid,
				casterItem.uuid,
				npcDoc.uuid,
				isCritical,
				opts,
				targetActor?.uuid || null,
				targetToken?.document?.uuid || null
			);
			return;
		} else {
			ui.notifications.warn("Cannot transform: No GM connected or socket unavailable.");
			return;
		}
	}

	const transferAbilities = opts.transferAbilities;

	// Build backup of current state (on the transform target)
	const backup = {
		hp: {
			value: transformActor.system.attributes.hp.value,
			max: transformActor.system.attributes.hp.max
		},
		ac: {
			value: transformActor.system.attributes.ac.value
		},
		abilities: {},
		tokenTexture: transformActor.prototypeToken.texture.src,
		tokenWidth: transformActor.prototypeToken.width,
		tokenHeight: transformActor.prototypeToken.height,
		npcName: npcDoc.name,
		spellId: casterItem.id,
		// Store options in backup so revert/sheet injection knows what was transferred
		transferAbilities: transferAbilities,
		revertAt0HP: opts.revertAt0HP,
		revertHPValue: opts.revertHPValue,
		spellTitle: opts.title,
		spellIcon: opts.icon,
		// Store target mode info for revert routing
		targetMode: opts.targetMode || null,
		casterActorId: casterActor.id,
		targetTokenId: transformToken?.id || null
	};

	// Backup ability base scores and bonuses for transferred abilities only
	for (const ability of transferAbilities) {
		backup.abilities[ability] = {
			base: transformActor.system.abilities[ability]?.base ?? 10,
			bonus: transformActor.system.abilities[ability]?.bonus ?? 0
		};
	}

	// Get NPC stats
	const npcHp = npcDoc.system.attributes.hp;
	const npcAc = npcDoc.system.attributes.ac;
	const npcAbilities = npcDoc.system.abilities;

	// Resolve the best token image for this NPC
	const tokenTexture = resolveNpcTokenImage(npcDoc);

	// Build actor update
	const actorUpdate = {
		"system.attributes.hp.value": npcHp.value ?? npcHp.max,
		"system.attributes.hp.max": npcHp.max,
		"system.attributes.ac.value": npcAc.value,
		"prototypeToken.texture.src": tokenTexture,
		"prototypeToken.width": npcDoc.prototypeToken.width,
		"prototypeToken.height": npcDoc.prototypeToken.height
	};

	// Update only the transferred ability scores
	for (const ability of transferAbilities) {
		if (npcAbilities[ability]) {
			const npcMod = npcAbilities[ability].mod ?? 0;
			actorUpdate[`system.abilities.${ability}.base`] = modToBase(npcMod);
			actorUpdate[`system.abilities.${ability}.bonus`] = 0;
		}
	}

	// Store backup flag BEFORE making changes (on transform target)
	await transformActor.setFlag(MODULE_ID, "shapechangerBackup", backup);

	// Apply actor updates
	await transformActor.update(actorUpdate);

	// Add NPC items (attacks, special attacks, features) with flag
	const npcItemTypes = ["NPC Attack", "NPC Special Attack", "NPC Feature"];
	const npcItems = npcDoc.items.filter(i => npcItemTypes.includes(i.type));

	if (npcItems.length > 0) {
		const itemData = npcItems.map(item => {
			const data = item.toObject();
			foundry.utils.setProperty(data, `flags.${MODULE_ID}.shapechangerItem`, true);
			return data;
		});
		await transformActor.createEmbeddedDocuments("Item", itemData);
	}

	// Update canvas token appearance
	const activeToken = transformToken || transformActor.getActiveTokens()?.[0];
	if (activeToken) {
		await activeToken.document.update({
			"texture.src": tokenTexture,
			"width": npcDoc.prototypeToken.width,
			"height": npcDoc.prototypeToken.height
		});
	}

	// Start duration tracking (targets = the transformed token for duration tracking)
	const durationTargetToken = transformToken || transformActor.getActiveTokens()?.[0];
	const targetTokenIds = durationTargetToken ? [durationTargetToken.id] : [];
	const durationData = await sdxModule.api.startDurationSpell(casterActor, casterItem, targetTokenIds, {});

	// Store instanceId back in backup for auto-revert matching
	if (durationData?.instanceId) {
		const updatedBackup = transformActor.getFlag(MODULE_ID, "shapechangerBackup");
		if (updatedBackup) {
			updatedBackup.instanceId = durationData.instanceId;
			await transformActor.setFlag(MODULE_ID, "shapechangerBackup", updatedBackup);
		}
	}

	// Play Sequencer animation if available
	try {
		if (game.modules.get("sequencer")?.active && activeToken) {
			new Sequence()
				.effect()
				.atLocation(activeToken)
				.file("jb2a.extras.tmfx.outpulse.circle.01.normal")
				.scale(0.6)
				.fadeIn(200)
				.fadeOut(400)
				.play();
		}
	} catch (e) {
		console.log(`${MODULE_ID} | Sequencer animation not available: ${e.message}`);
	}

	// Build chat summary
	const npcLevel = npcDoc.system.level?.value ?? "?";
	const attacks = npcDoc.items.filter(i => i.type === "NPC Attack");
	const specials = npcDoc.items.filter(i => i.type === "NPC Special Attack");
	const features = npcDoc.items.filter(i => i.type === "NPC Feature");

	let abilitiesHtml = "";
	for (const ability of transferAbilities) {
		const mod = npcAbilities[ability]?.mod ?? 0;
		const sign = mod >= 0 ? "+" : "";
		abilitiesHtml += `<span class="sdx-shapechanger-ability"><strong>${ability.toUpperCase()}</strong> ${sign}${mod}</span> `;
	}

	let itemsHtml = "";
	if (attacks.length > 0) {
		itemsHtml += `<div style="margin-top: 4px;"><strong>Attacks:</strong> ${attacks.map(a => a.name).join(", ")}</div>`;
	}
	if (specials.length > 0) {
		itemsHtml += `<div><strong>Special Attacks:</strong> ${specials.map(s => s.name).join(", ")}</div>`;
	}
	if (features.length > 0) {
		itemsHtml += `<div><strong>Features:</strong> ${features.map(f => f.name).join(", ")}</div>`;
	}

	const duration = casterItem.system?.duration?.value || "?";
	const criticalBadge = isCritical ? ' <span style="color: gold; font-weight: bold;">[CRITICAL]</span>' : '';

	let revertNote = "The transformation can be reverted at any time.";
	if (opts.revertAt0HP) {
		if (opts.revertHPValue === "half") {
			revertNote = "Reverts at 0 HP to half prior HP.";
		} else {
			revertNote = "If you reach 0 HP, you revert to your true shape at 0 HP.";
		}
	}

	// Chat message describes who cast on whom
	const isOtherTarget = opts.targetMode === "other" && targetActor;
	const chatTransformText = isOtherTarget
		? `<strong>${casterActor.name}</strong> casts ${opts.title} on <strong>${transformActor.name}</strong>, transforming them into <strong>${npcDoc.name}</strong> (LV ${npcLevel})!`
		: `<strong>${casterActor.name}</strong> transforms into <strong>${npcDoc.name}</strong> (LV ${npcLevel})!`;

	// Revert button: use transformActor id, include token id for unlinked tokens
	const revertTokenAttr = transformToken ? ` data-token-id="${transformToken.id}"` : "";

	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: casterActor }),
		content: `
			<div class="shadowdark chat-card sdx-shapechanger-chat">
				<header class="card-header flexrow">
					<img class="item-image" src="${npcDoc.img}" alt="${npcDoc.name}"/>
					<div class="header-text">
						<h3>${renderIcon(opts.icon)} ${opts.title}${criticalBadge}</h3>
					</div>
				</header>
				<div class="card-content">
					<p>${chatTransformText}</p>
					<div class="sdx-shapechanger-stats" style="font-size: 12px; margin: 4px 0;">
						<div><strong>HP:</strong> ${npcHp.max} | <strong>AC:</strong> ${npcAc.value}</div>
						<div>${abilitiesHtml}</div>
						${itemsHtml}
					</div>
					<p class="spell-effect"><em>Duration: ${duration} rounds. ${revertNote}</em></p>
					<button class="sdx-revert-shape-btn" data-actor-id="${transformActor.id}"${revertTokenAttr} style="margin-top: 6px; width: 100%; cursor: pointer;">
						<i class="fas fa-undo"></i> Revert Shape
					</button>
				</div>
			</div>
		`
	});

	ui.notifications.info(`${isOtherTarget ? `${casterActor.name} transforms ${transformActor.name}` : `${casterActor.name} transforms`} into ${npcDoc.name}!`);
}

/**
 * Revert the transformation
 *
 * @param {Actor} actor - The transformed actor
 * @param {boolean} skipEndDuration - If true, skip ending the duration spell (used when auto-reverting from expired duration)
 */
export async function revertShapechanger(actor, skipEndDuration = false) {
	if (!actor) {
		ui.notifications.warn("No actor provided for revert!");
		return;
	}

	const backup = actor.getFlag(MODULE_ID, "shapechangerBackup");
	if (!backup) {
		ui.notifications.warn(`${actor.name} is not currently transformed.`);
		return;
	}

	// If player doesn't have ownership, route through GM
	if (!actor.isOwner && !game.user.isGM) {
		const sdxModule = game.modules.get(MODULE_ID);
		if (sdxModule?.socket) {
			await sdxModule.socket.executeAsGM("revertShapechangerAsGM", actor.uuid);
			return;
		} else {
			ui.notifications.warn("Cannot revert: No GM connected or socket unavailable.");
			return;
		}
	}

	const transferAbilities = backup.transferAbilities || ["str", "dex", "con", "int", "wis", "cha"];

	// Restore actor stats
	const actorUpdate = {
		"system.attributes.hp.max": backup.hp.max,
		"system.attributes.ac.value": backup.ac.value,
		"prototypeToken.texture.src": backup.tokenTexture,
		"prototypeToken.width": backup.tokenWidth,
		"prototypeToken.height": backup.tokenHeight
	};

	// If revertAt0HP triggered, set HP to revertHPValue, otherwise restore original HP
	if (backup.revertAt0HP && actor.system.attributes.hp.value <= 0) {
		let revertHP;
		if (backup.revertHPValue === "half") {
			revertHP = Math.max(1, Math.floor(backup.hp.value / 2));
		} else {
			revertHP = backup.revertHPValue ?? 0;
		}
		actorUpdate["system.attributes.hp.value"] = revertHP;
	} else {
		actorUpdate["system.attributes.hp.value"] = backup.hp.value;
	}

	// Restore only the transferred ability base scores and bonuses
	for (const ability of transferAbilities) {
		if (backup.abilities[ability]) {
			actorUpdate[`system.abilities.${ability}.base`] = backup.abilities[ability].base;
			actorUpdate[`system.abilities.${ability}.bonus`] = backup.abilities[ability].bonus;
		}
	}

	await actor.update(actorUpdate);

	// Delete shapechanger temporary items
	const shapechangerItems = actor.items.filter(i => i.getFlag(MODULE_ID, "shapechangerItem"));
	if (shapechangerItems.length > 0) {
		await actor.deleteEmbeddedDocuments("Item", shapechangerItems.map(i => i.id));
	}

	// Restore canvas token appearance (try stored targetTokenId for unlinked tokens first)
	const activeToken = (backup.targetTokenId ? canvas.tokens?.get(backup.targetTokenId) : null) || actor.getActiveTokens()?.[0];
	if (activeToken) {
		await activeToken.document.update({
			"texture.src": backup.tokenTexture,
			"width": backup.tokenWidth,
			"height": backup.tokenHeight
		});
	}

	// Clear backup flag
	await actor.unsetFlag(MODULE_ID, "shapechangerBackup");

	// End duration tracking if not already ending
	// Duration is tracked on the caster, so use casterActorId for Polymorph (targetMode "other")
	if (!skipEndDuration && backup.instanceId) {
		const durationActorId = backup.casterActorId || actor.id;
		const sdxModule = game.modules.get(MODULE_ID);
		if (sdxModule?.api?.endDurationSpell) {
			await sdxModule.api.endDurationSpell(durationActorId, backup.instanceId, "manual");
		} else {
			try {
				const { endDurationSpell } = await import("../FocusSpellTrackerSD.mjs");
				await endDurationSpell(durationActorId, backup.instanceId, "manual");
			} catch (e) {
				console.warn(`${MODULE_ID} | Could not end duration spell:`, e);
			}
		}
	}

	// Play revert animation
	try {
		if (game.modules.get("sequencer")?.active && activeToken) {
			new Sequence()
				.effect()
				.atLocation(activeToken)
				.file("jb2a.extras.tmfx.outpulse.circle.01.normal")
				.scale(0.6)
				.fadeIn(200)
				.fadeOut(400)
				.play();
		}
	} catch (e) {
		console.log(`${MODULE_ID} | Sequencer animation not available: ${e.message}`);
	}

	const spellTitle = backup.spellTitle || "Shapechanger";
	const spellIcon = backup.spellIcon || "fas fa-undo";

	// Post revert chat message
	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor: actor }),
		content: `
			<div class="shadowdark chat-card sdx-shapechanger-chat">
				<header class="card-header flexrow">
					<div class="header-text">
						<h3><i class="fas fa-undo"></i> ${spellTitle} Reverted</h3>
					</div>
				</header>
				<div class="card-content">
					<p><strong>${actor.name}</strong> reverts from <strong>${backup.npcName}</strong> back to their original form.</p>
				</div>
			</div>
		`
	});

	ui.notifications.info(`${actor.name} reverts to their original form.`);
}

/**
 * Auto-revert hook: duration spell ended (expired or manual from tracker)
 * For self-transform spells (Shapechanger, Wolf Shape), backup is on the caster.
 * For target-other spells (Polymorph), backup is on the target, not the caster.
 */
Hooks.on("sdx.durationSpellEnded", async (caster, durationEntry, reason) => {
	if (!caster) return;

	// Check caster first (self-transform spells)
	const casterBackup = caster.getFlag(MODULE_ID, "shapechangerBackup");
	if (casterBackup && casterBackup.instanceId === durationEntry.instanceId) {
		console.log(`${MODULE_ID} | Auto-reverting shapechanger for ${caster.name} (reason: ${reason})`);
		await revertShapechanger(caster, true);
		return;
	}

	// Check targets (Polymorph: backup is on the target)
	if (durationEntry.targets && durationEntry.targets.length > 0) {
		for (const target of durationEntry.targets) {
			// Try token-based resolution first (unlinked tokens)
			let targetActor = target.tokenId ? canvas.tokens?.get(target.tokenId)?.actor : null;
			// Fall back to world actor
			if (!targetActor && target.actorId) {
				targetActor = game.actors.get(target.actorId);
			}
			if (!targetActor) continue;

			const targetBackup = targetActor.getFlag(MODULE_ID, "shapechangerBackup");
			if (targetBackup && targetBackup.instanceId === durationEntry.instanceId) {
				console.log(`${MODULE_ID} | Auto-reverting Polymorph target ${targetActor.name} (reason: ${reason})`);
				await revertShapechanger(targetActor, true);
				return;
			}
		}
	}
});

/**
 * Auto-revert hook: HP reaches 0 (for spells with revertAt0HP like Wolf Shape)
 */
Hooks.on("updateActor", async (actor, changes, options, userId) => {
	// Only react to HP changes
	if (!foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;

	const newHP = foundry.utils.getProperty(changes, "system.attributes.hp.value");
	if (newHP > 0) return;

	const backup = actor.getFlag(MODULE_ID, "shapechangerBackup");
	if (!backup || !backup.revertAt0HP) return;

	// Only run on the GM's client (or the user who owns the actor) to avoid duplicate reverts
	if (!game.user.isGM && actor.ownership[game.user.id] !== CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) return;

	console.log(`${MODULE_ID} | ${backup.spellTitle || 'Shapechanger'} auto-revert: ${actor.name} reached 0 HP`);
	await revertShapechanger(actor);
});

/**
 * Inject Shapechanger abilities into the Player sheet
 * NPC item types (NPC Attack, NPC Special Attack, NPC Feature) are not normally
 * visible on the Player sheet, so we inject a custom section when transformed.
 */
Hooks.on("renderPlayerSheetSD", (sheet, html, data) => {
	const actor = sheet.actor;
	if (!actor) return;

	const backup = actor.getFlag(MODULE_ID, "shapechangerBackup");
	if (!backup) return;

	// Get all shapechanger items on this actor
	const scItems = actor.items.filter(i => i.getFlag(MODULE_ID, "shapechangerItem"));
	if (scItems.length === 0) return;

	const attacks = scItems.filter(i => i.type === "NPC Attack");
	const specials = scItems.filter(i => i.type === "NPC Special Attack");
	const features = scItems.filter(i => i.type === "NPC Feature");

	const spellTitle = backup.spellTitle || "Shapechanger";
	const spellIcon = backup.spellIcon || "fas fa-paw-claws";

	// Build attacks HTML
	let attacksHtml = "";
	for (const atk of attacks) {
		const bonus = atk.system.bonuses?.attackBonus ?? 0;
		const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`;
		const damage = atk.system.damage?.value ?? "";
		const num = atk.system.attack?.num ?? 1;
		const isSpecialType = atk.system.attackType === "special";

		attacksHtml += `
			<div class="sdx-sc-item ${isSpecialType ? '' : 'sdx-sc-item-rollable'}" data-item-id="${atk.id}" data-item-type="NPC Attack" title="${isSpecialType ? 'View details' : 'Click to roll attack'}">
				<img class="sdx-sc-item-img" src="${atk.img}" alt="${atk.name}">
				<div class="sdx-sc-item-info">
					<span class="sdx-sc-item-name">${atk.name}</span>
					<span class="sdx-sc-item-detail">${num}x ${bonusStr} ${damage ? `(${damage})` : ''}</span>
				</div>
			</div>`;
	}

	// Build special attacks HTML
	let specialsHtml = "";
	for (const sp of specials) {
		const desc = sp.system.description ?? "";
		const cleanDesc = desc.replace(/<[^>]*>/g, "").substring(0, 80);

		specialsHtml += `
			<div class="sdx-sc-item sdx-sc-item-rollable" data-item-id="${sp.id}" data-item-type="NPC Special Attack" title="Click to display">
				<img class="sdx-sc-item-img" src="${sp.img}" alt="${sp.name}">
				<div class="sdx-sc-item-info">
					<span class="sdx-sc-item-name">${sp.name}</span>
					${cleanDesc ? `<span class="sdx-sc-item-detail">${cleanDesc}${desc.length > 80 ? '...' : ''}</span>` : ''}
				</div>
			</div>`;
	}

	// Build features HTML
	let featuresHtml = "";
	for (const feat of features) {
		const desc = feat.system.description ?? "";
		const cleanDesc = desc.replace(/<[^>]*>/g, "").substring(0, 80);

		featuresHtml += `
			<div class="sdx-sc-item sdx-sc-item-rollable" data-item-id="${feat.id}" data-item-type="NPC Feature" title="Click to display">
				<img class="sdx-sc-item-img" src="${feat.img}" alt="${feat.name}">
				<div class="sdx-sc-item-info">
					<span class="sdx-sc-item-name">${feat.name}</span>
					${cleanDesc ? `<span class="sdx-sc-item-detail">${cleanDesc}${desc.length > 80 ? '...' : ''}</span>` : ''}
				</div>
			</div>`;
	}

	const sectionHtml = `
		<div class="sdx-shapechanger-abilities">
			<div class="sdx-sc-header">
				${renderIcon(spellIcon)}
				<span>${spellTitle} — ${backup.npcName}</span>
				<button class="sdx-sc-revert-btn" title="Revert to original form"><i class="fas fa-undo"></i> Revert</button>
			</div>
			${attacks.length > 0 ? `<div class="sdx-sc-section"><div class="sdx-sc-section-label">Attacks</div>${attacksHtml}</div>` : ''}
			${specials.length > 0 ? `<div class="sdx-sc-section"><div class="sdx-sc-section-label">Special Attacks</div>${specialsHtml}</div>` : ''}
			${features.length > 0 ? `<div class="sdx-sc-section"><div class="sdx-sc-section-label">Features</div>${featuresHtml}</div>` : ''}
		</div>
	`;

	// Inject into the inventory tab (most relevant for combat)
	const inventoryTab = html.find(".tab-inventory");
	if (inventoryTab.length > 0) {
		inventoryTab.prepend(sectionHtml);
	}

	// Also inject into spells tab for visibility
	const spellsTab = html.find(".tab-spells");
	if (spellsTab.length > 0) {
		spellsTab.prepend(sectionHtml);
	}

	// Attach click handlers for rolling/displaying items
	html.find(".sdx-sc-item-rollable").on("click", async (event) => {
		event.preventDefault();
		const el = event.currentTarget;
		const itemId = el.dataset.itemId;
		const itemType = el.dataset.itemType;
		const item = actor.items.get(itemId);
		if (!item) return;

		if (itemType === "NPC Attack") {
			if (item.system.attackType === "special") {
				if (typeof item.displayCard === "function") {
					await item.displayCard();
				} else {
					item.sheet.render(true);
				}
				return;
			}

			const rollData = {
				item: item,
				actor: actor,
			};
			const parts = ["1d20", "@attackBonus"];
			rollData.attackBonus = item.system.bonuses.attackBonus;
			rollData.damageParts = ["@damageBonus"];
			rollData.damageBonus = item.system.bonuses.damageBonus;

			if (typeof item.rollNpcAttack === "function") {
				await item.rollNpcAttack(parts, rollData);
			} else if (typeof item.displayCard === "function") {
				await item.displayCard();
			} else {
				item.sheet.render(true);
			}
		} else {
			// NPC Special Attack or NPC Feature — display card
			if (typeof item.displayCard === "function") {
				await item.displayCard();
			} else {
				item.sheet.render(true);
			}
		}
	});

	// Attach revert button handler
	html.find(".sdx-sc-revert-btn").on("click", async (event) => {
		event.preventDefault();
		event.stopPropagation();
		await revertShapechanger(actor);
	});
});
