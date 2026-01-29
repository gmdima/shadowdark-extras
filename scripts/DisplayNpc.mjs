/**
 * Display NPC Card Enricher for Shadowdark Extras
 * 
 * Allows journal pages to display styled NPC stat cards using:
 * @DisplayNpcCard[Actor.UUID named]{Display Name}
 * @DisplayNpcCardDetailed[Actor.UUID named]{Display Name} - includes attacks, special attacks, features
 * 
 * Based on Dragonbane's DisplayMonsterCard implementation.
 */

const MODULE_ID = "shadowdark-extras";

/**
 * Parse the brackets content to extract UUID and optional flags
 * @param {String} match - The part between brackets (e.g., "Actor.gwFbDqFlJJrjeM3a named")
 * @returns {Object} Contains uuid and flag booleans
 */
function parseMatch(match) {
    const words = match.split(" ");
    let result = {};
    if (words.length) {
        result.uuid = words[0];
    }
    for (let i = 1; i < words.length; i++) {
        result[words[i]] = true;
    }
    return result;
}

/**
 * Get an actor from a UUID, handling both sync and async cases
 * @param {String} uuid - The actor UUID
 * @returns {Actor|null} The actor document or null
 */
async function getActorFromUUID(uuid) {
    try {
        let actor = fromUuidSync(uuid);
        if (!actor) {
            actor = await fromUuid(uuid);
        }
        return actor;
    } catch (e) {
        console.warn(`SDX DisplayNpcCard: Could not find actor for UUID: ${uuid}`);
        return null;
    }
}

/**
 * Format modifier display string
 * @param {number} mod - The modifier value
 * @returns {string} Formatted modifier (e.g., "+2" or "-1")
 */
function formatModifier(mod) {
    if (mod === undefined || mod === null || isNaN(mod)) return "+0";
    return mod >= 0 ? `+${mod}` : `${mod}`;
}

/**
 * Build ability scores row HTML
 * NPCs store modifiers directly in abilities.X.mod
 * @param {Actor} npc - The NPC actor
 * @returns {String} HTML string for ability scores
 */
function buildAbilityScoresHtml(npc) {
    const abilities = npc.system.abilities || {};
    const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];

    // Short labels (already localized)
    const abilityLabels = {
        str: "STR",
        dex: "DEX",
        con: "CON",
        int: "INT",
        wis: "WIS",
        cha: "CHA"
    };

    let html = `<div class="sdx-npc-abilities">`;
    for (const key of abilityKeys) {
        // NPCs store modifier directly, not the score
        const mod = abilities[key]?.mod ?? 0;
        const modStr = formatModifier(mod);
        html += `<div class="sdx-npc-ability">
            <span class="sdx-npc-ability-label">${abilityLabels[key]}</span>
            <span class="sdx-npc-ability-mod">${modStr}</span>
        </div>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Build description section
 * @param {Actor} npc - The NPC actor
 * @returns {String} HTML string for description
 */
async function buildDescriptionHtml(npc) {
    const notes = npc.system.notes ?? "";
    if (!notes || notes.trim() === "") return "";

    const enrichedNotes = await TextEditor.enrichHTML(notes, { async: true });

    return `<div class="sdx-npc-description">
        ${enrichedNotes}
    </div>`;
}

/**
 * Get localized movement display
 * @param {String} moveKey - The move key (e.g., "doubleNear")
 * @returns {String} Localized movement string
 */
function getLocalizedMove(moveKey) {
    const moveLabels = {
        "none": game.i18n.localize("SHADOWDARK.npc_move.none") || "None",
        "close": game.i18n.localize("SHADOWDARK.npc_move.close") || "Close",
        "near": game.i18n.localize("SHADOWDARK.npc_move.near") || "Near",
        "doubleNear": game.i18n.localize("SHADOWDARK.range.double_near") || "Double Near",
        "tripleNear": game.i18n.localize("SHADOWDARK.npc_move.triple_near") || "Triple Near",
        "far": game.i18n.localize("SHADOWDARK.npc_move.far") || "Far",
        "special": game.i18n.localize("SHADOWDARK.npc_move.special") || "Special"
    };
    return moveLabels[moveKey] || moveKey || "-";
}

/**
 * Get the creature type from NPC flags
 * @param {Actor} npc - The NPC actor  
 * @returns {String} Creature type or empty string
 */
function getCreatureType(npc) {
    return npc.flags?.[MODULE_ID]?.creatureType ?? "";
}

/**
 * Get range label for attack
 * @param {Array} ranges - Array of range keys
 * @returns {String} Formatted range string
 */
function getRangeLabel(ranges) {
    if (!ranges || ranges.length === 0) return "";
    const rangeLabels = {
        "close": "Close",
        "near": "Near",
        "far": "Far",
        "doubleNear": "Double Near",
        "tripleNear": "Triple Near"
    };
    return ranges.map(r => rangeLabels[r] || r).join(", ");
}

/**
 * Build attacks section HTML
 * @param {Actor} npc - The NPC actor
 * @returns {String} HTML string for attacks
 */
async function buildAttacksHtml(npc) {
    const attacks = npc.items.filter(i => i.type === "NPC Attack");
    if (attacks.length === 0) return "";

    let html = `<div class="sdx-npc-section">
        <div class="sdx-npc-section-header">Attacks</div>
        <div class="sdx-npc-section-content">`;

    for (const attack of attacks) {
        const num = attack.system.attack?.num ?? 1;
        const bonus = attack.system.bonuses?.attackBonus ?? 0;
        const bonusStr = formatModifier(bonus);
        const damage = attack.system.damage?.value ?? "";
        const rangeStr = getRangeLabel(attack.system.ranges);

        html += `<div class="sdx-npc-attack">
            <span class="sdx-npc-attack-num">${num}</span>
            <strong class="sdx-npc-attack-name">${attack.name}</strong>`;
        if (rangeStr) html += ` <span class="sdx-npc-attack-range">(${rangeStr})</span>`;
        html += ` <span class="sdx-npc-attack-bonus">${bonusStr}</span>`;
        if (damage) html += ` <span class="sdx-npc-attack-damage">(${damage})</span>`;
        html += `</div>`;
    }

    html += `</div></div>`;
    return html;
}

/**
 * Build special attacks section HTML
 * @param {Actor} npc - The NPC actor
 * @returns {String} HTML string for special attacks
 */
async function buildSpecialAttacksHtml(npc) {
    const specials = npc.items.filter(i => i.type === "NPC Special Attack");
    if (specials.length === 0) return "";

    let html = `<div class="sdx-npc-section">
        <div class="sdx-npc-section-header">Special Attacks</div>
        <div class="sdx-npc-section-content">`;

    for (const special of specials) {
        const num = special.system.attack?.num ?? 1;
        const desc = special.system.description ?? "";
        const enrichedDesc = await TextEditor.enrichHTML(desc, { async: true });
        // Strip <p> tags for inline display
        const cleanDesc = enrichedDesc.replace(/<\/?p>/g, "").trim();

        html += `<div class="sdx-npc-special-attack">
            <span class="sdx-npc-attack-num">${num}</span>
            <strong class="sdx-npc-attack-name">${special.name}</strong>`;
        if (cleanDesc) html += ` <span class="sdx-npc-special-desc">${cleanDesc}</span>`;
        html += `</div>`;
    }

    html += `</div></div>`;
    return html;
}

/**
 * Build features section HTML
 * @param {Actor} npc - The NPC actor
 * @returns {String} HTML string for features
 */
async function buildFeaturesHtml(npc) {
    const features = npc.items.filter(i => i.type === "NPC Feature");
    if (features.length === 0) return "";

    let html = `<div class="sdx-npc-section">
        <div class="sdx-npc-section-header">Features</div>
        <div class="sdx-npc-section-content">`;

    for (const feature of features) {
        const desc = feature.system.description ?? "";
        const enrichedDesc = await TextEditor.enrichHTML(desc, { async: true });
        // Strip <p> tags for inline display
        const cleanDesc = enrichedDesc.replace(/<\/?p>/g, "").trim();

        html += `<div class="sdx-npc-feature">
            <strong class="sdx-npc-feature-name">${feature.name}.</strong>`;
        if (cleanDesc) html += ` <span class="sdx-npc-feature-desc">${cleanDesc}</span>`;
        html += `</div>`;
    }

    html += `</div></div>`;
    return html;
}

/**
 * Main enricher function for @DisplayNpcCard
 * @param {RegExpMatchArray} match - The regex match array
 * @param {Object} _options - Enricher options
 * @param {Boolean} detailed - Whether to include detailed sections (attacks, features)
 * @returns {HTMLElement} The rendered element
 */
export async function enrichDisplayNpcCard(match, _options, detailed = false) {
    const parsedMatch = parseMatch(match[1]);
    const npc = await getActorFromUUID(parsedMatch.uuid);
    const npcName = match[2] ?? npc?.name;

    const container = document.createElement("div");
    container.classList.add("sdx-display-npc-container");
    if (detailed) container.classList.add("sdx-display-npc-detailed");

    if (npc) {
        // Build title - centered, large
        let titleClasses = "sdx-npc-title";
        let titleContent;
        if (parsedMatch.named) {
            titleClasses += " named";
            titleContent = `<span class="sdx-npc-name">${npcName}</span>`;
        } else {
            titleContent = `@UUID[${npc.uuid}]{${npcName}}`;
        }

        // Get core stats
        const hp = npc.system.attributes?.hp?.max ?? npc.system.attributes?.hp?.value ?? "-";
        const ac = npc.system.attributes?.ac?.value ?? "-";
        const level = npc.system.level?.value ?? npc.system.level ?? "-";
        const moveKey = npc.system.move ?? "";
        const moveNote = npc.system.moveNote ?? "";
        const moveStr = getLocalizedMove(moveKey);
        const moveDisplay = moveNote ? `${moveStr} (${moveNote})` : moveStr;

        // Get creature type
        const creatureType = getCreatureType(npc);

        // Build sections
        const abilityScoresHtml = buildAbilityScoresHtml(npc);
        const descriptionHtml = await buildDescriptionHtml(npc);

        // Pre-localized labels
        const hpLabel = "HP";
        const acLabel = "AC";
        const lvLabel = creatureType ? `LV (${creatureType})` : "LV";
        const moveLabel = "MV";

        let html = `
        <div class="sdx-display-npc" data-actor-uuid="${npc.uuid}">
            <div class="${titleClasses}">
                ${titleContent}
            </div>
            ${abilityScoresHtml}
            <div class="sdx-npc-stats-grid">
                <div class="sdx-npc-stat">
                    <span class="sdx-npc-stat-label">${hpLabel}</span>
                    <span class="sdx-npc-stat-value">${hp}</span>
                </div>
                <div class="sdx-npc-stat">
                    <span class="sdx-npc-stat-label">${acLabel}</span>
                    <span class="sdx-npc-stat-value">${ac}</span>
                </div>
                <div class="sdx-npc-stat">
                    <span class="sdx-npc-stat-label">${lvLabel}</span>
                    <span class="sdx-npc-stat-value">${level}</span>
                </div>
                <div class="sdx-npc-stat">
                    <span class="sdx-npc-stat-label">${moveLabel}</span>
                    <span class="sdx-npc-stat-value">${moveDisplay}</span>
                </div>
            </div>
            ${descriptionHtml}`;

        // Add detailed sections if requested
        if (detailed) {
            const attacksHtml = await buildAttacksHtml(npc);
            const specialAttacksHtml = await buildSpecialAttacksHtml(npc);
            const featuresHtml = await buildFeaturesHtml(npc);
            html += attacksHtml + specialAttacksHtml + featuresHtml;
        }

        html += `</div>`;

        container.innerHTML = await TextEditor.enrichHTML(html, { async: true });
    } else {
        // Broken link fallback
        container.dataset.npcId = parsedMatch.uuid;
        if (match[2]) container.dataset.npcName = match[2];
        container.classList.add("content-link", "broken");
        container.innerHTML = `<i class="fas fa-unlink"></i> ${npcName ?? "Unknown NPC"}`;
    }

    return container;
}

/**
 * Enricher wrapper for detailed NPC card
 */
export async function enrichDisplayNpcCardDetailed(match, _options) {
    return enrichDisplayNpcCard(match, _options, true);
}

/**
 * Register the DisplayNpcCard enrichers with Foundry
 * Call this during the ready hook
 */
export function registerDisplayNpcEnricher() {
    CONFIG.TextEditor.enrichers.push({
        pattern: /@DisplayNpcCard\[(.+?)\](?:\{(.+?)\})?/gm,
        enricher: enrichDisplayNpcCard
    });

    CONFIG.TextEditor.enrichers.push({
        pattern: /@DisplayNpcCardDetailed\[(.+?)\](?:\{(.+?)\})?/gm,
        enricher: enrichDisplayNpcCardDetailed
    });

    console.log("SDX | Registered DisplayNpcCard and DisplayNpcCardDetailed enrichers");
}

